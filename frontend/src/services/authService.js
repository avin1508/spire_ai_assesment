import { apiRequest } from './api';

// Client for the backend auth API (backend/src/routes/auth.routes.js).
// register / login → { user: { id, name, email }, token, expiresAt }.
// The password is only ever sent to these endpoints, never stored.

export const registerAccount = ({ name, email, password }) =>
  apiRequest('/api/auth/register', { method: 'POST', json: { name: name.trim(), email: email.trim(), password }, auth: 'none' });

export const loginAccount = ({ email, password }) =>
  apiRequest('/api/auth/login', { method: 'POST', json: { email: email.trim(), password }, auth: 'none' });

/** Revokes the session on the server. */
export const logoutSession = (token) => apiRequest('/api/auth/logout', { method: 'POST', auth: { token } });

/** → { user } for a valid session; 401 otherwise. */
export const fetchMe = (token) => apiRequest('/api/auth/me', { auth: { token } });

/**
 * Links this guest's server data to the account (idempotent; the server
 * decides what moves, see backend/src/services/guestLink.service.js).
 * → { status, profile: 'linked'|'kept'|'none', resume: 'linked'|'retained'|'none', recommendations }
 */
export const linkGuest = (token, guestId) =>
  apiRequest('/api/auth/link-guest', { method: 'POST', auth: { token, guestId } });
