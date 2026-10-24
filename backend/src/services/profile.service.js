import { Profile } from '../models/profile.model.js';
import { findCurrentResume, resumeSummary } from './resumes.service.js';
import { HttpError, ValidationError } from '../utils/httpErrors.js';

// The complete professional profile of an owner (guest or user), stored on
// the server so it survives reinstalls and account switches.
//
//   GET  → { profile | null, revision | null, resume | null }
//   PUT  { profile, baseRevision } → saves only if the stored revision is
//        still `baseRevision` (null = "there is no profile yet"); otherwise
//        409 profile_conflict, so an older copy never overwrites newer data.
//
// The input is rebuilt from an explicit whitelist of the app's profile
// fields (frontend/src/storage/guestSnapshot.js sanitizeProfile); unknown
// fields are dropped and nothing is invented.

const text = (value, max = 120) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';

function textList(value, max, maxLength = 120) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const clean = text(item, maxLength);
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    result.push(clean);
    if (result.length >= max) break;
  }
  return result;
}

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR = /^\d{4}$/;
const source = (value) => (value === 'manual' ? 'manual' : 'resume');
const smallNumber = (value, max) => {
  const raw = typeof value === 'number' ? String(value) : text(value, 3);
  return /^\d{1,2}$/.test(raw) && Number(raw) <= max ? String(Number(raw)) : '';
};

function experiences(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const ids = new Set();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || result.length >= 30) continue;
    const id = text(entry.id, 80);
    const title = text(entry.title);
    const company = text(entry.company);
    const startDate = text(entry.startDate, 7);
    const endDate = entry.endDate == null || entry.endDate === '' ? null : text(entry.endDate, 7);
    if (!id || ids.has(id) || !title || !company || !YEAR_MONTH.test(startDate)) continue;
    if (endDate !== null && !YEAR_MONTH.test(endDate)) continue;
    ids.add(id);
    result.push({ id, title, company, startDate, endDate, source: source(entry.source) });
  }
  return result;
}

function education(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const ids = new Set();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || result.length >= 20) continue;
    const id = text(entry.id, 80);
    const institution = text(entry.institution, 160);
    if (!id || ids.has(id) || !institution) continue;
    const year = (raw) => (YEAR.test(text(raw, 4)) ? text(raw, 4) : '');
    ids.add(id);
    result.push({
      id,
      institution,
      degree: text(entry.degree),
      field: text(entry.field),
      startYear: year(entry.startYear),
      endYear: year(entry.endYear),
      source: source(entry.source),
    });
  }
  return result;
}

export function normalizeProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError([{ param: 'profile', message: 'must be an object' }]);
  }
  const profile = {
    fullName: text(input.fullName, 80),
    email: text(input.email, 254),
    countryCode: /^\+\d{1,4}$/.test(text(input.countryCode, 5)) ? text(input.countryCode, 5) : '+91',
    phone: text(input.phone, 20),
    whatsappOptIn: input.whatsappOptIn === true,
    currentRole: text(input.currentRole),
    currentCompany: text(input.currentCompany),
    currentLocation: text(input.currentLocation),
    preferredLocations: textList(input.preferredLocations, 10),
    experienceYears: smallNumber(input.experienceYears, 60),
    experienceMonths: smallNumber(input.experienceMonths, 11),
    skills: textList(input.skills, 60, 60),
    experiences: experiences(input.experiences),
    education: education(input.education),
  };
  if (!profile.fullName) throw new ValidationError([{ param: 'profile.fullName', message: 'Full name is required' }]);
  return profile;
}

const FIELDS = Object.keys(normalizeProfile({ fullName: 'x' }));

// Stored document → the app's profile shape.
export function toProfile(doc) {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const profile = {};
  FIELDS.forEach((field) => {
    profile[field] = plain[field];
  });
  profile.preferredLocations = [...(plain.preferredLocations ?? [])];
  profile.skills = [...(plain.skills ?? [])];
  profile.experiences = (plain.experiences ?? []).map(({ id, title, company, startDate, endDate, source: from }) => ({
    id, title, company, startDate, endDate: endDate ?? null, source: from,
  }));
  profile.education = (plain.education ?? []).map(({ id, institution, degree, field, startYear, endYear, source: from }) => ({
    id, institution, degree, field, startYear, endYear, source: from,
  }));
  return profile;
}

export async function getProfile(owner) {
  const [doc, resume] = await Promise.all([Profile.findOne({ ownerKey: owner.key }), findCurrentResume(owner.key)]);
  return {
    profile: toProfile(doc),
    revision: doc?.revision ?? null,
    updatedAt: doc?.updatedAt?.toISOString() ?? null,
    resume: resume ? resumeSummary(resume) : null,
  };
}

const conflict = () =>
  new HttpError(409, 'profile_conflict', 'Your profile was changed somewhere else. The latest version has been loaded.');

export async function saveProfile(owner, body) {
  const profile = normalizeProfile(body?.profile);
  const baseRevision = body?.baseRevision ?? null;
  if (baseRevision !== null && !(Number.isInteger(baseRevision) && baseRevision > 0)) {
    throw new ValidationError([{ param: 'baseRevision', message: 'must be a positive integer or null' }]);
  }

  if (baseRevision === null) {
    try {
      await Profile.create({
        ownerType: owner.type,
        ownerKey: owner.key,
        userId: owner.type === 'user' ? owner.userId : null,
        ...profile,
        revision: 1,
      });
    } catch (error) {
      if (error?.code === 11000) throw conflict();
      throw error;
    }
  } else {
    const updated = await Profile.findOneAndUpdate(
      { ownerKey: owner.key, revision: baseRevision },
      { $set: profile, $inc: { revision: 1 } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!updated) throw conflict();
  }
  return getProfile(owner);
}
