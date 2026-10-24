// Explicit mapping between dataset records, Job documents and the job shape
// the frontend uses today. Pure functions (no database), covered by tests.

import {
  CATEGORIES,
  EXPERIENCE_LEVELS,
  JOB_TYPES,
  SALARY_PERIODS,
} from '../models/job.model.js';

const STRING_FIELDS = [
  'jobId',
  'title',
  'category',
  'companyName',
  'companyIndustry',
  'companyAbout',
  'area',
  'city',
  'state',
  'country',
  'experience',
  'jobType',
  'summary',
];

const LIST_FIELDS = {
  requiredSkills: 1,
  responsibilities: 3,
  requirements: 3,
  qualifications: 1,
};

// Fields written by the previous (120-job) seed that no longer exist.
const LEGACY_FIELDS = ['description'];

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

// Returns a list of problems with one dataset record (empty list = valid).
export function validateSourceJob(job) {
  if (!job || typeof job !== 'object') return ['record is not an object'];
  const errors = [];

  STRING_FIELDS.forEach((field) => {
    if (!isNonEmptyString(job[field])) errors.push(`${field} is missing or empty`);
  });
  if (job.category && !CATEGORIES.includes(job.category)) {
    errors.push(`category "${job.category}" is not supported`);
  }
  if (job.experience && !EXPERIENCE_LEVELS.includes(job.experience)) {
    errors.push(`experience "${job.experience}" is not supported`);
  }
  if (job.jobType && !JOB_TYPES.includes(job.jobType)) {
    errors.push(`jobType "${job.jobType}" is not supported`);
  }
  if (!Number.isFinite(job.latitude) || job.latitude < -90 || job.latitude > 90) {
    errors.push(`latitude ${job.latitude} is not a valid latitude`);
  }
  if (!Number.isFinite(job.longitude) || job.longitude < -180 || job.longitude > 180) {
    errors.push(`longitude ${job.longitude} is not a valid longitude`);
  }
  const salary = job.salary;
  if (
    !salary ||
    !Number.isFinite(salary.min) ||
    !Number.isFinite(salary.max) ||
    salary.min < 0 ||
    salary.max < salary.min ||
    salary.currency !== 'INR' ||
    !SALARY_PERIODS.includes(salary.period)
  ) {
    errors.push('salary must be { min <= max, currency: INR, period: year|month }');
  }
  if (Number.isNaN(new Date(job.postedAt).getTime())) errors.push('postedAt is not a valid date');
  if (typeof job.verified !== 'boolean') errors.push('verified must be true or false');
  Object.entries(LIST_FIELDS).forEach(([field, min]) => {
    const list = job[field];
    if (!Array.isArray(list) || list.length < min || !list.every(isNonEmptyString)) {
      errors.push(`${field} must have at least ${min} non-empty item(s)`);
    }
  });
  if (job.applyUrl !== undefined && !/^https?:\/\/\S+$/.test(job.applyUrl)) {
    errors.push('applyUrl must be an http(s) URL');
  }
  return errors;
}

// Dataset record → Job document fields.
export function toJobDocument(job, { isDemo = true } = {}) {
  const doc = {
    jobId: job.jobId,
    title: job.title.trim(),
    category: job.category,
    companyName: job.companyName.trim(),
    companyIndustry: job.companyIndustry.trim(),
    companyAbout: job.companyAbout.trim(),
    area: job.area.trim(),
    city: job.city.trim(),
    state: job.state.trim(),
    country: job.country.trim(),
    latitude: job.latitude,
    longitude: job.longitude,
    geo: {
      type: 'Point',
      coordinates: [job.longitude, job.latitude],
    },
    experience: job.experience,
    jobType: job.jobType,
    salary: {
      min: job.salary.min,
      max: job.salary.max,
      currency: job.salary.currency,
      period: job.salary.period,
    },
    postedAt: new Date(job.postedAt),
    verified: job.verified,
    requiredSkills: [...job.requiredSkills],
    summary: job.summary,
    responsibilities: [...job.responsibilities],
    requirements: [...job.requirements],
    qualifications: [...job.qualifications],
    niceToHave: [...(job.niceToHave ?? [])],
    isDemo,
  };
  if (isNonEmptyString(job.applyUrl)) doc.applyUrl = job.applyUrl.trim();
  return doc;
}

const trimNumber = (value) => String(Number(value.toFixed(1)));

// { min: 800000, max: 1400000, period: 'year' } → "₹8–14 LPA";
// { min: 15000, max: 25000, period: 'month' } → "₹15k–25k / month".
export function formatSalary({ min, max, period }) {
  if (period === 'month') {
    return `₹${trimNumber(min / 1000)}k–${trimNumber(max / 1000)}k / month`;
  }
  return `₹${trimNumber(min / 100000)}–${trimNumber(max / 100000)} LPA`;
}

// The description text Job Details renders ("## " headings, "- " bullets).
export function composeDescription(doc) {
  const section = (heading, lines) => [`## ${heading}`, ...lines].join('\n');
  const bullets = (items) => items.map((item) => `- ${item}`);

  const parts = [
    section(`About ${doc.companyName}`, [doc.companyAbout]),
    section('The Role', [doc.summary]),
    section("What You'll Do", bullets(doc.responsibilities)),
    section('Requirements', bullets(doc.requirements)),
    section('Qualifications', bullets(doc.qualifications)),
  ];
  if (doc.niceToHave?.length) parts.push(section('Nice to Have', bullets(doc.niceToHave)));
  parts.push(section('Required Skills', [doc.requiredSkills.join(' · ')]));
  if (doc.isDemo) {
    parts.push('This is a sample listing for demonstration purposes, not a live vacancy.');
  }
  return parts.join('\n\n');
}

// Job document → the job shape the frontend uses today (for the future API).
export function toFrontendJob(doc) {
  const job = {
    id: doc.jobId,
    title: doc.title,
    category: doc.category,
    companyName: doc.companyName,
    company: doc.companyName,
    area: doc.area,
    city: doc.city,
    state: doc.state,
    country: doc.country,
    location: `${doc.city}, ${doc.state}`,
    latitude: doc.latitude,
    longitude: doc.longitude,
    experience: doc.experience,
    jobType: doc.jobType,
    postedAt: new Date(doc.postedAt).toISOString(),
    salary: formatSalary(doc.salary),
    verified: doc.verified,
    requiredSkills: [...doc.requiredSkills],
    description: composeDescription(doc),
  };
  if (doc.applyUrl) job.applyUrl = doc.applyUrl;
  return job;
}

// Idempotent upserts keyed on jobId. postedAt and timestamps are set only on
// first insert (run with { timestamps: false }), so re-running doesn't make
// jobs look newly posted and an unchanged re-run reports 0 modified.
// Fields left over from the previous seed format are removed.
export function buildUpsertOperations(docs, now = new Date()) {
  const unset = Object.fromEntries(LEGACY_FIELDS.map((field) => [field, '']));
  return docs.map(({ postedAt, ...fields }) => ({
    updateOne: {
      filter: { jobId: fields.jobId },
      update: {
        $set: fields,
        $setOnInsert: { postedAt, createdAt: now, updatedAt: now },
        $unset: unset,
      },
      upsert: true,
    },
  }));
}
