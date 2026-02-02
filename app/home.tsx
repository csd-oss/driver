import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import * as EngagementDB from '@/src/db/queries/engagement';
import * as MistakesDB from '@/src/db/queries/mistakes';
import * as StatsDB from '@/src/db/queries/stats';
import { t } from '@/src/i18n/i18n';
import { getLanguage, getReadinessMode } from '@/src/lib/settings';
import { getReadinessBreakdown, loadStats } from '@/src/lib/stats';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { usePostHog } from 'posthog-react-native';

export default function HomeScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const [lang, setLang] = useState(1);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [recentAccuracy, setRecentAccuracy] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [readinessScore, setReadinessScore] = useState(0);
  const [readinessStatus, setReadinessStatus] = useState('needsWork');

  const loadData = useCallback(async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    // Load mistake count from database
    const mistakesCount = await MistakesDB.getMistakesCount(currentLang);
    setMistakeCount(mistakesCount);
    
    // Get 7-day accuracy
    const accuracy7d = await StatsDB.getLast7DaysAccuracy(currentLang);
    setRecentAccuracy(accuracy7d);
    
    // Get streak
    const currentStreak = await EngagementDB.getCurrentStreak(currentLang);
    setStreak(currentStreak);
    
    // Calculate readiness score
    const stats = await loadStats();
    const langStats = stats.statsByLang?.[String(currentLang)];
    if (langStats) {
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
      setReadinessScore(0);
      setReadinessStatus('needsWork');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Home');
      loadData();
    }, [loadData, posthog])
  );

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

  return (
    <Screen>
      <View className="flex-1 gap-6">
        <Pressable onPress={() => {
          trackEvent(posthog, 'home_stats_clicked', { language: lang });
          router.push('/stats');
        }}>
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
                    {recentAccuracy !== null ? `${recentAccuracy}%` : '—'}
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
            onPress={() => {
              trackEvent(posthog, 'home_study_clicked', { language: lang });
              router.push('/study');
            }}
            variant="default"
            className="w-full"
          >
            {t('home.smartStudyCta', lang)}
          </Button>
        </Card>

        <View className="gap-3">
          <Button
            onPress={() => {
              trackEvent(posthog, 'home_mistakes_clicked', { language: lang });
              router.push('/mistakes');
            }}
            variant="outline"
            className="w-full"
          >
            {t('home.mistakes', lang)}
          </Button>

          <Button
            onPress={() => {
              trackEvent(posthog, 'home_mock_clicked', { language: lang });
              router.push('/mock');
            }}
            variant="outline"
            className="w-full"
          >
            {t('home.mock', lang)}
          </Button>

          <Button
            onPress={() => {
              trackEvent(posthog, 'home_settings_clicked', { language: lang });
              router.push('/settings');
            }}
            variant="secondary"
            className="w-full"
          >
            {t('home.settings', lang)}
          </Button>
        </View>
      </View>
    </Screen>
  );
}
