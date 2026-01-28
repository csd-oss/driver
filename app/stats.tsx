import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import { t } from '@/src/i18n/i18n';
import { getLanguage, getReadinessMode } from '@/src/lib/settings';
import { calculateAccuracy, calculateCoverage, getLast7Days, getReadinessBreakdown, getTotalUniqueQuestions, loadStats } from '@/src/lib/stats';
import * as MistakesDB from '@/src/db/queries/mistakes';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState, useEffect } from 'react';
import { ScrollView, View } from 'react-native';

export default function StatsScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [stats, setStats] = useState(null);
  const [totalUniqueQuestions, setTotalUniqueQuestions] = useState(0);
  const [readinessBreakdown, setReadinessBreakdown] = useState(null);

  const loadData = useCallback(async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    // Load mistake count from database
    const mistakesCount = await MistakesDB.getMistakesCount(currentLang);
    setMistakeCount(mistakesCount);
    
    // Load stats
    const loadedStats = await loadStats();
    const langStr = String(currentLang);
    const langStats = loadedStats.statsByLang?.[langStr];
    setStats(langStats);
    
    // Get total unique questions
    const total = getTotalUniqueQuestions(currentLang);
    setTotalUniqueQuestions(total);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Calculate readiness breakdown
  useFocusEffect(
    useCallback(() => {
      const calculateBreakdown = async () => {
        if (stats) {
          const useConservative = await getReadinessMode();
          const breakdown = await getReadinessBreakdown(lang, mistakeCount, stats, useConservative);
          setReadinessBreakdown(breakdown);
        } else {
          setReadinessBreakdown(null);
        }
      };
      calculateBreakdown();
    }, [lang, mistakeCount, stats])
  );

  if (!stats) {
    return (
      <Screen header={<Header title={t('stats.title', lang)} />}>
        <View className="flex-1 items-center justify-center mt-1">
          <UIText variant="body">Loading...</UIText>
        </View>
      </Screen>
    );
  }

  // Calculate metrics
  const lifetimeAccuracy = calculateAccuracy(stats.study.attempts, stats.study.correct);
  
  // Calculate 7-day accuracy
  const last7Days = getLast7Days();
  let totalAttempts7d = 0;
  let totalCorrect7d = 0;
  const dailyData = [];
  
  last7Days.forEach((dateKey) => {
    const daily = stats.study.daily?.[dateKey] || { attempts: 0, correct: 0, wrong: 0 };
    totalAttempts7d += daily.attempts || 0;
    totalCorrect7d += daily.correct || 0;
    
    const date = new Date(
      parseInt(dateKey.substring(0, 4)),
      parseInt(dateKey.substring(4, 6)) - 1,
      parseInt(dateKey.substring(6, 8))
    );
    const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dayAccuracy = calculateAccuracy(daily.attempts, daily.correct);
    
    dailyData.push({
      dateKey,
      dayLabel,
      attempts: daily.attempts,
      accuracy: dayAccuracy,
    });
  });
  
  const accuracy7d = calculateAccuracy(totalAttempts7d, totalCorrect7d);
  const maxAttempts7d = Math.max(...dailyData.map((day) => day.attempts), 1);
  
  // Calculate mock exam metrics
  const passRate = stats.mock.examsTaken > 0
    ? Math.round((stats.mock.examsPassed / stats.mock.examsTaken) * 100)
    : 0;
  
  // Calculate coverage
  const questionsSeen = stats.coverage?.questionsSeen || [];
  const coverage = calculateCoverage(lang, questionsSeen);
  
  // Calculate progress bar width - ensure minimum 1% for visibility when there's progress
  const progressBarPercentage = questionsSeen.length > 0 ? Math.max(coverage, 1) : 0;
  
  // Get readiness status colors
  const getReadinessStatusInfo = (score) => {
    if (score >= 80) {
      return {
        bgColor: 'bg-emerald-500/15 dark:bg-emerald-500/20',
        textColor: 'text-emerald-700 dark:text-emerald-200',
        barColor: 'bg-emerald-500',
      };
    } else if (score >= 60) {
      return {
        bgColor: 'bg-amber-500/15 dark:bg-amber-500/20',
        textColor: 'text-amber-700 dark:text-amber-200',
        barColor: 'bg-amber-500',
      };
    } else {
      return {
        bgColor: 'bg-rose-500/15 dark:bg-rose-500/20',
        textColor: 'text-rose-700 dark:text-rose-200',
        barColor: 'bg-rose-500',
      };
    }
  };
  
  const readinessInfo = readinessBreakdown ? getReadinessStatusInfo(readinessBreakdown.overall) : getReadinessStatusInfo(0);
  const readinessBarWidth = readinessBreakdown ? `${Math.max(readinessBreakdown.overall, 1)}%` : '0%';
  
  // Format last study date
  const formatLastStudyDate = () => {
    if (!stats.engagement.lastStudyDate) {
      return t('stats.noData', lang);
    }
    
    const today = new Date();
    const todayKey = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    
    if (stats.engagement.lastStudyDate === todayKey) {
      return t('stats.today', lang);
    }
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}${String(yesterday.getMonth() + 1).padStart(2, '0')}${String(yesterday.getDate()).padStart(2, '0')}`;
    
    if (stats.engagement.lastStudyDate === yesterdayKey) {
      return t('stats.yesterday', lang);
    }
    
    // Format as date
    const date = new Date(
      parseInt(stats.engagement.lastStudyDate.substring(0, 4)),
      parseInt(stats.engagement.lastStudyDate.substring(4, 6)) - 1,
      parseInt(stats.engagement.lastStudyDate.substring(6, 8))
    );
    return date.toLocaleDateString();
  };

  const getAccuracyBadgeClass = (value) => {
    if (typeof value !== 'number') {
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    }
    if (value >= 85) {
      return 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200';
    }
    if (value >= 70) {
      return 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200';
    }
    return 'bg-rose-500/15 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200';
  };

  return (
    <Screen header={<Header title={t('stats.title', lang)} />}>
      <ScrollView className="flex-1 mt-1" contentContainerClassName="gap-4 pb-2">
        {/* Overview Card */}
        <Card className="gap-4 overflow-hidden bg-gradient-to-r from-indigo-500/10 via-sky-500/10 to-emerald-500/10 border-indigo-200/60 dark:border-indigo-700/40">
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <UIText variant="subtitle" className="text-indigo-700 dark:text-indigo-200">
                {t('stats.yourProgress', lang)}
              </UIText>
              <View className="rounded-full border border-indigo-200/70 dark:border-indigo-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-1">
                <UIText variant="caption" className="text-indigo-700 dark:text-indigo-200">
                  {coverage}% coverage
                </UIText>
              </View>
            </View>

            <View className="flex-row items-end justify-between">
              <View>
                <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
                  {t('stats.accuracy7d', lang)}
                </UIText>
                <UIText variant="title" className="text-slate-900 dark:text-slate-50">
                  {accuracy7d}{typeof accuracy7d === 'number' ? '%' : ''}
                </UIText>
              </View>
              <View className="items-end">
                <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
                  {t('stats.accuracyLifetime', lang)}
                </UIText>
                <UIText variant="subtitle" className="text-slate-900 dark:text-slate-50">
                  {lifetimeAccuracy}{typeof lifetimeAccuracy === 'number' ? '%' : ''}
                </UIText>
              </View>
            </View>

            <View className="mt-1">
              <View className="h-2 rounded-full bg-slate-200/70 dark:bg-slate-800/70 overflow-hidden">
                {questionsSeen.length > 0 && (
                  <View
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${progressBarPercentage}%` }}
                  />
                )}
              </View>
              <UIText variant="caption" className="mt-2 text-slate-600 dark:text-slate-300">
                {questionsSeen.length} {t('stats.ofTotal', lang).replace('{total}', String(totalUniqueQuestions))}
              </UIText>
            </View>

            <View className="gap-3">
              <View className="flex-row gap-3">
                <View className="flex-1 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-2">
                  <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                    {t('stats.mistakesRemaining', lang)}
                  </UIText>
                  <UIText variant="subtitle" className="text-slate-900 dark:text-slate-50">
                    {mistakeCount}
                  </UIText>
                </View>
                <View className="flex-1 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-2">
                  <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                    {t('stats.studyAttempts', lang)}
                  </UIText>
                  <UIText variant="subtitle" className="text-slate-900 dark:text-slate-50">
                    {stats.study.attempts}
                  </UIText>
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-2">
                  <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                    {t('stats.currentStreak', lang)}
                  </UIText>
                  <UIText variant="subtitle" className="text-emerald-600 dark:text-emerald-300">
                    {stats.engagement.currentStreak} days
                  </UIText>
                </View>
                <View className="flex-1 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-2">
                  <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                    {t('stats.questionCoverage', lang)}
                  </UIText>
                  <UIText variant="subtitle" className="text-slate-900 dark:text-slate-50">
                    {coverage}%
                  </UIText>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Exam Readiness Card */}
        {readinessBreakdown && (
        <Card className="gap-4">
          <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
            {t('readiness.title', lang)}
          </UIText>
          
          {/* Overall Score */}
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
                {t('readiness.overall', lang)}
              </UIText>
              <View className={`rounded-full px-3 py-1 ${readinessInfo.bgColor}`}>
                <UIText variant="caption" className={`font-semibold ${readinessInfo.textColor}`}>
                  {readinessBreakdown.overall >= 80 ? t('readiness.ready', lang) : 
                   readinessBreakdown.overall >= 60 ? t('readiness.gettingThere', lang) : 
                   t('readiness.needsWork', lang)}
                </UIText>
              </View>
            </View>
            <View className="flex-row items-end gap-2">
              <UIText variant="title" className="text-slate-900 dark:text-slate-50">
                {readinessBreakdown.overall}%
              </UIText>
            </View>
            <View className="h-2 rounded-full bg-slate-200/70 dark:bg-slate-800/70 overflow-hidden">
              <View
                className={`h-full rounded-full ${readinessInfo.barColor}`}
                style={{ width: readinessBarWidth }}
              />
            </View>
          </View>

          {/* Component Breakdown */}
          <View className="gap-3 mt-2">
            <UIText variant="caption" className="text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Component Breakdown
            </UIText>
            
            {/* Mistakes Component */}
            <View className="rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-2 gap-1">
              <View className="flex-row items-center justify-between">
                <UIText variant="body" className="text-slate-900 dark:text-slate-50">
                  {t('readiness.mistakes', lang)}
                </UIText>
                <View className="flex-row items-center gap-2">
                  <UIText variant="body" className="font-semibold text-slate-900 dark:text-slate-50">
                    {Math.round(readinessBreakdown.components.mistakes.score)}%
                  </UIText>
                  <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                    ({t('readiness.weight', lang).replace('{weight}', String(Math.round(readinessBreakdown.components.mistakes.weight * 100)))})
                  </UIText>
                </View>
              </View>
              <UIText variant="caption" className="text-slate-600 dark:text-slate-400">
                {readinessBreakdown.components.mistakes.count} {t('stats.mistakesRemaining', lang).toLowerCase()}
              </UIText>
              {readinessBreakdown.components.mistakes.warning && (
                <UIText variant="caption" className="text-amber-600 dark:text-amber-400 mt-1">
                  {t('readiness.insufficientData', lang)}
                </UIText>
              )}
            </View>

            {/* Performance Component */}
            <View className="rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-2 gap-1">
              <View className="flex-row items-center justify-between">
                <UIText variant="body" className="text-slate-900 dark:text-slate-50">
                  {t('readiness.performance', lang)}
                </UIText>
                <View className="flex-row items-center gap-2">
                  <UIText variant="body" className="font-semibold text-slate-900 dark:text-slate-50">
                    {readinessBreakdown.components.performance.score}%
                  </UIText>
                  <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                    ({t('readiness.weight', lang).replace('{weight}', String(Math.round(readinessBreakdown.components.performance.weight * 100)))})
                  </UIText>
                </View>
              </View>
              <UIText variant="caption" className="text-slate-600 dark:text-slate-400">
                {readinessBreakdown.components.performance.attempts} {readinessBreakdown.components.performance.attempts === 1 ? 'attempt' : 'attempts'} (last 7 days)
              </UIText>
              {readinessBreakdown.components.performance.warning && (
                <UIText variant="caption" className="text-amber-600 dark:text-amber-400 mt-1">
                  {t('readiness.insufficientData', lang)}
                </UIText>
              )}
            </View>

            {/* Mock Exam Component */}
            <View className="rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-2 gap-1">
              <View className="flex-row items-center justify-between">
                <UIText variant="body" className="text-slate-900 dark:text-slate-50">
                  {t('readiness.mockExam', lang)}
                </UIText>
                <View className="flex-row items-center gap-2">
                  <UIText variant="body" className="font-semibold text-slate-900 dark:text-slate-50">
                    {readinessBreakdown.components.mockExam.examsTaken > 0 ? Math.round(readinessBreakdown.components.mockExam.score) : 0}%
                  </UIText>
                  <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                    ({t('readiness.weight', lang).replace('{weight}', String(Math.round(readinessBreakdown.components.mockExam.weight * 100)))})
                  </UIText>
                </View>
              </View>
              {readinessBreakdown.components.mockExam.examsTaken > 0 ? (
                <>
                  <UIText variant="caption" className="text-slate-600 dark:text-slate-400">
                    {t('readiness.passRate', lang)}: {Math.round(readinessBreakdown.components.mockExam.passRate)}%
                  </UIText>
                  <UIText variant="caption" className="text-slate-600 dark:text-slate-400">
                    {t('readiness.recentPassRate', lang)}: {Math.round(readinessBreakdown.components.mockExam.recentPassRate)}%
                  </UIText>
                  <UIText variant="caption" className="text-slate-600 dark:text-slate-400">
                    {t('readiness.examsTaken', lang)}: {readinessBreakdown.components.mockExam.examsTaken}
                  </UIText>
                </>
              ) : (
                <UIText variant="caption" className="text-slate-600 dark:text-slate-400">
                  {t('stats.noExams', lang)}
                </UIText>
              )}
            </View>

            {/* Coverage Component */}
            <View className="rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-2 gap-1">
              <View className="flex-row items-center justify-between">
                <UIText variant="body" className="text-slate-900 dark:text-slate-50">
                  {t('readiness.coverage', lang)}
                </UIText>
                <View className="flex-row items-center gap-2">
                  <UIText variant="body" className="font-semibold text-slate-900 dark:text-slate-50">
                    {readinessBreakdown.components.coverage.score}%
                  </UIText>
                  <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                    ({t('readiness.weight', lang).replace('{weight}', String(Math.round(readinessBreakdown.components.coverage.weight * 100)))})
                  </UIText>
                </View>
              </View>
              <UIText variant="caption" className="text-slate-600 dark:text-slate-400">
                {readinessBreakdown.components.coverage.seen} {t('stats.ofTotal', lang).replace('{total}', String(readinessBreakdown.components.coverage.total))}
              </UIText>
            </View>
          </View>
        </Card>
        )}

        {/* Last 7 Days Card */}
        <Card className="gap-4">
          <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
            {t('stats.last7Days', lang)}
          </UIText>
          {totalAttempts7d === 0 ? (
            <UIText variant="body" className="text-slate-500 dark:text-slate-400">
              {t('stats.noData', lang)}
            </UIText>
          ) : (
            <View className="gap-3">
              {dailyData.map((day) => {
                return (
                  <View key={day.dateKey} className="gap-2">
                    <View className="flex-row items-center justify-between">
                      <UIText variant="body">{day.dayLabel}</UIText>
                      <View className={`rounded-full px-2 py-1 ${getAccuracyBadgeClass(day.accuracy)}`}>
                        <UIText variant="caption" className="font-semibold">
                          {day.accuracy}{typeof day.accuracy === 'number' ? '%' : ''}
                        </UIText>
                      </View>
                    </View>
                    <UIText variant="caption" className="text-slate-600 dark:text-slate-400">
                      {day.attempts} {day.attempts === 1 ? 'attempt' : 'attempts'}
                    </UIText>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* Mock Exams Card */}
        <Card className="gap-4">
          <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
            {t('stats.mockExams', lang)}
          </UIText>
          {stats.mock.examsTaken === 0 ? (
            <UIText variant="body" className="text-slate-500 dark:text-slate-400">
              {t('stats.noExams', lang)}
            </UIText>
          ) : (
            <View className="gap-2">
              <View className="flex-row justify-between">
                <UIText variant="body">{t('stats.examsTaken', lang)}</UIText>
                <UIText variant="body" className="font-semibold">{stats.mock.examsTaken}</UIText>
              </View>
              <View className="flex-row justify-between">
                <UIText variant="body">{t('stats.passRate', lang)}</UIText>
                <UIText variant="body" className="font-semibold">{passRate}%</UIText>
              </View>
              {stats.mock.bestScore > 0 && stats.mock.history.length > 0 && (
                <View className="flex-row justify-between">
                  <UIText variant="body">{t('stats.bestScore', lang)}</UIText>
                  <UIText variant="body" className="font-semibold">
                    {stats.mock.bestScore} / {stats.mock.history.find(h => h.score === stats.mock.bestScore)?.maxScore || stats.mock.history[0]?.maxScore || '—'}
                  </UIText>
                </View>
              )}
              {stats.mock.lastScore > 0 && stats.mock.history.length > 0 && (
                <View className="flex-row justify-between">
                  <UIText variant="body">{t('stats.lastScore', lang)}</UIText>
                  <UIText variant="body" className="font-semibold">
                    {stats.mock.lastScore} / {stats.mock.history[0]?.maxScore || '—'}
                  </UIText>
                </View>
              )}
            </View>
          )}
        </Card>

        {/* Consistency Card */}
        <Card className="gap-4">
          <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
            {t('stats.consistency', lang)}
          </UIText>
          <View className="gap-2">
            <View className="flex-row justify-between">
              <UIText variant="body">{t('stats.currentStreak', lang)}</UIText>
              <UIText variant="body" className="font-semibold">{stats.engagement.currentStreak} days</UIText>
            </View>
            <View className="flex-row justify-between">
              <UIText variant="body">{t('stats.lastStudy', lang)}</UIText>
              <UIText variant="body" className="font-semibold">{formatLastStudyDate()}</UIText>
            </View>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
