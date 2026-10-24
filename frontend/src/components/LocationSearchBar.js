import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing } from '../theme';

const VIEW_MODES = [
  { id: 'list', icon: 'list', label: 'List view' },
  { id: 'map', icon: 'location-outline', label: 'Map view' },
];

export default function LocationSearchBar({
  value,
  onChangeText,
  viewMode,
  onChangeViewMode,
  placeholder = 'Search Location',
}) {
  return (
    <View style={styles.row}>
      <View style={styles.search}>
        <Ionicons name="location-outline" size={22} color={colors.primary} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9AA1AB"
          returnKeyType="search"
          accessibilityLabel="Search location"
        />
      </View>

      <View style={styles.toggle}>
        {VIEW_MODES.map((mode) => {
          const active = viewMode === mode.id;
          return (
            <Pressable
              key={mode.id}
              onPress={() => onChangeViewMode?.(mode.id)}
              accessibilityRole="button"
              accessibilityLabel={mode.label}
              accessibilityState={{ selected: active }}
              style={[styles.toggleButton, active && styles.toggleButtonActive]}
            >
              <Ionicons
                name={mode.icon}
                size={20}
                color={active ? colors.surface : colors.primary}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const HEIGHT = 46;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: HEIGHT,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow,
  },
  input: {
    flex: 1,
    height: '100%',
    marginLeft: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEIGHT,
    marginLeft: spacing.sm,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow,
  },
  toggleButton: {
    width: 40,
    height: HEIGHT - 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
  },
});
