// Combines a newly extracted (re-uploaded) resume with the existing profile:
//  - basics: extracted values win where present, otherwise existing values stay
//  - skills / preferred locations: union of both (case-insensitive)
//  - experiences / education: the new resume's entries replace the previous
//    resume's entries, while entries the user added or edited by hand
//    (source: 'manual') are kept.
// (No imports: this file is also loaded by the Node test runner.)

const BASIC_FIELDS = [
  'fullName',
  'email',
  'countryCode',
  'phone',
  'currentRole',
  'currentLocation',
  'experienceYears',
  'experienceMonths',
  'currentCompany',
];

const hasValue = (value) => value != null && String(value).trim() !== '';

function unionStrings(...lists) {
  const seen = new Set();
  const result = [];
  lists.flat().forEach((item) => {
    if (typeof item !== 'string' || !item.trim()) return;
    const key = item.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item.trim());
  });
  return result;
}

const fromResume = (entries) => (entries ?? []).map((entry) => ({ ...entry, source: 'resume' }));
const manualOnly = (entries) => (entries ?? []).filter((entry) => entry.source === 'manual');

// New resume entries + kept manual entries. A resume entry the user edited
// keeps its id (and becomes manual), so the user's version wins over the
// re-extracted one with the same id — ids stay unique.
function mergeEntries(existingEntries, extractedEntries) {
  const manual = manualOnly(existingEntries);
  const manualIds = new Set(manual.map((entry) => entry.id));
  const resume = fromResume(extractedEntries).filter((entry) => !manualIds.has(entry.id));
  return [...resume, ...manual];
}

export function mergeExtractedProfile(existing, extracted) {
  if (!extracted) return existing ?? null;
  if (!existing) {
    return {
      ...extracted,
      preferredLocations: unionStrings(extracted.preferredLocations ?? []),
      skills: unionStrings(extracted.skills ?? []),
      experiences: fromResume(extracted.experiences),
      education: fromResume(extracted.education),
    };
  }

  const merged = { ...existing };
  BASIC_FIELDS.forEach((field) => {
    if (hasValue(extracted[field])) merged[field] = extracted[field];
  });
  merged.preferredLocations = unionStrings(
    existing.preferredLocations ?? [],
    extracted.preferredLocations ?? []
  );
  merged.skills = unionStrings(existing.skills ?? [], extracted.skills ?? []);
  merged.experiences = mergeEntries(existing.experiences, extracted.experiences);
  merged.education = mergeEntries(existing.education, extracted.education);
  return merged;
}
