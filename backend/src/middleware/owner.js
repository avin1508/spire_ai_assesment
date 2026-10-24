import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { HttpError, ServiceUnavailableError } from '../utils/httpErrors.js';

// Request ownership, shared by the resume and recommendation APIs.
//
// req.owner = { type, key }: every query filters on `key`, so one owner can
// never read or change another owner's data (they get 404 instead).
//   type 'guest': key = SHA-256 of the X-Guest-Session UUID the app keeps
//     (the raw id is never stored).
//   type 'user': reserved for verified sign-in (not available yet), so an
//     Authorization header alone is rejected rather than trusted.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const guestOwnerKey = (guestSessionId) =>
  createHash('sha256').update(`guest:${guestSessionId.toLowerCase()}`).digest('hex');

export function requireOwner(req, res, next) {
  const guestSession = req.get('x-guest-session');
  if (guestSession && UUID.test(guestSession)) {
    req.owner = { type: 'guest', key: guestOwnerKey(guestSession) };
    next();
    return;
  }
  if (!guestSession && req.get('authorization')) {
    next(new HttpError(401, 'auth_not_supported', 'Signed-in access is not available yet.'));
    return;
  }
  next(new HttpError(401, 'guest_session_required', 'A valid X-Guest-Session header is required.'));
}

export function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    next(new ServiceUnavailableError('The database is not connected'));
    return;
  }
  next();
}
