import { makeRng } from '../src/lib/priority/generator';
import { applyInput, createRun, currentJunction, step, vehiclePoses, youPose } from '../src/lib/priority/world';
import { bodiesOverlap } from '../src/lib/priority/traffic';
import { drivePolicy } from './support/trafficAudit';

/**
 * Regressions found by fuzzing whole drives with different drivers (build 47):
 * crashes with no contact, a car ahead held "behind" you for ever, you and a
 * crossing car waiting for each other inside a box, a backwards jump after a
 * crash, and departing cars jumping when the road ahead was rebuilt.
 */

// Follows the route and never brakes or waits: the worst case for fault handling.
const reckless = (run, j) => {
  if (j.scheduled && run.s < j.sWait && j.instruction.turn !== 'straight' && run.intent !== j.instruction.turn) applyInput(run, j.instruction.turn);
  if (j.ring && !j.ring.armed && j.ring.order[j.ring.next] === j.instruction.to) applyInput(run, 'right');
  if (run.stoppedAt !== null) applyInput(run, 'go');
};

const drive = (level, seed, frames, policy, onFrame) => {
  const run = createRun(makeRng(seed), level);
  const rng = makeRng(seed * 7 + 1);
  for (let f = 0; f < frames && !run.over; f++) {
    const before = youPose(run);
    const events = step(run, run.now + 32);
    policy(run, currentJunction(run), rng);
    onFrame?.(run, events, before, f);
  }
  return run;
};

describe('fuzzed drive regressions', () => {
  it('records a crash only when the bodies actually meet', () => {
    let crashes = 0;
    for (const [level, seed] of [[1, 7370], [1, 14719], [1, 36766], [1, 44115], [3, 7396], [3, 36792], [3, 44141]]) {
      drive(level, seed, 4000, reckless, (run, events, before) => {
        for (const e of events.filter(e => e.type === 'crash')) {
          crashes++;
          const culprit = vehiclePoses(run).find(v => v.junction.index === e.junction && v.vehicle.id === e.culprit);
          expect(culprit && bodiesOverlap(before, { kind: 'car' }, culprit.pose, culprit.vehicle, 6)).toBe(true);
        }
      });
    }
    expect(crashes).toBeLessThan(20);
  });

  it('never parks a departing car ahead of you and holds you behind it', () => {
    // Level 1, seed 22068: you stood still for the rest of the drive at s 252.
    const run = drive(1, 22068, 2200, reckless);
    expect(run.s).toBeGreaterThan(600);
  });

  it('lets a crossing car that blocks you inside the box drive on', () => {
    // Level 8, seed 15158: you and a crossing car faced each other in the box for good.
    let stuckFrom = null, longest = 0;
    drive(8, 15158, 4200, (run, j, rng) => drivePolicy(run, j, rng), (run) => {
      const moving = run.v > 0.1 || run.stoppedAt !== null || run.braking;
      if (moving) stuckFrom = null;
      else { stuckFrom ??= run.now; longest = Math.max(longest, run.now - stuckFrom); }
    });
    expect(longest).toBeLessThan(8000);
  });

  it('clears a car that holds you after a crash or a late turn, however it is held', () => {
    // A roundabout crash left you touching a car you queued behind; a late turn
    // left you blocked by the junction's occupant. Both froze for good.
    const hesitant = (run, j, rng) => { drivePolicy(run, j, rng); if (rng() < 0.01) applyInput(run, 'brake'); if (run.stoppedAt !== null && rng() < 0.02) applyInput(run, 'go'); };
    const lateTurner = (run, j, rng) => {
      if (j.scheduled && run.s > j.sWait - 4 && run.s < j.sLine + 3 && j.instruction.turn !== 'straight' && run.intent !== j.instruction.turn) applyInput(run, j.instruction.turn);
      if (run.stoppedAt !== null && rng() < 0.05) applyInput(run, 'go');
      if (j.ring && !j.ring.armed && j.ring.order[j.ring.next] === j.instruction.to) applyInput(run, 'right');
    };
    expect(drive(6, 7435, 3200, hesitant).s).toBeGreaterThan(900);
    expect(drive(6, 36833, 1900, lateTurner).s).toBeGreaterThan(600);
  });

  it('keeps you where you hit at an ordinary junction, with no jump back through the box', () => {
    drive(3, 44141, 700, reckless, (run, events, before) => {
      if (!events.some(e => e.type === 'crash')) return;
      const after = youPose(run);
      const j = run.junctions.find(x => x.index === events.find(e => e.type === 'crash').junction);
      if (!j.ring) expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(2);
    });
  });

  it('does not move departing traffic in jumps when the road ahead is rebuilt', () => {
    for (const [level, seed] of [[3, 7396], [1, 22068], [1, 14719]]) {
      const last = new Map();
      drive(level, seed, 3200, reckless, (run) => {
        const you = youPose(run);
        for (const v of vehiclePoses(run)) {
          const prev = last.get(v.key);
          if (prev && v.progress === 1 && Math.hypot(v.pose.x - you.x, v.pose.y - you.y) < 110) {
            expect(Math.hypot(v.pose.x - prev.x, v.pose.y - prev.y)).toBeLessThan(6);
          }
          last.set(v.key, { x: v.pose.x, y: v.pose.y });
        }
      });
    }
  });
});
