import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import * as EngagementDB from '@/src/db/queries/engagement';
import * as MistakesDB from '@/src/db/queries/mistakes';
import * as StatsDB from '@/src/db/queries/stats';
import { t } from '@/src/i18n/i18n';
import { syncNotificationsWithCurrentSettings } from '@/src/lib/notifications';
import { getLanguage, getReadinessMode } from '@/src/lib/settings';
import { getReadinessBreakdown, loadStats } from '@/src/lib/stats';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { usePostHog } from 'posthog-react-native';
import { ensureProAccess } from '@/src/lib/purchases';

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
    await syncNotificationsWithCurrentSettings();
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

  // Gated entries: tap → if subscribed, navigate; otherwise present paywall.
  // Navigate only if the user has (or just acquired) the Pro entitlement.
  const openGated = async (route: '/study' | '/mistakes', event: string) => {
    trackEvent(posthog, event, { language: lang });
    const granted = await ensureProAccess();
    if (granted) router.push(route);
  };

  return (
    <Screen testID="screen.home">
      <View className="flex-1 gap-4">
        <View className="flex-row justify-end -mb-2">
          <Pressable
            onPress={() => {
              trackEvent(posthog, 'home_settings_clicked', { language: lang });
              router.push('/settings');
            }}
            testID="home.settings"
            accessibilityRole="button"
            accessibilityLabel={t('home.settings', lang)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="p-2 -mr-2 rounded-full active:bg-slate-200/60 dark:active:bg-slate-800/60"
          >
            <IconSymbol name="gearshape.fill" size={22} color="#6366f1" />
          </Pressable>
        </View>

        <Pressable
          onPress={() => {
            trackEvent(posthog, 'home_stats_clicked', { language: lang });
            router.push('/stats');
          }}
          testID="home.stats"
          accessibilityRole="button"
          accessibilityLabel={`${t('stats.yourProgress', lang)}: ${readinessScore}%`}
          accessibilityHint="Opens detailed statistics"
        >
          <Card className="mt-2 overflow-hidden bg-gradient-to-r from-indigo-500/15 via-sky-500/10 to-emerald-500/10 border-indigo-200/60 dark:border-indigo-700/40">
            <View className="gap-4">
              <View className="flex-row items-center justify-between">
                <UIText variant="caption" className="uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
                  {t('stats.yourProgress', lang)}
                </UIText>
                <View className="rounded-full border border-indigo-200/80 dark:border-indigo-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-1">
                  <UIText variant="caption" className="text-indigo-700 dark:text-indigo-200">
                    {t('home.viewStats', lang)}
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
                    {t('stats.accuracy7d', lang)}
                  </UIText>
                  <UIText variant="subtitle" className="text-slate-900 dark:text-slate-50">
                    {recentAccuracy !== null ? `${recentAccuracy}%` : '—'}
                  </UIText>
                </View>
                <View className="items-end">
                  <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
                    {t('stats.currentStreak', lang)}
                  </UIText>
                  <UIText variant="subtitle" className="text-emerald-600 dark:text-emerald-300">
                    {streak} {t('home.streakDays', lang)}
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
            onPress={() => openGated('/study', 'home_study_clicked')}
            variant="default"
            className="w-full"
            testID="home.smartStudyCta"
          >
            {t('home.smartStudyCta', lang)}
          </Button>
        </Card>

        <View className="flex-row gap-3 flex-1">
          <Pressable
            onPress={() => openGated('/mistakes', 'home_mistakes_clicked')}
            testID="home.mistakes"
            accessibilityRole="button"
            accessibilityLabel={t('home.mistakes', lang)}
            className="flex-1 justify-between rounded-2xl border-2 border-rose-200/60 dark:border-rose-700/40 bg-rose-500/10 dark:bg-rose-500/20 p-5 active:scale-[0.98] active:bg-rose-500/15 dark:active:bg-rose-500/30"
          >
            <UIText style={{ fontSize: 44 }}>💪</UIText>
            <View className="gap-1">
              <UIText variant="subtitle" className="text-rose-700 dark:text-rose-200">
                {t('home.mistakes', lang)}
              </UIText>
              <UIText variant="caption" className="text-rose-700/70 dark:text-rose-200/70">
                {mistakeCount === 0
                  ? t('home.mistakesSubtitle.zero', lang)
                  : t('home.mistakesSubtitle.count', lang).replace('{count}', String(mistakeCount))}
              </UIText>
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              trackEvent(posthog, 'home_mock_clicked', { language: lang });
              router.push('/mock');
            }}
            testID="home.mock"
            accessibilityRole="button"
            accessibilityLabel={t('home.mock', lang)}
            className="flex-1 justify-between rounded-2xl border-2 border-amber-200/60 dark:border-amber-700/40 bg-amber-500/10 dark:bg-amber-500/20 p-5 active:scale-[0.98] active:bg-amber-500/15 dark:active:bg-amber-500/30"
          >
            <UIText style={{ fontSize: 44 }}>⏱️</UIText>
            <View className="gap-1">
              <UIText variant="subtitle" className="text-amber-700 dark:text-amber-200">
                {t('home.mock', lang)}
              </UIText>
              <UIText variant="caption" className="text-amber-700/70 dark:text-amber-200/70">
                {t('home.mockSubtitle', lang)}
              </UIText>
            </View>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
