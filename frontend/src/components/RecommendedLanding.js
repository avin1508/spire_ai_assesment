import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Button from './Button';
import { colors, radius, spacing } from '../theme';

const hero = require('../../assets/recommended-jobs-hero.png');

// Recommended tab before the user has a profile. The job cards inside the
// hero illustration are decorative examples, not real recommendations.
export default function RecommendedLanding({ showSignUp, onUploadResume, onSignUp }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.badge}>
        <Ionicons name="sparkles" size={14} color={colors.primary} />
        <Text style={styles.badgeText}>Recommended Jobs</Text>
      </View>

      <Text style={styles.headline}>Jobs matched to you by Agent Sigma</Text>
      <Text style={styles.body}>
        Upload your resume and our AI agent will build your skills profile and match you with
        roles that fit your experience and preferred locations.
      </Text>

      {/* The frame sets the size; aspectRatio on the Image itself was ignored. */}
      <View style={styles.hero}>
        <Image
          source={hero}
          style={styles.heroImage}
          resizeMode="cover"
          accessibilityLabel="Illustration of a professional browsing example job matches"
        />
      </View>
      <Text style={styles.caption}>Example matches shown for illustration</Text>

      <Button
        label="Upload Resume"
        icon="cloud-upload-outline"
        onPress={onUploadResume}
        style={styles.upload}
      />
      {showSignUp && (
        <Button label="Sign Up to Explore More" variant="outline" onPress={onSignUp} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  headline: {
    marginTop: spacing.md,
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  body: {
    marginTop: spacing.sm,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  hero: {
    width: '100%',
    aspectRatio: 1536 / 1024,
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  caption: {
    marginTop: spacing.xs,
    fontSize: 12,
    textAlign: 'center',
    color: colors.textMuted,
  },
  upload: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
