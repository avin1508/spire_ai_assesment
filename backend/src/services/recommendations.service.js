import { Job } from '../models/job.model.js';
import { Recommendation } from '../models/recommendation.model.js';
import { CARD_FIELDS, toJobCard } from '../seed/jobTransform.js';
import { enqueueRecommendationJob } from '../queue/recommendationQueue.js';
import { matchingProfileVersion, normalizeMatchingProfile } from './matchingProfile.js';
import { HttpError, NotFoundError } from '../utils/httpErrors.js';

// Recommendation requests, status, retry and maintenance. `owner` is
// { type, key } from middleware/owner.js; every query filters on owner.key,
// so another owner's recommendation is always a 404.

// A completed result for the same profile is reused for this long.
export const FRESH_MS = Number(process.env.RECOMMENDATION_FRESH_HOURS || 24) * 3600000;
// New recommendation runs allowed per owner per hour.
export const MAX_RUNS_PER_HOUR = 20;
// Inactive owners' recommendations (and matching profiles) are deleted after this.
export const RETENTION_MS = 30 * 24 * 3600000;

const ACTIVE = ['queued', 'processing', 'deferred'];
const CARD_PROJECTION = Object.fromEntries([...CARD_FIELDS.map((field) => [field, 1]), ['_id', 0]]);
const isObjectId = (id) => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);

function pollAfterMs(doc, now) {
  if (doc.status === 'queued' || doc.status === 'processing') return 2000;
  if (doc.status === 'deferred') {
    const wait = (doc.nextAttemptAt?.getTime() ?? now) - now;
    return Math.min(60000, Math.max(5000, wait));
  }
  return null;
}

// Current state for the app; `items` only when completed, joined with the
// live job data (jobs that no longer exist are left out).
async function toResponse(doc, now = Date.now()) {
  let items = [];
  if (doc.status === 'completed' && doc.items.length) {
    const jobs = await Job.find({ jobId: { $in: doc.items.map((item) => item.jobId) } }, CARD_PROJECTION).lean();
    const byId = new Map(jobs.map((job) => [job.jobId, job]));
    items = doc.items
      .filter((item) => byId.has(item.jobId))
      .map((item) => ({
        ...toJobCard(byId.get(item.jobId)),
        rank: item.rank,
        fitLabel: item.fitLabel,
        reason: item.reason,
        matchedSkills: [...item.matchedSkills],
        gapSkills: [...item.gapSkills],
      }));
  }
  return {
    recommendationId: String(doc._id),
    profileVersion: doc.profileVersion,
    status: doc.status,
    stage: doc.status === 'processing' ? doc.stage : null,
    nextAttemptAt: doc.status === 'deferred' && doc.nextAttemptAt ? doc.nextAttemptAt.toISOString() : null,
    error:
      doc.error && (doc.status === 'failed' || doc.status === 'deferred')
        ? { code: doc.error.code, message: doc.error.message, retryable: doc.error.retryable }
        : null,
    pollAfterMs: pollAfterMs(doc, now),
    generatedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
    items,
  };
}

async function schedule(doc) {
  try {
    await enqueueRecommendationJob({ recommendationId: doc._id, run: doc.run });
  } catch (error) {
    // The record stays "queued"; the worker's maintenance re-queues it.
    console.warn(`[recommendations] could not queue ${doc._id}: ${error.message}`);
  }
}

async function supersedeOthers(ownerKey, keepId) {
  await Recommendation.updateMany(
    { ownerKey, _id: { $ne: keepId }, status: { $ne: 'superseded' } },
    { $set: { status: 'superseded', stage: null } }
  );
}

async function assertRunAllowed(ownerKey, now) {
  const recent = await Recommendation.countDocuments({ ownerKey, updatedAt: { $gt: new Date(now - 3600000) } });
  if (recent >= MAX_RUNS_PER_HOUR) {
    throw new HttpError(429, 'too_many_requests', 'Too many recommendation requests. Please try again later.');
  }
}

