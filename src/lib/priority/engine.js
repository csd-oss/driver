import { movementsConflict, oppositeOf, relativeSide, turnOf } from './geometry';

/**
 * Priority engine: who goes first at an intersection, from a scene in the
 * format described in docs/game/scene-format.md.
 *
 * resolve(scene) returns
 *   {
 *     order:   [[ids], [ids], ...]   groups that cross together, in order
 *     yields:  { id: [ids the vehicle must let go first] }
 *     reasons: [{ who, to, rule }]   one entry per yield edge
 *     stopped: [ids]                 vehicles that may not move at all (police, lights)
 *     deadlock: boolean              no vehicle could go (all yield to someone)
 *   }
 *
 * Rule keys (used by the UI to explain a miss):
 *   signal      police officer or traffic light forbids the movement
 *   entry       vehicle enters from a place that is not a road
 *   pedestrian  pedestrians on the crossing the vehicle would cross
 *   sign        side road (yield/stop) yields to the main road
 *   roundabout  entering yields to circulating traffic (yield/stop sign)
 *   right-hand  vehicle on the right goes first
 *   left-turn   turning left yields to oncoming traffic
 *   tram        tram goes first at equal priority
 *   emergency   vehicle with siren goes first
 *   queue       same arm: the one behind waits
 */

const SIDE_SIGNS = new Set(['yield', 'stop', 'roundabout-yield', 'roundabout-stop']);

const armClass = (scene, arm) => {
  const sign = scene.signs?.[arm] ?? null;
  // The main-road panel is authoritative: an arm it names is main even if a
  // yield sign was guessed for it.
  if (scene.mainRoad && scene.mainRoad.includes(arm)) return 'main';
  // "Koniec hlavnej cesty" stands where the main road stops being main:
  // at this intersection that arm is a side road.
  if (SIDE_SIGNS.has(sign) || sign === 'main-end') return 'side';
  if (sign === 'main') return 'main';
  // An arm without a sign, while some other arm has yield/stop, is the main road.
  const others = (scene.arms || []).filter((a) => a !== arm);
  if (others.some((a) => SIDE_SIGNS.has(scene.signs?.[a] ?? null))) return 'main';
  if (scene.mainRoad) return 'side';
  return 'equal';
};

const isTram = (v) => v.kind === 'tram';
const hasSiren = (v) => v.kind === 'emergency' && v.siren;

// ---- Control (police, lights) ---------------------------------------------

/**
 * What a police officer allows for a vehicle, from the officer's pose and
 * the arm the chest faces. Derived from the exam answers (see
 * docs/game/priority-rules.md):
 *   arms-sides                the arms to the officer's left and right go,
 *                             chest and back stop
 *   right-forward-left-side   the arm on the officer's left goes, the arm he
 *                             faces may only turn right, back and right stop
 *   arm-raised                everyone stops
 * Returns 'all' | 'right' | 'none'.
 */
const policeAllows = (control, vehicle) => {
  const side = relativeSide(control.facing, vehicle.from); // where the vehicle is, seen from the faced arm
  // relativeSide is measured from the faced arm's point of view (arriving on it);
  // the officer's own left is that arm's right and vice versa.
  const officerSide = side === 'left' ? 'right' : side === 'right' ? 'left' : side === 'same' ? 'front' : 'back';
  if (control.pose === 'arm-raised') return 'none';
  if (control.pose === 'arms-sides') return officerSide === 'left' || officerSide === 'right' ? 'all' : 'none';
  if (control.pose === 'right-forward-left-side') {
    if (officerSide === 'left') return 'all';
    if (officerSide === 'front') return 'right';
    return 'none';
  }
  return 'all';
};

/** 'all' | 'right' | 'none' for traffic lights, including a lit right-turn arrow on red. */
const lightsAllow = (control, vehicle) => {
  const signal = control.arms?.[vehicle.from];
  if (!signal) return 'all';
  if (signal === 'red') return control.turnArrows?.[vehicle.from] === 'right' ? 'right' : 'none';
  return 'all';
};

const allowsMovement = (allowance, vehicle) =>
  allowance === 'all' || (allowance === 'right' && turnOf(vehicle.from, vehicle.to) === 'right');

