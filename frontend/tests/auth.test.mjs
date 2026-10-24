// Email/password forms, session restore, account/guest separation and
// profile sync bookkeeping (pure modules used by store/auth.js,
// store/profileServerSync.js and the Login / Register screens).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateLoginForm, validateRegisterForm, authErrorMessage } from '../src/utils/authValidation.js';
import { accountDataToShow, ownerFor, parseStoredSession, restoreDecision } from '../src/utils/sessionRestore.js';
import {
  afterConflict,
  afterEdit,
  afterSaveFailed,
  afterSaveStarted,
  afterSaveSucceeded,
  initialSync,
  saveRequest,
  syncFromStorage,
} from '../src/utils/profileSync.js';
import { GUEST_DATA_KEY, isAccountKey, isGuestKey, ownerDataKey } from '../src/storage/keys.js';
import { parseGuestData, serializeGuestData } from '../src/storage/guestSnapshot.js';
import { resolveRestore } from '../src/storage/restore.js';

const PROFILE_A = { fullName: 'Asha Verma', email: 'asha.work@example.com', skills: ['React'], preferredLocations: [], experiences: [], education: [] };
const PROFILE_B = { fullName: 'Ravi Kumar', email: 'ravi.work@example.com', skills: ['Java'], preferredLocations: [], experiences: [], education: [] };

describe('register / login forms', () => {
  const valid = { name: 'Asha', email: 'asha@example.com', password: 'longenough', confirmPassword: 'longenough' };

  test('4. a confirm password that does not match is rejected before anything is sent', () => {
    assert.deepEqual(validateRegisterForm({ ...valid, confirmPassword: 'different1' }), {
      confirmPassword: "Passwords don't match",
    });
    assert.deepEqual(validateRegisterForm(valid), {});
  });

  test('required fields, email format and password length', () => {
    assert.deepEqual(Object.keys(validateRegisterForm({})).sort(), ['confirmPassword', 'email', 'name', 'password']);
    assert.equal(validateRegisterForm({ ...valid, email: 'asha@' }).email, 'Enter a valid email address');
    assert.equal(validateRegisterForm({ ...valid, name: '   ' }).name, 'Name is required');
    assert.match(validateRegisterForm({ ...valid, password: 'short', confirmPassword: 'short' }).password, /at least 8/);
    assert.equal(validateRegisterForm({ ...valid, password: 'é'.repeat(40), confirmPassword: 'é'.repeat(40) }).password, 'Password is too long', '80 bytes > 72');
    assert.deepEqual(validateLoginForm({ email: '', password: '' }), { email: 'Email is required', password: 'Password is required' });
    assert.deepEqual(validateLoginForm({ email: ' asha@example.com ', password: 'x' }), {}, 'login does not apply the register length rule');
  });

  test('server errors become readable messages', () => {
    assert.match(authErrorMessage({ status: 0 }), /reach the server/);
    assert.equal(authErrorMessage({ status: 401, message: 'Incorrect email or password.' }), 'Incorrect email or password.');
  });
});

describe('session restore', () => {
  const stored = JSON.stringify({ token: 't0k3n', expiresAt: '2026-11-24T00:00:00.000Z', user: { id: 'u1', name: 'A', email: 'a@x.io' }, pendingLinkGuestId: null });

  test('malformed or partial stored sessions count as signed out', () => {
    assert.equal(parseStoredSession(null), null);
    assert.equal(parseStoredSession('{not json'), null);
    assert.equal(parseStoredSession(JSON.stringify({ token: 'x' })), null);
    assert.equal(parseStoredSession(JSON.stringify({ user: { id: 'u1' } })), null);
    assert.deepEqual(parseStoredSession(stored).user, { id: 'u1', name: 'A', email: 'a@x.io' });
  });

  test('30. a session the server still accepts restores that same account', () => {
    const session = parseStoredSession(stored);
    assert.equal(restoreDecision(session, { ok: true, user: { id: 'u1' } }), 'signedIn');
    assert.equal(restoreDecision(session, { ok: true, user: { id: 'someone-else' } }), 'guest', 'never shows another account');
    assert.equal(restoreDecision(session, { ok: false, error: { status: 401 } }), 'guest', 'expired / revoked');
    assert.equal(restoreDecision(session, { ok: false, error: { status: 0 } }), 'offline', 'stays signed in on saved data');
    assert.equal(restoreDecision(null, { ok: false }), 'guest');
  });

  test('server account data wins unless this phone has unsaved changes', () => {
    const server = { profile: PROFILE_A, resume: null, revision: 4 };
    assert.deepEqual(accountDataToShow(null, server), { profile: PROFILE_A, resume: null, sync: { revision: 4, dirty: false } });
    const stale = { profile: PROFILE_B, resume: null, sync: { revision: 3, dirty: false } };
    assert.equal(accountDataToShow(stale, server).profile, PROFILE_A);
    const edited = { profile: { ...PROFILE_A, phone: '1' }, resume: null, sync: { revision: 4, dirty: true } };
    assert.deepEqual(accountDataToShow(edited, server).sync, { revision: 4, dirty: true }, 'kept, then saved with its base revision');
  });
});

