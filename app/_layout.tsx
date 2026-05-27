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

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FontScaleProvider } from '@/contexts/FontScaleContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { runMigrations } from '@/src/db/migrate';
import { identifyUser, trackError } from '@/src/lib/analytics';
import { syncNotificationsWithCurrentSettings } from '@/src/lib/notifications';
import { getSettings } from '@/src/lib/settings';
import type { ReactNode } from 'react';

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();

// Component to identify user with PostHog after provider is mounted
function PostHogIdentify() {
  const posthog = usePostHog();

  useEffect(() => {
    if (posthog) {
      // Check opt-out status and apply it
      // Note: PostHog is opted-in by default and persists opt-out state internally
      // We only need to call optOut() if user explicitly opted out in our settings
      getSettings().then((settings) => {
        if (settings.analyticsOptOut) {
          posthog.optOut();
        }
        // Don't call optIn() - PostHog handles this by default
        // Calling optIn() can interfere with PostHog's internal persistence
      }).catch((error) => {
        // Settings may fail on first launch before migrations complete
        // This is okay - PostHog defaults to opted-in
        console.error('Failed to check analytics opt-out status:', error);
      });

      identifyUser(posthog).catch((error) => {
        trackError(posthog, 'user_identification_failed', error);
      });
    }
  }, [posthog]);

  return null;
}

// Inside PostHogProvider so it can pipe component-tree errors to analytics.
function ErrorBoundaryWithAnalytics({ children }: { children: ReactNode }) {
  const posthog = usePostHog();
  return (
    <ErrorBoundary
      onError={(error, info) =>
        trackError(posthog, 'app_crash', error, { componentStack: info.componentStack })
      }
    >
      {children}
    </ErrorBoundary>
  );
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
        await syncNotificationsWithCurrentSettings();
      } catch (error) {
        // Log error - PostHog not available yet at this point
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
      <PostHogProvider 
        apiKey={posthogKey} 
        options={{ 
          host: posthogHost,
          captureAppLifecycleEvents: true,  // Auto-track app open/close/background
        }}
      >
        <PostHogIdentify />
        <ErrorBoundaryWithAnalytics>{appContent}</ErrorBoundaryWithAnalytics>
      </PostHogProvider>
    );
  }

  // No analytics configured — still wrap in a boundary so a JS error doesn't white-screen.
  return <ErrorBoundary>{appContent}</ErrorBoundary>;
}
