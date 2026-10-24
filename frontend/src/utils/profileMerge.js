// Combines a newly extracted (uploaded) resume with the existing profile.
// A new resume replaces what came from the previous resume — it may belong
// to a different person — so nothing from the old resume leaks into the new
// profile (and its recommendations):
//  - skills, current role / company / location and experience duration come
//    from the new resume (empty if it doesn't state them; the user fills them in)
//  - name, email and phone: the new resume's values where present, otherwise
//    the existing ones (the user reviews them on the form)
//  - preferred locations are a preference: kept unless the resume states some
//  - experiences / education: the new resume's entries replace the previous
//    resume's entries, while entries the user added or edited by hand
//    (source: 'manual') are kept.
// (No imports: this file is also loaded by the Node test runner.)

const FROM_RESUME = ['currentRole', 'currentCompany', 'currentLocation', 'experienceYears', 'experienceMonths'];
const CONTACT = ['fullName', 'email', 'countryCode', 'phone'];

const hasValue = (value) => value != null && String(value).trim() !== '';

function uniqueStrings(list) {
  const seen = new Set();
  const result = [];
  (list ?? []).forEach((item) => {
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
      preferredLocations: uniqueStrings(extracted.preferredLocations),
      skills: uniqueStrings(extracted.skills),
      experiences: fromResume(extracted.experiences),
      education: fromResume(extracted.education),
    };
  }

  const merged = { ...existing };
  FROM_RESUME.forEach((field) => {
    merged[field] = hasValue(extracted[field]) ? extracted[field] : '';
  });
  CONTACT.forEach((field) => {
    if (hasValue(extracted[field])) merged[field] = extracted[field];
  });
  merged.skills = uniqueStrings(extracted.skills);
  const preferred = uniqueStrings(extracted.preferredLocations);
  merged.preferredLocations = preferred.length ? preferred : uniqueStrings(existing.preferredLocations);
  merged.experiences = mergeEntries(existing.experiences, extracted.experiences);
  merged.education = mergeEntries(existing.education, extracted.education);
  return merged;
}
