import { useState, useCallback } from 'react';
import { View, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { getSettings, updateSettings, clearCache } from '@/src/lib/settings';
import { resetStats } from '@/src/lib/stats';
import * as MistakesDB from '@/src/db/queries/mistakes';
import { t } from '@/src/i18n/i18n';

export default function SettingsScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);
  const [useConservativeReadiness, setUseConservativeReadiness] = useState(false);

  const loadSettings = useCallback(async () => {
    const settings = await getSettings();
    if (settings) {
      setLang(settings.lang);
      setUseConservativeReadiness(settings.useConservativeReadiness || false);
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

  const handleReadinessModeChange = async (value) => {
    await updateSettings({ useConservativeReadiness: value });
    setUseConservativeReadiness(value);
  };

  const handleResetProgress = () => {
    Alert.alert(
      t('home.reset', lang),
      'Are you sure you want to reset your progress? This will clear all mistakes and streaks.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            // Reset mistakes from database
            await MistakesDB.resetMistakes();
            await resetStats(); // Reset all statistics including streaks
            // Reset onboarding and language selection so user sees them again on next launch
            await updateSettings({ 
              hasOnboarded: false,
              hasChosenLanguage: false 
            });
            clearCache(); // Clear settings cache to ensure changes take effect
          },
        },
      ]
    );
  };

  return (
    <Screen header={<Header title={t('nav.settings', lang)} />}>
      <View className="flex-1 gap-6 mt-1">
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

        <Card className="gap-3">
          <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
            {t('settings.readinessTitle', lang)}
          </UIText>
          <UIText variant="body" className="text-slate-600 dark:text-slate-300">
            {t('settings.readinessDescription', lang)}
          </UIText>
          
          <View className="flex-row items-center justify-between py-2">
            <View className="flex-1 mr-4">
              <UIText variant="body" className="text-slate-900 dark:text-slate-50">
                {t('settings.conservativeMode', lang)}
              </UIText>
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400 mt-1">
                {t('settings.conservativeModeDesc', lang)}
              </UIText>
            </View>
            <Switch
              value={useConservativeReadiness}
              onValueChange={handleReadinessModeChange}
              trackColor={{ false: '#cbd5e1', true: '#6366f1' }}
              thumbColor={useConservativeReadiness ? '#ffffff' : '#f4f3f4'}
              ios_backgroundColor="#cbd5e1"
            />
          </View>
        </Card>

        <Card className="bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-indigo-500/10 border-transparent">
          <View className="gap-3">
            <UIText variant="subtitle" className="text-rose-600 dark:text-rose-200">
              {t('home.reset', lang)}
            </UIText>
            <UIText variant="body" className="text-slate-600 dark:text-slate-300">
              Clear your progress and start fresh. This action cannot be undone.
            </UIText>
            <Button
              onPress={handleResetProgress}
              variant="secondary"
              className="w-full"
            >
              {t('home.reset', lang)}
            </Button>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
