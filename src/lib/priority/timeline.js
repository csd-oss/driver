import { vehiclePath, pointAlong } from './layout';
import { queuePoint } from './queue';

/**
 * Timing for one crossing: when each vehicle starts, when it is safe for
 * the player to go, and how long they may hesitate. All times are
 * milliseconds since the scene appeared.
 */

export const APPROACH_MS = 700;   // vehicles roll up to their waiting line
export const FIRST_GROUP_AT = 900; // first group leaves
export const GROUP_GAP_MS = 1100;  // next group starts this long after the previous
export const DURATION_MS = { car: 2300, van: 2500, truck: 2800, bus: 2800, tram: 3400, motorcycle: 2100, bicycle: 3000, emergency: 2000 };
export const CLEAR_FRACTION = 0.62; // a vehicle has cleared the box once this far along its path

export const durationOf = (vehicle) => DURATION_MS[vehicle.kind] ?? DURATION_MS.car;

/** How long the player may wait once the way is clear, by level. */
export const patienceFor = (level) => Math.max(1100, 2600 - (level - 1) * 140);

/**
 * Start times for the vehicles that move before the player, and the window
 * in which the player must go.
 *
 * @returns {{ starts: Record<string, number|null>, clearAt: number, deadline: number, youGoesAt: number }}
 */
// The block below is the timing and scoring of the older tap-a-junction
// mode. The runner schedules in `world.js` (`schedule`) and scores in
// `passJunction`; only the tests reach these. Kept because a level pack of
// the exam pictures would use them again.
export const buildTimeline = (scene, resolution, level = 1) => {
  const groups = resolution.order;
  const youGoesAt = groups.findIndex((g) => g.includes('you'));
  const starts = {};
  for (const v of scene.vehicles) starts[v.id] = null;
  let t = FIRST_GROUP_AT;
  for (let k = 0; k < youGoesAt; k++) {
    for (const id of groups[k]) starts[id] = t;
    t += GROUP_GAP_MS;
  }
  const byId = Object.fromEntries(scene.vehicles.map((v) => [v.id, v]));
  const blockers = (resolution.yields.you || []).filter((id) => byId[id]);
  let clearAt = FIRST_GROUP_AT - 200;
  for (const id of blockers) {
    const start = starts[id];
    if (start === null) continue;
    clearAt = Math.max(clearAt, start + durationOf(byId[id]) * CLEAR_FRACTION);
  }
  return { starts, clearAt, deadline: clearAt + patienceFor(level), youGoesAt, blockers };
};

/**
 * The player went at `goAt`. Returns 'early' with the vehicle they cut off,
 * 'late', or 'ok'.
 */
export const judgeGo = (timeline, scene, goAt) => {
  if (goAt > timeline.deadline) return { verdict: 'late' };
  if (goAt >= timeline.clearAt) return { verdict: 'ok' };
  const byId = Object.fromEntries(scene.vehicles.map((v) => [v.id, v]));
  // The blocker that clears last is the one the player would hit.
  let culprit = null;
  let latest = -1;
  for (const id of timeline.blockers) {
    const start = timeline.starts[id];
    if (start === null) continue;
    const clears = start + durationOf(byId[id]) * CLEAR_FRACTION;
    if (clears > goAt && clears > latest) {
      latest = clears;
      culprit = id;
    }
  }
  return { verdict: 'early', culprit };
};

/** Start times for the player's group and everything after, once the player goes. */
export const startsAfterGo = (scene, resolution, timeline, goAt) => {
  const starts = { ...timeline.starts };
  const groups = resolution.order;
  let t = goAt;
  for (let k = timeline.youGoesAt; k < groups.length; k++) {
    for (const id of groups[k]) starts[id] = t;
    t += GROUP_GAP_MS;
  }
  return starts;
};

/** Points for a correct crossing: level base, reaction bonus inside the window, streak. */
export const scoreCrossing = ({ level, goAt, clearAt, deadline, streak = 0 }) => {
  const base = 100 + (level - 1) * 20;
  const window = Math.max(1, deadline - clearAt);
  const reaction = Math.max(0, Math.min(1, 1 - (goAt - clearAt) / window));
  const bonus = Math.round(100 * reaction);
  const multiplier = Math.min(2, 1 + 0.1 * Math.max(0, streak));
  return Math.round((base + bonus) * multiplier);
};

const lengthOf = (points) =>
  points.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : 0), 0);

/**
 * Pose of a vehicle at time `now`. Before its start it rolls up to the
 * waiting line during APPROACH_MS and then waits; afterwards it follows its
 * path for its duration. Returns null once it has left the screen.
 *
 * `queueBack` (scene units, from queueBackFor) puts a vehicle that shares its
 * arm with one ahead that far behind the line; when it starts it first creeps
 * up to the line at its normal speed.
 */
