import { WorldScene, type WorldVehicle } from '@/components/game/WorldScene';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import * as GameRoundsDB from '@/src/db/queries/gameRounds';
import { t, tf } from '@/src/i18n/i18n';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { confirmDialog } from '@/src/lib/dialog';
import { makeRng } from '@/src/lib/priority/generator';
import {
  COACH_JUNCTIONS,
  LIVES,
  applyInput,
  createRun,
  currentJunction,
  shiftTime,
  step,
  vehiclePoses,
  visibleJunctions,
  youPose,
} from '@/src/lib/priority/world';
import { getCachedLanguage, getLanguage } from '@/src/lib/settings';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View, useWindowDimensions } from 'react-native';

type Phase = 'intro' | 'running' | 'over';

interface Toast {
  kind: 'crash' | 'late' | 'ok' | 'level' | 'wrong';
  text: string;
  until: number;
}

interface Instruction {
  kind: string;
  turn: string;
  to: string;
  junction: number;
}

const instructionText = (i: { kind: string; turn: string }, lang: number) =>
  i.kind === 'roundabout' ? t(`crossing.instr.roundabout.${i.turn}`, lang) : t(`crossing.instr.${i.kind}`, lang);

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const TOAST_MS = 1500;

// Physical moments of the drive, each with its own pattern. Crashes get a
// double heavy thud so they are unmistakable even with the phone in a hand.
const haptic = {
  crash: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}), 120);
  },
  honk: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  passed: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  stopped: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  resumed: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  level: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
};

/**
 * Crossings, endless mode. You drive; the road scrolls; every junction is
 * generated and every other car obeys the priority engine. Swipe down to
 * give way when you must, swipe up to move off again as soon as it is clear.
 */
