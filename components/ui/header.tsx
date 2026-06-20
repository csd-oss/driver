import { View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { IconSymbol } from './icon-symbol';
import { PressableScale } from './pressable-scale';
import { UIText } from './text';
import { t } from '@/src/i18n/i18n';
import { getCachedLanguage } from '@/src/lib/settings';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  rightElement?: ReactNode;
}

export const Header = ({ title, showBack = true, onBackPress, rightElement }: HeaderProps) => {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const iconColor = colorScheme === 'dark' ? '#c7d2fe' : '#4338ca';

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
      className="px-5"
      style={{ paddingTop: topPadding }}
    >
      <View className="flex-row items-center px-4 py-3 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/90 dark:bg-slate-900/80 shadow-md shadow-slate-900/5">
        {showBack && (
          <PressableScale
            onPress={handleBack}
            scaleTo={0.92}
            testID="nav.back"
            className="mr-3 p-2 rounded-full bg-slate-100 dark:bg-slate-800"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.goBack', getCachedLanguage())}
          >
            <IconSymbol
              name="chevron.left"
              size={22}
              color={iconColor}
            />
          </PressableScale>
        )}
        {title && !rightElement && (
          <UIText variant="subtitle" className="flex-1 text-base tracking-tight">
            {title}
          </UIText>
        )}
        {rightElement && (
          <View className="flex-1 items-end">
            {rightElement}
          </View>
        )}
      </View>
    </View>
  );
};
