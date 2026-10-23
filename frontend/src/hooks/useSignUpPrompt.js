import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

// Guest gate for locked actions: asks the user to sign up and, if they agree,
// opens the Profile tab (where sign-up will live). Works from tab and stack screens.
export default function useSignUpPrompt() {
  const navigation = useNavigation();

  const goToSignUp = useCallback(
    () => navigation.navigate('Main', { screen: 'Profile' }),
    [navigation]
  );

  const promptSignUp = useCallback(
    () =>
      Alert.alert('Sign up to unlock', 'Create an account to save jobs and access learning.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign up', onPress: goToSignUp },
      ]),
    [goToSignUp]
  );

  return { goToSignUp, promptSignUp };
}
