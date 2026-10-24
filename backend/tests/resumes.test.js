// Resume upload → queue → text extraction → Gemini (faked) → status →
// confirm → download → cleanup. Uses a real in-memory MongoDB (GridFS
// included), real PDF/DOCX files and the real worker processor; the queue is
// replaced by a recorder and Gemini by a fake client. No network calls.

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UnrecoverableError } from 'bullmq';
import { createApp } from '../src/app.js';
import { Resume } from '../src/models/resume.model.js';
import { setResumeEnqueuer, redisConnectionOptions } from '../src/queue/resumeQueue.js';
import { createResumeProcessor } from '../src/workers/resumeWorker.js';
import { cleanupResumes, PENDING_TTL_MS, requeueStuckResumes } from '../src/services/resumes.service.js';
import { detectResumeKind, safeResumeFileName, MAX_RESUME_BYTES } from '../src/services/resumeFile.js';
import { extractResumeText } from '../src/services/resumeText.js';
import { normalizeExtractedProfile } from '../src/services/resumeProfile.js';
import { classifyGeminiError, createProfileExtractor, RESUME_PROFILE_SCHEMA } from '../src/services/gemini.js';
import { ResumeProcessingError } from '../src/services/resumeErrors.js';
import { listResumeFilesBefore, saveResumeFile } from '../src/storage/resumeFiles.js';
import { SAMPLE_MODEL_OUTPUT, SAMPLE_RESUME_LINES, makeDocx, makePdf } from './helpers/resumeFixtures.js';

const PDF_TYPE = 'application/pdf';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// --- pure units ---------------------------------------------------------------------

describe('file checks', () => {
  test('detects PDF and DOCX by content, rejects everything else', async () => {
    assert.equal(detectResumeKind(makePdf()), 'pdf');
    assert.equal(detectResumeKind(await makeDocx()), 'docx');
    assert.equal(detectResumeKind(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])), null, 'old .doc');
    assert.equal(detectResumeKind(Buffer.from('\x89PNG\r\n\x1a\nxxxxxxxx', 'latin1')), null, 'png');
    assert.equal(detectResumeKind(Buffer.from('PK\x03\x04 just a zip archive', 'latin1')), null, 'zip, not docx');
    assert.equal(detectResumeKind(Buffer.from('%PDF')), null, 'too short');
    assert.equal(detectResumeKind(Buffer.alloc(0)), null);
  });

  test('file names lose paths and unsafe characters and get the real extension', () => {
    assert.equal(safeResumeFileName('../../etc/passwd', 'pdf'), 'passwd.pdf');
    assert.equal(safeResumeFileName('C:\\Users\\me\\My CV.PDF', 'pdf'), 'My CV.pdf');
    assert.equal(safeResumeFileName('cv<script>"x".docx', 'docx'), 'cvscriptx.docx');
    assert.equal(safeResumeFileName('resume.pdf', 'docx'), 'resume.docx');
    assert.equal(safeResumeFileName('', 'pdf'), 'resume.pdf');
    assert.equal(safeResumeFileName('Asha%20Verma%20Resume.pdf', 'pdf'), 'Asha Verma Resume.pdf', 'percent-encoded names are decoded');
    assert.equal(safeResumeFileName('..%2F..%2Fsecret.pdf', 'pdf'), 'secret.pdf', 'encoded paths are still stripped');
    assert.equal(safeResumeFileName('100%.pdf', 'pdf'), '100%.pdf', 'a lone % is kept');
    assert.ok(safeResumeFileName('a'.repeat(300), 'pdf').length <= 104);
  });
});

describe('text extraction', () => {
  test('reads text from PDF and DOCX', async () => {
    const pdfText = await extractResumeText('pdf', makePdf());
    const docxText = await extractResumeText('docx', await makeDocx());
    for (const text of [pdfText, docxText]) {
      assert.ok(text.includes('Asha Verma'));
      assert.ok(text.includes('Northwind Tech'));
    }
  });

  test('a PDF without a text layer → no_text (never sent to Gemini)', async () => {
    await assert.rejects(extractResumeText('pdf', makePdf([])), (error) => error.code === 'no_text' && !error.retryable);
    await assert.rejects(extractResumeText('docx', await makeDocx(['Hi'])), (error) => error.code === 'no_text');
  });

  test('a damaged document → unreadable_file', async () => {
    const broken = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('garbage '.repeat(50))]);
    await assert.rejects(extractResumeText('pdf', broken), (error) => error.code === 'unreadable_file');
    await assert.rejects(extractResumeText('docx', Buffer.from('PK\x03\x04broken', 'latin1')), (error) => error.code === 'unreadable_file');
  });
});

