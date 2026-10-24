import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  ensureRecommendations,
  fetchCurrentRecommendations,
  retryRecommendations as retryRecommendationsRequest,
} from '../services/recommendationService';
import { recommendationStateFrom } from '../utils/recommendations';

// Resume, confirmed profile and recommendation results for the current session.
// recommendations.status: 'idle' (nothing requested yet) | 'none' | 'queued' |
//   'processing' | 'deferred' (quota; waiting) | 'ready' | 'failed' | 'error'
//   (request failed). Results come only from the server (see utils/recommendations.js).
// storageStatus: 'loading' until saved guest data is restored at start-up;
//   'ready' once saving is allowed; 'readonly' if storage couldn't be read
//   (saving is then disabled so existing data is never overwritten).

const failure = (error) => ({ message: error?.message ?? 'Something went wrong.' });

// Sends the matching profile (sent after a profile change or at start-up).
export const syncRecommendations = createAsyncThunk(
  'profile/syncRecommendations',
  async (matchingProfile, { rejectWithValue }) => {
    try {
      return await ensureRecommendations(matchingProfile);
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

const profileSlice = createSlice({
  name: 'profile',
  initialState: {
    resume: null,
    // True when the saved resume metadata points at a file that no longer exists.
    resumeFileMissing: false,
    profile: null,
    recommendations: initialRecommendations,
    storageStatus: 'loading',
  },
  reducers: {
    // The user confirmed the profile extracted from a newly processed resume:
    // profile and resume change together (one save), never separately.
    profileConfirmed(state, action) {
      state.profile = action.payload.profile;
      state.resume = action.payload.resume;
      state.resumeFileMissing = false;
    },
    // The server no longer has the confirmed resume file.
    resumeFileMissingDetected(state) {
      state.resumeFileMissing = true;
    },
    guestDataRestored(state, action) {
      const { profile, resume, resumeFileMissing, storageStatus } = action.payload;
      state.profile = profile;
      state.resume = resume;
      state.resumeFileMissing = resumeFileMissing;
      state.storageStatus = storageStatus;
    },
    profileSaved(state, action) {
      state.profile = action.payload;
    },
    // Add or update one entry (matched by id) in profile.experiences / profile.education.
    profileEntrySaved(state, action) {
      const { list, entry } = action.payload;
      const entries = state.profile[list] ?? [];
      const index = entries.findIndex((item) => item.id === entry.id);
      if (index === -1) entries.unshift(entry);
      else entries[index] = entry;
      state.profile[list] = entries;
    },
    profileEntryRemoved(state, action) {
      const { list, id } = action.payload;
      state.profile[list] = (state.profile[list] ?? []).filter((item) => item.id !== id);
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
  guestDataRestored,
  profileSaved,
  profileEntrySaved,
  profileEntryRemoved,
} = profileSlice.actions;

// Saves the profile. Recommendations are refreshed by store/recommendationSync.js
// when matching-relevant fields change.
export const saveProfile = (profile) => (dispatch) => dispatch(profileSaved(profile));

export const selectResume = (state) => state.profile.resume;
export const selectProfile = (state) => state.profile.profile;
export const selectRecommendations = (state) => state.profile.recommendations;
export const selectResumeFileMissing = (state) => state.profile.resumeFileMissing;
export const selectStorageStatus = (state) => state.profile.storageStatus;

export default profileSlice.reducer;
