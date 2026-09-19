import { makeRng } from '../src/lib/priority/generator';
import { createRun, currentJunction, applyInput, step, vehiclePoses } from '../src/lib/priority/world';
import { poseAt, rollingDuration, traversalDuration } from '../src/lib/priority/timeline';
import { RING_R } from '../src/lib/priority/layout';

test('long roundabout arrivals and exits stay at a bounded driving speed', () => {
  let checked = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const { scene } = currentJunction(createRun(makeRng(seed), 5));
    if (scene.layout !== 'roundabout') continue;
    for (const car of scene.vehicles.filter(v => v.id !== 'you')) {
      const cache = {};
      const roll = car.from === 'ring' ? rollingDuration(scene, car, cache) : 0;
      const duration = traversalDuration(scene, car, cache);
      let before = poseAt(scene, car, roll, 0, cache, roll, 0, 200);
      for (let time = 32; time < roll + duration + 1000; time += 32) {
        const after = poseAt(scene, car, roll, time, cache, roll, 0, 200);
        const speed = Math.hypot(after.x - before.x, after.y - before.y) / 0.032;
        // Starts from rest may reach 18 / 0.85; rolling approaches stay <=18.
        expect(speed).toBeLessThanOrEqual(21.3);
        before = after;
      }
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(30);
});

test('arriving traffic waits outside an occupied roundabout and resumes after it clears', () => {
  let yielded = 0, cleared = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const run = createRun(makeRng(seed), 5);
    const junction = currentJunction(run);
    if (!junction.ring || junction.scene.vehicles.filter(v => v.from === 'ring').length < 2) continue;
    applyInput(run, 'brake');
    let previous = [];
    const held = new Set(), resumed = new Set();
    for (let frame = 0; frame < 2200; frame++) {
      step(run, run.now + 32);
      const cars = vehiclePoses(run).filter(v => v.junction === junction);
      const radius = p => Math.hypot(p.x - junction.cx, p.y - junction.cy);
      const inside = previous.filter(c => radius(c.pose) < RING_R + 9);
      for (const car of cars) {
        const old = previous.find(c => c.vehicle.id === car.vehicle.id);
        if (!old) continue;
        const distance = radius(car.pose), before = radius(old.pose);
        if (inside.some(c => c.vehicle.id !== car.vehicle.id) && before > 37 && before < 55 && distance < before) {
          expect(distance).toBeGreaterThanOrEqual(36.9);
          held.add(car.vehicle.id);
        }
        if (held.has(car.vehicle.id) && distance < RING_R + 9) resumed.add(car.vehicle.id);
      }
      previous = cars;
    }
    yielded += held.size;
    cleared += resumed.size;
    if (yielded >= 4) break;
  }
  expect(yielded).toBeGreaterThanOrEqual(4);
  expect(cleared).toBe(yielded);
}, 30000);
