import { Text } from 'react-native';
import { useFontScaleContext } from '@/contexts/FontScaleContext';

// Base font sizes that will scale with iOS Dynamic Type
const variantFontSizes = {
  title: 30,
  subtitle: 20,
  body: 16,
  caption: 14,
};

// Styles without fontSize (colors, weights, etc.)
const variantStyles = {
  title: 'font-bold text-gray-900 dark:text-gray-100',
  subtitle: 'font-semibold text-gray-800 dark:text-gray-200',
  body: 'text-gray-700 dark:text-gray-300',
  caption: 'text-gray-600 dark:text-gray-400',
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
