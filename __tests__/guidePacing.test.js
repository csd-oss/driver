import { makeRng } from '../src/lib/priority/generator';
import { applyInput, createRun, currentJunction, lessonHint, step } from '../src/lib/priority/world';
import { LESSONS } from '../src/lib/priority/lessons';

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

test.each(['rightHand', 'stopSign', 'lights'])('%s braking prompt leaves a short, safe approach', id => {
  const lesson = LESSONS.findIndex(l => l.id === id);
  const run = createRun(makeRng(1000), 1, { lesson, continuousGuide: true });
  step(run, 32);
  // Read the junction before being told to brake; it is already visible.
  expect(lessonHint(run).step).toBe('observe');
  while (!['giveWay', 'stopSign', 'redLight'].includes(lessonHint(run)?.step) && run.now < 8000) step(run, run.now + 32);
  const promptedAt = run.now;
  expect(promptedAt).toBeLessThan(8000);
  applyInput(run, 'brake');
  while (run.stoppedAt === null && run.now - promptedAt < 6500) step(run, run.now + 32);
  expect(run.stoppedAt).not.toBeNull();
  expect(currentJunction(run).crashed).toBe(false);
  expect(currentJunction(run).ranStop).toBe(false);
  expect(currentJunction(run).ranRed).toBe(false);
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
