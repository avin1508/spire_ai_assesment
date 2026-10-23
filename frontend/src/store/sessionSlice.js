import { createSlice } from '@reduxjs/toolkit';

// The signed-in user. There is no auth backend yet, so every session starts
// as a guest; `signedIn` / `signedOut` are what the auth flow will dispatch.
const sessionSlice = createSlice({
  name: 'session',
  initialState: { user: null },
  reducers: {
    signedIn(state, action) {
      state.user = action.payload;
    },
    signedOut(state) {
      state.user = null;
    },
  },
});

export const { signedIn, signedOut } = sessionSlice.actions;

export const selectUser = (state) => state.session.user;
export const selectIsGuest = (state) => !state.session.user;

export default sessionSlice.reducer;
