import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Button from '../components/Button';
import { useDispatch } from 'react-redux';
import { resumeSelected } from '../store/profileSlice';
import { pickResume } from '../utils/pickResume';
import { formatFileSize } from '../utils/format';
import { colors, radius, spacing } from '../theme';

// Confirms the picked resume before processing. Used for first uploads and
// for later resume updates (signed in or not).
export default function ResumeConfirmScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const [file, setFile] = useState(route.params.file);

  const size = formatFileSize(file.size);
  const extension = file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : null;
  const details = [extension, size].filter(Boolean).join(' · ');

  const chooseAnother = async () => {
    try {
      const next = await pickResume();
      if (next) setFile(next);
    } catch {
      Alert.alert("Couldn't open your files", 'Please try again.');
    }
  };

  const confirm = () => {
    dispatch(resumeSelected(file));
    navigation.replace('ProfileProcessing', { returnTo: route.params.returnTo });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Pressable
        onPress={navigation.goBack}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        style={styles.close}
      >
        <Ionicons name="close" size={26} color={colors.text} />
      </Pressable>

      <View style={styles.body}>
        <Text style={styles.heading}>Is this the correct resume?</Text>
        <Text style={styles.subheading}>
          Agent Sigma will read it to build your skills profile.
        </Text>

        <View style={styles.fileCard}>
          <View style={styles.fileIcon}>
            <Ionicons name="document-text-outline" size={28} color={colors.primary} />
          </View>
          <View style={styles.fileInfo}>
            <Text style={styles.fileName} numberOfLines={2}>
              {file.name}
            </Text>
            {details ? <Text style={styles.fileDetails}>{details}</Text> : null}
          </View>
          <Ionicons name="checkmark-circle" size={24} color={colors.success} />
        </View>
      </View>

      <View style={styles.footer}>
        <Button label="Yes, continue" onPress={confirm} />
        <Button
          label="Choose a different file"
          variant="outline"
          icon="swap-horizontal"
          onPress={chooseAnother}
          style={styles.secondary}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  close: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.text,
  },
  subheading: {
    marginTop: spacing.sm,
    fontSize: 15,
    textAlign: 'center',
    color: colors.textMuted,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  fileIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  fileInfo: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  fileDetails: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.lg,
  },
  secondary: {
    marginTop: spacing.md,
  },
});