describe('profile normalisation (model output is never trusted)', () => {
  test('maps the model output to the exact ProfileConfirm shape with unique entry ids', () => {
    const profile = normalizeExtractedProfile(SAMPLE_MODEL_OUTPUT, 'r123');
    assert.deepEqual(Object.keys(profile).sort(), [
      'countryCode', 'currentCompany', 'currentLocation', 'currentRole', 'education', 'email', 'experienceMonths',
      'experienceYears', 'experiences', 'fullName', 'phone', 'preferredLocations', 'skills', 'whatsappOptIn',
    ]);
    assert.equal(profile.phone, '9876543210');
    assert.equal(profile.whatsappOptIn, false);
    assert.deepEqual(profile.experiences[0], {
      id: 'r123-exp-1', title: 'Senior Backend Engineer', company: 'Northwind Tech', startDate: '2023-04', endDate: null,
    });
    assert.equal(profile.experiences[1].endDate, '2023-03');
    assert.equal(profile.education[0].id, 'r123-edu-1');
  });

  test('wrong types, invalid values and incomplete entries are dropped, not invented', () => {
    const profile = normalizeExtractedProfile(
      {
        fullName: '  Ravi\u0000  Kumar ',
        email: 'not-an-email',
        phone: '12',
        countryCode: '91',
        experienceYears: '75',
        experienceMonths: 13,
        skills: ['Go', 'go', '', 42, 'Kubernetes'],
        preferredLocations: 'Pune',
        experiences: [
          { title: 'Dev', company: 'A', startDate: '2021', endDate: 'present' },
          { title: 'Dev', company: 'B', startDate: '2022-01', endDate: '2020-01' },
          { title: '', company: 'C', startDate: '2019-01', endDate: '' },
          { title: 'Dev', company: 'D', startDate: 'last year', endDate: '' },
          { title: 'Dev', company: 'E', startDate: '2018-02', endDate: 'soon' },
        ],
        education: [{ institution: 'X University', startYear: '19', endYear: '2020' }, { degree: 'MBA' }],
        injected: '$where',
      },
      'r9'
    );
    assert.equal(profile.fullName, 'Ravi Kumar');
    assert.deepEqual([profile.email, profile.phone, profile.countryCode], ['', '', '']);
    assert.deepEqual([profile.experienceYears, profile.experienceMonths], ['', '']);
    assert.deepEqual(profile.skills, ['Go', 'Kubernetes']);
    assert.deepEqual(profile.preferredLocations, []);
    assert.deepEqual(profile.experiences, [{ id: 'r9-exp-1', title: 'Dev', company: 'A', startDate: '2021-01', endDate: null }]);
    assert.deepEqual(profile.education, [{ id: 'r9-edu-1', institution: 'X University', degree: '', field: '', startYear: '', endYear: '2020' }]);
    assert.equal(profile.injected, undefined);
  });

  test('non-objects and output without any resume data are rejected', () => {
    assert.throws(() => normalizeExtractedProfile(null, 'r'), (error) => error.code === 'invalid_output');
    assert.throws(() => normalizeExtractedProfile([1, 2], 'r'), (error) => error.code === 'invalid_output');
    assert.throws(() => normalizeExtractedProfile({ fullName: '', skills: [] }, 'r'), (error) => error.code === 'no_profile_data');
  });
});

