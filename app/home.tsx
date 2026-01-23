import { useState, useCallback, useRef } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Divider } from '@/components/ui/divider';
import { getSettings, getLanguage } from '@/src/lib/settings';
import { loadProgress } from '@/src/lib/storage';
import { resetProgress } from '@/src/lib/storage';
import { t } from '@/src/i18n/i18n';

export default function HomeScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);
  const [mistakeCount, setMistakeCount] = useState(0);

  const loadData = useCallback(async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    const progress = await loadProgress();
    if (progress && progress.mistakesByLang) {
      const langStr = String(currentLang);
      const mistakes = progress.mistakesByLang[langStr] || [];
      setMistakeCount(mistakes.length);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

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
            await resetProgress();
            setMistakeCount(0);
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <View className="flex-1 gap-6">
        <Card className="mt-2">
          <View className="items-start gap-2">
            <UIText variant="caption" className="uppercase tracking-[0.12em] text-indigo-500">
              {t('home.mistakeCount', lang)}
            </UIText>
            <UIText variant="title" className="leading-none text-5xl">
              {mistakeCount}
            </UIText>
            <UIText variant="body" className="text-slate-500 dark:text-slate-400">
              {t('app.title', lang)}
            </UIText>
          </View>
        </Card>

        <Card className="gap-3">
          <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
            {t('home.study', lang)}
          </UIText>
          <UIText variant="body">
            Quick access to keep your streak and reduce mistakes.
          </UIText>
          <Button
            onPress={() => router.push('/study')}
            variant="default"
            className="w-full"
          >
            {t('home.study', lang)}
          </Button>
        </Card>

        <View className="gap-3">
          <Button
            onPress={() => router.push('/mistakes')}
            variant="outline"
            className="w-full"
          >
            {t('home.mistakes', lang)}
          </Button>

          <Button
            onPress={() => router.push('/mock')}
            variant="outline"
            className="w-full"
          >
            {t('home.mock', lang)}
          </Button>

          <Button
            onPress={() => router.push('/settings')}
            variant="secondary"
            className="w-full"
          >
            {t('home.settings', lang)}
          </Button>
        </View>

        <Divider />

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
