import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { HttpError, ServiceUnavailableError } from '../utils/httpErrors.js';
import { resolveSession, userOwnerKey } from '../services/auth.service.js';

// Request ownership, shared by the resume, recommendation and profile APIs.
//
// req.owner = { type, key }: every query filters on `key`, so one owner can
// never read or change another owner's data (they get 404 instead).
//   type 'user': `Authorization: Bearer <session token>`; the identity comes
//     only from the verified session (key = "user:<userId>"), never from a
//     client-supplied id. An invalid, expired or revoked token is a 401 —
//     it never falls back to the guest identity.
//   type 'guest': key = SHA-256 of the X-Guest-Session UUID the app keeps
//     (the raw id is never stored).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const guestOwnerKey = (guestSessionId) =>
  createHash('sha256').update(`guest:${guestSessionId.toLowerCase()}`).digest('hex');

function bearerToken(req) {
  const header = req.get('authorization');
  if (header === undefined) return null;
  const match = header.match(/^Bearer (\S+)$/);
  return match ? match[1] : '';
}

// Sets req.auth = { session, user } for a valid token.
async function authenticate(req, token) {
  req.auth = await resolveSession(token);
  return { type: 'user', key: userOwnerKey(req.auth.user._id), userId: req.auth.user._id };
}

function guestOwner(req) {
  const guestSession = req.get('x-guest-session');
  return guestSession && UUID.test(guestSession) ? { type: 'guest', key: guestOwnerKey(guestSession) } : null;
}

// A signed-in user or a guest.
export async function requireOwner(req, res, next) {
  const token = bearerToken(req);
  if (token !== null) {
    req.owner = await authenticate(req, token);
    next();
    return;
  }
  const guest = guestOwner(req);
  if (!guest) throw new HttpError(401, 'guest_session_required', 'A valid X-Guest-Session header is required.');
  req.owner = guest;
  next();
}

// A signed-in user only.
export async function requireUser(req, res, next) {
  const token = bearerToken(req);
  if (token === null) throw new HttpError(401, 'auth_required', 'Please log in.');
  req.owner = await authenticate(req, token);
  next();
}

// The guest session the request proves it holds (X-Guest-Session), next to
// a signed-in user — used to link that guest's data to the account.
export function requireGuestProof(req, res, next) {
  const guest = guestOwner(req);
  if (!guest) throw new HttpError(400, 'guest_session_required', 'A valid X-Guest-Session header is required.');
  req.guest = guest;
  next();
}

export function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    next(new ServiceUnavailableError('The database is not connected'));
    return;
  }
  next();
}