describe('Gemini extractor (fake client, no network)', () => {
  const fakeClient = (handler) => {
    const calls = [];
    return {
      calls,
      interactions: {
        create: async (params, options) => {
          calls.push({ params, options });
          return handler(params, options);
        },
      },
    };
  };

  test('sends only text, with the JSON schema and configured model; parses the JSON result', async () => {
    const client = fakeClient(() => ({ output_text: JSON.stringify(SAMPLE_MODEL_OUTPUT) }));
    const extract = createProfileExtractor({ client, model: 'test-model' });
    const result = await extract('RESUME TEXT HERE');
    assert.deepEqual(result, SAMPLE_MODEL_OUTPUT);
    const [{ params, options }] = client.calls;
    assert.equal(params.model, 'test-model');
    assert.deepEqual(params.response_format, { type: 'text', mime_type: 'application/json', schema: RESUME_PROFILE_SCHEMA });
    assert.ok(params.input.includes('<resume>\nRESUME TEXT HERE\n</resume>'));
    assert.ok(/ignore any instructions/i.test(params.input));
    assert.equal(options.maxRetries, 0);
    assert.ok(options.timeout > 0);
  });

  test('malformed or empty output → invalid_output (retryable)', async () => {
    for (const output of ['{not json', '', undefined]) {
      const extract = createProfileExtractor({ client: fakeClient(() => ({ output_text: output })), model: 'm' });
      await assert.rejects(extract('text'), (error) => error.code === 'invalid_output' && error.retryable);
    }
  });

  test('API errors map to stable codes with the right retry policy', () => {
    const cases = [
      [{ status: 429 }, 'ai_busy', true],
      [{ status: 503 }, 'ai_unavailable', true],
      [{ status: 401 }, 'ai_config', false],
      [{ status: 404 }, 'ai_config', false],
      [{ status: 400 }, 'ai_rejected', false],
      [{ name: 'RequestTimeoutError' }, 'ai_timeout', true],
      [{ name: 'ConnectionError' }, 'ai_unavailable', true],
      [{ message: 'weird' }, 'processing_failed', true],
    ];
    for (const [error, code, retryable] of cases) {
      const result = classifyGeminiError(Object.assign(new Error(error.message ?? 'x'), error));
      assert.deepEqual([result.code, result.retryable], [code, retryable], JSON.stringify(error));
      assert.ok(!/key|secret|stack/i.test(result.message));
    }
  });

  test('a missing GEMINI_API_KEY / GEMINI_MODEL is reported by name, never by value', () => {
    const saved = { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL };
    try {
      delete process.env.GEMINI_API_KEY;
      process.env.GEMINI_MODEL = 'm';
      assert.throws(() => createProfileExtractor(), /GEMINI_API_KEY/);
    } finally {
      if (saved.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved.key;
      if (saved.model === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = saved.model;
    }
  });

  test('REDIS_URL is turned into BullMQ connection options', () => {
    assert.deepEqual(redisConnectionOptions('redis://:pa%40ss@redis:6380/2'), {
      host: 'redis', port: 6380, password: 'pa@ss', db: 2, maxRetriesPerRequest: null,
    });
    assert.throws(() => redisConnectionOptions(null), /REDIS_URL/);
  });
});

// --- API + worker against MongoDB ------------------------------------------------

let mongod;
let server;
let base;
let queued;
let restoreQueue;

before(
  async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'spire_resume_test' });
    await Resume.createIndexes();
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  },
  { timeout: 600000 }
);

