import { makeRng } from '../../src/lib/priority/generator';
import { applyInput, createRun, currentJunction, lightState, step, vehiclePoses, youPose, EARLY_CLEAR_MS } from '../../src/lib/priority/world';
import { bodiesOverlap, followingGap } from '../../src/lib/priority/traffic';
import { RING_JOIN_DEG, RING_R, boxHalf } from '../../src/lib/priority/layout';
import { clearFractionFor } from '../../src/lib/priority/conflict';
import { clearTimeMs, CLEAR_FRACTION } from '../../src/lib/priority/timeline';
import { cameraView, visibleInRoad } from '../../src/lib/priority/view';
import { trafficInView } from '../../src/lib/priority/render';

/**
 * Headless traffic audits shared by the test suites: a rule-following
 * driver, "does anything require this car to wait" (the stall audit), and
 * what the cars giving way to the player are seen doing (the yielder audit).
 * Not a test file itself: jest only collects `*.test.js`.
 */

export const STALL_MS = 1500;
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

/**
 * Why `car` has to stand still right now, as a list of reasons; empty when
 * nothing requires it. "Required" is judged by the rules the engine applies
 * (priority towards a car that is inside or about to cross its path, a red
 * light, ring traffic near its merge, the player inside or close) and by
 * physical blockage (a body ahead in its lane or in the box).
 */
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
export const drivePolicy = (run, j, rng) => {
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

/** A generated junction without lights or a ring: the ones where cars give way to the player by rule. */
const plainJunction = (j) => !j.ring && !j.scene.control && !j.lesson && !j.tramStreet;
/** The cars at `j` that give way to the player directly. */
const yieldersOf = (j) => j.scene.vehicles.filter((v) => v.id !== 'you' && v.kind !== 'tram' && (j.resolution.yields[v.id] || []).includes('you'));

const FAR_MS = 3500;      // the player is "still far" beyond this
const STILL_MS = 400;     // standing this long at the line counts as a stop
const APPROACH_MS = 300;  // seen driving towards the line this long counts as an approach

/**
 * What the cars giving way to the player are seen doing, over one drive:
 *
 *  - `idleWithTime`: seconds a yielder stands at its line with the player
 *    more than FAR_MS away although it could clear the player's path (its
 *    drive from rest plus EARLY_CLEAR_MS) before the player could arrive, and
 *    nothing else requires it to wait. This is the "waiting for me while it
 *    had time" the player complains about.
 *  - `classes`: each yielder that was in view before the player passed the
 *    line, as `parkedWaiting` (stood at the line the whole time), `parkedWent`
 *    (stood, then went before the player), `rolledUp` (seen driving in and
 *    stopping at the line), `through` (seen driving in and crossing without
 *    a stop) or `arriving` (still on its way in when the player passed).
 *    Yielders never in view before then are `unseen`.
 *  - `crashes` and NPC overlaps (`overlapFrames`, distinct `overlapPairs`)
 *    for the safety comparison.
 */
export const auditYielders = (seed, level, frames = 5000) => {
  const run = createRun(makeRng(seed), level);
  const rng = makeRng(seed * 31 + level);
  const records = new Map(); // key -> { junction, vehicle, lastPose, stillMs, approachMs, ... }
  const last = new Map();
  const overlapPairs = new Set();
  const everSeen = new Set();
  let idleWithTimeMs = 0, overlapFrames = 0, crashes = 0, popIns = 0;
  const idleCars = new Set();
  const classes = { parkedWaiting: 0, parkedWent: 0, rolledUp: 0, through: 0, arriving: 0, unseen: 0 };
  const classify = (rec) => {
    if (rec.classified) return;
    rec.classified = true;
    const kind = !rec.seen ? 'unseen'
      : rec.approachMs >= APPROACH_MS && rec.stillMs >= STILL_MS ? 'rolledUp'
      : rec.approachMs >= APPROACH_MS ? (rec.crossed ? 'through' : 'arriving')
      : rec.crossed ? 'parkedWent' : 'parkedWaiting';
    classes[kind] += 1;
    rec.kind = kind;
  };
  for (let frame = 0; frame < frames && !run.over; frame++) {
    const events = step(run, run.now + 32);
    crashes += events.filter((e) => e.type === 'crash').length;
    const j = currentJunction(run);
    drivePolicy(run, j, rng);
    const traffic = vehiclePoses(run);
    const player = youPose(run);
    const camera = cameraView(393, 700, player, player.angle);
    const playerVehicle = j.scene.vehicles.find((v) => v.id === 'you');
    for (let a = 0; a < traffic.length; a++) for (let b = a + 1; b < traffic.length; b++) {
      if (!bodiesOverlap(traffic[a].pose, traffic[a].vehicle, traffic[b].pose, traffic[b].vehicle, 0)) continue;
      overlapFrames += 1;
      overlapPairs.add(`${traffic[a].key}|${traffic[b].key}`);
    }
    // A car whose very first pose is on the screen appeared out of nowhere.
    for (const car of traffic) {
      if (everSeen.has(car.key)) continue;
      everSeen.add(car.key);
      if (car.junction.scheduled && visibleInRoad(car.pose, { ...camera, occludedTop: 0 })) popIns += 1;
    }
    for (const area of run.junctions) {
      if (!area.scheduled || !plainJunction(area)) continue;
      const passed = run.s >= area.sLine || area.crashed;
      for (const v of yieldersOf(area)) {
        const key = `${area.index}-${v.id}`;
        let rec = records.get(key);
        if (!rec) { rec = { junction: area, vehicle: v, seen: false, stillMs: 0, approachMs: 0, crossed: false, classified: false }; records.set(key, rec); }
        if (passed) { classify(rec); continue; }
        const car = traffic.find((c) => c.key === key);
        const was = last.get(key);
        if (car) last.set(key, car.pose);
        if (!car || !trafficInView(car.pose, camera)) continue;
        rec.seen = true;
        if (car.progress > 0.02) { rec.crossed = true; continue; }
        const moved = was ? Math.hypot(car.pose.x - was.x, car.pose.y - was.y) : 0;
        if (moved > 0.05) rec.approachMs += 32;
        else if (was) rec.stillMs += 32;
        // Standing at the line while the player is far and there was time to
        // go; a car about to move off (its start within a second) is going.
        if (moved > 0.05 || !was || area !== j || run.s >= area.sWait) continue;
        if (area.starts[v.id] !== null && area.starts[v.id] - run.now < 1000) continue;
        const timeToPlayer = (area.sWait - run.s) / run.speed * 1000;
        if (timeToPlayer <= FAR_MS) continue;
        const fraction = area.clearFraction[v.id] ?? CLEAR_FRACTION;
        const clears = clearTimeMs(area.scene, v, fraction, true, area.queueBack[v.id] || 0, area.pathCache);
        if (timeToPlayer < clears + EARLY_CLEAR_MS) continue;
        const reasons = requiredWait(run, car, traffic, player, playerVehicle).filter((r) => r !== 'yield:you' && r !== 'far');
        if (reasons.length) continue;
        idleWithTimeMs += 32;
        idleCars.add(key);
      }
    }
  }
  for (const rec of records.values()) if (run.s >= rec.junction.sLine || rec.junction.crashed) classify(rec);
  const yielders = Object.values(classes).reduce((a, b) => a + b, 0);
  return { seed, level, junctions: run.passed, lives: run.lives, crashes, idleWithTime: idleWithTimeMs / 1000, idleCars: idleCars.size, yielders, classes, overlapFrames, overlapPairs: overlapPairs.size, popIns };
};

/** Sum of `auditYielders` over seeds and levels, as one comparable table. */
export const summariseYielders = (seeds, levels, frames = 5000) => {
  const total = { runs: 0, junctions: 0, crashes: 0, idleWithTime: 0, idleCars: 0, yielders: 0, overlapFrames: 0, overlapPairs: 0, livesLost: 0, popIns: 0,
    classes: { parkedWaiting: 0, parkedWent: 0, rolledUp: 0, through: 0, arriving: 0, unseen: 0 } };
  for (const level of levels) for (const seed of seeds) {
    const r = auditYielders(seed, level, frames);
    total.runs += 1;
    total.junctions += r.junctions;
    total.crashes += r.crashes;
    total.livesLost += 3 - r.lives;
    total.idleWithTime += r.idleWithTime;
    total.idleCars += r.idleCars;
    total.yielders += r.yielders;
    total.overlapFrames += r.overlapFrames;
    total.overlapPairs += r.overlapPairs;
    total.popIns += r.popIns;
    for (const k of Object.keys(total.classes)) total.classes[k] += r.classes[k];
  }
  const seen = total.yielders - total.classes.unseen;
  return {
    ...total,
    perRun: { idleWithTime: total.idleWithTime / total.runs, idleCars: total.idleCars / total.runs, crashes: total.crashes / total.runs, overlapFrames: total.overlapFrames / total.runs },
    shares: Object.fromEntries(Object.entries(total.classes).map(([k, n]) => [k, total.yielders ? +(n / total.yielders).toFixed(3) : 0])),
    seenShares: Object.fromEntries(Object.entries(total.classes).filter(([k]) => k !== 'unseen').map(([k, n]) => [k, seen ? +(n / seen).toFixed(3) : 0])),
  };
};
