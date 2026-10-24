import 'dotenv/config';
import { connectDB, disconnectDB } from './config/db.js';
import { describeRedisTarget, getRedisUrl } from './config/env.js';
import { createProfileExtractor } from './services/gemini.js';
import { cleanupResumes, requeueStuckResumes } from './services/resumes.service.js';
import { startResumeWorker } from './workers/resumeWorker.js';

// Background worker: processes resume-parse jobs from Redis (BullMQ) and
// periodically cleans up expired / superseded resume files.
//   npm run worker   (Docker Compose runs it as the "worker" service)

const CLEANUP_INTERVAL_MS = 5 * 60000;

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

async function start() {
  let extractProfile;
  try {
    if (!getRedisUrl()) throw new Error('Missing required environment variable REDIS_URL');
    extractProfile = createProfileExtractor(); // validates GEMINI_API_KEY / GEMINI_MODEL
    await connectDB();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const worker = startResumeWorker({ extractProfile });
  console.log(`Resume worker started (${describeRedisTarget(getRedisUrl())})`);

  await runCleanup();
  const timer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);

  const stop = async () => {
    clearInterval(timer);
    await worker.close();
    await disconnectDB();
    process.exit(0);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

start();
