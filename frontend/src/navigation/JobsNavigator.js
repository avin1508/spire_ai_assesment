import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import AppHeader from '../components/AppHeader';
import JobsTabBar from '../components/JobsTabBar';
import OpportunitiesScreen from '../screens/OpportunitiesScreen';
import RecommendedScreen from '../screens/RecommendedScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';
import { useSelector } from 'react-redux';
import { selectIsGuest } from '../store/sessionSlice';
import { selectProfile, selectRecommendations } from '../store/profileSlice';
import useResumeUpload from '../hooks/useResumeUpload';
import { jobTabCounts, unreadNotifications } from '../data/mockMap';
import { colors } from '../theme';

// Nested tab navigator shown at the top of the Jobs tab. Material top tabs
// (react-native-tab-view + pager-view) adds horizontal swipe between tabs;
// the custom JobsTabBar still renders the tab labels.
const JobsTab = createMaterialTopTabNavigator();

export default function JobsNavigator() {
  const navigation = useNavigation();
  const isGuest = useSelector(selectIsGuest);
  const profile = useSelector(selectProfile);
  const recommendations = useSelector(selectRecommendations);
  const startResumeUpload = useResumeUpload();

  // Header actions follow the session: guests without a profile are asked for
  // a resume, guests with one are asked to sign up, signed-in users get neither.
  let headerAction = null;
  if (isGuest) {
    headerAction = profile
      ? { label: 'Sign up', onPress: () => navigation.navigate('Profile') }
      : { label: 'Upload Resume', onPress: startResumeUpload };
  }
  const recommendedCount =
    recommendations.status === 'ready' ? recommendations.items.length : 0;

  return (
    <View style={styles.container}>
      <AppHeader
        title="Opportunities"
        action={headerAction}
        showNotifications={!(isGuest && profile)}
        notificationCount={unreadNotifications}
      />
      <JobsTab.Navigator
        initialRouteName="AllJobs"
        tabBar={(props) => <JobsTabBar {...props} />}
        screenOptions={{ swipeEnabled: true }}
      >
        <JobsTab.Screen
          name="Recommended"
          component={RecommendedScreen}
          options={{ title: `Recommended (${recommendedCount})` }}
        />
        <JobsTab.Screen
          name="AllJobs"
          component={OpportunitiesScreen}
          // Horizontal drags pan the map here, so tab swiping is off on this tab
          // (tapping the tab labels still switches tabs).
          options={{ title: 'All Jobs', swipeEnabled: false }}
        />
        <JobsTab.Screen
          name="Saved"
          component={PlaceholderScreen}
          options={{ title: `Saved (${jobTabCounts.saved})` }}
          initialParams={{
            title: 'Saved',
            icon: 'bookmark-outline',
            message: 'Jobs you save will appear here.',
          }}
        />
        <JobsTab.Screen
          name="Applied"
          component={PlaceholderScreen}
          options={{ title: `Applied (${jobTabCounts.applied})` }}
          initialParams={{
            title: 'Applied',
            icon: 'checkmark-done-outline',
            message: 'Jobs you apply to will appear here.',
          }}
        />
      </JobsTab.Navigator>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
});
