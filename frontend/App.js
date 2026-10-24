import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { Provider } from 'react-redux';
import { store } from './src/store';
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

export default function App() {
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <NavigationContainer ref={navigationRef} theme={navigationTheme}>
          <AppNavigator />
          {/* The one shared login sheet, opened from any screen via useRequireAuth. */}
          <GuestLoginSheet />
        </NavigationContainer>
      </Provider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
