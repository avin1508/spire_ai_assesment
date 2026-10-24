import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ownerDataLoaded, profileConfirmed, sessionCleared } from './profileSlice';
import { notificationPromptClosed, notificationPromptOpened } from './sessionSlice';
import { authFor } from '../services/api';
import {
  devicePushToken,
  notificationPermission,
  onPushTokenChanged,
  pushSupported,
  registerDeviceToken,
  unregisterDeviceToken,
} from '../notifications/push';
import { shouldOfferPermission, shouldRegister } from '../utils/pushNotifications';
import { PUSH_PROMPT_KEY } from '../storage/keys';

// Keeps this device's push registration with the current owner: the guest
// session, or the signed-in account. It is (re-)registered when an owner's
// data is loaded (start-up, sign-in), after logout (the fresh guest), when
// permission is granted and when FCM rotates the token. A device belongs to
// one owner on the server, so registering for the new owner also takes it
// away from the previous one; on logout it is removed from the account first
// (unregisterFromAccount).
//
// Permission: never asked on start-up. After a profile is confirmed (the
// recommendations are being prepared) our own sheet explains the benefit
// (components/NotificationPromptSheet.js); Android's dialog only follows a
// "Notify me". "Not now" isn't asked again for a week (utils/pushNotifications.js).

export const pushRegistration = createListenerMiddleware();

const OFFER_DELAY_MS = 900; // let the screen after "Done" settle first

let registered = null; // { owner, token } confirmed by the server
let token = null;
let queue = Promise.resolve(); // one registration at a time

function syncDevice(getState) {
  queue = queue
    .then(async () => {
      const { owner } = getState().profile;
      const permission = await notificationPermission();
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
    })
    .catch((error) => {
      // Never let one failed step reject the queue (an unhandled rejection) or block the next one.
      console.warn('[push] sync failed:', error?.message ?? error);
    });
  return queue;
}

async function promptDismissedAt() {
  try {
    const value = Number(await AsyncStorage.getItem(PUSH_PROMPT_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

pushRegistration.startListening({
  matcher: isAnyOf(ownerDataLoaded, sessionCleared),
  effect: (action, api) => syncDevice(api.getState),
});

// A confirmed profile: register if already allowed, otherwise offer notifications.
pushRegistration.startListening({
  actionCreator: profileConfirmed,
  effect: async (action, api) => {
    await syncDevice(api.getState);
    let offer = false;
    try {
      offer = shouldOfferPermission({
        supported: pushSupported,
        permission: await notificationPermission(),
        reason: 'profile_confirmed',
        dismissedAt: await promptDismissedAt(),
      });
    } catch (error) {
      console.warn('[push] permission check failed:', error?.message ?? error);
    }
    if (!offer) return;
    await api.delay(OFFER_DELAY_MS);
    api.dispatch(notificationPromptOpened());
  },
});

/** "Notify me": Android's permission dialog, then register this device. */
export const enableNotifications = () => async (dispatch, getState) => {
  dispatch(notificationPromptClosed());
  try {
    const permission = await notificationPermission({ ask: true });
    if (permission === 'granted') await syncDevice(getState);
  } catch (error) {
    console.warn('[push] enabling failed:', error?.message ?? error);
  }
};

/** "Not now": close the sheet and don't offer it again for a while. */
export const dismissNotificationPrompt = () => async (dispatch) => {
  dispatch(notificationPromptClosed());
  try {
    await AsyncStorage.setItem(PUSH_PROMPT_KEY, String(Date.now()));
  } catch {
    // Offered again next time — harmless.
  }
};

// Token rotation → register the new token for the current owner.
export function watchPushToken(store) {
  return onPushTokenChanged((next) => {
    token = next;
    syncDevice(store.getState);
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
