import { resolve } from '../src/lib/priority/engine';
import { approachPoint, vehiclePath, ROAD_HALF, WAIT } from '../src/lib/priority/layout';
import { QUEUE_GAP, queueBackFor, queuePoint } from '../src/lib/priority/queue';
import { APPROACH_MS, durationOf, poseAt } from '../src/lib/priority/timeline';

const car = (id, from, to) => ({ id, kind: 'car', color: id, from, to });
const base = { layout: 'cross', arms: ['N', 'E', 'S', 'W'], signs: {}, mainRoad: null, tramTracks: [], control: null, pedestrians: [] };

const lengthOf = (points) =>
  points.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : 0), 0);

describe('queueBackFor', () => {
  it('lines up two cars from the same arm in resolution order, a vehicle length apart', () => {
    const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('red', 'E', 'W'), car('blue', 'E', 'W')] };
    const { order } = resolve(scene);
    const backs = scene.vehicles.map((v) => queueBackFor(scene, order, v.id));
    expect(backs[0]).toBe(0);
    expect(new Set([backs[1], backs[2]])).toEqual(new Set([0, 13]));
    const first = scene.vehicles.find((v) => queueBackFor(scene, order, v.id) === 0 && v.id !== 'you');
    const behind = scene.vehicles.find((v) => queueBackFor(scene, order, v.id) === 13);
    expect(order.findIndex((g) => g.includes(first.id))).toBeLessThan(order.findIndex((g) => g.includes(behind.id)));
  });

  it('a tram has its own track and never queues with cars', () => {
    const scene = { ...base, tramTracks: [{ from: 'E', to: 'W' }], vehicles: [car('you', 'S', 'N'), car('red', 'E', 'W'), { ...car('tram1', 'E', 'W'), kind: 'tram' }] };
    const { order } = resolve(scene);
    expect(queueBackFor(scene, order, 'red')).toBe(0);
    // Extra body length plus room for a turning vehicle's swept corner.
    expect(queueBackFor(scene, order, 'tram1')).toBe(9.5);
  });

  it('gives a third car on the arm two lengths', () => {
    const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('a', 'E', 'W'), car('b', 'E', 'W'), car('c', 'E', 'W')] };
    const order = [['you', 'a'], ['b'], ['c']];
    expect(queueBackFor(scene, order, 'a')).toBe(0);
    expect(queueBackFor(scene, order, 'b')).toBe(13);
    expect(queueBackFor(scene, order, 'c')).toBe(26);
  });

  it('preserves the gap behind a longer lead vehicle', () => {
    const van = { ...car('van', 'E', 'W'), kind: 'van' };
    const rear = car('rear', 'E', 'N');
    const scene = { ...base, vehicles: [car('you', 'S', 'N'), van, rear] };
    const order = [['van'], ['rear'], ['you']];
    const separation = queueBackFor(scene, order, rear.id) - queueBackFor(scene, order, van.id);
    expect(separation - 11.5 / 2 - 10 / 2).toBe(3);
  });

  it('keeps a lone vehicle and ring vehicles at the line', () => {
    const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('red', 'E', 'W')] };
    const { order } = resolve(scene);
    expect(queueBackFor(scene, order, 'you')).toBe(0);
    expect(queueBackFor(scene, order, 'red')).toBe(0);
    const round = { ...base, layout: 'roundabout', vehicles: [car('you', 'S', 'N'), { ...car('ring1', 'ring', 'N') }, { ...car('ring2', 'ring', 'W') }] };
    const ro = resolve(round);
    expect(queueBackFor(round, ro.order, 'ring1')).toBe(0);
    expect(queueBackFor(round, ro.order, 'ring2')).toBe(0);
  });

  it('treats an unknown vehicle as not queued', () => {
    const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('red', 'E', 'W')] };
    expect(queueBackFor(scene, resolve(scene).order, 'nobody')).toBe(0);
  });
});

