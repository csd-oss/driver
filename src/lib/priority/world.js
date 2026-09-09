import { resolve } from './engine';
import { generatePlayable } from './generator';
import { EXIT_HEADING, CENTER, ROAD_HALF, SIZE, WAIT, vehiclePath, approachPoint } from './layout';
import { durationOf, GROUP_GAP_MS, CLEAR_FRACTION, poseAt } from './timeline';

/**
 * Endless road for the Crossings runner.
 *
 * Your car drives along a route made of junctions placed one after another.
 * Each junction is a generated scene in its own local frame (you always
 * arrive on its S arm); the frame is rotated so that it lines up with the
 * arm you left the previous junction by. Positions are in "scene units"
 * (a junction is 100 x 100, centre at 50,50).
 *
 * The other vehicles at a junction are scheduled against the moment your
 * car would reach its waiting line without braking: the last vehicle that
 * has priority over you is still crossing when you get there, so you must
 * brake; vehicles that yield to you wait until you have passed.
 */

export const SPACING = 180;            // distance between junction centres
export const CAMERA_Y = 74;            // where your car sits on screen (viewBox y)
export const BASE_SPEED = 24;          // units per second at level 1
export const SPEED_STEP = 2.2;
export const MAX_SPEED = 48;
export const DECISION_MARGIN_MS = 750; // the last blocker clears this long after you would arrive
export const REACTION_MS = 650;        // auto-resume delay after the way clears
export const HONK_MS = 900;            // how long a needless stop holds you
export const CRASH_PAUSE_MS = 1400;
export const JUNCTIONS_PER_LEVEL = 4;
export const LIVES = 3;

export const speedFor = (level) => Math.min(MAX_SPEED, BASE_SPEED + (level - 1) * SPEED_STEP);

const rad = (deg) => (deg * Math.PI) / 180;

/** Local (junction) point to world coordinates. */
export const toWorld = (junction, p) => {
  const c = rad(junction.rot);
  const dx = p.x - CENTER;
  const dy = p.y - CENTER;
  return {
    x: junction.cx + dx * Math.cos(c) - dy * Math.sin(c),
    y: junction.cy + dx * Math.sin(c) + dy * Math.cos(c),
  };
};

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** Polyline with cumulative lengths for distance lookups. */
const measure = (points) => {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  return { points, cum, length: cum[cum.length - 1] };
};

/** Point and heading (degrees clockwise from up) at distance `s` along a measured polyline. */
export const pointAtDistance = (measured, s) => {
  const { points, cum } = measured;
  const target = Math.max(0, Math.min(measured.length, s));
  for (let i = 1; i < points.length; i++) {
    if (target <= cum[i] || i === points.length - 1) {
      const seg = cum[i] - cum[i - 1];
      const f = seg === 0 ? 0 : (target - cum[i - 1]) / seg;
      const a = points[i - 1];
      const b = points[i];
      const angle = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: (angle + 360) % 360 };
    }
  }
  const last = points[points.length - 1];
  return { ...last, angle: 0 };
};

/**
 * Build junction j+1 from junction j: rotated so your exit arm becomes the
 * next entry (S) arm, centred SPACING further along the exit direction.
 */
const placeAfter = (prev, scene) => {
  const you = prev.scene.vehicles.find((v) => v.id === 'you');
  const exitHeading = (prev.rot + EXIT_HEADING[you.to]) % 360; // world heading after leaving prev
  const dir = { x: Math.sin(rad(exitHeading)), y: -Math.cos(rad(exitHeading)) };
  // Walk along the road axis (not the lane) so the two frames share a centre line.
  const axisLocal = { N: { x: CENTER, y: 0 }, E: { x: SIZE, y: CENTER }, S: { x: CENTER, y: SIZE }, W: { x: 0, y: CENTER } }[you.to];
  const exitWorld = toWorld(prev, axisLocal);
  const gap = SPACING - 2 * CENTER;
  const rot = exitHeading;
  // The next junction's S arm end sits `gap` beyond this arm end; its centre CENTER further.
  const centre = { x: exitWorld.x + dir.x * (gap + CENTER), y: exitWorld.y + dir.y * (gap + CENTER) };
  return { scene, cx: centre.x, cy: centre.y, rot };
};

