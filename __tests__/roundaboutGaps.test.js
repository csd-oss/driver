import { makeRng } from '../src/lib/priority/generator';
import { createRun, currentJunction, step, applyInput, vehiclePoses, youPose, pointAtDistance, lessonHint } from '../src/lib/priority/world';
import { LESSONS } from '../src/lib/priority/lessons';
import { bodiesOverlap } from '../src/lib/priority/traffic';
import { vehiclePath, CENTER, RING_R } from '../src/lib/priority/layout';

const stopAtEntry = run => {
  const j = currentJunction(run);
  while (run.now < 20000 && run.stoppedAt === null) {
    if (j.sWait - run.s < 50) applyInput(run, 'brake');
    step(run, run.now + 32);
  }
  expect(run.stoppedAt).not.toBeNull();
  return j;
};

// A crash must be supported by a near-contact, not by a timer for a car
// anywhere else in the circle. Try departures at many real traffic gaps.
test('roundabout departures never report a remote collision', () => {
  let departures = 0;
  for (let seed = 1; seed <= 40; seed++) for (const delay of [0, 1200, 2800, 4500]) {
    const run = createRun(makeRng(seed), 1);
    if (!currentJunction(run).ring) continue;
    const j = stopAtEntry(run);
    for (let t = 0; t < delay; t += 32) step(run, run.now + 32);
    applyInput(run, 'go');
    departures++;
    for (let frame = 0; frame < 450 && !j.passed && !j.crashed; frame++) {
      if (j.ring.order[j.ring.next] === j.instruction.to) applyInput(run, 'right');
      const before = youPose(run);
      const traffic = vehiclePoses(run);
      const events = step(run, run.now + 32);
      const crash = events.find(e => e.type === 'crash' && e.junction === j.index);
      if (crash) {
        const culprit = traffic.find(c => c.junction === j && c.vehicle.id === crash.culprit);
        expect(culprit).toBeDefined();
        if (!bodiesOverlap(before, { kind: 'car' }, culprit.pose, culprit.vehicle, 1.5)) {
          throw new Error(`Remote crash seed=${seed} delay=${delay} player=${JSON.stringify(before)} culprit=${JSON.stringify(culprit.pose)}`);
        }
      }
    }
  }
  expect(departures).toBeGreaterThan(20);
});

test('roundabout traffic takes its exit on the first encounter, without an extra lap', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const j = currentJunction(createRun(makeRng(seed), 5));
    if (!j.ring) continue;
    for (const v of j.scene.vehicles.filter(v => v.from === 'ring')) {
      expect(v.entryFrom).not.toBe(v.to);
      const path = vehiclePath(j.scene, v);
      const ring = [...path.approach, ...path.through].filter(p => Math.abs(Math.hypot(p.x - CENTER, p.y - CENTER) - RING_R) < 0.01);
      let angle = 0;
      for (let i = 1; i < ring.length; i++) {
        const a = Math.atan2(ring[i - 1].x - CENTER, CENTER - ring[i - 1].y);
        const b = Math.atan2(ring[i].x - CENTER, CENTER - ring[i].y);
        angle += ((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      }
      expect(angle * 180 / Math.PI).toBeLessThan(360);
    }
  }
});

test('cars at other entries can leave while the player stays stopped', () => {
  let checked = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const run = createRun(makeRng(seed), 1);
    const j = currentJunction(run);
    if (!j.ring || !j.scene.vehicles.some(v => v.id !== 'you' && v.from !== 'ring')) continue;
    stopAtEntry(run);
    for (let frame = 0; frame < 1800; frame++) step(run, run.now + 32);
    const remaining = vehiclePoses(run).filter(c => c.junction === j && c.progress < 1);
    expect(remaining.map(c => c.vehicle.id)).toEqual([]);
    expect(run.lives).toBe(3);
    checked++;
  }
  expect(checked).toBeGreaterThan(3);
});

test('the guide releases the driver when the actual entry clears, regardless of the old schedule', () => {
  const lesson = LESSONS.findIndex(l => l.id === 'roundabout');
  const run = createRun(makeRng(1), 1, { lesson });
  const j = stopAtEntry(run);
  for (let frame = 0; frame < 1200; frame++) step(run, run.now + 32);
  expect(vehiclePoses(run).filter(c => c.junction === j && c.progress < 1)).toEqual([]);
  j.clearAt = run.now + 60000;
  expect(lessonHint(run)).toEqual({ step: 'go' });
});

test('a departing vehicle keeps its heading beyond the end of its cached road', () => {
  const road = { points: [{ x: 0, y: 0 }, { x: 0, y: 100 }], cum: [0, 100], length: 100 };
  expect(pointAtDistance(road, 105)).toEqual({ x: 0, y: 100, angle: 180 });
});

test('legacy ring checkpoints always resolve to a finite road approach', () => {
  for (let ringAt = 0; ringAt < 360; ringAt += 5) for (const to of ['N', 'E', 'S', 'W']) {
    const path = vehiclePath({ layout: 'roundabout' }, { from: 'ring', to, ringAt });
    for (const p of [...path.approach, ...path.through]) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  }
});
