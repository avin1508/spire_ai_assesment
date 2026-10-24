import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import ScreenHeader from '../components/ScreenHeader';
import RoundIconButton from '../components/RoundIconButton';
import { profileEntryRemoved, selectProfile } from '../store/profileSlice';
import { formatDateRange } from '../utils/format';
import { colors, radius, spacing } from '../theme';

// How each list renders and where its form lives.
const LISTS = {
  experiences: {
    title: 'Experience',
    addLabel: 'Add Experience',
    form: 'ExperienceForm',
    empty: 'No experience added yet.',
    primary: (item) => item.title,
    secondary: (item) => item.company,
    meta: (item) => formatDateRange(item.startDate, item.endDate),
  },
  education: {
    title: 'Education',
    addLabel: 'Add Education',
    form: 'EducationForm',
    empty: 'No education added yet.',
    primary: (item) => item.institution,
    secondary: (item) => [item.degree, item.field].filter(Boolean).join(', '),
    meta: (item) => [item.startYear, item.endYear].filter(Boolean).join(' – '),
  },
};

// Full list of experience or education entries (route.params.list), with an
// edit mode (pencil in the header) that shows edit / delete on each card.
export default function ProfileEntriesScreen({ navigation, route }) {
  const config = LISTS[route.params.list];
  const dispatch = useDispatch();
  const profile = useSelector(selectProfile);
  const [editing, setEditing] = useState(Boolean(route.params?.editing));

  const entries = profile?.[route.params.list] ?? [];

  const confirmDelete = (item) =>
    Alert.alert('Delete entry?', `Remove "${config.primary(item)}" from your profile?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => dispatch(profileEntryRemoved({ list: route.params.list, id: item.id })),
      },
    ]);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={config.title}
        onBack={navigation.goBack}
        right={
          <RoundIconButton
            icon={editing ? 'checkmark' : 'pencil'}
            label={editing ? 'Done editing' : `Edit ${config.title.toLowerCase()}`}
            onPress={() => setEditing((value) => !value)}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.list}>
        {entries.length === 0 ? (
          <Text style={styles.empty}>{config.empty}</Text>
        ) : (
          entries.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardText}>
                <Text style={styles.primary}>{config.primary(item)}</Text>
                {config.secondary(item) ? (
                  <Text style={styles.secondary}>{config.secondary(item)}</Text>
                ) : null}
                {config.meta(item) ? <Text style={styles.meta}>{config.meta(item)}</Text> : null}
              </View>
              {editing && (
                <View style={styles.cardActions}>
                  <RoundIconButton
                    icon="pencil"
                    size={36}
                    label={`Edit ${config.primary(item)}`}
                    onPress={() => navigation.navigate(config.form, { entry: item })}
                  />
                  <Pressable
                    onPress={() => confirmDelete(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${config.primary(item)}`}
                    hitSlop={4}
                    style={styles.delete}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => navigation.navigate(config.form)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Ionicons name="add-circle" size={26} color={colors.surface} />
          <Text style={styles.addText}>{config.addLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  empty: {
    marginTop: spacing.xl,
    fontSize: 15,
    textAlign: 'center',
    color: colors.textMuted,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardText: {
    flex: 1,
  },
  primary: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.text,
  },
  secondary: {
    marginTop: spacing.xs,
    fontSize: 16,
    color: colors.textMuted,
  },
  meta: {
    marginTop: spacing.xs,
    fontSize: 15,
    color: colors.textMuted,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.sm,
  },
  delete: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDECEC',
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.cta,
  },
  pressed: {
    opacity: 0.85,
  },
  addText: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.surface,
  },
});
