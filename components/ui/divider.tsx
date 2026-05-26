import { View, type StyleProp, type ViewStyle } from 'react-native';

interface DividerProps {
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export const Divider = ({ className = '', style }: DividerProps) => {
  return (
    <View
      className={`h-0.5 bg-slate-200/80 dark:bg-slate-800/80 rounded-full ${className}`}
      style={style}
    />
  );
};
