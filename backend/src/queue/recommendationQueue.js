import { Queue } from 'bullmq';
import { createRedisClient } from './resumeQueue.js';
import { ServiceUnavailableError } from '../utils/httpErrors.js';

// BullMQ queue for recommendation generation (same Redis as resume parsing).
// Job data holds ids only. The job id (recommendation id + run) makes adding
// the same run twice a no-op, so retries and recovery can't duplicate work.

export const RECOMMENDATION_QUEUE = 'recommendations';
export const RECOMMENDATION_JOB_ATTEMPTS = 4;
const ENQUEUE_TIMEOUT_MS = 5000;

// Exponential backoff with full jitter for temporary failures (5 s base,
// 5 min cap), so retries from many jobs don't line up.
export function jitterBackoff(attemptsMade) {
  const cap = Math.min(5000 * 2 ** Math.max(0, attemptsMade - 1), 5 * 60000);
  return Math.round(1000 + Math.random() * cap);
}

let queue = null;

function getQueue() {
  queue ??= new Queue(RECOMMENDATION_QUEUE, { connection: createRedisClient({ failFast: true }) });
  return queue;
}

async function addToQueue({ recommendationId, run }) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ServiceUnavailableError('Queue did not respond')), ENQUEUE_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      getQueue().add(
        'recommend',
        { recommendationId: String(recommendationId), run },
        {
          jobId: `rec-${recommendationId}-${run}`,
          attempts: RECOMMENDATION_JOB_ATTEMPTS,
          backoff: { type: 'jitter' },
          removeOnComplete: true,
          removeOnFail: true,
        }
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

let enqueue = addToQueue;

export const enqueueRecommendationJob = (job) => enqueue(job);

// Tests replace the queue with a recorder; returns a function that restores it.
export function setRecommendationEnqueuer(fn) {
  enqueue = fn;
  return () => {
    enqueue = addToQueue;
  };
}

export async function closeRecommendationQueue() {
  if (queue) await queue.close();
  queue = null;
}
