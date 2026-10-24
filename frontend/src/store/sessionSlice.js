import { createSlice } from '@reduxjs/toolkit';

// The signed-in user plus the shared guest login sheet. Every session starts
// as a guest; `signedIn` is dispatched only after the backend has verified
// the user's Google sign-in (see services/authService.js).
//
// authSheet.intent: optional screen to open after a successful sign-in,
// e.g. { name: 'Main', params: { screen: 'Profile' } }.
const sessionSlice = createSlice({
  name: 'session',
  initialState: {
    user: null,
    authSheet: { visible: false, intent: null },
  },
  reducers: {
    signedIn(state, action) {
      state.user = action.payload;
      state.authSheet = { visible: false, intent: null };
    },
    signedOut(state) {
      state.user = null;
    },
    authSheetOpened(state, action) {
      // Only one sheet at a time: a second request while open is ignored.
      if (state.authSheet.visible || state.user) return;
      state.authSheet = { visible: true, intent: action.payload ?? null };
    },
    authSheetClosed(state) {
      state.authSheet = { visible: false, intent: null };
    },
  },
});

export const { signedIn, signedOut, authSheetOpened, authSheetClosed } = sessionSlice.actions;

export const selectUser = (state) => state.session.user;
export const selectIsGuest = (state) => !state.session.user;
export const selectAuthSheet = (state) => state.session.authSheet;

export default sessionSlice.reducer;
