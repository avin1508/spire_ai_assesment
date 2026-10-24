import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import Button from '../components/Button';
import { selectResume } from '../store/profileSlice';
import { parseResume } from '../services/resumeService';
import { colors, radius, spacing } from '../theme';

const STEPS = [
  'Analyzing experience and education',
  'Mapping skills and expertise levels',
  'Creating your skills profile',
];

// How often the next step is highlighted while parsing is in progress.
// The parser reports no real progress, so this is a UI-only indicator; all
// steps are marked done only when parsing actually resolves.
const STEP_INTERVAL_MS = 1000;

// Sends the confirmed resume for parsing. On success goes to the profile form
// with the extracted values; on failure says so and offers manual entry.
export default function ProfileProcessingScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const resume = useSelector(selectResume);
  const returnTo = route.params?.returnTo;
  const [error, setError] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [done, setDone] = useState(false);

  const run = useCallback(async () => {
    setError(null);
    setDone(false);
    setActiveStep(0);
    try {
      const extracted = await parseResume(resume);
      setDone(true);
      setTimeout(() => navigation.replace('ProfileConfirm', { extracted, returnTo }), 500);
    } catch (err) {
      setError(err.message);
    }
  }, [navigation, resume, returnTo]);

  useEffect(() => {
    run();
  }, [run]);

  const failed = error != null;

  useEffect(() => {
    if (failed || done) return undefined;
    const timer = setInterval(
      () => setActiveStep((step) => Math.min(step + 1, STEPS.length - 1)),
      STEP_INTERVAL_MS
    );
    return () => clearInterval(timer);
  }, [failed, done]);

  const stepState = (index) => {
    if (failed) return 'failed';
    if (done || index < activeStep) return 'done';
    return index === activeStep ? 'active' : 'pending';
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
            ? 'You can enter your details yourself instead.'
            : 'Agent Sigma is reading your resume to understand your experience and skills.'}
        </Text>

        <View style={styles.steps}>
          {STEPS.map((step, index) => {
            const state = stepState(index);
            return (
              <View key={step} style={styles.step}>
                {state === 'active' ? (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.stepIcon} />
                ) : (
                  <Ionicons
                    name={
                      state === 'done'
                        ? 'checkmark-circle'
                        : state === 'failed'
                          ? 'remove-circle-outline'
                          : 'ellipse-outline'
                    }
                    size={20}
                    color={state === 'done' ? colors.success : colors.textMuted}
                    style={styles.stepIcon}
                  />
                )}
                <Text style={[styles.stepText, state === 'pending' && styles.stepPending]}>
                  {step}
                </Text>
              </View>
            );
          })}
        </View>

        {failed && (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={20} color={colors.fitText} />
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        )}
      </View>

      {failed && (
        <View style={styles.footer}>
          <Button
            label="Fill in details manually"
            onPress={() => navigation.replace('ProfileConfirm', { extracted: null, returnTo })}
          />
          <Button label="Try again" variant="text" onPress={run} style={styles.retry} />
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
