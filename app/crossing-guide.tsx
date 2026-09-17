import { SwipeHint, type SwipeDirection } from '@/components/game/SwipeHint';
import { WorldScene, type WorldVehicle } from '@/components/game/WorldScene';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import { t, tf } from '@/src/i18n/i18n';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { LESSONS, LESSON_COUNT, lessonVerdict } from '@/src/lib/priority/lessons';
import { makeRng } from '@/src/lib/priority/generator';
import {
  applyInput,
  createRun,
  currentJunction,
  lessonHint,
  lightState,
  shiftTime,
  step,
  vehiclePoses,
  visibleJunctions,
  youPose,
  youSignalFor,
} from '@/src/lib/priority/world';
import { getCachedLanguage, getLanguage, setGuideFinished } from '@/src/lib/settings';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, ScrollView, View, type LayoutChangeEvent } from 'react-native';

type Phase = 'brief' | 'driving' | 'verdict' | 'done';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const SCENE_MAX_W = 480;

// Which swipe each prompt asks for, so the animation matches the words.
const HINT_SWIPE: Record<string, SwipeDirection | null> = {
  giveWay: 'down',
  stopSign: 'down',
  redLight: 'down',
  wait: null,
  go: 'up',
  ring: 'right',
  rolling: null,
  priority: null,
};

const instructionText = (i: { kind: string; turn: string }, lang: number) =>
  i.kind === 'roundabout' ? t(`crossing.instr.roundabout.${i.turn}`, lang) : t(`crossing.instr.${i.kind}`, lang);

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** The prompt for the moment, as a sentence, plus the swipe to animate. */
const promptFor = (run: any, lang: number, lessonId: string): { text: string; swipe: SwipeDirection | null } | null => {
  const hint = lessonHint(run);
  if (!hint) return null;
  const junction = currentJunction(run);
  // The first lesson has no traffic to read: it is there to be played with.
  if (lessonId === 'controls' && (hint.step === 'priority' || hint.step === 'rolling')) {
    return { text: t('guide.lesson.controls.goal', lang), swipe: null };
  }
  const car = hint.vehicle ? junction.scene.vehicles.find((v: any) => v.id === hint.vehicle) : null;
  const vehicle = car ? t(`crossing.vehicle.${car.color}`, lang) : '';
  const swipe = hint.step === 'turn' ? (hint.dir as SwipeDirection) : HINT_SWIPE[hint.step] ?? null;
  if (hint.step === 'giveWay') return { text: tf('crossing.coach.giveWay', lang, { vehicle: cap(vehicle) }), swipe };
  if (hint.step === 'wait') return { text: tf('crossing.coach.waitSwipe', lang, { vehicle: vehicle || t('crossing.log.someone', lang) }), swipe };
  if (hint.step === 'go') return { text: t('crossing.coach.goSwipe', lang), swipe };
  if (hint.step === 'stopSign') return { text: t('crossing.coach.stopSign', lang), swipe };
  if (hint.step === 'redLight') return { text: t('guide.hint.redLight', lang), swipe };
  if (hint.step === 'ring') return { text: t('guide.hint.ring', lang), swipe };
  if (hint.step === 'turn') {
    return { text: tf('crossing.coach.turn', lang, { dir: t(hint.dir === 'left' ? 'crossing.coach.dirLeft' : 'crossing.coach.dirRight', lang) }), swipe };
  }
  if (hint.step === 'rolling') return { text: t('crossing.coach.rolling', lang), swipe };
  return { text: t('crossing.coach.priority', lang), swipe };
};

/**
 * The guide: ten fixed lessons, one junction each, in order. A lesson has to
 * be passed before the next one, and the last one unlocks the game. Nothing
 * here costs points or lives, so a lesson can be retried as often as needed.
 */
