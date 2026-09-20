import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PanResponder, Platform, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { usePostHog } from 'posthog-react-native';
import { DriveStage } from './DriveStage';
import { WorldScene } from './WorldScene';
import { IntersectionScene } from './IntersectionScene';
import { RecordModal, outcomeClass, outcomeTextClass } from './RecordModal';
import { InstructorIdentity } from './InstructorIdentity';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import * as CrossingLogDB from '@/src/db/queries/crossingLog';
import * as GameRoundsDB from '@/src/db/queries/gameRounds';
import { generateId } from '@/src/db/utils';
import { t, tf } from '@/src/i18n/i18n';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { explainRecord } from '@/src/lib/crossingLog';
import { createDriveRecorder, driveSummary, mergeDriveRecord } from '@/src/lib/driveSession';
import { confirmDialog } from '@/src/lib/dialog';
import { getCachedLanguage, getGuideFinished, getLanguage, setGuideFinished } from '@/src/lib/settings';
import { makeRng } from '@/src/lib/priority/generator';
import { createInstructor, instructorFrame, shiftInstructorTime } from '@/src/lib/priority/instructor';
import { LESSON_COUNT } from '@/src/lib/priority/lessons';
import { nextSnapshotAt, SNAPSHOT_MS } from '@/src/lib/priority/render';
import { cameraView, visibleInRoad } from '@/src/lib/priority/view';
import { LIVES, applyInput, createRun, currentJunction, lightState, shiftTime, step, vehiclePoses, visibleJunctions, youPose, youSignalFor } from '@/src/lib/priority/world';

type Input = 'left' | 'right' | 'brake' | 'go';
const now = () => performance.now();

