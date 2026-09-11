import { generatePlayable, makeRng, RING_MIN_GAP_DEG } from '../src/lib/priority/generator';
import {
  pointAlong, vehiclePath, approachPoint, exitPoint, roundaboutPath,
  ISLAND_R, RING_DEFAULT_START, RING_R, ROAD_HALF,
} from '../src/lib/priority/layout';

/** Other vehicles (trams aside) the band asks for at this level. */
const expectedOthers = (level) => (level <= 2 ? 2 : level <= 5 ? 3 : 4);
/** Shortest way round from one ring angle to another, in degrees. */
const ringGap = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

describe('generator', () => {
  it('produces playable scenes at every level band without deadlocks', () => {
    const rng = makeRng(42);
    const seen = { cross: 0, t: 0, roundabout: 0 };
    for (let level = 1; level <= 8; level++) {
      for (let i = 0; i < 40; i++) {
        const scene = generatePlayable(rng, level);
        seen[scene.layout] += 1;
        expect(scene.vehicles[0].id).toBe('you');
        expect(scene.resolution.deadlock).toBe(false);
        expect(scene.youGoesAt).toBeGreaterThanOrEqual(0);
        const arms = scene.vehicles.filter((v) => v.from !== 'ring').map((v) => v.from);
        expect(arms.every((a) => scene.arms.includes(a))).toBe(true);
        // ids stay unique even when two vehicles share an arm
        expect(new Set(scene.vehicles.map((v) => v.id)).size).toBe(scene.vehicles.length);
      }
    }
    expect(seen.cross).toBeGreaterThan(0);
    expect(seen.t).toBeGreaterThan(0);
    expect(seen.roundabout).toBeGreaterThan(0);
  });

  it('never runs out of attempts and puts the band\'s traffic on every scene', () => {
    for (let level = 1; level <= 8; level++) {
      const rng = makeRng(level * 7919);
      const perArm = { 1: 0, 2: 0 };
      for (let i = 0; i < 3000; i++) {
        const scene = generatePlayable(rng, level); // throws when 50 draws in a row are unplayable
        const others = scene.vehicles.filter((v) => v.id !== 'you' && v.kind !== 'tram');
        expect(others.length).toBe(expectedOthers(level));
        // No arm carries more vehicles than it has to: extras queue, two deep at most here.
        const counts = {};
        for (const v of others) counts[v.from] = (counts[v.from] || 0) + 1;
        for (const [from, n] of Object.entries(counts)) {
          if (from === 'ring') continue;
          expect(n).toBeLessThanOrEqual(2);
          perArm[n] += 1;
        }
      }
      // Levels that ask for more vehicles than there are free arms double up.
      if (level >= 6) expect(perArm[2]).toBeGreaterThan(0);
    }
  });

  it('is deterministic for a seed', () => {
    const a = generatePlayable(makeRng(7), 5);
    const b = generatePlayable(makeRng(7), 5);
    expect(a).toEqual(b);
  });
});

