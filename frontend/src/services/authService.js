import { ServiceUnavailableError } from './errors';

/**
 * Exchanges a Google ID token for an app session.
 *
 * Contract for the backend (not built yet):
 *   POST /api/auth/google  { idToken }
 *   → the server verifies the token with Google (signature, `aud` = our
 *     client IDs, `iss`, expiry), finds or creates the user, and returns
 *     { user: { id, name, email, picture }, sessionToken }.
 * The app must only treat the user as signed in after that response; the
 * name/email inside the token are never trusted on the client alone.
 *
 * Until the endpoint exists this always rejects, so no one is marked as
 * signed in just because Google returned a token.
 *
 * @param {string} idToken Google ID token from the sign-in flow.
 */
export async function signInWithGoogleToken(idToken) {
  if (!idToken) throw new Error('Google did not return an ID token.');
  throw new ServiceUnavailableError(
    "Google sign-in worked, but we can't finish signing you in yet: the server that verifies Google accounts isn't set up."
  );
}
