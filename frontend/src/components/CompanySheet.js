import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from './BottomSheet';
import { colors, spacing } from '../theme';

// "View companies": companies in the current results with their job counts.
// `companies` is [{ value, count }] from the server (count desc), or null
// while loading; `error` + `onRetry` when it couldn't be loaded.
export default function CompanySheet({ visible, companies, error, onRetry, onSelect, onClose }) {
  const title = companies ? `Companies (${companies.length})` : 'Companies';

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView>
        {!companies && !error && <Text style={styles.status}>Loading…</Text>}
        {!companies && error && (
          <Pressable onPress={onRetry} accessibilityRole="button">
            <Text style={styles.status}>Couldn't load companies. Tap to retry.</Text>
          </Pressable>
        )}
        {companies?.map(({ value: name, count }) => (
          <Pressable
            key={name}
            onPress={() => onSelect(name)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.logo}>
              <Text style={styles.logoText}>{name[0]}</Text>
            </View>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.count}>
              {count} {count === 1 ? 'job' : 'jobs'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  status: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: 14,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    marginHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    opacity: 0.7,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  logoText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  name: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  count: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
