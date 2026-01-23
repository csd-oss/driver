import { Text } from 'react-native';

const variantStyles = {
  title: 'text-3xl font-bold text-gray-900 dark:text-gray-100',
  subtitle: 'text-xl font-semibold text-gray-800 dark:text-gray-200',
  body: 'text-base text-gray-700 dark:text-gray-300',
  caption: 'text-sm text-gray-600 dark:text-gray-400',
};

export const UIText = ({ 
  children, 
  variant = 'body', 
  className = '', 
  style,
  allowFontScaling = true,
  maxFontSizeMultiplier = 1.5,
  ...rest 
}) => {
  const variantClass = variantStyles[variant] || variantStyles.body;
  
  return (
    <Text 
      className={`${variantClass} ${className}`} 
      style={style}
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
    >
      {children}
    </Text>
  );
};
