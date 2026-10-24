import mongoose from 'mongoose';

// Records that a guest session was linked to an account, and the progress
// of that link. One document per guest (unique guestKey), so a guest
// session can belong to one account only. Every step is idempotent and its
// decision is saved before it runs, so a retry after a partial failure
// finishes the same plan (see services/guestLink.service.js).

export const LINK_PROFILE_RESULTS = ['linked', 'kept', 'none'];
export const LINK_RESUME_RESULTS = ['linked', 'retained', 'none'];

const guestLinkSchema = new mongoose.Schema(
  {
    guestKey: {
      // Hashed guest session (middleware/owner.js guestOwnerKey).
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    status: {
      type: String,
      required: true,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
    },
    // Decided once, on the first attempt.
    accountHadProfile: {
      type: Boolean,
      required: true,
    },
    profile: {
      type: String,
      enum: [...LINK_PROFILE_RESULTS, null],
      default: null,
    },
    resume: {
      type: String,
      enum: [...LINK_RESUME_RESULTS, null],
      default: null,
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    recommendationIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

guestLinkSchema.index({ guestKey: 1 }, { unique: true });

export const GuestLink = mongoose.models.GuestLink ?? mongoose.model('GuestLink', guestLinkSchema);