after(async () => {
  restoreQueue?.();
  server?.close();
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(() => {
  queued = [];
  restoreQueue?.();
  restoreQueue = setResumeEnqueuer(async (job) => {
    queued.push(job);
  });
});

const guest = () => randomUUID();

async function upload(guestId, { buffer = makePdf(), name = 'Asha CV.pdf', type = PDF_TYPE, key, field = 'file' } = {}) {
  const form = new FormData();
  if (buffer) form.append(field, new Blob([buffer], { type }), name);
  const headers = {};
  if (guestId) headers['X-Guest-Session'] = guestId;
  if (key) headers['Idempotency-Key'] = key;
  const response = await fetch(`${base}/api/resumes`, { method: 'POST', body: form, headers });
  return { status: response.status, body: await response.json() };
}

async function call(method, path, guestId) {
  const response = await fetch(`${base}${path}`, { method, headers: guestId ? { 'X-Guest-Session': guestId } : {} });
  const isJson = (response.headers.get('content-type') ?? '').includes('json');
  return { status: response.status, headers: response.headers, body: isJson ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}

const fakeJob = (job, attemptsMade = 0) => ({ data: job, attemptsMade, opts: { attempts: 3 } });
const succeed = async () => SAMPLE_MODEL_OUTPUT;

// Upload + run the worker → completed job for `guestId`.
async function completedUpload(guestId, options) {
  const { body } = await upload(guestId, options);
  await createResumeProcessor({ extractProfile: succeed })(fakeJob(queued.at(-1)));
  return body.jobId;
}

describe('POST /api/resumes (upload)', () => {
  test('a PDF upload is stored and queued: 202 with job id; the job carries ids, never bytes', async () => {
    const id = guest();
    const { status, body } = await upload(id);
    assert.equal(status, 202);
    assert.equal(body.status, 'queued');
    assert.equal(body.pollAfterMs, 1000);
    assert.equal(body.file.fileName, 'Asha CV.pdf');
    assert.equal(body.file.kind, 'pdf');
    assert.equal(queued.length, 1);
    assert.deepEqual(Object.keys(queued[0]).sort(), ['fileId', 'kind', 'resumeId', 'run']);
    assert.equal(queued[0].resumeId.toString(), body.jobId);
    const doc = await Resume.findById(body.jobId);
    assert.equal(doc.ownerType, 'guest');
    assert.notEqual(doc.ownerKey, id, 'only a hash of the guest session is stored');
    assert.ok(doc.expiresAt > new Date());
  });

  test('a DOCX upload is accepted', async () => {
    const { status, body } = await upload(guest(), { buffer: await makeDocx(), name: 'cv.docx', type: DOCX_TYPE });
    assert.equal(status, 202);
    assert.equal(body.file.kind, 'docx');
  });

  test('type is checked by content: a renamed image or .doc → 415, nothing stored or queued', async () => {
    const before = await Resume.countDocuments();
    const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(100)]);
    const fakePdf = await upload(guest(), { buffer: png, name: 'resume.pdf', type: PDF_TYPE });
    const doc = await upload(guest(), { buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2]), name: 'cv.doc', type: 'application/msword' });
    assert.deepEqual([fakePdf.status, fakePdf.body.error], [415, 'unsupported_type']);
    assert.deepEqual([doc.status, doc.body.error], [415, 'unsupported_type']);
    assert.equal(await Resume.countDocuments(), before);
    assert.equal(queued.length, 0);
  });

  test('files over 5 MB → 413; empty → 400; missing file → 400', async () => {
    const big = Buffer.concat([makePdf(), Buffer.alloc(MAX_RESUME_BYTES)]);
    const tooBig = await upload(guest(), { buffer: big });
    assert.deepEqual([tooBig.status, tooBig.body.error], [413, 'file_too_large']);
    const empty = await upload(guest(), { buffer: Buffer.alloc(0) });
    assert.deepEqual([empty.status, empty.body.error], [400, 'empty_file']);
    const none = await upload(guest(), { buffer: null });
    assert.deepEqual([none.status, none.body.error], [400, 'file_required']);
    const wrongField = await upload(guest(), { field: 'resume' });
    assert.equal(wrongField.status, 400);
    assert.equal(queued.length, 0);
  });

  test('guest identity is required; an Authorization header alone is not trusted', async () => {
    const missing = await upload(null);
    assert.deepEqual([missing.status, missing.body.error], [401, 'guest_session_required']);
    const invalid = await upload('not-a-uuid');
    assert.equal(invalid.status, 401);
    const response = await fetch(`${base}/api/resumes/jobs/abc`, { headers: { Authorization: 'Bearer something' } });
    assert.deepEqual([response.status, (await response.json()).error], [401, 'auth_not_supported']);
  });

  test('the same Idempotency-Key returns the same job and queues it once', async () => {
    const id = guest();
    const key = randomUUID();
    const [a, b] = [await upload(id, { key }), await upload(id, { key })];
    assert.equal(a.body.jobId, b.body.jobId);
    assert.equal(queued.length, 1);
    // A different guest with the same key gets their own upload.
    const other = await upload(guest(), { key });
    assert.notEqual(other.body.jobId, a.body.jobId);
  });

  test('queue unavailable → 503 and nothing half-created is left behind', async () => {
    restoreQueue();
    restoreQueue = setResumeEnqueuer(async () => {
      throw new Error('redis down');
    });
    const before = await Resume.countDocuments();
    const filesBefore = (await listResumeFilesBefore(new Date(Date.now() + 1000))).length;
    const { status, body } = await upload(guest());
    assert.deepEqual([status, body.error], [503, 'processing_unavailable']);
    assert.equal(await Resume.countDocuments(), before);
    assert.equal((await listResumeFilesBefore(new Date(Date.now() + 1000))).length, filesBefore);
  });
});

