import { UnrecoverableError, Worker } from 'bullmq';
import { Resume } from '../models/resume.model.js';
import { readResumeFile } from '../storage/resumeFiles.js';
import { RESUME_QUEUE, createRedisClient } from '../queue/resumeQueue.js';
import { extractResumeText } from '../services/resumeText.js';
import { normalizeExtractedProfile } from '../services/resumeProfile.js';
import { ResumeProcessingError, resumeError } from '../services/resumeErrors.js';
import { estimateTokens } from '../services/geminiQuota.js';

// Processes one resume-parse job:
//   stored file → text (extracting_text) → Gemini (analyzing)
//   → validated profile (building_profile) → completed.
// Temporary failures are retried by BullMQ (bounded attempts with backoff);
// permanent ones (bad file, no text, rejected input) stop immediately.
// Only this resume's own record is updated, and never after it completed or
// was confirmed, so a late or duplicate job can't overwrite newer results.

const toProcessingError = (error) =>
  error instanceof ResumeProcessingError ? error : resumeError('processing_failed');

// `quota` (optional): the shared Gemini guard (services/geminiQuota.js).
export function createResumeProcessor({ extractProfile, quota }) {
  return async function processResume(job) {
    const { resumeId } = job.data;
    const doc = await Resume.findById(resumeId);
    if (!doc || doc.status === 'completed' || doc.confirmedAt) return { skipped: true };

    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts?.attempts ?? 1;
    const active = { _id: doc._id, status: { $in: ['queued', 'processing'] } };
    const setStage = (stage) => Resume.updateOne(active, { $set: { status: 'processing', stage } });

    await Resume.updateOne(active, { $set: { status: 'processing', stage: 'extracting_text' }, $inc: { attempts: 1 } });
    try {
      let buffer;
      try {
        buffer = await readResumeFile(doc.fileId);
      } catch {
        throw resumeError('file_missing');
      }
      const text = await extractResumeText(doc.kind, buffer);

      await setStage('analyzing');
      if (quota) {
        const gate = await quota.acquire(estimateTokens(text));
        if (!gate.ok) throw resumeError('ai_busy'); // retried by the queue with backoff
      }
      let raw;
      try {
        raw = await extractProfile(text);
        await quota?.recordSuccess();
      } catch (error) {
        if (error?.code === 'ai_busy') await quota?.recordFailure(error.original ?? error, { rateLimited: true });
        else if (error?.code === 'ai_unavailable' || error?.code === 'ai_timeout') await quota?.recordFailure(error.original ?? error);
        throw error;
      }

      await setStage('building_profile');
      const profile = normalizeExtractedProfile(raw, `r${String(doc._id)}`);

      await Resume.updateOne(active, {
        $set: { status: 'completed', stage: null, error: null, profile },
      });
      return { completed: true };
    } catch (caught) {
      const error = toProcessingError(caught);
      const last = !error.retryable || attempt >= maxAttempts;
      if (last) {
        await Resume.updateOne(active, {
          $set: {
            status: 'failed',
            stage: null,
            error: { code: error.code, message: error.message, retryable: error.retryable },
          },
        });
      } else {
        // Waiting for BullMQ's automatic retry.
        await Resume.updateOne(active, { $set: { status: 'queued', stage: null } });
      }
      // Logged without file contents or personal data.
      console.warn(`[resume-worker] ${resumeId} attempt ${attempt}/${maxAttempts} failed: ${error.code}`);
      if (!error.retryable) throw new UnrecoverableError(error.code);
      throw error;
    }
  };
}

export function startResumeWorker({ extractProfile, quota, concurrency = 2 }) {
  const worker = new Worker(RESUME_QUEUE, createResumeProcessor({ extractProfile, quota }), {
    connection: createRedisClient(),
    concurrency,
  });
  worker.on('error', (error) => console.error(`[resume-worker] ${error.message}`));
  return worker;
}
