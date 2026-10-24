import mongoose from 'mongoose';

// An account (email + password). The login email is independent of the
// email on the professional profile (models/profile.model.js). The password
// is stored only as a bcrypt hash and is never selected by default.

const userSchema = new mongoose.Schema(
  {
    email: {
      // Normalised (trimmed, lower-case) login email.
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