describe('worker + GET /api/resumes/jobs/:jobId (status)', () => {
  test('queued → processing stages → completed with the normalised profile', async () => {
    const id = guest();
    const { body } = await upload(id);
    const stages = [];
    const processor = createResumeProcessor({
      extractProfile: async (text) => {
        assert.ok(text.includes('Asha Verma'), 'Gemini receives the extracted text');
        const status = await call('GET', `/api/resumes/jobs/${body.jobId}`, id);
        stages.push([status.body.status, status.body.stage]);
        return SAMPLE_MODEL_OUTPUT;
      },
    });
    await processor(fakeJob(queued[0]));
    assert.deepEqual(stages, [['processing', 'analyzing']]);

    const done = await call('GET', `/api/resumes/jobs/${body.jobId}`, id);
    assert.equal(done.status, 200);
    assert.equal(done.body.status, 'completed');
    assert.equal(done.body.pollAfterMs, null);
    assert.equal(done.body.profile.fullName, 'Asha Verma');
    assert.equal(done.body.profile.experiences[0].id, `r${body.jobId}-exp-1`);
    assert.equal(done.body.error, null);
  });

  test("another guest, a malformed id or an unknown id → the same 404", async () => {
    const owner = guest();
    const jobId = await completedUpload(owner);
    for (const [path, who] of [
      [`/api/resumes/jobs/${jobId}`, guest()],
      ['/api/resumes/jobs/not-an-id', owner],
      [`/api/resumes/jobs/${new mongoose.Types.ObjectId()}`, owner],
    ]) {
      const { status, body } = await call('GET', path, who);
      assert.deepEqual([status, body.error], [404, 'not_found'], path);
      assert.equal(body.profile, undefined);
    }
  });

  test('a text-less PDF fails permanently without calling Gemini', async () => {
    const id = guest();
    const { body } = await upload(id, { buffer: makePdf([]) });
    let called = false;
    const processor = createResumeProcessor({ extractProfile: async () => { called = true; } });
    await assert.rejects(processor(fakeJob(queued[0])), UnrecoverableError);
    assert.equal(called, false);
    const status = await call('GET', `/api/resumes/jobs/${body.jobId}`, id);
    assert.equal(status.body.status, 'failed');
    assert.deepEqual([status.body.error.code, status.body.error.retryable], ['no_text', false]);
  });

  test('temporary Gemini failure: retried by the queue, then failed (retryable) after the last attempt', async () => {
    const id = guest();
    const { body } = await upload(id);
    const busy = createResumeProcessor({
      extractProfile: async () => {
        throw new ResumeProcessingError('ai_busy', 'busy', { retryable: true });
      },
    });
    await assert.rejects(busy(fakeJob(queued[0], 0)), (error) => !(error instanceof UnrecoverableError));
    assert.equal((await call('GET', `/api/resumes/jobs/${body.jobId}`, id)).body.status, 'queued', 'waiting for retry');
    await assert.rejects(busy(fakeJob(queued[0], 2)));
    const final = await call('GET', `/api/resumes/jobs/${body.jobId}`, id);
    assert.deepEqual([final.body.status, final.body.error.code, final.body.error.retryable], ['failed', 'ai_busy', true]);
    assert.equal(final.body.attempt, 2);
  });

  test('malformed model output fails safely (no partial profile)', async () => {
    const id = guest();
    const { body } = await upload(id);
    const processor = createResumeProcessor({ extractProfile: async () => ['not', 'a', 'profile'] });
    await assert.rejects(processor(fakeJob(queued[0], 2)));
    const status = await call('GET', `/api/resumes/jobs/${body.jobId}`, id);
    assert.deepEqual([status.body.status, status.body.error.code, status.body.profile], ['failed', 'invalid_output', null]);
  });

  test('a late or duplicate job never overwrites a completed result', async () => {
    const id = guest();
    const jobId = await completedUpload(id);
    const late = createResumeProcessor({ extractProfile: async () => ({ ...SAMPLE_MODEL_OUTPUT, fullName: 'Someone Else' }) });
    assert.deepEqual(await late(fakeJob(queued[0])), { skipped: true });
    const status = await call('GET', `/api/resumes/jobs/${jobId}`, id);
    assert.equal(status.body.profile.fullName, 'Asha Verma');
  });
});

