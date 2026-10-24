import AsyncStorage from '@react-native-async-storage/async-storage';
import { GUEST_DATA_KEY, corruptBackupKey } from './keys';
import { parseGuestData, serializeGuestData } from './guestSnapshot';
import { createLatestWriter } from './latestWriter';

// Guest profile + resume metadata in AsyncStorage, under the guest namespace.
// Writes go through a latest-wins queue so overlapping saves can't land out
// of order.

const writer = createLatestWriter((raw) => AsyncStorage.setItem(GUEST_DATA_KEY, raw), {
  onError: (error) => console.warn('[guestStore] save failed:', error?.message ?? error),
});

/**
 * → { status: 'ok', data }        saved data (or empty on first launch)
 *   { status: 'corrupt', data }   unreadable record, backed up and ignored
 *   { status: 'failed', error }   storage couldn't be read at all
 */
export async function loadGuestData() {
  let raw;
  try {
    raw = await AsyncStorage.getItem(GUEST_DATA_KEY);
  } catch (error) {
    return { status: 'failed', error };
  }

  const parsed = parseGuestData(raw);
  if (parsed.ok) return { status: 'ok', data: parsed.data };

  // Keep the unreadable record under a backup key rather than losing it.
  try {
    await AsyncStorage.setItem(corruptBackupKey(GUEST_DATA_KEY, Date.now()), raw);
  } catch (error) {
    // If even the backup fails, don't allow the original to be overwritten.
    return { status: 'failed', error };
  }
  console.warn('[guestStore] ignored unreadable guest data:', parsed.reason);
  return { status: 'corrupt', data: { profile: null, resume: null } };
}

export function saveGuestData({ profile, resume }) {
  return writer.save(serializeGuestData({ profile, resume }));
}
