import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from './BottomSheet';
import { colors, spacing } from '../theme';

// "View companies": companies in the current results with their job counts.
export default function CompanySheet({ visible, jobs, onSelect, onClose }) {
  const counts = new Map();
  jobs.forEach((job) => counts.set(job.companyName, (counts.get(job.companyName) ?? 0) + 1));
  const companies = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`Companies (${companies.length})`}>
      <ScrollView>
        {companies.map(([name, count]) => (
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
