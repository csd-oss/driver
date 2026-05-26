import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

// Subtle glassy surface with depth
const baseClasses =
  'rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/80 shadow-lg shadow-slate-900/5 p-4 gap-2';

export const Card = ({ children, className = '', onPress, style, accessibilityLabel, testID }: CardProps) => {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        testID={testID}
        className={`${baseClasses} active:scale-[0.995] ${className}`}
        style={style}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} className={`${baseClasses} ${className}`} style={style}>
      {children}
    </View>
  );
};
