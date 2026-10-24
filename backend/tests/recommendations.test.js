// Recommendations: matching-profile privacy, guest isolation, duplicate
// requests, regeneration, candidate selection, Gemini ranking validation,
// quota deferral (shared guard), retries and recovery. Real in-memory
// MongoDB with the 500-job dataset; Gemini and the queue are faked.

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UnrecoverableError } from 'bullmq';
import { createApp } from '../src/app.js';
import { Job } from '../src/models/job.model.js';
import { Recommendation } from '../src/models/recommendation.model.js';
import { JOBS } from '../src/data/jobs.dataset.js';
import { toJobDocument } from '../src/seed/jobTransform.js';
import { setRecommendationEnqueuer } from '../src/queue/recommendationQueue.js';
import { maintainRecommendations, MAX_RUNS_PER_HOUR, RETENTION_MS } from '../src/services/recommendations.service.js';
import { matchingProfileVersion, normalizeMatchingProfile } from '../src/services/matchingProfile.js';
import { compareSkills, selectCandidates } from '../src/services/jobMatching.js';
import { createMemoryQuotaStore, createQuotaGuard, nextPacificMidnight, retryHintMs } from '../src/services/geminiQuota.js';
import { createRecommendationProcessor, validateRankings, MAX_DEFERRAL_MS } from '../src/workers/recommendationWorker.js';
import { createJobRanker, JOB_RANKING_SCHEMA } from '../src/services/gemini.js';
import { ResumeProcessingError } from '../src/services/resumeErrors.js';

const PROFILE = {
  skills: ['React', 'JavaScript', 'TypeScript', 'Redux'],
  currentRole: 'Frontend Developer',
  experienceTitles: ['React Developer'],
  experienceYears: '3',
  experienceMonths: '0',
  currentLocation: 'Pune, Maharashtra, India',
  preferredLocations: ['Bengaluru, Karnataka, India'],
  education: [{ degree: 'B.Tech', field: 'Computer Science' }],
};
const quotaConfig = (overrides = {}) => ({
  rpm: null, tpm: null, dailyBudget: null, breakerThreshold: 3, breakerBaseMs: 60000, breakerMaxMs: 900000, dailyAfter429s: 8, ...overrides,
});

// --- units --------------------------------------------------------------------------

describe('matching profile (privacy + versions)', () => {
  test('only whitelisted matching fields are kept; identity data never survives', () => {
    const profile = normalizeMatchingProfile({
      ...PROFILE,
      fullName: 'Asha Verma',
      email: 'asha@example.com',
      phone: '9876543210',
      whatsappOptIn: true,
      currentCompany: 'Northwind Tech',
      experiences: [{ title: 'Dev', company: 'Bluepeak' }],
      education: [{ degree: 'B.Tech', field: 'CS', institution: 'Example Institute' }],
      $where: 'evil',
    });
    assert.deepEqual(Object.keys(profile).sort(), [
      'currentLocation', 'currentRole', 'education', 'experienceMonths', 'experienceTitles', 'experienceYears', 'preferredLocations', 'skills',
    ]);
    assert.deepEqual(profile.education, [{ degree: 'B.Tech', field: 'CS' }]);
    assert.ok(!JSON.stringify(profile).match(/Asha|example\.com|9876543210|Northwind|Bluepeak|Institute/));
    assert.equal(profile.experienceYears, 3);
  });

  test('unusable profiles are rejected', () => {
    assert.throws(() => normalizeMatchingProfile(null), (error) => error.status === 400);
    assert.throws(() => normalizeMatchingProfile({ skills: [], currentRole: '' }), (error) => error.status === 400);
  });

  test('version ignores order/case but changes with matching content', () => {
    const a = matchingProfileVersion(normalizeMatchingProfile(PROFILE));
    const reordered = matchingProfileVersion(
      normalizeMatchingProfile({ ...PROFILE, skills: ['redux', 'TYPESCRIPT', 'javascript', 'react'] })
    );
    assert.equal(a, reordered);
    assert.notEqual(a, matchingProfileVersion(normalizeMatchingProfile({ ...PROFILE, skills: [...PROFILE.skills, 'GraphQL'] })));
    assert.notEqual(a, matchingProfileVersion(normalizeMatchingProfile({ ...PROFILE, preferredLocations: ['Mumbai'] })));
  });
});

