import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from './Button';
import { colors, radius, spacing } from '../theme';

const hero = require('../../assets/recommended-jobs-hero.png');

const COPY = {
  loading: {
    title: 'Agent Sigma is on the hunt',
    message: "We're finding jobs that match your skills and experience.",
  },
  empty: {
    title: 'Agent Sigma is on the hunt',
    message: "We couldn't find any matches based on your current skills and experience",
  },
  unavailable: {
    title: "Recommendations aren't ready yet",
  },
  deferred: {
    title: 'Your recommendations are on the way',
  },
  error: {
    title: 'Something went wrong',
  },
};

// Non-list states of the Recommended tab: loading, no matches, waiting for
// AI capacity (deferred), or unavailable / failed (with the service's own
// message and a retry).
export default function RecommendationStatus({ status, message, onRetry }) {
  const copy = COPY[status];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Image source={hero} style={styles.heroImage} resizeMode="cover" />
      </View>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.message}>{copy.message ?? message}</Text>
      {status === 'loading' && (
        <ActivityIndicator color={colors.primary} style={styles.spinner} />
      )}
      {(status === 'unavailable' || status === 'error') && onRetry && (
        <Button label="Try again" variant="text" onPress={onRetry} style={styles.retry} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  hero: {
    width: '85%',
    aspectRatio: 1536 / 1024,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    marginTop: spacing.xl,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.text,
  },
  message: {
    marginTop: spacing.sm,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    color: colors.textMuted,
  },
  spinner: {
    marginTop: spacing.lg,
  },
  retry: {
    marginTop: spacing.sm,
  },
});
