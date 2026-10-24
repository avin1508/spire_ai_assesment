import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

const SKELETON_COLOR = '#E6E8EC';

// Opacity pulse used as the shimmer of a placeholder.
function usePulse() {
  const value = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [value]);
  return value;
}

// Light-grey rounded placeholder with a subtle pulsing shimmer.
export default function Skeleton({ width, height, borderRadius = radius.pill, style }) {
  const opacity = usePulse();
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, borderRadius, opacity }, style]}
    />
  );
}

// Three dots that light up in turn, in a white pill (map "loading" indicator).
export function LoadingDots({ style }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 3, duration: 900, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  return (
    <View style={[styles.dotsPill, style]} accessibilityRole="progressbar" accessibilityLabel="Loading jobs">
      {[0, 1, 2].map((index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            {
              transform: [
                {
                  scale: progress.interpolate({
                    inputRange: [index, index + 0.5, index + 1],
                    outputRange: [0.45, 1, 0.45],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

// Placeholder with the shape of a JobListItem card.
export function JobListItemSkeleton({ style }) {
  return (
    <View style={[styles.card, style]} accessibilityLabel="Loading job">
      <Skeleton width="70%" height={18} borderRadius={radius.sm} />
      <Skeleton width="40%" height={14} borderRadius={radius.sm} style={styles.gap} />
      <Skeleton width="85%" height={14} borderRadius={radius.sm} style={styles.gap} />
      <Skeleton width="65%" height={14} borderRadius={radius.sm} style={styles.gap} />
      <View style={styles.chipsRow}>
        <Skeleton width={64} height={26} />
        <Skeleton width={72} height={26} />
        <Skeleton width={56} height={26} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: SKELETON_COLOR,
  },
  dotsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: 96,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.primary,
  },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gap: {
    marginTop: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
