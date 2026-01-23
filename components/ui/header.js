import { View, Pressable, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from './icon-symbol';
import { UIText } from './text';

export const Header = ({ title, showBack = true, onBackPress }) => {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const iconColor = colorScheme === 'dark' ? '#60a5fa' : '#3b82f6'; // blue-400 in dark, blue-600 in light

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  // Use safe area top inset but reduce padding to minimize height
  const topPadding = Math.max(insets.top * 0.3, 4);

  return (
    <View 
      className="flex-row items-center px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
      style={{ paddingTop: topPadding }}
    >
      {showBack && (
        <Pressable
          onPress={handleBack}
          className="mr-2 p-1.5 -ml-1"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol
            name="chevron.left"
            size={20}
            color={iconColor}
          />
        </Pressable>
      )}
      {title && (
        <UIText variant="subtitle" className="flex-1 text-base">
          {title}
        </UIText>
      )}
    </View>
  );
};
