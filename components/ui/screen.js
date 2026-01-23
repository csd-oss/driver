import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Shared page chrome with softer background
export const Screen = ({ children, className = '', style, header }) => {
  return (
    <SafeAreaView
      className={`flex-1 bg-slate-50 dark:bg-slate-950 ${className}`}
      style={style}
    >
      {header}
      <View className="flex-1 px-5 py-6 gap-4">
        {children}
      </View>
    </SafeAreaView>
  );
};
