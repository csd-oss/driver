import { Text, type TextProps, type StyleProp, type TextStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useFontScaleContext } from '@/contexts/FontScaleContext';

type TextVariant = 'title' | 'subtitle' | 'body' | 'caption';

interface UITextProps extends Omit<TextProps, 'style' | 'children'> {
  children: ReactNode;
  variant?: TextVariant;
  className?: string;
  style?: StyleProp<TextStyle>;
  allowFontScaling?: boolean;
  maxFontSizeMultiplier?: number;
}

// Base font sizes that will scale with iOS Dynamic Type
const variantFontSizes: Record<TextVariant, number> = {
  title: 32,
  subtitle: 20,
  body: 16,
  caption: 14,
};

// Styles without fontSize (colors, weights, etc.)
const variantStyles: Record<TextVariant, string> = {
  title: 'font-extrabold text-slate-900 dark:text-slate-50 tracking-tight',
  subtitle: 'font-semibold text-slate-800 dark:text-slate-200',
  body: 'text-slate-700 dark:text-slate-300',
  caption: 'text-slate-500 dark:text-slate-300',
};

export const UIText = ({
  children,
  variant = 'body',
  className = '',
  style,
  allowFontScaling = true,
  // 2x lets the app meet Apple's "Larger Text" criterion (text scales to 200%)
  // while still capping the largest accessibility sizes that would break layout.
  maxFontSizeMultiplier = 2,
  ...rest
}: UITextProps) => {
  // Use updateKey from context to force re-render when font scale changes
  // React Native's allowFontScaling will handle the actual scaling automatically
  const { updateKey } = useFontScaleContext();
  const variantClass = variantStyles[variant] || variantStyles.body;
  const baseFontSize = variantFontSizes[variant] || variantFontSizes.body;

  // updateKey is used here to trigger re-render, but React Native handles the actual scaling
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = updateKey; // Force re-render when updateKey changes

  return (
    <Text
      key={`text-${updateKey}`}
      className={`${variantClass} ${className}`}
      style={[
        { fontSize: baseFontSize },
        style,
      ]}
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
    >
      {children}
    </Text>
  );
};
