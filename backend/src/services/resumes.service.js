import { Resume } from '../models/resume.model.js';
import {
  deleteResumeFile,
  listResumeFilesBefore,
  openResumeFileStream,
  saveResumeFile,
} from '../storage/resumeFiles.js';
import { enqueueResumeJob, RESUME_JOB_ATTEMPTS } from '../queue/resumeQueue.js';
import { RESUME_CONTENT_TYPES, detectResumeKind, safeResumeFileName } from './resumeFile.js';
import { HttpError, NotFoundError } from '../utils/httpErrors.js';

// Upload, status, retry, confirm, download and cleanup of resumes.
// `owner` is { type: 'guest' | 'user', key } from routes/resumes.routes.js;
// every lookup filters on owner.key, and another owner's resume is a 404.

export const PENDING_TTL_MS = 24 * 3600000;
export const POLL_AFTER_MS = 1000;

const notFound = () => new NotFoundError('Resume not found');
const isObjectId = (id) => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);

async function findOwned(owner, id) {
  if (!isObjectId(id)) throw notFound();
  const doc = await Resume.findOne({ _id: id, ownerKey: owner.key });
  if (!doc) throw notFound();
  return doc;
}

export const resumeSummary = (doc) => ({
  resumeId: String(doc._id),
  fileName: doc.fileName,
  kind: doc.kind,
  contentType: doc.contentType,
  size: doc.size,
  confirmedAt: doc.confirmedAt ? doc.confirmedAt.toISOString() : null,
});