/** Your route through a junction in world coordinates (wait line to exit arm end). */
const throughWorld = (junction) => {
  const you = junction.scene.vehicles.find((v) => v.id === 'you');
  const path = vehiclePath(junction.scene, you);
  return path.through.map((p) => toWorld(junction, p));
};

const createJunction = (rng, level, prev) => {
  const scene = generatePlayable(rng, level);
  const resolution = scene.resolution || resolve(scene);
  const junction = prev
    ? placeAfter(prev, scene)
    : { scene, cx: CENTER, cy: CENTER, rot: 0 };
  junction.resolution = resolution;
  junction.index = prev ? prev.index + 1 : 0;
  junction.youGroup = resolution.order.findIndex((g) => g.includes('you'));
  junction.blockers = (resolution.yields.you || []).filter((id) => scene.vehicles.some((v) => v.id === id));
  junction.starts = Object.fromEntries(scene.vehicles.map((v) => [v.id, null]));
  junction.scheduled = false;
  junction.passed = false;
  junction.crashed = false;
  junction.stopped = false;
  junction.hesitated = false;
  junction.resumeAt = null;
  junction.pathCache = {};
  junction.through = throughWorld(junction);
  return junction;
};

/** Distance markers of a junction along the route. */
const markJunction = (run, junction, routeOffset) => {
  // routeOffset: distance along the run route where junction.through[0] (the wait line) sits
  const throughMeasured = measure(junction.through);
  junction.sWait = routeOffset;                                  // waiting line
  junction.sLine = routeOffset + (WAIT + 1);                     // crossing box edge (entering)
  junction.sExitBox = routeOffset + (WAIT + 1) + ROAD_HALF * 2; // roughly leaving the box
  junction.sEnd = routeOffset + throughMeasured.length;           // exit arm end
  return junction;
};

/**
 * Create a run. `rng` is the seeded generator, `level` the starting level.
 */
export const createRun = (rng, level = 1) => {
  const run = {
    rng,
    level,
    lives: LIVES,
    score: 0,
    streak: 0,
    passed: 0,
    junctions: [],
    route: measure([approachPoint('S', CENTER), approachPoint('S', ROAD_HALF + WAIT)]), // placeholder
    s: 0,               // your distance along the route
    speed: speedFor(level),
    braking: false,
    stoppedAt: null,    // distance where you are stopped
    crashUntil: 0,
    now: 0,
    events: [],
    over: false,
  };
  const first = createJunction(rng, level, null);
  run.junctions.push(first);
  rebuildRoute(run);
  run.s = 0;
  return run;
};

/** Recompute the route polyline from all junctions and mark their distances. */
const rebuildRoute = (run) => {
  const points = [approachPoint('S', CENTER)]; // start at the bottom of the first junction's S arm
  let offset = 0;
  run.junctions.forEach((junction, i) => {
    const through = junction.through;
    if (i === 0) {
      const lead = dist(points[0], through[0]);
      offset = lead;
      points.push(...through);
    } else {
      const last = points[points.length - 1];
      const lead = dist(last, through[0]);
      offset += lead;
      points.push(...through);
    }
    markJunction(run, junction, offset);
    offset += measure(through).length;
  });
  run.route = measure(points);
};

const ensureAhead = (run) => {
  const current = currentJunction(run);
  const ahead = run.junctions.filter((j) => j.index > current.index).length;
  if (ahead < 2) {
    const last = run.junctions[run.junctions.length - 1];
    run.junctions.push(createJunction(run.rng, run.level, last));
    rebuildRoute(run);
  }
};

/** The junction you are approaching or inside. */
export const currentJunction = (run) =>
  run.junctions.find((j) => !j.passed && !j.crashed) || run.junctions[run.junctions.length - 1];

