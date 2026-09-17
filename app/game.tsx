import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import * as GameRoundsDB from '@/src/db/queries/gameRounds';
import { t } from '@/src/i18n/i18n';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { getCachedLanguage, getGuideFinished, getLanguage } from '@/src/lib/settings';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

// Hub for "Who goes first?": the crossing minigame and the exam-picture quiz.
export default function GameHubScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const [lang, setLang] = useState(getCachedLanguage);
  const [bestCrossing, setBestCrossing] = useState(0);
  const [bestQuiz, setBestQuiz] = useState(0);
  const [guideDone, setGuideDone] = useState(true);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'GameHub');
      getLanguage().then(async (l) => {
        setLang(l);
        const [crossing, quiz, guide] = await Promise.all([
          GameRoundsDB.getGameStats(l, 'crossing'),
          GameRoundsDB.getGameStats(l, 'quiz'),
          getGuideFinished(),
        ]);
        setBestCrossing(crossing.best);
        setBestQuiz(quiz.best);
        setGuideDone(guide);
      });
    }, [posthog])
  );

  return (
    <Screen testID="screen.game" header={<Header title={t('game.title', lang)} />}>
      <ScrollView className="flex-1" contentContainerClassName="gap-4 mt-1 pb-6" showsVerticalScrollIndicator={false}>
        <Card className="gap-3" testID="game.modeGame">
          <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
            🚦 {t('crossing.title', lang)}
          </UIText>
          <UIText variant="body" className="text-slate-600 dark:text-slate-300">
            {t('crossing.hubBody', lang)}
          </UIText>
          <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
            {guideDone ? `${t('game.best', lang)}: ${bestCrossing}` : t('guide.gateBody', lang)}
          </UIText>
          {/* The guide comes first: it teaches the swipes and every junction. */}
          <Button
            onPress={() => {
              trackEvent(posthog, 'game_mode_selected', { mode: guideDone ? 'crossing' : 'guide', language: lang });
              router.push(guideDone ? '/crossing' : '/crossing-guide');
            }}
            variant="default"
            className="w-full"
            testID={guideDone ? 'game.playCrossing' : 'game.startGuide'}
          >
            {guideDone ? t('game.start', lang) : t('guide.startGuide', lang)}
          </Button>
          {guideDone && (
            <Button onPress={() => router.push('/crossing-guide')} variant="outline" className="w-full" testID="game.replayGuide">
              {t('guide.replay', lang)}
            </Button>
          )}
          <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
            {t('crossing.hubLogHint', lang)}
          </UIText>
          <Button onPress={() => router.push('/crossing-log')} variant="outline" className="w-full" testID="game.crossingLog">
            {t('crossing.log.open', lang)}
          </Button>
        </Card>
        <Card className="gap-3" testID="game.modeQuiz">
          <UIText variant="subtitle" className="text-slate-900 dark:text-slate-50">
            {t('crossing.modeQuiz', lang)}
          </UIText>
          <UIText variant="body" className="text-slate-600 dark:text-slate-300">
            {t('crossing.modeQuizBody', lang)}
          </UIText>
          <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
            {t('game.best', lang)}: {bestQuiz}
          </UIText>
          <Button
            onPress={() => {
              trackEvent(posthog, 'game_mode_selected', { mode: 'quiz', language: lang });
              router.push('/game-quiz');
            }}
            variant="outline"
            className="w-full"
            testID="game.playQuiz"
          >
            {t('game.start', lang)}
          </Button>
        </Card>
        <View className="h-2" />
      </ScrollView>
    </Screen>
  );
}
