import mongoose from 'mongoose';

// A signed-in session. The app holds a random token; only its SHA-256 hash
// is stored, so a database leak doesn't reveal usable tokens. Logout sets
// revokedAt; expired sessions are removed by MongoDB's TTL monitor.

const sessionSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ userId: 1 });
// Deleted by MongoDB shortly after expiry (they are rejected from expiresAt on anyway).
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.models.Session ?? mongoose.model('Session', sessionSchema);
