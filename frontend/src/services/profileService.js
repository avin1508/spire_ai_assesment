import { apiRequest } from './api';
import { confirmedResumeMetadata } from '../utils/resumeProcessing';

// Client for the backend profile API (backend/src/routes/profile.routes.js):
// the owner's complete profile on the server. → { profile | null,
// revision | null, resume | null } with the resume in the app's metadata shape.

const fromServer = (data) => ({
  profile: data.profile ?? null,
  revision: data.revision ?? null,
  resume: data.resume ? confirmedResumeMetadata(data.resume) : null,
});

export async function fetchProfile(auth) {
  return fromServer(await apiRequest('/api/profile', { auth }));
}

/** Saves the profile if the server is still at `baseRevision`; 409 profile_conflict otherwise. */
export async function saveProfileToServer(profile, baseRevision, auth) {
  return fromServer(await apiRequest('/api/profile', { method: 'PUT', json: { profile, baseRevision }, auth }));
}
