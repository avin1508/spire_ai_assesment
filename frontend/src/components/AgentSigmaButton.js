import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

// Floating entry point for the Agent Sigma AI assistant.
export default function AgentSigmaButton({ onPress, style }) {
  return (
    <View style={[styles.halo, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Ask Agent Sigma"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name="sparkles" size={26} color={colors.surface} />
      </Pressable>
    </View>
  );
}

const SIZE = 58;
const HALO = 70;

const styles = StyleSheet.create({
  halo: {
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(31, 91, 214, 0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(31, 91, 214, 0.35)',
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    elevation: 6,
    shadowColor: '#0B1B3F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  pressed: {
    transform: [{ scale: 0.95 }],
  },
});
