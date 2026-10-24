import { Platform } from 'react-native';

// Google OAuth client IDs (public identifiers, not secrets), read from
// frontend/.env — see .env.example. Create them in Google Cloud Console →
// APIs & Services → Credentials:
//   - Android: package "com.spireai.iexchange" + your signing certificate SHA-1
//   - iOS:     bundle id "com.spireai.iexchange"
//   - Web:     used by the backend to verify ID tokens (audience)
// Never put a client *secret* in the app.
export const GOOGLE_CLIENT_IDS = {
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
};

// The client ID Google requires on the current platform.
const PLATFORM_KEY = { android: 'androidClientId', ios: 'iosClientId' }[Platform.OS] ?? 'webClientId';

export const isGoogleSignInConfigured = Boolean(GOOGLE_CLIENT_IDS[PLATFORM_KEY]);
export const missingGoogleClientIdVar = {
  androidClientId: 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
  iosClientId: 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  webClientId: 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
}[PLATFORM_KEY];