// Status response for the app's polling.
export function jobStatus(doc) {
  const terminal = doc.status === 'completed' || doc.status === 'failed';
  return {
    jobId: String(doc._id),
    resumeId: String(doc._id),
    status: doc.status,
    stage: doc.status === 'processing' ? doc.stage : null,
    attempt: doc.attempts,
    maxAttempts: RESUME_JOB_ATTEMPTS,
    profile: doc.status === 'completed' && !doc.confirmedAt ? doc.profile : null,
    error:
      doc.status === 'failed' && doc.error
        ? { code: doc.error.code, message: doc.error.message, retryable: doc.error.retryable }
        : null,
    file: resumeSummary(doc),
    pollAfterMs: terminal ? null : POLL_AFTER_MS,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

// POST /api/resumes: validate, store, record and queue. Same idempotency key
// from the same owner → the existing upload is returned (no second job).
export async function createResumeUpload({ owner, file, idempotencyKey }, now = Date.now()) {
  if (!file?.buffer?.length) throw new HttpError(400, 'empty_file', 'The file is empty.');
  const kind = detectResumeKind(file.buffer);
  if (!kind) throw new HttpError(415, 'unsupported_type', 'Upload a PDF or DOCX file.');

  if (idempotencyKey) {
    const existing = await Resume.findOne({ ownerKey: owner.key, idempotencyKey });
    if (existing) return jobStatus(existing);
  }

  const fileName = safeResumeFileName(file.originalname, kind);
  const contentType = RESUME_CONTENT_TYPES[kind];
  const fileId = await saveResumeFile(file.buffer, { fileName, contentType, ownerType: owner.type });

  let doc;
  try {
    doc = await Resume.create({
      ownerType: owner.type,
      ownerKey: owner.key,
      fileId,
      fileName,
      kind,
      contentType,
      size: file.buffer.length,
      status: 'queued',
      idempotencyKey,
      expiresAt: new Date(now + PENDING_TTL_MS),
    });
  } catch (error) {
    await deleteResumeFile(fileId);
    if (error?.code === 11000 && idempotencyKey) {
      const existing = await Resume.findOne({ ownerKey: owner.key, idempotencyKey });
      if (existing) return jobStatus(existing);
    }
    throw error;
  }

  try {
    await enqueueResumeJob({ resumeId: doc._id, fileId, kind, run: doc.run });
  } catch (error) {
    // Nothing half-created is left behind if the queue is unavailable.
    await Promise.allSettled([deleteResumeFile(fileId), Resume.deleteOne({ _id: doc._id })]);
    throw new HttpError(503, 'processing_unavailable', 'Resume processing is unavailable right now. Please try again.');
  }
  return jobStatus(doc);
}

export async function getResumeJob({ owner, jobId }) {
  return jobStatus(await findOwned(owner, jobId));
}

// POST /api/resumes/jobs/:jobId/retry: re-queues a failed, retryable job.
// Idempotent: a job that isn't failed is returned unchanged.
export async function retryResumeJob({ owner, jobId }) {
  const doc = await findOwned(owner, jobId);
  if (doc.status === 'queued') {
    // The queue job may have been lost (e.g. the API restarted between saving
    // the upload and queueing it). Re-adding the same job id is a no-op when
    // it already exists, so this can't create a duplicate.
    await requeue(doc);
    return jobStatus(doc);
  }
  if (doc.status !== 'failed') return jobStatus(doc);
  if (!doc.error?.retryable) {
    throw new HttpError(409, 'not_retryable', doc.error?.message ?? 'This upload cannot be retried. Please upload the file again.');
  }

  // Only one concurrent retry can win this update.
  const updated = await Resume.findOneAndUpdate(
    { _id: doc._id, ownerKey: owner.key, status: 'failed' },
    { $set: { status: 'queued', stage: null, error: null }, $inc: { run: 1 } },
    { new: true }
  );
  if (!updated) return jobStatus(await findOwned(owner, jobId));

  try {
    await enqueueResumeJob({ resumeId: updated._id, fileId: updated.fileId, kind: updated.kind, run: updated.run });
  } catch {
    updated.status = 'failed';
    updated.error = {
      code: 'processing_unavailable',
      message: 'Resume processing is unavailable right now. Please try again.',
      retryable: true,
    };
    await updated.save();
  }
  return jobStatus(updated);
}

// POST /api/resumes/:resumeId/confirm: called when the user saves the
// reviewed profile. Makes this the owner's resume, then removes the previous
// confirmed resume. Idempotent.
export async function confirmResume({ owner, resumeId }) {
  const doc = await findOwned(owner, resumeId);
  if (!doc.confirmedAt) {
    if (doc.status !== 'completed') {
      throw new HttpError(409, 'not_ready', 'This resume has not finished processing.');
    }
    doc.confirmedAt = new Date();
    doc.expiresAt = null;
    doc.profile = null; // the app keeps the confirmed profile; don't hold extra personal data
    await doc.save();
  }
  await removeSupersededResumes(owner.key);
  return { resume: resumeSummary(doc) };
}

// GET /api/resumes/:resumeId/download: the owner's confirmed resume file.
export async function openResumeDownload({ owner, resumeId }) {
  const doc = await findOwned(owner, resumeId);
  if (!doc.confirmedAt) throw notFound();
  const file = await openResumeFileStream(doc.fileId);
  if (!file) throw new HttpError(404, 'file_missing', 'This resume file is no longer available. Please upload it again.');
  return { ...file, fileName: doc.fileName, contentType: doc.contentType };
}

async function deleteResume(doc) {
  await deleteResumeFile(doc.fileId);
  await Resume.deleteOne({ _id: doc._id });
}

// The owner's current resume: the newest confirmed one that isn't archived.
export function findCurrentResume(ownerKey) {
  return Resume.findOne({ ownerKey, confirmedAt: { $ne: null }, archivedAt: null }).sort({ confirmedAt: -1, _id: -1 });
}

// Keeps only the newest confirmed resume of an owner (archived ones are kept).
async function removeSupersededResumes(ownerKey) {
  const confirmed = await Resume.find({ ownerKey, confirmedAt: { $ne: null }, archivedAt: null })
    .sort({ confirmedAt: -1, _id: -1 })
    .select({ _id: 1, fileId: 1 });
  for (const old of confirmed.slice(1)) await deleteResume(old);
  return confirmed.length > 1 ? confirmed.length - 1 : 0;
}

const requeue = (doc) => enqueueResumeJob({ resumeId: doc._id, fileId: doc.fileId, kind: doc.kind, run: doc.run });

// Re-queues uploads stuck in "queued" (their queue job was lost). Run by the
// worker periodically; safe because re-adding an existing job id is a no-op.
export async function requeueStuckResumes(now = Date.now(), olderThanMs = 5 * 60000) {
  const stuck = await Resume.find({
    status: 'queued',
    confirmedAt: null,
    updatedAt: { $lt: new Date(now - olderThanMs) },
    expiresAt: { $gt: new Date(now) },
  });
  for (const doc of stuck) await requeue(doc);
  return stuck.length;
}

// Periodic cleanup (run by the worker): expired pending uploads, superseded
// confirmed resumes, and files without a record (e.g. a crash mid-upload).
// The newest confirmed resume of an owner is never deleted.
export async function cleanupResumes(now = Date.now()) {
  const counts = { expired: 0, superseded: 0, orphanFiles: 0 };

  const expired = await Resume.find({ confirmedAt: null, expiresAt: { $lte: new Date(now) } }).select({ _id: 1, fileId: 1 });
  for (const doc of expired) await deleteResume(doc);
  counts.expired = expired.length;

  const owners = await Resume.aggregate([
    { $match: { confirmedAt: { $ne: null }, archivedAt: null } },
    { $group: { _id: '$ownerKey', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  for (const { _id: ownerKey } of owners) counts.superseded += await removeSupersededResumes(ownerKey);

  // Only files older than an hour, so uploads in progress are never touched.
  const files = await listResumeFilesBefore(new Date(now - 3600000));
  for (const file of files) {
    if (!(await Resume.exists({ fileId: file._id }))) {
      await deleteResumeFile(file._id);
      counts.orphanFiles += 1;
    }
  }
  return counts;
}

