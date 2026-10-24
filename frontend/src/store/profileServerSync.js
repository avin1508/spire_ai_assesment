import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import {
  ownerDataLoaded,
  profileConfirmed,
  profileEntryRemoved,
  profileEntrySaved,
  profileSaved,
  profileSyncConflict,
  profileSyncFailed,
  profileSyncStarted,
  profileSyncSucceeded,
} from './profileSlice';
import { authFor } from '../services/api';
import { fetchProfile, saveProfileToServer } from '../services/profileService';
import { saveRequest } from '../utils/profileSync';

// Saves the current owner's complete profile on the server after each
// change (and at start-up when a change is still unsaved). Each save names
// the server revision it is based on, so newer data on the server is never
// overwritten (a 409 loads the server's version instead). The identity is
// the owner's own (services/api.js authFor), so a save can't land on
// another account or guest after a login / logout. The app only reports the
// profile as saved once the server has confirmed it (utils/profileSync.js).

const SAVE_DEBOUNCE_MS = 800;

export const profileServerSync = createListenerMiddleware();

profileServerSync.startListening({
  matcher: isAnyOf(ownerDataLoaded, profileConfirmed, profileSaved, profileEntrySaved, profileEntryRemoved),
  effect: async (action, api) => {
    if (!saveRequest(api.getState().profile)) return;
    api.cancelActiveListeners(); // several quick edits → one save
    await api.delay(SAVE_DEBOUNCE_MS);
    await api.dispatch(flushProfileSync());
  },
});

const offlineMessage =
  "Couldn't reach the server. Your changes are kept on this phone and will be saved when you're back online.";

// One save of the current profile. → true when saved.
async function saveOnce(dispatch, getState) {
  const state = getState().profile;
  const request = saveRequest(state);
  if (!request || state.storageStatus !== 'ready') return false;
  const { owner } = state;
  const auth = await authFor(owner);
  if (!auth) return false;

  dispatch(profileSyncStarted({ owner }));
  try {
    const saved = await saveProfileToServer(request.profile, request.baseRevision, auth);
    dispatch(profileSyncSucceeded({ owner, seq: request.seq, revision: saved.revision }));
    return true;
  } catch (error) {
    if (error?.status === 409 && error.code === 'profile_conflict') {
      try {
        const latest = await fetchProfile(auth);
        dispatch(profileSyncConflict({ owner, ...latest }));
        return false;
      } catch (loadError) {
        error = loadError;
      }
    }
    dispatch(profileSyncFailed({ owner, message: error?.status === 0 ? offlineMessage : error?.message }));
    return false;
  }
}

let inFlight = null;
let rerun = false;

// Saves now (also used before linking and by "Retry"). Resolves when done;
// concurrent calls share one run, and edits made meanwhile are saved after it.
export const flushProfileSync = () => (dispatch, getState) => {
  if (inFlight) {
    rerun = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      let saved;
      do {
        rerun = false;
        saved = await saveOnce(dispatch, getState);
      } while (saved && (rerun || getState().profile.sync.dirty));
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
};
