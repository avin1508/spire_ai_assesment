import AsyncStorage from '@react-native-async-storage/async-storage';
import { corruptBackupKey, ownerDataKey } from './keys';
import { parseGuestData, serializeGuestData } from './guestSnapshot';
import { createLatestWriter } from './latestWriter';

// Profile + resume metadata + sync state on the device, per owner:
//   'guest'          → the guest namespace (spire:guest:data:v1)
//   'user:<userId>'  → that account's namespace (spire:account:<id>:data)
// so one owner's data can never be read as another's. Writes per key go
// through a latest-wins queue; clearing goes through the same queue, so an
// older save can't land after it.

const writers = new Map();
function writerFor(owner) {
  const key = ownerDataKey(owner);
  if (!writers.has(key)) {
    writers.set(
      key,
      createLatestWriter((raw) => (raw === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, raw)), {
        onError: (error) => console.warn('[localData] save failed:', error?.message ?? error),
      })
    );
  }
  return writers.get(key);
}

/**
 * → { status: 'ok', data }        saved data (or empty on first use)
 *   { status: 'corrupt', data }   unreadable record, backed up and ignored
 *   { status: 'failed', error }   storage couldn't be read at all
 */
export async function loadOwnerData(owner) {
  const key = ownerDataKey(owner);
  await writerFor(owner).flush();
  let raw;
  try {
    raw = await AsyncStorage.getItem(key);
  } catch (error) {
    return { status: 'failed', error };
  }

  const parsed = parseGuestData(raw);
  if (parsed.ok) return { status: 'ok', data: parsed.data };

  // Keep the unreadable record under a backup key rather than losing it.
  try {
    await AsyncStorage.setItem(corruptBackupKey(key, Date.now()), raw);
  } catch (error) {
    // If even the backup fails, don't allow the original to be overwritten.
    return { status: 'failed', error };
  }
  console.warn('[localData] ignored unreadable saved data:', parsed.reason);
  return { status: 'corrupt', data: { profile: null, resume: null, sync: { revision: null, dirty: false } } };
}

export function saveOwnerData(owner, { profile, resume, sync }) {
  return writerFor(owner).save(serializeGuestData({ profile, resume, sync }));
}

export function clearOwnerData(owner) {
  return writerFor(owner).save(null);
}
