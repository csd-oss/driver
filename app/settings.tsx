import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { getSettings, updateSettings, clearCache } from '@/src/lib/settings';
import { t } from '@/src/i18n/i18n';

export default function SettingsScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);

  useFocusEffect(() => {
    loadSettings();
  });

  const loadSettings = async () => {
    const settings = await getSettings();
    if (settings) {
      setLang(settings.lang);
    }
  };

  const handleLanguageChange = async (newLang) => {
    clearCache();
    await updateSettings({ lang: newLang });
    setLang(newLang);
    // Optionally navigate back or show success message
  };

  return (
    <Screen>
      <View className="flex-1 gap-6">
        <View className="items-center mt-4">
          <UIText variant="title">{t('settings.languageTitle', lang)}</UIText>
        </View>

        <Card>
          <UIText variant="subtitle" className="mb-4">
            {t('settings.currentLanguage', lang)}: {lang}
          </UIText>

          <View className="gap-4">
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
