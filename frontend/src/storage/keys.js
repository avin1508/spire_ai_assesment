// AsyncStorage keys. Guest data and account data live in separate
// namespaces so one can never be read as the other. Bump the version suffix
// if the stored shape changes incompatibly.
// (No imports: this file is also loaded by the Node test runner.)

const PREFIX = 'spire';

export const GUEST_DATA_KEY = `${PREFIX}:guest:data:v1`;
// Random id identifying this guest's uploads to the backend (storage/guestSession.js).
export const GUEST_SESSION_KEY = `${PREFIX}:guest:session:v1`;

// Account-scoped key, e.g. accountKey('u123', 'profile') → 'spire:account:u123:profile'.
// Used for each signed-in account's data (ownerDataKey below).
export function accountKey(userId, name) {
  if (!userId || typeof userId !== 'string') throw new Error('accountKey needs a userId');
  if (!name || typeof name !== 'string') throw new Error('accountKey needs a name');
  return `${PREFIX}:account:${userId}:${name}`;
}

export function corruptBackupKey(key, timestamp) {
  return `${key}:corrupt:${timestamp}`;
}

export const isGuestKey = (key) => key.startsWith(`${PREFIX}:guest:`);
export const isAccountKey = (key) => key.startsWith(`${PREFIX}:account:`);

// Where an owner's profile data is kept: 'guest' → the guest namespace,
// 'user:<id>' → that account's namespace (see storage/localData.js).
export function ownerDataKey(owner) {
  if (owner === 'guest') return GUEST_DATA_KEY;
  if (typeof owner === 'string' && owner.startsWith('user:') && owner.length > 'user:'.length) {
    return accountKey(owner.slice('user:'.length), 'data');
  }
  throw new Error('ownerDataKey needs "guest" or "user:<id>"');
}
