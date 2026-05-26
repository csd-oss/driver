import { View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

interface ScreenProps {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  header?: ReactNode;
  testID?: string;
}

// Shared page chrome with softer background
export const Screen = ({ children, className = '', style, header, testID }: ScreenProps) => {
  return (
    <SafeAreaView
      testID={testID}
      className={`flex-1 bg-slate-50 dark:bg-slate-950 ${className}`}
      style={style}
    >
      {header}
      <View className="flex-1 px-5 py-6 gap-4">
        {children}
      </View>
    </SafeAreaView>
  );
};
