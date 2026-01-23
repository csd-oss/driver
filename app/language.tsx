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
      <View className="w-full max-w-md gap-5">
        <UIText variant="title" className="text-center">
          {t('language.selectTitle', 1)}
        </UIText>
        <Card className="gap-4">
          <UIText variant="body" className="text-slate-600 dark:text-slate-300">
            Choose your preferred language to personalize the app.
          </UIText>
          <View className="gap-3">
            <Button
              onPress={() => handleLanguageSelect(1)}
              variant="default"
              className="w-full"
            >
              {t('language.lang1', 1)} / {t('language.lang1', 2)} / {t('language.lang1', 3)}
            </Button>

            <Button
              onPress={() => handleLanguageSelect(2)}
              variant="outline"
              className="w-full"
            >
              {t('language.lang2', 1)} / {t('language.lang2', 2)} / {t('language.lang2', 3)}
            </Button>

            <Button
              onPress={() => handleLanguageSelect(3)}
              variant="outline"
              className="w-full"
            >
              {t('language.lang3', 1)} / {t('language.lang3', 2)} / {t('language.lang3', 3)}
            </Button>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
