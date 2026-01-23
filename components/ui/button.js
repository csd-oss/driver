import { Pressable, Text } from 'react-native';
import { useFontScaleContext } from '@/contexts/FontScaleContext';

const variantStyles = {
  default: 'bg-blue-600 dark:bg-blue-500 active:bg-blue-700 dark:active:bg-blue-600',
  outline: 'bg-transparent border-2 border-blue-600 dark:border-blue-500 active:bg-blue-50 dark:active:bg-blue-900/20',
  secondary: 'bg-gray-200 dark:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600',
};

const textStyles = {
  default: 'text-white dark:text-white',
  outline: 'text-blue-600 dark:text-blue-400',
  secondary: 'text-gray-900 dark:text-gray-100',
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
}) => {
  // Use updateKey from context to force re-render when font scale changes
  // React Native's allowFontScaling will handle the actual scaling automatically
  const { updateKey } = useFontScaleContext();
  const baseClasses = 'px-6 py-3 rounded-lg items-center justify-center min-h-[44px]';
  const variantClass = variantStyles[variant] || variantStyles.default;
  const disabledClass = disabled ? 'opacity-50' : '';
  
  // updateKey is used here to trigger re-render, but React Native handles the actual scaling
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = updateKey; // Force re-render when updateKey changes
  
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`${baseClasses} ${variantClass} ${disabledClass} ${className}`}
      style={style}
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
