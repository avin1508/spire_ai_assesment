import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  ensureRecommendations,
  fetchCurrentRecommendations,
  retryRecommendations as retryRecommendationsRequest,
} from '../services/recommendationService';
import { recommendationStateFrom } from '../utils/recommendations';
import {
  afterConflict,
  afterEdit,
  afterSaveFailed,
  afterSaveStarted,
  afterSaveSucceeded,
  initialSync,
  syncFromStorage,
} from '../utils/profileSync';

// Resume, confirmed profile and recommendation results of the current owner:
// `owner` is 'guest' or 'user:<id>' (utils/sessionRestore.js ownerFor). All
// of it is replaced together when the owner changes (ownerDataLoaded /
// sessionCleared), so one account's data never shows under another.
// sync: whether the profile is saved on the server (utils/profileSync.js).
// recommendations.status: 'idle' (nothing requested yet) | 'none' | 'queued' |
//   'processing' | 'deferred' (quota; waiting) | 'ready' | 'failed' | 'error'
//   (request failed). Results come only from the server (see utils/recommendations.js).
// storageStatus: 'loading' until saved guest data is restored at start-up;
//   'ready' once saving is allowed; 'readonly' if storage couldn't be read
//   (saving is then disabled so existing data is never overwritten).

const failure = (error) => ({ message: error?.message ?? 'Something went wrong.' });

// Sends the matching profile (sent after a profile change or at start-up).
// `auth` is the owner's identity captured when the profile changed.
export const syncRecommendations = createAsyncThunk(
  'profile/syncRecommendations',
  async ({ matchingProfile, auth }, { rejectWithValue }) => {
    try {
      return await ensureRecommendations(matchingProfile, auth);
    } catch (error) {
      return rejectWithValue(failure(error));
    }
  }
);

// Polls the current status. Skipped while a profile sync is in flight, so an
// older status can't replace the new profile's.
export const refreshRecommendations = createAsyncThunk(
  'profile/refreshRecommendations',
  async (_, { rejectWithValue }) => {
    try {
      return await fetchCurrentRecommendations();
    } catch (error) {
      return rejectWithValue(failure(error));
    }
  },
  { condition: (_, { getState }) => !getState().profile.recommendations.syncing }
);

export const retryRecommendations = createAsyncThunk(
  'profile/retryRecommendations',
  async (recommendationId, { rejectWithValue }) => {
    try {
      return await retryRecommendationsRequest(recommendationId);
    } catch (error) {
      return rejectWithValue(failure(error));
    }
  }
);

const initialRecommendations = {
  status: 'idle',
  items: [],
  recommendationId: null,
  profileVersion: null,
  nextAttemptAt: null,
  pollAfterMs: null,
  message: null,
  retryable: false,
  syncing: false,
  requestId: null,
};

const emptyOwnerData = {
  owner: 'guest',
  resume: null,
  // True when the saved resume metadata points at a file that no longer exists.
  resumeFileMissing: false,
  profile: null,
  recommendations: initialRecommendations,
  sync: initialSync,
};

