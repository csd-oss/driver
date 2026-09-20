import { DriveStage } from '@/components/game/DriveStage';
import { WorldScene } from '@/components/game/WorldScene';
import type { SwipeDirection } from '@/components/game/SwipeHint';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import { t, tf } from '@/src/i18n/i18n';
import { LESSONS, LESSON_COUNT, lessonVerdict } from '@/src/lib/priority/lessons';
import { makeRng } from '@/src/lib/priority/generator';
import { nextSnapshotAt, SNAPSHOT_MS } from '@/src/lib/priority/render';
import { applyInput, createRun, currentJunction, lessonHint, lightState, shiftTime, step, vehiclePoses, visibleJunctions, youPose, youSignalFor } from '@/src/lib/priority/world';
import { cameraView, visibleInRoad } from '@/src/lib/priority/view';
import { vehicleName } from '@/src/lib/priority/vehicleName';
import { getCachedLanguage, getLanguage, setGuideFinished } from '@/src/lib/settings';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PanResponder, Platform, ScrollView, View } from 'react-native';

const now = () => performance.now();
const HINT_SWIPE: Record<string, SwipeDirection | null> = { giveWay: 'down', stopSign: 'down', redLight: 'down', wait: null, go: 'up', ring: 'right', rolling: null, priority: null };
const instructionText = (i: { kind: string; turn: string }, lang: number) =>
  i.kind === 'roundabout' ? t(`crossing.instr.roundabout.${i.turn}`, lang) : t(`crossing.instr.${i.kind}`, lang);

/** The prompt for the moment, as a sentence, plus the swipe to animate. */
const promptFor = (run: any, lang: number, lessonId: string, visibility: any): { text: string; swipe: SwipeDirection | null } | null => {
  const hint = lessonHint(run, visibility);
  const junction = currentJunction(run);
  if (hint?.step === 'controlsStop') return { text: t('guide.lesson.controls.goal', lang), swipe: 'down' };
  if (lessonId === 'controls' && !junction.stopped && !run.braking && (!hint || ['observe', 'priority', 'rolling'].includes(hint.step))) {
    return { text: t('guide.lesson.controls.goal', lang), swipe: 'down' };
  }
  if (!hint) return null;
  if (['observe', 'rolling'].includes(hint.step)) return null;
  if (run.braking && ['giveWay', 'stopSign', 'redLight'].includes(hint.step)) return null;
  if (lessonId === 'controls' && hint.step === 'priority') return null;
  const car = hint.vehicle ? junction.scene.vehicles.find((v: any) => v.id === hint.vehicle) : null;
  const vehicle = car ? vehicleName(car, lang) : '';
  const swipe = hint.step === 'turn' ? (hint.dir as SwipeDirection) : HINT_SWIPE[hint.step] ?? null;
  if (['giveWay', 'priority'].includes(hint.step)) return { text: t(`guide.lesson.${lessonId}.goal`, lang), swipe };
  if (hint.step === 'wait') return { text: tf('crossing.coach.waitSwipe', lang, { vehicle: vehicle || t('crossing.log.someone', lang) }), swipe };
  if (hint.step === 'go') return { text: t('crossing.coach.goSwipe', lang), swipe };
  if (hint.step === 'stopSign') return { text: t('crossing.coach.stopSign', lang), swipe };
  if (hint.step === 'redLight') return { text: t('guide.hint.redLight', lang), swipe };
  if (hint.step === 'ring') return { text: t('guide.hint.ring', lang), swipe };
  if (hint.step === 'turn') {
    return { text: tf('crossing.coach.turn', lang, { dir: t(hint.dir === 'left' ? 'crossing.coach.dirLeft' : 'crossing.coach.dirRight', lang) }), swipe };
  }
  return { text: t('crossing.coach.priority', lang), swipe };
};

