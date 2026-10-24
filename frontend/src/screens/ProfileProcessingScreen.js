import { useEffect } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Button from '../components/Button';
import useResumeProcessing from '../hooks/useResumeProcessing';
import { pickResume } from '../utils/pickResume';
import { statusText, stepStates, toProfileFormValues } from '../utils/resumeProcessing';
import { colors, radius, spacing } from '../theme';

const STEPS = [
  'Analyzing experience and education',
  'Mapping skills and expertise levels',
  'Creating your skills profile',
];

// Uploads the confirmed resume and follows its processing on the server.
// Steps advance only with the stage the server reports (no timers). On
// success goes to the profile form with the extracted values; on failure
// shows the reason with Retry (or "Choose a different file" when retrying
// can't help). The current confirmed resume/profile are never touched here.
export default function ProfileProcessingScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { file, returnTo } = route.params;
  const { state, retry } = useResumeProcessing(file);

  const failed = state.phase === 'failed';
  const done = state.phase === 'completed';
  const steps = stepStates(state, STEPS.length);
  const status = statusText(state);

  // Show the ✓ briefly, then the profile form. Cancelled if the user leaves.
  useEffect(() => {
    if (!done) return undefined;
    const timer = setTimeout(
      () =>
        navigation.replace('ProfileConfirm', {
          extracted: toProfileFormValues(state.profile),
          pendingResume: state.file,
          returnTo,
        }),
      500
    );
    return () => clearTimeout(timer);
  }, [done, navigation, returnTo, state.file, state.profile]);

  const chooseAnother = async () => {
    try {
      const next = await pickResume();
      if (next) navigation.replace('ResumeConfirm', { file: next, returnTo });
    } catch {
      Alert.alert("Couldn't open your files", 'Please try again.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.body}>
        <View style={[styles.indicator, failed && styles.indicatorFailed]}>
          {failed ? (
            <Ionicons name="alert-circle-outline" size={44} color={colors.danger} />
          ) : done ? (
            <Ionicons name="checkmark" size={44} color={colors.success} />
          ) : (
            <ActivityIndicator size="large" color={colors.primary} />
          )}
        </View>

        <Text style={styles.heading}>
          {failed ? "We couldn't build your profile" : 'Building Your Profile'}
        </Text>
        <Text style={styles.subheading}>
          {failed
            ? 'Your current profile and resume have not been changed.'
            : 'Agent Sigma is reading your resume to understand your experience and skills.'}
        </Text>

        <View style={styles.steps}>
          {STEPS.map((step, index) => {
            const stepState = steps[index];
            return (
              <View key={step} style={styles.step}>
                {stepState === 'active' ? (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.stepIcon} />
                ) : (
                  <Ionicons
                    name={
                      stepState === 'done'
                        ? 'checkmark-circle'
                        : stepState === 'failed'
                          ? 'remove-circle-outline'
                          : 'ellipse-outline'
                    }
                    size={20}
                    color={stepState === 'done' ? colors.success : colors.textMuted}
                    style={styles.stepIcon}
                  />
                )}
                <Text style={[styles.stepText, stepState === 'pending' && styles.stepPending]}>
                  {step}
                </Text>
              </View>
            );
          })}
        </View>

        {status ? <Text style={styles.status}>{status}</Text> : null}

        {failed && (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={20} color={colors.fitText} />
            <Text style={styles.noticeText}>{state.error?.message ?? 'Something went wrong.'}</Text>
          </View>
        )}
      </View>

      {failed && (
        <View style={styles.footer}>
          {state.error?.retryable ? (
            <>
              <Button label="Try again" onPress={retry} />
              <Button label="Choose a different file" variant="text" onPress={chooseAnother} style={styles.retry} />
            </>
          ) : (
            <Button label="Choose a different file" onPress={chooseAnother} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  indicator: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  indicatorFailed: {
    backgroundColor: '#FDECEC',
  },
  heading: {
    marginTop: spacing.xl,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.text,
  },
  subheading: {
    marginTop: spacing.sm,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: colors.textMuted,
  },
  steps: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepIcon: {
    width: 20,
  },
  stepText: {
    marginLeft: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  stepPending: {
    color: colors.textMuted,
  },
  status: {
    marginTop: spacing.md,
    fontSize: 14,
    textAlign: 'center',
    color: colors.textMuted,
  },
  notice: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningBackground,
  },
  noticeText: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: 14,
    lineHeight: 20,
    color: colors.fitText,
  },
  footer: {
    padding: spacing.lg,
  },
  retry: {
    marginTop: spacing.xs,
  },
});
