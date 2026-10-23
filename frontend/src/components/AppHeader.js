import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, TOUCH_TARGET } from '../theme';

export default function AppHeader({
  title = 'Opportunities',
  notificationCount = 0,
  onUploadResume,
  onShare,
  onNotifications,
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <Pressable
        onPress={onUploadResume}
        accessibilityRole="button"
        accessibilityLabel="Upload resume"
        hitSlop={{ top: 6, bottom: 6 }}
        style={({ pressed }) => [styles.uploadButton, pressed && styles.pressed]}
      >
        <Text style={styles.uploadText} numberOfLines={1}>
          Upload Resume
        </Text>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel="Share"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons name="share-social-outline" size={24} color={colors.primary} />
        </Pressable>

        <Pressable
          onPress={onNotifications}
          accessibilityRole="button"
          accessibilityLabel={`Notifications, ${notificationCount} unread`}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons name="notifications-outline" size={24} color={colors.textMuted} />
          {notificationCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {notificationCount > 9 ? '9+' : notificationCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.title,
    flexShrink: 1,
  },
  uploadButton: {
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginLeft: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  uploadText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  pressed: {
    opacity: 0.7,
  },
  badge: {
    position: 'absolute',
    top: 7,
    right: 7,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.surface,
  },
});
