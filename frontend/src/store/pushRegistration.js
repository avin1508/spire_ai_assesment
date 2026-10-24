import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { ownerDataLoaded, profileConfirmed, sessionCleared } from './profileSlice';
import { authFor } from '../services/api';
import {
  devicePushToken,
  notificationPermission,
  onPushTokenChanged,
  pushSupported,
  registerDeviceToken,
  unregisterDeviceToken,
} from '../notifications/push';
import { shouldAskPermission, shouldRegister } from '../utils/pushNotifications';

// Keeps this device's push registration with the current owner: the guest
// session, or the signed-in account. It is (re-)registered when an owner's
// data is loaded (start-up, sign-in), after logout (the fresh guest), when a
// profile is confirmed (the moment permission is asked for) and when FCM
// rotates the token. A device belongs to one owner on the server, so
// registering for the new owner also takes it away from the previous one;
// on logout it is removed from the account first (unregisterFromAccount).

export const pushRegistration = createListenerMiddleware();

let registered = null; // { owner, token } confirmed by the server
let token = null;
let queue = Promise.resolve(); // one registration at a time

function syncDevice(getState, reason) {
  queue = queue.then(async () => {
    const { owner } = getState().profile;
    let permission = await notificationPermission();
    if (shouldAskPermission({ supported: pushSupported, permission, reason })) {
      permission = await notificationPermission({ ask: true });
    }
    if (permission === 'granted' && !token) token = await devicePushToken();
    if (!shouldRegister({ supported: pushSupported, permission, token, owner, registered })) return;
    const auth = await authFor(owner);
    if (!auth || getState().profile.owner !== owner) return;
    try {
      await registerDeviceToken(token, auth);
      registered = { owner, token };
    } catch (error) {
      console.warn('[push] registration failed:', error?.message ?? error); // retried at the next trigger
    }
  }).catch((error) => {
    // Never let one failed step reject the queue (an unhandled rejection) or block the next one.
    console.warn('[push] sync failed:', error?.message ?? error, error?.stack?.split('\n').slice(0, 4).join(' | '));
  });
  return queue;
}

pushRegistration.startListening({
  matcher: isAnyOf(ownerDataLoaded, sessionCleared, profileConfirmed),
  effect: (action, api) => syncDevice(api.getState, profileConfirmed.match(action) ? 'profile_confirmed' : 'owner'),
});

// Token rotation → register the new token for the current owner.
export function watchPushToken(store) {
  return onPushTokenChanged((next) => {
    token = next;
    syncDevice(store.getState, 'token_changed');
  });
}

// Logout: take the device away from the account while the session is still
// valid, so the account's notifications stop reaching this phone even if
// the fresh guest's registration can't be made right away.
export async function unregisterFromAccount(sessionToken) {
  await queue;
  if (!registered || registered.owner === 'guest' || !sessionToken) return;
  try {
    await unregisterDeviceToken(registered.token, { token: sessionToken });
  } catch (error) {
    console.warn('[push] could not remove the device from the account:', error?.message ?? error);
  }
  registered = null;
}
