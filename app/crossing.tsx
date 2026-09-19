import { vehicleName } from '@/src/lib/priority/vehicleName';
import { DriveStage } from '@/components/game/DriveStage';
import { IntersectionScene } from '@/components/game/IntersectionScene';
import { RecordModal, outcomeClass, outcomeTextClass } from '@/components/game/RecordModal';
import { WorldScene, type WorldVehicle } from '@/components/game/WorldScene';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import * as CrossingLogDB from '@/src/db/queries/crossingLog';
import * as GameRoundsDB from '@/src/db/queries/gameRounds';
import { generateId } from '@/src/db/utils';
import { t, tf } from '@/src/i18n/i18n';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { explainRecord } from '@/src/lib/crossingLog';
import { confirmDialog } from '@/src/lib/dialog';
import { makeRng } from '@/src/lib/priority/generator';
import {
  LIVES,
  applyInput,
  createRun,
  currentJunction,
  lightState,
  shiftTime,
  step,
  vehiclePoses,
  visibleJunctions,
  youPose,
  youSignalFor,
} from '@/src/lib/priority/world';
import { getCachedLanguage, getLanguage } from '@/src/lib/settings';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PanResponder, Pressable, ScrollView, View } from 'react-native';

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
 * give way when you must, swipe up to move off again once it is clear. The
 * car never moves off on its own.
 */
