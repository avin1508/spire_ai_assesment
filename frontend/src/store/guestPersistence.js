import { createListenerMiddleware } from '@reduxjs/toolkit';
import { loadGuestData, saveGuestData } from '../storage/guestStore';
import { resumeFileExists } from '../storage/resumeFiles';
import { resolveRestore } from '../storage/restore';
import { guestDataRestored, loadRecommendations } from './profileSlice';
import { selectIsGuest } from './sessionSlice';

// Saves the guest's profile + resume metadata whenever they change, and
// restores them at start-up. Only guest data is written here — account data
// (after sign-in) will use the account namespace in a later phase.

export const guestPersistence = createListenerMiddleware();

guestPersistence.startListening({
  predicate: (action, current, previous) =>
    action.type !== guestDataRestored.type &&
    current.profile.storageStatus === 'ready' &&
    selectIsGuest(current) &&
    (current.profile.profile !== previous.profile.profile ||
      current.profile.resume !== previous.profile.resume),
  effect: (action, api) => {
    const { profile, resume } = api.getState().profile;
    saveGuestData({ profile, resume });
  },
});

// Reads saved guest data once at start-up. Never throws.
export const restoreGuestData = () => async (dispatch) => {
  let result;
  try {
    result = await loadGuestData();
  } catch (error) {
    result = { status: 'failed', error };
  }
  if (result.status === 'failed') {
    console.warn('[guestPersistence] storage unreadable; saving disabled this session');
  }

  const restored = resolveRestore(result, resumeFileExists);
  dispatch(guestDataRestored(restored));
  if (restored.profile) dispatch(loadRecommendations(restored.profile));
};
