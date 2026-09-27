import { HINT_FADE_AT, HINT_MARGIN, HINT_WINDOW, HINT_PERIOD_GAP, arrowAt, hintDashArrays, hintDashoffset, pointAt, routeDistance, routeTable } from '../src/lib/priority/routeHint';
import { pathHint } from '../src/lib/priority/pathHint';
import { pointAlong, vehiclePath } from '../src/lib/priority/layout';
import { poseAt, ROLL_IN_MAX } from '../src/lib/priority/timeline';
import { lessonScene } from '../src/lib/priority/lessons';
import { PREVIEW_SPAN } from '../src/lib/priority/render';

const lessons = [];
for (let index = 0; lessonScene(index); index++) lessons.push(lessonScene(index));
const traffic = scene => scene.vehicles.filter(v => v.id !== 'you');

test('the arc-length table measures the route once and maps progress exactly onto the through path', () => {
  for (const scene of lessons) for (const vehicle of traffic(scene)) {
    const path = vehiclePath(scene, vehicle);
    const table = routeTable(path, path.approach[0]);
    expect(table.extendBack).toBe(0);
    for (let i = 1; i < table.cumulative.length; i++) {
      expect(table.cumulative[i]).toBeGreaterThan(table.cumulative[i - 1]);
      expect(table.cumulative[i] - table.cumulative[i - 1]).toBeCloseTo(Math.hypot(table.xs[i] - table.xs[i - 1], table.ys[i] - table.ys[i - 1]), 9);
    }
    expect(table.total).toBe(table.cumulative[table.cumulative.length - 1]);
    for (const progress of [0.05, 0.3, 0.5, 0.89]) {
      const expected = pointAlong(path.through, progress);
      const at = pointAt(table, routeDistance(table, expected, progress));
      expect(at.x).toBeCloseTo(expected.x, 6);
      expect(at.y).toBeCloseTo(expected.y, 6);
    }
    // Nothing past the fade-out window is kept, but everything up to it is.
    const clip = table.throughStart + HINT_FADE_AT * table.throughLength + HINT_WINDOW + HINT_MARGIN;
    expect(table.total).toBeLessThanOrEqual(clip + 1e-9);
    const end = pointAt(table, table.total);
    const full = routeTable(path, null);
    expect(Math.hypot(end.x - full.xs[full.xs.length - 1], end.y - full.ys[full.ys.length - 1]) < 1e-6 || table.total === clip).toBe(true);
    for (let i = 0; i < table.xs.length; i++) {
      expect(table.xs[i]).toBeGreaterThanOrEqual(table.bounds.minX + HINT_MARGIN);
      expect(table.xs[i]).toBeLessThanOrEqual(table.bounds.maxX - HINT_MARGIN);
      expect(table.ys[i]).toBeGreaterThanOrEqual(table.bounds.minY + HINT_MARGIN);
      expect(table.ys[i]).toBeLessThanOrEqual(table.bounds.maxY - HINT_MARGIN);
    }
    expect(table.d.startsWith('M ')).toBe(true);
  }
});

test('an approaching car projects onto the approach, and a roll-in from behind extends the route back to it', () => {
  for (const scene of lessons) for (const vehicle of traffic(scene)) {
    const path = vehiclePath(scene, vehicle);
    for (const t of [0, 0.3, 0.7, 1]) {
      const local = pointAlong(path.approach, t);
      const table = routeTable(path, local);
      const at = pointAt(table, routeDistance(table, local, 0));
      expect(Math.hypot(at.x - local.x, at.y - local.y)).toBeLessThan(1e-6);
    }
    if (vehicle.from === 'ring') continue;
    const cache = {};
    const rolled = poseAt(scene, vehicle, 6000, 0, cache, 6000, 0, Infinity);
    expect(rolled.progress).toBe(0);
    const table = routeTable(path, rolled);
    expect(table.extendBack).toBeGreaterThan(0);
    expect(table.extendBack).toBeLessThanOrEqual(ROLL_IN_MAX + 1);
    const s = routeDistance(table, rolled, 0);
    expect(s).toBeGreaterThan(0);
    const at = pointAt(table, s);
    expect(Math.hypot(at.x - rolled.x, at.y - rolled.y)).toBeLessThan(1e-6);
    // Later poses on the same roll-in stay on the extended route.
    for (let now = 500; now < 6000; now += 500) {
      const pose = poseAt(scene, vehicle, 6000, now, cache, 6000, 0, Infinity);
      const later = routeDistance(table, pose, pose.progress);
      expect(later).toBeGreaterThanOrEqual(s);
      const point = pointAt(table, later);
      expect(Math.hypot(point.x - pose.x, point.y - pose.y)).toBeLessThan(0.05);
    }
  }
});

test('the dash patterns cover exactly one window and share one period', () => {
  const { under, dashes, period } = hintDashArrays();
  expect(under).toEqual([HINT_WINDOW, HINT_PERIOD_GAP]);
  expect(period).toBe(HINT_WINDOW + HINT_PERIOD_GAP);
  expect(dashes.length % 2).toBe(0);
  const on = dashes.filter((_, i) => i % 2 === 0), off = dashes.filter((_, i) => i % 2 === 1);
  expect(on.every(v => v > 0 && v <= 3)).toBe(true);
  expect(off.slice(0, -1).every(v => v === 2)).toBe(true);
  expect(dashes.reduce((sum, v) => sum + v, 0)).toBeCloseTo(period, 9);
  expect(dashes[dashes.length - 1]).toBeGreaterThan(HINT_PERIOD_GAP);
  expect(dashes.slice(0, -1).reduce((sum, v) => sum + v, 0) + (dashes[dashes.length - 1] - HINT_PERIOD_GAP)).toBeCloseTo(HINT_WINDOW, 9);
  // A shorter window still ends in the long gap with an even count.
  const short = hintDashArrays(12, 1000);
  expect(short.dashes.length % 2).toBe(0);
  expect(short.dashes.reduce((sum, v) => sum + v, 0)).toBeCloseTo(1012, 9);
  // The offset starts the window at the car: one period back from there.
  expect(hintDashoffset(period, 40)).toBe(period - 40);
  expect(HINT_WINDOW).toBe(Math.max(12, 70 * PREVIEW_SPAN));
});

test('the arrowhead sits where the old preview ended, for waiting, moving and turning cars', () => {
  for (const scene of lessons) for (const vehicle of traffic(scene)) {
    const path = vehiclePath(scene, vehicle);
    for (const progress of [0, 0.2, 0.5, 0.8]) {
      const local = progress ? pointAlong(path.through, progress) : pointAlong(path.approach, 0.4);
      const shown = pathHint(path, progress, local, PREVIEW_SPAN);
      const table = routeTable(path, local);
      const head = arrowAt(table, routeDistance(table, local, progress));
      const tip = shown[shown.length - 1];
      expect(Math.hypot(head.x - tip.x, head.y - tip.y)).toBeLessThan(0.05);
      const prev = shown[shown.length - 2];
      const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180 / Math.PI;
      const diff = Math.abs(((head.angle - angle + 540) % 360) - 180);
      expect(diff).toBeLessThan(12);
    }
  }
});