describe('generated roundabouts', () => {
  const draw = (count, level, seed) => {
    const rng = makeRng(seed);
    const out = [];
    while (out.length < count) {
      const scene = generatePlayable(rng, level);
      if (scene.layout === 'roundabout') out.push(scene);
    }
    return out;
  };

  it('always has traffic on the ring and one sign regime on every arm', () => {
    for (const scene of draw(400, 7, 13)) {
      const ring = scene.vehicles.filter((v) => v.from === 'ring');
      expect(ring.length).toBeGreaterThanOrEqual(1);
      const regimes = new Set(scene.arms.map((a) => scene.signs[a]));
      expect(regimes.size).toBe(1);
      expect(['roundabout', 'roundabout-yield', 'roundabout-stop']).toContain(scene.signs.S);
      // Circulating vehicles leave by an arm; entering ones never turn back.
      for (const v of ring) expect(scene.arms).toContain(v.to);
      for (const v of scene.vehicles) expect(v.to).not.toBe(v.from);
    }
  });

  it('spaces the vehicles on the ring out', () => {
    expect(RING_MIN_GAP_DEG).toBe(45);
    for (const scene of draw(400, 8, 21)) {
      const ring = scene.vehicles.filter((v) => v.from === 'ring');
      for (const v of ring) expect(Number.isFinite(v.ringAt)).toBe(true);
      for (let a = 0; a < ring.length; a++) {
        for (let b = a + 1; b < ring.length; b++) {
          expect(ringGap(ring[a].ringAt, ring[b].ringAt)).toBeGreaterThanOrEqual(RING_MIN_GAP_DEG);
        }
      }
    }
  });

  it('keeps a ring vehicle on the ring band or an arm all the way to its exit', () => {
    for (const scene of draw(200, 7, 33)) {
      for (const v of scene.vehicles.filter((x) => x.from === 'ring')) {
        const path = vehiclePath(scene, v).through;
        for (let t = 0; t <= 1.0001; t += 0.05) {
          const p = pointAlong(path, t);
          const r = Math.hypot(p.x - 50, p.y - 50);
          const onRing = Math.abs(r - RING_R) <= 1;
          const onArm = Math.abs(p.x - 50) <= ROAD_HALF || Math.abs(p.y - 50) <= ROAD_HALF;
          expect(r).toBeGreaterThanOrEqual(ISLAND_R);
          expect(onRing || onArm).toBe(true);
        }
      }
    }
  });

  it('weights the sign regime towards give way', () => {
    const scenes = draw(3000, 6, 77);
    const share = (sign) => scenes.filter((s) => s.signs.S === sign).length / scenes.length;
    expect(share('roundabout-yield')).toBeGreaterThan(0.55);
    expect(share('roundabout-yield')).toBeLessThan(0.85);
    expect(share('roundabout-stop')).toBeGreaterThan(0.05);
    expect(share('roundabout-stop')).toBeLessThan(0.3);
    expect(share('roundabout')).toBeGreaterThan(0.05);
    expect(share('roundabout')).toBeLessThan(0.3);
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

  it('starts a ring vehicle at its ringAt, or at the default just before the S entry', () => {
    expect(RING_DEFAULT_START).toBe(235);
    // Called with two arguments (world.js and the drive log do) nothing changes.
    const plain = roundaboutPath('ring', 'N');
    expect(plain).toEqual(roundaboutPath('ring', 'N', {}));
    expect(plain).toEqual(roundaboutPath('ring', 'N', { ringAt: RING_DEFAULT_START }));
    expect(plain.approach).toEqual([]);
    expect(plain.wait).toEqual(plain.through[0]);
    // The default sits south-west of the island, a little before the S axis.
    expect(plain.wait.x).toBeLessThan(50);
    expect(plain.wait.y).toBeGreaterThan(50);
    expect(Math.hypot(plain.wait.x - 50, plain.wait.y - 50)).toBeCloseTo(RING_R, 6);

    const moved = roundaboutPath('ring', 'N', { ringAt: 300 });
    expect(Math.hypot(moved.wait.x - 50, moved.wait.y - 50)).toBeCloseTo(RING_R, 6);
    expect(moved.wait.x).toBeLessThan(50);
    expect(moved.wait.y).toBeLessThan(50); // 300 deg is north-west of the island
    expect(moved.wait).not.toEqual(plain.wait);
    // Both end at the far end of the N arm, in its exit lane.
    for (const path of [plain, moved]) {
      const end = pointAlong(path.through, 1);
      expect(end.x).toBeCloseTo(56);
      expect(end.y).toBeCloseTo(0);
    }
    // An out-of-range angle is normalised, not broken.
    expect(roundaboutPath('ring', 'E', { ringAt: -60 }).wait).toEqual(roundaboutPath('ring', 'E', { ringAt: 300 }).wait);
  });
});