describe('candidate selection (real jobs only)', () => {
  const jobs = JOBS.map((job) => toJobDocument(job));
  const profile = normalizeMatchingProfile(PROFILE);

  test('picks relevant real jobs, best first, with computed matched/gap skills', () => {
    const candidates = selectCandidates(profile, jobs);
    assert.equal(candidates.length, 30);
    const ids = new Set(jobs.map((job) => job.jobId));
    candidates.forEach((candidate) => assert.ok(ids.has(candidate.job.jobId)));
    assert.ok(candidates.slice(0, 2).every((candidate) => candidate.job.title === 'React Developer'));
    assert.ok(candidates.slice(0, 10).every((candidate) => candidate.matchedSkills.length >= 2));
    assert.ok(
      candidates.slice(0, 10).filter((candidate) => candidate.job.category === 'Frontend' || /React/.test(candidate.job.title)).length >= 9,
      'top results are frontend / React roles'
    );
    assert.ok(!candidates.slice(0, 10).some((candidate) => /Java Developer|Spring/.test(candidate.job.title)), 'no Java roles for a React profile');
    for (let i = 1; i < candidates.length; i += 1) assert.ok(candidates[i - 1].score >= candidates[i].score);
    assert.ok(candidates.slice(0, 5).some((candidate) => candidate.job.city === 'Bengaluru'), 'preferred city ranks high');
  });

  test('resume spellings match the job spellings (React.js = React, not a gap)', () => {
    const result = compareSkills(
      ['React.js', 'ReactJS', 'Express.js', 'Redux Toolkit', 'NodeJS', 'RESTful APIs', 'Tailwind CSS', 'Postgres'],
      ['React', 'Express', 'Redux', 'Node.js', 'REST APIs', 'Tailwind CSS', 'PostgreSQL', 'Java', 'JavaScript']
    );
    assert.deepEqual(result.matchedSkills, ['React', 'Express', 'Redux', 'Node.js', 'REST APIs', 'Tailwind CSS', 'PostgreSQL']);
    assert.deepEqual(result.gapSkills, ['Java', 'JavaScript'], 'Java / JavaScript are not confused with each other');
  });

  test('a MERN profile written with resume spellings gets MERN / Node / React roles, not Java ones', () => {
    const mern = normalizeMatchingProfile({
      skills: ['React.js', 'Redux Toolkit', 'Node.js', 'Express.js', 'MongoDB', 'Mongoose', 'JavaScript', 'REST API Design', 'Tailwind CSS', 'Socket.io'],
      currentRole: 'MERN Stack Developer',
      experienceTitles: ['MERN Stack Developer', 'Software Developer Intern'],
      experienceYears: 2,
      experienceMonths: 7,
      currentLocation: 'Indore, India',
      preferredLocations: ['Bengaluru'],
    });
    const top = selectCandidates(mern, jobs).slice(0, 10);
    assert.ok(top.every((candidate) => !/Java(?!Script)|Spring/.test(candidate.job.title)), top.map((c) => c.job.title).join(' | '));
    assert.ok(top.filter((candidate) => /MERN|Node|React|Full Stack/.test(candidate.job.title)).length >= 8);
    const mernJob = top.find((candidate) => /MERN/.test(candidate.job.title));
    assert.ok(mernJob && !mernJob.gapSkills.includes('React') && !mernJob.gapSkills.includes('Express'));
  });

  test('skills are compared case-insensitively; no overlap and no title → no candidates', () => {
    assert.deepEqual(compareSkills(['react', 'NODE.JS'], ['React', 'Node.js', 'Docker']), {
      matchedSkills: ['React', 'Node.js'],
      gapSkills: ['Docker'],
    });
    const none = normalizeMatchingProfile({ skills: ['Underwater Basket Weaving'], currentRole: 'Zzz' });
    assert.deepEqual(selectCandidates(none, jobs), []);
  });
});

