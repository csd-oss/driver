import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState, PixelRatio } from 'react-native';

interface FontScaleContextType {
  updateKey: number;
}

const FontScaleContext = createContext<FontScaleContextType>({ updateKey: 0 });

/**
 * FontScaleProvider that forces re-renders when the system font scale
 * (iOS Dynamic Type / Android font size) changes. Changing the scale requires
 * leaving the app, so a foreground transition is the only moment a new value
 * can appear — no polling needed. React Native's `allowFontScaling` handles
 * the actual scaling; we only bump `updateKey` so keyed Text remounts pick up
 * the new metrics.
 */
export function FontScaleProvider({ children }: { children: ReactNode }) {
  const [updateKey, setUpdateKey] = useState(0);
  const appState = useRef(AppState.currentState);
  const lastScale = useRef<number>(PixelRatio.getFontScale());

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // iOS reports a stale getFontScale() after Dynamic Type changes, so
        // bump unconditionally on every foreground — it's a cheap re-render
        // and only happens when returning to the app.
        lastScale.current = PixelRatio.getFontScale();
        setUpdateKey((prev) => prev + 1);
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription?.remove();
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
