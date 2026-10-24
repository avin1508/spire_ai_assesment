// Recommendation rules on the app side, kept pure so they can be tested
// without React Native.
// (No imports: this file is also loaded by the Node test runner.)

const str = (value) => (typeof value === 'string' ? value.trim() : '');
const list = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];

// The only profile data sent to the server for matching: skills, roles /
// job titles, experience, locations and degree / field. Never the name,
// email, phone, WhatsApp choice, company names or institution names.
export function buildMatchingProfile(profile) {
  if (!profile) return null;
  const matching = {
    skills: list(profile.skills),
    currentRole: str(profile.currentRole),
    experienceTitles: [...new Set((profile.experiences ?? []).map((entry) => str(entry?.title)).filter(Boolean))],
    experienceYears: str(String(profile.experienceYears ?? '')),
    experienceMonths: str(String(profile.experienceMonths ?? '')),
    currentLocation: str(profile.currentLocation),
    preferredLocations: list(profile.preferredLocations),
    education: (profile.education ?? [])
      .map((entry) => ({ degree: str(entry?.degree), field: str(entry?.field) }))
      .filter((entry) => entry.degree || entry.field),
  };
  const usable = matching.skills.length || matching.currentRole || matching.experienceTitles.length;
  return usable ? matching : null;
}

// Changes only when a matching-relevant field changes (so editing a company
// name or dates doesn't trigger new recommendations).
export const matchingProfileKey = (matching) => (matching ? JSON.stringify(matching) : null);

// Server status → app state status.
const STATUS = { completed: 'ready', none: 'none' };

// API response → the Redux recommendations state.
export function recommendationStateFrom(response) {
  return {
    status: STATUS[response.status] ?? response.status, // queued | processing | deferred | failed | ready | none
    recommendationId: response.recommendationId ?? null,
    profileVersion: response.profileVersion ?? null,
    items: response.status === 'completed' ? (response.items ?? []).map(toRecommendedJob) : [],
    nextAttemptAt: response.nextAttemptAt ?? null,
    pollAfterMs: response.pollAfterMs ?? null,
    message: response.error?.message ?? null,
    retryable: Boolean(response.error?.retryable),
  };
}

// Server item (job card + fit fields) → the shape JobCard / Job Details use.
export function toRecommendedJob(item) {
  return {
    ...item,
    id: item.id,
    jobId: item.id,
    company: item.company ?? item.companyName,
    fitLabel: item.fitLabel,
    matchedSkills: item.matchedSkills ?? [],
    gapSkills: item.gapSkills ?? [],
  };
}

export const isInProgress = (status) => status === 'queued' || status === 'processing' || status === 'deferred';

// Delay before the next status check, from the server's hint (2 s while
// working, up to 60 s while deferred); null = stop polling.
export function nextPollDelay(state) {
  if (!isInProgress(state.status)) return null;
  const hint = Number.isFinite(state.pollAfterMs) && state.pollAfterMs > 0 ? state.pollAfterMs : 2000;
  return Math.min(60000, Math.max(1000, hint));
}

// What the Recommended screen shows (RecommendationStatus copy key + text).
export function recommendationView(state, now = Date.now()) {
  switch (state.status) {
    case 'ready':
      return { kind: 'list' };
    case 'deferred': {
      const at = state.nextAttemptAt ? Date.parse(state.nextAttemptAt) : null;
      const minutes = at ? Math.max(1, Math.round((at - now) / 60000)) : null;
      const when = minutes === null ? '' : minutes < 90 ? ` Expected in about ${minutes} min.` : ' Expected after the daily reset.';
      return { kind: 'status', status: 'deferred', message: `${state.message ?? 'High demand right now.'}${when}` };
    }
    case 'failed':
      return { kind: 'status', status: 'error', message: state.message, canRetry: state.retryable };
    case 'error':
      return { kind: 'status', status: 'error', message: state.message, canRetry: true };
    default: // idle | none | queued | processing
      return { kind: 'status', status: 'loading' };
  }
}
