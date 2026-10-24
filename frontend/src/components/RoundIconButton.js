import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

// Small circular icon button. variant: 'soft' (light blue) | 'solid' (blue).
// Without `onPress` it renders as a static, non-clickable icon.
export default function RoundIconButton({ icon, label, onPress, variant = 'soft', size = 40 }) {
  const solid = variant === 'solid';
  const interactive = Boolean(onPress);
  return (
    <Pressable
      onPress={onPress}
      disabled={!interactive}
      accessible={interactive}
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        solid ? styles.solid : styles.soft,
        interactive && pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={size * 0.55} color={solid ? colors.surface : colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  soft: {
    backgroundColor: colors.primaryLight,
  },
  solid: {
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
});
