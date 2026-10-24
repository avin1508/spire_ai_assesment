import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatPostedAge } from '../utils/format';
import { colors, radius, spacing } from '../theme';

// Compact job card for the All Jobs list and the map preview.
// `distanceKm` is shown only when the user's location is known.
export default function JobListItem({ job, onPress, onClose, style }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${job.title} at ${job.companyName}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={2}>
          {job.title}
          {job.verified ? '  ' : ''}
          {job.verified ? (
            <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
          ) : null}
        </Text>
        {onClose && (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
            hitSlop={10}
          >
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      <Text style={styles.company}>{job.companyName}</Text>

      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={16} color={colors.textMuted} />
        <Text style={styles.meta} numberOfLines={1}>
          {job.area}, {job.city}
          {typeof job.distanceKm === 'number' ? ` · ${Math.round(job.distanceKm)} km away` : ''}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="briefcase-outline" size={16} color={colors.textMuted} />
        <Text style={styles.meta} numberOfLines={1}>
          {job.experience} · {job.jobType} · {job.salary}
        </Text>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.skills}>
          {job.requiredSkills.slice(0, 3).map((skill) => (
            <View key={skill} style={styles.skill}>
              <Text style={styles.skillText}>{skill}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.age}>{formatPostedAge(job.postedAt)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.background,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: colors.text,
  },
  company: {
    marginTop: 2,
    fontSize: 15,
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  meta: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  skills: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  skill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.chipBackground,
  },
  skillText: {
    fontSize: 12,
    color: colors.text,
  },
  age: {
    marginLeft: spacing.sm,
    fontSize: 13,
    color: colors.textMuted,
  },
});
