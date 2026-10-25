import { Queue } from 'bullmq';
import { createRedisClient } from './resumeQueue.js';
import { describeRedisTarget, getRedisUrl } from '../config/env.js';

// Diagnostics for the BullMQ queues, to find out why jobs aren't processed
// (no worker running, worker on another Redis, jobs failing…). Logs and the
// /health/queues report contain queue names, job ids, counts and the Redis
// host only — never passwords, file contents or personal data.

export const redisTarget = () => describeRedisTarget(getRedisUrl() ?? '');

export function logQueue(message) {
  console.log(`[queue] ${message}`);
}

// Logs a worker's lifecycle and every job it handles.
export function attachWorkerLogging(worker, label) {
  const started = new Map();
  worker.on('ready', () => logQueue(`${label}: worker connected to ${redisTarget()}, listening on queue "${worker.name}"`));
  worker.on('active', (job) => {
    started.set(job.id, Date.now());
    logQueue(`${label}: job ${job.id} started (attempt ${job.attemptsMade + 1}/${job.opts?.attempts ?? 1})`);
  });
  worker.on('completed', (job) => {
    const ms = Date.now() - (started.get(job.id) ?? Date.now());
    started.delete(job.id);
    logQueue(`${label}: job ${job.id} completed in ${ms} ms`);
  });
  worker.on('failed', (job, error) => {
    started.delete(job?.id);
    logQueue(`${label}: job ${job?.id ?? '?'} failed (attempt ${job?.attemptsMade ?? '?'}): ${error?.message ?? error}`);
  });
  worker.on('stalled', (jobId) => logQueue(`${label}: job ${jobId} stalled (the worker stopped mid-job); it will be retried`));
  worker.on('error', (error) => console.error(`[queue] ${label}: worker error: ${error?.message ?? error}`));
  return worker;
}

const COUNT_TYPES = ['waiting', 'active', 'delayed', 'failed', 'completed'];
const TIMEOUT_MS = 5000;
const queues = new Map();

function queueFor(name) {
  if (!queues.has(name)) queues.set(name, new Queue(name, { connection: createRedisClient({ failFast: true }) }));
  return queues.get(name);
}

function withTimeout(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Redis did not respond')), TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

// → { redis, queues: { [name]: { workers, waiting, active, delayed, failed, completed } | { error } } }
// `workers` = workers currently connected to that queue on this Redis.
export async function queueHealth(names) {
  const report = { redis: redisTarget(), queues: {} };
  for (const name of names) {
    try {
      const queue = queueFor(name);
      const [counts, workers] = await withTimeout(Promise.all([queue.getJobCounts(...COUNT_TYPES), queue.getWorkersCount()]));
      report.queues[name] = { workers, ...counts };
    } catch (error) {
      report.queues[name] = { error: error?.message ?? String(error) };
    }
  }
  return report;
}

// Plain-language hints for the most common problems.
export function queueHints(report) {
  const hints = [];
  Object.entries(report.queues).forEach(([name, q]) => {
    if (q.error) hints.push(`${name}: Redis unreachable from the API (${q.error}).`);
    else if (q.workers === 0 && (q.waiting > 0 || q.delayed > 0)) {
      hints.push(`${name}: ${q.waiting + q.delayed} job(s) waiting but no worker is connected to this Redis — start the worker (node src/worker.js) with the same REDIS_URL.`);
    } else if (q.workers === 0) hints.push(`${name}: no worker connected to this Redis.`);
  });
  return hints;
}
