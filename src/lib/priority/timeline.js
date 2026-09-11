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
export const poseAt = (scene, vehicle, start, now, pathCache, rollInMs = 0, queueBack = 0) => {
  const key = vehicle.id;
  const path = pathCache[key] || (pathCache[key] = vehiclePath(scene, vehicle));
  const back = path.approach.length ? Math.max(0, queueBack) : 0;
  const queued = back > 0 ? queuePoint(scene, vehicle, back) : null;
  // Approach shortened to the queued spot, and the creep from there to the line.
  const approach = back > 0 ? [path.approach[0], queued] : path.approach;
  const gapMs = back > 0 ? (back / lengthOf(path.through)) * durationOf(vehicle) : 0;
  if (start !== null && rollInMs > 0) {
    // Runner: a vehicle with a known start rolls in over its approach so
    // that it reaches the box without stopping. Not in sight before that.
    const from = start - rollInMs;
    if (now < from) return null;
    if (now < start) return approach.length ? pointAlong(approach, (now - from) / rollInMs) : pointAlong(path.through, 0.001);
  } else if (start === null || now < start) {
    if (approach.length && now < APPROACH_MS) {
      return pointAlong(approach, Math.max(0, now) / APPROACH_MS);
    }
    return back > 0 ? pointAlong(approach, 1) : pointAlong(path.through, 0.001);
  }
  if (back > 0 && now - start < gapMs) return pointAlong([queued, path.wait], (now - start) / gapMs);
  const t = (now - start - gapMs) / durationOf(vehicle);
  if (t >= 1.05) return null;
  return pointAlong(path.through, Math.min(1, Math.max(0, t)));
};
