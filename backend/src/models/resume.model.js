import mongoose from 'mongoose';

// One uploaded resume and its processing job. The file itself is in GridFS
// (storage/resumeFiles.js); this record holds ownership, file details, the
// processing state and — until the profile is confirmed — the extracted
// profile.
//
// Lifecycle:
//   processing: queued → processing → completed | failed
//   confirmation: pending (confirmedAt null, expiresAt set) → confirmed
//     (confirmedAt set, expiresAt null). Only the newest confirmed resume of
//     an owner is kept; pending ones are deleted by the cleanup after expiry.

export const OWNER_TYPES = ['guest', 'user'];
export const RESUME_KINDS = ['pdf', 'docx'];
export const RESUME_STATUSES = ['queued', 'processing', 'completed', 'failed'];
export const RESUME_STAGES = ['extracting_text', 'analyzing', 'building_profile'];

const errorSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    retryable: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const resumeSchema = new mongoose.Schema(
  {
    // Owner: a guest session (hashed, see routes/resumes.routes.js) or, later,
    // a verified user id. Every query filters on both fields.
    ownerType: {
      type: String,
      required: true,
      enum: OWNER_TYPES,
    },
    ownerKey: {
      type: String,
      required: true,
    },

    // File (stored in GridFS).
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    kind: {
      type: String,
      required: true,
      enum: RESUME_KINDS,
    },
    contentType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
      min: 1,
    },

    // Processing.
    status: {
      type: String,
      required: true,
      enum: RESUME_STATUSES,
      default: 'queued',
    },
    stage: {
      type: String,
      enum: [...RESUME_STAGES, null],
      default: null,
    },
    run: {
      // Incremented by each user retry; part of the queue job id.
      type: Number,
      default: 1,
    },
    attempts: {
      // Processing attempts made so far (including automatic retries).
      type: Number,
      default: 0,
    },
    error: {
      type: errorSchema,
      default: null,
    },
    // Extracted profile (ProfileConfirm shape). Cleared once confirmed.
    profile: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    idempotencyKey: {
      type: String,
      default: undefined,
    },

    // Confirmation.
    confirmedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      // Pending uploads are deleted after this time; null once confirmed.
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Same Idempotency-Key from the same owner → same upload.
resumeSchema.index(
  { ownerKey: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);
// Owner lookups (status, download, confirmed resume).
resumeSchema.index({ ownerKey: 1, confirmedAt: -1 });
// Cleanup of expired pending uploads.
resumeSchema.index({ expiresAt: 1 });

export const Resume = mongoose.models.Resume ?? mongoose.model('Resume', resumeSchema);
