import { GameChip, chipLabel } from '@/components/GameChip';
import { AspectImage } from '@/components/ui/aspect-image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import { IMAGE_MANIFEST } from '@/data/imageManifest';
import * as AttemptsDB from '@/src/db/queries/attempts';
import * as GameRoundsDB from '@/src/db/queries/gameRounds';
import * as MistakesDB from '@/src/db/queries/mistakes';
import { t, tf } from '@/src/i18n/i18n';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { confirmDialog } from '@/src/lib/dialog';
import { applyAnswer } from '@/src/lib/engine';
import {
  LIVES,
  TIME_LIMIT_MS,
  answerIndexForSequence,
  createRound,
  scoreAnswer,
} from '@/src/lib/game';
import { getCachedLanguage, getLanguage } from '@/src/lib/settings';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

type Phase = 'intro' | 'playing' | 'feedback' | 'result';
type Outcome = 'correct' | 'wrong' | 'timeout';

interface GameItem {
  qid: string;
  text: string;
  image: string;
  points: number;
  answers: string[];
  correct: number;
  category: string | null;
  type: 'order' | 'pick' | 'ordinal' | 'choice';
  chips?: { key: string; keys: string[]; answerIndex?: number }[];
  sequence?: string[];
  answerSequences?: string[][];
}

const haptic = (correct: boolean) => {
  Haptics.notificationAsync(
    correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
  ).catch(() => {});
};

/**
 * "Who goes first?": ROUND_SIZE intersection situations, LIVES lives, a
 * TIME_LIMIT_MS countdown each. Every answer is logged like a study answer
 * (mode "game") so mistakes and readiness see it.
 */
