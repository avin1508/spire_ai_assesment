// Pure decisions about the signed-in session (store/auth.js), testable
// without React Native.
// (No imports: this file is also loaded by the Node test runner.)

// Whose data the app shows: 'guest' or 'user:<id>' (the server uses the same key).
export const ownerFor = (user) => (user?.id ? `user:${user.id}` : 'guest');

// Stored secure-storage JSON → session or null (anything malformed = signed out).
export function parseStoredSession(raw) {
  if (!raw) return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const user = value?.user;
  if (typeof value?.token !== 'string' || !value.token || typeof user?.id !== 'string' || !user.id) return null;
  return {
    token: value.token,
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null,
    user: { id: user.id, name: String(user.name ?? ''), email: String(user.email ?? '') },
    pendingLinkGuestId: typeof value.pendingLinkGuestId === 'string' ? value.pendingLinkGuestId : null,
  };
}

// At start-up, after asking the server about the stored session (GET /api/auth/me):
//   'guest'    — no session, or the server rejected it (expired / revoked):
//                drop it and the account's local data, continue as a guest
//   'signedIn' — the server confirmed this same user
//   'offline'  — the server couldn't be reached: stay signed in on the saved
//                data; it is checked again next time
export function restoreDecision(stored, meResult) {
  if (!stored) return 'guest';
  if (meResult.ok) return meResult.user?.id === stored.user.id ? 'signedIn' : 'guest';
  return meResult.error?.status === 401 ? 'guest' : 'offline';
}

// Account data to show after loading it from the server. Local changes the
// server hasn't confirmed yet are kept (and then saved, see profileSync.js);
// otherwise the server's copy wins.
export function accountDataToShow(local, server) {
  if (local?.profile && local.sync?.dirty) {
    return { profile: local.profile, resume: server.resume ?? local.resume ?? null, sync: local.sync };
  }
  return { profile: server.profile, resume: server.resume, sync: { revision: server.revision, dirty: false } };
}
