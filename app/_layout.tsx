import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';
import Constants from 'expo-constants';
import { PostHogProvider, usePostHog } from 'posthog-react-native';

import { FontScaleProvider } from '@/contexts/FontScaleContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { runMigrations } from '@/src/db/migrate';
import { identifyUser } from '@/src/lib/analytics';

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();

// Component to identify user with PostHog after provider is mounted
function PostHogIdentify() {
  const posthog = usePostHog();

  useEffect(() => {
    if (posthog) {
      identifyUser(posthog).catch((error) => {
        console.error('Failed to identify user with PostHog:', error);
      });
    }
  }, [posthog]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Get PostHog config from environment
  const posthogKey = Constants.expoConfig?.extra?.posthogKey;
  const posthogHost = Constants.expoConfig?.extra?.posthogHost;

  useEffect(() => {
    // Initialize database and run migrations
    const initApp = async () => {
      try {
        await runMigrations();
      } catch (error) {
        console.error('Database initialization error:', error);
      }
      
      // Hide splash screen once the app is ready
      await SplashScreen.hideAsync();
    };
    
    initApp();
  }, []);

  const appContent = (
    <SafeAreaProvider>
      <FontScaleProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="language" options={{ headerShown: false }} />
            <Stack.Screen name="home" options={{ headerShown: false }} />
            <Stack.Screen name="study" options={{ headerShown: false }} />
            <Stack.Screen name="mistakes" options={{ headerShown: false }} />
            <Stack.Screen name="mock" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="stats" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </FontScaleProvider>
    </SafeAreaProvider>
  );

  // Wrap with PostHogProvider if config is available
  if (posthogKey && posthogHost) {
    return (
      <PostHogProvider apiKey={posthogKey} options={{ host: posthogHost }}>
        <PostHogIdentify />
        {appContent}
      </PostHogProvider>
    );
  }

  // Graceful no-op when env is missing
  return appContent;
}
