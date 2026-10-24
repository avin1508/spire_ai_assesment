import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { profileConfirmed, saveProfile, selectProfile } from '../store/profileSlice';
import { selectUser } from '../store/sessionSlice';
import { confirmResume } from '../services/resumeService';
import { discardStagedResumes, removeLegacyLocalResumes } from '../storage/resumeFiles';
import { mergeExtractedProfile } from '../utils/profileMerge';
import { confirmedResumeMetadata } from '../utils/resumeProcessing';
import { colors, radius, spacing } from '../theme';

const EMPTY_PROFILE = {
  fullName: '',
  email: '',
  countryCode: '+91',
  phone: '',
  whatsappOptIn: false,
  currentRole: '',
  currentLocation: '',
  preferredLocations: [],
  experienceYears: '',
  experienceMonths: '',
  currentCompany: '',
  skills: [],
  experiences: [],
  education: [],
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values) {
  const errors = {};
  if (!values.fullName.trim()) errors.fullName = 'Enter your full name';
  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'Enter a valid email address';
  if (!/^\d{7,15}$/.test(values.phone.replace(/\s/g, ''))) {
    errors.phone = 'Enter a valid phone number';
  }
  if (!values.currentLocation.trim()) errors.currentLocation = 'Add your current location';
  if (values.preferredLocations.length === 0) {
    errors.preferredLocations = 'Add at least one preferred location';
  }
  const years = Number(values.experienceYears);
  const months = values.experienceMonths === '' ? 0 : Number(values.experienceMonths);
  if (values.experienceYears === '' || !Number.isInteger(years) || years < 0 || years > 60) {
    errors.experience = 'Enter your years of experience';
  } else if (!Number.isInteger(months) || months < 0 || months > 11) {
    errors.experience = 'Months must be between 0 and 11';
  }
  return errors;
}

