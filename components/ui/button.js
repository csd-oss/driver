import { Pressable, Text } from 'react-native';

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
  const baseClasses = 'px-6 py-3 rounded-lg items-center justify-center min-h-[44px]';
  const variantClass = variantStyles[variant] || variantStyles.default;
  const disabledClass = disabled ? 'opacity-50' : '';
  
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`${baseClasses} ${variantClass} ${disabledClass} ${className}`}
      style={style}
    >
      <Text
        className={`font-semibold text-base ${textStyles[variant]} ${textClassName}`}
        style={textStyle}
        allowFontScaling={allowFontScaling}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {children}
      </Text>
    </Pressable>
  );
};
