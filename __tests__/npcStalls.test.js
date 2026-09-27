import { makeRng } from '../src/lib/priority/generator';
import { createRun, currentJunction, step, vehiclePoses } from '../src/lib/priority/world';
import { auditStalls, drivePolicy } from './support/trafficAudit';

/**
 * Stall audit: on-screen traffic standing still for more than STALL_MS while
 * nothing requires it to wait (`requiredWait` in support/trafficAudit.js).
 * "Required" is judged by the rules the engine applies (priority towards a
 * car that is inside or about to cross its path, a red light, ring traffic
 * near its merge, the player inside or close) and by physical blockage (a
 * body ahead in its lane or in the box). Anything else is a car the player
 * sees waiting for no reason.
 */
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

describe('traffic does not stand still for no reason', () => {
  // Before the scheduling fixes these twelve runs averaged 5.7 stalls and
  // 13.4 stall-seconds each at level 3 (4.9 and 14.4 at level 8): roundabout
  // entrances held for a rule order while the ring was empty, followers
  // waiting until the player was 60 units past the centre, one car in the
  // box at a time whatever the paths, and cars waiting for a priority
  // vehicle that was seconds away. Afterwards: 2.3 and 6.2 (level 3). The
  // tolerance leaves room for the last car that waits for the player by
  // design and for genuine gap judgement.
  test.each([3, 8])('at most a few short stalls per drive at level %i', (level) => {
    let stalls = 0, seconds = 0;
    const examples = [];
    for (const seed of SEEDS) {
      const result = auditStalls(seed, level);
      expect(result.lives).toBe(3);
      stalls += result.stalls.length;
      seconds += result.stallSeconds;
      examples.push(...result.stalls);
    }
    const summary = { level, perRun: stalls / SEEDS.length, secondsPerRun: seconds / SEEDS.length, examples: examples.slice(0, 8) };
    if (summary.perRun > 3.5 || summary.secondsPerRun > 8) throw new Error(`Traffic stalls: ${JSON.stringify(summary)}`);
    expect(summary.perRun).toBeLessThanOrEqual(3.5);
    expect(summary.secondsPerRun).toBeLessThanOrEqual(8);
  }, 120000);

  // Two cars whose bodies touched inside a crossing used to freeze each other
  // for ever, with the player waiting on a clearance that kept growing (11 of
  // 50 such drives before the breaker). Now the one further along drives on.
  test.each([6, 10])('never leaves two cars frozen against each other in a crossing at level %i', (level) => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const run = createRun(makeRng(seed), level);
      const rng = makeRng(seed);
      const frozen = new Map();
      let lastIndex = -1, since = 0;
      for (let frame = 0; frame < 6000 && !run.over; frame++) {
        step(run, run.now + 32);
        const j = currentJunction(run);
        drivePolicy(run, j, rng);
        if (j.index !== lastIndex) { lastIndex = j.index; since = run.now; }
        expect(run.now - since).toBeLessThan(30000);
        for (const car of vehiclePoses(run)) {
          if (!(car.progress > 0.02 && car.progress < 0.98)) { frozen.delete(car.key); continue; }
          const rec = frozen.get(car.key);
          if (!rec || Math.hypot(rec.x - car.pose.x, rec.y - car.pose.y) > 0.05) { frozen.set(car.key, { x: car.pose.x, y: car.pose.y, since: run.now }); continue; }
          if (run.now - rec.since > 5000) throw new Error(`frozen in the box: ${JSON.stringify({ seed, level, frame, key: car.key, progress: car.progress })}`);
        }
      }
      expect(run.lives).toBe(3);
    }
  }, 120000);

  it('never leaves a roundabout entrance waiting for a rule order while the ring is clear', () => {
    let entrants = 0;
    for (const seed of SEEDS) {
      const result = auditStalls(seed, 6, 4000);
      entrants += result.stalls.filter((s) => s.layout === 'roundabout' && s.from !== 'ring' && s.cause === 'start-pushed' && s.startIn > 3000).length;
    }
    expect(entrants).toBe(0);
  }, 120000);
});
