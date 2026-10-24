import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { FIT_STYLES, LockableIcon } from '../components/JobCard';
import { selectIsGuest } from '../store/sessionSlice';
import useRequireAuth from '../hooks/useRequireAuth';
import { formatPostedAge } from '../utils/format';
import { parseDescription } from '../utils/parseDescription';
import { colors, radius, spacing } from '../theme';

// Full-screen details for the job passed in `route.params.job`.
// Guests see lock badges on email / save / apply and are asked to sign up.
export default function JobDetailsScreen({ navigation, route }) {
  const { job } = route.params;
  const insets = useSafeAreaInsets();
  const isGuest = useSelector(selectIsGuest);
  const { openLogin } = useRequireAuth();
  // After sign-in, come back to this job.
  const promptSignUp = () => openLogin({ name: 'JobDetails', params: { job } });

  const matched = job.matchedSkills ?? [];
  const gaps = job.gapSkills ?? [];
  const blocks = parseDescription(job.description);

  const share = () =>
    Share.share({
      message: [`${job.title} at ${job.company}`, job.applyUrl].filter(Boolean).join('\n'),
    });

  // Not built yet for signed-in users: there is no email or saved-jobs feature.
  const notAvailableYet = (feature) =>
    Alert.alert('Coming soon', `${feature} isn't available yet.`);

  const email = () => (isGuest ? promptSignUp() : notAvailableYet('Emailing this job'));
  const save = () => (isGuest ? promptSignUp() : notAvailableYet('Saving jobs'));

  const learn = (skill) =>
    isGuest
      ? promptSignUp()
      : navigation.navigate('Main', { screen: 'Learning', params: { skill } });

  const apply = async () => {
    if (isGuest) {
      promptSignUp();
      return;
    }
    try {
      await Linking.openURL(job.applyUrl);
    } catch {
      Alert.alert("Couldn't open the link", job.applyUrl);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={navigation.goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.headerButton}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Job Description</Text>
        <Pressable
          onPress={email}
          accessibilityRole="button"
          accessibilityLabel={isGuest ? 'Sign up to email this job' : 'Email this job'}
          style={styles.headerButton}
        >
          <LockableIcon icon="mail-outline" size={26} color={colors.textMuted} locked={isGuest} />
        </Pressable>
        <Pressable
          onPress={share}
          accessibilityRole="button"
          accessibilityLabel="Share job"
          style={styles.headerButton}
        >
          <Ionicons name="share-social-outline" size={24} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryTitleBlock}>
              <Text style={styles.jobTitle}>
                {job.title}
                {job.verified ? '  ' : ''}
                {job.verified ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                ) : null}
              </Text>
              <Text style={styles.company}>{job.company}</Text>
            </View>
            {job.fitLabel ? (
              <View style={[styles.fitPill, FIT_STYLES[job.fitLabel]?.pill]}>
                <Text style={[styles.fitText, FIT_STYLES[job.fitLabel]?.text]}>
                  {job.fitLabel}
                </Text>
              </View>
            ) : null}
            <Pressable
              onPress={save}
              accessibilityRole="button"
              accessibilityLabel={isGuest ? 'Sign up to save job' : 'Save job'}
              hitSlop={8}
              style={styles.save}
            >
              <LockableIcon
                icon="bookmark-outline"
                size={24}
                color={colors.textMuted}
                locked={isGuest}
              />
            </Pressable>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.meta}>
              <Ionicons name="location-outline" size={18} color={colors.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>
                {job.location}
              </Text>
            </View>
            {job.postedAt ? (
              <View style={styles.meta}>
                <Ionicons name="time-outline" size={18} color={colors.textMuted} />
                <Text style={styles.metaText}>{formatPostedAge(job.postedAt)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Job Skill Match Insights</Text>
        {matched.length === 0 && gaps.length === 0 ? (
          <Text style={styles.muted}>Skill match details aren't available for this job.</Text>
        ) : (
          <>
            {matched.length > 0 && (
              <>
                <View style={styles.insightHeader}>
                  <View style={styles.matchBar} />
                  <Text style={styles.insightTitle}>Exact Match ({matched.length})</Text>
                </View>
                <View style={styles.chips}>
                  {matched.map((skill) => (
                    <View key={skill} style={styles.chip}>
                      <Text style={styles.chipText}>{skill}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
            {gaps.length > 0 && (
              <>
                <View style={styles.insightHeader}>
                  <View style={styles.gapDotHalo}>
                    <View style={styles.gapDot} />
                  </View>
                  <Text style={styles.insightTitle}>Gaps ({gaps.length})</Text>
                </View>
                <View style={styles.chips}>
                  {gaps.map((skill) => (
                    <Pressable
                      key={skill}
                      onPress={() => learn(skill)}
                      accessibilityRole="button"
                      accessibilityLabel={isGuest ? `Sign up to learn ${skill}` : `Learn ${skill}`}
                      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                    >
                      <Text style={styles.chipText}>{skill}</Text>
                      <Ionicons name="book-outline" size={20} color={colors.primary} />
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        <Text style={[styles.sectionTitle, styles.descriptionTitle]}>Job Description</Text>
        {blocks.length === 0 ? (
          <Text style={styles.muted}>No description was provided for this job.</Text>
        ) : (
          blocks.map((block, index) => {
            if (block.type === 'heading') {
              return (
                <Text key={index} style={styles.blockHeading}>
                  {block.text}
                </Text>
              );
            }
            if (block.type === 'bullet') {
              return (
                <View key={index} style={styles.bullet}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{block.text}</Text>
                </View>
              );
            }
            return (
              <Text key={index} style={styles.paragraph}>
                {block.text}
              </Text>
            );
          })
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {job.applyUrl ? (
          <Pressable
            onPress={apply}
            accessibilityRole="link"
            accessibilityLabel={isGuest ? 'Sign up to apply on company site' : 'Apply on company site'}
            style={({ pressed }) => [styles.applyButton, pressed && styles.pressed]}
          >
            <Text style={styles.applyText}>Apply on company site</Text>
            <Ionicons name="open-outline" size={22} color={colors.primary} />
            {isGuest && (
              <View style={styles.applyLock}>
                <Ionicons name="lock-closed-outline" size={14} color={colors.primary} />
              </View>
            )}
          </Pressable>
        ) : (
          <View style={[styles.applyButton, styles.applyDisabled]}>
            <Text style={[styles.applyText, styles.applyDisabledText]}>
              Application link not available
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingHorizontal: spacing.xs,
  },
  headerButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  summary: {
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#CFE0F5',
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  summaryTitleBlock: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text,
  },
  company: {
    marginTop: spacing.xs,
    fontSize: 15,
    color: colors.textMuted,
  },
  fitPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.fitBackground,
  },
  fitText: {
    fontSize: 13,
    color: colors.fitText,
  },
  save: {
    marginLeft: spacing.md,
    paddingTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  metaText: {
    marginLeft: 6,
    fontSize: 15,
    color: colors.textMuted,
    flexShrink: 1,
  },
  sectionTitle: {
    marginTop: spacing.xl + spacing.sm,
    marginBottom: spacing.sm,
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  descriptionTitle: {
    marginBottom: 0,
  },
  muted: {
    fontSize: 15,
    color: colors.textMuted,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  matchBar: {
    width: 4,
    height: 22,
    marginRight: spacing.md,
    borderRadius: 2,
    backgroundColor: colors.success,
  },
  gapDotHalo: {
    width: 24,
    height: 24,
    marginRight: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDECEC',
  },
  gapDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.gapDot,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.chipBackground,
  },
  chipText: {
    fontSize: 15,
    color: colors.text,
  },
  pressed: {
    opacity: 0.7,
  },
  blockHeading: {
    marginTop: spacing.lg,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  paragraph: {
    marginTop: spacing.sm,
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
  },
  bullet: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    paddingLeft: spacing.sm,
  },
  bulletDot: {
    width: 18,
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  applyText: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.primary,
  },
  applyLock: {
    position: 'absolute',
    top: -9,
    right: 14,
    padding: 1,
    borderRadius: 9,
    backgroundColor: colors.surface,
  },
  applyDisabled: {
    borderColor: colors.border,
  },
  applyDisabledText: {
    color: colors.textMuted,
  },
});
