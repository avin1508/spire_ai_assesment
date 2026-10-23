import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { fetchRecommendations } from '../services/recommendationService';
import { ServiceUnavailableError } from '../services/errors';

// Resume, confirmed profile and recommendation results for the current session.
// recommendations.status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'

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
    profile: null,
    recommendations: { status: 'idle', items: [], message: null },
  },
  reducers: {
    resumeSelected(state, action) {
      state.resume = action.payload;
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
      .addCase(loadRecommendations.pending, (state) => {
        state.recommendations = { status: 'loading', items: [], message: null };
      })
      .addCase(loadRecommendations.fulfilled, (state, action) => {
        state.recommendations = { status: 'ready', items: action.payload, message: null };
      })
      .addCase(loadRecommendations.rejected, (state, action) => {
        state.recommendations = {
          status: action.payload?.status ?? 'error',
          items: [],
          message: action.payload?.message ?? action.error.message,
        };
      });
  },
});

export const { resumeSelected, profileSaved, profileEntrySaved, profileEntryRemoved } =
  profileSlice.actions;

// Saves the confirmed profile and immediately asks for matching jobs.
export const saveProfile = (profile) => (dispatch) => {
  dispatch(profileSaved(profile));
  return dispatch(loadRecommendations(profile));
};

export const selectResume = (state) => state.profile.resume;
export const selectProfile = (state) => state.profile.profile;
export const selectRecommendations = (state) => state.profile.recommendations;

export default profileSlice.reducer;
