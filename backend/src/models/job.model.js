import mongoose from 'mongoose';

// Job listing. Covers everything the app uses for job listing, search,
// All Filters, sorting, the map and Job Details. The frontend's `id`,
// `company`, `location`, `salary` (display text) and `description` (formatted
// text) are produced from these fields by toFrontendJob() in
// seed/jobTransform.js rather than stored twice.

export const CATEGORIES = [
  'Frontend',
  'Backend',
  'Full Stack',
  'Mobile',
  'Data',
  'Cloud & DevOps',
  'QA & Testing',
];

// Values used by the Experience filter (shown exactly as stored).
export const EXPERIENCE_LEVELS = [
  '0-1 years',
  '1-3 years',
  '2-5 years',
  '3-6 years',
  '5-8 years',
  '8-12 years',
];

export const JOB_TYPES = ['Full-time', 'Contract', 'Internship'];

export const SALARY_PERIODS = ['year', 'month'];

// Array of trimmed strings that must not be empty (and has at least `min` items).
const stringList = (label, min = 1) => ({
  type: [
    {
      type: String,
      trim: true,
    },
  ],
  validate: [
    {
      validator: (items) => Array.isArray(items) && items.length >= min,
      message: `${label} needs at least ${min} item(s)`,
    },
    {
      validator: (items) => items.every((item) => typeof item === 'string' && item.length > 0),
      message: `${label} cannot contain empty values`,
    },
  ],
});

const salarySchema = new mongoose.Schema(
  {
    min: {
      type: Number,
      required: true,
      min: 0,
    },
    max: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator(value) {
          return value >= this.min;
        },
        message: 'salary.max must be greater than or equal to salary.min',
      },
    },
    currency: {
      type: String,
      required: true,
      enum: ['INR'],
      default: 'INR',
    },
    period: {
      type: String,
      required: true,
      enum: SALARY_PERIODS,
    },
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    // Stable public id (e.g. "job-blr-1"): the seed upsert key and the app's job id.
    jobId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^job-[a-z]+-\d+$/, 'jobId must look like job-<city>-<number>'],
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    category: {
      type: String,
      required: true,
      enum: CATEGORIES,
    },

    // Company
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    companyIndustry: {
      type: String,
      required: true,
      trim: true,
    },
    companyAbout: {
      type: String,
      required: true,
      trim: true,
    },

    // Location
    area: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
      default: 'India',
    },
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    // Same point as GeoJSON, for the "Distance (Nearest First)" sort.
    geo: {
      type: {
        type: String,
        required: true,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: {
          validator: (value) => Array.isArray(value) && value.length === 2,
          message: 'geo.coordinates must be [longitude, latitude]',
        },
      },
    },

    // Role details
    experience: {
      type: String,
      required: true,
      enum: EXPERIENCE_LEVELS,
    },
    jobType: {
      type: String,
      required: true,
      enum: JOB_TYPES,
    },
    salary: {
      type: salarySchema,
      required: true,
    },
    postedAt: {
      type: Date,
      required: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    requiredSkills: stringList('requiredSkills', 1),

    // Description sections (Job Details)
    summary: {
      type: String,
      required: true,
      trim: true,
    },
    responsibilities: stringList('responsibilities', 3),
    requirements: stringList('requirements', 3),
    qualifications: stringList('qualifications', 1),
    niceToHave: {
      type: [
        {
          type: String,
          trim: true,
        },
      ],
      default: [],
    },
    applyUrl: {
      type: String,
      trim: true,
      match: [/^https?:\/\/\S+$/, 'applyUrl must be an http(s) URL'],
    },

    // Seeded demonstration listing (not a real vacancy).
    isDemo: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for the existing query patterns.
jobSchema.index({ postedAt: -1 }); // newest-first sort, aging / last-24h filters
jobSchema.index({ city: 1 }); // Location filter
jobSchema.index({ companyName: 1 }); // Company filter, companies sheet
jobSchema.index({ geo: '2dsphere' }); // distance sort

export const Job = mongoose.models.Job ?? mongoose.model('Job', jobSchema);
