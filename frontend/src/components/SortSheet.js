import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet from './BottomSheet';
import { SORT_OPTIONS } from '../utils/jobFilters';
import { colors, spacing } from '../theme';

// "Sort By" sheet. Options whose data is missing (e.g. distance) are shown
// disabled instead of sorting on invented values.
export default function SortSheet({ visible, selected, isAvailable, onSelect, onClose }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sort By" showCloseButton>
      <View style={styles.list}>
        {SORT_OPTIONS.map((option) => {
          const available = isAvailable(option.id);
          const active = selected === option.id;
          return (
            <Pressable
              key={option.id}
              disabled={!available}
              onPress={() => onSelect(option.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, disabled: !available }}
              style={[styles.option, !available && styles.disabled]}
            >
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <View style={styles.radioDot} />}
              </View>
              <View style={styles.labelBlock}>
                <Text style={styles.label}>{option.label}</Text>
                {!available && <Text style={styles.hint}>Not available for these jobs</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  disabled: {
    opacity: 0.45,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#B8BEC9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  labelBlock: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  label: {
    fontSize: 17,
    color: colors.text,
  },
  hint: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
  },
});
