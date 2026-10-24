import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { GUEST_SESSION_KEY } from './keys';

// The guest session id: a random UUID (cryptographically secure, generated
// on the device) that identifies this guest's uploads to the backend. It is
// created once and reused; it is not a device id. If storage can't be read,
// an in-memory id is used for this app session only.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let pending = null;

async function loadOrCreate() {
  try {
    const saved = await AsyncStorage.getItem(GUEST_SESSION_KEY);
    if (saved && UUID.test(saved)) return saved;
  } catch (error) {
    console.warn('[guestSession] could not read the guest session id:', error?.message ?? error);
  }
  const id = Crypto.randomUUID();
  try {
    await AsyncStorage.setItem(GUEST_SESSION_KEY, id);
  } catch (error) {
    console.warn('[guestSession] could not save the guest session id:', error?.message ?? error);
  }
  return id;
}

export function getGuestSessionId() {
  pending ??= loadOrCreate();
  return pending;
}
