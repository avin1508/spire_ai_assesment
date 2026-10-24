import mongoose from 'mongoose';
import { OWNER_TYPES } from './resume.model.js';

// Job recommendations for one owner and one version of their matching
// profile (services/matchingProfile.js).
//
//   queued → processing → completed
//   processing → queued (temporary error, automatic retry)
//   queued/processing → deferred (Gemini quota / circuit open; nextAttemptAt)
//     → queued again when due
//   → failed (permanent, or retries / deferral time used up; Retry if retryable)
//   any → superseded (a newer profile version was requested)
//
// The owner's current recommendation is the newest non-superseded one by
// requestedAt. Ownership is explicit (ownerType + ownerKey) so signed-in
// users can be supported later without changing this model.

export const RECOMMENDATION_STATUSES = ['queued', 'processing', 'deferred', 'completed', 'failed', 'superseded'];
export const RECOMMENDATION_STAGES = ['selecting_jobs', 'ranking'];
export const FIT_LABELS = ['Excellent Fit', 'Good Fit', 'Average Fit', 'Weak Fit'];

const itemSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
    },
    rank: {
      type: Number,
      required: true,
    },
    fitLabel: {
      type: String,
      required: true,
      enum: FIT_LABELS,
    },
    reason: {
      type: String,
      default: '',
    },
    matchedSkills: {
      type: [String],
      default: [],
    },
    gapSkills: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

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

const recommendationSchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      required: true,
      enum: OWNER_TYPES,
    },
    ownerKey: {
      type: String,
      required: true,
    },
    profileVersion: {
      type: String,
      required: true,
    },
    // Minimal matching data only (no name, contact details, companies or institutions).
    matchingProfile: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    requestedAt: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      required: true,
      enum: RECOMMENDATION_STATUSES,
      default: 'queued',
    },
    stage: {
      type: String,
      enum: [...RECOMMENDATION_STAGES, null],
      default: null,
    },
    run: {
      // Incremented whenever the work is (re)scheduled; part of the queue job id.
      type: Number,
      default: 1,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    nextAttemptAt: {
      type: Date,
      default: null,
    },
    deferredSince: {
      type: Date,
      default: null,
    },
    error: {
      type: errorSchema,
      default: null,
    },

    items: {
      type: [itemSchema],
      default: [],
    },
    candidateCount: {
      type: Number,
      default: 0,
    },
    model: {
      type: String,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    // "Recommendations ready" push notification for this completed run
    // (services/push.service.js). Set once, atomically, before sending, so a
    // retried or repeated completion never notifies twice.
    notification: {
      type: new mongoose.Schema(
        {
          status: { type: String, enum: ['sending', 'sent', 'no_devices', 'failed'], required: true },
          at: { type: Date, required: true },
          sent: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One record per owner and profile version (repeated requests reuse it).
recommendationSchema.index({ ownerKey: 1, profileVersion: 1 }, { unique: true });
// Current recommendation of an owner.
recommendationSchema.index({ ownerKey: 1, requestedAt: -1 });
// Maintenance: due deferred / stuck work.
recommendationSchema.index({ status: 1, nextAttemptAt: 1 });

export const Recommendation =
  mongoose.models.Recommendation ?? mongoose.model('Recommendation', recommendationSchema);
