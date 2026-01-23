import { View } from 'react-native';

export const Divider = ({ className = '', style }) => {
  return (
    <View
      className={`h-0.5 bg-slate-200/80 dark:bg-slate-800/80 rounded-full ${className}`}
      style={style}
    />
  );
};
