import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Job, CATEGORIES, EXPERIENCE_LEVELS, JOB_TYPES } from '../src/models/job.model.js';
import { EXPECTED_JOB_COUNT, JOBS, buildJobs } from '../src/data/jobs.dataset.js';
import { CITIES } from '../src/data/cities.js';
import { ROLES } from '../src/data/roles.js';
import {
  buildUpsertOperations,
  composeDescription,
  formatSalary,
  toFrontendJob,
  toJobDocument,
  validateSourceJob,
} from '../src/seed/jobTransform.js';
import { prepareDocuments, reconcile } from '../src/scripts/seedJobs.js';
import { buildMongoUri, describeMongoTarget } from '../src/config/env.js';
// Frontend code used to prove compatibility (both files have no imports).
import { parseDescription } from '../../frontend/src/utils/parseDescription.js';
import { validateJobs as validateFrontendJobs } from '../../frontend/src/data/mockJobs.js';

const distanceKm = (lat1, lng1, lat2, lng2) => {
  const rad = (deg) => (deg * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// --- dataset size and uniqueness ---------------------------------------------

test('the dataset has exactly 500 jobs', () => {
  assert.equal(EXPECTED_JOB_COUNT, 500);
  assert.equal(JOBS.length, 500);
  assert.equal(CITIES.reduce((sum, city) => sum + city.jobs, 0), 500);
});

test('jobIds are unique and listings are distinct', () => {
  assert.equal(new Set(JOBS.map((job) => job.jobId)).size, 500);
  assert.equal(new Set(JOBS.map((job) => `${job.title}|${job.companyName}|${job.city}`)).size, 500);
  assert.equal(new Set(JOBS.map((job) => `${job.latitude},${job.longitude}`)).size, 500);
});

test('the dataset is deterministic (same ids and content every build)', () => {
  const now = Date.parse('2026-10-24T00:00:00Z');
  const strip = (jobs) => JSON.stringify(jobs.map(({ postedAt, ...rest }) => rest));
  assert.equal(strip(buildJobs(now)), strip(buildJobs(now + 86400000)));
});

test('existing ids from the 120-job seed are kept (job-<key>-1..12 for the original cities)', () => {
  const ids = new Set(JOBS.map((job) => job.jobId));
  for (const key of ['blr', 'pune', 'chennai', 'hyd', 'mumbai', 'delhi', 'noida', 'ggn', 'kolkata', 'amd']) {
    for (let n = 1; n <= 12; n += 1) assert.ok(ids.has(`job-${key}-${n}`), `missing job-${key}-${n}`);
  }
});

// --- variety -----------------------------------------------------------------------

test('jobs cover every category, experience level and job type', () => {
  for (const [field, values] of [['category', CATEGORIES], ['experience', EXPERIENCE_LEVELS], ['jobType', JOB_TYPES]]) {
    const present = new Set(JOBS.map((job) => job[field]));
    values.forEach((value) => assert.ok(present.has(value), `no job with ${field} = ${value}`));
  }
  assert.ok(new Set(JOBS.map((job) => job.city)).size >= 15);
  assert.ok(new Set(JOBS.map((job) => job.title)).size >= 100);
});

test('descriptions are not copied: every job has a distinct body', () => {
  const bodies = JOBS.map((job) => JSON.stringify([job.summary, job.responsibilities, job.requirements, job.niceToHave]));
  assert.equal(new Set(bodies).size, 500);
});

test('skills and responsibilities match the role template', () => {
  JOBS.forEach((job) => {
    const role = ROLES.find((r) => job.title.includes(r.title) || job.title === r.leadTitle);
    assert.ok(role, `no role template for "${job.title}"`);
    assert.equal(job.category, role.category);
    role.skills.forEach((skill) => assert.ok(job.requiredSkills.includes(skill), `${job.jobId} lacks ${skill}`));
    job.responsibilities.forEach((line) => assert.ok(role.responsibilities.includes(line)));
  });
});

test('salaries rise with seniority and internships pay a monthly stipend', () => {
  const avg = (experience) => {
    const yearly = JOBS.filter((job) => job.experience === experience && job.salary.period === 'year');
    return yearly.reduce((sum, job) => sum + (job.salary.min + job.salary.max) / 2, 0) / yearly.length;
  };
  assert.ok(avg('1-3 years') < avg('2-5 years'));
  assert.ok(avg('2-5 years') < avg('5-8 years'));
  assert.ok(avg('5-8 years') < avg('8-12 years'));
  JOBS.filter((job) => job.jobType === 'Internship').forEach((job) => {
    assert.equal(job.salary.period, 'month');
    assert.equal(job.experience, '0-1 years');
  });
  JOBS.forEach((job) => assert.ok(job.salary.min < job.salary.max));
});

// --- validation and locations ------------------------------------------------------

test('every record passes field checks and Mongoose schema validation', async () => {
  const { docs, invalid } = await prepareDocuments(JOBS);
  assert.deepEqual(invalid, []);
  assert.equal(docs.length, 500);
});

test('coordinates are valid and within 35 km of the stated city', () => {
  JOBS.forEach((job) => {
    const city = CITIES.find((c) => c.city === job.city);
    assert.ok(city, `unknown city ${job.city}`);
    assert.equal(job.state, city.state);
    const km = distanceKm(job.latitude, job.longitude, city.center.latitude, city.center.longitude);
    assert.ok(km <= 35, `${job.jobId} is ${km.toFixed(1)} km from ${job.city}`);
  });
});

test('every business district is in its own city (and not near another)', () => {
  CITIES.forEach((city) => {
    city.areas.forEach((area) => {
      const nearest = CITIES.map((other) => ({
        name: other.city,
        km: distanceKm(area.latitude, area.longitude, other.center.latitude, other.center.longitude),
      })).sort((a, b) => a.km - b.km)[0];
      // NCR cities are close together; Noida/Gurugram/New Delhi districts may sit nearer another NCR centre.
      const ncr = ['New Delhi', 'Noida', 'Gurugram'];
      if (!(ncr.includes(city.city) && ncr.includes(nearest.name))) {
        assert.equal(nearest.name, city.city, `${area.name} is nearest to ${nearest.name}`);
      }
    });
  });
});

test('invalid records are reported, not skipped', async () => {
  const bad = { ...JOBS[0], jobId: 'job-bad-1', latitude: 200, jobType: 'Freelance', salary: { min: 9, max: 1, currency: 'INR', period: 'year' }, responsibilities: [] };
  const errors = validateSourceJob(bad);
  for (const fragment of ['latitude', 'jobType', 'salary', 'responsibilities']) {
    assert.ok(errors.some((e) => e.includes(fragment)), `expected an error about ${fragment}`);
  }
  const { docs, invalid } = await prepareDocuments([JOBS[0], bad, JOBS[0]]);
  assert.equal(docs.length, 1);
  assert.deepEqual(invalid.map((entry) => entry.id), ['job-bad-1', JOBS[0].jobId]);
  assert.ok(invalid[1].errors.includes('duplicate jobId'));
});

test('the schema rejects bad salary ranges, coordinates and enums', async () => {
  const doc = toJobDocument(JOBS[0]);
  await assert.rejects(
    new Job({ ...doc, latitude: 95, category: 'Sales', salary: { ...doc.salary, max: 1 } }).validate(),
    (error) => {
      assert.ok(error.errors.latitude);
      assert.ok(error.errors.category);
      assert.ok(error.errors['salary.max']);
      return true;
    }
  );
  await new Job(doc).validate();
});

// --- frontend compatibility -------------------------------------------------------------

test('converted jobs have the fields the frontend list, map, filters and details use', () => {
  const fields = ['id', 'title', 'company', 'companyName', 'area', 'city', 'state', 'country', 'location', 'latitude', 'longitude', 'experience', 'jobType', 'postedAt', 'salary', 'verified', 'requiredSkills', 'description', 'applyUrl'];
  JOBS.forEach((job) => {
    const out = toFrontendJob(toJobDocument(job));
    fields.forEach((field) => assert.ok(out[field] !== undefined && out[field] !== '', `${out.id} missing ${field}`));
    assert.equal(out.location, `${job.city}, ${job.state}`);
    assert.equal(typeof out.salary, 'string');
  });
});

test("the frontend's own validator accepts all 500 converted jobs", () => {
  assert.equal(validateFrontendJobs(JOBS.map((job) => toFrontendJob(toJobDocument(job)))), true);
});

test('Job Details can render the full description with every section', () => {
  const doc = toJobDocument(JOBS[0]);
  const blocks = parseDescription(composeDescription(doc));
  const headings = blocks.filter((b) => b.type === 'heading').map((b) => b.text);
  assert.deepEqual(headings.slice(0, 5), [`About ${doc.companyName}`, 'The Role', "What You'll Do", 'Requirements', 'Qualifications']);
  const bullets = blocks.filter((b) => b.type === 'bullet').map((b) => b.text);
  [...doc.responsibilities, ...doc.requirements, ...doc.qualifications].forEach((line) => assert.ok(bullets.includes(line)));
});

test('salary text uses the format the cards already show', () => {
  assert.equal(formatSalary({ min: 800000, max: 1400000, period: 'year' }), '₹8–14 LPA');
  assert.equal(formatSalary({ min: 15000, max: 25000, period: 'month' }), '₹15k–25k / month');
});

// --- seeding -------------------------------------------------------------------------

test('upserts are keyed on jobId, keep postedAt on update and remove legacy fields', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const ops = buildUpsertOperations([toJobDocument(JOBS[0])], now);
  const { filter, update, upsert } = ops[0].updateOne;
  assert.equal(upsert, true);
  assert.deepEqual(filter, { jobId: JOBS[0].jobId });
  assert.equal(update.$set.postedAt, undefined);
  assert.deepEqual(Object.keys(update.$setOnInsert).sort(), ['createdAt', 'postedAt', 'updatedAt']);
  assert.deepEqual(update.$unset, { description: '' });
});

test('reconcile reports updates, inserts and untouched records', () => {
  assert.deepEqual(reconcile(['a', 'b', 'x'], ['a', 'b', 'c']), {
    existing: 3,
    toUpdate: 2,
    toInsert: 1,
    untouched: ['x'],
  });
});

// --- credentials -------------------------------------------------------------------

test('the connection URI URL-encodes credentials; log text has no password', () => {
  const config = { username: 'dev user', password: 'p@ss:w/rd#1', clusterUrl: 'cluster0.example.mongodb.net', dbName: 'spire_db' };
  assert.ok(buildMongoUri(config).startsWith('mongodb+srv://dev%20user:p%40ss%3Aw%2Frd%231@cluster0.example.mongodb.net/spire_db?'));
  assert.ok(!describeMongoTarget(config).includes(config.password));
});
