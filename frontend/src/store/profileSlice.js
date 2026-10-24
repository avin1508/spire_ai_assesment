import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { fetchRecommendations } from '../services/recommendationService';
import { ServiceUnavailableError } from '../services/errors';

// Resume, confirmed profile and recommendation results for the current session.
// recommendations.status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
// storageStatus: 'loading' until saved guest data is restored at start-up;
//   'ready' once saving is allowed; 'readonly' if storage couldn't be read
//   (saving is then disabled so existing data is never overwritten).

export const loadRecommendations = createAsyncThunk(
  'profile/loadRecommendations',
  async (profile, { rejectWithValue }) => {
    try {
      return await fetchRecommendations(profile);
    } catch (error) {
      return rejectWithValue({
        status: error instanceof ServiceUnavailableError ? 'unavailable' : 'error',
        message: error.message,
      });
    }
  }
);

const profileSlice = createSlice({
  name: 'profile',
  initialState: {
    resume: null,
    // True when the saved resume metadata points at a file that no longer exists.
    resumeFileMissing: false,
    profile: null,
    recommendations: { status: 'idle', items: [], message: null, requestId: null },
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
    builder
      // Only the latest request may set results; an older one finishing late is ignored.
      .addCase(loadRecommendations.pending, (state, action) => {
        state.recommendations = {
          status: 'loading',
          items: [],
          message: null,
          requestId: action.meta.requestId,
        };
      })
      .addCase(loadRecommendations.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.recommendations.requestId) return;
        state.recommendations = {
          status: 'ready',
          items: action.payload,
          message: null,
          requestId: action.meta.requestId,
        };
      })
      .addCase(loadRecommendations.rejected, (state, action) => {
        if (action.meta.requestId !== state.recommendations.requestId) return;
        state.recommendations = {
          status: action.payload?.status ?? 'error',
          items: [],
          message: action.payload?.message ?? action.error.message,
          requestId: action.meta.requestId,
        };
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

// Saves the profile. (Job recommendations are not part of this phase, so
// saving no longer requests them.)
export const saveProfile = (profile) => (dispatch) => dispatch(profileSaved(profile));

export const selectResume = (state) => state.profile.resume;
export const selectProfile = (state) => state.profile.profile;
export const selectRecommendations = (state) => state.profile.recommendations;
export const selectResumeFileMissing = (state) => state.profile.resumeFileMissing;
export const selectStorageStatus = (state) => state.profile.storageStatus;

export default profileSlice.reducer;
