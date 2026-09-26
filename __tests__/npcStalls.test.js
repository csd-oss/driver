import { makeRng } from '../src/lib/priority/generator';
import { applyInput, createRun, currentJunction, lightState, step, vehiclePoses, youPose } from '../src/lib/priority/world';
import { bodiesOverlap, followingGap } from '../src/lib/priority/traffic';
import { RING_JOIN_DEG, RING_R, boxHalf } from '../src/lib/priority/layout';
import { clearFractionFor } from '../src/lib/priority/conflict';
import { cameraView } from '../src/lib/priority/view';
import { trafficInView } from '../src/lib/priority/render';

/**
 * Stall audit: on-screen traffic standing still for more than STALL_MS while
 * nothing requires it to wait. "Required" is judged by the rules the engine
 * applies (priority towards a car that is inside or about to cross its path,
 * a red light, ring traffic near its merge, the player inside or close) and
 * by physical blockage (a body ahead in its lane or in the box). Anything
 * else is a car the player sees waiting for no reason.
 */
const STALL_MS = 1500;
const ARM_ANGLE = { N: 0, E: 90, S: 180, W: 270 };
const rad = (d) => d * Math.PI / 180;
const localOf = (junction, pose) => {
  const c = Math.cos(rad(junction.rot)), s = Math.sin(rad(junction.rot));
  const dx = pose.x - junction.cx, dy = pose.y - junction.cy;
  return { x: 50 + dx * c + dy * s, y: 50 - dx * s + dy * c };
};
const ringAngle = (junction, pose) => (Math.atan2(pose.x - junction.cx, -(pose.y - junction.cy)) * 180 / Math.PI - junction.rot + 720) % 360;
const armOf = (l) => (Math.abs(l.x - 50) > Math.abs(l.y - 50) ? (l.x > 50 ? 'E' : 'W') : (l.y > 50 ? 'S' : 'N'));

const ringReasons = (area, arm, everyone, out) => {
  const join = (ARM_ANGLE[arm] - RING_JOIN_DEG + 360) % 360;
  for (const other of everyone) {
    if (Math.hypot(other.pose.x - area.cx, other.pose.y - area.cy) > RING_R + 8) continue;
    const behind = (ringAngle(area, other.pose) - join + 720) % 360;
    if (behind < 110 || behind > 340) out.push(`ring:${other.key}`);
  }
};

export const requiredWait = (run, car, traffic, player, playerVehicle) => {
  const j = car.junction;
  const id = car.vehicle.id;
  const reasons = [];
  const everyone = [...traffic.filter((c) => c !== car), { pose: player, vehicle: playerVehicle, key: 'you', junction: null }];
  for (const other of everyone) {
    if (followingGap(car.pose, car.vehicle, other.pose, other.vehicle) < (car.progress >= 1 ? 26 : 9)) reasons.push(`follow:${other.key}`);
    else if (bodiesOverlap(car.pose, car.vehicle, other.pose, other.vehicle, 2)) reasons.push(`touch:${other.key}`);
  }
  if (car.progress >= 1) {
    // Departed traffic obeys the junction it is now approaching.
    for (const area of run.junctions) {
      if (area.index <= j.index && area !== j) continue;
      const l = localOf(area, car.pose);
      if (Math.abs(l.x - 50) > 60 || Math.abs(l.y - 50) > 60) continue;
      const arm = armOf(l);
      if (area.scene.control?.type === 'lights') {
        const phase = area.scheduled ? lightState(area, run.now)?.[arm] : area.scene.control.arms?.[arm];
        if (phase && phase !== 'green') reasons.push(`light:${phase}`);
      }
      if (area.ring) ringReasons(area, arm, everyone, reasons);
      else {
        const half = Math.max(boxHalf(area.scene, 'N'), boxHalf(area.scene, 'E')) + 3;
        for (const other of everyone) {
          const o = localOf(area, other.pose);
          if (Math.abs(o.x - 50) < half && Math.abs(o.y - 50) < half) reasons.push(`box:${other.key}`);
        }
      }
    }
    return reasons;
  }
  const local = localOf(j, car.pose);
  if (Math.abs(local.x - 50) >= 40 || Math.abs(local.y - 50) >= 40) return ['far'];
  if (j.scene.control?.type === 'lights') {
    const phase = lightState(j, run.now)?.[car.vehicle.from];
    if (phase && phase !== 'green') reasons.push(`light:${phase}`);
  }
  const byId = Object.fromEntries(j.scene.vehicles.map((v) => [v.id, v]));
  const current = currentJunction(run);
  for (const dep of j.resolution.yields[id] || []) {
    if (dep === 'you') {
      const playerInside = run.s >= j.sWait - 2 && run.s < j.sEnd + 10;
      const closing = run.s < j.sWait && j.sWait - run.s < run.speed * 3.5;
      if (j.index >= current.index - 1 && (playerInside || closing)) reasons.push('yield:you');
      continue;
    }
    const depCar = traffic.find((c) => c.junction === j && c.vehicle.id === dep);
    if (!depCar) continue;
    const fraction = clearFractionFor(j.scene, byId[dep], byId[id]);
    if (fraction === null) continue;
    const depStart = j.starts[dep];
    if (depCar.progress === 0 && depStart !== null && depStart - run.now < 6000 && j.rollIn?.[dep]) reasons.push(`soon:${dep}`);
    if (depCar.progress < fraction && depCar.progress > 0) reasons.push(`yield:${dep}`);
    else if (depCar.progress === 0 && (j.resolution.yields[dep] || []).length) reasons.push(`chain:${dep}`);
  }
  if (j.ring && car.vehicle.from !== 'ring') ringReasons(j, car.vehicle.from, everyone, reasons);
  else if (!j.ring) {
    const half = Math.max(boxHalf(j.scene, 'N'), boxHalf(j.scene, 'E')) + 3;
    for (const other of everyone) {
      const l = localOf(j, other.pose);
      if (Math.abs(l.x - 50) >= half || Math.abs(l.y - 50) >= half) continue;
      if (other.key === 'you' || other.junction !== j || clearFractionFor(j.scene, byId[other.vehicle.id], byId[id]) !== null) reasons.push(`box:${other.key}`);
    }
  }
  return reasons;
};