const profileSlice = createSlice({
  name: 'profile',
  initialState: {
    ...emptyOwnerData,
    storageStatus: 'loading',
  },
  reducers: {
    // The user confirmed the profile extracted from a newly processed resume:
    // profile and resume change together (one save), never separately.
    profileConfirmed(state, action) {
      state.profile = action.payload.profile;
      state.resume = action.payload.resume;
      state.resumeFileMissing = false;
      state.sync = afterEdit(state.sync);
    },
    // The server no longer has the confirmed resume file.
    resumeFileMissingDetected(state) {
      state.resumeFileMissing = true;
    },
    // The data of one owner (the guest at start-up, or an account after
    // sign-in / restart) replaces whatever was shown. Recommendations of a
    // previous owner are dropped.
    ownerDataLoaded(state, action) {
      const { owner, profile, resume, resumeFileMissing = false, storageStatus = 'ready', sync } = action.payload;
      if (owner !== state.owner) state.recommendations = initialRecommendations;
      state.owner = owner;
      state.profile = profile;
      state.resume = resume;
      state.resumeFileMissing = resumeFileMissing;
      state.storageStatus = storageStatus;
      // A profile the server has never confirmed (e.g. saved before server
      // sync existed) still has to be saved there.
      state.sync = syncFromStorage(profile && !sync?.revision ? { ...sync, dirty: true } : sync);
    },
    // Logout: back to an empty guest.
    sessionCleared(state) {
      Object.assign(state, emptyOwnerData, { storageStatus: state.storageStatus === 'readonly' ? 'ready' : state.storageStatus });
    },
    profileSaved(state, action) {
      state.profile = action.payload;
      state.sync = afterEdit(state.sync);
    },
    // Add or update one entry (matched by id) in profile.experiences / profile.education.
    profileEntrySaved(state, action) {
      const { list, entry } = action.payload;
      const entries = state.profile[list] ?? [];
      const index = entries.findIndex((item) => item.id === entry.id);
      if (index === -1) entries.unshift(entry);
      else entries[index] = entry;
      state.profile[list] = entries;
      state.sync = afterEdit(state.sync);
    },
    profileEntryRemoved(state, action) {
      const { list, id } = action.payload;
      state.profile[list] = (state.profile[list] ?? []).filter((item) => item.id !== id);
      state.sync = afterEdit(state.sync);
    },
    // Server sync of the profile (store/profileServerSync.js); `owner` guards
    // against a result arriving after the owner changed.
    profileSyncStarted(state, action) {
      if (action.payload.owner === state.owner) state.sync = afterSaveStarted(state.sync);
    },
    profileSyncSucceeded(state, action) {
      const { owner, seq, revision, resume } = action.payload;
      if (owner !== state.owner) return;
      state.sync = afterSaveSucceeded(state.sync, { seq, revision });
      if (resume !== undefined && resume?.resumeId && !state.resume) state.resume = resume;
    },
    profileSyncFailed(state, action) {
      if (action.payload.owner === state.owner) state.sync = afterSaveFailed(state.sync, action.payload.message);
    },
    // The server has a newer profile: show it instead of the local copy.
    profileSyncConflict(state, action) {
      const { owner, profile, resume, revision } = action.payload;
      if (owner !== state.owner) return;
      state.profile = profile;
      state.resume = resume;
      state.sync = afterConflict(state.sync, revision);
    },
  },
  extraReducers: (builder) => {
    // Only the latest request may set results; an older one finishing late is ignored.
    const apply = (state, action) => {
      state.recommendations = {
        ...state.recommendations,
        ...recommendationStateFrom(action.payload),
        syncing: false,
        requestId: action.meta.requestId,
      };
    };
    const isLatest = (state, action) => action.meta.requestId === state.recommendations.requestId;

    builder
      // A new profile: hide the previous results straight away.
      .addCase(syncRecommendations.pending, (state, action) => {
        state.recommendations = { ...initialRecommendations, status: 'queued', syncing: true, requestId: action.meta.requestId };
      })
      .addCase(syncRecommendations.fulfilled, (state, action) => {
        if (isLatest(state, action)) apply(state, action);
      })
      .addCase(syncRecommendations.rejected, (state, action) => {
        if (!isLatest(state, action)) return;
        state.recommendations = {
          ...initialRecommendations,
          status: 'error',
          message: action.payload?.message ?? action.error.message,
          requestId: action.meta.requestId,
        };
      })
      .addCase(refreshRecommendations.pending, (state, action) => {
        state.recommendations.requestId = action.meta.requestId;
      })
      .addCase(refreshRecommendations.fulfilled, (state, action) => {
        const known = state.recommendations.profileVersion;
        // Ignore a status for another profile version (the sync decides which is current).
        if (!isLatest(state, action) || (known && action.payload.profileVersion && action.payload.profileVersion !== known)) return;
        apply(state, action);
      })
      // A failed poll keeps the current state; polling simply tries again.
      .addCase(retryRecommendations.pending, (state, action) => {
        state.recommendations.requestId = action.meta.requestId;
        state.recommendations.status = 'queued';
        state.recommendations.message = null;
      })
      .addCase(retryRecommendations.fulfilled, (state, action) => {
        if (isLatest(state, action)) apply(state, action);
      })
      .addCase(retryRecommendations.rejected, (state, action) => {
        if (!isLatest(state, action)) return;
        state.recommendations.status = 'error';
        state.recommendations.message = action.payload?.message ?? action.error.message;
      });
  },
});

export const {
  profileConfirmed,
  resumeFileMissingDetected,
  ownerDataLoaded,
  sessionCleared,
  profileSaved,
  profileEntrySaved,
  profileEntryRemoved,
  profileSyncStarted,
  profileSyncSucceeded,
  profileSyncFailed,
  profileSyncConflict,
} = profileSlice.actions;

// Saves the profile. Recommendations are refreshed by store/recommendationSync.js
// when matching-relevant fields change.
export const saveProfile = (profile) => (dispatch) => dispatch(profileSaved(profile));

export const selectResume = (state) => state.profile.resume;
export const selectProfile = (state) => state.profile.profile;
export const selectRecommendations = (state) => state.profile.recommendations;
export const selectResumeFileMissing = (state) => state.profile.resumeFileMissing;
export const selectStorageStatus = (state) => state.profile.storageStatus;
export const selectProfileSync = (state) => state.profile.sync;
export const selectOwner = (state) => state.profile.owner;

export default profileSlice.reducer;
