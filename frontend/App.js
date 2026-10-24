import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './src/store';
import { restoreSession } from './src/store/auth';
import { selectStorageStatus } from './src/store/profileSlice';
import { noticeDismissed, selectNotice } from './src/store/sessionSlice';
import { refreshRecommendations } from './src/store/profileSlice';
import { subscribeToNotificationTaps } from './src/notifications/push';
import { notificationTarget } from './src/utils/pushNotifications';
import GuestLoginSheet from './src/components/GuestLoginSheet';
import NotificationPromptSheet from './src/components/NotificationPromptSheet';
import { navigationRef } from './src/navigation/navigationRef';
import { colors } from './src/theme';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

// Restores the saved session (signed-in account or guest) before showing
// the app, so screens never show (or save) an empty profile in place of the
// stored one.
function AppContent() {
  const dispatch = useDispatch();
  const storageStatus = useSelector(selectStorageStatus);
  const notice = useSelector(selectNotice);
  const [navigationReady, setNavigationReady] = useState(false);

  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);

  // One-off messages about the session (e.g. it ended, or guest data couldn't be moved yet).
  useEffect(() => {
    if (!notice) return;
    Alert.alert('Account', notice);
    dispatch(noticeDismissed());
  }, [notice, dispatch]);

  // "Recommendations ready" → Jobs › Recommended, refreshed for whoever is
  // signed in now (once the saved session has been restored).
  // (Taps include the notification that launched the app.)
  const ready = navigationReady && storageStatus !== 'loading';
  useEffect(() => {
    if (!ready) return undefined;
    return subscribeToNotificationTaps((data) => {
      const target = notificationTarget(data);
      if (!target) return;
      navigationRef.navigate(target.name, target.params);
      dispatch(refreshRecommendations());
    });
  }, [ready, dispatch]);

  if (storageStatus === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} onReady={() => setNavigationReady(true)}>
      <AppNavigator />
      {/* The one shared login sheet, opened from any screen via useRequireAuth. */}
      <GuestLoginSheet />
      {/* "Get notified" before Android's notification permission dialog. */}
      <NotificationPromptSheet />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <AppContent />
      </Provider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
});
