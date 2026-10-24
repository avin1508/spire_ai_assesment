import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow, spacing, TOUCH_TARGET } from '../theme';

// Visual-only map controls; a real map provider will wire these up later.
export default function MapControls({ onZoomIn, onZoomOut, onLocate, style }) {
  return (
    <View style={[styles.container, style]} pointerEvents="box-none">
      <View style={styles.card}>
        <ControlButton icon="add" label="Zoom in" onPress={onZoomIn} />
        <ControlButton icon="remove" label="Zoom out" onPress={onZoomOut} />
      </View>
      <View style={[styles.card, styles.locate]}>
        <ControlButton
          icon="locate"
          label="Go to current location"
          color={colors.primary}
          onPress={onLocate}
        />
      </View>
    </View>
  );
}

function ControlButton({ icon, label, color = colors.text, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={26} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  card: {
    borderRadius: 10,
    backgroundColor: colors.surface,
    ...shadow,
  },
  locate: {
    marginTop: spacing.md,
  },
  button: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  pressed: {
    backgroundColor: colors.background,
  },
});
