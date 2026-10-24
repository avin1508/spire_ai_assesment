import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import {
  guestDataRestored,
  profileConfirmed,
  profileEntryRemoved,
  profileEntrySaved,
  profileSaved,
  syncRecommendations,
} from './profileSlice';
import { selectIsGuest } from './sessionSlice';
import { buildMatchingProfile, matchingProfileKey } from '../utils/recommendations';

// Keeps the server's recommendations in step with the guest's profile:
// after a new resume is confirmed, the profile is saved or experience /
// education entries change, the matching profile (no personal details) is
// sent again — but only if a matching-relevant field actually changed.
// At start-up it is always sent: the server answers with the current status
// or results, so a restarted app recovers them (same profile = no new work).
// Signed-in users are not handled yet (guest flow only).

const EDIT_DEBOUNCE_MS = 1200;

export const recommendationSync = createListenerMiddleware();

let lastSentKey = null;

recommendationSync.startListening({
  matcher: isAnyOf(guestDataRestored, profileConfirmed, profileSaved, profileEntrySaved, profileEntryRemoved),
  effect: async (action, api) => {
    const state = api.getState();
    if (!selectIsGuest(state)) return;
    const matching = buildMatchingProfile(state.profile.profile);
    const key = matchingProfileKey(matching);
    if (!matching) return;

    const restoring = guestDataRestored.match(action);
    if (!restoring) {
      if (key === lastSentKey) return; // e.g. a company name or dates changed
      // Several quick edits → one request.
      api.cancelActiveListeners();
      await api.delay(EDIT_DEBOUNCE_MS);
    }
    lastSentKey = key;
    const result = await api.dispatch(syncRecommendations(matching));
    if (syncRecommendations.rejected.match(result)) lastSentKey = null; // send again next time
  },
});

// Retry after a failed sync (e.g. offline): sends the current matching profile.
export const resyncRecommendations = () => (dispatch, getState) => {
  const matching = buildMatchingProfile(getState().profile.profile);
  if (!matching) return null;
  lastSentKey = matchingProfileKey(matching);
  return dispatch(syncRecommendations(matching));
};
