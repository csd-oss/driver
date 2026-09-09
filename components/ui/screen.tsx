import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

interface ScreenProps {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  header?: ReactNode;
  testID?: string;
}

// On web the app runs in any viewport, including desktop. Keep the layout at
// phone width and centre it; the outer fill keeps the page background.
const WEB_MAX_WIDTH = 480;

// Shared page chrome with softer background
export const Screen = ({ children, className = '', style, header, testID }: ScreenProps) => {
  const inner = (
    <SafeAreaView
      testID={testID}
      className={`flex-1 bg-slate-50 dark:bg-slate-950 ${className}`}
      style={[Platform.OS === 'web' ? { width: '100%', maxWidth: WEB_MAX_WIDTH } : null, style]}
    >
      {header}
      <View className="flex-1 px-5 py-6 gap-4">
        {children}
      </View>
    </SafeAreaView>
  );

  if (Platform.OS !== 'web') return inner;

  return (
    <View className="flex-1 items-center bg-slate-50 dark:bg-slate-950">
      {inner}
    </View>
  );
};
