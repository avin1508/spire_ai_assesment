import { API_BASE_URL, API_TIMEOUT_MS } from '../config/api';
import { ApiError } from './errors';
import { getGuestSessionId } from '../storage/guestSession';

// JSON request to the backend on behalf of this guest (X-Guest-Session).
// The server only ever returns this guest's own data. Throws ApiError
// (status 0 = server unreachable / timeout) or AbortError if `signal` aborts.
export async function guestRequest(
  path,
  { method = 'GET', body, json, headers = {}, signal, timeoutMs = API_TIMEOUT_MS } = {}
) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener?.('abort', onAbort);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      body: json !== undefined ? JSON.stringify(json) : body,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        'X-Guest-Session': await getGuestSessionId(),
        ...headers,
      },
    });
  } catch (error) {
    if (timedOut) throw new ApiError('The server took too long to respond.', { status: 0, code: 'timeout' });
    if (error?.name === 'AbortError') throw error;
    throw new ApiError("Couldn't reach the server. Check your connection.", { status: 0, code: 'network' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON body: handled below.
  }
  if (!response.ok) {
    throw new ApiError(data?.message || `Request failed (${response.status})`, {
      status: response.status,
      code: data?.error ?? null,
    });
  }
  return data;
}
