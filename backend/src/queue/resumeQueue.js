import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { getRedisUrl } from '../config/env.js';
import { ServiceUnavailableError } from '../utils/httpErrors.js';

// BullMQ queue for resume parsing, on the existing Redis (REDIS_URL).
// Job data holds ids and a file reference only — never file bytes.

export const RESUME_QUEUE = 'resume-parse';
export const RESUME_JOB_ATTEMPTS = 3;
const ENQUEUE_TIMEOUT_MS = 5000;

// REDIS_URL → BullMQ (ioredis) connection options.
export function redisConnectionOptions(url = getRedisUrl()) {
  if (!url) throw new ServiceUnavailableError('Resume processing needs Redis (REDIS_URL is not set)');
  const parsed = new URL(url);
  const db = Number(parsed.pathname.replace('/', '') || 0);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(db ? { db } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

// BullMQ needs an ioredis client (constructed here, as required in ESM).
// The queue side doesn't buffer commands while Redis is down, so uploads fail
// fast with 503 instead of waiting.
export function createRedisClient({ failFast = false } = {}) {
  return new Redis({ ...redisConnectionOptions(), ...(failFast ? { enableOfflineQueue: false } : {}) });
}

let queue = null;

function getQueue() {
  queue ??= new Queue(RESUME_QUEUE, { connection: createRedisClient({ failFast: true }) });
  return queue;
}

// Adds the parse job for one upload run. The job id (resume id + run) makes a
// repeated add for the same run a no-op. Fails fast (503) if Redis is down
// instead of waiting for it.
async function addToQueue({ resumeId, fileId, kind, run }) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ServiceUnavailableError('Queue did not respond')), ENQUEUE_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      getQueue().add(
        'parse',
        { resumeId: String(resumeId), fileId: String(fileId), kind },
        {
          jobId: `${resumeId}-${run}`,
          attempts: RESUME_JOB_ATTEMPTS,
          backoff: { type: 'exponential', delay: 5000 },
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

export const enqueueResumeJob = (job) => enqueue(job);

// Tests replace the queue with a recorder; returns a function that restores it.
export function setResumeEnqueuer(fn) {
  enqueue = fn;
  return () => {
    enqueue = addToQueue;
  };
}

export async function closeResumeQueue() {
  if (queue) await queue.close();
  queue = null;
}
