import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';

// Outlined pill search input used on list screens (on white backgrounds).
export default function SearchField({ value, onChangeText, placeholder, editable = true }) {
  return (
    <View style={[styles.container, !editable && styles.disabled]}>
      <Ionicons name="search-outline" size={22} color={colors.primary} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9AA1AB"
        editable={editable}
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  disabled: {
    opacity: 0.8,
  },
  input: {
    flex: 1,
    height: '100%',
    marginLeft: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
});
