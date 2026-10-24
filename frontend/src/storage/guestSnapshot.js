// Serialises the guest's profile + resume metadata for storage and validates
// it when read back, so a malformed or partial record can't crash the app.
// (No imports: this file is also loaded by the Node test runner.)

export const SNAPSHOT_VERSION = 1;

const str = (value) => (typeof value === 'string' ? value : '');
const strList = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
const source = (value) => (value === 'manual' ? 'manual' : 'resume');

function sanitizeExperience(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (!str(entry.id) || !str(entry.title) || !str(entry.company) || !str(entry.startDate)) return null;
  return {
    id: entry.id,
    title: entry.title,
    company: entry.company,
    startDate: entry.startDate,
    endDate: typeof entry.endDate === 'string' ? entry.endDate : null,
    source: source(entry.source),
  };
}

function sanitizeEducation(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (!str(entry.id) || !str(entry.institution)) return null;
  return {
    id: entry.id,
    institution: entry.institution,
    degree: str(entry.degree),
    field: str(entry.field),
    startYear: str(entry.startYear),
    endYear: str(entry.endYear),
    source: source(entry.source),
  };
}

// Returns a clean profile object, or null if `profile` isn't usable.
export function sanitizeProfile(profile) {
  if (!profile || typeof profile !== 'object' || !str(profile.fullName)) return null;
  return {
    fullName: str(profile.fullName),
    email: str(profile.email),
    countryCode: str(profile.countryCode) || '+91',
    phone: str(profile.phone),
    whatsappOptIn: profile.whatsappOptIn === true,
    currentRole: str(profile.currentRole),
    currentLocation: str(profile.currentLocation),
    preferredLocations: strList(profile.preferredLocations),
    experienceYears: String(profile.experienceYears ?? ''),
    experienceMonths: String(profile.experienceMonths ?? ''),
    currentCompany: str(profile.currentCompany),
    skills: strList(profile.skills),
    experiences: (Array.isArray(profile.experiences) ? profile.experiences : [])
      .map(sanitizeExperience)
      .filter(Boolean),
    education: (Array.isArray(profile.education) ? profile.education : [])
      .map(sanitizeEducation)
      .filter(Boolean),
  };
}

// Resume metadata only. The file is stored on the server (resumeId); older
// snapshots point at a device copy (uri) instead and are kept as they are.
export function sanitizeResume(resume) {
  if (!resume || typeof resume !== 'object' || !str(resume.name)) return null;
  if (!str(resume.resumeId) && !str(resume.uri)) return null;
  const clean = {
    name: resume.name,
    size: typeof resume.size === 'number' ? resume.size : null,
    mimeType: str(resume.mimeType) || null,
  };
  if (str(resume.resumeId)) {
    clean.resumeId = resume.resumeId;
    clean.kind = resume.kind === 'pdf' || resume.kind === 'docx' ? resume.kind : null;
  } else {
    clean.uri = resume.uri;
  }
  return clean;
}

// Server sync state of the profile: the server revision it is based on and
// whether it has changes the server hasn't confirmed yet.
export function sanitizeSync(sync) {
  const revision = Number.isInteger(sync?.revision) && sync.revision > 0 ? sync.revision : null;
  return { revision, dirty: sync?.dirty === true };
}

// Used for the guest's and for each account's data (separate keys, see keys.js).
export function serializeGuestData({ profile, resume, sync }, now = Date.now()) {
  return JSON.stringify({
    version: SNAPSHOT_VERSION,
    savedAt: now,
    profile: sanitizeProfile(profile),
    resume: sanitizeResume(resume),
    sync: sanitizeSync(sync),
  });
}

// → { ok: true, data: { profile, resume, sync } } or { ok: false, reason }
// (Snapshots saved before sync existed read as revision null / not dirty.)
export function parseGuestData(raw) {
  if (raw == null) return { ok: true, data: { profile: null, resume: null, sync: sanitizeSync(null) } };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'not-an-object' };
  if (parsed.version !== SNAPSHOT_VERSION) return { ok: false, reason: 'unknown-version' };
  return {
    ok: true,
    data: {
      profile: sanitizeProfile(parsed.profile),
      resume: sanitizeResume(parsed.resume),
      sync: sanitizeSync(parsed.sync),
    },
  };
}