export default function CrossingScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  // Development aid: driver://crossing?seed=1&level=2 replays a known road.
  const params = useLocalSearchParams<{ seed?: string; level?: string }>();
  const [lang, setLang] = useState(getCachedLanguage);
  const [phase, setPhase] = useState<Phase>('intro');
  const [paused, setPaused] = useState(false);
  const [motion, setMotion] = useState<'driving' | 'braking' | 'waiting'>('driving');
  const [best, setBest] = useState(0);
  const [hud, setHud] = useState({ level: 1, lives: LIVES, score: 0, streak: 0, passed: 0 });
  const [frame, setFrame] = useState<{ junctions: any[]; vehicles: WorldVehicle[]; you: any; heading: number; youVehicle: any; blink: boolean; shake: number; lights: Record<number, any>; youSignal: 'left' | 'right' | null; youBraking: boolean } | null>(null);
  const [openRecord, setOpenRecord] = useState<any | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [instruction, setInstruction] = useState<Instruction | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [roundsPlayed, setRoundsPlayed] = useState<number | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const runRef = useRef<any>(null);
  const runIdRef = useRef('');
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
      await CrossingLogDB.purgeCrossingLog(lang);
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
      const name = vehicle ? vehicleName(vehicle, lang) : '';
      return rule ? tf(`rule.${rule}`, lang, { vehicle: name }) : t('crossing.crash', lang);
    },
    [lang]
  );

  // Every junction ends up in the drive log, whatever happened at it.
  const logRecord = useCallback(
    (record: any) => {
      setRecords((prev) => [...prev, record]);
      CrossingLogDB.addCrossingLog({ lang, runId: runIdRef.current, outcome: record.outcome, points: record.points, record }).catch(() => {});
    },
    [lang]
  );

  // Main loop.
  useEffect(() => {
    if (phase !== 'running' || paused) return;
    if (lastTickRef.current) shiftTime(runRef.current, Math.max(0, now() - lastTickRef.current));
    const tick = () => {
      const run = runRef.current;
      const tNow = now();
      const gap = tNow - lastTickRef.current;
      if (gap > 400) shiftTime(run, gap - 16);
      lastTickRef.current = tNow;

      const events = step(run, tNow);
      // The crash glow lasts for the pause only.
      if (highlightRef.current.length && tNow >= run.crashUntil && !events.some((e: any) => e.type === 'crash')) highlightRef.current = [];
      for (const e of events) {
        if (e.type === 'crash') {
          const junction = run.junctions.find((j: any) => j.index === e.junction);
          highlightRef.current = e.culprit ? [`${e.junction}-${e.culprit}`, 'you'] : ['you'];
          shakeUntilRef.current = tNow + 600;
          haptic.crash();
          setToast({ kind: 'crash', text: explain(run, junction, e.culprit, e.rule), until: tNow + TOAST_MS + 600 });
          if (e.record) logRecord(e.record);
          trackEvent(posthog, 'crossing_crash', { language: lang, level: run.level, rule: e.rule });
        } else if (e.type === 'hesitated') {
          setToast({ kind: 'late', text: t('crossing.hesitated', lang), until: tNow + TOAST_MS });
          haptic.honk();
        } else if (e.type === 'late') {
          setToast({ kind: 'late', text: t('crossing.late', lang), until: tNow + TOAST_MS });
          haptic.honk();
        } else if (e.type === 'redLight') {
          setToast({ kind: 'wrong', text: t('crossing.redLight', lang), until: tNow + TOAST_MS + 400 });
          haptic.honk();
        } else if (e.type === 'ranStop') {
          setToast({ kind: 'wrong', text: t('crossing.ranStop', lang), until: tNow + TOAST_MS + 400 });
          haptic.honk();

        } else if (e.type === 'passed') {
          highlightRef.current = [];
          setInstruction(null);
          if (!e.hesitated && !e.wrongWay && !e.late && !e.ranRed && !e.ranStop) {
            setToast({ kind: 'ok', text: tf('game.plusPoints', lang, { points: e.points }), until: tNow + 900 });
            haptic.passed();
          }
          if (e.record) logRecord(e.record);
        } else if (e.type === 'level') {
          setToast({ kind: 'level', text: tf('crossing.levelUp', lang, { n: e.level }), until: tNow + TOAST_MS });
          haptic.level();
        } else if (e.type === 'stopped') {
          haptic.stopped();
        } else if (e.type === 'resumed') {
          haptic.resumed();
        } else if (e.type === 'instruction') {
          setInstruction(e.kind === 'none' ? null : { kind: e.kind, turn: e.turn, to: e.to, junction: e.junction });
          setIntent(null);
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
      setMotion(run.stoppedAt !== null ? 'waiting' : run.braking ? 'braking' : 'driving');
      setHud({ level: run.level, lives: run.lives, score: run.score, streak: run.streak, passed: run.passed });

      const you = youPose(run);
      // Turn the camera with the car, shortest way round.
      let diff = ((you.angle - headingRef.current + 540) % 360) - 180;
      headingRef.current = (headingRef.current + diff * (1 - Math.exp(-Math.min(gap, 100) / 140)) + 360) % 360;
      const junction = currentJunction(run);
      const youVehicle = junction.scene.vehicles.find((v: any) => v.id === 'you');
      const youSignal = youSignalFor(run) as 'left' | 'right' | null;
      const shaking = tNow < shakeUntilRef.current ? Math.sin(tNow / 18) * 1.6 : 0;
      const visible = visibleJunctions(run);
      const lights: Record<number, any> = {};
      for (const j of visible) if (j.scene.control?.type === 'lights') lights[j.index] = lightState(j, tNow);
      setFrame({
        junctions: visible,
        vehicles: vehiclePoses(run),
        you,
        heading: headingRef.current,
        youVehicle: { ...youVehicle, from: 'S' },
        blink: Math.floor(tNow / 350) % 2 === 0,
        shake: shaking,
        lights,
        youSignal,
        youBraking: Boolean(run.brakeLights || run.stoppedAt !== null),
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
  }, [explain, finishRun, lang, logRecord, phase, paused, posthog]);

  useEffect(() => stopLoop, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setPaused(true);
    });
    return () => subscription.remove();
  }, []);

  const startRun = () => {
    const seed = __DEV__ && params.seed ? Number(params.seed) : Date.now() % 1000003;
    const level = __DEV__ && params.level ? Math.max(1, Number(params.level)) : 1;
    runRef.current = createRun(makeRng(seed), level);
    if (__DEV__) console.log(`[crossing] run seed=${seed} level=${level}`);
    runRef.current.now = now();
    runIdRef.current = generateId();
    setPaused(false);
    lastTickRef.current = 0;
    setRecords([]);
    setInstruction(null);
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
    if (phase === 'running' && !paused && runRef.current) applyInput(runRef.current, 'brake');
  }, [phase, paused]);
  const go = useCallback(() => {
    if (phase === 'running' && !paused && runRef.current) applyInput(runRef.current, 'go');
  }, [phase, paused]);
  const turn = useCallback(
    (dir: 'left' | 'right') => {
      if (phase === 'running' && !paused && runRef.current) applyInput(runRef.current, dir);
    },
    [phase, paused]
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
      setPaused(true);
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
    <ScrollView className="flex-1" contentContainerClassName="pb-4" showsVerticalScrollIndicator={false}>
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
          <UIText variant="body" className="text-slate-800 dark:text-slate-100">🔄  {t('crossing.legendRing', lang)}</UIText>
          <UIText variant="caption" className="text-slate-500 dark:text-slate-400">{t('crossing.legendRules', lang)}</UIText>
        </View>
        <Button onPress={() => router.push('/crossing-guide')} variant="outline" className="w-full" testID="crossing.openGuide">
          {t('guide.replay', lang)}
        </Button>
        <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
          {t('game.best', lang)}: {best}
        </UIText>
        <Button onPress={startRun} variant="default" className="w-full" testID="crossing.start">
          {t('game.start', lang)}
        </Button>
        {roundsPlayed !== null && roundsPlayed > 0 && (
          <Button onPress={() => router.push('/crossing-log')} variant="outline" className="w-full" testID="crossing.log.open">
            {t('crossing.log.open', lang)}
          </Button>
        )}
      </Card>
    </ScrollView>
  );

  const renderRecordRow = (record: any, i: number) => {
    const info = explainRecord(record, lang);
    return (
      <Pressable key={`${record.index}-${i}`} onPress={() => setOpenRecord(record)} className="flex-row items-center gap-3 py-2 border-t border-slate-200/70 dark:border-slate-800/70" testID={`crossing.record.${i}`} accessibilityRole="button">
        <View className="rounded-xl overflow-hidden">
          <IntersectionScene scene={record.scene} size={72} showPaths />
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <View className={`rounded-full px-2 py-0.5 ${outcomeClass[info.outcome]}`}>
              <UIText variant="caption" className={`font-semibold ${outcomeTextClass[info.outcome]}`}>
                {info.outcomeLabel}
              </UIText>
            </View>
            {info.points > 0 && (
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                +{info.points}
              </UIText>
            )}
          </View>
          <UIText variant="caption" className="text-slate-700 dark:text-slate-200">
            {info.headline}
          </UIText>
        </View>
      </Pressable>
    );
  };

  const renderOver = () => (
    <ScrollView className="flex-1" contentContainerClassName="pb-4" showsVerticalScrollIndicator={false}>
      <Card className="gap-4" testID="crossing.over">
        <View className="items-center gap-1">
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
        </View>
        {records.length > 0 && (
          <View>
            <UIText variant="caption" className="uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 mb-1">
              {t('crossing.log.thisRun', lang)}
            </UIText>
            {records.map(renderRecordRow)}
          </View>
        )}
        <Button onPress={startRun} variant="default" className="w-full" testID="crossing.playAgain">
          {t('game.playAgain', lang)}
        </Button>
        <Button onPress={() => router.push('/crossing-log')} variant="outline" className="w-full" testID="crossing.log.open">
          {t('crossing.log.open', lang)}
        </Button>
        <Button onPress={() => (router.canGoBack() ? router.back() : router.replace('/game'))} variant="outline" className="w-full">
          {t('game.backHome', lang)}
        </Button>
      </Card>
    </ScrollView>
  );

  if (phase === 'running') return (
    <DriveStage lang={lang}
      detail={`${tf('crossing.level', lang, { n: hud.level })}  ·  ${t('game.score', lang)}: ${hud.score}  ·  ${hearts}`}
      instruction={instruction ? instructionText(instruction, lang) : t('crossing.runnerHint', lang)} direction={instruction?.turn}
      status={paused ? t('crossing.control.paused', lang) : toastVisible ? toast.text : t(`crossing.control.${motion}`, lang)}
      paused={paused} onPause={() => setPaused(value => !value)} onBack={handleBack}
      intent={intent} braking={motion !== 'driving'} onInput={input => {
        if (input === 'brake') brake(); else if (input === 'go') go(); else turn(input);
      }} testID="screen.crossing">
      {(width, height) => frame && (
        <View {...panResponder.panHandlers} style={{ width, height }} testID="crossing.scene">
          <WorldScene width={width} height={height} junctions={frame.junctions} vehicles={frame.vehicles}
            you={frame.you} youVehicle={frame.youVehicle} heading={frame.heading} highlight={highlightRef.current}
            blinkOn={frame.blink} shake={frame.shake} lights={frame.lights} youSignal={frame.youSignal} youBraking={frame.youBraking} />
        </View>
      )}
    </DriveStage>
  );
  return (
    <Screen testID="screen.crossing" header={<Header title={t('crossing.title', lang)} onBackPress={handleBack} />}>
      <View className="flex-1 gap-3">
        {phase === 'intro' && renderIntro()}
        {phase === 'over' && renderOver()}
        {openRecord && <RecordModal record={openRecord} lang={lang} onClose={() => setOpenRecord(null)} />}
      </View>
    </Screen>
  );
}
