// Bookkeeping for saving the profile to the server (store/profileServerSync.js).
// The profile is "saved" only once the server confirms it:
//   - every local change marks it dirty and bumps editSeq
//   - a save sends the profile with the revision it is based on; success
//     clears dirty only if nothing changed while it was in flight
//   - a failed save (offline, server error) keeps it dirty and says so
//   - a conflict (the server has a newer revision) loads the server's version
//     instead: newer data on the server is never overwritten
// (No imports: this file is also loaded by the Node test runner.)

export const initialSync = { revision: null, dirty: false, status: 'idle', message: null, editSeq: 0 };

export const syncFromStorage = (stored) => ({
  ...initialSync,
  revision: stored?.revision ?? null,
  dirty: stored?.dirty === true,
  status: stored?.dirty === true ? 'pending' : 'idle',
});

export const afterEdit = (sync) => ({ ...sync, dirty: true, editSeq: sync.editSeq + 1, status: 'pending', message: null });

export const afterSaveStarted = (sync) => ({ ...sync, status: 'saving', message: null });

export function afterSaveSucceeded(sync, { seq, revision }) {
  const changedMeanwhile = sync.editSeq !== seq;
  return { ...sync, revision, dirty: changedMeanwhile, status: changedMeanwhile ? 'pending' : 'saved', message: null };
}

export const afterSaveFailed = (sync, message) => ({
  ...sync,
  status: 'failed',
  message: message || "Couldn't save your profile to the server. It will be retried.",
});

export const afterConflict = (sync, revision) => ({
  ...sync,
  revision,
  dirty: false,
  status: 'conflict',
  message: 'Your profile was changed on another device, so the latest saved version is shown.',
});

// What a save sends, or null when there is nothing to send.
export function saveRequest(state) {
  if (!state.profile || !state.sync.dirty) return null;
  return { profile: state.profile, baseRevision: state.sync.revision, seq: state.sync.editSeq };
}
