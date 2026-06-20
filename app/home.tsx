import { AnimatedBar } from '@/components/ui/animated-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import * as EngagementDB from '@/src/db/queries/engagement';
import * as MistakesDB from '@/src/db/queries/mistakes';
import * as StatsDB from '@/src/db/queries/stats';
import { t } from '@/src/i18n/i18n';
import { promptForNotificationsIfNeverAsked } from '@/src/lib/notifications';
import { getCachedLanguage, getLanguage, getReadinessMode } from '@/src/lib/settings';
import { getReadinessBreakdown, loadStats } from '@/src/lib/stats';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { usePostHog } from 'posthog-react-native';
import { ensureProAccess, isPurchasesSupported, isSubscribed } from '@/src/lib/purchases';
import { useLargeText } from '@/hooks/use-large-text';

export default function HomeScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const largeText = useLargeText();
  const [lang, setLang] = useState(getCachedLanguage);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [recentAccuracy, setRecentAccuracy] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [readinessScore, setReadinessScore] = useState(0);
  const [readinessStatus, setReadinessStatus] = useState('needsWork');
  const [showProBadge, setShowProBadge] = useState(false);

  const loadData = useCallback(async () => {
    // Notification scheduling is handled at launch (_layout) and after any
    // settings/language change — no need to cancel + reschedule 40+
    // notifications on every Home focus.
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

    // Gated cards show a PRO pill until the entitlement is held
    setShowProBadge(isPurchasesSupported() && !isSubscribed());

    // Users who skipped onboarding were never asked for notification
    // permission. Once they show engagement, make the one-time ask here.
    if (accuracy7d !== null || mistakesCount > 0) {
      promptForNotificationsIfNeverAsked().catch(() => {});
    }

    // Calculate readiness score
    const stats = await loadStats(currentLang);
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

  // Gated entries: tap → if subscribed, navigate; otherwise present paywall.
  // Navigate only if the user has (or just acquired) the Pro entitlement.
  const openGated = async (route: '/study' | '/mistakes', event: string) => {
    trackEvent(posthog, event, { language: lang });
    const placement = route === '/study' ? 'smart_study' : 'mistakes';
    const alreadyPro = !isPurchasesSupported() || isSubscribed();
    if (!alreadyPro) {
      trackEvent(posthog, 'paywall_shown', { placement, language: lang });
    }
    const granted = await ensureProAccess();
    if (!alreadyPro) {
      // granted here means purchased/restored on this paywall presentation
      trackEvent(posthog, 'paywall_result', {
        placement,
        outcome: granted ? 'converted' : 'dismissed',
        language: lang,
      });
      if (granted) setShowProBadge(false);
    }
    if (granted) router.push(route);
  };

  const ProBadge = () => (
    <View className="rounded-full bg-indigo-600 dark:bg-indigo-500 px-2 py-0.5">
      <UIText variant="caption" className="text-white font-bold text-[10px] tracking-[0.08em]">
        PRO
      </UIText>
    </View>
  );

  return (
    <Screen testID="screen.home">
      <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
        <View className="flex-row justify-end -mb-2">
          <PressableScale
            onPress={() => {
              trackEvent(posthog, 'home_settings_clicked', { language: lang });
              router.push('/settings');
            }}
            scaleTo={0.92}
            testID="home.settings"
            accessibilityRole="button"
            accessibilityLabel={t('home.settings', lang)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="p-2 -mr-2 rounded-full active:bg-slate-200/60 dark:active:bg-slate-800/60"
          >
            <IconSymbol name="gearshape.fill" size={22} color="#6366f1" />
          </PressableScale>
        </View>

        <PressableScale
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
                {/* "View stats" pill is redundant at large text (whole card is
                    tappable) and won't fit beside the label — hide it. */}
                {!largeText && (
                  <View className="rounded-full border border-indigo-200/80 dark:border-indigo-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-1">
                    <UIText variant="caption" className="text-indigo-700 dark:text-indigo-200">
                      {t('home.viewStats', lang)}
                    </UIText>
                  </View>
                )}
              </View>

              {/* Readiness Score Section */}
              <View className="gap-2">
                <View className={largeText ? 'gap-2 items-start' : 'flex-row items-center justify-between'}>
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
                  <AnimatedBar
                    value={Math.max(readinessScore, 1)}
                    className={`rounded-full ${readinessInfo.barColor}`}
                  />
                </View>
              </View>

              {/* Side-by-side normally; stack to full-width blocks at Larger
                  Text so the labels/values never clip. */}
              <View className={largeText ? 'gap-3' : 'flex-row items-end justify-between gap-3'}>
                <View className={largeText ? '' : 'flex-1'}>
                  <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
                    {t('stats.accuracy7d', lang)}
                  </UIText>
                  <UIText variant="subtitle" className="text-slate-900 dark:text-slate-50">
                    {recentAccuracy !== null ? `${recentAccuracy}%` : '—'}
                  </UIText>
                </View>
                <View className={largeText ? '' : 'flex-1 items-end'}>
                  <UIText variant="caption" className={`text-slate-600 dark:text-slate-300 ${largeText ? '' : 'text-right'}`}>
                    {t('stats.currentStreak', lang)}
                  </UIText>
                  <UIText variant="subtitle" className={`text-emerald-600 dark:text-emerald-300 ${largeText ? '' : 'text-right'}`}>
                    {streak} {t('home.streakDays', lang)}
                  </UIText>
                </View>
              </View>
            </View>
          </Card>
        </PressableScale>

        <Card
          className="flex-row items-center justify-between bg-slate-50/80 dark:bg-slate-900/40"
          onPress={() => {
            trackEvent(posthog, 'home_mock_clicked', { language: lang });
            router.push('/mock');
          }}
          testID="home.mock"
          accessibilityLabel={`${t('home.mock', lang)}, ${t('home.mockSubtitle', lang)}`}
        >
          <View className="flex-1 gap-1">
            <UIText variant="subtitle" className="text-slate-900 dark:text-slate-50">
              {t('home.mock', lang)}
            </UIText>
            <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
              {t('home.mockSubtitle', lang)}
            </UIText>
          </View>
          <IconSymbol name="chevron.right" size={20} color="#94a3b8" />
        </Card>

        <Card
          className="flex-row items-center justify-between"
          onPress={() => openGated('/mistakes', 'home_mistakes_clicked')}
          testID="home.mistakes"
          accessibilityLabel={`${t('home.mistakes', lang)}, ${
            mistakeCount === 0
              ? t('home.mistakesSubtitle.zero', lang)
              : t('home.mistakesSubtitle.count', lang).replace('{count}', String(mistakeCount))
          }${showProBadge ? ', PRO' : ''}`}
        >
          <View className="flex-1 gap-1">
            <View className="flex-row items-center gap-2">
              <UIText variant="subtitle" className="text-slate-900 dark:text-slate-50">
                {t('home.mistakes', lang)}
              </UIText>
              {showProBadge && <ProBadge />}
            </View>
            <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
              {mistakeCount === 0
                ? t('home.mistakesSubtitle.zero', lang)
                : t('home.mistakesSubtitle.count', lang).replace('{count}', String(mistakeCount))}
            </UIText>
          </View>
          <IconSymbol name="chevron.right" size={20} color="#94a3b8" />
        </Card>

        <Card className="gap-3">
          <View className="flex-row items-center gap-2">
            <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
              {t('study.smartTitle', lang)}
            </UIText>
            {showProBadge && <ProBadge />}
          </View>
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
      </ScrollView>
    </Screen>
  );
}
