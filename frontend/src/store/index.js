import { configureStore } from '@reduxjs/toolkit';
import sessionReducer from './sessionSlice';
import profileReducer from './profileSlice';
import { guestPersistence } from './guestPersistence';
import { recommendationSync } from './recommendationSync';

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    profile: profileReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(guestPersistence.middleware, recommendationSync.middleware),
});
