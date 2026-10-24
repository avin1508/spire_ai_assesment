// Pure decisions for push notifications (store/pushRegistration.js,
// notifications/push.js), testable without React Native.
// (No imports: this file is also loaded by the Node test runner.)

export const RECOMMENDATIONS_READY = 'recommendations_ready';

// Where a tapped notification leads (React Navigation target), or null for
// anything we don't handle. The recommendations shown are always fetched
// for whoever is signed in on the phone at that moment — the notification
// itself carries no account data.
export function notificationTarget(data) {
  if (data?.type !== RECOMMENDATIONS_READY) return null;
  return { name: 'Main', params: { screen: 'Jobs', params: { screen: 'Recommended' } } };
}

// Whether this device should (re-)register its push token now.
//   supported   — push works in this build (not Expo Go, Android)
//   permission  — 'granted' | 'denied' | 'undetermined'
//   token       — current FCM token (or null)
//   owner       — current owner ('guest' | 'user:<id>')
//   registered  — { owner, token } last confirmed by the server, or null
export function shouldRegister({ supported, permission, token, owner, registered }) {
  if (!supported || permission !== 'granted' || !token || !owner) return false;
  return !registered || registered.owner !== owner || registered.token !== token;
}

// expo-notifications permission response → 'granted' | 'denied' | 'undetermined'.
// Android reports a permission that was never asked as 'denied' with
// canAskAgain: true — that still counts as "not decided yet".
export const permissionState = ({ status, canAskAgain }) =>
  status === 'granted' ? 'granted' : canAskAgain ? 'undetermined' : 'denied';

// "Not now" on our own prompt: don't offer it again for this long.
export const PERMISSION_PROMPT_COOLDOWN_MS = 7 * 24 * 3600000;

// When to offer notifications (our own explanation first; Android's system
// dialog only after the user says yes): right after a profile is confirmed —
// their recommendations are being prepared, so the value is obvious — never
// on start-up, never again once decided (granted, or blocked by the system),
// and not within the cool-down after "Not now".
export function shouldOfferPermission({ supported, permission, reason, dismissedAt, now = Date.now() }) {
  if (!supported || permission !== 'undetermined' || reason !== 'profile_confirmed') return false;
  return !dismissedAt || now - dismissedAt >= PERMISSION_PROMPT_COOLDOWN_MS;
}