describe('Gemini ranking validation', () => {
  const candidates = selectCandidates(normalizeMatchingProfile(PROFILE), JOBS.map((job) => toJobDocument(job)));

  test('only candidate jobs, once each, with valid labels; skills from our comparison', () => {
    const [a, b, c, d, e, f] = candidates;
    const items = validateRankings(
      {
        rankings: [
          { jobId: b.job.jobId, fitLabel: 'Excellent Fit', reason: 'Great', matchedSkills: ['Invented'] },
          { jobId: 'job-fake-1', fitLabel: 'Excellent Fit', reason: 'not a candidate' },
          { jobId: b.job.jobId, fitLabel: 'Good Fit', reason: 'duplicate' },
          { jobId: a.job.jobId, fitLabel: 'Amazing', reason: 'bad label' },
          ...[c, d, e, f].map((x) => ({ jobId: x.job.jobId, fitLabel: 'Good Fit', reason: 'ok' })),
        ],
      },
      candidates
    );
    assert.deepEqual(items.map((item) => item.jobId), [b, c, d, e, f].map((x) => x.job.jobId));
    assert.deepEqual(items[0].matchedSkills, b.matchedSkills);
    assert.deepEqual(items.map((item) => item.rank), [1, 2, 3, 4, 5]);
  });

  test('too few valid rankings or malformed output → invalid_output', () => {
    assert.throws(() => validateRankings({ rankings: [{ jobId: candidates[0].job.jobId, fitLabel: 'Good Fit' }] }, candidates), (e) => e.code === 'invalid_output');
    assert.throws(() => validateRankings('nope', candidates), (e) => e.code === 'invalid_output');
  });

  test('the ranker sends only the matching profile and candidate jobs, with a strict schema', async () => {
    const calls = [];
    const client = { interactions: { create: async (params, options) => { calls.push({ params, options }); return { output_text: '{"rankings":[]}' }; } } };
    const rank = createJobRanker({ client, model: 'test-model' });
    await rank(normalizeMatchingProfile(PROFILE), [{ jobId: 'job-a-1', title: 'React Developer' }]);
    const [{ params, options }] = calls;
    assert.equal(params.model, 'test-model');
    assert.deepEqual(params.response_format.schema, JOB_RANKING_SCHEMA);
    assert.ok(params.input.includes('job-a-1'));
    assert.ok(!/fullName|email|phone/.test(params.input));
    assert.equal(options.maxRetries, 0);
  });
});

