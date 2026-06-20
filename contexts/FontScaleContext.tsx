import { createContext, useContext, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

interface FontScaleContextType {
  updateKey: number;
}

const FontScaleContext = createContext<FontScaleContextType>({ updateKey: 1 });

/**
 * Makes text react live to system font-size (Dynamic Type) changes.
 *
 * `useWindowDimensions` re-renders this provider whenever the system font
 * scale changes: on iOS, RN observes `UIContentSizeCategoryDidChange` and
 * updates `fontScale`, emitting a Dimensions "change". Passing `fontScale`
 * through as `updateKey` makes every Text consumer (Button/UIText key their
 * inner Text off it) re-render the moment the user changes the text size —
 * no relaunch needed.
 *
 * This is event-driven, so it replaces the old 400 ms polling that re-rendered
 * the whole tree continuously and drained battery. It only fires when the
 * scale actually changes.
 */
export function FontScaleProvider({ children }: { children: ReactNode }) {
  const { fontScale } = useWindowDimensions();

  return (
    <FontScaleContext.Provider value={{ updateKey: fontScale }}>
      {children}
    </FontScaleContext.Provider>
  );
}

export function useFontScaleContext() {
  return useContext(FontScaleContext);
}
