import { makeRng } from '../src/lib/priority/generator';
import { applyInput, createRun, currentJunction, drivingHint, lessonHint, step, vehiclePoses, youPose, COACH_REACTION_S, REACTION_S } from '../src/lib/priority/world';
import { cameraView, createVisibility } from '../src/lib/priority/view';
import { LESSONS } from '../src/lib/priority/lessons';

const BRAKING_PROMPTS = ['giveWay', 'stopSign', 'redLight'];
const lessonIndex = id => LESSONS.findIndex(l => l.id === id);

/** The continuous guide as the screen runs it: coaching only sees what a phone-sized road viewport shows. */
const guideDrive = ({ width = 393, height = 640, occludedTop = 130, readingMs = 0 } = {}) => {
  const run = createRun(makeRng(1000), 1, { lesson: 0, continuousGuide: true, continueAfterGuide: true });
  const visibility = createVisibility();
  let pending = null;
  const frame = () => {
    step(run, run.now + 32);
    const you = youPose(run), junction = currentJunction(run), traffic = vehiclePoses(run);
    const hint = drivingHint(run, { ...visibility(junction, traffic, cameraView(width, height, you, you.angle, occludedTop)), traffic });
    // Obey every prompt, but only after reading it.
    const input = ['controlsStop', ...BRAKING_PROMPTS].includes(hint?.step) ? 'brake' : hint?.step === 'go' ? 'go' : hint?.step === 'turn' ? hint.dir : hint?.step === 'ring' ? 'right' : null;
    if (input && !pending) pending = { at: run.now + readingMs, input };
    if (pending && run.now >= pending.at) { applyInput(run, pending.input); pending = null; }
    return { junction, hint };
  };
  return { run, frame };
};

test.each([
  ['rightHand', 4], ['sideRoad', 3.8], ['stopSign', 5.5], ['lights', 5.5], ['tram', 4],
  ['leftTurn', 3], // an oncoming car cannot be in a phone viewport much sooner
])('the guide asks %s to brake at least %s s before the line, and a slow reader still stops safely', (id, seconds) => {
  const { run, frame } = guideDrive({ readingMs: 2500 });
  const index = lessonIndex(id);
  let prompt = null, watched = false;
  while (!run.guideComplete && !run.over) {
    const { junction, hint } = frame();
    if (junction.lessonIndex !== index) { if (junction.lessonIndex > index) break; continue; }
    if (!prompt && hint?.step === 'observe') watched = true;
    if (!prompt && BRAKING_PROMPTS.includes(hint?.step)) prompt = { step: hint.step, seconds: (junction.sWait - run.s) / run.speed };
  }
  expect(watched).toBe(true);
  expect(prompt.seconds).toBeGreaterThanOrEqual(seconds);
  const junction = run.junctions.find(j => j.lessonIndex === index);
  expect(junction.passed).toBe(true);
  expect(junction).toMatchObject({ crashed: false, ranStop: false, ranRed: false, stopped: true });
});

test('the guide asks sooner than practice, which keeps its short reaction window', () => {
  expect(COACH_REACTION_S).toBeGreaterThan(REACTION_S);
  const zone = run => { const s = run.speed; return Math.max(28, s * (run.coach ? COACH_REACTION_S : REACTION_S) + s * s / 24); };
  for (const id of ['stopSign', 'lights']) {
    const guide = createRun(makeRng(1000), 1, { lesson: lessonIndex(id) });
    const practice = createRun(makeRng(1000), 1, { lesson: lessonIndex(id) });
    practice.coach = false;
    for (const run of [guide, practice]) {
      step(run, 32);
      const junction = currentJunction(run);
      run.s = junction.sWait - zone(run) - 1;
      expect(drivingHint(run).step).toBe('observe');
      run.s = junction.sWait - zone(run) + 1;
      expect(BRAKING_PROMPTS).toContain(drivingHint(run).step);
    }
    expect(zone(guide) / guide.speed).toBeGreaterThan(zone(practice) / practice.speed);
  }
});

test.each([0, 3000, 10000, 30000])('the first Stop exercise waits for a learner who reacts after %i ms', delay => {
  const run = createRun(makeRng(1000), 1, { lesson: 0, continuousGuide: true });
  step(run, 32);
  const junction = currentJunction(run);
  while (run.now < delay) step(run, run.now + 32);
  expect(junction.passed).toBe(false);
  expect(run.s).toBeLessThanOrEqual(junction.sWait);
  expect(lessonHint(run).step).toBe('controlsStop');
  applyInput(run, 'go');
  expect(run.controlsStage).toBe('stop'); // cannot skip the brake exercise
  const pressedAt = run.now;
  applyInput(run, 'brake');
  while (run.stoppedAt === null && run.now < pressedAt + 1500) step(run, run.now + 32);
  expect(run.stoppedAt).not.toBeNull();
  expect(run.s).toBeLessThanOrEqual(junction.sWait);
  expect(lessonHint(run).step).toBe('go');
  const stoppedAt = run.s;
  for (let i = 0; i < 60; i++) step(run, run.now + 32);
  expect(run.s).toBe(stoppedAt);
  applyInput(run, 'go');
  while (!junction.passed && run.now < pressedAt + 15000) step(run, run.now + 32);
  expect(junction.passed).toBe(true);
  expect(junction.crashed).toBe(false);
});

test('shortening the guide does not shorten normal exam-practice roads', () => {
  const guide = createRun(makeRng(1000), 1, { lesson: 0, continuousGuide: true });
  const practice = createRun(makeRng(1000), 1);
  step(guide, 32); step(practice, 32);
  expect(guide.junctions[0].sWait).toBeLessThan(practice.junctions[0].sWait / 3);
  const gap = run => Math.hypot(run.junctions[1].cx - run.junctions[0].cx, run.junctions[1].cy - run.junctions[0].cy);
  expect(gap(guide)).toBeLessThan(gap(practice));
  expect(gap(guide)).toBeGreaterThan(100); // the junction frames still have a connecting road
});
