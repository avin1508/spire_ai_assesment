import 'dotenv/config';
import { connectDB, disconnectDB } from './config/db.js';
import { describeRedisTarget, getRedisUrl } from './config/env.js';
import { createJobRanker, createProfileExtractor } from './services/gemini.js';
import { createQuotaGuard, createRedisQuotaStore } from './services/geminiQuota.js';
import { cleanupResumes, requeueStuckResumes } from './services/resumes.service.js';
import { maintainRecommendations } from './services/recommendations.service.js';
import { createRedisClient } from './queue/resumeQueue.js';
import { startResumeWorker } from './workers/resumeWorker.js';
import { startRecommendationWorker } from './workers/recommendationWorker.js';

// Background worker: resume parsing and recommendation generation (BullMQ),
// both sharing one Gemini quota guard in Redis, plus periodic maintenance.
//   npm run worker   (Docker Compose runs it as the "worker" service)

const CLEANUP_INTERVAL_MS = 5 * 60000;
// Deferred recommendations are resumed within this interval of becoming due.
const RECOMMENDATION_SWEEP_MS = 30000;

async function runCleanup() {
  try {
    const requeued = await requeueStuckResumes();
    if (requeued) console.log(`[cleanup] re-queued ${requeued} stuck upload(s)`);
    const counts = await cleanupResumes();
    if (counts.expired || counts.superseded || counts.orphanFiles) {
      console.log(`[cleanup] removed ${counts.expired} expired, ${counts.superseded} superseded, ${counts.orphanFiles} orphan file(s)`);
    }
  } catch (error) {
    console.error(`[cleanup] failed: ${error.message}`);
  }
}

async function runRecommendationSweep() {
  try {
    const counts = await maintainRecommendations();
    if (counts.resumed || counts.requeued || counts.removed) {
      console.log(`[recommendations] resumed ${counts.resumed}, re-queued ${counts.requeued}, removed ${counts.removed}`);
    }
  } catch (error) {
    console.error(`[recommendations] maintenance failed: ${error.message}`);
  }
}

const positiveInt = (value, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

async function start() {
  let extractProfile;
  let rankJobs;
  try {
    if (!getRedisUrl()) throw new Error('Missing required environment variable REDIS_URL');
    extractProfile = createProfileExtractor(); // validates GEMINI_API_KEY / GEMINI_MODEL
    rankJobs = createJobRanker();
    await connectDB();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const quota = createQuotaGuard({ store: createRedisQuotaStore(createRedisClient()) });
  const { rpm, tpm, dailyBudget } = quota.config;
  console.log(
    `Gemini quota guard: RPM ${rpm ?? 'not set'}, TPM ${tpm ?? 'not set'}, daily budget ${dailyBudget ?? 'not set'} ` +
      '(unset limits are not enforced locally; 429 responses still pause all workers)'
  );

  const resumeWorker = startResumeWorker({ extractProfile, quota });
  const recommendationWorker = startRecommendationWorker({
    rankJobs,
    quota,
    concurrency: positiveInt(process.env.RECOMMENDATION_CONCURRENCY, 1),
  });
  console.log(`Resume + recommendation workers started (${describeRedisTarget(getRedisUrl())})`);

  await runCleanup();
  await runRecommendationSweep();
  const timers = [
    setInterval(runCleanup, CLEANUP_INTERVAL_MS),
    setInterval(runRecommendationSweep, RECOMMENDATION_SWEEP_MS),
  ];

  const stop = async () => {
    timers.forEach(clearInterval);
    await Promise.all([resumeWorker.close(), recommendationWorker.close()]);
    await disconnectDB();
    process.exit(0);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

start();
