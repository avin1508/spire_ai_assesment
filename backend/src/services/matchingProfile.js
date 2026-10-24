import { createHash } from 'node:crypto';
import { ValidationError } from '../utils/httpErrors.js';

// The minimal profile used for job matching — the only profile data the
// server keeps. It is rebuilt from an explicit whitelist, so identity data
// (name, email, phone, WhatsApp choice, company or institution names) can
// never be stored even if a client sends it.

const MAX_TEXT = 120;

const text = (value, max = MAX_TEXT) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';

function textList(value, max, maxLength = MAX_TEXT) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const clean = text(item, maxLength);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= max) break;
  }
  return result;
}

function wholeNumber(value, max) {
  const raw = typeof value === 'number' ? String(value) : text(value);
  if (!/^\d{1,2}$/.test(raw)) return null;
  const number = Number(raw);
  return number <= max ? number : null;
}

// Request body → clean matching profile. Throws 400 when it can't be used
// for matching at all (no skills, role or job titles).
export function normalizeMatchingProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError([{ param: 'matchingProfile', message: 'must be an object' }]);
  }
  const profile = {
    skills: textList(input.skills, 50, 60),
    currentRole: text(input.currentRole),
    experienceTitles: textList(input.experienceTitles, 20),
    experienceYears: wholeNumber(input.experienceYears, 60),
    experienceMonths: wholeNumber(input.experienceMonths, 11),
    currentLocation: text(input.currentLocation),
    preferredLocations: textList(input.preferredLocations, 10),
    education: (Array.isArray(input.education) ? input.education : [])
      .map((entry) => ({ degree: text(entry?.degree, 80), field: text(entry?.field, 80) }))
      .filter((entry) => entry.degree || entry.field)
      .slice(0, 5),
  };
  if (!profile.skills.length && !profile.currentRole && !profile.experienceTitles.length) {
    throw new ValidationError([
      { param: 'matchingProfile', message: 'needs at least one skill, a current role or a job title' },
    ]);
  }
  return profile;
}

// Bump when the matching rules change, so results made with the old rules
// are regenerated instead of reused.
export const MATCHING_RULES_VERSION = 2;

// Same matching-relevant content → same version (case and order of list
// items don't matter), so repeated requests reuse one recommendation.
export function matchingProfileVersion(profile) {
  const lower = (list) => list.map((item) => item.toLowerCase()).sort();
  const canonical = {
    rules: MATCHING_RULES_VERSION,
    skills: lower(profile.skills),
    currentRole: profile.currentRole.toLowerCase(),
    experienceTitles: lower(profile.experienceTitles),
    experienceYears: profile.experienceYears,
    experienceMonths: profile.experienceMonths,
    currentLocation: profile.currentLocation.toLowerCase(),
    preferredLocations: lower(profile.preferredLocations),
    education: profile.education
      .map((entry) => `${entry.degree.toLowerCase()}|${entry.field.toLowerCase()}`)
      .sort(),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 32);
}
