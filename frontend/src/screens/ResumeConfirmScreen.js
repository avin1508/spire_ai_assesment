import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Button from '../components/Button';
import { pickResume } from '../utils/pickResume';
import { stageResumeForUpload } from '../storage/resumeFiles';
import { formatFileSize } from '../utils/format';
import { validatePickedResume } from '../utils/resumeProcessing';
import { colors, radius, spacing } from '../theme';

// Confirms the picked resume before processing. Used for first uploads and
// for later resume updates. The current resume/profile stay unchanged until
// the user confirms the new profile.
export default function ResumeConfirmScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [file, setFile] = useState(route.params.file);
  const problem = validatePickedResume(file);

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

  const [saving, setSaving] = useState(false);

  // Stage a readable copy for the upload, then start processing. Nothing
  // saved (current resume or profile) changes here.
  const confirm = async () => {
    if (problem) {
      Alert.alert("This file can't be used", problem);
      return;
    }
    setSaving(true);
    let staged;
    try {
      staged = await stageResumeForUpload(file);
    } catch (error) {
      console.warn('[ResumeConfirm] could not read resume:', error?.message ?? error);
      setSaving(false);
      Alert.alert(
        "Couldn't read this file",
        'Please try again, or choose a different file. Your current resume has not been changed.'
      );
      return;
    }
    navigation.replace('ProfileProcessing', { file: staged, returnTo: route.params.returnTo });
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
            {problem ? <Text style={styles.fileProblem}>{problem}</Text> : null}
          </View>
          <Ionicons
            name={problem ? 'alert-circle' : 'checkmark-circle'}
            size={24}
            color={problem ? colors.danger : colors.success}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Button label="Yes, continue" onPress={confirm} loading={saving} disabled={Boolean(problem)} />
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
  fileProblem: {
    marginTop: 4,
    fontSize: 13,
    color: colors.danger,
  },
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
