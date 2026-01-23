import { useState, useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { getLanguage } from '@/src/lib/settings';
import { loadProgress } from '@/src/lib/storage';
import { loadStats, getLast7Days, calculateAccuracy, getTotalUniqueQuestions, calculateCoverage } from '@/src/lib/stats';
import { t } from '@/src/i18n/i18n';

export default function StatsScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [stats, setStats] = useState(null);
  const [totalUniqueQuestions, setTotalUniqueQuestions] = useState(0);

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
  
  // Calculate mock exam metrics
  const passRate = stats.mock.examsTaken > 0
    ? Math.round((stats.mock.examsPassed / stats.mock.examsTaken) * 100)
    : 0;
  
  // Calculate coverage
  const questionsSeen = stats.coverage?.questionsSeen || [];
  const coverage = calculateCoverage(lang, questionsSeen);
  
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

  return (
    <Screen header={<Header title={t('stats.title', lang)} />}>
      <ScrollView className="flex-1 mt-1" contentContainerClassName="gap-4 pb-2">
        {/* Overview Card */}
        <Card className="gap-4">
          <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
            {t('stats.yourProgress', lang)}
          </UIText>
          <View className="gap-2">
            <View className="flex-row justify-between">
              <UIText variant="body">{t('stats.mistakesRemaining', lang)}</UIText>
              <UIText variant="body" className="font-semibold">{mistakeCount}</UIText>
            </View>
            <View className="flex-row justify-between">
              <UIText variant="body">{t('stats.studyAttempts', lang)}</UIText>
              <UIText variant="body" className="font-semibold">{stats.study.attempts}</UIText>
            </View>
            <View className="flex-row justify-between">
              <UIText variant="body">{t('stats.accuracyLifetime', lang)}</UIText>
              <UIText variant="body" className="font-semibold">
                {lifetimeAccuracy}{typeof lifetimeAccuracy === 'number' ? '%' : ''}
              </UIText>
            </View>
            <View className="flex-row justify-between">
              <UIText variant="body">{t('stats.accuracy7d', lang)}</UIText>
              <UIText variant="body" className="font-semibold">
                {accuracy7d}{typeof accuracy7d === 'number' ? '%' : ''}
              </UIText>
            </View>
            <View className="flex-row justify-between">
              <UIText variant="body">{t('stats.questionCoverage', lang)}</UIText>
              <UIText variant="body" className="font-semibold">
                {questionsSeen.length} {t('stats.ofTotal', lang).replace('{total}', String(totalUniqueQuestions))} ({coverage}%)
              </UIText>
            </View>
          </View>
        </Card>

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
            <View className="gap-2">
              {dailyData.map((day) => (
                <View key={day.dateKey} className="flex-row justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                  <UIText variant="body">{day.dayLabel}</UIText>
                  <View className="flex-row gap-4">
                    <UIText variant="body" className="text-slate-600 dark:text-slate-400">
                      {day.attempts} {day.attempts === 1 ? 'attempt' : 'attempts'}
                    </UIText>
                    <UIText variant="body" className="font-semibold">
                      {day.accuracy}{typeof day.accuracy === 'number' ? '%' : ''}
                    </UIText>
                  </View>
                </View>
              ))}
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
