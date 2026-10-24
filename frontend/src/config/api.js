import { Platform } from 'react-native';
import Constants from 'expo-constants';

const API_PORT = 5000;

// Backend base URL. EXPO_PUBLIC_API_URL in frontend/.env always wins.
// Otherwise, in development the backend is assumed to run on the same
// computer as the Expo dev server, so its address is taken from the dev
// server host the app was loaded from (e.g. 192.168.1.20:8081 → :5000) —
// this works on a physical phone on the same Wi-Fi. "localhost"/127.0.0.1
// (Android emulator via adb reverse) becomes 10.0.2.2, the emulator's alias
// for the computer.
function defaultBaseUrl() {
  const hostUri = Constants.expoConfig?.hostUri; // "host:port" of the dev server
  let host = hostUri ? hostUri.split(':')[0] : null;
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  }
  return `http://${host}:${API_PORT}`;
}

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || defaultBaseUrl()).replace(/\/+$/, '');

// Requests that take longer than this are aborted and shown as failed.
export const API_TIMEOUT_MS = 15000;