export default function GameScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const [lang, setLang] = useState(getCachedLanguage);
  const [phase, setPhase] = useState<Phase>('intro');
  const [best, setBest] = useState(0);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [round, setRound] = useState<GameItem[]>([]);
  const [index, setIndex] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [placed, setPlaced] = useState<string[]>([]);
  const [remainingMs, setRemainingMs] = useState(TIME_LIMIT_MS);
  const [outcome, setOutcome] = useState<Outcome>('correct');
  const [earned, setEarned] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [playedCount, setPlayedCount] = useState(0);
  const shownAtRef = useRef<number>(0);
  const roundStartedRef = useRef<number>(0);
  const answeredRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const item = round[index];

  const loadStats = useCallback(async (currentLang: number) => {
    const stats = await GameRoundsDB.getGameStats(currentLang);
    setBest(stats.best);
    setRoundsPlayed(stats.rounds);
  }, []);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Game');
      getLanguage().then((l) => {
        setLang(l);
        loadStats(l);
      });
    }, [loadStats, posthog])
  );

  const showItem = useCallback((nextIndex: number) => {
    setIndex(nextIndex);
    setPlaced([]);
    setRemainingMs(TIME_LIMIT_MS);
    shownAtRef.current = Date.now();
    answeredRef.current = false;
    setPhase('playing');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const startRound = useCallback(() => {
    const items = createRound(lang) as GameItem[];
    setRound(items);
    setLives(LIVES);
    setScore(0);
    setStreak(0);
    setCorrectCount(0);
    setIsNewBest(false);
    roundStartedRef.current = Date.now();
    trackEvent(posthog, 'game_started', { language: lang });
    showItem(0);
    // showItem sets index to 0 against the previous round until state settles; force it.
    setIndex(0);
  }, [lang, posthog, showItem]);

  const finishRound = useCallback(
    async (finalScore: number, finalCorrect: number, played: number) => {
      const durationSec = Math.round((Date.now() - roundStartedRef.current) / 1000);
      setPlayedCount(played);
      const newBest = finalScore > best;
      setIsNewBest(newBest);
      setPhase('result');
      try {
        await GameRoundsDB.addGameRound({
          lang,
          score: finalScore,
          correctCount: finalCorrect,
          total: played,
          durationSec,
        });
      } catch {
        /* a lost score row must not break the screen */
      }
      trackEvent(posthog, 'game_finished', {
        language: lang,
        score: finalScore,
        correct: finalCorrect,
        total: played,
        new_best: newBest,
        duration_sec: durationSec,
      });
      await loadStats(lang);
    },
    [best, lang, loadStats, posthog]
  );

  // Records one answer: score, lives, mistakes, attempts log, then feedback.
  const settle = useCallback(
    async (correct: boolean, answerIndex: number, timedOut = false) => {
      if (!item || answeredRef.current) return;
      answeredRef.current = true;
      const elapsedMs = Math.min(TIME_LIMIT_MS, Date.now() - shownAtRef.current);
      const points = scoreAnswer({ correct, elapsedMs, streak });
      const nextScore = score + points;
      const nextStreak = correct ? streak + 1 : 0;
      const nextLives = correct ? lives : lives - 1;
      const nextCorrect = correct ? correctCount + 1 : correctCount;
      setEarned(points);
      setScore(nextScore);
      setStreak(nextStreak);
      setLives(nextLives);
      setCorrectCount(nextCorrect);
      setOutcome(timedOut ? 'timeout' : correct ? 'correct' : 'wrong');
      setPhase('feedback');
      haptic(correct);

      trackEvent(posthog, 'game_answer', {
        language: lang,
        question_id: item.qid,
        type: item.type,
        correct,
        timed_out: timedOut,
        elapsed_ms: elapsedMs,
        points,
      });

      try {
        const wasInMistakes = await MistakesDB.isMistake(lang, item.qid);
        await applyAnswer(null, lang, item.qid, correct);
        await AttemptsDB.logAnswerAttempt({
          lang,
          questionId: item.qid,
          mode: 'game',
          categoryText: item.category || undefined,
          selectedAnswerIndex: answerIndex,
          correctAnswerIndex: item.correct,
          isCorrect: correct,
          points: item.points,
          questionShownAt: new Date(shownAtRef.current),
          answerSubmittedAt: new Date(),
          wasInMistakes,
          responseTimeMs: elapsedMs,
        });
      } catch {
        /* logging must never block the game */
      }
    },
    [correctCount, item, lang, lives, posthog, score, streak]
  );

  // Countdown while a situation is on screen.
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => {
      const left = TIME_LIMIT_MS - (Date.now() - shownAtRef.current);
      if (left <= 0) {
        clearInterval(timer);
        setRemainingMs(0);
        settle(false, -1, true);
      } else {
        setRemainingMs(left);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [phase, settle]);

  const handleNext = () => {
    const isLast = index >= round.length - 1;
    if (lives <= 0 || isLast) {
      finishRound(score, correctCount, index + 1);
      return;
    }
    showItem(index + 1);
  };

  const handleChoice = (answerIndex: number) => {
    if (!item) return;
    settle(answerIndex === item.correct, answerIndex);
  };

  const handleOrderTap = (key: string) => {
    if (!item?.sequence || placed.includes(key)) return;
    const next = [...placed, key];
    setPlaced(next);
    if (next.length === item.sequence.length) {
      const correct = next.every((k, i) => k === item.sequence![i]);
      settle(correct, answerIndexForSequence(item, next));
    }
  };

  const handleUndo = () => setPlaced((current) => current.slice(0, -1));

  const handleQuit = async () => {
    const confirmed = await confirmDialog({
      title: t('game.quit', lang),
      message: t('game.quitMessage', lang),
      confirmText: t('game.quit', lang),
      cancelText: t('common.cancel', lang),
      destructive: true,
    });
    if (confirmed) {
      trackEvent(posthog, 'game_quit', { language: lang, at_index: index, score });
      setPhase('intro');
    }
  };

  const handleBack = () => {
    if (phase === 'playing' || phase === 'feedback') {
      handleQuit();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const hearts = Array.from({ length: LIVES }, (_, i) => (i < lives ? '♥' : '♡')).join(' ');
  const timerFraction = Math.max(0, Math.min(1, remainingMs / TIME_LIMIT_MS));
  const timerColor = timerFraction > 0.5 ? '#22c55e' : timerFraction > 0.25 ? '#f59e0b' : '#ef4444';

  const renderIntro = () => (
    <Card className="gap-4" testID="game.intro">
      <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
        🚦 {t('game.homeSubtitle', lang)}
      </UIText>
      <UIText variant="body" className="text-slate-600 dark:text-slate-300">
        {t('game.intro', lang)}
      </UIText>
      <View className="flex-row gap-3">
        <View className="flex-1 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-2">
          <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
            {t('game.best', lang)}
          </UIText>
          <UIText variant="subtitle" className="text-indigo-700 dark:text-indigo-200" testID="game.bestScore">
            {best}
          </UIText>
        </View>
        <View className="flex-1 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-2">
          <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
            {t('game.roundsPlayed', lang)}
          </UIText>
          <UIText variant="subtitle" className="text-slate-900 dark:text-slate-50">
            {roundsPlayed}
          </UIText>
        </View>
      </View>
      <Button onPress={startRound} variant="default" className="w-full" testID="game.start">
        {t('game.start', lang)}
      </Button>
    </Card>
  );

  const renderStatus = () => (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <UIText variant="body" className="text-rose-600 dark:text-rose-300 font-semibold" accessibilityLabel={`${t('game.lives', lang)} ${lives}`}>
          {hearts}
        </UIText>
        <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
          {tf('game.situation', lang, { n: index + 1, total: round.length })}
        </UIText>
        <View className="flex-row items-center gap-3">
          {streak > 1 && (
            <UIText variant="caption" className="font-semibold text-amber-600 dark:text-amber-300">
              🔥 {streak}
            </UIText>
          )}
          <UIText variant="subtitle" className="text-indigo-700 dark:text-indigo-200" testID="game.score">
            {score}
          </UIText>
        </View>
      </View>
      <View className="h-2 rounded-full bg-slate-200/70 dark:bg-slate-800/70 overflow-hidden">
        <View style={{ width: `${timerFraction * 100}%`, height: '100%', backgroundColor: timerColor, borderRadius: 999 }} />
      </View>
    </View>
  );

  const renderChips = () => {
    if (!item) return null;
    if (item.type === 'order' && item.sequence) {
      const available = item.chips!.filter((c) => !placed.includes(c.key));
      return (
        <View className="gap-3">
          <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
            {t('game.tapOrder', lang)}
          </UIText>
          <View className="flex-row flex-wrap gap-2">
            {available.map((chip) => (
              <GameChip key={chip.key} keys={chip.keys} lang={lang} onPress={() => handleOrderTap(chip.key)} testID={`game.chip.${chip.key}`} />
            ))}
          </View>
          <View className="rounded-2xl border border-dashed border-indigo-300/80 dark:border-indigo-600/60 px-3 py-2 gap-2 min-h-[64px]">
            <View className="flex-row items-center justify-between">
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                {t('game.yourOrder', lang)}
              </UIText>
              {placed.length > 0 && (
                <Button onPress={handleUndo} variant="secondary" className="min-h-[36px] py-1 px-3" testID="game.undo">
                  {t('game.undo', lang)}
                </Button>
              )}
            </View>
            <View className="flex-row flex-wrap gap-2">
              {placed.map((key, i) => (
                <GameChip key={key} keys={[key]} lang={lang} badge={i + 1} />
              ))}
            </View>
          </View>
        </View>
      );
    }
    if ((item.type === 'pick' || item.type === 'ordinal') && item.chips) {
      return (
        <View className="gap-3">
          <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
            {t('game.tapOne', lang)}
          </UIText>
          <View className="flex-row flex-wrap gap-2">
            {item.chips.map((chip) => (
              <GameChip
                key={chip.key}
                keys={chip.keys}
                lang={lang}
                onPress={() => handleChoice(chip.answerIndex!)}
                testID={`game.chip.${chip.key}`}
              />
            ))}
          </View>
        </View>
      );
    }
    return (
      <View className="gap-2">
        {item.answers.map((answer, i) => (
          <Button
            key={i}
            onPress={() => handleChoice(i + 1)}
            variant="outline"
            className="w-full"
            textClassName="text-left"
            testID={`game.answer.${i + 1}`}
          >
            {answer}
          </Button>
        ))}
      </View>
    );
  };

  const renderFeedback = () => {
    if (!item) return null;
    const correct = outcome === 'correct';
    const title = outcome === 'timeout' ? t('game.timeUp', lang) : correct ? t('game.correct', lang) : t('game.wrong', lang);
    return (
      <View
        className={`rounded-2xl px-4 py-3 gap-2 ${
          correct ? 'bg-emerald-500/15 dark:bg-emerald-500/20' : 'bg-rose-500/15 dark:bg-rose-500/20'
        }`}
        testID={correct ? 'game.feedback.correct' : 'game.feedback.wrong'}
      >
        <View className="flex-row items-center justify-between">
          <UIText variant="subtitle" className={correct ? 'text-emerald-700 dark:text-emerald-200' : 'text-rose-700 dark:text-rose-200'}>
            {title}
          </UIText>
          {correct && (
            <UIText variant="subtitle" className="text-emerald-700 dark:text-emerald-200">
              {tf('game.plusPoints', lang, { points: earned })}
            </UIText>
          )}
        </View>
        {!correct && (
          <View className="gap-1">
            <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
              {t('game.correctAnswer', lang)}
            </UIText>
            {item.type === 'order' && item.sequence ? (
              <View className="flex-row flex-wrap gap-2">
                {item.sequence.map((key, i) => (
                  <GameChip key={key} keys={[key]} lang={lang} badge={i + 1} state="correct" />
                ))}
              </View>
            ) : item.chips && item.type !== 'choice' ? (
              <UIText variant="body" className="text-slate-900 dark:text-slate-50 font-semibold">
                {chipLabel(item.chips.find((c) => c.answerIndex === item.correct)?.keys ?? [], lang)}
              </UIText>
            ) : null}
            <UIText variant="body" className="text-slate-800 dark:text-slate-100">
              {item.answers[item.correct - 1]}
            </UIText>
          </View>
        )}
        <Button onPress={handleNext} variant="default" className="w-full mt-1" testID="game.next">
          {lives <= 0 || index >= round.length - 1 ? t('game.roundOver', lang) : t('game.next', lang)}
        </Button>
      </View>
    );
  };

  const renderResult = () => (
    <Card className="gap-4 items-center" testID="game.result">
      <UIText variant="caption" className="uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
        {t('game.roundOver', lang)}
      </UIText>
      {isNewBest && (
        <UIText variant="subtitle" className="text-amber-600 dark:text-amber-300" testID="game.newBest">
          {t('game.newBest', lang)}
        </UIText>
      )}
      <UIText variant="title" className="text-slate-900 dark:text-slate-50" testID="game.finalScore">
        {score}
      </UIText>
      <UIText variant="body" className="text-slate-600 dark:text-slate-300">
        {tf('game.result', lang, { correct: correctCount, total: playedCount })}
      </UIText>
      <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
        {t('game.best', lang)}: {best}
      </UIText>
      <Button onPress={startRound} variant="default" className="w-full" testID="game.playAgain">
        {t('game.playAgain', lang)}
      </Button>
      <Button onPress={() => router.replace('/home')} variant="outline" className="w-full" testID="game.backHome">
        {t('game.backHome', lang)}
      </Button>
    </Card>
  );

  const imageSource = item ? IMAGE_MANIFEST[item.image as keyof typeof IMAGE_MANIFEST] : undefined;

  return (
    <Screen testID="screen.game" header={<Header title={t('game.title', lang)} onBackPress={handleBack} />}>
      <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="gap-4 mt-1 pb-6" showsVerticalScrollIndicator={false}>
        {phase === 'intro' && renderIntro()}
        {phase === 'result' && renderResult()}
        {(phase === 'playing' || phase === 'feedback') && item && (
          <>
            {renderStatus()}
            <Card className="gap-3">
              {imageSource ? (
                <AspectImage source={imageSource} maxHeight={280} accessibilityLabel={item.text} />
              ) : null}
              <UIText variant="body" className="text-slate-900 dark:text-slate-50 font-medium">
                {item.text}
              </UIText>
              {phase === 'playing' ? renderChips() : renderFeedback()}
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
