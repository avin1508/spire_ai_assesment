import { API_BASE_URL, API_TIMEOUT_MS } from '../config/api';
import { ApiError } from './errors';
import { toQueryString } from '../utils/jobQueryParams';

// Client for the backend All Jobs API (backend/src/routes/jobs.routes.js).
// Every function accepts an AbortSignal so superseded requests can be cancelled.

async function getJson(path, params, signal) {
  const query = params ? toQueryString(params) : '';
  const url = `${API_BASE_URL}${path}${query ? `?${query}` : ''}`;

  // Abort on the caller's signal or after API_TIMEOUT_MS, whichever is first.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener?.('abort', onAbort);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (timedOut) throw new ApiError('The server took too long to respond.', { status: 0, code: 'timeout' });
    if (error?.name === 'AbortError') throw error;
    throw new ApiError("Couldn't reach the server. Check your connection.", { status: 0, code: 'network' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body: handled below by status.
  }
  if (!response.ok) {
    throw new ApiError(body?.message || `Request failed (${response.status})`, {
      status: response.status,
      code: body?.error ?? null,
    });
  }
  return body;
}

// One page of job cards: { items, page, limit, total, hasMore }.
export const fetchJobs = (params, { signal } = {}) => getJson('/api/jobs', params, signal);

// Map markers for the visible area: { zoom, mode, total, clusters, points }.
export const fetchJobMap = (params, { signal } = {}) => getJson('/api/jobs/map', params, signal);

// { total, bounds } for the filters.
export const fetchJobSummary = (params, { signal } = {}) => getJson('/api/jobs/summary', params, signal);

// Values and counts per All Filters section: { total, sections }.
export const fetchFilterOptions = (params, { signal } = {}) =>
  getJson('/api/jobs/filter-options', params, signal);

// The full job for Job Details.
export const fetchJob = (jobId, { signal } = {}) =>
  getJson(`/api/jobs/${encodeURIComponent(jobId)}`, null, signal);
