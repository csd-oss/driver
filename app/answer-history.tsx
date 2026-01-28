import { useState, useCallback, useEffect } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Header } from '@/components/ui/header';
import { Card } from '@/components/ui/card';
import { UIText } from '@/components/ui/text';
import { AspectImage } from '@/components/ui/aspect-image';
import { t } from '@/src/i18n/i18n';
import { getLanguage } from '@/src/lib/settings';
import { findQuestionById } from '@/src/lib/bank';
import * as AttemptsDB from '@/src/db/queries/attempts';
import { IMAGE_MANIFEST } from '@/data/imageManifest';

export default function AnswerHistoryScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    try {
      const attempts = await AttemptsDB.getAnswerHistory(currentLang, 200, 0);
      
      // Enrich attempts with question data
      const enrichedHistory = await Promise.all(
        attempts.map(async (attempt) => {
          const question = findQuestionById(currentLang, attempt.questionId);
          return {
            ...attempt,
            question,
          };
        })
      );
      
      setHistory(enrichedHistory);
    } catch (error) {
      console.error('Error loading answer history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory();
  }, [loadHistory]);

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  };

  const formatDateTime = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  const getModeBadgeColor = (mode: string) => {
    switch (mode) {
      case 'study':
        return 'bg-blue-500/15 text-blue-700 dark:text-blue-200';
      case 'mock':
        return 'bg-purple-500/15 text-purple-700 dark:text-purple-200';
      case 'mistakes':
        return 'bg-orange-500/15 text-orange-700 dark:text-orange-200';
      default:
        return 'bg-slate-500/15 text-slate-700 dark:text-slate-200';
    }
  };

  const renderHistoryItem = ({ item }) => {
    const attempt = item;
    const question = attempt.question;
    
    if (!question) {
      return (
        <Card className="gap-3 p-4">
          <UIText variant="body" className="text-slate-500 dark:text-slate-400">
            Question not found: {attempt.questionId}
          </UIText>
        </Card>
      );
    }

    const imageSource = question.image ? IMAGE_MANIFEST[question.image] : null;
    const selectedAnswerIndex = attempt.selectedAnswerIndex;
    const correctAnswerIndex = attempt.correctAnswerIndex;

    return (
      <Card className="gap-4 mb-4">
        {/* Question Text */}
        <UIText variant="body" className="mb-2">
          {question.text}
        </UIText>

        {/* Question Image */}
        {imageSource ? (
          <View className="my-2">
            <AspectImage
              source={imageSource}
              maxHeight={200}
              maxWidth={400}
            />
          </View>
        ) : question.image ? (
          <View className="my-2 p-2 bg-gray-100 dark:bg-gray-800 rounded">
            <UIText variant="caption">
              Image missing: {question.image}
            </UIText>
          </View>
        ) : null}

        {/* Answer Options */}
        <View className="gap-2 mt-2">
          {question.answers.map((answer: string, index: number) => {
            const answerNum = index + 1;
            const isSelected = answerNum === selectedAnswerIndex;
            const isCorrect = answerNum === correctAnswerIndex;
            
            let answerClassName = 'px-4 py-3 rounded-xl border-2 ';
            let textClassName = '';
            
            if (isCorrect) {
              answerClassName += 'bg-emerald-500/20 dark:bg-emerald-500/30 border-emerald-500 dark:border-emerald-400';
              textClassName = 'text-emerald-900 dark:text-emerald-100 font-semibold';
            } else if (isSelected && !attempt.isCorrect) {
              answerClassName += 'bg-rose-500/20 dark:bg-rose-500/30 border-rose-500 dark:border-rose-400';
              textClassName = 'text-rose-900 dark:text-rose-100 font-semibold';
            } else {
              answerClassName += 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600';
              textClassName = 'text-slate-700 dark:text-slate-300';
            }

            return (
              <View key={index} className={answerClassName}>
                <UIText variant="body" className={textClassName}>
                  {answer}
                </UIText>
                {isCorrect && (
                  <UIText variant="caption" className="text-emerald-700 dark:text-emerald-200 mt-1">
                    ✓ {t('history.correctAnswer', lang)}
                  </UIText>
                )}
                {isSelected && !attempt.isCorrect && (
                  <UIText variant="caption" className="text-rose-700 dark:text-rose-200 mt-1">
                    ✗ {t('history.yourAnswer', lang)}
                  </UIText>
                )}
              </View>
            );
          })}
        </View>

        {/* Result Badge */}
        <View className={`mt-2 px-3 py-2 rounded-lg ${attempt.isCorrect ? 'bg-emerald-500/15 dark:bg-emerald-500/20' : 'bg-rose-500/15 dark:bg-rose-500/20'}`}>
          <UIText variant="subtitle" className={attempt.isCorrect ? 'text-emerald-700 dark:text-emerald-200' : 'text-rose-700 dark:text-rose-200'}>
            {attempt.isCorrect ? t('history.correct', lang) : t('history.incorrect', lang)}
          </UIText>
        </View>

        {/* Metadata Section */}
        <View className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 gap-2">
          {/* Mode and Category */}
          <View className="flex-row gap-2 flex-wrap">
            <View className={`px-2 py-1 rounded-full ${getModeBadgeColor(attempt.mode)}`}>
              <UIText variant="caption" className="font-semibold">
                {attempt.mode === 'study' ? t('history.modeStudy', lang) : 
                 attempt.mode === 'mock' ? t('history.modeMock', lang) : 
                 t('history.modeMistakes', lang)}
              </UIText>
            </View>
            {attempt.categoryText && (
              <View className="px-2 py-1 rounded-full bg-slate-200/50 dark:bg-slate-700/50">
                <UIText variant="caption" className="text-slate-700 dark:text-slate-300">
                  {attempt.categoryText}
                </UIText>
              </View>
            )}
          </View>

          {/* Timing Information */}
          <View className="gap-1.5 mt-2">
            <View className="flex-row justify-between">
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                {t('history.responseTime', lang)}:
              </UIText>
              <UIText variant="caption" className="text-slate-900 dark:text-slate-50 font-semibold">
                {formatResponseTime(attempt.responseTimeMs)}
              </UIText>
            </View>
            <View className="flex-row justify-between">
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                {t('history.questionShownAt', lang)}:
              </UIText>
              <UIText variant="caption" className="text-slate-700 dark:text-slate-300">
                {formatDateTime(attempt.questionShownAt)}
              </UIText>
            </View>
            <View className="flex-row justify-between">
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                {t('history.answeredAt', lang)}:
              </UIText>
              <UIText variant="caption" className="text-slate-700 dark:text-slate-300">
                {formatDateTime(attempt.answerSubmittedAt)}
              </UIText>
            </View>
            <View className="flex-row justify-between">
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                {t('history.date', lang)}:
              </UIText>
              <UIText variant="caption" className="text-slate-700 dark:text-slate-300">
                {formatDateTime(attempt.createdAt)}
              </UIText>
            </View>
          </View>

          {/* Additional Info */}
          <View className="flex-row gap-3 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <View>
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                {t('history.points', lang)}:
              </UIText>
              <UIText variant="caption" className="text-slate-900 dark:text-slate-50 font-semibold">
                {attempt.points}
              </UIText>
            </View>
            {attempt.wasInMistakes && (
              <View>
                <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                  {t('history.wasInMistakes', lang)}
                </UIText>
              </View>
            )}
          </View>
        </View>
      </Card>
    );
  };

  if (loading) {
    return (
      <Screen header={<Header title={t('history.title', lang)} />}>
        <View className="flex-1 items-center justify-center mt-1">
          <UIText variant="body">Loading...</UIText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen header={<Header title={t('history.title', lang)} />}>
      {history.length === 0 ? (
        <View className="flex-1 items-center justify-center mt-1 px-4">
          <UIText variant="body" className="text-slate-500 dark:text-slate-400 text-center">
            {t('history.empty', lang)}
          </UIText>
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderHistoryItem}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 py-2"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </Screen>
  );
}
