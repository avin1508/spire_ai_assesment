import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './src/store';
import { restoreGuestData } from './src/store/guestPersistence';
import { selectStorageStatus } from './src/store/profileSlice';
import GuestLoginSheet from './src/components/GuestLoginSheet';
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

// Restores saved guest data before showing the app, so screens never show
// (or save) an empty profile in place of the stored one.
function AppContent() {
  const dispatch = useDispatch();
  const storageStatus = useSelector(selectStorageStatus);

  useEffect(() => {
    dispatch(restoreGuestData());
  }, [dispatch]);

  if (storageStatus === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <AppNavigator />
      {/* The one shared login sheet, opened from any screen via useRequireAuth. */}
      <GuestLoginSheet />
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
