import { IntersectionScene, type VehiclePose } from '@/components/game/IntersectionScene';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import * as GameRoundsDB from '@/src/db/queries/gameRounds';
import { t, tf } from '@/src/i18n/i18n';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { confirmDialog } from '@/src/lib/dialog';
import { generatePlayable, makeRng } from '@/src/lib/priority/generator';
import {
  buildTimeline,
  durationOf,
  judgeGo,
  poseAt,
  scoreCrossing,
  startsAfterGo,
} from '@/src/lib/priority/timeline';
import { getCachedLanguage, getLanguage } from '@/src/lib/settings';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, ScrollView, View, useWindowDimensions } from 'react-native';

type Phase = 'intro' | 'playing' | 'feedback' | 'over';
type Outcome = 'ok' | 'crash' | 'late';

const LIVES = 3;
const LEVEL_EVERY = 3;
const CRASH_DELAY_MS = 420;

interface Feedback {
  outcome: Outcome;
  points: number;
  culprit?: string | null;
  explanation: string;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const haptic = (ok: boolean) => {
  Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
};

/**
 * "Crossings": the player drives the car on the bottom arm. Every other
 * vehicle follows the priority engine. Swipe up (or tap GO) when it is your
 * turn: too early is a crash, too late holds up the traffic behind you.
 */
export default function CrossingScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const { width } = useWindowDimensions();
  const size = Math.min(width - 40, 420);
  const [lang, setLang] = useState(getCachedLanguage);
  const [phase, setPhase] = useState<Phase>('intro');
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(LIVES);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [crossed, setCrossed] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [scene, setScene] = useState<any>(null);
  const [poses, setPoses] = useState<Record<string, VehiclePose>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);

  const rngRef = useRef(makeRng(Date.now() % 100000));
  const timelineRef = useRef<any>(null);
  const startsRef = useRef<Record<string, number | null>>({});
  const startedAtRef = useRef(0);
  const wentRef = useRef<{ goAt: number; verdict: string; culprit?: string | null } | null>(null);
  const pathCacheRef = useRef<Record<string, any>>({});
  const frameRef = useRef<number | null>(null);
  const settledRef = useRef(false);
  const levelRef = useRef(1);
  const streakRef = useRef(0);
  const livesRef = useRef(LIVES);
  const scoreRef = useRef(0);
  const crossedRef = useRef(0);
  const attemptsRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Crossing');
      getLanguage().then(async (l) => {
        setLang(l);
        const stats = await GameRoundsDB.getGameStats(l, 'crossing');
        setBest(stats.best);
      });
    }, [posthog])
  );

  const stopLoop = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const nextScene = useCallback(() => {
    const lvl = levelRef.current;
    const generated = generatePlayable(rngRef.current, lvl);
    const timeline = buildTimeline(generated, generated.resolution, lvl);
    timelineRef.current = timeline;
    startsRef.current = { ...timeline.starts };
    pathCacheRef.current = {};
    wentRef.current = null;
    settledRef.current = false;
    startedAtRef.current = now();
    setScene(generated);
    setHidden([]);
    setFeedback(null);
    setPhase('playing');
  }, []);

  const finishRun = useCallback(async () => {
    stopLoop();
    const finalScore = scoreRef.current;
    const newBest = finalScore > best;
    setIsNewBest(newBest);
    setPhase('over');
    try {
      await GameRoundsDB.addGameRound({
        lang,
        mode: 'crossing',
        score: finalScore,
        correctCount: crossedRef.current,
        total: attemptsRef.current,
      });
    } catch {
      /* keep playing even if the score row fails */
    }
    trackEvent(posthog, 'crossing_finished', {
      language: lang,
      score: finalScore,
      level: levelRef.current,
      crossed: crossedRef.current,
      attempts: attemptsRef.current,
      new_best: newBest,
    });
    const stats = await GameRoundsDB.getGameStats(lang, 'crossing');
    setBest(stats.best);
  }, [best, lang, posthog]);

  const settle = useCallback(
    (outcome: Outcome, goAt: number, culprit: string | null = null) => {
      if (settledRef.current) return;
      settledRef.current = true;
      stopLoop();
      const timeline = timelineRef.current;
      const current = scene;
      attemptsRef.current += 1;
      setAttempts(attemptsRef.current);
      let points = 0;
      let explanation = '';
      if (outcome === 'ok') {
        points = scoreCrossing({ level: levelRef.current, goAt, clearAt: timeline.clearAt, deadline: timeline.deadline, streak: streakRef.current });
        scoreRef.current += points;
        streakRef.current += 1;
        crossedRef.current += 1;
        if (crossedRef.current % LEVEL_EVERY === 0) levelRef.current += 1;
        explanation = t('crossing.goodBody', lang);
      } else {
        streakRef.current = 0;
        livesRef.current -= 1;
        if (outcome === 'late') explanation = t('crossing.lateBody', lang);
        else {
          const reason = current?.resolution?.reasons?.find((r: any) => r.who === 'you' && r.to === culprit);
          const vehicle = current?.vehicles?.find((v: any) => v.id === culprit);
          const name = vehicle ? t(`crossing.vehicle.${vehicle.color}`, lang) : '';
          explanation = reason ? tf(`rule.${reason.rule}`, lang, { vehicle: name }) : '';
        }
      }
      setScore(scoreRef.current);
      setStreak(streakRef.current);
      setLives(livesRef.current);
      setLevel(levelRef.current);
      setCrossed(crossedRef.current);
      setFeedback({ outcome, points, culprit, explanation });
      setPhase('feedback');
      haptic(outcome === 'ok');
      trackEvent(posthog, 'crossing_attempt', {
        language: lang,
        level: levelRef.current,
        outcome,
        points,
        layout: current?.layout,
        vehicles: current?.vehicles?.length,
        go_at: Math.round(goAt),
        clear_at: Math.round(timeline.clearAt),
      });
      if (outcome === 'ok') {
        setTimeout(() => nextScene(), 900);
      }
    },
    [lang, nextScene, posthog, scene]
  );

  // Animation loop: vehicles follow their start times; the player's fate is
  // decided by the engine's timeline.
  useEffect(() => {
    if (phase !== 'playing' || !scene) return;
    const timeline = timelineRef.current;
    const youVehicle = scene.vehicles.find((v: any) => v.id === 'you');
    let lastTick = now();
    const tick = () => {
      // A long gap between frames means the tab or app was in the background:
      // shift the whole timeline so the pause does not count as hesitation.
      const t = now();
      const gap = t - lastTick;
      lastTick = t;
      if (gap > 400) {
        const shift = gap - 16;
        startedAtRef.current += shift;
        for (const id of Object.keys(startsRef.current)) {
          const start = startsRef.current[id];
          if (start !== null) startsRef.current[id] = start + shift;
        }
      }
      const elapsed = t - startedAtRef.current;
      const nextPoses: Record<string, VehiclePose> = {};
      const gone: string[] = [];
      for (const v of scene.vehicles) {
        const pose = poseAt(scene, v, startsRef.current[v.id], elapsed, pathCacheRef.current);
        if (pose) nextPoses[v.id] = pose;
        else gone.push(v.id);
      }
      setPoses(nextPoses);
      setHidden(gone);
      const went = wentRef.current;
      if (!went) {
        if (elapsed > timeline.deadline) {
          settle('late', elapsed);
          return;
        }
      } else if (went.verdict === 'early') {
        if (elapsed >= went.goAt + CRASH_DELAY_MS) {
          settle('crash', went.goAt, went.culprit ?? null);
          return;
        }
      } else if (went.verdict === 'ok') {
        if (elapsed >= went.goAt + durationOf(youVehicle) + 150) {
          settle('ok', went.goAt);
          return;
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [phase, scene, settle]);

  const handleGo = useCallback(() => {
    if (phase !== 'playing' || wentRef.current || !scene) return;
    const goAt = now() - startedAtRef.current;
    const judgement = judgeGo(timelineRef.current, scene, goAt);
    if (judgement.verdict === 'late') {
      settle('late', goAt);
      return;
    }
    wentRef.current = { goAt, verdict: judgement.verdict, culprit: judgement.culprit ?? null };
    startsRef.current = startsAfterGo(scene, scene.resolution, timelineRef.current, goAt);
    if (judgement.verdict === 'early') {
      // Only the player moves into the crash; nothing else starts.
      startsRef.current = { ...timelineRef.current.starts, you: goAt };
    }
  }, [phase, scene, settle]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_e, g) => {
          if (g.dy < -30) handleGo();
        },
      }),
    [handleGo]
  );

  const startRun = () => {
    levelRef.current = 1;
    streakRef.current = 0;
    livesRef.current = LIVES;
    scoreRef.current = 0;
    crossedRef.current = 0;
    attemptsRef.current = 0;
    setLevel(1);
    setStreak(0);
    setLives(LIVES);
    setScore(0);
    setCrossed(0);
    setAttempts(0);
    setIsNewBest(false);
    rngRef.current = makeRng(Date.now() % 100000);
    trackEvent(posthog, 'crossing_started', { language: lang });
    nextScene();
  };

  const handleContinue = () => {
    if (livesRef.current <= 0) {
      finishRun();
      return;
    }
    nextScene();
  };

  const handleBack = async () => {
    if (phase === 'playing' || phase === 'feedback') {
      const confirmed = await confirmDialog({
        title: t('game.quit', lang),
        message: t('game.quitMessage', lang),
        confirmText: t('game.quit', lang),
        cancelText: t('common.cancel', lang),
        destructive: true,
      });
      if (!confirmed) return;
      stopLoop();
      setPhase('intro');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/game');
  };

  useEffect(() => stopLoop, []);

  const hearts = Array.from({ length: LIVES }, (_, i) => (i < lives ? '♥' : '♡')).join(' ');
  const highlight = feedback?.outcome === 'crash' && feedback.culprit ? [feedback.culprit, 'you'] : [];

  const renderIntro = () => (
    <Card className="gap-4" testID="crossing.intro">
      <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
        🚦 {t('crossing.title', lang)}
      </UIText>
      <UIText variant="body" className="text-slate-600 dark:text-slate-300">
        {t('crossing.hubBody', lang)}
      </UIText>
      <UIText variant="body" className="text-slate-600 dark:text-slate-300">
        {t('crossing.swipeHint', lang)}
      </UIText>
      <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
        {t('game.best', lang)}: {best}
      </UIText>
      <Button onPress={startRun} variant="default" className="w-full" testID="crossing.start">
        {t('game.start', lang)}
      </Button>
    </Card>
  );

  const renderOver = () => (
    <Card className="gap-4 items-center" testID="crossing.over">
      <UIText variant="caption" className="uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
        {t('crossing.gameOver', lang)}
      </UIText>
      {isNewBest && (
        <UIText variant="subtitle" className="text-amber-600 dark:text-amber-300">
          {t('game.newBest', lang)}
        </UIText>
      )}
      <UIText variant="title" className="text-slate-900 dark:text-slate-50" testID="crossing.finalScore">
        {score}
      </UIText>
      <UIText variant="body" className="text-slate-600 dark:text-slate-300">
        {tf('crossing.reached', lang, { n: level })} · {tf('game.result', lang, { correct: crossed, total: attempts })}
      </UIText>
      <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
        {t('game.best', lang)}: {best}
      </UIText>
      <Button onPress={startRun} variant="default" className="w-full" testID="crossing.playAgain">
        {t('game.playAgain', lang)}
      </Button>
      <Button onPress={() => (router.canGoBack() ? router.back() : router.replace('/game'))} variant="outline" className="w-full">
        {t('game.backHome', lang)}
      </Button>
    </Card>
  );

  const renderStatus = () => (
    <View className="flex-row items-center justify-between">
      <UIText variant="body" className="font-semibold text-rose-600 dark:text-rose-300" accessibilityLabel={`${t('game.lives', lang)} ${lives}`}>
        {hearts}
      </UIText>
      <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
        {tf('crossing.level', lang, { n: level })}
      </UIText>
      <View className="flex-row items-center gap-3">
        {streak > 1 && (
          <UIText variant="caption" className="font-semibold text-amber-600 dark:text-amber-300">
            🔥 {streak}
          </UIText>
        )}
        <UIText variant="subtitle" className="text-indigo-700 dark:text-indigo-200" testID="crossing.score">
          {score}
        </UIText>
      </View>
    </View>
  );

  const renderFeedback = () => {
    if (!feedback) return null;
    const ok = feedback.outcome === 'ok';
    const title = ok ? t('game.correct', lang) : feedback.outcome === 'crash' ? t('crossing.crash', lang) : t('crossing.late', lang);
    return (
      <View
        className={`rounded-2xl px-4 py-3 gap-2 ${ok ? 'bg-emerald-500/15 dark:bg-emerald-500/20' : 'bg-rose-500/15 dark:bg-rose-500/20'}`}
        testID={`crossing.feedback.${feedback.outcome}`}
      >
        <View className="flex-row items-center justify-between">
          <UIText variant="subtitle" className={ok ? 'text-emerald-700 dark:text-emerald-200' : 'text-rose-700 dark:text-rose-200'}>
            {title}
          </UIText>
          {ok && (
            <UIText variant="subtitle" className="text-emerald-700 dark:text-emerald-200">
              {tf('game.plusPoints', lang, { points: feedback.points })}
            </UIText>
          )}
        </View>
        {feedback.explanation ? (
          <UIText variant="body" className="text-slate-800 dark:text-slate-100">
            {feedback.explanation}
          </UIText>
        ) : null}
        {!ok && (
          <Button onPress={handleContinue} variant="default" className="w-full mt-1" testID="crossing.continue">
            {livesRef.current <= 0 ? t('crossing.gameOver', lang) : t('crossing.continue', lang)}
          </Button>
        )}
      </View>
    );
  };

  return (
    <Screen testID="screen.crossing" header={<Header title={t('crossing.title', lang)} onBackPress={handleBack} />}>
      <ScrollView className="flex-1" contentContainerClassName="gap-3 mt-1 pb-6 items-stretch" showsVerticalScrollIndicator={false} scrollEnabled={phase !== 'playing'}>
        {phase === 'intro' && renderIntro()}
        {phase === 'over' && renderOver()}
        {(phase === 'playing' || phase === 'feedback') && scene && (
          <>
            {renderStatus()}
            <View {...panResponder.panHandlers} style={{ alignSelf: 'center', width: size, height: size, borderRadius: 18, overflow: 'hidden' }} testID="crossing.scene">
              <IntersectionScene scene={scene} size={size} poses={poses} hidden={hidden} highlight={highlight} />
            </View>
            {phase === 'playing' ? (
              <>
                <UIText variant="caption" className="text-center text-slate-500 dark:text-slate-400">
                  {t('crossing.swipeHint', lang)}
                </UIText>
                <Button onPress={handleGo} variant="default" className="w-full min-h-[64px]" textStyle={{ fontSize: 22, letterSpacing: 2 }} testID="crossing.go">
                  {t('crossing.go', lang)}
                </Button>
              </>
            ) : (
              renderFeedback()
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
