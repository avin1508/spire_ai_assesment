import { createListenerMiddleware } from '@reduxjs/toolkit';
import { saveOwnerData } from '../storage/localData';
import { ownerDataLoaded } from './profileSlice';

// Saves the current owner's profile + resume metadata + sync state on the
// device whenever they change — under the guest key for a guest and under
// the account's own key when signed in (storage/localData.js), so the two
// can't mix. Loading happens in store/auth.js (restoreSession).

export const localPersistence = createListenerMiddleware();

localPersistence.startListening({
  predicate: (action, current, previous) =>
    action.type !== ownerDataLoaded.type &&
    current.profile.storageStatus === 'ready' &&
    current.profile.owner === previous.profile.owner &&
    (current.profile.profile !== previous.profile.profile ||
      current.profile.resume !== previous.profile.resume ||
      current.profile.sync.revision !== previous.profile.sync.revision ||
      current.profile.sync.dirty !== previous.profile.sync.dirty),
  effect: (action, api) => {
    const { owner, profile, resume, sync } = api.getState().profile;
    saveOwnerData(owner, { profile, resume, sync });
  },
});
