import { configureStore } from '@reduxjs/toolkit';
import sessionReducer from './sessionSlice';
import profileReducer from './profileSlice';
import { localPersistence } from './localPersistence';
import { profileServerSync } from './profileServerSync';
import { recommendationSync } from './recommendationSync';
import { pushRegistration, watchPushToken } from './pushRegistration';
import { sessionRejected } from './auth';
import { setSessionRejectedHandler } from '../services/api';

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    profile: profileReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(
      localPersistence.middleware,
      profileServerSync.middleware,
      recommendationSync.middleware,
      pushRegistration.middleware
    ),
});

// A request whose session the server rejects signs the user out on this phone.
setSessionRejectedHandler(() => store.dispatch(sessionRejected()));

// A rotated push token is registered again for the current owner.
watchPushToken(store);
