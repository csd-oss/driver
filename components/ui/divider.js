import { View } from 'react-native';

export const Divider = ({ className = '', style }) => {
  return (
    <View
      className={`h-px bg-gray-200 dark:bg-gray-700 ${className}`}
      style={style}
    />
  );
};
