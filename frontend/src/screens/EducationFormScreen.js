import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useDispatch } from 'react-redux';
import ScreenHeader from '../components/ScreenHeader';
import FormField from '../components/FormField';
import Button from '../components/Button';
import { profileEntrySaved } from '../store/profileSlice';
import { colors, spacing } from '../theme';

const YEAR = /^\d{4}$/;

// Add or edit one education entry (route.params.entry when editing).
export default function EducationFormScreen({ navigation, route }) {
  const entry = route.params?.entry;
  const dispatch = useDispatch();
  const [values, setValues] = useState({
    institution: entry?.institution ?? '',
    degree: entry?.degree ?? '',
    field: entry?.field ?? '',
    startYear: entry?.startYear ?? '',
    endYear: entry?.endYear ?? '',
  });
  const [errors, setErrors] = useState({});

  const update = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const save = () => {
    const next = {};
    if (!values.institution.trim()) next.institution = 'Enter the institution name';
    if (!values.degree.trim()) next.degree = 'Enter the degree';
    if (values.startYear && !YEAR.test(values.startYear)) next.startYear = 'Use YYYY';
    if (values.endYear && !YEAR.test(values.endYear)) next.endYear = 'Use YYYY';
    else if (YEAR.test(values.startYear) && YEAR.test(values.endYear) && values.endYear < values.startYear) {
      next.endYear = 'End year must be after the start year';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    dispatch(
      profileEntrySaved({
        list: 'education',
        entry: {
          id: entry?.id ?? `edu-${Date.now()}`,
          // Added or edited by hand: kept when the resume is re-uploaded.
          source: 'manual',
          institution: values.institution.trim(),
          degree: values.degree.trim(),
          field: values.field.trim(),
          startYear: values.startYear,
          endYear: values.endYear,
        },
      })
    );
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title={entry ? 'Edit Education' : 'Add Education'} onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <FormField
          label="Institution*"
          value={values.institution}
          onChangeText={(text) => update('institution', text)}
          error={errors.institution}
        />
        <FormField
          label="Degree*"
          value={values.degree}
          onChangeText={(text) => update('degree', text)}
          placeholder="B.E."
          error={errors.degree}
        />
        <FormField
          label="Field of Study"
          value={values.field}
          onChangeText={(text) => update('field', text)}
        />
        <FormField
          label="Start Year"
          value={values.startYear}
          onChangeText={(text) => update('startYear', text.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={4}
          error={errors.startYear}
        />
        <FormField
          label="End Year"
          value={values.endYear}
          onChangeText={(text) => update('endYear', text.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={4}
          error={errors.endYear}
        />
        <Button label="Save" onPress={save} style={styles.save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  form: {
    padding: spacing.lg,
  },
  save: {
    marginTop: spacing.md,
  },
});