describe('retry', () => {
  test('a failed retryable job is re-queued once (concurrent retries do not duplicate)', async () => {
    const id = guest();
    const { body } = await upload(id);
    await assert.rejects(
      createResumeProcessor({ extractProfile: async () => { throw new ResumeProcessingError('ai_timeout', 't', { retryable: true }); } })(
        fakeJob(queued[0], 2)
      )
    );
    queued.length = 0;
    const [a, b] = await Promise.all([
      call('POST', `/api/resumes/jobs/${body.jobId}/retry`, id),
      call('POST', `/api/resumes/jobs/${body.jobId}/retry`, id),
    ]);
    assert.equal(a.body.status, 'queued');
    assert.equal(b.body.status, 'queued');
    assert.equal(queued.length, 1);
    assert.equal(queued[0].run, 2);
    // Retrying a queued job only re-adds the same queue job id (a no-op in
    // BullMQ when it exists), never a new run.
    await call('POST', `/api/resumes/jobs/${body.jobId}/retry`, id);
    assert.deepEqual(queued.map((job) => job.run), [2, 2]);
  });

  test('an upload whose queue job was lost is recovered (Retry or the periodic re-queue)', async () => {
    const id = guest();
    const { body } = await upload(id);
    queued.length = 0; // pretend the API restarted before the job reached Redis

    const retry = await call('POST', `/api/resumes/jobs/${body.jobId}/retry`, id);
    assert.equal(retry.body.status, 'queued');
    assert.deepEqual(queued.map((job) => [String(job.resumeId), job.run]), [[body.jobId, 1]]);

    queued.length = 0;
    const completedId = await completedUpload(guest());
    queued.length = 0;
    const count = await requeueStuckResumes(Date.now() + 10 * 60000);
    const requeuedIds = queued.map((job) => String(job.resumeId));
    assert.ok(count >= 1);
    assert.ok(requeuedIds.includes(body.jobId), 'stuck queued upload re-queued');
    assert.ok(!requeuedIds.includes(completedId), 'completed uploads are not re-queued');
    assert.equal(await requeueStuckResumes(Date.now()), 0, 'recent uploads are left alone');
  });

  test('a permanent failure cannot be retried (409); another guest gets 404', async () => {
    const id = guest();
    const { body } = await upload(id, { buffer: makePdf([]) });
    await assert.rejects(createResumeProcessor({ extractProfile: succeed })(fakeJob(queued[0])));
    const retry = await call('POST', `/api/resumes/jobs/${body.jobId}/retry`, id);
    assert.deepEqual([retry.status, retry.body.error], [409, 'not_retryable']);
    assert.equal((await call('POST', `/api/resumes/jobs/${body.jobId}/retry`, guest())).status, 404);
  });
});

