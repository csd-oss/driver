import { View, Pressable } from 'react-native';

// Subtle glassy surface with depth
const baseClasses =
  'rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/80 shadow-lg shadow-slate-900/5 p-4 gap-2';

export const Card = ({ children, className = '', onPress, style, accessibilityLabel, testID }) => {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        testID={testID}
        className={`${baseClasses} active:scale-[0.995] ${className}`}
        style={style}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} className={`${baseClasses} ${className}`} style={style}>
      {children}
    </View>
  );
};
