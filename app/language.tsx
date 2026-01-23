import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { updateSettings } from '@/src/lib/settings';
import { t } from '@/src/i18n/i18n';

export default function LanguageSelectScreen() {
  const router = useRouter();

  const handleLanguageSelect = async (lang) => {
    await updateSettings({
      lang,
      hasOnboarded: true,
    });
    router.replace('/home');
  };

  return (
    <Screen className="items-center justify-center">
      <View className="w-full max-w-md gap-6">
        <UIText variant="title" className="text-center mb-4">
          {t('language.selectTitle', 1)}
        </UIText>

        <View className="gap-4">
          <Button
            onPress={() => handleLanguageSelect(1)}
            variant="default"
            className="w-full"
          >
            {t('language.lang1', 1)} / {t('language.lang1', 2)} / {t('language.lang1', 3)}
          </Button>

          <Button
            onPress={() => handleLanguageSelect(2)}
            variant="default"
            className="w-full"
          >
            {t('language.lang2', 1)} / {t('language.lang2', 2)} / {t('language.lang2', 3)}
          </Button>

          <Button
            onPress={() => handleLanguageSelect(3)}
            variant="default"
            className="w-full"
          >
            {t('language.lang3', 1)} / {t('language.lang3', 2)} / {t('language.lang3', 3)}
          </Button>
        </View>
      </View>
    </Screen>
  );
}