/** Left turn protected by the separate exit arrow for this arm. */
const protectedLeft = (control, vehicle) =>
  control?.type === 'lights' && control.exitArrows?.[vehicle.from] === 'left' && turnOf(vehicle.from, vehicle.to) === 'left';

// ---- Pairwise yield decision ----------------------------------------------

/**
 * Returns 'a' when a must yield to b, 'b' when b yields to a, null when they
 * do not conflict. `reason` explains it.
 */
const swapPair = (a, b) => a.to === b.from && b.to === a.from;

const decide = (scene, a, b) => {
  let conflict = isTram(a) || isTram(b) || scene.layout === 'roundabout'
    ? roundaboutOrTramConflict(scene, a, b)
    : movementsConflict(a, b);
  // §20(1): a side-road vehicle waits for every vehicle on the main road,
  // whatever direction it takes; only a pair that swaps roads is unaffected.
  if (!conflict && scene.layout !== 'roundabout' && a.from !== b.from) {
    const ca = armClass(scene, a.from);
    const cb = armClass(scene, b.from);
    if (ca !== cb && ca !== 'equal' && cb !== 'equal' && !swapPair(a, b)) conflict = true;
  }
  if (!conflict) return null;

  const same = a.from === b.from && a.from !== 'ring';
  if (same) {
    // §19(5): a tram turning off the shared arm crosses the car beside it and goes first.
    if (isTram(a) !== isTram(b)) {
      const tramV = isTram(a) ? a : b;
      if (turnOf(tramV.from, tramV.to) !== 'straight') return { who: isTram(a) ? 'b' : 'a', rule: 'tram' };
    }
    return { who: 'b', rule: 'queue' };
  }

  if (hasSiren(a) !== hasSiren(b)) return { who: hasSiren(a) ? 'b' : 'a', rule: 'emergency' };

  if (a.fromEntry !== b.fromEntry) return { who: a.fromEntry ? 'a' : 'b', rule: 'entry' };

  if (scene.layout === 'roundabout') return roundaboutDecision(scene, a, b);

  if (scene.control?.type === 'lights') {
    const arrowA = lightsAllow(scene.control, a) === 'right';
    const arrowB = lightsAllow(scene.control, b) === 'right';
    if (arrowA !== arrowB) return { who: arrowA ? 'a' : 'b', rule: 'signal' };
  }

  const classA = armClass(scene, a.from);
  const classB = armClass(scene, b.from);
  if (classA !== classB && classA !== 'equal' && classB !== 'equal') {
    return { who: classA === 'side' ? 'a' : 'b', rule: 'sign' };
  }
  if (classA === 'side' && classB === 'equal') return { who: 'a', rule: 'sign' };
  if (classB === 'side' && classA === 'equal') return { who: 'b', rule: 'sign' };

  // Same class from here on.
  const turnA = turnOf(a.from, a.to);
  const turnB = turnOf(b.from, b.to);
  const opposite = b.from === oppositeOf(a.from);

  if (isTram(a) !== isTram(b)) {
    const tramV = isTram(a) ? a : b;
    const carV = isTram(a) ? b : a;
    const carTurn = turnOf(carV.from, carV.to);
    const tramTurn = turnOf(tramV.from, tramV.to);
    // A protected left turn (green exit arrow) beats even the tram (§15(6)).
    if (protectedLeft(scene.control, carV)) return { who: isTram(a) ? 'a' : 'b', rule: 'signal' };
    // §19(4): turning left yields to trams in both directions.
    if (carTurn === 'left') return { who: isTram(a) ? 'b' : 'a', rule: 'tram' };
    // §19(5): a tram crossing the path of traffic running beside it has priority.
    const parallel = carV.from === tramV.from || carV.from === oppositeOf(tramV.from);
    if (tramTurn !== 'straight' && parallel) return { who: isTram(a) ? 'b' : 'a', rule: 'tram' };
    // Otherwise the tram is a vehicle like any other: signs, then right-hand rule.
  }

  if (opposite) {
    if (turnA === 'left' && turnB !== 'left') {
      if (protectedLeft(scene.control, a)) return { who: 'b', rule: 'signal' };
      return { who: 'a', rule: 'left-turn' };
    }
    if (turnB === 'left' && turnA !== 'left') {
      if (protectedLeft(scene.control, b)) return { who: 'a', rule: 'signal' };
      return { who: 'b', rule: 'left-turn' };
    }
    return null;
  }

  const side = relativeSide(a.from, b.from);
  if (side === 'right') return { who: 'a', rule: 'right-hand' };
  if (side === 'left') return { who: 'b', rule: 'right-hand' };
  return null;
};

