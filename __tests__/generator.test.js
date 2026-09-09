import { generatePlayable, makeRng } from '../src/lib/priority/generator';
import { pointAlong, vehiclePath, approachPoint, exitPoint } from '../src/lib/priority/layout';

describe('generator', () => {
  it('produces playable scenes at every level band without deadlocks', () => {
    const rng = makeRng(42);
    const seen = { cross: 0, t: 0, roundabout: 0 };
    for (let level = 1; level <= 12; level++) {
      for (let i = 0; i < 40; i++) {
        const scene = generatePlayable(rng, level);
        seen[scene.layout] += 1;
        expect(scene.vehicles[0].id).toBe('you');
        expect(scene.resolution.deadlock).toBe(false);
        expect(scene.youGoesAt).toBeGreaterThanOrEqual(0);
        const arms = scene.vehicles.filter((v) => v.from !== 'ring').map((v) => v.from);
        // at most one car per arm plus a tram
        const cars = scene.vehicles.filter((v) => v.kind !== 'tram');
        expect(new Set(cars.map((v) => v.from)).size).toBe(cars.length);
        expect(arms.every((a) => scene.arms.includes(a))).toBe(true);
      }
    }
    expect(seen.cross).toBeGreaterThan(0);
    expect(seen.t).toBeGreaterThan(0);
    expect(seen.roundabout).toBeGreaterThan(0);
  });

  it('is deterministic for a seed', () => {
    const a = generatePlayable(makeRng(7), 5);
    const b = generatePlayable(makeRng(7), 5);
    expect(a).toEqual(b);
  });
});

describe('layout', () => {
  it('moves a straight vehicle from S up the east lane and out the north', () => {
    const scene = { layout: 'cross' };
    const path = vehiclePath(scene, { from: 'S', to: 'N' });
    const start = pointAlong(path.through, 0);
    const end = pointAlong(path.through, 1);
    expect(start.x).toBeCloseTo(56);
    expect(start.y).toBeGreaterThan(62);
    expect(end.x).toBeCloseTo(56);
    expect(end.y).toBeCloseTo(0);
    expect(Math.round(start.angle)).toBe(0);
  });

  it('turns right from S into the south lane of E and left into the north lane of W', () => {
    const right = pointAlong(vehiclePath({ layout: 'cross' }, { from: 'S', to: 'E' }).through, 1);
    expect(right.x).toBeCloseTo(100);
    expect(right.y).toBeCloseTo(56);
    const left = pointAlong(vehiclePath({ layout: 'cross' }, { from: 'S', to: 'W' }).through, 1);
    expect(left.x).toBeCloseTo(0);
    expect(left.y).toBeCloseTo(44);
    expect(approachPoint('E', 20)).toEqual({ x: 70, y: 44 });
    expect(exitPoint('E', 20)).toEqual({ x: 70, y: 56 });
  });

  it('takes a roundabout entrant round the ring to its exit', () => {
    const path = vehiclePath({ layout: 'roundabout' }, { from: 'S', to: 'N' });
    const end = pointAlong(path.through, 1);
    expect(end.y).toBeCloseTo(0);
    const mid = pointAlong(path.through, 0.5);
    expect(Math.hypot(mid.x - 50, mid.y - 50)).toBeCloseTo(19, 0);
  });
});