/** A cautious driver: follows the route, brakes for priority traffic, signs and lights, goes when clear. */
const drivePolicy = (run, j, rng) => {
  if (!j.scheduled) return;
  if (!j.ring && run.s < j.sWait && j.instruction.turn !== 'straight' && run.intent !== j.instruction.turn) applyInput(run, j.instruction.turn);
  const mustStop = j.scene.signs?.S === 'stop' || j.scene.signs?.S === 'roundabout-stop';
  if (!j.stopped && run.s < j.sWait && j.sWait - run.s < 45 && (j.blockers.length || mustStop || j.scene.control || rng() < 0.15)) applyInput(run, 'brake');
  if (j.ring && !j.ring.armed && j.ring.order[j.ring.next] === j.instruction.to) applyInput(run, 'right');
  const light = lightState(j, run.now);
  if (run.stoppedAt !== null && run.now > j.clearAt + 600 && (!light || light.S === 'green')) applyInput(run, 'go');
};

/** Drive one run for `frames` snapshots of 32 ms and count the visible stalls. */
export const auditStalls = (seed, level, frames = 5000) => {
  const run = createRun(makeRng(seed), level);
  const rng = makeRng(seed * 31 + level);
  const still = new Map();
  const stalls = [];
  let stallMs = 0;
  for (let frame = 0; frame < frames && !run.over; frame++) {
    step(run, run.now + 32);
    const j = currentJunction(run);
    drivePolicy(run, j, rng);
    const traffic = vehiclePoses(run);
    const player = youPose(run);
    const camera = cameraView(393, 700, player, player.angle);
    const playerVehicle = j.scene.vehicles.find((v) => v.id === 'you');
    const seen = new Set();
    for (const car of traffic) {
      seen.add(car.key);
      if (!car.junction.scheduled || !trafficInView(car.pose, camera)) { still.delete(car.key); continue; }
      const rec = still.get(car.key);
      const moved = rec && Math.hypot(car.pose.x - rec.pose.x, car.pose.y - rec.pose.y) > 0.05;
      if (!rec || moved) { still.set(car.key, { pose: car.pose, unexplainedSince: null, reported: false }); continue; }
      if (requiredWait(run, car, traffic, player, playerVehicle).length) { rec.unexplainedSince = null; continue; }
      if (rec.unexplainedSince === null) rec.unexplainedSince = run.now;
      const waited = run.now - rec.unexplainedSince;
      if (waited <= STALL_MS) continue;
      stallMs += 32;
      if (!rec.reported) {
        rec.reported = true;
        const start = car.junction.starts[car.vehicle.id];
        stalls.push({ seed, level, frame, key: car.key, layout: car.junction.scene.layout, from: car.vehicle.from, to: car.vehicle.to,
          cause: start === null ? 'unreleased' : start > run.now ? 'start-pushed' : 'held', startIn: start === null ? null : Math.round(start - run.now) });
      }
    }
    for (const key of [...still.keys()]) if (!seen.has(key)) still.delete(key);
  }
  return { stalls, stallSeconds: stallMs / 1000, junctions: run.passed, lives: run.lives };
};

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
