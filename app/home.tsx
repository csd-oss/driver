import { useState, useCallback, useRef } from 'react';
import { View, Alert, Pressable } from 'react-native';
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
import { loadStats, getLast7Days, calculateAccuracy } from '@/src/lib/stats';
import { t } from '@/src/i18n/i18n';

export default function HomeScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [recentAccuracy, setRecentAccuracy] = useState('—');
  const [streak, setStreak] = useState(0);

  const loadData = useCallback(async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    // Load progress for mistake count
    const progress = await loadProgress();
    if (progress && progress.mistakesByLang) {
      const langStr = String(currentLang);
      const mistakes = progress.mistakesByLang[langStr] || [];
      setMistakeCount(mistakes.length);
    }
    
    // Load stats for accuracy and streak
    const stats = await loadStats();
    const langStr = String(currentLang);
    const langStats = stats.statsByLang?.[langStr];
    
    if (langStats) {
      // Calculate 7-day accuracy
      const last7Days = getLast7Days();
      let totalAttempts = 0;
      let totalCorrect = 0;
      
      last7Days.forEach((dateKey) => {
        const daily = langStats.study.daily?.[dateKey];
        if (daily) {
          totalAttempts += daily.attempts || 0;
          totalCorrect += daily.correct || 0;
        }
      });
      
      const accuracy = calculateAccuracy(totalAttempts, totalCorrect);
      setRecentAccuracy(accuracy);
      
      // Get streak
      setStreak(langStats.engagement?.currentStreak || 0);
    } else {
      setRecentAccuracy('—');
      setStreak(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const accuracyValue = typeof recentAccuracy === 'number' ? recentAccuracy : null;
  const accuracyWidth = `${Math.min(accuracyValue ?? 0, 100)}%`;

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
        <Pressable onPress={() => router.push('/stats')}>
          <Card className="mt-2 overflow-hidden bg-gradient-to-r from-indigo-500/15 via-sky-500/10 to-emerald-500/10 border-indigo-200/60 dark:border-indigo-700/40">
            <View className="gap-4">
              <View className="flex-row items-center justify-between">
                <UIText variant="caption" className="uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
                  Your progress
                </UIText>
                <View className="rounded-full border border-indigo-200/80 dark:border-indigo-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-1">
                  <UIText variant="caption" className="text-indigo-700 dark:text-indigo-200">
                    View stats →
                  </UIText>
                </View>
              </View>

              <View className="flex-row items-end justify-between">
                <View>
                  <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
                    Accuracy (7d)
                  </UIText>
                  <UIText variant="title" className="text-slate-900 dark:text-slate-50">
                    {recentAccuracy}{accuracyValue !== null ? '%' : ''}
                  </UIText>
                </View>
                <View className="items-end">
                  <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
                    Current streak
                  </UIText>
                  <UIText variant="subtitle" className="text-emerald-600 dark:text-emerald-300">
                    {streak} days
                  </UIText>
                </View>
              </View>

              <View className="gap-2">
                <View className="flex-row items-center justify-between">
                  <View className="rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-2">
                    <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                      Mistakes left
                    </UIText>
                    <UIText variant="subtitle" className="text-slate-900 dark:text-slate-50">
                      {mistakeCount}
                    </UIText>
                  </View>
                  <View className="flex-1 ml-3">
                    <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                      Weekly accuracy
                    </UIText>
                    <View className="mt-2 h-2 rounded-full bg-slate-200/70 dark:bg-slate-800/70 overflow-hidden">
                      <View
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500"
                        style={{ width: accuracyWidth }}
                      />
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </Card>
        </Pressable>

        <Card className="gap-3">
          <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
            {t('study.smartTitle', lang)}
          </UIText>
          <UIText variant="body">
            {t('home.smartStudyBlurb', lang)}
          </UIText>
          <Button
            onPress={() => router.push('/study')}
            variant="default"
            className="w-full"
          >
            {t('home.smartStudyCta', lang)}
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
