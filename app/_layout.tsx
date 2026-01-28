import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';
import '../global.css';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { FontScaleProvider } from '@/contexts/FontScaleContext';
import { runMigrations } from '@/src/db/migrate';

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

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

  return (
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
}
