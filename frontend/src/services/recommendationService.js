import { guestRequest } from './guestApi';

// Client for the backend recommendations API
// (backend/src/routes/recommendations.routes.js). Scoped to this guest.

/**
 * Makes sure recommendations exist for this matching profile (see
 * utils/recommendations.js buildMatchingProfile). Same profile again → the
 * existing recommendation; a changed profile → a new one.
 * → { recommendationId, profileVersion, status, nextAttemptAt, error, pollAfterMs, items }
 */
export const ensureRecommendations = (matchingProfile) =>
  guestRequest('/api/recommendations', { method: 'POST', json: { matchingProfile } });

/** Current recommendation status (+ items when completed), or { status: 'none' }. */
export const fetchCurrentRecommendations = ({ signal } = {}) =>
  guestRequest('/api/recommendations/current', { signal });

/** Re-schedules a failed, retryable recommendation. */
export const retryRecommendations = (recommendationId) =>
  guestRequest(`/api/recommendations/${encodeURIComponent(recommendationId)}/retry`, { method: 'POST' });