describe('shared Gemini quota guard', () => {
  test('optional RPM / daily limits; two workers share one budget', async () => {
    let time = Date.UTC(2026, 9, 25, 10, 0, 30);
    const store = createMemoryQuotaStore();
    const a = createQuotaGuard({ store, config: quotaConfig({ rpm: 2, dailyBudget: 3 }), now: () => time });
    const b = createQuotaGuard({ store, config: quotaConfig({ rpm: 2, dailyBudget: 3 }), now: () => time });
    assert.equal((await a.acquire()).ok, true);
    assert.equal((await b.acquire()).ok, true);
    const blocked = await a.acquire();
    assert.deepEqual([blocked.ok, blocked.reason, blocked.retryAt], [false, 'rpm', Date.UTC(2026, 9, 25, 10, 1, 0)]);
    time += 60000;
    assert.equal((await b.acquire()).ok, true);
    const daily = await a.acquire();
    assert.deepEqual([daily.ok, daily.reason, daily.retryAt], [false, 'daily_budget', nextPacificMidnight(time)]);
  });

  test('no limits configured → nothing invented, calls allowed', async () => {
    const guard = createQuotaGuard({ store: createMemoryQuotaStore(), config: quotaConfig() });
    for (let i = 0; i < 50; i += 1) assert.equal((await guard.acquire(100000)).ok, true);
  });

  test('next Pacific midnight in summer (PDT) and winter (PST)', () => {
    assert.equal(nextPacificMidnight(Date.UTC(2026, 6, 1, 12)), Date.UTC(2026, 6, 2, 7));
    assert.equal(nextPacificMidnight(Date.UTC(2026, 11, 1, 12)), Date.UTC(2026, 11, 2, 8));
    assert.equal(nextPacificMidnight(Date.UTC(2026, 11, 2, 7, 59)), Date.UTC(2026, 11, 2, 8));
  });

  test('429 opens the circuit for the retry hint; daily-quota 429 → until Pacific midnight', async () => {
    let time = Date.UTC(2026, 9, 25, 10);
    const store = createMemoryQuotaStore();
    const guard = createQuotaGuard({ store, config: quotaConfig(), now: () => time });
    const hinted = { status: 429, message: 'Resource exhausted', details: [{ retryDelay: '90s' }] };
    assert.equal(retryHintMs(hinted), 90000);
    const first = await guard.recordFailure(hinted, { rateLimited: true });
    assert.equal(first.openUntil, time + 90000);
    const open = await guard.acquire();
    assert.deepEqual([open.ok, open.reason], [false, 'circuit_open']);
    time += 91000;
    assert.equal((await guard.acquire()).ok, true);

    const daily = await guard.recordFailure({ status: 429, message: 'Quota exceeded: GenerateRequestsPerDayPerProjectPerModel' }, { rateLimited: true });
    assert.equal(daily.daily, true);
    assert.ok(daily.openUntil >= nextPacificMidnight(time));
    await guard.recordSuccess();
    assert.equal((await guard.acquire()).ok, false, 'success elsewhere does not close a daily stop early');
  });

  test('repeated 5xx open the circuit only after the threshold', async () => {
    const time = Date.UTC(2026, 9, 25, 10);
    const guard = createQuotaGuard({ store: createMemoryQuotaStore(), config: quotaConfig(), now: () => time });
    assert.equal((await guard.recordFailure({ status: 503 })).openUntil, null);
    assert.equal((await guard.recordFailure({ status: 503 })).openUntil, null);
    assert.equal((await guard.recordFailure({ status: 503 })).openUntil, time + 60000);
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
    await mongoose.connect(mongod.getUri(), { dbName: 'spire_rec_test' });
    await Promise.all([Job.createIndexes(), Recommendation.createIndexes()]);
    await Job.insertMany(JOBS.map((job) => toJobDocument(job)));
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
  restoreQueue = setRecommendationEnqueuer(async (job) => {
    queued.push({ recommendationId: String(job.recommendationId), run: job.run });
  });
});

async function api(method, path, guest, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (guest) headers['X-Guest-Session'] = guest;
  const response = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
}
const request = (guest, profile = PROFILE) => api('POST', '/api/recommendations', guest, { matchingProfile: profile });
const current = (guest) => api('GET', '/api/recommendations/current', guest);

const fakeJob = ({ recommendationId, run }, attemptsMade = 0) => ({ data: { recommendationId, run }, attemptsMade, opts: { attempts: 4 } });
const goodRanker = Object.assign(
  async (profile, jobs) => ({
    rankings: jobs.slice(0, 10).reverse().map((job, i) => ({ jobId: job.jobId, fitLabel: i < 3 ? 'Excellent Fit' : 'Good Fit', reason: 'Strong React match' })),
  }),
  { model: 'test-model' }
);
const freeQuota = () => createQuotaGuard({ store: createMemoryQuotaStore(), config: quotaConfig() });

describe('POST /api/recommendations + GET current', () => {
  test('stores only the matching profile and queues one job; repeats reuse it (even in parallel)', async () => {
    const guest = randomUUID();
    const responses = await Promise.all([
      request(guest, { ...PROFILE, fullName: 'Asha Verma', email: 'a@b.co', phone: '9999999999' }),
      request(guest),
      request(guest),
    ]);
    const ids = new Set(responses.map((r) => r.body.recommendationId));
    assert.equal(ids.size, 1);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 200, 202]);
    assert.equal(queued.length, 1);
    const doc = await Recommendation.findById([...ids][0]).lean();
    assert.ok(!JSON.stringify(doc).match(/Asha|a@b\.co|9999999999/));
    assert.equal(doc.ownerType, 'guest');
    assert.notEqual(doc.ownerKey, guest, 'only a hash of the guest session is stored');
    assert.equal(responses[0].body.pollAfterMs, 2000);
  });

  test('guests are isolated; no guest session → 401', async () => {
    const owner = randomUUID();
    const { body } = await request(owner);
    const other = randomUUID();
    assert.deepEqual((await current(other)).body, { status: 'none', items: [], pollAfterMs: null });
    assert.equal((await api('POST', `/api/recommendations/${body.recommendationId}/retry`, other)).status, 404);
    assert.equal((await api('GET', '/api/recommendations/current', null)).status, 401);
    assert.equal((await api('POST', '/api/recommendations', null, { matchingProfile: PROFILE })).status, 401);
  });

  test('invalid matching profiles → 400', async () => {
    const { status, body } = await request(randomUUID(), { skills: 'not a list' });
    assert.deepEqual([status, body.error], [400, 'invalid_request']);
  });

  test('worker completes; current returns ranked real jobs with card + fit fields (recovery after restart)', async () => {
    const guest = randomUUID();
    await request(guest);
    const result = await createRecommendationProcessor({ rankJobs: goodRanker, quota: freeQuota() })(fakeJob(queued[0]));
    assert.deepEqual(result, { completed: true });
    // A restarted app only needs its guest session to get this back.
    const { body } = await current(guest);
    assert.equal(body.status, 'completed');
    assert.equal(body.pollAfterMs, null);
    assert.equal(body.items.length, 10);
    const item = body.items[0];
    for (const field of ['id', 'title', 'company', 'location', 'postedAt', 'verified', 'fitLabel', 'matchedSkills', 'gapSkills', 'reason', 'salary']) {
      assert.ok(item[field] !== undefined, `missing ${field}`);
    }
    assert.equal(item.fitLabel, 'Excellent Fit');
    assert.ok(item.matchedSkills.length > 0);
    assert.ok(body.items.every((entry) => entry.matchedSkills.length > 0 && Array.isArray(entry.gapSkills)));
    assert.ok(await Job.exists({ jobId: item.id }), 'every recommendation is a real job');
  });

  test('a changed profile regenerates; the old result is superseded and never returned', async () => {
    const guest = randomUUID();
    const first = await request(guest);
    await createRecommendationProcessor({ rankJobs: goodRanker, quota: freeQuota() })(fakeJob(queued[0]));
    const second = await request(guest, { ...PROFILE, skills: [...PROFILE.skills, 'Next.js'] });
    assert.equal(second.status, 202);
    assert.notEqual(second.body.recommendationId, first.body.recommendationId);
    assert.equal((await Recommendation.findById(first.body.recommendationId)).status, 'superseded');
    const now = await current(guest);
    assert.deepEqual([now.body.recommendationId, now.body.status, now.body.items.length], [second.body.recommendationId, 'queued', 0]);

    // Changing back to the first profile reuses its fresh result: no new job.
    queued.length = 0;
    const back = await request(guest);
    assert.deepEqual([back.status, back.body.recommendationId, back.body.status], [200, first.body.recommendationId, 'completed']);
    assert.equal(queued.length, 0);
  });

  test('too many new runs per hour → 429', async () => {
    const guest = randomUUID();
    for (let i = 0; i < MAX_RUNS_PER_HOUR; i += 1) {
      assert.equal((await request(guest, { ...PROFILE, skills: [`Skill${i}`] })).status, 202);
    }
    const blocked = await request(guest, { ...PROFILE, skills: ['OneMore'] });
    assert.deepEqual([blocked.status, blocked.body.error], [429, 'too_many_requests']);
  });
});