// Editable profile form shown after resume processing. Pre-filled with
// extracted values when the parser returned any, otherwise with what we
// already know (an earlier profile or the signed-in user).
export default function ProfileConfirmScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const profile = useSelector(selectProfile);
  const user = useSelector(selectUser);
  const extracted = route.params?.extracted ?? null;
  // The newly processed resume (server summary); it becomes the user's resume
  // only when this profile is saved.
  const pendingResume = route.params?.pendingResume ?? null;
  const returnTo = route.params?.returnTo ?? 'Jobs';
  const [saving, setSaving] = useState(false);

  // A re-uploaded resume is merged into the existing profile, so experience /
  // education the user added by hand (and their skills) are kept.
  const [values, setValues] = useState(() => ({
    ...EMPTY_PROFILE,
    fullName: user?.name ?? '',
    email: user?.email ?? '',
    ...mergeExtractedProfile(profile, extracted),
  }));
  const [locationDraft, setLocationDraft] = useState('');
  const [preferredDraft, setPreferredDraft] = useState('');
  const [skillDraft, setSkillDraft] = useState('');
  const [errors, setErrors] = useState({});

  const update = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const addPreferred = (text = preferredDraft) => {
    const location = text.trim();
    if (!location) return values.preferredLocations;
    setPreferredDraft('');
    if (values.preferredLocations.includes(location)) return values.preferredLocations;
    const next = [...values.preferredLocations, location];
    update('preferredLocations', next);
    return next;
  };

  const addSkill = (text = skillDraft) => {
    const skill = text.trim();
    if (!skill) return values.skills;
    setSkillDraft('');
    if (values.skills.some((item) => item.toLowerCase() === skill.toLowerCase())) {
      return values.skills;
    }
    const next = [...values.skills, skill];
    update('skills', next);
    return next;
  };

  const goBack = () =>
    navigation.popTo(
      'Main',
      returnTo === 'Profile'
        ? { screen: 'Profile', params: { screen: 'ProfileHome' } }
        : { screen: 'Jobs', params: { screen: 'Recommended' } }
    );

  const submit = async () => {
    if (saving) return;
    // Include anything typed but not yet added as a chip.
    const finalValues = {
      ...values,
      currentLocation: values.currentLocation || locationDraft.trim(),
      preferredLocations: preferredDraft.trim() ? addPreferred() : values.preferredLocations,
      skills: skillDraft.trim() ? addSkill() : values.skills,
    };
    const nextErrors = validate(finalValues);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const profileToSave = {
      ...finalValues,
      fullName: finalValues.fullName.trim(),
      email: finalValues.email.trim(),
      phone: finalValues.phone.replace(/\s/g, ''),
      experienceMonths: finalValues.experienceMonths || '0',
    };

    if (!pendingResume) {
      dispatch(saveProfile(profileToSave));
      goBack();
      return;
    }

    // New resume: confirm it on the server first. Only then are the profile
    // and resume replaced (together); if this fails nothing changes.
    setSaving(true);
    let confirmed;
    try {
      ({ resume: confirmed } = await confirmResume(pendingResume.resumeId));
    } catch (error) {
      setSaving(false);
      Alert.alert(
        "Couldn't save your profile",
        `${error?.message ?? 'Please try again.'} Your previous profile and resume are unchanged.`
      );
      return;
    }
    dispatch(profileConfirmed({ profile: profileToSave, resume: confirmedResumeMetadata(confirmed) }));
    discardStagedResumes();
    removeLegacyLocalResumes();
    goBack();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.orb}>
            <View style={styles.orbInner} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.heading}>Let’s get your basics right</Text>
            <Text style={styles.subheading}>
              {extracted
                ? 'Here’s what I found. Let’s finalise your profile ✨'
                : 'Add your details so Agent Sigma can find matching jobs ✨'}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Field label="Full Name*" error={errors.fullName}>
            <TextInput
              style={styles.input}
              value={values.fullName}
              onChangeText={(text) => update('fullName', text)}
              autoComplete="name"
              textContentType="name"
            />
          </Field>

          <Field label="Email ID*" error={errors.email}>
            <TextInput
              style={styles.input}
              value={values.email}
              onChangeText={(text) => update('email', text)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </Field>

          <Field label="Phone Number*" error={errors.phone}>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.countryCode]}
                value={values.countryCode}
                onChangeText={(text) => update('countryCode', text)}
                keyboardType="phone-pad"
                accessibilityLabel="Country code"
              />
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.input, styles.flex]}
                value={values.phone}
                onChangeText={(text) => update('phone', text)}
                keyboardType="phone-pad"
                autoComplete="tel"
                accessibilityLabel="Phone number"
              />
            </View>
          </Field>

          <Pressable
            onPress={() => update('whatsappOptIn', !values.whatsappOptIn)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: values.whatsappOptIn }}
            style={styles.checkboxRow}
          >
            <View style={[styles.checkbox, values.whatsappOptIn && styles.checkboxChecked]}>
              {values.whatsappOptIn && (
                <Ionicons name="checkmark" size={16} color={colors.surface} />
              )}
            </View>
            <Text style={styles.checkboxLabel}>Receive job alerts and updates via WhatsApp</Text>
          </Pressable>

          <Field label="Current Role">
            <TextInput
              style={styles.input}
              value={values.currentRole}
              onChangeText={(text) => update('currentRole', text)}
            />
          </Field>

          <Field label="Current Location*" error={errors.currentLocation}>
            <View style={styles.row}>
              {values.currentLocation ? (
                <View style={styles.flex}>
                  <LocationChip
                    label={values.currentLocation}
                    onRemove={() => update('currentLocation', '')}
                  />
                </View>
              ) : (
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={locationDraft}
                  onChangeText={setLocationDraft}
                  onSubmitEditing={() => {
                    update('currentLocation', locationDraft.trim());
                    setLocationDraft('');
                  }}
                  placeholder="Add your current location"
                  placeholderTextColor="#9AA1AB"
                  returnKeyType="done"
                />
              )}
              <Pressable
                onPress={() =>
                  Alert.alert('Not available yet', 'Detecting your location is coming soon.')
                }
                accessibilityRole="button"
                accessibilityLabel="Use current location"
                style={styles.locate}
              >
                <Ionicons name="locate" size={24} color={colors.primary} />
              </Pressable>
            </View>
          </Field>

          <Field label="Preferred Work Locations*" error={errors.preferredLocations}>
            <TextInput
              style={styles.input}
              value={preferredDraft}
              onChangeText={setPreferredDraft}
              onSubmitEditing={() => addPreferred()}
              placeholder="Add preferred work locations to capture more jobs"
              placeholderTextColor="#9AA1AB"
              returnKeyType="done"
              blurOnSubmit={false}
            />
          </Field>
          {values.preferredLocations.length > 0 && (
            <View style={styles.chips}>
              {values.preferredLocations.map((location) => (
                <LocationChip
                  key={location}
                  label={location}
                  onRemove={() =>
                    update(
                      'preferredLocations',
                      values.preferredLocations.filter((item) => item !== location)
                    )
                  }
                />
              ))}
            </View>
          )}

          <Field label="Total Experience*" error={errors.experience}>
            <View style={styles.row}>
              <Text style={styles.inlineLabel}>Years :</Text>
              <TextInput
                style={[styles.input, styles.flex]}
                value={String(values.experienceYears)}
                onChangeText={(text) => update('experienceYears', text.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Years of experience"
              />
              <Text style={styles.inlineLabel}>Months :</Text>
              <TextInput
                style={[styles.input, styles.flex]}
                value={String(values.experienceMonths)}
                onChangeText={(text) => update('experienceMonths', text.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Months of experience"
              />
            </View>
          </Field>

          <Field label="Current Company">
            <TextInput
              style={styles.input}
              value={values.currentCompany}
              onChangeText={(text) => update('currentCompany', text)}
            />
          </Field>

          <Field label="Skills" last={values.skills.length === 0}>
            <TextInput
              style={styles.input}
              value={skillDraft}
              onChangeText={setSkillDraft}
              onSubmitEditing={() => addSkill()}
              placeholder="Add a skill and press enter"
              placeholderTextColor="#9AA1AB"
              returnKeyType="done"
              blurOnSubmit={false}
              accessibilityLabel="Add skill"
            />
          </Field>
          {values.skills.length > 0 && (
            <View style={[styles.chips, styles.chipsLast]}>
              {values.skills.map((skill) => (
                <LocationChip
                  key={skill}
                  label={skill}
                  onRemove={() =>
                    update(
                      'skills',
                      values.skills.filter((item) => item !== skill)
                    )
                  }
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {Object.values(errors).some(Boolean) && (
          <Text style={styles.footerError}>Please fix the highlighted fields.</Text>
        )}
        <Pressable
          onPress={submit}
          disabled={saving}
          accessibilityRole="button"
          accessibilityState={{ busy: saving, disabled: saving }}
          style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
        >
          {saving ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.doneText}>Done! Lets get started</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, error, last, children }) {
  return (
    <View style={[styles.field, last && styles.fieldLast]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.underline, error && styles.underlineError]}>{children}</View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function LocationChip({ label, onRemove }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label}`}
        hitSlop={8}
      >
        <Ionicons name="close" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xl,
  },
  orb: {
    width: 32,
    height: 32,
    marginTop: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(214, 120, 230, 0.35)',
  },
  orbInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#7B5CF5',
  },
  headerText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  heading: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
  },
  subheading: {
    marginTop: spacing.xs,
    fontSize: 15,
    color: colors.textMuted,
  },
  card: {
    padding: spacing.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  field: {
    marginBottom: spacing.lg,
  },
  fieldLast: {
    marginBottom: 0,
  },
  label: {
    fontSize: 15,
    color: colors.textMuted,
  },
  underline: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  underlineError: {
    borderBottomColor: colors.danger,
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 4,
    fontSize: 17,
    color: colors.text,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.danger,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  countryCode: {
    width: 44,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -spacing.xs,
    marginBottom: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  checkboxLabel: {
    flex: 1,
    marginLeft: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  locate: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  chipsLast: {
    marginBottom: 0,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    maxWidth: '100%',
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.chipBackground,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 15,
    color: colors.text,
  },
  inlineLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  footerError: {
    alignSelf: 'stretch',
    marginBottom: spacing.sm,
    fontSize: 13,
    color: colors.danger,
  },
  doneButton: {
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
  },
});
