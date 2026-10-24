import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import {
  ownerDataLoaded,
  profileConfirmed,
  profileEntryRemoved,
  profileEntrySaved,
  profileSaved,
  sessionCleared,
  syncRecommendations,
} from './profileSlice';
import { authFor } from '../services/api';
import { buildMatchingProfile, matchingProfileKey } from '../utils/recommendations';

// Keeps the server's recommendations in step with the current owner's
// profile (guest or signed-in account): after a new resume is confirmed,
// the profile is saved or experience / education entries change, the
// matching profile (no personal details) is sent again — but only if a
// matching-relevant field actually changed. When an owner's data is loaded
// (start-up, sign-in) it is always sent: the server answers with that
// owner's current status or results (same profile = no new work).
// The request carries the identity of the owner the profile belongs to, so
// it can't be sent as someone else after a login or logout.

const EDIT_DEBOUNCE_MS = 1200;

export const recommendationSync = createListenerMiddleware();

let lastSent = null; // `${owner}|${matching key}`

recommendationSync.startListening({
  actionCreator: sessionCleared,
  effect: () => {
    lastSent = null;
  },
});

recommendationSync.startListening({
  matcher: isAnyOf(ownerDataLoaded, profileConfirmed, profileSaved, profileEntrySaved, profileEntryRemoved),
  effect: async (action, api) => {
    const { owner, profile } = api.getState().profile;
    const matching = buildMatchingProfile(profile);
    if (!matching) return;
    const key = `${owner}|${matchingProfileKey(matching)}`;

    const loading = ownerDataLoaded.match(action);
    if (!loading) {
      if (key === lastSent) return; // e.g. a company name or dates changed
      // Several quick edits → one request.
      api.cancelActiveListeners();
      await api.delay(EDIT_DEBOUNCE_MS);
    }
    const auth = await authFor(owner);
    if (!auth || api.getState().profile.owner !== owner) return;
    lastSent = key;
    const result = await api.dispatch(syncRecommendations({ matchingProfile: matching, auth }));
    if (syncRecommendations.rejected.match(result)) lastSent = null; // send again next time
  },
});

// Retry after a failed sync (e.g. offline): sends the current matching profile.
export const resyncRecommendations = () => async (dispatch, getState) => {
  const { owner, profile } = getState().profile;
  const matching = buildMatchingProfile(profile);
  const auth = await authFor(owner);
  if (!matching || !auth) return null;
  lastSent = `${owner}|${matchingProfileKey(matching)}`;
  return dispatch(syncRecommendations({ matchingProfile: matching, auth }));
};
