import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatPostedAge } from '../utils/format';
import { colors, radius, spacing } from '../theme';

const VISIBLE_MATCHES = 3;

// "Good Fit" uses the default yellow pill.
export const FIT_STYLES = {
  'Excellent Fit': {
    pill: { backgroundColor: '#DDF3E4' },
    text: { color: '#1E7A3E' },
  },
  'Average Fit': {
    pill: { backgroundColor: colors.chipBackground },
    text: { color: colors.textMuted },
  },
  'Weak Fit': {
    pill: { backgroundColor: '#FDECEC' },
    text: { color: colors.danger },
  },
};

// Recommended-job card shared by guest and signed-in users. For guests,
// `locked` adds a lock badge to save / learning actions; the parent decides
// what happens on press (e.g. ask the user to sign up). Tapping the card
// itself calls `onPress` (open the job's details).
export default function JobCard({ job, locked = false, onPress, onShare, onSave, onLearnSkill }) {
  const matched = job.matchedSkills ?? [];
  const gaps = job.gapSkills ?? [];
  const extraMatches = matched.length - VISIBLE_MATCHES;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${job.title} at ${job.company}`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>
            {job.title}
            {job.verified ? '  ' : ''}
            {job.verified ? (
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            ) : null}
          </Text>
          <Text style={styles.company} numberOfLines={1}>
            {job.company}
          </Text>
        </View>

        <View style={styles.sideBlock}>
          {job.fitLabel ? (
            <View style={[styles.fitPill, FIT_STYLES[job.fitLabel]?.pill]}>
              <Text style={[styles.fitText, FIT_STYLES[job.fitLabel]?.text]}>{job.fitLabel}</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <IconAction icon="share-social-outline" label="Share job" onPress={onShare} />
            <IconAction
              icon="bookmark-outline"
              label={locked ? 'Sign up to save job' : 'Save job'}
              locked={locked}
              onPress={onSave}
            />
          </View>
        </View>
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

      {matched.length > 0 && (
        <View style={styles.matchRow}>
          <View style={styles.matchBar} />
          <Text style={styles.matchText} numberOfLines={1}>
            <Text style={styles.muted}>Match: </Text>
            {matched.slice(0, VISIBLE_MATCHES).join(', ')}
          </Text>
          {extraMatches > 0 && (
            <View style={styles.morePill}>
              <Text style={styles.moreText}>+{extraMatches}</Text>
            </View>
          )}
        </View>
      )}

      {gaps.length > 0 && (
        <GapRow gaps={gaps} locked={locked} onLearnSkill={onLearnSkill} />
      )}
    </Pressable>
  );
}

// Missing skills, each with a Learning entry point. Shows a chevron when the
// chips overflow horizontally.
function GapRow({ gaps, locked, onLearnSkill }) {
  // Either measurement can arrive first, so keep both and compare.
  const [rowWidth, setRowWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const overflowing = rowWidth > 0 && contentWidth > rowWidth + 1;

  return (
    <View style={styles.gapRow}>
      <View style={styles.gapDotHalo}>
        <View style={styles.gapDot} />
      </View>
      <Text style={styles.muted}>Gaps :</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.gapScroll}
        contentContainerStyle={styles.gapChips}
        onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setContentWidth(width)}
      >
        {gaps.map((skill) => (
          <Pressable
            key={skill}
            onPress={() => onLearnSkill?.(skill)}
            accessibilityRole="button"
            accessibilityLabel={locked ? `Sign up to learn ${skill}` : `Learn ${skill}`}
            style={({ pressed }) => [styles.gapChip, pressed && styles.pressed]}
          >
            <Text style={styles.gapText}>{skill}</Text>
            <LockableIcon icon="book-outline" size={18} color={colors.primary} locked={locked} />
          </Pressable>
        ))}
      </ScrollView>
      {overflowing && <Ionicons name="chevron-forward" size={22} color={colors.primary} />}
    </View>
  );
}

function IconAction({ icon, label, locked, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
    >
      <LockableIcon icon={icon} size={22} color={colors.textMuted} locked={locked} />
    </Pressable>
  );
}

export function LockableIcon({ icon, size, color, locked }) {
  return (
    <View>
      <Ionicons name={icon} size={size} color={color} />
      {locked && (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed-outline" size={12} color={colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardPressed: {
    backgroundColor: colors.background,
  },
  topRow: {
    flexDirection: 'row',
  },
  titleBlock: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.text,
  },
  company: {
    marginTop: spacing.xs,
    fontSize: 15,
    color: colors.textMuted,
  },
  sideBlock: {
    alignItems: 'flex-end',
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
  actions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  iconAction: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  lockBadge: {
    position: 'absolute',
    top: -8,
    right: -9,
    borderRadius: 8,
    padding: 1,
    backgroundColor: colors.surface,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
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
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  matchBar: {
    width: 3,
    height: 20,
    borderRadius: 2,
    marginRight: spacing.sm,
    backgroundColor: colors.success,
  },
  matchText: {
    flexShrink: 1,
    fontSize: 15,
    color: colors.text,
  },
  muted: {
    fontSize: 15,
    color: colors.textMuted,
  },
  morePill: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moreText: {
    fontSize: 14,
    color: colors.primary,
  },
  gapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  gapDotHalo: {
    width: 24,
    height: 24,
    marginRight: spacing.sm,
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
  gapScroll: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  gapChips: {
    alignItems: 'center',
  },
  gapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.chipBackground,
  },
  gapText: {
    fontSize: 15,
    color: colors.text,
  },
});
