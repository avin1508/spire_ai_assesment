import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfileScreen from '../screens/ProfileScreen';
import ProfileEntriesScreen from '../screens/ProfileEntriesScreen';
import ExperienceFormScreen from '../screens/ExperienceFormScreen';
import EducationFormScreen from '../screens/EducationFormScreen';

const ProfileStack = createNativeStackNavigator();

// Stack inside the Profile tab, so Experience / Education screens keep the
// bottom tab bar (as in the reference screenshots).
export default function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
      <ProfileStack.Screen
        name="Experience"
        component={ProfileEntriesScreen}
        initialParams={{ list: 'experiences' }}
      />
      <ProfileStack.Screen
        name="Education"
        component={ProfileEntriesScreen}
        initialParams={{ list: 'education' }}
      />
      <ProfileStack.Screen name="ExperienceForm" component={ExperienceFormScreen} />
      <ProfileStack.Screen name="EducationForm" component={EducationFormScreen} />
    </ProfileStack.Navigator>
  );
}
