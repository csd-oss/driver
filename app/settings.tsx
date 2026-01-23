import { useState, useCallback } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { getSettings, updateSettings, clearCache } from '@/src/lib/settings';
import { t } from '@/src/i18n/i18n';

export default function SettingsScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);

  const loadSettings = useCallback(async () => {
    const settings = await getSettings();
    if (settings) {
      setLang(settings.lang);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  const handleLanguageChange = async (newLang) => {
    clearCache();
    await updateSettings({ lang: newLang });
    setLang(newLang);
    // Optionally navigate back or show success message
  };

  return (
    <Screen header={<Header title={t('nav.settings', lang)} />}>
      <View className="flex-1 gap-6 mt-1">
        <View className="items-start mt-2">
          <UIText variant="title">{t('settings.languageTitle', lang)}</UIText>
          <UIText variant="body" className="text-slate-500 dark:text-slate-400 mt-1">
            {t('settings.currentLanguage', lang)}: {lang}
          </UIText>
        </View>

        <Card className="gap-3">
          <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
            {t('settings.languageTitle', lang)}
          </UIText>

          <View className="gap-3">
            <Button
              onPress={() => handleLanguageChange(1)}
              variant={lang === 1 ? 'default' : 'outline'}
              className="w-full"
            >
              {t('language.lang1', 1)} / {t('language.lang1', 2)} / {t('language.lang1', 3)}
            </Button>

            <Button
              onPress={() => handleLanguageChange(2)}
              variant={lang === 2 ? 'default' : 'outline'}
              className="w-full"
            >
              {t('language.lang2', 1)} / {t('language.lang2', 2)} / {t('language.lang2', 3)}
            </Button>

            <Button
              onPress={() => handleLanguageChange(3)}
              variant={lang === 3 ? 'default' : 'outline'}
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
