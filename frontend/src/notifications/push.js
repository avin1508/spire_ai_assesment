import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { apiRequest } from '../services/api';
import { permissionState } from '../utils/pushNotifications';

// Device side of push notifications (FCM through expo-notifications, using
// the Firebase app configured in google-services.json).
//
// The token is the native FCM registration token (getDevicePushTokenAsync),
// not an Expo push token: the backend sends through FCM HTTP v1. Remote push
// needs a development / release build — Expo Go can't receive this app's
// FCM messages (and lacks some of expo-notifications' native modules), so
// the library isn't even loaded there. Android only for now.

export const CHANNEL_ID = 'recommendations'; // same as the backend's android.notification.channel_id

export const pushSupported = Platform.OS === 'android' && !isRunningInExpoGo();

const Notifications = pushSupported ? require('expo-notifications') : null;

// Notifications that arrive while the app is open are shown too.
Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let channelReady = null;
const ensureChannel = () =>
  (channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Job recommendations',
    importance: Notifications.AndroidImportance.HIGH,
  }).catch(() => null));


/** → 'granted' | 'denied' | 'undetermined' (asks only when `ask`). */
export async function notificationPermission({ ask = false } = {}) {
  if (!pushSupported) return 'denied';
  await ensureChannel(); // Android 13+ shows the prompt once a channel exists
  let state = permissionState(await Notifications.getPermissionsAsync());
  if (state === 'undetermined' && ask) state = permissionState(await Notifications.requestPermissionsAsync());
  return state;
}

/** The device's FCM registration token, or null. */
export async function devicePushToken() {
  if (!pushSupported) return null;
  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    return typeof data === 'string' && data ? data : null;
  } catch (error) {
    console.warn('[push] no device token:', error?.message ?? error);
    return null;
  }
}

/** Calls `listener(token)` when FCM rotates the token. → unsubscribe */
export function onPushTokenChanged(listener) {
  if (!pushSupported) return () => {};
  const subscription = Notifications.addPushTokenListener(({ data }) => {
    if (typeof data === 'string' && data) listener(data);
  });
  return () => subscription.remove();
}

// The data of a tapped notification (FCM data fields).
export const responseData = (response) =>
  response?.notification?.request?.content?.data ?? response?.notification?.request?.trigger?.remoteMessage?.data ?? null;

// Calls `listener(data)` for each tapped notification, including the one
// that launched the app. → unsubscribe
export function subscribeToNotificationTaps(listener) {
  if (!Notifications) return () => {};
  const seen = new Set();
  const handle = (response) => {
    const id = response?.notification?.request?.identifier;
    if (!response || seen.has(id)) return;
    seen.add(id);
    listener(responseData(response));
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
  return () => subscription.remove();
}

// Backend registration under an explicit owner identity (services/api.js authFor).
export const registerDeviceToken = (token, auth) =>
  apiRequest('/api/devices', { method: 'PUT', json: { token, platform: 'android' }, auth });

export const unregisterDeviceToken = (token, auth) =>
  apiRequest('/api/devices', { method: 'DELETE', json: { token }, auth });