/** Schedule the other vehicles of a junction against your expected arrival. */
const schedule = (run, junction) => {
  const { scene, resolution } = junction;
  const arriveAt = run.now + ((junction.sWait - run.s) / run.speed) * 1000;
  const clearAt = arriveAt + DECISION_MARGIN_MS;
  const groups = resolution.order;
  const byId = Object.fromEntries(scene.vehicles.map((v) => [v.id, v]));
  // Last blocking group clears at clearAt; earlier groups one gap earlier each.
  let groupStart = clearAt;
  for (let k = junction.youGroup - 1; k >= 0; k--) {
    let longest = 0;
    for (const id of groups[k]) longest = Math.max(longest, durationOf(byId[id]) * CLEAR_FRACTION);
    const start = Math.max(run.now, groupStart - longest);
    for (const id of groups[k]) junction.starts[id] = start;
    groupStart = start - (GROUP_GAP_MS - longest) ;
  }
  let clearAtReal = -Infinity;
  for (const id of junction.blockers) {
    const start = junction.starts[id];
    if (start === null) continue;
    clearAtReal = Math.max(clearAtReal, start + durationOf(byId[id]) * CLEAR_FRACTION);
  }
  junction.arriveAt = arriveAt;
  junction.clearAt = junction.blockers.length ? clearAtReal : run.now;
  junction.t0 = run.now;
  junction.scheduled = true;
};

const startFollowers = (run, junction, from) => {
  const groups = junction.resolution.order;
  let t = from;
  for (let k = junction.youGroup; k < groups.length; k++) {
    for (const id of groups[k]) if (id !== 'you' && junction.starts[id] === null) junction.starts[id] = t;
    t += GROUP_GAP_MS;
  }
};

/** Player input: 'brake' | 'go' | null. */
export const applyInput = (run, input) => {
  if (run.over || run.now < run.crashUntil) return;
  const junction = currentJunction(run);
  if (input === 'brake') {
    if (run.s < junction.sLine && run.stoppedAt === null) run.braking = true;
  } else if (input === 'go') {
    if (run.stoppedAt !== null) {
      if (junction.blockers.length && run.now < junction.clearAt) {
        crash(run, junction, culpritOf(junction));
      } else {
        const early = junction.resumeAt !== null && run.now < junction.resumeAt;
        junction.earlyResume = early;
        run.stoppedAt = null;
        junction.resumeAt = null;
      }
    }
  }
};

const culpritOf = (junction) => {
  const byId = Object.fromEntries(junction.scene.vehicles.map((v) => [v.id, v]));
  let culprit = null;
  let latest = -1;
  for (const id of junction.blockers) {
    const start = junction.starts[id];
    if (start === null) continue;
    const clears = start + durationOf(byId[id]) * CLEAR_FRACTION;
    if (clears > latest) {
      latest = clears;
      culprit = id;
    }
  }
  return culprit;
};

const crash = (run, junction, culprit) => {
  junction.crashed = true;
  junction.culprit = culprit;
  run.lives -= 1;
  run.streak = 0;
  run.crashUntil = run.now + CRASH_PAUSE_MS;
  run.stoppedAt = null;
  run.braking = false;
  const reason = junction.resolution.reasons.find((r) => r.who === 'you' && r.to === culprit);
  run.events.push({ type: 'crash', junction: junction.index, culprit, rule: reason ? reason.rule : null });
  if (run.lives <= 0) run.over = true;
};

const passJunction = (run, junction) => {
  junction.passed = true;
  run.passed += 1;
  const base = 100 + (run.level - 1) * 15;
  const bonus = junction.earlyResume ? 60 : 0;
  const multiplier = Math.min(2, 1 + 0.1 * run.streak);
  const points = junction.hesitated ? 0 : Math.round((base + bonus) * multiplier);
  run.score += points;
  run.streak = junction.hesitated ? 0 : run.streak + 1;
  run.events.push({ type: 'passed', junction: junction.index, points, hesitated: junction.hesitated, early: Boolean(junction.earlyResume) });
  if (run.passed % JUNCTIONS_PER_LEVEL === 0) {
    run.level += 1;
    run.speed = speedFor(run.level);
    run.events.push({ type: 'level', level: run.level });
  }
};

