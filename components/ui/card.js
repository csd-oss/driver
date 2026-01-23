import { View } from 'react-native';
import { Pressable } from 'react-native';

export const Card = ({ children, className = '', onPress, style }) => {
  const baseClasses = 'rounded-lg border border-gray-200 dark:border-gray-700 p-4 gap-2 bg-white dark:bg-gray-800';
  
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className={`${baseClasses} ${className}`}
        style={style}
      >
        {children}
      </Pressable>
    );
  }
  
  return (
    <View className={`${baseClasses} ${className}`} style={style}>
      {children}
    </View>
  );
};
