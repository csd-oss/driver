import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState, Platform, PixelRatio } from 'react-native';

interface FontScaleContextType {
  updateKey: number;
}

const FontScaleContext = createContext<FontScaleContextType>({ updateKey: 0 });

/**
 * FontScaleProvider that forces re-renders when iOS Dynamic Type changes.
 * Since PixelRatio.getFontScale() doesn't work on iOS, we use AppState
 * and periodic polling to force component re-renders.
 * React Native's allowFontScaling prop handles the actual font scaling.
 */
export function FontScaleProvider({ children }: { children: ReactNode }) {
  const [updateKey, setUpdateKey] = useState(0);
  const appState = useRef(AppState.currentState);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastAndroidScale = useRef<number>(1);

  useEffect(() => {
    // Listen for app state changes (when user returns from Settings)
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to foreground, force update
        setUpdateKey(prev => prev + 1);
      }
      appState.current = nextAppState;
    });

    // Poll periodically to force re-renders
    // This ensures components update when font scale changes while app is active
    intervalRef.current = setInterval(() => {
      if (Platform.OS === 'android') {
        // On Android, check if font scale actually changed
        const currentScale = PixelRatio.getFontScale();
        if (Math.abs(currentScale - lastAndroidScale.current) > 0.01) {
          lastAndroidScale.current = currentScale;
          setUpdateKey(prev => prev + 1);
        }
      } else {
        // On iOS, just increment to force re-render
        // React Native's allowFontScaling will handle the scaling
        setUpdateKey(prev => prev + 1);
      }
    }, 400); // Check every 400ms

    return () => {
      subscription?.remove();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <FontScaleContext.Provider value={{ updateKey }}>
      {children}
    </FontScaleContext.Provider>
  );
}

export function useFontScaleContext() {
  return useContext(FontScaleContext);
}
