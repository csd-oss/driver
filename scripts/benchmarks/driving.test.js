import { performance } from 'perf_hooks';
import { makeRng } from '../../src/lib/priority/generator';
import { createRun, step, currentJunction, applyInput, vehiclePoses, drivingHint } from '../../src/lib/priority/world';

const summarise = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(sorted.length * .5)],
    p95: sorted[Math.floor(sorted.length * .95)],
    p99: sorted[Math.floor(sorted.length * .99)],
    max: sorted.at(-1),
    totalMs: values.reduce((sum, value) => sum + value, 0),
  };
};

// Ten minutes per route includes generation, turn changes, signal queues,
// roundabout exits, traffic carried into later junctions, and growing history.
// Inputs are measured too: choosing a turn can release/reserve a traffic wave.
// Run separately from release checks; timings describe this host, not device FPS.
test.each([
  { seed: 1000, guide: true },
  ...[1, 2, 5, 8, 19, 37].map(seed => ({ seed, guide: false })),
])('profile a ten-minute drive: %j', ({ seed, guide }) => {
  const run = createRun(makeRng(seed), guide ? 1 : 5,
    guide ? { lesson: 0, continuousGuide: true, continueAfterGuide: true } : {});
  const samples = [], inputs = [], lateDrive = [];
  for (let frame = 0; frame < 18000 && !run.over; frame++) {
    const before = performance.now();
    step(run, run.now + 1000 / 30);
    const traffic = vehiclePoses(run);
    const inputAt = performance.now();
    const hint = drivingHint(run, { traffic });
    if (['controlsStop', 'giveWay', 'stopSign', 'redLight'].includes(hint?.step) && !run.braking) applyInput(run, 'brake');
    if (hint?.step === 'go') applyInput(run, 'go');
    if (hint?.step === 'turn') applyInput(run, hint.dir);
    if (hint?.step === 'ring') applyInput(run, 'right');
    const after = performance.now();
    inputs.push(after - inputAt);
    samples.push(after - before);
    if (frame >= 15000) lateDrive.push(after - before);
  }
  expect(run.lives).toBe(3);
  expect(run.over).toBe(false);
  expect(currentJunction(run).index).toBeGreaterThanOrEqual(20);
  if (guide) expect(run.guideComplete).toBe(true);
  console.log(JSON.stringify({ seed, guide, frames: samples.length, junctions: run.junctions.length,
    all: summarise(samples), inputs: summarise(inputs), last100Seconds: summarise(lateDrive) }));
}, 60000);
