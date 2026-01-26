import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import { t } from '@/src/i18n/i18n';
import { getLanguage, updateSettings, clearCache } from '@/src/lib/settings';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

export default function LanguageSelectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const fromOnboarding = params?.from === 'onboarding';
  const [currentLang, setCurrentLang] = useState(1);

  const loadLanguage = useCallback(async () => {
    const lang = await getLanguage();
    setCurrentLang(lang);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLanguage();
    }, [loadLanguage])
  );

  const handleLanguageSelect = async (lang) => {
    clearCache();
    await updateSettings({
      lang,
      hasChosenLanguage: true,
      ...(fromOnboarding ? {} : { hasOnboarded: true }),
    });
    router.replace(fromOnboarding ? '/onboarding' : '/home');
  };

  return (
    <Screen
      header={<Header title={t('language.selectTitle', currentLang)} showBack />}
    >
      <View className="flex-1 w-full items-center justify-center">
        <View className="w-full max-w-md gap-5 px-5">
        <Card className="gap-4">
          <UIText variant="body" className="text-slate-600 dark:text-slate-300">
            {t('language.description', currentLang)}
          </UIText>
          <View className="gap-3">
            <Button
              onPress={() => handleLanguageSelect(1)}
              variant={currentLang === 1 ? 'default' : 'outline'}
              className="w-full"
            >
              🇸🇰 {t('language.lang1', 1)} / {t('language.lang1', 2)} / {t('language.lang1', 3)}
            </Button>

            <Button
              onPress={() => handleLanguageSelect(2)}
              variant={currentLang === 2 ? 'default' : 'outline'}
              className="w-full"
            >
              🇬🇧 {t('language.lang2', 1)} / {t('language.lang2', 2)} / {t('language.lang2', 3)}
            </Button>

            <Button
              onPress={() => handleLanguageSelect(3)}
              variant={currentLang === 3 ? 'default' : 'outline'}
              className="w-full"
            >
              🇭🇺 {t('language.lang3', 1)} / {t('language.lang3', 2)} / {t('language.lang3', 3)}
            </Button>
          </View>
        </Card>
      </View>
      </View>
    </Screen>
  );
}
