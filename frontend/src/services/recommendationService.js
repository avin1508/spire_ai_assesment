import { apiRequest } from './api';

// Client for the backend recommendations API
// (backend/src/routes/recommendations.routes.js). Scoped to the owner
// (signed-in user or guest, see api.js).

/**
 * Makes sure recommendations exist for this matching profile (see
 * utils/recommendations.js buildMatchingProfile). Same profile again → the
 * existing recommendation; a changed profile → a new one. `auth` pins the
 * owner the profile belongs to.
 * → { recommendationId, profileVersion, status, nextAttemptAt, error, pollAfterMs, items }
 */
export const ensureRecommendations = (matchingProfile, auth) =>
  apiRequest('/api/recommendations', { method: 'POST', json: { matchingProfile }, auth });

/** Current recommendation status (+ items when completed), or { status: 'none' }. */
export const fetchCurrentRecommendations = ({ signal } = {}) =>
  apiRequest('/api/recommendations/current', { signal });

/** Re-schedules a failed, retryable recommendation. */
export const retryRecommendations = (recommendationId) =>
  apiRequest(`/api/recommendations/${encodeURIComponent(recommendationId)}/retry`, { method: 'POST' });
