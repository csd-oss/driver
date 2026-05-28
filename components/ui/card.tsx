import { forwardRef } from 'react';
import { View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { PressableScale } from './pressable-scale';

interface CardProps {
  children: ReactNode;
  className?: string;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

const baseClasses =
  'rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/80 shadow-lg shadow-slate-900/5 p-4 gap-2';

export const Card = forwardRef<View, CardProps>(
  ({ children, className = '', onPress, style, accessibilityLabel, testID }, ref) => {
    if (onPress) {
      return (
        <PressableScale
          ref={ref}
          onPress={onPress}
          scaleTo={0.985}
          testID={testID}
          className={`${baseClasses} ${className}`}
          style={style}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          {children}
        </PressableScale>
      );
    }

    return (
      <View ref={ref} testID={testID} className={`${baseClasses} ${className}`} style={style}>
        {children}
      </View>
    );
  },
);

Card.displayName = 'Card';
