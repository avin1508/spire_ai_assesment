import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing } from '../theme';

export default function BottomActionBar({ jobCount, companyCount, onViewCompanies, onViewJobs, style }) {
  return (
    <View style={[styles.container, style]} pointerEvents="box-none">
      <ActionPill
        icon="business"
        label={`View companies${companyCount != null ? ` (${companyCount})` : ''}`}
        onPress={onViewCompanies}
      />
      <ActionPill
        icon="briefcase-outline"
        label={`View jobs${jobCount != null ? ` (${jobCount})` : ''}`}
        onPress={onViewJobs}
      />
    </View>
  );
}

function ActionPill({ icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    marginLeft: spacing.sm,
    fontSize: 14,
    color: colors.text,
    flexShrink: 1,
  },
});
