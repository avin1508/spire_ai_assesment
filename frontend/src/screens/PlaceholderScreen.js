import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../theme';

// Generic "coming soon" screen. Title/icon/message come from route params.
export default function PlaceholderScreen({ route }) {
  const { title = route.name, icon = 'construct-outline', message } = route.params ?? {};

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message ?? 'This section is coming soon.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  title: {
    ...typography.title,
    fontSize: 18,
    marginTop: spacing.md,
  },
  message: {
    ...typography.caption,
    fontSize: 14,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