describe('account and guest separation', () => {
  test('26–27. guest data and each account\'s data live under different keys', () => {
    assert.equal(ownerFor(null), 'guest');
    assert.equal(ownerFor({ id: 'abc' }), 'user:abc');
    const guest = ownerDataKey('guest');
    const a = ownerDataKey('user:aaa');
    const b = ownerDataKey('user:bbb');
    assert.equal(guest, GUEST_DATA_KEY);
    assert.ok(isGuestKey(guest) && !isAccountKey(guest));
    assert.ok(isAccountKey(a) && isAccountKey(b) && !isGuestKey(a));
    assert.equal(new Set([guest, a, b]).size, 3);
    assert.throws(() => ownerDataKey('user:'));
    assert.throws(() => ownerDataKey(undefined));
  });

  test('27. a fresh guest after logout restores nothing (empty guest record)', () => {
    // Logout writes an empty guest record (clearOwnerData) — reading it back gives no profile.
    assert.deepEqual(resolveRestore({ status: 'ok', data: parseGuestData(null).data }), {
      profile: null, resume: null, resumeFileMissing: false, storageStatus: 'ready', sync: { revision: null, dirty: false },
    });
  });

  test('saved data keeps its sync state; older snapshots read as not synced', () => {
    const raw = serializeGuestData({ profile: PROFILE_A, resume: null, sync: { revision: 2, dirty: true } });
    assert.deepEqual(parseGuestData(raw).data.sync, { revision: 2, dirty: true });
    const old = JSON.stringify({ version: 1, savedAt: 1, profile: PROFILE_A, resume: null });
    assert.deepEqual(parseGuestData(old).data.sync, { revision: null, dirty: false });
  });
});

describe('profile sync (31)', () => {
  const state = (sync, profile = PROFILE_A) => ({ profile, sync });

  test('a save confirmed by the server marks it saved', () => {
    let sync = afterEdit(initialSync);
    const request = saveRequest(state(sync));
    assert.deepEqual(request, { profile: PROFILE_A, baseRevision: null, seq: 1 });
    sync = afterSaveSucceeded(afterSaveStarted(sync), { seq: request.seq, revision: 1 });
    assert.deepEqual([sync.status, sync.dirty, sync.revision], ['saved', false, 1]);
    assert.equal(saveRequest(state(sync)), null, 'nothing more to send');
  });

  test('31. a failed / offline save is never reported as saved and is retried', () => {
    let sync = afterEdit({ ...initialSync, revision: 3 });
    sync = afterSaveFailed(afterSaveStarted(sync), "Couldn't reach the server.");
    assert.deepEqual([sync.status, sync.dirty, sync.revision], ['failed', true, 3]);
    assert.equal(saveRequest(state(sync)).baseRevision, 3, 'the retry is still based on the last confirmed revision');
    const restored = syncFromStorage({ revision: 3, dirty: true });
    assert.deepEqual([restored.status, restored.dirty], ['pending', true], 'still unsaved after a restart');
  });

  test('31. edits made while a save is in flight are not marked saved', () => {
    let sync = afterEdit(initialSync);
    const request = saveRequest(state(sync));
    sync = afterEdit(afterSaveStarted(sync)); // edited during the request
    sync = afterSaveSucceeded(sync, { seq: request.seq, revision: 1 });
    assert.deepEqual([sync.status, sync.dirty, sync.revision], ['pending', true, 1]);
    assert.equal(saveRequest(state(sync)).baseRevision, 1);
  });

  test('31. a conflict takes the server\'s newer revision and stops overwriting', () => {
    let sync = afterEdit({ ...initialSync, revision: 2 });
    sync = afterConflict(sync, 5);
    assert.deepEqual([sync.status, sync.dirty, sync.revision], ['conflict', false, 5]);
    assert.equal(saveRequest(state(sync)), null);
  });
});
