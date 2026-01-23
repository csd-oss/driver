import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const Screen = ({ children, className = '', style, header }) => {
  return (
    <SafeAreaView className={`flex-1 bg-white dark:bg-gray-900 ${className}`} style={style}>
      {header}
      <View className="flex-1 px-4 py-6">
        {children}
      </View>
    </SafeAreaView>
  );
};