describe('confirm, replace and download', () => {
  test('confirm then download: correct bytes, type and safe filename; owner only', async () => {
    const id = guest();
    const jobId = await completedUpload(id, { name: 'Asha "CV".pdf' });
    const beforeConfirm = await call('GET', `/api/resumes/${jobId}/download`, id);
    assert.equal(beforeConfirm.status, 404, 'unconfirmed uploads are not downloadable');

    const confirmed = await call('POST', `/api/resumes/${jobId}/confirm`, id);
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.resume.resumeId, jobId);
    assert.ok(confirmed.body.resume.confirmedAt);
    assert.equal((await Resume.findById(jobId)).profile, null, 'extracted data is dropped after confirmation');

    const download = await call('GET', `/api/resumes/${jobId}/download`, id);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), PDF_TYPE);
    assert.ok(download.headers.get('content-disposition').startsWith('attachment; filename="Asha CV.pdf"'));
    assert.equal(download.headers.get('cache-control'), 'private, no-store');
    assert.ok(download.body.equals(makePdf()));

    assert.equal((await call('GET', `/api/resumes/${jobId}/download`, guest())).status, 404, 'other guest');
    assert.equal((await call('GET', `/api/resumes/${jobId}/download`, null)).status, 401, 'no identity');
    assert.equal((await call('POST', `/api/resumes/${jobId}/confirm`, guest())).status, 404, 'other guest cannot confirm');
  });

  test('a job that has not completed cannot be confirmed (409)', async () => {
    const id = guest();
    const { body } = await upload(id);
    const response = await call('POST', `/api/resumes/${body.jobId}/confirm`, id);
    assert.deepEqual([response.status, response.body.error], [409, 'not_ready']);
  });

  test('a new upload that fails or is abandoned leaves the confirmed resume untouched; confirming replaces it', async () => {
    const id = guest();
    const first = await completedUpload(id, { name: 'first.pdf' });
    await call('POST', `/api/resumes/${first}/confirm`, id);

    // New upload fails.
    const failed = await upload(id, { buffer: makePdf([]) });
    await assert.rejects(createResumeProcessor({ extractProfile: succeed })(fakeJob(queued.at(-1))));
    // New upload completes but is abandoned (never confirmed).
    const abandoned = await completedUpload(id, { name: 'second.pdf' });

    for (const jobId of [failed.body.jobId, abandoned]) {
      assert.equal((await call('GET', `/api/resumes/${jobId}/download`, id)).status, 404);
    }
    const stillFirst = await call('GET', `/api/resumes/${first}/download`, id);
    assert.equal(stillFirst.status, 200);
    assert.ok(stillFirst.headers.get('content-disposition').includes('first.pdf'));

    // Confirming the new one replaces the old one (old file and record removed).
    const second = await completedUpload(id, { name: 'third.docx', buffer: await makeDocx(), type: DOCX_TYPE });
    await call('POST', `/api/resumes/${second}/confirm`, id);
    assert.equal((await call('GET', `/api/resumes/${first}/download`, id)).status, 404);
    assert.equal(await Resume.exists({ _id: first }), null);
    const current = await call('GET', `/api/resumes/${second}/download`, id);
    assert.equal(current.status, 200);
    assert.equal(current.headers.get('content-type'), DOCX_TYPE);
    // Confirming again is harmless.
    assert.equal((await call('POST', `/api/resumes/${second}/confirm`, id)).status, 200);
  });
});

describe('cleanup', () => {
  test('removes expired pending uploads and orphan files, never the confirmed resume', async () => {
    const id = guest();
    const confirmed = await completedUpload(id);
    await call('POST', `/api/resumes/${confirmed}/confirm`, id);
    const pending = (await upload(id)).body.jobId;
    const fresh = (await upload(guest())).body.jobId;
    const orphan = await saveResumeFile(makePdf(), { fileName: 'orphan.pdf', contentType: PDF_TYPE, ownerType: 'guest' });

    const later = Date.now() + PENDING_TTL_MS + 3600000 * 2;
    // `fresh` belongs to a guest whose upload is newer than the TTL window at `now`.
    await Resume.updateOne({ _id: fresh }, { $set: { expiresAt: new Date(later + 3600000) } });
    const counts = await cleanupResumes(later);

    assert.ok(counts.expired >= 1);
    assert.equal(await Resume.exists({ _id: pending }), null, 'expired pending upload removed');
    assert.ok(await Resume.exists({ _id: fresh }), 'unexpired pending upload kept');
    assert.ok(await Resume.exists({ _id: confirmed }), 'confirmed resume kept');
    assert.equal((await call('GET', `/api/resumes/${confirmed}/download`, id)).status, 200);
    const files = await listResumeFilesBefore(new Date(later));
    assert.ok(!files.some((file) => String(file._id) === String(orphan)), 'orphan file removed');
  });

  test('if two resumes are confirmed (e.g. a crash mid-replace), only the newest is kept', async () => {
    const id = guest();
    const a = await completedUpload(id);
    const b = await completedUpload(id);
    await Resume.updateMany({ _id: { $in: [a, b] } }, [
      { $set: { confirmedAt: { $cond: [{ $eq: ['$_id', new mongoose.Types.ObjectId(a)] }, new Date(1000), new Date(2000)] }, expiresAt: null } },
    ], { updatePipeline: true });
    await cleanupResumes();
    assert.equal(await Resume.exists({ _id: a }), null);
    assert.ok(await Resume.exists({ _id: b }));
  });
});

test('fixtures contain enough text to be a resume', () => {
  assert.ok(SAMPLE_RESUME_LINES.join(' ').length > 300);
});
