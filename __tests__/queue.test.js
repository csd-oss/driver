import { resolve } from '../src/lib/priority/engine';
import { approachPoint, vehiclePath, ROAD_HALF, WAIT } from '../src/lib/priority/layout';
import { QUEUE_GAP, queueBackFor, queuePoint } from '../src/lib/priority/queue';
import { APPROACH_MS, durationOf, poseAt } from '../src/lib/priority/timeline';

const car = (id, from, to) => ({ id, kind: 'car', color: id, from, to });
const base = { layout: 'cross', arms: ['N', 'E', 'S', 'W'], signs: {}, mainRoad: null, tramTracks: [], control: null, pedestrians: [] };

const lengthOf = (points) =>
  points.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : 0), 0);

describe('queueBackFor', () => {
  it('lines up two vehicles from the same arm in resolution order', () => {
    const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('red', 'E', 'W'), { ...car('tram', 'E', 'W'), kind: 'tram' }] };
    const { order } = resolve(scene);
    const backs = scene.vehicles.map((v) => queueBackFor(scene, order, v.id));
    expect(backs[0]).toBe(0);
    expect(new Set([backs[1], backs[2]])).toEqual(new Set([0, QUEUE_GAP]));
    const first = scene.vehicles.find((v) => queueBackFor(scene, order, v.id) === 0 && v.from === 'E');
    const behind = scene.vehicles.find((v) => queueBackFor(scene, order, v.id) === QUEUE_GAP);
    expect(order.findIndex((g) => g.includes(first.id))).toBeLessThan(order.findIndex((g) => g.includes(behind.id)));
  });

  it('gives a third vehicle on the arm two gaps', () => {
    const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('a', 'E', 'W'), car('b', 'E', 'N'), car('c', 'E', 'S')] };
    const order = [['a'], ['b'], ['c'], ['you']];
    expect(queueBackFor(scene, order, 'a')).toBe(0);
    expect(queueBackFor(scene, order, 'b')).toBe(QUEUE_GAP);
    expect(queueBackFor(scene, order, 'c')).toBe(2 * QUEUE_GAP);
  });

  it('keeps a lone vehicle and ring vehicles at the line', () => {
    const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('red', 'E', 'W')] };
    const { order } = resolve(scene);
    expect(queueBackFor(scene, order, 'you')).toBe(0);
    expect(queueBackFor(scene, order, 'red')).toBe(0);
    const round = { ...base, layout: 'roundabout', signs: { S: 'roundabout-yield' }, vehicles: [car('you', 'S', 'N'), car('ring1', 'ring', 'W'), car('ring2', 'ring', 'N')] };
    const ro = resolve(round);
    expect(queueBackFor(round, ro.order, 'ring1')).toBe(0);
    expect(queueBackFor(round, ro.order, 'ring2')).toBe(0);
  });

  it('treats an unknown vehicle as not queued', () => {
    const scene = { ...base, vehicles: [car('you', 'S', 'N')] };
    expect(queueBackFor(scene, resolve(scene).order, 'nobody')).toBe(0);
  });
});

describe('queuePoint', () => {
  it('sits QUEUE_GAP further out along the E approach than the waiting point', () => {
    const scene = { ...base, vehicles: [car('red', 'E', 'W')] };
    const v = scene.vehicles[0];
    const wait = approachPoint('E', ROAD_HALF + WAIT);
    expect(queuePoint(scene, v, 0)).toEqual({ x: wait.x, y: wait.y });
    const back = queuePoint(scene, v, QUEUE_GAP);
    expect(back.y).toBeCloseTo(wait.y);
    expect(back.x).toBeCloseTo(wait.x + QUEUE_GAP);
    expect(Math.hypot(back.x - wait.x, back.y - wait.y)).toBeCloseTo(QUEUE_GAP);
  });
});

describe('poseAt with a queue', () => {
  const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('red', 'E', 'W'), car('blue', 'E', 'N')] };
  const v = scene.vehicles[2];
  const path = vehiclePath(scene, v);
  const gapMs = (QUEUE_GAP / lengthOf(path.through)) * durationOf(v);
  const start = 1500;

  it('waits a gap behind the line before it starts', () => {
    const queued = queuePoint(scene, v, QUEUE_GAP);
    // It rolls up the arm during APPROACH_MS and then stands still, a gap short of the line.
    const early = poseAt(scene, v, start, 0, {}, 0, QUEUE_GAP);
    expect(Math.hypot(early.x - queued.x, early.y - queued.y)).toBeGreaterThan(QUEUE_GAP);
    for (const now of [APPROACH_MS, 1000, 1499]) {
      const pose = poseAt(scene, v, start, now, {}, 0, QUEUE_GAP);
      expect(Math.hypot(pose.x - queued.x, pose.y - queued.y)).toBeLessThan(0.5);
      expect(Math.hypot(pose.x - path.wait.x, pose.y - path.wait.y)).toBeCloseTo(QUEUE_GAP);
    }
    const at = poseAt(scene, v, null, 5000, {}, 0, QUEUE_GAP);
    expect(Math.hypot(at.x - queued.x, at.y - queued.y)).toBeLessThan(0.5);
  });

  it('creeps to the waiting line in about gapMs and then matches the unqueued pose shifted by gapMs', () => {
    const line = poseAt(scene, v, start, start + gapMs, {}, 0, QUEUE_GAP);
    expect(Math.hypot(line.x - path.wait.x, line.y - path.wait.y)).toBeLessThan(0.5);
    for (const dt of [0, 200, 600, 1200, 2000, 2600]) {
      const queuedPose = poseAt(scene, v, start, start + gapMs + dt, {}, 0, QUEUE_GAP);
      const plain = poseAt(scene, v, start, start + dt, {}, 0, 0);
      if (plain === null) {
        expect(queuedPose).toBeNull();
        continue;
      }
      expect(Math.hypot(queuedPose.x - plain.x, queuedPose.y - plain.y)).toBeLessThan(0.5);
    }
  });

  it('is unchanged at queueBack 0', () => {
    for (const now of [0, 400, 900, 1600, 2400, 4000]) {
      expect(poseAt(scene, v, start, now, {}, 0, 0)).toEqual(poseAt(scene, v, start, now, {}, 0));
    }
  });
});
