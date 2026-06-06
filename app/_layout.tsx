import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
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
import { configurePurchases } from '@/src/lib/purchases';
import type { ReactNode } from 'react';

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();

// Dark root view background so any transition/paint gap matches the splash and
// intro instead of flashing the default white. Opaque screens cover it.
SystemUI.setBackgroundColorAsync('#0f172a').catch(() => {});

// Identify the user with PostHog after the provider mounts. The opt-out check
// the previous version did here is now handled one level up — `RootLayout`
// won't mount `PostHogProvider` at all if `analyticsOptOut === true`, so by
// the time this runs we're guaranteed to be opted-in.
function PostHogIdentify() {
  const posthog = usePostHog();

  useEffect(() => {
    if (posthog) {
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

  // Gate the whole React tree (and therefore PostHogProvider) on migrations
  // + settings finishing, so analytics never fires before we know the user's
  // opt-out preference. Native splash stays visible during this brief window.
  const [analyticsReady, setAnalyticsReady] = useState(false);
  const [optedOut, setOptedOut] = useState(false);

  useEffect(() => {
    const initApp = async () => {
      let isOptedOut = false;
      try {
        // Only migrations + settings must finish before first paint.
        await runMigrations();
        const settings = await getSettings();
        isOptedOut = settings?.analyticsOptOut === true;
      } catch (error) {
        // If migrations fail we can't read the opt-out preference; default to
        // opt-out so a recoverable error never leaks tracking events.
        console.error('Database initialization error:', error);
        isOptedOut = true;
      }
      setOptedOut(isOptedOut);
      setAnalyticsReady(true);
      await SplashScreen.hideAsync();

      // Non-critical for the first frame — run after the splash hides so they
      // don't delay launch. Both finish well before any gated tap.
      configurePurchases().catch((e) => console.error('Purchases init error:', e));
      syncNotificationsWithCurrentSettings().catch((e) =>
        console.error('Notification sync error:', e)
      );
    };

    initApp();
  }, []);

  // Hold the tree mount until we know the opt-out state. The native splash
  // covers this; the React tree (including the intro animation in app/index)
  // mounts exactly once after the analytics decision is made.
  if (!analyticsReady) return null;

  const appContent = (
    <SafeAreaProvider>
      <FontScaleProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          {/* contentStyle dark so transition gaps match the splash/intro
              instead of flashing white (DefaultTheme's white card bg). The
              opaque per-screen backgrounds cover it everywhere else. */}
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f172a' } }}>
            <Stack.Screen name="index" options={{ headerShown: false, animation: 'none' }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="language" options={{ headerShown: false }} />
            <Stack.Screen name="home" options={{ headerShown: false }} />
            <Stack.Screen name="study" options={{ headerShown: false }} />
            <Stack.Screen name="mistakes" options={{ headerShown: false }} />
            <Stack.Screen name="mock" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="stats" options={{ headerShown: false }} />
            <Stack.Screen
              name="paywall"
              options={{ headerShown: false, gestureEnabled: false }}
            />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </FontScaleProvider>
    </SafeAreaProvider>
  );

  // Mount the PostHog tree only when (a) analytics env is configured AND
  // (b) the user hasn't opted out. If either is false we render the plain
  // ErrorBoundary tree — no `$app_open`, no identify, no register fires.
  const analyticsEnabled = !optedOut && Boolean(posthogKey && posthogHost);

  if (analyticsEnabled) {
    return (
      <PostHogProvider
        apiKey={posthogKey}
        options={{
          host: posthogHost,
          captureAppLifecycleEvents: true, // Auto-track app open/close/background
        }}
      >
        <PostHogIdentify />
        <ErrorBoundaryWithAnalytics>{appContent}</ErrorBoundaryWithAnalytics>
      </PostHogProvider>
    );
  }

  // Opted-out, or env missing — still wrap in a boundary so a JS error doesn't white-screen.
  return <ErrorBoundary>{appContent}</ErrorBoundary>;
}
