import { StyleSheet, View } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import AppHeader from '../components/AppHeader';
import JobsTabBar from '../components/JobsTabBar';
import OpportunitiesScreen from '../screens/OpportunitiesScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';
import { jobTabCounts, unreadNotifications } from '../data/mockMap';
import { colors } from '../theme';

// Nested tab navigator shown at the top of the Jobs tab. Material top tabs
// (react-native-tab-view + pager-view) adds horizontal swipe between tabs;
// the custom JobsTabBar still renders the tab labels.
const JobsTab = createMaterialTopTabNavigator();

export default function JobsNavigator() {
  return (
    <View style={styles.container}>
      <AppHeader title="Opportunities" notificationCount={unreadNotifications} />
      <JobsTab.Navigator
        initialRouteName="AllJobs"
        tabBar={(props) => <JobsTabBar {...props} />}
        screenOptions={{ swipeEnabled: true }}
      >
        <JobsTab.Screen
          name="Recommended"
          component={PlaceholderScreen}
          options={{ title: `Recommended (${jobTabCounts.recommended})` }}
          initialParams={{
            title: 'Recommended',
            icon: 'star-outline',
            message: 'Upload your resume to get AI-based job recommendations.',
          }}
        />
        <JobsTab.Screen
          name="AllJobs"
          component={OpportunitiesScreen}
          options={{ title: 'All Jobs' }}
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
