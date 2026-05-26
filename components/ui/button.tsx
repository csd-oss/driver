import { Pressable, Text, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useFontScaleContext } from '@/contexts/FontScaleContext';

type ButtonVariant = 'default' | 'outline' | 'secondary';

interface ButtonProps {
  children: ReactNode;
  onPress?: PressableProps['onPress'];
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
  textClassName?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  allowFontScaling?: boolean;
  maxFontSizeMultiplier?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    'bg-indigo-600 dark:bg-indigo-500 active:bg-indigo-700 dark:active:bg-indigo-600 shadow-lg shadow-indigo-500/20 border border-indigo-400/20',
  outline:
    'bg-white/70 dark:bg-white/10 border border-indigo-300 dark:border-indigo-500 active:bg-indigo-50 dark:active:bg-indigo-900/30',
  secondary:
    'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 active:bg-slate-200 dark:active:bg-slate-700',
};

const textStyles: Record<ButtonVariant, string> = {
  default: 'text-white dark:text-white',
  outline: 'text-indigo-700 dark:text-indigo-200',
  secondary: 'text-slate-900 dark:text-slate-50',
};

// Base font size for buttons (will scale with iOS Dynamic Type)
const BUTTON_FONT_SIZE = 16;

export const Button = ({
  children,
  onPress,
  variant = 'default',
  disabled = false,
  className = '',
  textClassName = '',
  style,
  textStyle,
  allowFontScaling = true,
  maxFontSizeMultiplier = 1.5,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) => {
  // Use updateKey from context to force re-render when font scale changes
  // React Native's allowFontScaling will handle the actual scaling automatically
  const { updateKey } = useFontScaleContext();
  const baseClasses = 'px-5 py-3 rounded-xl items-center justify-center min-h-[48px] shadow-sm active:scale-[0.99]';
  const variantClass = variantStyles[variant] || variantStyles.default;
  const disabledClass = disabled ? 'opacity-50' : '';

  // updateKey is used here to trigger re-render, but React Native handles the actual scaling
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = updateKey; // Force re-render when updateKey changes

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      className={`${baseClasses} ${variantClass} ${disabledClass} ${className}`}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || (typeof children === 'string' ? children : undefined)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
    >
      <Text
        key={`button-text-${updateKey}`}
        className={`font-semibold ${textStyles[variant]} ${textClassName}`}
        style={[
          { fontSize: BUTTON_FONT_SIZE },
          textStyle,
        ]}
        allowFontScaling={allowFontScaling}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {children}
      </Text>
    </Pressable>
  );
};
