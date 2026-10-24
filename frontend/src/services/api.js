import { API_BASE_URL, API_TIMEOUT_MS } from '../config/api';
import { ApiError } from './errors';
import { getGuestSessionId } from '../storage/guestSession';
import { getAuthSession, getAuthToken } from '../storage/authSession';

// JSON requests to the backend. Identity (`auth`):
//   undefined          → the current one: the session token when signed in,
//                        otherwise this guest (X-Guest-Session)
//   { token }          → that session only
//   { guestId }        → that guest only
//   { token, guestId } → both (linking a guest to the account)
//   'none'             → no identity (register / login)
// Owner-specific work captures its identity up front (currentAuth), so a
// request started for one owner can never be sent as another after a
// login or logout. Throws ApiError (status 0 = server unreachable / timeout)
// or AbortError if `signal` aborts.

let onSessionRejected = null;
// Called when the server rejects the current session token (expired or revoked).
export function setSessionRejectedHandler(handler) {
  onSessionRejected = handler;
}

export async function currentAuth() {
  const token = getAuthToken();
  return token ? { token } : { guestId: await getGuestSessionId() };
}

// The identity for data of `owner` ('guest' | 'user:<id>'), or null when
// this device isn't signed in as that user (any more).
export async function authFor(owner) {
  if (owner === 'guest') return { guestId: await getGuestSessionId() };
  const session = getAuthSession();
  return session && `user:${session.user.id}` === owner ? { token: session.token } : null;
}

export async function authHeaders(auth) {
  const identity = auth === undefined ? await currentAuth() : auth;
  if (identity === 'none') return {};
  return {
    ...(identity.token ? { Authorization: `Bearer ${identity.token}` } : {}),
    ...(identity.guestId ? { 'X-Guest-Session': identity.guestId } : {}),
  };
}

export async function apiRequest(
  path,
  { method = 'GET', body, json, headers = {}, signal, timeoutMs = API_TIMEOUT_MS, auth } = {}
) {
  const identity = await authHeaders(auth);
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
        ...identity,
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
    // No or non-JSON body (e.g. 204): handled below.
  }
  if (!response.ok) {
    const sentToken = identity.Authorization?.slice('Bearer '.length);
    if (response.status === 401 && data?.error === 'session_invalid' && sentToken && sentToken === getAuthToken()) {
      onSessionRejected?.();
    }
    throw new ApiError(data?.message || `Request failed (${response.status})`, {
      status: response.status,
      code: data?.error ?? null,
      details: data?.details ?? null,
    });
  }
  return data;
}