/** One drive, instructor and recorder, from the first lesson into practice. */
export function DrivingExperience({ withGuide = false }: { withGuide?: boolean }) {
  const router = useRouter();
  const posthog = usePostHog();
  const params = useLocalSearchParams<{ seed?: string; level?: string }>();
  const [lang, setLang] = useState(getCachedLanguage);
  const [phase, setPhase] = useState<'loading' | 'running' | 'review'>('loading');
  const [paused, setPaused] = useState(false);
  const [frame, setFrame] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [openRecord, setOpenRecord] = useState<any>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [endedByFaults, setEndedByFaults] = useState(false);
  const runRef = useRef<any>(null);
  const recordsRef = useRef<any[]>([]);
  const recorderRef = useRef<ReturnType<typeof createDriveRecorder> | null>(null);
  const guideDoneRef = useRef(false);
  const finishedRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const headingRef = useRef(0);
  const instructorRef = useRef(createInstructor());
  const learnedSwipesRef = useRef(new Set<string>());
  const sizeRef = useRef({ width: 393, height: 600, occludedTop: 114 });
  const seenRef = useRef({ junction: -1, road: false, vehicles: new Set<string>() });
  const shakeUntilRef = useRef(0);
  const highlightRef = useRef<string[]>([]);

  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const startRun = useCallback((guided: boolean, language: number) => {
    stopLoop();
    const seed = __DEV__ && params.seed ? Number(params.seed) : guided ? 1000 : Date.now() % 1000003;
    const level = !guided && __DEV__ && params.level ? Math.max(1, Number(params.level)) : 1;
    const run = createRun(makeRng(seed), level, { lesson: guided ? 0 : null, continuousGuide: guided, continueAfterGuide: guided });
    run.now = now();
    runRef.current = run;
    const runId = generateId();
    recorderRef.current = createDriveRecorder({ generateId, write: (id: string, record: any) => CrossingLogDB.addCrossingLog({ id, lang: language, runId, outcome: record.outcome, points: record.points, record }) });
    recordsRef.current = [];
    instructorRef.current = createInstructor();
    learnedSwipesRef.current.clear();
    seenRef.current = { junction: -1, road: false, vehicles: new Set() };
    lastTickRef.current = 0;
    headingRef.current = 0;
    shakeUntilRef.current = 0;
    highlightRef.current = [];
    finishedRef.current = false;
    setLang(language);
    setRecords([]);
    setFrame(null);
    setSaveFailed(false);
    setEndedByFaults(false);
    setPaused(false);
    setPhase('running');
    trackEvent(posthog, 'crossing_started', { language, guided });
  }, [params.seed, params.level, posthog, stopLoop]);

  useEffect(() => {
    let active = true;
    Promise.all([getLanguage(), getGuideFinished()]).then(([language, guideDone]) => {
      if (!active || runRef.current) return;
      guideDoneRef.current = guideDone;
      trackScreenView(posthog, 'DrivingPractice');
      startRun(withGuide || !guideDone, language);
    }).catch(() => { if (active && !runRef.current) startRun(true, getCachedLanguage()); });
    return () => { active = false; };
  }, [posthog, startRun, withGuide]);

  const saveDrive = useCallback(async () => {
    setSaving(true);
    let saved = await recorderRef.current?.flush() ?? true;
    if (guideDoneRef.current) {
      try { await setGuideFinished(true); } catch { saved = false; }
    }
    setSaveFailed(!saved);
    setSaving(false);
    return saved;
  }, []);

  const finishRun = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    stopLoop();
    const run = runRef.current;
    setEndedByFaults(run.over);
    setPhase('review');
    setPaused(false);
    const saved = await saveDrive();
    const practice = recordsRef.current.filter(record => record.mode !== 'guide');
    try {
      if (practice.length) await GameRoundsDB.addGameRound({ lang, mode: 'crossing', score: run.score, correctCount: practice.filter(record => record.outcome === 'clean').length, total: practice.length });
      if (saved) await CrossingLogDB.purgeCrossingLog(lang);
    } catch { /* The individual junction records remain the drive review. */ }
    trackEvent(posthog, 'crossing_finished', { language: lang, score: run.score, junctions: practice.length, faults: driveSummary(practice).faults });
  }, [lang, posthog, saveDrive, stopLoop]);

  useEffect(() => {
    if (phase !== 'running' || paused) return;
    const run = runRef.current;
    if (lastTickRef.current) {
      const duration = Math.max(0, now() - lastTickRef.current);
      shiftTime(run, duration);
      shiftInstructorTime(instructorRef.current, duration);
    }
    lastTickRef.current = now();
    let snapshotAt = lastTickRef.current + SNAPSHOT_MS;
    const tick = () => {
      const time = now();
      const gap = time - lastTickRef.current;
      if (Platform.OS !== 'web') {
        const next = nextSnapshotAt(snapshotAt, time);
        if (next === snapshotAt) { frameRef.current = requestAnimationFrame(tick); return; }
        snapshotAt = next;
      }
      if (gap > 400) { shiftTime(run, gap - 16); shiftInstructorTime(instructorRef.current, gap - 16); }
      lastTickRef.current = time;
      const events = step(run, time);
      if (time >= run.crashUntil) highlightRef.current = [];
      let updatedRecords = false;
      for (const event of events) {
        if (event.record) {
          recordsRef.current = mergeDriveRecord(recordsRef.current, event.record);
          recorderRef.current?.save(event.record);
          updatedRecords = true;
        }
        if (event.type === 'guideComplete') {
          guideDoneRef.current = true;
          setGuideFinished(true).catch(() => setSaveFailed(true));
        }
        if (event.type === 'crash') {
          highlightRef.current = [`${event.junction}-${event.culprit}`, 'you'];
          shakeUntilRef.current = time + 600;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        } else if (['wrongWay', 'redLight', 'ranStop'].includes(event.type)) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
      }
      if (updatedRecords) setRecords(recordsRef.current);

      const you = youPose(run);
      const diff = ((you.angle - headingRef.current + 540) % 360) - 180;
      headingRef.current = (headingRef.current + diff * (1 - Math.exp(-Math.min(gap, 100) / 140)) + 360) % 360;
      const current = currentJunction(run);
      const visible = visibleJunctions(run);
      const vehicles = vehiclePoses(run);
      const view = cameraView(sizeRef.current.width, sizeRef.current.height, you, headingRef.current, sizeRef.current.occludedTop);
      if (seenRef.current.junction !== current.index) seenRef.current = { junction: current.index, road: false, vehicles: new Set() };
      const seen = seenRef.current;
      seen.road ||= visibleInRoad({ x: current.cx, y: current.cy }, view);
      const visibility = { junctionVisible: seen.road, visibleVehicles: vehicles.filter((vehicle: any) => {
        if (vehicle.junction.index !== current.index) return false;
        if (visibleInRoad(vehicle.pose, view)) seen.vehicles.add(vehicle.vehicle.id);
        if (!visibleInRoad(vehicle.pose, { ...view, occludedTop: 0 })) seen.vehicles.delete(vehicle.vehicle.id);
        return seen.vehicles.has(vehicle.vehicle.id);
      }).map((vehicle: any) => vehicle.vehicle.id) };
      const speech = instructorFrame(instructorRef.current, run, { lang, events, visibility });
      const lights: Record<number, any> = {};
      for (const junction of visible) if (junction.scene.control?.type === 'lights') lights[junction.index] = lightState(junction, time);
      setFrame({ junctions: visible, vehicles, you, heading: headingRef.current,
        youVehicle: { ...current.scene.vehicles.find((vehicle: any) => vehicle.id === 'you'), from: 'S' },
        lights, blink: Math.floor(time / 350) % 2 === 0, signal: youSignalFor(run), braking: Boolean(run.brakeLights || run.stoppedAt !== null),
        intent: run.intent, shake: time < shakeUntilRef.current ? Math.sin(time / 18) * 1.6 : 0,
        guided: run.coach, lessonIndex: current.lessonIndex ?? current.resumeLessonIndex ?? LESSON_COUNT - 1,
        lives: run.lives, passed: run.passed, ...speech,
        swipe: speech.swipe && !learnedSwipesRef.current.has(speech.swipe) ? speech.swipe : null,
      });
      if (run.over && time >= run.crashUntil) { finishRun(); return; }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [finishRun, lang, paused, phase, stopLoop]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') setPaused(true); });
    return () => { subscription.remove(); stopLoop(); };
  }, [stopLoop]);

  const input = useCallback((value: Input) => {
    if (phase !== 'running' || paused) return;
    applyInput(runRef.current, value);
    learnedSwipesRef.current.add(value === 'brake' ? 'down' : value === 'go' ? 'up' : value);
  }, [phase, paused]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) > 10,
    onPanResponderRelease: (_event, gesture) => {
      if (Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) < 28) return;
      if (Math.abs(gesture.dx) > Math.abs(gesture.dy)) input(gesture.dx > 0 ? 'right' : 'left');
      else input(gesture.dy > 0 ? 'brake' : 'go');
    },
  }), [input]);

  const back = async () => {
    if (phase !== 'running') { router.replace('/game'); return; }
    const wasPaused = paused;
    setPaused(true);
    const end = await confirmDialog({ title: t('practice.end', lang), message: t('practice.endBody', lang), confirmText: t('practice.review', lang), cancelText: t('crossing.control.resume', lang) });
    if (end) finishRun();
    else setPaused(wasPaused);
  };

  if (phase === 'running') return <DriveStage lang={lang}
    detail={(frame?.guided ?? runRef.current?.coach) ? tf('practice.guideProgress', lang, { n: Math.min((frame?.lessonIndex ?? 0) + 1, LESSON_COUNT), total: LESSON_COUNT })
      : `${tf('practice.progress', lang, { n: frame?.passed ?? 0 })}  ·  ${Array.from({ length: LIVES }, (_, i) => i < (frame?.lives ?? LIVES) ? '♥' : '♡').join(' ')}`}
    instruction={paused ? t('practice.coach.paused', lang) : frame?.instruction} direction={frame?.direction}
    status={!paused ? frame?.status : undefined} swipe={frame?.swipe}
    paused={paused} onPause={() => setPaused(value => !value)} onBack={back} intent={frame?.signal ?? frame?.intent}
    braking={frame?.braking} onInput={input} testID="screen.crossing">
    {(width, height, occludedTop) => {
      sizeRef.current = { width, height, occludedTop };
      return frame && <View {...pan.panHandlers} style={{ width, height }} testID={frame.guided ? 'guide.scene' : 'crossing.scene'}>
        <WorldScene width={width} height={height} junctions={frame.junctions} vehicles={frame.vehicles} you={frame.you}
          youVehicle={frame.youVehicle} heading={frame.heading} lights={frame.lights} blinkOn={frame.blink} youSignal={frame.signal}
          youBraking={frame.braking} shake={frame.shake} highlight={highlightRef.current} />
      </View>;
    }}
  </DriveStage>;

  const summary = driveSummary(records);
  return <Screen testID="screen.crossing" header={<Header title={t('practice.title', lang)} onBackPress={() => router.replace('/game')} />}>
    {phase === 'review' && <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28, gap: 20 }} testID="crossing.over">
      <InstructorIdentity lang={lang} />
      <View style={{ gap: 8 }}>
        <UIText variant="title">{t('practice.review', lang)}</UIText>
        <UIText>{t(endedByFaults ? 'practice.coach.finished' : 'practice.coach.ended', lang)}</UIText>
        <UIText variant="caption" className="text-slate-500 dark:text-slate-400">{tf('practice.reviewSummary', lang, { n: summary.total, clean: summary.clean, faults: summary.faults })}</UIText>
      </View>
      {saveFailed && <View style={{ gap: 8 }} testID="crossing.saveError"><UIText>{t('practice.saveError', lang)}</UIText><Button disabled={saving} onPress={saveDrive} variant="outline">{t('practice.retrySave', lang)}</Button></View>}
      <Button onPress={() => startRun(!guideDoneRef.current, lang)} disabled={saving} testID="crossing.playAgain">{t('practice.driveAgain', lang)}</Button>
      <View>
        {records.map((record, index) => {
          const info = explainRecord(record, lang);
          return <Pressable key={record.index} onPress={() => setOpenRecord(record)} accessibilityRole="button" accessibilityLabel={info.headline}
            className="flex-row items-center gap-3 py-4 border-t border-slate-200 dark:border-slate-800" testID={`crossing.record.${index}`}>
            <View className="rounded-xl overflow-hidden"><IntersectionScene scene={record.scene} size={76} showPaths /></View>
            <View className="flex-1 gap-1.5">
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">{t(record.mode === 'guide' ? 'practice.guide' : 'practice.title', lang)} · #{record.index + 1}</UIText>
              <UIText variant="body">{info.headline}</UIText>
              <View className="flex-row"><View className={`rounded-full px-2 py-0.5 ${outcomeClass[info.outcome]}`}><UIText variant="caption" className={outcomeTextClass[info.outcome]}>{info.outcomeLabel}</UIText></View></View>
            </View>
          </Pressable>;
        })}
      </View>
      <Button onPress={() => router.push('/crossing-log')} disabled={saving} variant="outline" testID="crossing.log.open">{t('crossing.log.open', lang)}</Button>
      <Button onPress={() => router.replace('/game')} variant="secondary">{t('practice.back', lang)}</Button>
    </ScrollView>}
    {openRecord && <RecordModal record={openRecord} lang={lang} onClose={() => setOpenRecord(null)} />}
  </Screen>;
}