export default function CrossingGuideScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(getCachedLanguage);
  const [phase, setPhase] = useState<'brief' | 'driving' | 'done'>('brief');
  const [paused, setPaused] = useState(false);
  const [frame, setFrame] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const runRef = useRef<any>(null);
  const sizeRef = useRef({ width: 393, height: 600, occludedTop: 114 });
  const headingRef = useRef(0);
  const tickRef = useRef(0);
  const feedbackRef = useRef<{ text: string; until: number } | null>(null);
  const loggedRef = useRef(new Set<number>());
  const reportedRef = useRef(new Set<string>());
  const learnedSwipesRef = useRef(new Set<SwipeDirection>());
  const seenRef = useRef({ junction: -1, road: false, vehicles: new Set<string>() });
  useEffect(() => { getLanguage().then(setLang); }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') setPaused(true); });
    return () => sub.remove();
  }, []);
  const start = () => {
    runRef.current = createRun(makeRng(1000), 1, { lesson: 0, continuousGuide: true } as any);
    runRef.current.now = now();
    tickRef.current = 0;
    headingRef.current = 0;
    feedbackRef.current = null;
    loggedRef.current.clear();
    reportedRef.current.clear();
    learnedSwipesRef.current.clear();
    seenRef.current = { junction: -1, road: false, vehicles: new Set() };
    setResults([]); setPaused(false); setPhase('driving');
  };
  useEffect(() => {
    if (phase !== 'driving' || paused) return;
    const run = runRef.current;
    if (tickRef.current) shiftTime(run, Math.max(0, now() - tickRef.current));
    tickRef.current = now();
    let snapshotAt = tickRef.current + SNAPSHOT_MS;
    let request = 0;
    const tick = () => {
      const time = now();
      const gap = time - tickRef.current;
      if (Platform.OS !== 'web') {
        const next = nextSnapshotAt(snapshotAt, time);
        if (next === snapshotAt) { request = requestAnimationFrame(tick); return; }
        snapshotAt = next;
      }
      if (gap > 400) shiftTime(run, gap - 16);
      tickRef.current = time;
      const events = step(run, time);
      for (const e of events) {
        if (e.type === 'wrongWay' || e.type === 'ranStop' || e.type === 'redLight') {
          const key = e.type === 'wrongWay' ? 'wrongWay' : e.type === 'ranStop' ? 'noStop' : 'red';
          reportedRef.current.add(`${e.junction}:${key}`);
          feedbackRef.current = { text: t(`guide.fail.${key}`, lang), until: time + 6000 };
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
        if ((e.type === 'passed' || e.type === 'crash') && !loggedRef.current.has(e.junction)) {
          const j = run.junctions.find((x: any) => x.index === e.junction);
          const lesson = LESSONS[j.lessonIndex];
          if (!lesson) continue;
          loggedRef.current.add(e.junction);
          const verdict = lessonVerdict(lesson, j);
          setResults(prev => [...prev, { lesson: lesson.id, ...verdict }]);
          const failure = `${e.junction}:${verdict.reason}`;
          if (!verdict.passed && !reportedRef.current.has(failure)) {
            reportedRef.current.add(failure);
            feedbackRef.current = { text: t(`guide.fail.${verdict.reason}`, lang), until: time + 6000 };
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          }
        }
      }
      const current = currentJunction(run);
      const last = run.junctions.find((j: any) => j.lessonIndex === LESSON_COUNT - 1);
      if (last && (last.passed || last.crashed) && run.s > last.sEnd) {
        setGuideFinished(true).catch(() => {});
        setPhase('done');
        return;
      }
      const you = youPose(run);
      const diff = ((you.angle - headingRef.current + 540) % 360) - 180;
      headingRef.current = (headingRef.current + diff * (1 - Math.exp(-Math.min(gap, 100) / 140)) + 360) % 360;
      const visible = visibleJunctions(run);
      const vehicles = vehiclePoses(run);
      const view = cameraView(sizeRef.current.width, sizeRef.current.height, you, headingRef.current, sizeRef.current.occludedTop);
      if (seenRef.current.junction !== current.index) seenRef.current = { junction: current.index, road: false, vehicles: new Set() };
      const seen = seenRef.current;
      seen.road ||= visibleInRoad({ x: current.cx, y: current.cy }, view);
      // Expanding a message must not hide its trigger and make the panel
      // repeatedly expand/collapse. Forget a car once it leaves the road view.
      const visibility = { junctionVisible: seen.road,
        visibleVehicles: vehicles.filter((v: any) => {
          if (v.junction.index !== current.index) return false;
          if (visibleInRoad(v.pose, view)) seen.vehicles.add(v.vehicle.id);
          if (!visibleInRoad(v.pose, { ...view, occludedTop: 0 })) seen.vehicles.delete(v.vehicle.id);
          return seen.vehicles.has(v.vehicle.id);
        }).map((v: any) => v.vehicle.id) };
      const lesson = LESSONS[current.lessonIndex];
      const prompt = lesson ? promptFor(run, lang, lesson.id, visibility) : null;
      const feedback = feedbackRef.current && time < feedbackRef.current.until ? feedbackRef.current.text : null;
      const redundantStraight = current.instruction.kind === 'main' && current.instruction.turn === 'straight';
      const directionActive = current.scheduled && current.instruction.kind !== 'none' && !redundantStraight && (current.ring ? !current.passed : run.s < current.sLine);
      const turnPrompt = directionActive && !current.ring && prompt?.swipe === current.instruction.turn;
      const lights: Record<number, any> = {};
      for (const j of visible) if (j.scene.control?.type === 'lights') lights[j.index] = lightState(j, time);
      setFrame({ junctions: visible, vehicles, you, heading: headingRef.current,
        youVehicle: { ...current.scene.vehicles.find((v: any) => v.id === 'you'), from: 'S' },
        lights, blink: Math.floor(time / 350) % 2 === 0, signal: youSignalFor(run), braking: run.brakeLights || run.stoppedAt !== null,
        index: current.lessonIndex ?? Math.max(0, (current.resumeLessonIndex ?? LESSON_COUNT) - 1),
        connectingStreet: current.tramStreet,
        instruction: directionActive ? instructionText(current.instruction, lang) : null,
        direction: directionActive ? current.instruction.turn : undefined,
        status: feedback || (turnPrompt ? null : prompt?.text) || null,
        swipe: feedback || !prompt?.swipe || learnedSwipesRef.current.has(prompt.swipe) ? null : prompt.swipe,
      });
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [lang, paused, phase]);
  const input = useCallback((value: 'left' | 'right' | 'brake' | 'go') => {
    if (phase === 'driving' && !paused) {
      applyInput(runRef.current, value);
      learnedSwipesRef.current.add(value === 'brake' ? 'down' : value === 'go' ? 'up' : value);
    }
  }, [phase, paused]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderRelease: (_e, g) => {
      if (Math.max(Math.abs(g.dx), Math.abs(g.dy)) < 28) return;
      if (Math.abs(g.dx) > Math.abs(g.dy)) input(g.dx > 0 ? 'right' : 'left');
      else input(g.dy > 0 ? 'brake' : 'go');
    },
  }), [input]);
  const back = () => router.canGoBack() ? router.back() : router.replace('/game');
  if (phase === 'driving') return <DriveStage lang={lang}
    detail={`${Math.min((frame?.index ?? 0) + 1, LESSON_COUNT)} / ${LESSON_COUNT}  ·  ${t(frame?.connectingStreet ? 'guide.continuous.driving' : `guide.lesson.${LESSONS[frame?.index ?? 0]?.id ?? 'controls'}.title`, lang)}`}
    instruction={paused ? t('crossing.control.paused', lang) : frame?.instruction ?? frame?.status} direction={frame?.direction}
    status={!paused && frame?.instruction ? frame.status : undefined} swipe={frame?.swipe}
    paused={paused} onPause={() => setPaused(value => !value)} onBack={back} intent={frame?.signal} braking={frame?.braking} onInput={input} testID="screen.crossingGuide">
    {(width, height, occludedTop) => {
      sizeRef.current = { width, height, occludedTop };
      return frame && <View {...pan.panHandlers} style={{ width, height }} testID="guide.scene">
        <WorldScene width={width} height={height} junctions={frame.junctions} vehicles={frame.vehicles} you={frame.you}
          youVehicle={frame.youVehicle} heading={frame.heading} lights={frame.lights} blinkOn={frame.blink} youSignal={frame.signal} youBraking={frame.braking} />
      </View>;
    }}
  </DriveStage>;
  return <Screen testID="screen.crossingGuide" header={<Header title={t('guide.continuous.title', lang)} onBackPress={back} />}>
    <ScrollView contentContainerStyle={{ gap: 20, paddingBottom: 24 }}>
      {phase === 'brief' ? <>
        <UIText variant="title">{t('guide.continuous.title', lang)}</UIText>
        <UIText>{t('guide.continuous.body', lang)}</UIText>
        <UIText>{t('guide.continuous.controls', lang)}</UIText>
        <Button onPress={start} testID="guide.start">{t('game.start', lang)}</Button>
      </> : <>
        <UIText variant="title">{t('guide.doneTitle', lang)}</UIText>
        <UIText>{t('guide.continuous.review', lang)}: {results.filter(r => !r.passed).length}</UIText>
        {results.map(result => <View key={result.lesson} style={{ gap: 4 }}>
          <UIText variant="subtitle">{result.passed ? '✓' : '↺'} {t(`guide.lesson.${result.lesson}.title`, lang)}</UIText>
          {!result.passed && <UIText>{t(`guide.fail.${result.reason}`, lang)}</UIText>}
        </View>)}
        <Button onPress={() => router.replace('/crossing')} testID="guide.play">{t('guide.play', lang)}</Button>
        <Button onPress={start} variant="outline" testID="guide.retry">{t('guide.replay', lang)}</Button>
      </>}
    </ScrollView>
  </Screen>;
}
