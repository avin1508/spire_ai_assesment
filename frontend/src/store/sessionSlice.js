import { createSlice } from '@reduxjs/toolkit';

// The signed-in user plus the shared guest login sheet. Every session starts
// as a guest; `signedIn` is dispatched only after the backend has accepted
// the email/password and issued a session (see store/auth.js).
//
// authSheet.intent: optional screen to open after a successful sign-in,
// e.g. { name: 'Main', params: { screen: 'Profile' } }.
// notice: a one-off message for the user (e.g. guest data couldn't be moved yet).
// notificationPrompt: our "get notified" sheet (store/pushRegistration.js).
const sessionSlice = createSlice({
  name: 'session',
  initialState: {
    user: null,
    authSheet: { visible: false, intent: null },
    notice: null,
    notificationPrompt: false,
  },
  reducers: {
    signedIn(state, action) {
      state.user = action.payload;
      state.authSheet = { visible: false, intent: null };
    },
    signedOut(state) {
      state.user = null;
      state.notice = null;
    },
    authSheetOpened(state, action) {
      // Only one sheet at a time: a second request while open is ignored.
      if (state.authSheet.visible || state.user) return;
      state.authSheet = { visible: true, intent: action.payload ?? null };
    },
    authSheetClosed(state) {
      state.authSheet = { visible: false, intent: null };
    },
    noticeShown(state, action) {
      state.notice = action.payload;
    },
    noticeDismissed(state) {
      state.notice = null;
    },
    notificationPromptOpened(state) {
      state.notificationPrompt = true;
    },
    notificationPromptClosed(state) {
      state.notificationPrompt = false;
    },
  },
});

export const {
  signedIn,
  signedOut,
  authSheetOpened,
  authSheetClosed,
  noticeShown,
  noticeDismissed,
  notificationPromptOpened,
  notificationPromptClosed,
} = sessionSlice.actions;

export const selectUser = (state) => state.session.user;
export const selectIsGuest = (state) => !state.session.user;
export const selectAuthSheet = (state) => state.session.authSheet;
export const selectNotice = (state) => state.session.notice;
export const selectNotificationPrompt = (state) => state.session.notificationPrompt;

export default sessionSlice.reducer;