// Motion profiles. A vehicle that starts from rest accelerates over the
// first EASE share of its drive time and then holds its cruising speed
// (path length over its duration); a vehicle that rolls in keeps that
// speed all along. Vehicles rolling up to a line slow into it.
export const EASE = 0.3;
export const ROLL_IN_MAX = 88; // a rolling-in vehicle appears at most this far behind its line
const V_EASE = 1 / (1 - EASE / 2);
/** Distance share covered at time share `u` when starting from rest. */
export const easeIn = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u <= EASE ? (V_EASE * u * u) / (2 * EASE) : V_EASE * (u - EASE / 2));
/** Time share at which a start from rest has covered distance share `d` (inverse of easeIn). */
export const easeInTime = (d) => {
  if (d <= 0) return 0;
  if (d >= 1) return 1;
  const atEase = (V_EASE * EASE) / 2;
  return d <= atEase ? Math.sqrt((2 * EASE * d) / V_EASE) : d / V_EASE + EASE / 2;
};
const easeOut = (u) => 1 - (1 - u) * (1 - u);

const cached = (scene, vehicle, pathCache) => {
  const key = vehicle.id;
  const path = pathCache[key] || (pathCache[key] = vehiclePath(scene, vehicle));
  if (path.throughLength === undefined) path.throughLength = lengthOf(path.through);
  return path;
};

/** The point `dist` units behind the waiting position, straight back along the approach. */
/**
 * The last `dist` units of a polyline, ending where it ends. When `dist` is
 * longer than the polyline, it is extended backwards in a straight line, so
 * a vehicle can roll in from further up its road than the frame covers.
 */
const tailOf = (points, dist) => {
  let left = dist;
  for (let i = points.length - 1; i > 0; i--) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (seg >= left) {
      const f = seg === 0 ? 0 : left / seg;
      const p = { x: points[i].x + (points[i - 1].x - points[i].x) * f, y: points[i].y + (points[i - 1].y - points[i].y) * f };
      return [p, ...points.slice(i)];
    }
    left -= seg;
  }
  const a = points[0];
  const b = points[1] || points[0];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return [{ x: a.x + ((a.x - b.x) / len) * left, y: a.y + ((a.y - b.y) / len) * left }, ...points];
};

/**
 * Milliseconds after its start at which a vehicle has covered `fraction`
 * of its through path. `eased` for a start from rest (queued `queueBack`
 * units behind its line), otherwise a steady roll-in.
 */
export const clearTimeMs = (scene, vehicle, fraction, eased, queueBack, pathCache) => {
  const path = cached(scene, vehicle, pathCache);
  const D = durationOf(vehicle);
  const L = path.throughLength || 1;
  const back = path.approach.length ? Math.max(0, queueBack) : 0;
  // Rolling through at cruising speed: the queue gap costs its own time.
  if (!eased) return ((back + fraction * L) / L) * D;
  const total = back + L;
  return easeInTime((back + fraction * L) / total) * ((total / L) * D);
};

/**
 * Where a vehicle is at scene time `now` (ms), given its `start` (ms, or
 * null while unknown). Returns {x, y, angle, progress} with `progress` its
 * share of the through path, or null once it has left the scene.
 * `rollInMs` > 0: it rolls in at cruising speed and crosses without
 * stopping. Otherwise it rolls up to its (queued) line, waits, and
 * accelerates away from rest when its start comes.
 */
export const poseAt = (scene, vehicle, start, now, pathCache, rollInMs = 0, queueBack = 0) => {
  const path = cached(scene, vehicle, pathCache);
  const L = path.throughLength || 1;
  const D = durationOf(vehicle);
  const V = L / D; // units per ms at cruising speed
  const back = path.approach.length ? Math.max(0, queueBack) : 0;
  const queued = back > 0 ? queuePoint(scene, vehicle, back) : null;
  const approach = back > 0 ? [path.approach[0], queued] : path.approach;
  if (start !== null && rollInMs > 0) {
    const from = start - rollInMs;
    if (now < from) return null;
    if (now < start) {
      if (!approach.length) return { ...pointAlong(path.through, 0.001), progress: 0 };
      // Roll in along the approach itself, so a vehicle already on a
      // roundabout comes round the ring rather than across it.
      const dist = Math.min(V * rollInMs, ROLL_IN_MAX);
      return { ...pointAlong(tailOf(approach, dist), (now - from) / rollInMs), progress: 0 };
    }
    // Rolling on at cruising speed: cover the queue gap, then the junction.
    const travelled = V * (now - start);
    if (back > 0 && travelled < back) return { ...pointAlong([queued, path.wait], travelled / back), progress: 0 };
    const t = (travelled - back) / L;
    if (t >= 1.05) return null;
    const fr = Math.min(1, t);
    return { ...pointAlong(path.through, fr), progress: fr };
  }
  if (start === null || now < start) {
    if (approach.length && now < APPROACH_MS) return { ...pointAlong(approach, easeOut(Math.max(0, now) / APPROACH_MS)), progress: 0 };
    return { ...(back > 0 ? pointAlong(approach, 1) : pointAlong(path.through, 0.001)), progress: 0 };
  }
  // One drive from the (queued) line through the junction, from rest.
  const total = back + L;
  const u = (now - start) / (total / V);
  if (u >= 1.05) return null;
  const dist = easeIn(Math.min(1, u)) * total;
  if (back > 0 && dist < back) return { ...pointAlong([queued, path.wait], dist / back), progress: 0 };
  const fr = Math.min(1, (dist - back) / L);
  return { ...pointAlong(path.through, fr), progress: fr };
};
