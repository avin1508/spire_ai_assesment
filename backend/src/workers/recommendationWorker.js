import { UnrecoverableError, Worker } from 'bullmq';
import { Job } from '../models/job.model.js';
import { FIT_LABELS, Recommendation } from '../models/recommendation.model.js';
import { RECOMMENDATION_QUEUE, jitterBackoff } from '../queue/recommendationQueue.js';
import { createRedisClient } from '../queue/resumeQueue.js';
import { selectCandidates } from '../services/jobMatching.js';
import { buildRankingPrompt } from '../services/gemini.js';
import { estimateTokens } from '../services/geminiQuota.js';
import { ResumeProcessingError, resumeError } from '../services/resumeErrors.js';

// Generates one recommendation run:
//   select candidate jobs (selecting_jobs) → shared quota check → Gemini
//   ranks them (ranking) → validate → completed.
// Quota problems (no quota slot, circuit open, 429) defer the work: the
// record becomes "deferred" with nextAttemptAt, the job ends, and the
// worker's maintenance re-queues it when due. Unranked candidates are never
// saved as results. A run that is no longer current (superseded, re-run or
// already finished) is skipped, so stale work can't overwrite newer results.

export const MAX_RESULTS = 15;
export const MIN_RESULTS = 5;
export const MAX_DEFERRAL_MS = 48 * 3600000;

const JOB_FIELDS = { _id: 0, jobId: 1, title: 1, category: 1, experience: 1, jobType: 1, city: 1, state: 1, requiredSkills: 1, postedAt: 1 };

const clean = (value, max) =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

// Model output → items. Only candidate job ids, each once, valid labels; at
// least MIN_RESULTS (or all candidates if fewer). Skills come from our own
// comparison, never from the model.
export function validateRankings(raw, candidates) {
  const byId = new Map(candidates.map((candidate) => [candidate.job.jobId, candidate]));
  const rankings = Array.isArray(raw?.rankings) ? raw.rankings : null;
  if (!rankings) throw resumeError('invalid_output');
  const seen = new Set();
  const items = [];
  for (const entry of rankings) {
    const candidate = byId.get(entry?.jobId);
    if (!candidate || seen.has(entry.jobId) || !FIT_LABELS.includes(entry.fitLabel)) continue;
    seen.add(entry.jobId);
    items.push({
      jobId: entry.jobId,
      rank: items.length + 1,
      fitLabel: entry.fitLabel,
      reason: clean(entry.reason, 200),
      matchedSkills: candidate.matchedSkills,
      gapSkills: candidate.gapSkills,
    });
    if (items.length >= MAX_RESULTS) break;
  }
  if (items.length < Math.min(MIN_RESULTS, candidates.length)) throw resumeError('invalid_output');
  return items;
}

const QUOTA_MESSAGES = {
  quota_daily: "Our AI is at today's usage limit. Your recommendations will be ready after it resets.",
  quota_rate: "High demand right now. We'll finish your recommendations shortly.",
};

