import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import GoogleSignInButton from './GoogleSignInButton';
import { authSheetClosed, selectAuthSheet, signedIn } from '../store/sessionSlice';
import { signInWithGoogleToken } from '../services/authService';
import { navigationRef } from '../navigation/navigationRef';
import { colors, radius, spacing } from '../theme';

const illustration = require('../../assets/guest-login-male.png');
const ILLUSTRATION_RATIO = 1087 / 1447; // width / height of the PNG

const BENEFITS = [
  { icon: 'flash', title: 'Matches your skills', text: 'Get relevant job recommendations.' },
  { icon: 'ribbon', title: 'Curated opportunities', text: 'See high-quality roles from top companies.' },
  { icon: 'refresh', title: 'Updated daily', text: 'New opportunities are added every day.' },
];

// The one guest login sheet for the whole app. Mounted once in App.js and
// opened through Redux (useRequireAuth → authSheetOpened).
export default function GuestLoginSheet() {
  const dispatch = useDispatch();
  const { visible, intent } = useSelector(selectAuthSheet);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const illustrationWidth = Math.min(width * 0.42, 200);

  const close = () => {
    if (busy) return;
    setError(null);
    dispatch(authSheetClosed());
  };

  const handleIdToken = async (idToken) => {
    setError(null);
    setBusy(true);
    try {
      const { user } = await signInWithGoogleToken(idToken);
      dispatch(signedIn(user));
      if (intent && navigationRef.isReady()) navigationRef.navigate(intent.name, intent.params);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />

          <View style={styles.topRow}>
            <View style={styles.badge}>
              <Ionicons name="lock-closed" size={14} color={colors.primary} />
              <Text style={styles.badgeText}>GUEST MODE</Text>
            </View>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              style={styles.close}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.body}>
            <View style={[styles.textColumn, { marginRight: illustrationWidth * 0.7 }]}>
              <Text style={styles.heading}>
                Get <Text style={styles.headingAccent}>personalized job recommendations</Text>
              </Text>
              <Text style={styles.subtext}>
                Create an account to see roles matched to your skills, experience, and goals —
                refreshed every day.
              </Text>

              {BENEFITS.map((benefit) => (
                <View key={benefit.title} style={styles.benefit}>
                  <View style={styles.benefitIcon}>
                    <Ionicons name={benefit.icon} size={16} color={colors.primary} />
                  </View>
                  <View style={styles.benefitText}>
                    <Text style={styles.benefitTitle}>{benefit.title}</Text>
                    <Text style={styles.benefitSub}>{benefit.text}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Image
              source={illustration}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              style={[
                styles.illustration,
                { width: illustrationWidth, height: illustrationWidth / ILLUSTRATION_RATIO },
              ]}
            />
          </View>

          {error ? (
            <View style={styles.error}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <GoogleSignInButton
            busy={busy}
            onIdToken={handleIdToken}
            onError={(message) => {
              setBusy(false);
              setError(message);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    paddingHorizontal: spacing.xl,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    marginTop: spacing.md,
    borderRadius: 2,
    backgroundColor: '#D0D5DD',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.primary,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  body: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  textColumn: {
    zIndex: 1,
  },
  heading: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    color: colors.text,
  },
  headingAccent: {
    color: colors.primary,
  },
  subtext: {
    marginTop: spacing.md,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.lg,
  },
  benefitIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  benefitText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  benefitSub: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  illustration: {
    position: 'absolute',
    right: -spacing.xl,
    bottom: -spacing.lg,
  },
  error: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#FDECEC',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
});