describe('queuePoint', () => {
  it('sits further out along the E approach than the waiting point', () => {
    const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('red', 'E', 'W')] };
    const v = scene.vehicles[1];
    const wait = approachPoint('E', ROAD_HALF + WAIT, scene, v);
    expect(queuePoint(scene, v, 0)).toEqual({ x: wait.x, y: wait.y });
    const back = queuePoint(scene, v, QUEUE_GAP);
    expect(back.y).toBeCloseTo(wait.y);
    expect(back.x).toBeCloseTo(wait.x + QUEUE_GAP);
  });
});

describe('poseAt with a queue and easing', () => {
  const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('red', 'E', 'W'), car('blue', 'E', 'N')] };
  const v = scene.vehicles[2];
  const cache = {};
  const path = vehiclePath(scene, v);
  const along = (p) => Math.hypot(p.x - path.wait.x, p.y - path.wait.y);

  it('waits a vehicle length behind the line before it starts, having slowed into it', () => {
    const queued = queuePoint(scene, v, 13);
    const rest = poseAt(scene, v, null, APPROACH_MS + 200, cache, 0, 13);
    expect(Math.hypot(rest.x - queued.x, rest.y - queued.y)).toBeLessThan(0.5);
    // Rolling up: the last 100 ms cover less ground than the first 100 ms.
    const d0 = along(poseAt(scene, v, null, 0, cache, 0, 13));
    const d1 = along(poseAt(scene, v, null, 100, cache, 0, 13));
    const d2 = along(poseAt(scene, v, null, APPROACH_MS - 100, cache, 0, 13));
    const d3 = along(poseAt(scene, v, null, APPROACH_MS, cache, 0, 13));
    expect(d0 - d1).toBeGreaterThan(d2 - d3);
  });

  it('accelerates from rest: barely moves in the first 100 ms, then reaches the line and drives on', () => {
    const start = 3000;
    const p0 = poseAt(scene, v, start, start, cache, 0, 13);
    const p1 = poseAt(scene, v, start, start + 100, cache, 0, 13);
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeLessThan(1);
    let reached = null;
    let last = -Infinity;
    for (let t = 0; t <= 4000; t += 16) {
      const p = poseAt(scene, v, start, start + t, cache, 0, 13);
      if (!p) break;
      const d = -along(p) + (p.progress > 0 ? 2 * along(p) : 0); // distance grows once past the line
      expect(d).toBeGreaterThanOrEqual(last - 0.01);
      last = d;
      if (reached === null && p.progress > 0) reached = t;
    }
    expect(reached).toBeGreaterThan(300);
    expect(reached).toBeLessThan(1500);
  });

  it('clearTimeMs matches poseAt: at that time the vehicle has covered that share of its path', () => {
    const { clearTimeMs } = require('../src/lib/priority/timeline');
    for (const [eased, rollIn, back] of [[true, 0, 0], [true, 0, 13], [false, 2500, 0]]) {
      for (const fraction of [0.2, 0.45, 0.62]) {
        const start = 5000;
        const t = clearTimeMs(scene, v, fraction, eased, back, cache);
        const pose = poseAt(scene, v, start, start + t, cache, rollIn, back);
        expect(pose.progress).toBeCloseTo(fraction, 1);
      }
    }
  });

  it('a rolling-in vehicle appears well behind its line and keeps a steady speed', () => {
    const start = 6000;
    const first = poseAt(scene, v, start, start - 2500, cache, 2500, 0);
    expect(along(first)).toBeGreaterThan(30);
    const a = poseAt(scene, v, start, start - 2000, cache, 2500, 0);
    const b = poseAt(scene, v, start, start - 1900, cache, 2500, 0);
    const c = poseAt(scene, v, start, start + 100, cache, 2500, 0);
    const d = poseAt(scene, v, start, start + 200, cache, 2500, 0);
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    const after = Math.hypot(c.x - d.x, c.y - d.y);
    expect(Math.abs(before - after)).toBeLessThan(0.6);
    expect(poseAt(scene, v, start, start - 2600, cache, 2500, 0)).toBeNull();
  });

  it('is unchanged in shape at queueBack 0', () => {
    const p = poseAt(scene, v, 1000, 2000, cache);
    expect(p).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), angle: expect.any(Number), progress: expect.any(Number) }));
  });
});
