import mongoose from 'mongoose';
import { OWNER_TYPES } from './resume.model.js';

// A device that can receive push notifications: its FCM registration token
// and the owner it currently belongs to (a guest session or a user, the same
// ownerKey as resumes and recommendations). One document per token (unique),
// so a device always belongs to exactly one owner: registering it for a new
// owner (sign-in, logout → new guest) moves it, and the previous owner's
// notifications stop reaching it.

const pushDeviceSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ['android'],
    },
    ownerType: {
      type: String,
      required: true,
      enum: OWNER_TYPES,
    },
    ownerKey: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

pushDeviceSchema.index({ token: 1 }, { unique: true });
pushDeviceSchema.index({ ownerKey: 1 });

export const PushDevice = mongoose.models.PushDevice ?? mongoose.model('PushDevice', pushDeviceSchema);
