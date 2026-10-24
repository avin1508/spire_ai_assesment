import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing } from '../theme';

// Labelled, underlined text input with an inline error message.
export default function FormField({ label, error, style, ...inputProps }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        placeholderTextColor="#9AA1AB"
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 15,
    color: colors.textMuted,
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 4,
    fontSize: 17,
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inputError: {
    borderBottomColor: colors.danger,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.danger,
  },
});
