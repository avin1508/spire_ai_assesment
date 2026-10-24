import * as SecureStore from 'expo-secure-store';
import { parseStoredSession } from '../utils/sessionRestore';

// The signed-in session (token + user + a guest session still waiting to be
// linked), kept in the device's secure storage (Android Keystore / iOS
// Keychain), never in AsyncStorage. The token is also held in memory for
// requests (services/api.js).

const KEY = 'spire.auth.session.v1';

let current = null; // { token, expiresAt, user: { id, name, email }, pendingLinkGuestId }

export const getAuthToken = () => current?.token ?? null;
export const getAuthSession = () => current;

// → the stored session, or null (none, unreadable or malformed).
export async function loadAuthSession() {
  try {
    current = parseStoredSession(await SecureStore.getItemAsync(KEY));
  } catch (error) {
    console.warn('[authSession] could not read the session:', error?.message ?? error);
    current = null;
  }
  return current;
}

export async function saveAuthSession(session) {
  current = session;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(session));
  } catch (error) {
    // Still signed in for this app session; the user signs in again after a restart.
    console.warn('[authSession] could not save the session:', error?.message ?? error);
  }
}

export async function clearAuthSession() {
  current = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch (error) {
    console.warn('[authSession] could not delete the session:', error?.message ?? error);
  }
}
