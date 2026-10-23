import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { pickResume } from '../utils/pickResume';

// Starts the resume flow from anywhere: pick a file, then confirm it.
// Used for the first upload and for later resume updates. `returnTo`
// ('Jobs' | 'Profile') is where the flow ends after the profile is confirmed.
export default function useResumeUpload({ returnTo = 'Jobs' } = {}) {
  const navigation = useNavigation();

  return useCallback(async () => {
    try {
      const file = await pickResume();
      if (file) navigation.navigate('ResumeConfirm', { file, returnTo });
    } catch {
      Alert.alert("Couldn't open your files", 'Please try again.');
    }
  }, [navigation, returnTo]);
}
