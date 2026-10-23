import { configureStore } from '@reduxjs/toolkit';
import sessionReducer from './sessionSlice';
import profileReducer from './profileSlice';

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    profile: profileReducer,
  },
});