const roundaboutOrTramConflict = (scene, a, b) => {
  if (scene.layout === 'roundabout') {
    const aIn = a.from === 'ring';
    const bIn = b.from === 'ring';
    if (aIn && bIn) return false;
    if (!aIn && !bIn) return a.from === b.from;
    return true; // entering vs circulating: the entry crosses the ring
  }
  // §19(5): a tram turning off its arm cuts across the traffic beside it.
  if (a.from === b.from && turnOf(a.from, a.to) !== turnOf(b.from, b.to)) {
    const tramV = isTram(a) ? a : b;
    if (turnOf(tramV.from, tramV.to) !== 'straight') return true;
  }
  return movementsConflict(a, b);
};

const roundaboutDecision = (scene, a, b) => {
  const aIn = a.from === 'ring';
  const entering = aIn ? b : a;
  const sign = scene.signs?.[entering.from] ?? 'roundabout';
  if (sign === 'roundabout-yield' || sign === 'roundabout-stop' || sign === 'yield' || sign === 'stop') {
    return { who: aIn ? 'b' : 'a', rule: 'roundabout' };
  }
  // Roundabout sign only: right-hand rule, the entering vehicle is on the
  // right of the one circulating towards it.
  return { who: aIn ? 'a' : 'b', rule: 'right-hand' };
};

// ---- Resolution -------------------------------------------------------------

export const resolve = (scene) => {
  const vehicles = scene.vehicles || [];
  const control = scene.control || null;
  const stopped = new Set();

  for (const v of vehicles) {
    if (control?.type === 'police' && !allowsMovement(policeAllows(control, v), v)) stopped.add(v.id);
    if (control?.type === 'lights' && !allowsMovement(lightsAllow(control, v), v)) stopped.add(v.id);
  }

  const moving = vehicles.filter((v) => !stopped.has(v.id));
  const yields = Object.fromEntries(moving.map((v) => [v.id, []]));
  const reasons = [];

  // Pedestrians on a crossing go first; anyone driving over that crossing
  // waits for them (§4a, §19(7); trams are exempt, §4a(5)).
  const pedestrianIds = [];
  for (const p of scene.pedestrians || []) {
    if (!p.onCrossing) continue;
    const pid = `pedestrians:${p.crossing}`;
    pedestrianIds.push(pid);
    yields[pid] = [];
    for (const v of moving) {
      if (isTram(v)) continue;
      if (v.to === p.crossing || v.from === p.crossing) {
        yields[v.id].push(pid);
        reasons.push({ who: v.id, to: pid, rule: 'pedestrian' });
      }
    }
  }

  for (let i = 0; i < moving.length; i++) {
    for (let j = i + 1; j < moving.length; j++) {
      const a = moving[i];
      const b = moving[j];
      const d = decide(scene, a, b);
      if (!d) continue;
      const who = d.who === 'a' ? a : b;
      const to = d.who === 'a' ? b : a;
      yields[who.id].push(to.id);
      reasons.push({ who: who.id, to: to.id, rule: d.rule });
    }
  }

  // Topological grouping: everything whose blockers have all gone crosses together.
  const order = [];
  const gone = new Set(pedestrianIds);
  let remaining = moving.map((v) => v.id);
  let deadlock = false;
  while (remaining.length) {
    const ready = remaining.filter((id) => yields[id].every((dep) => gone.has(dep)));
    if (!ready.length) {
      deadlock = true;
      break;
    }
    order.push(ready);
    ready.forEach((id) => gone.add(id));
    remaining = remaining.filter((id) => !gone.has(id));
  }

  for (const pid of pedestrianIds) delete yields[pid];
  return { order, yields, reasons, stopped: [...stopped], deadlock, blocked: remaining, pedestriansFirst: pedestrianIds };
};

/** Flat list of ids in crossing order (groups expanded). */
export const flatOrder = (result) => result.order.flat();

/** Position (1-based) of a vehicle in the order, or null. */
export const positionOf = (result, id) => {
  const i = result.order.findIndex((g) => g.includes(id));
  return i >= 0 ? i + 1 : null;
};
