import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import JobsNavigator from './JobsNavigator';
import PlaceholderScreen from '../screens/PlaceholderScreen';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Jobs: ['briefcase', 'briefcase-outline'],
  Skills: ['extension-puzzle', 'extension-puzzle-outline'],
  Learning: ['book', 'book-outline'],
  Profile: ['person', 'person-outline'],
};

// Main app navigation. Uses React Navigation's built-in tab bar, which
// already handles the bottom safe-area inset.
export default function RootNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Jobs"
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '500' },
        tabBarStyle: { borderTopColor: colors.border },
        tabBarIcon: ({ focused, color, size }) => {
          const [active, inactive] = TAB_ICONS[route.name];
          return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
        },
        headerTitleStyle: { fontWeight: '700', color: colors.text },
      })}
    >
      <Tab.Screen name="Jobs" component={JobsNavigator} options={{ headerShown: false }} />
      <Tab.Screen
        name="Skills"
        component={PlaceholderScreen}
        initialParams={{
          icon: 'extension-puzzle-outline',
          message: 'Skill insights are coming soon.',
        }}
      />
      <Tab.Screen
        name="Learning"
        component={PlaceholderScreen}
        initialParams={{ icon: 'book-outline', message: 'Learning resources are coming soon.' }}
      />
      <Tab.Screen
        name="Profile"
        component={PlaceholderScreen}
        initialParams={{ icon: 'person-outline', message: 'Login and your profile are coming soon.' }}
      />
    </Tab.Navigator>
  );
}