describe('worker: stale work, failures, quota deferral, recovery', () => {
  test('a superseded or re-run job is skipped and cannot overwrite newer results', async () => {
    const guest = randomUUID();
    const { body } = await request(guest);
    const job = queued[0];
    // Profile changes while ranking → the old run's result is discarded.
    const ranker = async (profile, jobs) => {
      await request(guest, { ...PROFILE, skills: ['Angular'] });
      return goodRanker(profile, jobs);
    };
    assert.deepEqual(await createRecommendationProcessor({ rankJobs: ranker, quota: freeQuota() })(fakeJob(job)), { skipped: true });
    assert.equal((await Recommendation.findById(body.recommendationId)).status, 'superseded');
    assert.equal((await Recommendation.findById(body.recommendationId)).items.length, 0);
    // An older run number is ignored.
    assert.deepEqual(await createRecommendationProcessor({ rankJobs: goodRanker })(fakeJob({ ...job, run: 99 })), { skipped: true });
  });

  test('429 → deferred (not failed, no fake results); the open circuit stops other calls', async () => {
    const quota = freeQuota();
    let calls = 0;
    const limited = async () => {
      calls += 1;
      throw Object.assign(new ResumeProcessingError('ai_busy', 'busy', { retryable: true }), {
        original: { status: 429, message: 'Resource exhausted', details: [{ retryDelay: '120s' }] },
      });
    };
    const g1 = randomUUID();
    await request(g1);
    assert.deepEqual(await createRecommendationProcessor({ rankJobs: limited, quota })(fakeJob(queued[0])), { deferred: true });
    const state = (await current(g1)).body;
    assert.equal(state.status, 'deferred');
    assert.equal(state.items.length, 0, 'candidates are never shown as results');
    assert.equal(state.error.code, 'quota_rate');
    assert.ok(Date.parse(state.nextAttemptAt) >= Date.now() + 110000);
    assert.ok(state.pollAfterMs >= 5000 && state.pollAfterMs <= 60000);

    const g2 = randomUUID();
    await request(g2, { ...PROFILE, skills: ['Vue.js'] });
    assert.deepEqual(await createRecommendationProcessor({ rankJobs: limited, quota })(fakeJob(queued[1])), { deferred: true });
    assert.equal(calls, 1, 'no Gemini call while the circuit is open');
  });

  test('daily quota exhausted → deferred until after midnight Pacific; maintenance resumes it when due', async () => {
    const quota = createQuotaGuard({ store: createMemoryQuotaStore(), config: quotaConfig({ dailyBudget: 1 }) });
    assert.equal((await quota.acquire()).ok, true); // today's only call is used up
    const guest = randomUUID();
    await request(guest);
    let called = false;
    const result = await createRecommendationProcessor({ rankJobs: async () => { called = true; }, quota })(fakeJob(queued[0]));
    assert.deepEqual(result, { deferred: true });
    assert.equal(called, false);
    const doc = await Recommendation.findOne({ _id: queued[0].recommendationId });
    assert.equal(doc.status, 'deferred');
    assert.equal(doc.error.code, 'quota_daily');
    assert.ok(doc.nextAttemptAt.getTime() >= nextPacificMidnight(Date.now()));

    // When due, maintenance re-queues it as a new run and the worker finishes.
    queued.length = 0;
    const counts = await maintainRecommendations(doc.nextAttemptAt.getTime() + 1000);
    assert.ok(counts.resumed >= 1);
    const resumed = queued.find((job) => job.recommendationId === String(doc._id));
    assert.equal(resumed.run, doc.run + 1);
    assert.deepEqual(await createRecommendationProcessor({ rankJobs: goodRanker, quota: freeQuota() })(fakeJob(resumed)), { completed: true });
    assert.equal((await current(guest)).body.status, 'completed');
  });

  test('deferred for too long → failed (retryable)', async () => {
    const guest = randomUUID();
    await request(guest);
    await Recommendation.updateOne({ _id: queued[0].recommendationId }, { $set: { deferredSince: new Date(Date.now() - MAX_DEFERRAL_MS - 1000) } });
    const quota = freeQuota();
    await quota.recordFailure({ status: 429 }, { rateLimited: true });
    assert.deepEqual(await createRecommendationProcessor({ rankJobs: goodRanker, quota })(fakeJob(queued[0])), { failed: true });
    const state = (await current(guest)).body;
    assert.deepEqual([state.status, state.error.code, state.error.retryable], ['failed', 'quota_exhausted', true]);
  });

  test('temporary errors retry with backoff; the last attempt fails; Retry re-queues once', async () => {
    const guest = randomUUID();
    const { body } = await request(guest);
    const down = async () => {
      throw new ResumeProcessingError('ai_unavailable', 'down', { retryable: true });
    };
    await assert.rejects(createRecommendationProcessor({ rankJobs: down, quota: freeQuota() })(fakeJob(queued[0], 0)), (e) => !(e instanceof UnrecoverableError));
    assert.equal((await current(guest)).body.status, 'queued', 'waiting for the automatic retry');
    await assert.rejects(createRecommendationProcessor({ rankJobs: down, quota: freeQuota() })(fakeJob(queued[0], 3)));
    const failed = (await current(guest)).body;
    assert.deepEqual([failed.status, failed.error.code, failed.error.retryable], ['failed', 'ai_unavailable', true]);

    queued.length = 0;
    const [a, b] = await Promise.all([
      api('POST', `/api/recommendations/${body.recommendationId}/retry`, guest),
      api('POST', `/api/recommendations/${body.recommendationId}/retry`, guest),
    ]);
    assert.deepEqual([a.body.status, b.body.status], ['queued', 'queued']);
    assert.equal(queued.length, 1, 'concurrent retries schedule one run');
    assert.equal(queued[0].run, 2);
  });

  test('malformed ranking output is retried, then fails without partial results', async () => {
    const guest = randomUUID();
    await request(guest);
    const junk = async () => ({ rankings: [{ jobId: 'job-made-up-1', fitLabel: 'Excellent Fit' }] });
    await assert.rejects(createRecommendationProcessor({ rankJobs: junk, quota: freeQuota() })(fakeJob(queued[0], 3)));
    const state = (await current(guest)).body;
    assert.deepEqual([state.status, state.error.code, state.items.length], ['failed', 'invalid_output', 0]);
  });

  test('no matching jobs → completed with an empty list (no Gemini call)', async () => {
    const guest = randomUUID();
    await request(guest, { skills: ['Underwater Basket Weaving'], currentRole: 'Zzz' });
    let called = false;
    const result = await createRecommendationProcessor({ rankJobs: async () => { called = true; }, quota: freeQuota() })(fakeJob(queued[0]));
    assert.deepEqual(result, { completed: true, empty: true });
    assert.equal(called, false);
    assert.deepEqual([(await current(guest)).body.status, (await current(guest)).body.items.length], ['completed', 0]);
  });

  test('recovery: a queued run whose queue job was lost is re-queued (same run, no duplicate)', async () => {
    const guest = randomUUID();
    await request(guest);
    const id = queued[0].recommendationId;
    queued.length = 0;
    await maintainRecommendations(Date.now() + 3 * 60000);
    assert.ok(queued.some((job) => job.recommendationId === id && job.run === 1));
  });

  test('retention: superseded and long-inactive recommendations are deleted', async () => {
    const guest = randomUUID();
    const old = await request(guest);
    await request(guest, { ...PROFILE, skills: ['Svelte'] });
    const later = Date.now() + 2 * 3600000;
    await maintainRecommendations(later);
    assert.equal(await Recommendation.exists({ _id: old.body.recommendationId }), null);
    const counts = await maintainRecommendations(Date.now() + RETENTION_MS + 3600000);
    assert.ok(counts.removed >= 1);
    assert.deepEqual((await current(guest)).body.status, 'none');
  });
});