export default function CrossingScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const { width } = useWindowDimensions();
  const sceneW = Math.min(width - 40, 420);
  const sceneH = Math.round(sceneW * 1.25);
  const [lang, setLang] = useState(getCachedLanguage);
  const [phase, setPhase] = useState<Phase>('intro');
  const [best, setBest] = useState(0);
  const [hud, setHud] = useState({ level: 1, lives: LIVES, score: 0, streak: 0, passed: 0 });
  const [frame, setFrame] = useState<{ junctions: any[]; vehicles: WorldVehicle[]; you: any; heading: number; youVehicle: any; blink: boolean; shake: number } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [instruction, setInstruction] = useState<Instruction | null>(null);
  const [coachHint, setCoachHint] = useState<string | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [roundsPlayed, setRoundsPlayed] = useState<number | null>(null);

  const runRef = useRef<any>(null);
  const frameRef = useRef<number | null>(null);
  const headingRef = useRef(0);
  const lastTickRef = useRef(0);
  const shakeUntilRef = useRef(0);
  const highlightRef = useRef<string[]>([]);
  const finishedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Crossing');
      getLanguage().then(async (l) => {
        setLang(l);
        const stats = await GameRoundsDB.getGameStats(l, 'crossing');
        setBest(stats.best);
        setRoundsPlayed(stats.rounds);
      });
    }, [posthog])
  );

  const stopLoop = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const finishRun = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    stopLoop();
    const run = runRef.current;
    const newBest = run.score > best;
    setIsNewBest(newBest);
    setPhase('over');
    try {
      await GameRoundsDB.addGameRound({ lang, mode: 'crossing', score: run.score, correctCount: run.passed, total: run.passed + (LIVES - run.lives) });
    } catch {
      /* the run is still over */
    }
    trackEvent(posthog, 'crossing_finished', { language: lang, score: run.score, level: run.level, passed: run.passed, new_best: newBest });
    const stats = await GameRoundsDB.getGameStats(lang, 'crossing');
    setBest(stats.best);
  }, [best, lang, posthog]);

  const explain = useCallback(
    (run: any, junction: any, culprit: string | null, rule: string | null) => {
      const vehicle = junction?.scene?.vehicles?.find((v: any) => v.id === culprit);
      const name = vehicle ? t(`crossing.vehicle.${vehicle.color}`, lang) : '';
      return rule ? tf(`rule.${rule}`, lang, { vehicle: name }) : t('crossing.crash', lang);
    },
    [lang]
  );

  // Main loop.
  useEffect(() => {
    if (phase !== 'running') return;
    const tick = () => {
      const run = runRef.current;
      const tNow = now();
      const gap = tNow - lastTickRef.current;
      if (gap > 400) shiftTime(run, gap - 16);
      lastTickRef.current = tNow;

      const events = step(run, tNow);
      // The crash glow lasts for the pause only.
      if (highlightRef.current.length && tNow >= run.crashUntil && !events.some((e) => e.type === 'crash')) highlightRef.current = [];
      for (const e of events) {
        if (e.type === 'crash') {
          const junction = run.junctions.find((j: any) => j.index === e.junction);
          highlightRef.current = e.culprit ? [`${e.junction}-${e.culprit}`, 'you'] : ['you'];
          shakeUntilRef.current = tNow + 600;
          haptic.crash();
          setToast({ kind: 'crash', text: explain(run, junction, e.culprit, e.rule), until: tNow + TOAST_MS + 600 });
          trackEvent(posthog, 'crossing_crash', { language: lang, level: run.level, rule: e.rule });
        } else if (e.type === 'hesitated') {
          setToast({ kind: 'late', text: t('crossing.hesitated', lang), until: tNow + TOAST_MS });
          haptic.honk();
        } else if (e.type === 'passed') {
          highlightRef.current = [];
          setInstruction(null);
          setCoachHint(null);
          if (!e.hesitated && !e.wrongWay) {
            setToast({ kind: 'ok', text: tf('game.plusPoints', lang, { points: e.points }), until: tNow + 900 });
            haptic.passed();
          }
        } else if (e.type === 'level') {
          setToast({ kind: 'level', text: tf('crossing.levelUp', lang, { n: e.level }), until: tNow + TOAST_MS });
          haptic.level();
        } else if (e.type === 'stopped') {
          haptic.stopped();
        } else if (e.type === 'resumed') {
          haptic.resumed();
        } else if (e.type === 'instruction') {
          setInstruction({ kind: e.kind, turn: e.turn, to: e.to, junction: e.junction });
          setIntent(null);
          if (run.coach && run.passed < COACH_JUNCTIONS) {
            const junction = run.junctions.find((j: any) => j.index === e.junction);
            const blocker = e.blockers?.[0];
            const vehicle = junction?.scene?.vehicles?.find((v: any) => v.id === blocker);
            if (e.turn !== 'straight') {
              setCoachHint(tf('crossing.coach.turn', lang, { dir: t(e.turn === 'left' ? 'crossing.coach.dirLeft' : 'crossing.coach.dirRight', lang) }));
            } else if (vehicle) {
              const name = t(`crossing.vehicle.${vehicle.color}`, lang);
              setCoachHint(tf('crossing.coach.giveWay', lang, { vehicle: name.charAt(0).toUpperCase() + name.slice(1) }));
            } else {
              setCoachHint(t('crossing.coach.priority', lang));
            }
          } else {
            setCoachHint(null);
          }
        } else if (e.type === 'intent') {
          setIntent(e.intent);
          haptic.resumed();
        } else if (e.type === 'needTurn') {
          setToast({ kind: 'late', text: t('crossing.needTurn', lang), until: tNow + TOAST_MS * 2 });
          haptic.honk();
        } else if (e.type === 'wrongWay') {
          setToast({ kind: 'wrong', text: tf('crossing.wrongWay', lang, { instruction: instructionText(e.instruction, lang) }), until: tNow + TOAST_MS + 400 });
          haptic.honk();
        }
      }
      setHud({ level: run.level, lives: run.lives, score: run.score, streak: run.streak, passed: run.passed });

      const you = youPose(run);
      // Turn the camera with the car, shortest way round.
      let diff = ((you.angle - headingRef.current + 540) % 360) - 180;
      headingRef.current = (headingRef.current + diff * 0.12 + 360) % 360;
      const junction = currentJunction(run);
      const youVehicle = junction.scene.vehicles.find((v: any) => v.id === 'you');
      const shaking = tNow < shakeUntilRef.current ? Math.sin(tNow / 18) * 1.6 : 0;
      setFrame({
        junctions: visibleJunctions(run),
        vehicles: vehiclePoses(run),
        you,
        heading: headingRef.current,
        youVehicle: { ...youVehicle, from: 'S' },
        blink: Math.floor(tNow / 350) % 2 === 0,
        shake: shaking,
      });
      if (run.over && tNow >= run.crashUntil) {
        finishRun();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    lastTickRef.current = now();
    frameRef.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [explain, finishRun, lang, phase, posthog]);

  useEffect(() => stopLoop, []);

  const startRun = () => {
    runRef.current = createRun(makeRng(Date.now() % 1000003), 1);
    runRef.current.now = now();
    runRef.current.coach = roundsPlayed === 0;
    setInstruction(null);
    setCoachHint(null);
    setIntent(null);
    headingRef.current = 0;
    finishedRef.current = false;
    highlightRef.current = [];
    setToast(null);
    setIsNewBest(false);
    setHud({ level: 1, lives: LIVES, score: 0, streak: 0, passed: 0 });
    trackEvent(posthog, 'crossing_started', { language: lang });
    setPhase('running');
  };

  const brake = useCallback(() => {
    if (phase === 'running' && runRef.current) applyInput(runRef.current, 'brake');
  }, [phase]);
  const go = useCallback(() => {
    if (phase === 'running' && runRef.current) applyInput(runRef.current, 'go');
  }, [phase]);
  const turn = useCallback(
    (dir: 'left' | 'right') => {
      if (phase === 'running' && runRef.current) applyInput(runRef.current, dir);
    },
    [phase]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10,
        onPanResponderRelease: (_e, g) => {
          const horizontal = Math.abs(g.dx) > Math.abs(g.dy);
          if (horizontal) {
            if (g.dx > 28) turn('right');
            else if (g.dx < -28) turn('left');
          } else if (g.dy > 28) brake();
          else if (g.dy < -28) go();
        },
      }),
    [brake, go, turn]
  );

  const handleBack = async () => {
    if (phase === 'running') {
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

  const hearts = Array.from({ length: LIVES }, (_, i) => (i < hud.lives ? '♥' : '♡')).join(' ');
  const toastVisible = toast && now() < toast.until;

  const renderIntro = () => (
    <Card className="gap-4" testID="crossing.intro">
      <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
        🚦 {t('crossing.title', lang)}
      </UIText>
      <UIText variant="body" className="text-slate-600 dark:text-slate-300">
        {t('crossing.hubBody', lang)}
      </UIText>
      <View className="rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 px-3 py-3 gap-2">
        <UIText variant="caption" className="uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          {t('crossing.legendTitle', lang)}
        </UIText>
        <UIText variant="body" className="text-slate-800 dark:text-slate-100">⬇️  {t('crossing.legendDown', lang)}</UIText>
        <UIText variant="body" className="text-slate-800 dark:text-slate-100">⬆️  {t('crossing.legendUp', lang)}</UIText>
        <UIText variant="body" className="text-slate-800 dark:text-slate-100">↔️  {t('crossing.legendSide', lang)}</UIText>
        <UIText variant="caption" className="text-slate-500 dark:text-slate-400">{t('crossing.legendRules', lang)}</UIText>
      </View>
      {roundsPlayed === 0 && (
        <UIText variant="caption" className="text-indigo-700 dark:text-indigo-200">
          {t('crossing.coach.intro', lang)}
        </UIText>
      )}
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
        {hud.score}
      </UIText>
      <UIText variant="body" className="text-slate-600 dark:text-slate-300">
        {tf('crossing.reached', lang, { n: hud.level })} · {tf('crossing.passedCount', lang, { n: hud.passed })}
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

  const toastStyle = toast?.kind === 'ok' ? 'bg-emerald-600/90' : toast?.kind === 'level' ? 'bg-indigo-600/90' : toast?.kind === 'wrong' ? 'bg-amber-600/95' : 'bg-rose-600/90';
  const turnArrow = intent === 'left' ? '⬅️' : intent === 'right' ? '➡️' : '⬆️';

  return (
    <Screen testID="screen.crossing" header={<Header title={t('crossing.title', lang)} onBackPress={handleBack} />}>
      <View className="flex-1 gap-3 mt-1">
        {phase === 'intro' && renderIntro()}
        {phase === 'over' && renderOver()}
        {phase === 'running' && frame && (
          <>
            <View className="flex-row items-center justify-between">
              <UIText variant="body" className="font-semibold text-rose-600 dark:text-rose-300" accessibilityLabel={`${t('game.lives', lang)} ${hud.lives}`}>
                {hearts}
              </UIText>
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                {tf('crossing.level', lang, { n: hud.level })}
              </UIText>
              <View className="flex-row items-center gap-3">
                {hud.streak > 1 && (
                  <UIText variant="caption" className="font-semibold text-amber-600 dark:text-amber-300">
                    🔥 {hud.streak}
                  </UIText>
                )}
                <UIText variant="subtitle" className="text-indigo-700 dark:text-indigo-200" testID="crossing.score">
                  {hud.score}
                </UIText>
              </View>
            </View>
            <View {...panResponder.panHandlers} style={{ alignSelf: 'center', width: sceneW, height: sceneH, borderRadius: 18, overflow: 'hidden' }} testID="crossing.scene">
              <WorldScene
                width={sceneW}
                height={sceneH}
                junctions={frame.junctions}
                vehicles={frame.vehicles}
                you={frame.you}
                youVehicle={frame.youVehicle}
                heading={frame.heading}
                highlight={highlightRef.current}
                blinkOn={frame.blink}
                shake={frame.shake}
              />
              {instruction && (
                <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, top: 12 }}>
                  <View className="rounded-2xl px-4 py-3 bg-slate-900/85 dark:bg-slate-950/85 flex-row items-center gap-3" testID="crossing.instruction">
                    <UIText variant="subtitle" className="text-white">🧑‍🏫</UIText>
                    <UIText variant="body" className="text-white font-semibold flex-1">
                      {instructionText(instruction, lang)}
                    </UIText>
                    <UIText variant="subtitle" className="text-white">{turnArrow}</UIText>
                  </View>
                </View>
              )}
              {toastVisible && (
                <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, top: instruction ? 72 : 12 }}>
                  <View className={`rounded-2xl px-4 py-3 ${toastStyle}`} testID={`crossing.toast.${toast.kind}`}>
                    <UIText variant="body" className="text-white font-semibold text-center">
                      {toast.text}
                    </UIText>
                  </View>
                </View>
              )}
              {coachHint && !toastVisible && (
                <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>
                  <View className="rounded-2xl px-4 py-3 bg-indigo-600/95" testID="crossing.coach">
                    <UIText variant="body" className="text-white font-semibold text-center">
                      {coachHint}
                    </UIText>
                  </View>
                </View>
              )}
            </View>
            <UIText variant="caption" className="text-center text-slate-500 dark:text-slate-400">
              {t('crossing.legendSide', lang)}
            </UIText>
          </>
        )}
      </View>
    </Screen>
  );
}