/**
 * Advance the run to time `now` (ms). Returns the events raised since the
 * last step and clears them.
 */
export const step = (run, now) => {
  const dt = Math.max(0, Math.min(100, now - run.now));
  run.now = now;
  if (run.over) return run.events.splice(0);

  ensureAhead(run);
  const junction = currentJunction(run);
  if (!junction.scheduled && junction.sWait - run.s < run.speed * 6) schedule(run, junction);

  if (now < run.crashUntil) {
    return run.events.splice(0);
  }
  // After a crash you continue from the far side of the junction.
  const crashedHere = run.junctions.find((j) => j.crashed && !j.passed && j.index < junction.index);
  if (crashedHere) crashedHere.passed = true;

  // Movement
  if (run.stoppedAt !== null) {
    // Stopped at the line: resume automatically after the way is clear.
    if (junction.resumeAt !== null && now >= junction.resumeAt) {
      run.stoppedAt = null;
      junction.resumeAt = null;
    }
  } else {
    let next = run.s + (run.speed * dt) / 1000;
    if (run.braking && next >= junction.sWait && run.s < junction.sLine) {
      next = junction.sWait;
      run.stoppedAt = next;
      run.braking = false;
      junction.stopped = true;
      const needless = junction.blockers.length === 0 || now >= junction.clearAt;
      if (needless) {
        junction.hesitated = true;
        junction.resumeAt = now + HONK_MS;
        run.events.push({ type: 'hesitated', junction: junction.index });
      } else {
        junction.resumeAt = junction.clearAt + REACTION_MS;
      }
    }
    run.s = next;
  }

  // Entering the box while a blocker is still crossing is a crash.
  if (run.s >= junction.sLine && !junction.crashed && !junction.passed) {
    if (junction.blockers.length && now < junction.clearAt) {
      run.s = junction.sLine;
      crash(run, junction, culpritOf(junction));
      return run.events.splice(0);
    }
    if (junction.starts.you === null) {
      junction.starts.you = now;
      startFollowers(run, junction, now + 400);
    }
  }
  if (run.s >= junction.sExitBox && !junction.passed && !junction.crashed) {
    passJunction(run, junction);
    ensureAhead(run);
  }

  return run.events.splice(0);
};

/** Your world pose now. */
export const youPose = (run) => pointAtDistance(run.route, run.s);

/** World poses of the other vehicles in the junctions near you. */
export const vehiclePoses = (run) => {
  const out = [];
  const me = youPose(run);
  for (const junction of run.junctions) {
    if (Math.hypot(junction.cx - me.x, junction.cy - me.y) > SPACING * 1.6) continue;
    for (const v of junction.scene.vehicles) {
      if (v.id === 'you') continue;
      const start = junction.scheduled ? junction.starts[v.id] : null;
      const local = poseAt(junction.scene, v, start, junction.scheduled ? run.now - junction.t0 : 0, junction.pathCache);
      if (!local) continue;
      const w = toWorld(junction, local);
      out.push({ junction, vehicle: v, pose: { x: w.x, y: w.y, angle: (local.angle + junction.rot) % 360 } });
    }
  }
  return out;
};

/** Junctions worth drawing. */
export const visibleJunctions = (run) => {
  const me = youPose(run);
  return run.junctions.filter((j) => Math.hypot(j.cx - me.x, j.cy - me.y) < SPACING * 1.6);
};

/**
 * The app or tab was in the background for `delta` ms: move every absolute
 * timestamp forward so the pause is not counted against the player.
 */
export const shiftTime = (run, delta) => {
  run.now += delta;
  run.crashUntil += delta;
  for (const j of run.junctions) {
    if (!j.scheduled) continue;
    j.t0 += delta;
    j.arriveAt += delta;
    j.clearAt += delta;
    if (j.resumeAt !== null) j.resumeAt += delta;
    for (const id of Object.keys(j.starts)) if (j.starts[id] !== null) j.starts[id] += delta;
  }
};
