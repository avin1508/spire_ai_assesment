import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  GOOGLE_CLIENT_IDS,
  isGoogleSignInConfigured,
  missingGoogleClientIdVar,
} from '../config/auth';
import { colors, radius, spacing } from '../theme';

// Closes the browser tab when Google redirects back to the app.
WebBrowser.maybeCompleteAuthSession();

// "Continue with Google". Calls onIdToken(idToken) after Google sign-in
// succeeds; onError(message) for failures. Cancelling does nothing.
// Google's hook throws without a client ID, so it only mounts when configured.
export default function GoogleSignInButton({ onIdToken, onError, busy }) {
  if (!isGoogleSignInConfigured) {
    return (
      <ButtonView
        onPress={() =>
          onError(
            `Google Sign-In isn't configured for this build. Add ${missingGoogleClientIdVar} to frontend/.env and restart the app.`
          )
        }
      />
    );
  }
  return <ConfiguredButton onIdToken={onIdToken} onError={onError} busy={busy} />;
}

function ConfiguredButton({ onIdToken, onError, busy }) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(GOOGLE_CLIENT_IDS);
  const [prompting, setPrompting] = useState(false);

  useEffect(() => {
    if (!response) return;
    setPrompting(false);
    if (response.type === 'success') {
      const idToken = response.params?.id_token || response.authentication?.idToken;
      if (idToken) onIdToken(idToken);
      else onError('Google did not return an ID token. Please try again.');
    } else if (response.type === 'error') {
      onError(response.error?.message || 'Google sign-in failed. Please try again.');
    }
    // 'cancel' / 'dismiss': the user closed Google's page — stay as a guest.
  }, [response]);

  const start = async () => {
    setPrompting(true);
    try {
      await promptAsync();
    } catch {
      setPrompting(false);
      onError("Couldn't open Google sign-in. Check your connection and try again.");
    }
  };

  return <ButtonView onPress={start} disabled={!request} loading={busy || prompting} />;
}

function ButtonView({ onPress, disabled, loading }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <Ionicons name="logo-google" size={22} color="#4285F4" />
          <Text style={styles.label}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: colors.surface,
    shadowColor: '#0B1B3F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pressed: {
    backgroundColor: colors.background,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
});
