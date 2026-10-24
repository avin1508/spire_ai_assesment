import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import FormField from '../components/FormField';
import Button from '../components/Button';
import { authenticate } from '../store/auth';
import { authErrorMessage, validateLoginForm, validateRegisterForm } from '../utils/authValidation';
import { navigationRef } from '../navigation/navigationRef';
import useKeyboardVisible from '../hooks/useKeyboardVisible';
import { colors, radius, spacing } from '../theme';

// Login and Register (email + password). On success the guest's data is
// linked to the account (store/auth.js) and the screen closes, opening the
// screen the user was headed to (route.params.intent), if any.

const COPY = {
  login: {
    title: 'Welcome back',
    subtitle: 'Log in to see your profile and job recommendations.',
    submit: 'Log in',
    switchText: "Don't have an account?",
    switchLink: 'Register',
  },
  register: {
    title: 'Create your account',
    subtitle: 'Save your profile and get personalised job recommendations.',
    submit: 'Register',
    switchText: 'Already have an account?',
    switchLink: 'Log in',
  },
};

const FIELDS = {
  login: ['email', 'password'],
  register: ['name', 'email', 'password', 'confirmPassword'],
};

export default function AuthScreen({ mode, navigation, route }) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const dispatch = useDispatch();
  const copy = COPY[mode];
  const [values, setValues] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false); // blocks a second submit before the state update lands

  const update = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: null }));
  };

  const submit = async () => {
    if (inFlight.current) return;
    const found = mode === 'register' ? validateRegisterForm(values) : validateLoginForm(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    inFlight.current = true;
    setSubmitting(true);
    try {
      await dispatch(authenticate({ mode, values }));
      const intent = route.params?.intent;
      navigation.goBack();
      if (intent && navigationRef.isReady()) navigationRef.navigate(intent.name, intent.params);
    } catch (error) {
      const fieldErrors = {};
      (error?.details ?? []).forEach(({ param, message }) => {
        if (FIELDS[mode].includes(param)) fieldErrors[param] = message;
      });
      setErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) setFormError(authErrorMessage(error));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    if (submitting) return;
    navigation.replace(mode === 'login' ? 'Register' : 'Login', route.params);
  };

  return (
    // 'padding' keeps the form above the keyboard where the window isn't
    // resized for it (it adds nothing when it is); the form scrolls.
    <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior="padding">
      <View style={styles.header}>
        <Pressable
          onPress={() => !submitting && navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          style={styles.close}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: (keyboardVisible ? 0 : insets.bottom) + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>

        {mode === 'register' && (
          <FormField
            label="Name*"
            value={values.name}
            onChangeText={(text) => update('name', text)}
            error={errors.name}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            editable={!submitting}
          />
        )}
        <FormField
          label="Email*"
          value={values.email}
          onChangeText={(text) => update('email', text)}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          editable={!submitting}
        />
        <FormField
          label="Password*"
          value={values.password}
          onChangeText={(text) => update('password', text)}
          error={errors.password}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          textContentType={mode === 'register' ? 'newPassword' : 'password'}
          editable={!submitting}
        />
        {mode === 'register' && (
          <FormField
            label="Confirm password*"
            value={values.confirmPassword}
            onChangeText={(text) => update('confirmPassword', text)}
            error={errors.confirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!submitting}
          />
        )}

        {formError ? (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{formError}</Text>
          </View>
        ) : null}

        <Button label={copy.submit} onPress={submit} loading={submitting} style={styles.submit} />

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{copy.switchText}</Text>
          <Pressable onPress={switchMode} accessibilityRole="link" hitSlop={8}>
            <Text style={styles.switchLink}>{copy.switchLink}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export const LoginScreen = (props) => <AuthScreen mode="login" {...props} />;
export const RegisterScreen = (props) => <AuthScreen mode="register" {...props} />;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  error: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#FDECEC',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.danger,
  },
  submit: {
    marginTop: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  switchText: {
    fontSize: 15,
    color: colors.textMuted,
  },
  switchLink: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
});
