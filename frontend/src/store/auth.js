import { ownerDataLoaded, sessionCleared } from './profileSlice';
import { noticeShown, signedIn, signedOut } from './sessionSlice';
import { flushProfileSync } from './profileServerSync';
import { unregisterFromAccount } from './pushRegistration';
import { fetchMe, linkGuest, loginAccount, logoutSession, registerAccount } from '../services/authService';
import { fetchProfile } from '../services/profileService';
import { clearAuthSession, getAuthSession, loadAuthSession, saveAuthSession } from '../storage/authSession';
import { getGuestSessionId, resetGuestSession } from '../storage/guestSession';
import { clearOwnerData, loadOwnerData, saveOwnerData } from '../storage/localData';
import { resolveRestore } from '../storage/restore';
import { accountDataToShow, ownerFor, restoreDecision } from '../utils/sessionRestore';

// Sign-in, start-up restore and logout.
//
// Register / login: (1) the guest's latest profile is saved on the server,
// (2) the account session is created and kept in secure storage, (3) this
// guest's server data is linked to the account (the server applies the
// rules, see backend/src/services/guestLink.service.js), (4) the account's
// own data is loaded from the server and replaces the guest's on screen.
// The guest's data on this phone is deleted only after the server has
// confirmed the link; if linking fails it is retried at the next start-up.
//
// Logout: the server session is revoked, the session and the account's data
// on this phone are deleted and a fresh guest starts. The account's data on
// the server is untouched and comes back on the next login.

const LINK_PENDING_NOTICE =
  "We couldn't move your guest profile to your account yet. We'll try again the next time the app starts.";

async function loadGuest(dispatch) {
  let result;
  try {
    result = await loadOwnerData('guest');
  } catch (error) {
    result = { status: 'failed', error };
  }
  if (result.status === 'failed') console.warn('[auth] guest storage unreadable; saving disabled this session');
  dispatch(ownerDataLoaded({ owner: 'guest', ...resolveRestore(result) }));
}

// The guest's data is now the account's: forget it on this phone.
async function forgetGuest() {
  await clearOwnerData('guest');
  await resetGuestSession();
}

// Links the pending guest session to the account. → true when the server
// has finished the link (or the guest can't be linked to this account).
async function linkPendingGuest(session) {
  if (!session.pendingLinkGuestId) return true;
  try {
    await linkGuest(session.token, session.pendingLinkGuestId);
  } catch (error) {
    // 409: this guest session is already another account's; there is nothing to move.
    if (!(error?.status === 409 && error.code === 'guest_already_linked')) return false;
  }
  await saveAuthSession({ ...session, pendingLinkGuestId: null });
  return true;
}

// Shows the account's data: the server's, unless this phone has changes the
// server hasn't confirmed yet (those are kept and saved).
async function showAccountData(dispatch, owner, server, local) {
  const shown = accountDataToShow(local, server);
  dispatch(ownerDataLoaded({ owner, ...shown, resumeFileMissing: false, storageStatus: 'ready' }));
  await saveOwnerData(owner, shown);
}

// Clears the signed-in state on this phone and starts a fresh guest —
// unless the previous guest's data was never linked (keepGuest): then that
// guest continues, so its data isn't lost.
async function endSessionLocally(dispatch, owner, { keepGuest = false } = {}) {
  await clearAuthSession();
  if (owner && owner !== 'guest') await clearOwnerData(owner);
  if (!keepGuest) await forgetGuest();
  dispatch(signedOut());
  dispatch(sessionCleared());
}

