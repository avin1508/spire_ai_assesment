import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import ScreenHeader from '../components/ScreenHeader';
import FormField from '../components/FormField';
import Button from '../components/Button';
import { profileEntrySaved } from '../store/profileSlice';
import { colors, spacing } from '../theme';

const MONTH_YEAR = /^(0[1-9]|1[0-2])\/\d{4}$/;

// "2026-04" ↔ "04/2026"
const toInput = (yearMonth) => (yearMonth ? `${yearMonth.slice(5)}/${yearMonth.slice(0, 4)}` : '');
const fromInput = (text) => `${text.slice(3)}-${text.slice(0, 2)}`;

// Add or edit one experience entry (route.params.entry when editing).
export default function ExperienceFormScreen({ navigation, route }) {
  const entry = route.params?.entry;
  const dispatch = useDispatch();
  const [values, setValues] = useState({
    title: entry?.title ?? '',
    company: entry?.company ?? '',
    start: toInput(entry?.startDate),
    end: toInput(entry?.endDate),
    current: entry ? entry.endDate == null : false,
  });
  const [errors, setErrors] = useState({});

  const update = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const save = () => {
    const next = {};
    if (!values.title.trim()) next.title = 'Enter a job title';
    if (!values.company.trim()) next.company = 'Enter the company name';
    if (!MONTH_YEAR.test(values.start)) next.start = 'Use MM/YYYY';
    if (!values.current) {
      if (!MONTH_YEAR.test(values.end)) next.end = 'Use MM/YYYY';
      else if (MONTH_YEAR.test(values.start) && fromInput(values.end) < fromInput(values.start)) {
        next.end = 'End date must be after the start date';
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    dispatch(
      profileEntrySaved({
        list: 'experiences',
        entry: {
          id: entry?.id ?? `exp-${Date.now()}`,
          // Added or edited by hand: kept when the resume is re-uploaded.
          source: 'manual',
          title: values.title.trim(),
          company: values.company.trim(),
          startDate: fromInput(values.start),
          endDate: values.current ? null : fromInput(values.end),
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
      <ScreenHeader title={entry ? 'Edit Experience' : 'Add Experience'} onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <FormField
          label="Job Title*"
          value={values.title}
          onChangeText={(text) => update('title', text)}
          error={errors.title}
        />
        <FormField
          label="Company*"
          value={values.company}
          onChangeText={(text) => update('company', text)}
          error={errors.company}
        />
        <FormField
          label="Start (MM/YYYY)*"
          value={values.start}
          onChangeText={(text) => update('start', text)}
          placeholder="04/2024"
          keyboardType="numbers-and-punctuation"
          maxLength={7}
          error={errors.start}
        />
        <Pressable
          onPress={() => update('current', !values.current)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: values.current }}
          style={styles.checkboxRow}
        >
          <View style={[styles.checkbox, values.current && styles.checkboxChecked]}>
            {values.current && <Ionicons name="checkmark" size={16} color={colors.surface} />}
          </View>
          <Text style={styles.checkboxLabel}>I currently work here</Text>
        </Pressable>
        {!values.current && (
          <FormField
            label="End (MM/YYYY)*"
            value={values.end}
            onChangeText={(text) => update('end', text)}
            placeholder="10/2025"
            keyboardType="numbers-and-punctuation"
            maxLength={7}
            error={errors.end}
          />
        )}
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginLeft: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  save: {
    marginTop: spacing.md,
  },
});
