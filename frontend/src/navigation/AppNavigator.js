import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RootNavigator from './RootNavigator';
import ResumeConfirmScreen from '../screens/ResumeConfirmScreen';
import ProfileProcessingScreen from '../screens/ProfileProcessingScreen';
import ProfileConfirmScreen from '../screens/ProfileConfirmScreen';
import JobDetailsScreen from '../screens/JobDetailsScreen';

const Stack = createNativeStackNavigator();

// Top-level stack: the tabbed app plus full-screen flows (no tab bar)
// such as the resume → profile flow.
export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={RootNavigator} />
      <Stack.Screen name="ResumeConfirm" component={ResumeConfirmScreen} />
      <Stack.Screen
        name="ProfileProcessing"
        component={ProfileProcessingScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="ProfileConfirm" component={ProfileConfirmScreen} />
      <Stack.Screen name="JobDetails" component={JobDetailsScreen} />
    </Stack.Navigator>
  );
}