/** Register or log in, then link this guest's data. Throws ApiError to the form. */
export const authenticate = ({ mode, values }) => async (dispatch, getState) => {
  if (getState().profile.owner === 'guest') await dispatch(flushProfileSync());
  const guestId = await getGuestSessionId();

  const result = mode === 'register' ? await registerAccount(values) : await loginAccount(values);
  const owner = ownerFor(result.user);
  const session = { token: result.token, expiresAt: result.expiresAt, user: result.user, pendingLinkGuestId: guestId };
  await saveAuthSession(session);

  const linked = await linkPendingGuest(session);

  let server;
  try {
    server = await fetchProfile({ token: result.token });
  } catch (error) {
    // Without the account's data nothing can be shown safely: undo the sign-in.
    await logoutSession(result.token).catch(() => {});
    await clearAuthSession();
    throw error;
  }
  const local = resolveRestore(await loadOwnerData(owner));
  dispatch(signedIn(result.user));
  await showAccountData(dispatch, owner, server, local);
  if (linked) await forgetGuest();
  else dispatch(noticeShown(LINK_PENDING_NOTICE));
  return result.user;
};

// True while restoreSession or logout handles the session itself (a 401
// there is handled by them, not by sessionRejected).
let restoring = false;

/** At start-up: the saved account (checked with the server) or the guest. */
export const restoreSession = () => async (dispatch, getState) => {
  restoring = true;
  try {
    await restore(dispatch, getState);
  } finally {
    restoring = false;
  }
};

async function restore(dispatch, getState) {
  const stored = await loadAuthSession();
  if (!stored) {
    await loadGuest(dispatch);
    return;
  }
  const owner = ownerFor(stored.user);
  const cached = resolveRestore(await loadOwnerData(owner));
  const hasCache = cached.storageStatus === 'ready' && Boolean(cached.profile || cached.resume || cached.sync.revision);
  if (hasCache) {
    // Show the saved account data straight away; the server check follows.
    dispatch(signedIn(stored.user));
    dispatch(ownerDataLoaded({ owner, ...cached }));
  }

  let me;
  try {
    me = { ok: true, user: (await fetchMe(stored.token)).user };
  } catch (error) {
    me = { ok: false, error };
  }
  const decision = restoreDecision(stored, me);
  if (decision === 'guest') {
    await endSessionLocally(dispatch, owner, { keepGuest: Boolean(stored.pendingLinkGuestId) });
    await loadGuest(dispatch);
    return;
  }
  if (decision === 'offline') {
    if (!hasCache) {
      dispatch(signedIn(stored.user));
      dispatch(ownerDataLoaded({ owner, ...cached }));
    }
    return;
  }

  dispatch(signedIn(me.user));
  const linkedNow = Boolean(stored.pendingLinkGuestId) && (await linkPendingGuest(stored));
  try {
    const server = await fetchProfile({ token: stored.token });
    const current = getState().profile.owner === owner ? getState().profile : cached;
    await showAccountData(dispatch, owner, server, current);
  } catch {
    if (!hasCache) dispatch(ownerDataLoaded({ owner, ...cached }));
  }
  if (linkedNow) await forgetGuest();
}

/** Logout: revoke the server session, clear this phone's account data, start a fresh guest. */
export const logout = () => async (dispatch, getState) => {
  const session = getAuthSession();
  const { owner } = getState().profile;
  let revoked = true;
  restoring = true;
  try {
    if (session) {
      await linkPendingGuest(session);
      await unregisterFromAccount(session.token); // no more account notifications on this phone
      try {
        await logoutSession(session.token);
      } catch (error) {
        revoked = error?.status === 401; // already invalid on the server
      }
    }
    await endSessionLocally(dispatch, owner);
  } finally {
    restoring = false;
  }
  return { revoked };
};

/** The server rejected the session (expired / revoked elsewhere): sign out on this phone. */
export const sessionRejected = () => async (dispatch, getState) => {
  const session = getAuthSession();
  if (!session || restoring) return;
  const keepGuest = Boolean(session.pendingLinkGuestId);
  await endSessionLocally(dispatch, getState().profile.owner, { keepGuest });
  if (keepGuest) await loadGuest(dispatch);
  dispatch(noticeShown('Your session has ended. Please log in again.'));
};
