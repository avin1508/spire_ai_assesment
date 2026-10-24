import mongoose from 'mongoose';
import { OWNER_TYPES } from './resume.model.js';

// The complete professional profile (the app's ProfileConfirm / Profile
// shape) of one owner: a signed-in user, or a guest session before it is
// linked to an account. One document per owner (unique ownerKey). Linking a
// guest to a new account re-keys the guest's document to the user, so the
// profile is moved in one atomic update and never copied.
//
// revision: incremented on every save; a save must name the revision it was
// based on, so an older copy can never overwrite newer data.

export const ENTRY_SOURCES = ['resume', 'manual'];

const experienceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    company: { type: String, required: true },
    startDate: { type: String, required: true }, // YYYY-MM
    endDate: { type: String, default: null }, // YYYY-MM, null = ongoing
    source: { type: String, enum: ENTRY_SOURCES, default: 'resume' },
  },
  { _id: false }
);

const educationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    institution: { type: String, required: true },
    degree: { type: String, default: '' },
    field: { type: String, default: '' },
    startYear: { type: String, default: '' },
    endYear: { type: String, default: '' },
    source: { type: String, enum: ENTRY_SOURCES, default: 'resume' },
  },
  { _id: false }
);

const profileSchema = new mongoose.Schema(
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
    userId: {
      // Set for user profiles only.
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      ref: 'User',
    },

    fullName: { type: String, required: true },
    email: { type: String, default: '' }, // professional email (not the login email)
    countryCode: { type: String, default: '+91' },
    phone: { type: String, default: '' },
    whatsappOptIn: { type: Boolean, default: false },
    currentRole: { type: String, default: '' },
    currentCompany: { type: String, default: '' },
    currentLocation: { type: String, default: '' },
    preferredLocations: { type: [String], default: [] },
    experienceYears: { type: String, default: '' },
    experienceMonths: { type: String, default: '' },
    skills: { type: [String], default: [] },
    experiences: { type: [experienceSchema], default: [] },
    education: { type: [educationSchema], default: [] },

    revision: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

profileSchema.index({ ownerKey: 1 }, { unique: true });

export const Profile = mongoose.models.Profile ?? mongoose.model('Profile', profileSchema);