// POST /api/recommendations: makes sure there are recommendations for this
// matching profile. Same profile again → the existing record (no new work);
// a different profile → a new record, and older ones are superseded.
export async function ensureRecommendation({ owner, matchingProfile }, now = Date.now()) {
  const profile = normalizeMatchingProfile(matchingProfile);
  const profileVersion = matchingProfileVersion(profile);
  const requestedAt = new Date(now);

  let doc = await Recommendation.findOne({ ownerKey: owner.key, profileVersion });
  if (doc) {
    // A finished result for this exact profile is reused while fresh, even if
    // it was superseded in between (profile changed and changed back).
    const freshResult =
      (doc.status === 'completed' || doc.status === 'superseded') &&
      doc.completedAt &&
      now - doc.completedAt.getTime() < FRESH_MS;
    const reuse = freshResult || ACTIVE.includes(doc.status) || doc.status === 'failed';
    if (reuse) {
      if (freshResult) doc.status = 'completed';
      doc.requestedAt = requestedAt;
      await doc.save();
      await supersedeOthers(owner.key, doc._id);
      return { created: false, recommendation: await toResponse(doc, now) };
    }
    // Superseded earlier, or completed too long ago: generate again.
    await assertRunAllowed(owner.key, now);
    Object.assign(doc, {
      matchingProfile: profile,
      requestedAt,
      status: 'queued',
      stage: null,
      run: doc.run + 1,
      attempts: 0,
      nextAttemptAt: null,
      deferredSince: null,
      error: null,
      items: [],
      candidateCount: 0,
      completedAt: null,
    });
    await doc.save();
  } else {
    await assertRunAllowed(owner.key, now);
    try {
      doc = await Recommendation.create({
        ownerType: owner.type,
        ownerKey: owner.key,
        profileVersion,
        matchingProfile: profile,
        requestedAt,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      // A parallel request created it first: use that one.
      return ensureRecommendation({ owner, matchingProfile }, now);
    }
  }
  await supersedeOthers(owner.key, doc._id);
  await schedule(doc);
  return { created: true, recommendation: await toResponse(doc, now) };
}

// GET /api/recommendations/current
export async function getCurrentRecommendation({ owner }, now = Date.now()) {
  const doc = await Recommendation.findOne({ ownerKey: owner.key, status: { $ne: 'superseded' } }).sort({
    requestedAt: -1,
  });
  return doc ? toResponse(doc, now) : { status: 'none', items: [], pollAfterMs: null };
}

// POST /api/recommendations/:id/retry: re-schedules a failed, retryable run.
export async function retryRecommendation({ owner, recommendationId }, now = Date.now()) {
  if (!isObjectId(recommendationId)) throw new NotFoundError('Recommendation not found');
  const doc = await Recommendation.findOne({ _id: recommendationId, ownerKey: owner.key });
  if (!doc) throw new NotFoundError('Recommendation not found');
  if (doc.status !== 'failed') return toResponse(doc, now);
  if (!doc.error?.retryable) {
    throw new HttpError(409, 'not_retryable', doc.error?.message ?? 'These recommendations cannot be retried.');
  }
  const updated = await Recommendation.findOneAndUpdate(
    { _id: doc._id, ownerKey: owner.key, status: 'failed' },
    {
      $set: { status: 'queued', stage: null, error: null, attempts: 0, deferredSince: null, nextAttemptAt: null },
      $inc: { run: 1 },
    },
    { new: true }
  );
  if (!updated) return toResponse(await Recommendation.findById(doc._id), now);
  await schedule(updated);
  return toResponse(updated, now);
}

// Worker maintenance: re-queues deferred work that is due and work whose
// queue job may have been lost; deletes superseded and long-inactive records.
export async function maintainRecommendations(now = Date.now()) {
  const counts = { resumed: 0, requeued: 0, removed: 0 };

  const due = await Recommendation.find({ status: 'deferred', nextAttemptAt: { $lte: new Date(now) } });
  for (const doc of due) {
    const updated = await Recommendation.findOneAndUpdate(
      { _id: doc._id, status: 'deferred', run: doc.run },
      { $set: { status: 'queued', nextAttemptAt: null }, $inc: { run: 1 } },
      { new: true }
    );
    if (updated) {
      await schedule(updated);
      counts.resumed += 1;
    }
  }

  // Same run id: a no-op if the queue still has the job.
  const stuck = await Recommendation.find({
    $or: [
      { status: 'queued', updatedAt: { $lt: new Date(now - 2 * 60000) } },
      { status: 'processing', updatedAt: { $lt: new Date(now - 10 * 60000) } },
    ],
  });
  for (const doc of stuck) {
    await schedule(doc);
    counts.requeued += 1;
  }

  const removed = await Recommendation.deleteMany({
    $or: [
      { status: 'superseded', updatedAt: { $lt: new Date(now - 3600000) } },
      { requestedAt: { $lt: new Date(now - RETENTION_MS) } },
    ],
  });
  counts.removed = removed.deletedCount ?? 0;
  return counts;
}
