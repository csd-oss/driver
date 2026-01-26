import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Divider } from '@/components/ui/divider';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import { t } from '@/src/i18n/i18n';
import { getLanguage } from '@/src/lib/settings';
import { calculateAccuracy, getLast7Days, getReadinessBreakdown, loadStats, resetStats } from '@/src/lib/stats';
import { getReadinessMode } from '@/src/lib/settings';
import { loadProgress, resetProgress } from '@/src/lib/storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [recentAccuracy, setRecentAccuracy] = useState('—');
  const [streak, setStreak] = useState(0);
  const [readinessScore, setReadinessScore] = useState(0);
  const [readinessStatus, setReadinessStatus] = useState('needsWork');

  const loadData = useCallback(async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    // Load progress for mistake count
    const progress = await loadProgress();
    const langStr = String(currentLang);
    let mistakesCount = 0;
    if (progress && progress.mistakesByLang) {
      const mistakes = progress.mistakesByLang[langStr] || [];
      mistakesCount = mistakes.length;
      setMistakeCount(mistakesCount);
    }
    
    // Load stats for accuracy and streak
    const stats = await loadStats();
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
      
      // Calculate readiness score (use mistakesCount from above)
      const useConservative = await getReadinessMode();
      const breakdown = await getReadinessBreakdown(currentLang, mistakesCount, langStats, useConservative);
      setReadinessScore(breakdown.overall);
      
      // Determine status based on score
      if (breakdown.overall >= 80) {
        setReadinessStatus('ready');
      } else if (breakdown.overall >= 60) {
        setReadinessStatus('gettingThere');
      } else {
        setReadinessStatus('needsWork');
      }
    } else {
      setRecentAccuracy('—');
      setStreak(0);
      setReadinessScore(0);
      setReadinessStatus('needsWork');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const accuracyValue = typeof recentAccuracy === 'number' ? recentAccuracy : null;
  const accuracyWidth = `${accuracyValue !== null ? Math.max(accuracyValue, 1) : 0}%`;
  
  // Get readiness status colors and label
  const getReadinessStatusInfo = () => {
    switch (readinessStatus) {
      case 'ready':
        return {
          label: t('readiness.ready', lang),
          bgColor: 'bg-emerald-500/15 dark:bg-emerald-500/20',
          textColor: 'text-emerald-700 dark:text-emerald-200',
          barColor: 'bg-emerald-500',
        };
      case 'gettingThere':
        return {
          label: t('readiness.gettingThere', lang),
          bgColor: 'bg-amber-500/15 dark:bg-amber-500/20',
          textColor: 'text-amber-700 dark:text-amber-200',
          barColor: 'bg-amber-500',
        };
      default:
        return {
          label: t('readiness.needsWork', lang),
          bgColor: 'bg-rose-500/15 dark:bg-rose-500/20',
          textColor: 'text-rose-700 dark:text-rose-200',
          barColor: 'bg-rose-500',
        };
    }
  };
  
  const readinessInfo = getReadinessStatusInfo();
  const readinessBarWidth = `${Math.max(readinessScore, 1)}%`;

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
            await resetStats(); // Reset all statistics including streaks
            setMistakeCount(0);
            setRecentAccuracy('—');
            setStreak(0);
            setReadinessScore(0);
            setReadinessStatus('needsWork');
            // Reload data to ensure UI is fully updated
            await loadData();
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

              {/* Readiness Score Section */}
              <View className="gap-2">
                <View className="flex-row items-center justify-between">
                  <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
                    {t('readiness.title', lang)}
                  </UIText>
                  <View className={`rounded-full px-3 py-1 ${readinessInfo.bgColor}`}>
                    <UIText variant="caption" className={`font-semibold ${readinessInfo.textColor}`}>
                      {readinessInfo.label}
                    </UIText>
                  </View>
                </View>
                <View className="flex-row items-end gap-3">
                  <UIText variant="title" className="text-slate-900 dark:text-slate-50">
                    {readinessScore}%
                  </UIText>
                </View>
                <View className="h-2 rounded-full bg-slate-200/70 dark:bg-slate-800/70 overflow-hidden">
                  <View
                    className={`h-full rounded-full ${readinessInfo.barColor}`}
                    style={{ width: readinessBarWidth }}
                  />
                </View>
              </View>

              <View className="flex-row items-end justify-between">
                <View>
                  <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
                    Accuracy (7d)
                  </UIText>
                  <UIText variant="subtitle" className="text-slate-900 dark:text-slate-50">
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