export default function CrossingGuideScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const [lang, setLang] = useState(getCachedLanguage);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('brief');
  const [verdict, setVerdict] = useState<{ passed: boolean; reason: string | null } | null>(null);
  const [frame, setFrame] = useState<{ junctions: any[]; vehicles: WorldVehicle[]; you: any; heading: number; youVehicle: any; blink: boolean; lights: Record<number, any>; youSignal: any; youBraking: boolean } | null>(null);
  const [prompt, setPrompt] = useState<{ text: string; swipe: SwipeDirection | null } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  const runRef = useRef<any>(null);
  const frameRef = useRef<number | null>(null);
  const headingRef = useRef(0);
  const lastTickRef = useRef(0);
  const lesson = LESSONS[index];

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'CrossingGuide');
      getLanguage().then(setLang);
    }, [posthog])
  );

  const stopLoop = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };
  useEffect(() => stopLoop, []);

  const startLesson = () => {
    runRef.current = createRun(makeRng(1000 + index), 1, { lesson: index } as any);
    runRef.current.now = now();
    headingRef.current = 0;
    setVerdict(null);
    setPrompt(null);
    setFrame(null);
    setPhase('driving');
    trackEvent(posthog, 'guide_lesson_started', { language: lang, lesson: lesson.id, index });
  };

  // The lesson loop: it ends as soon as the lesson junction is done with.
  useEffect(() => {
    if (phase !== 'driving') return;
    const tick = () => {
      const run = runRef.current;
      const tNow = now();
      const gap = tNow - lastTickRef.current;
      if (gap > 400) shiftTime(run, gap - 16);
      lastTickRef.current = tNow;

      const events = step(run, tNow);
      for (const e of events) {
        if (e.type === 'crash') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        if (e.type === 'stopped') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        if (e.type === 'resumed' || e.type === 'intent') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        if (e.type === 'passed') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setPrompt(promptFor(run, lang, lesson.id));

      const junction = run.junctions[0];
      const you = youPose(run);
      let diff = ((you.angle - headingRef.current + 540) % 360) - 180;
      headingRef.current = (headingRef.current + diff * 0.12 + 360) % 360;
      const current = currentJunction(run);
      const youVehicle = current.scene.vehicles.find((v: any) => v.id === 'you');
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
        lights,
        youSignal: youSignalFor(run),
        youBraking: Boolean(run.brakeLights || run.stoppedAt !== null),
      });

      // Done with this lesson: a pause on a crash so the bump is visible.
      const settled = junction.crashed ? tNow >= run.crashUntil : junction.passed;
      if (settled) {
        const result = lessonVerdict(lesson, junction);
        setVerdict(result);
        setPhase('verdict');
        trackEvent(posthog, 'guide_lesson_finished', { language: lang, lesson: lesson.id, passed: result.passed, reason: result.reason });
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    lastTickRef.current = now();
    frameRef.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [index, lang, lesson, phase, posthog]);

  const swipe = useCallback(
    (input: 'brake' | 'go' | 'left' | 'right') => {
      if (phase === 'driving' && runRef.current) applyInput(runRef.current, input);
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
            if (g.dx > 28) swipe('right');
            else if (g.dx < -28) swipe('left');
          } else if (g.dy > 28) swipe('brake');
          else if (g.dy < -28) swipe('go');
        },
      }),
    [swipe]
  );

  const onSceneLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const w = Math.floor(Math.min(width, SCENE_MAX_W));
    const h = Math.floor(height);
    if (w > 0 && h > 0 && (!box || box.w !== w || box.h !== h)) setBox({ w, h });
  };

  const finish = async () => {
    stopLoop();
    try {
      await setGuideFinished(true);
    } catch {
      /* the guide is still done for this session */
    }
    trackEvent(posthog, 'guide_finished', { language: lang });
    setPhase('done');
  };

  const nextLesson = () => {
    if (index + 1 >= LESSON_COUNT) {
      finish();
      return;
    }
    setIndex(index + 1);
    setPhase('brief');
  };

  const progress = (
    <View className="flex-row gap-1 items-center" testID="guide.progress">
      {LESSONS.map((l, i) => (
        <View
          key={l.id}
          className={`h-1.5 flex-1 rounded-full ${i < index ? 'bg-emerald-500' : i === index ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`}
        />
      ))}
    </View>
  );

  const renderBrief = () => (
    <ScrollView className="flex-1" contentContainerClassName="pb-4" showsVerticalScrollIndicator={false}>
      <Card className="gap-4" testID="guide.brief">
        <UIText variant="caption" className="uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          {tf('guide.lessonOf', lang, { n: index + 1, total: LESSON_COUNT })}
        </UIText>
        <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
          {t(`guide.lesson.${lesson.id}.title`, lang)}
        </UIText>
        <UIText variant="body" className="text-slate-700 dark:text-slate-200">
          {t(`guide.lesson.${lesson.id}.goal`, lang)}
        </UIText>
        {lesson.demo.length > 0 && (
          <View className="rounded-2xl bg-slate-900 dark:bg-slate-800 py-3 px-2 items-center gap-2">
            <UIText variant="caption" className="text-slate-300">
              {t('guide.watch', lang)}
            </UIText>
            <View className="flex-row justify-center gap-4">
              {(lesson.demo as SwipeDirection[]).map((d) => (
                <SwipeHint key={d} direction={d} size={104} label={t(`guide.swipe.${d}`, lang)} testID={`guide.swipe.${d}`} />
              ))}
            </View>
          </View>
        )}
        <Button onPress={startLesson} variant="default" className="w-full" testID="guide.start">
          {t('guide.start', lang)}
        </Button>
      </Card>
    </ScrollView>
  );

  const renderVerdict = () => (
    <ScrollView className="flex-1" contentContainerClassName="pb-4" showsVerticalScrollIndicator={false}>
      <Card className="gap-4" testID={verdict?.passed ? 'guide.passed' : 'guide.failed'}>
        <UIText variant="subtitle" className={verdict?.passed ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}>
          {t(verdict?.passed ? 'guide.passedTitle' : 'guide.failedTitle', lang)}
        </UIText>
        <UIText variant="body" className="text-slate-700 dark:text-slate-200">
          {verdict?.passed ? t(`guide.lesson.${lesson.id}.goal`, lang) : t(`guide.fail.${verdict?.reason}`, lang)}
        </UIText>
        {verdict?.passed ? (
          <Button onPress={nextLesson} variant="default" className="w-full" testID="guide.next">
            {index + 1 >= LESSON_COUNT ? t('guide.play', lang) : t('guide.next', lang)}
          </Button>
        ) : (
          <Button onPress={startLesson} variant="default" className="w-full" testID="guide.retry">
            {t('guide.retry', lang)}
          </Button>
        )}
      </Card>
    </ScrollView>
  );

  const renderDone = () => (
    <Card className="gap-4" testID="guide.done">
      <UIText variant="subtitle" className="text-emerald-600 dark:text-emerald-300">
        {t('guide.doneTitle', lang)}
      </UIText>
      <UIText variant="body" className="text-slate-700 dark:text-slate-200">
        {t('guide.doneBody', lang)}
      </UIText>
      <Button onPress={() => router.replace('/crossing')} variant="default" className="w-full" testID="guide.play">
        {t('guide.play', lang)}
      </Button>
      <Button onPress={() => router.replace('/game')} variant="outline" className="w-full">
        {t('game.backHome', lang)}
      </Button>
    </Card>
  );

  return (
    <Screen testID="screen.crossingGuide" header={<Header title={t('guide.title', lang)} onBackPress={() => (router.canGoBack() ? router.back() : router.replace('/game'))} />}>
      <View className="flex-1 gap-3 mt-1">
        {progress}
        {phase === 'brief' && renderBrief()}
        {phase === 'verdict' && renderVerdict()}
        {phase === 'done' && renderDone()}
        {phase === 'driving' && (
          <>
            <View className="rounded-2xl px-4 py-3 min-h-[64px] bg-slate-900 dark:bg-slate-800 gap-1" testID="guide.prompt">
              {frame && currentJunction(runRef.current).instruction.kind !== 'none' && (
                <UIText variant="caption" className="text-slate-300">
                  🧑‍🏫 {instructionText(currentJunction(runRef.current).instruction, lang)}
                </UIText>
              )}
              <UIText variant="body" className="text-white font-semibold">
                {prompt?.text ?? t(`guide.lesson.${lesson.id}.goal`, lang)}
              </UIText>
            </View>
            <View className="flex-1 items-center" onLayout={onSceneLayout}>
              {frame && box && (
                <View {...panResponder.panHandlers} style={{ width: box.w, height: box.h, borderRadius: 18, overflow: 'hidden' }} testID="guide.scene">
                  <WorldScene
                    width={box.w}
                    height={box.h}
                    junctions={frame.junctions}
                    vehicles={frame.vehicles}
                    you={frame.you}
                    youVehicle={frame.youVehicle}
                    heading={frame.heading}
                    blinkOn={frame.blink}
                    lights={frame.lights}
                    youSignal={frame.youSignal}
                    youBraking={frame.youBraking}
                  />
                  {prompt?.swipe && (
                    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 8, alignItems: 'center' }}>
                      <SwipeHint direction={prompt.swipe} size={96} label={t(`guide.swipe.${prompt.swipe}`, lang)} testID="guide.swipeLive" />
                    </View>
                  )}
                </View>
              )}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
