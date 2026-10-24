import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';

// Pill-shaped filter chip. Leading visual is an icon, a dot, or nothing.
// Without a label it renders as a compact icon-only button.
// variant: 'floating' (shadowed, over the map) | 'outline' (bordered, on white).
export default function FilterChip({
  label,
  icon,
  iconColor = colors.primary,
  dot = false,
  selected = false,
  disabled = false,
  variant = 'floating',
  labelColor,
  onPress,
  accessibilityLabel,
}) {
  const iconOnly = !label;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.chip,
        variant === 'outline' && styles.outline,
        iconOnly && styles.iconOnly,
        selected && styles.chipSelected,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {icon ? <Ionicons name={icon} size={iconOnly ? 20 : 16} color={iconColor} /> : null}
      {dot ? <View style={styles.dot} /> : null}
      {label ? (
        <Text
          style={[
            styles.label,
            labelColor && { color: labelColor },
            selected && styles.labelSelected,
          ]}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 14,
    marginRight: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
    elevation: 2,
    shadowColor: '#0B1B3F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  outline: {
    borderColor: colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  disabled: {
    opacity: 0.35,
  },
  iconOnly: {
    width: 40,
    paddingHorizontal: 0,
    justifyContent: 'center',
    borderRadius: 10,
  },
  chipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.75,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  label: {
    marginLeft: spacing.sm,
    fontSize: 14,
    color: colors.text,
  },
  labelSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
