import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import BottomSheet from './BottomSheet';
import Button from './Button';
import { selectNotificationPrompt } from '../store/sessionSlice';
import { dismissNotificationPrompt, enableNotifications } from '../store/pushRegistration';
import { colors, radius, spacing } from '../theme';

// Our own explanation before Android's notification permission dialog
// (shown once a profile is confirmed, see store/pushRegistration.js). The
// system dialog only appears after "Notify me", so it is never a surprise.
// Mounted once in App.js.
export default function NotificationPromptSheet() {
  const dispatch = useDispatch();
  const visible = useSelector(selectNotificationPrompt);
  const notNow = () => dispatch(dismissNotificationPrompt());

  return (
    <BottomSheet
      visible={visible}
      onClose={notNow}
      title="Get notified when your matches are ready"
      maxHeight="60%"
      footer={
        <View style={styles.actions}>
          <Button label="Notify me" icon="notifications-outline" onPress={() => dispatch(enableNotifications())} />
          <Button label="Not now" variant="text" onPress={notNow} style={styles.notNow} />
        </View>
      }
    >
      <View style={styles.body}>
        <View style={styles.icon}>
          <Ionicons name="notifications" size={28} color={colors.primary} />
        </View>
        <Text style={styles.text}>
          Agent Sigma is finding jobs that match your profile. We'll send you a notification as soon as
          your recommendations are ready — no spam, only updates about your job matches.
        </Text>
        <Text style={styles.hint}>You can turn notifications off anytime in your phone settings.</Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    backgroundColor: colors.primaryLight,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: colors.text,
  },
  hint: {
    marginTop: spacing.sm,
    fontSize: 13,
    textAlign: 'center',
    color: colors.textMuted,
  },
  actions: {
    paddingHorizontal: spacing.lg,
  },
  notNow: {
    marginTop: spacing.xs,
  },
});
