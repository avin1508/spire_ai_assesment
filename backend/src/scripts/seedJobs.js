// Seeds the 500 demonstration jobs (src/data/jobs.dataset.js) into MongoDB.
// Safe to re-run: upserts by jobId, never deletes or drops anything.
//
//   npm run seed:jobs             # reconcile + write
//   npm run seed:jobs -- --dry-run  # reconcile report only, no writes
//
// Exits non-zero (without writing) if the dataset size is wrong or any record
// is invalid.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Job } from '../models/job.model.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { EXPECTED_JOB_COUNT, JOBS } from '../data/jobs.dataset.js';
import { buildUpsertOperations, toJobDocument, validateSourceJob } from '../seed/jobTransform.js';

// Validates every record (field checks + Mongoose schema validation).
// → { docs, invalid: [{ id, errors }] }
export async function prepareDocuments(sourceJobs) {
  const docs = [];
  const invalid = [];
  const seenIds = new Set();

  for (const [index, job] of sourceJobs.entries()) {
    const id = job?.jobId ?? `#${index}`;
    const errors = validateSourceJob(job);
    if (job?.jobId && seenIds.has(job.jobId)) errors.push('duplicate jobId');
    seenIds.add(job?.jobId);

    if (errors.length === 0) {
      const doc = toJobDocument(job);
      try {
        await new Job(doc).validate();
        docs.push(doc);
      } catch (error) {
        errors.push(...Object.values(error.errors ?? { error }).map((e) => e.message));
      }
    }
    if (errors.length > 0) invalid.push({ id, errors });
  }
  return { docs, invalid };
}

// How the documents already in the collection relate to the dataset.
export function reconcile(existingIds, datasetIds) {
  const dataset = new Set(datasetIds);
  const existing = new Set(existingIds);
  return {
    existing: existing.size,
    toUpdate: [...existing].filter((id) => dataset.has(id)).length,
    toInsert: [...dataset].filter((id) => !existing.has(id)).length,
    untouched: [...existing].filter((id) => !dataset.has(id)),
  };
}

async function main({ dryRun }) {
  console.log(`Source: src/data/jobs.dataset.js — ${JOBS.length} jobs`);
  if (JOBS.length !== EXPECTED_JOB_COUNT) {
    throw new Error(`Expected ${EXPECTED_JOB_COUNT} jobs, found ${JOBS.length}. Nothing written.`);
  }

  const { docs, invalid } = await prepareDocuments(JOBS);
  if (invalid.length > 0) {
    invalid.forEach(({ id, errors }) => console.error(`  invalid ${id}: ${errors.join('; ')}`));
    throw new Error(`${invalid.length} invalid record(s). Nothing written.`);
  }

  await connectDB();

  const existingIds = await Job.distinct('jobId');
  const plan = reconcile(existingIds, docs.map((doc) => doc.jobId));
  console.log('Reconciliation');
  console.log(`  already in database: ${plan.existing}`);
  console.log(`  will update in place: ${plan.toUpdate} (same jobId; postedAt kept)`);
  console.log(`  will insert:          ${plan.toInsert}`);
  console.log(`  not in dataset (left untouched): ${plan.untouched.length}`);
  if (plan.untouched.length > 0) console.log(`    ${plan.untouched.slice(0, 10).join(', ')}…`);

  if (dryRun) {
    console.log('Dry run: nothing written.');
    return;
  }

  await Job.createIndexes(); // non-destructive: only creates missing indexes
  const result = await Job.bulkWrite(buildUpsertOperations(docs), {
    ordered: false,
    timestamps: false,
  });
  const total = await Job.countDocuments();
  const demo = await Job.countDocuments({ isDemo: true });

  console.log('Seed summary');
  console.log(`  source jobs:      ${JOBS.length}`);
  console.log(`  invalid:          ${invalid.length}`);
  console.log(`  inserted:         ${result.upsertedCount}`);
  console.log(`  updated:          ${result.modifiedCount}`);
  console.log(`  unchanged:        ${result.matchedCount - result.modifiedCount}`);
  console.log(`  jobs in database: ${total} (demo: ${demo})`);
}

// Run only when executed directly (tests import the helpers above).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main({ dryRun: process.argv.includes('--dry-run') })
    .catch((error) => {
      console.error(`Seed failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(disconnectDB);
}