export function createRecommendationProcessor({ rankJobs, quota, now = () => Date.now() }) {
  return async function processRecommendation(job) {
    const { recommendationId, run } = job.data;
    const doc = await Recommendation.findById(recommendationId);
    if (!doc || doc.run !== run || !['queued', 'processing'].includes(doc.status)) return { skipped: true };

    const active = { _id: doc._id, run, status: { $in: ['queued', 'processing'] } };
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts?.attempts ?? 1;

    // Defers the run (quota); fails it once deferral has lasted too long.
    const defer = async (until, code) => {
      const since = doc.deferredSince?.getTime() ?? now();
      if (now() - since > MAX_DEFERRAL_MS) {
        await Recommendation.updateOne(active, {
          $set: {
            status: 'failed',
            stage: null,
            error: { code: 'quota_exhausted', message: 'Recommendations could not be generated in time. Please try again.', retryable: true },
          },
        });
        return { failed: true };
      }
      await Recommendation.updateOne(active, {
        $set: {
          status: 'deferred',
          stage: null,
          nextAttemptAt: new Date(Math.max(until, now() + 5000)),
          deferredSince: new Date(since),
          error: { code, message: QUOTA_MESSAGES[code] ?? QUOTA_MESSAGES.quota_rate, retryable: true },
        },
      });
      return { deferred: true };
    };

    const started = await Recommendation.updateOne(active, {
      $set: { status: 'processing', stage: 'selecting_jobs', nextAttemptAt: null },
      $inc: { attempts: 1 },
    });
    if (!started.modifiedCount) return { skipped: true };

    const profile = doc.matchingProfile;
    const jobs = await Job.find({}, JOB_FIELDS).lean();
    const candidates = selectCandidates(profile, jobs);
    if (!candidates.length) {
      await Recommendation.updateOne(active, {
        $set: { status: 'completed', stage: null, items: [], candidateCount: 0, completedAt: new Date(now()), error: null, deferredSince: null },
      });
      return { completed: true, empty: true };
    }

    const compactJobs = candidates.map(({ job: candidate }) => ({
      jobId: candidate.jobId,
      title: candidate.title,
      category: candidate.category,
      experience: candidate.experience,
      jobType: candidate.jobType,
      location: `${candidate.city}, ${candidate.state}`,
      requiredSkills: candidate.requiredSkills,
    }));

    if (quota) {
      const gate = await quota.acquire(estimateTokens(buildRankingPrompt(profile, compactJobs)));
      // A wait of hours means the daily quota; otherwise a short rate pause.
      if (!gate.ok) return defer(gate.retryAt, gate.retryAt - now() > 2 * 3600000 ? 'quota_daily' : 'quota_rate');
    }

    // Still the current run? (superseded while selecting → no Gemini call)
    const stillActive = await Recommendation.updateOne(active, { $set: { stage: 'ranking' } });
    if (!stillActive.matchedCount) return { skipped: true };

    let raw;
    try {
      raw = await rankJobs(profile, compactJobs);
      await quota?.recordSuccess();
    } catch (caught) {
      const error = caught instanceof ResumeProcessingError ? caught : resumeError('processing_failed');
      if (error.code === 'ai_busy') {
        const { openUntil, daily } = (await quota?.recordFailure(error.original ?? error, { rateLimited: true })) ?? {};
        const until = openUntil ?? now() + 60000;
        return defer(until, daily || until - now() > 2 * 3600000 ? 'quota_daily' : 'quota_rate');
      }
      if (error.code === 'ai_unavailable' || error.code === 'ai_timeout') await quota?.recordFailure(error.original ?? error);
      return fail(error);
    }

    let items;
    try {
      items = validateRankings(raw, candidates);
    } catch (error) {
      return fail(error);
    }

    const saved = await Recommendation.updateOne(active, {
      $set: {
        status: 'completed',
        stage: null,
        items,
        candidateCount: candidates.length,
        model: rankJobs.model ?? null,
        completedAt: new Date(now()),
        error: null,
        nextAttemptAt: null,
        deferredSince: null,
      },
    });
    return saved.modifiedCount ? { completed: true } : { skipped: true };

    // Temporary errors are retried by BullMQ (bounded, jittered); the last
    // attempt or a permanent error ends in "failed" with a retry flag.
    async function fail(error) {
      const last = !error.retryable || attempt >= maxAttempts;
      await Recommendation.updateOne(active, {
        $set: last
          ? { status: 'failed', stage: null, error: { code: error.code, message: error.message, retryable: true } }
          : { status: 'queued', stage: null },
      });
      console.warn(`[recommendation-worker] ${recommendationId} attempt ${attempt}/${maxAttempts} failed: ${error.code}`);
      if (!error.retryable) throw new UnrecoverableError(error.code);
      throw error;
    }
  };
}

export function startRecommendationWorker({ rankJobs, quota, concurrency }) {
  const worker = new Worker(RECOMMENDATION_QUEUE, createRecommendationProcessor({ rankJobs, quota }), {
    connection: createRedisClient(),
    concurrency,
    settings: { backoffStrategy: (attemptsMade) => jitterBackoff(attemptsMade) },
  });
  worker.on('error', (error) => console.error(`[recommendation-worker] ${error.message}`));
  return worker;
}
