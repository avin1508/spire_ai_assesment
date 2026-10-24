import { resumeError } from './resumeErrors.js';

// Validates and normalises Gemini's output into the exact profile shape the
// app's ProfileConfirm form uses. Model output is never trusted: wrong types
// become empty, invalid values are dropped, lists are capped, and entries
// without their required fields are left out (the app's storage would drop
// them anyway). Nothing is invented: unknown values stay "".

const MAX_TEXT = 120;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value, max = MAX_TEXT) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';

function textList(value, { max = 20, maxLength = MAX_TEXT } = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  value.forEach((item) => {
    const clean = text(item, maxLength);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key) || result.length >= max) return;
    seen.add(key);
    result.push(clean);
  });
  return result;
}

const currentYear = () => new Date().getFullYear();
const validYear = (year) => year >= 1950 && year <= currentYear() + 1;

// "YYYY-MM" or "YYYY" (→ "YYYY-01") → "YYYY-MM", else null.
function yearMonth(value) {
  const match = text(value).match(/^(\d{4})(?:-(\d{1,2}))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] === undefined ? 1 : Number(match[2]);
  if (!validYear(year) || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

const yearOnly = (value) => {
  const year = text(value);
  return /^\d{4}$/.test(year) && validYear(Number(year)) ? year : '';
};

function wholeNumber(value, max) {
  const raw = typeof value === 'number' ? String(value) : text(value);
  if (!/^\d{1,2}$/.test(raw)) return '';
  const number = Number(raw);
  return number <= max ? String(number) : '';
}

function experiences(value, idPrefix) {
  if (!Array.isArray(value)) return [];
  const result = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object' || result.length >= 20) return;
    const title = text(entry.title);
    const company = text(entry.company);
    const startDate = yearMonth(entry.startDate);
    const rawEnd = text(entry.endDate).toLowerCase();
    const ongoing = rawEnd === '' || rawEnd === 'present' || rawEnd === 'current' || rawEnd === 'now';
    const endDate = ongoing ? null : yearMonth(entry.endDate);
    if (!title || !company || !startDate) return;
    if (!ongoing && (!endDate || endDate < startDate)) return;
    result.push({ id: `${idPrefix}-exp-${result.length + 1}`, title, company, startDate, endDate });
  });
  return result;
}

function education(value, idPrefix) {
  if (!Array.isArray(value)) return [];
  const result = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object' || result.length >= 10) return;
    const institution = text(entry.institution);
    if (!institution) return;
    result.push({
      id: `${idPrefix}-edu-${result.length + 1}`,
      institution,
      degree: text(entry.degree),
      field: text(entry.field),
      startYear: yearOnly(entry.startYear),
      endYear: yearOnly(entry.endYear),
    });
  });
  return result;
}

// `idPrefix` makes entry ids unique per upload (e.g. the resume id), so they
// never collide with ids of entries the user added or edited by hand.
export function normalizeExtractedProfile(raw, idPrefix) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw resumeError('invalid_output');

  const email = text(raw.email).toLowerCase();
  const phoneDigits = text(raw.phone).replace(/\D/g, '');
  const countryCode = text(raw.countryCode).replace(/\s/g, '');

  const profile = {
    fullName: text(raw.fullName, 100),
    email: EMAIL.test(email) ? email : '',
    countryCode: /^\+\d{1,4}$/.test(countryCode) ? countryCode : '',
    phone: phoneDigits.length >= 7 && phoneDigits.length <= 15 ? phoneDigits : '',
    whatsappOptIn: false,
    currentRole: text(raw.currentRole),
    currentLocation: text(raw.currentLocation),
    preferredLocations: textList(raw.preferredLocations, { max: 10 }),
    experienceYears: wholeNumber(raw.experienceYears, 60),
    experienceMonths: wholeNumber(raw.experienceMonths, 11),
    currentCompany: text(raw.currentCompany),
    skills: textList(raw.skills, { max: 50, maxLength: 60 }),
    experiences: experiences(raw.experiences, idPrefix),
    education: education(raw.education, idPrefix),
  };

  const hasData =
    profile.fullName ||
    profile.email ||
    profile.skills.length > 0 ||
    profile.experiences.length > 0 ||
    profile.education.length > 0;
  if (!hasData) throw resumeError('no_profile_data');
  return profile;
}
