import { resolve } from './engine';
import { generatePlayable } from './generator';
import { leftOf, rightOf, oppositeOf, turnOf } from './geometry';
import { clearFractionFor } from './conflict';
import {
  EXIT_HEADING, CENTER, RING_R, ROAD_HALF, SIZE, WAIT, vehiclePath, approachPoint,
  ringArc, ringEntryPoints, ringExitOrder, ringJoinDeg, ringLeaveDeg, exitCurveFor,
} from './layout';
import { queueBackFor } from './queue';
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

export const SPACING = 180;            // smallest distance between junction centres
export const MAX_SPACING = 320;
export const SECONDS_BETWEEN = 7.5;    // junction spacing grows with speed so this much time stays between lines
export const LEAD_ROAD = 160;          // open road before the first junction of a run
export const CAMERA_Y = 74;            // where your car sits on screen (viewBox y)
export const BASE_SPEED = 20;          // units per second at level 1
export const SPEED_STEP = 1.8;
export const MAX_SPEED = 44;
export const SCHEDULE_AHEAD_S = 7;     // a junction is scheduled (and announced) this many seconds before its line
export const DECISION_MARGIN_MS = 1000; // level 1: the last blocker clears this long after you would arrive
export const DECISION_MARGIN_MIN_MS = 600;
export const DECISION_MARGIN_STEP_MS = 60;
export const LIGHTS_MARGIN_FACTOR = 2.2; // a red light holds you longer than a crossing car
export const ROLL_IN_MS = 2500;         // a vehicle with priority is seen rolling in this long before it crosses
export const ALL_RED_MS = 700;          // both sides red between the cross traffic clearing and your green
export const LIGHT_CHANGE_MS = 800;    // red+yellow before green; yellow before red
export const LIGHT_YELLOW_LEAD_MS = 1500; // the side losing green goes yellow this long before the other side's green
export const EARLY_BONUS_MS = 700;     // moving off within this after the way clears earns the bonus
export const LATE_MS = 2600;           // waiting longer than this after the way clears is a late penalty
export const CRASH_PAUSE_MS = 1400;
export const JUNCTIONS_PER_LEVEL = 4;
export const LIVES = 3;
export const COACH_JUNCTIONS = 3;     // slower junctions on a first run
export const COACH_SPEED = 0.6;
export const ACCEL = 14;               // units/s² when moving off or speeding up
export const DECEL = 12;               // the final braking curve into the line
export const SOFT_DECEL = 6;           // the immediate, gentle slow-down when you swipe to stop
export const HARD_DECEL = 40;          // a late swipe brakes this hard
export const CREEP = 0.6;              // after the swipe the car rolls on at this share of cruise speed until the line is near

export const speedFor = (level, coachActive = false) =>
  Math.min(MAX_SPEED, BASE_SPEED + (level - 1) * SPEED_STEP) * (coachActive ? COACH_SPEED : 1);

/** Distance between junction centres at a level: faster levels get longer roads, so reaction time holds. */
export const spacingFor = (level) => Math.max(SPACING, Math.min(MAX_SPACING, Math.round(speedFor(level) * SECONDS_BETWEEN)));

/** How long after your unbraked arrival the last blocker clears; shrinks with the level. */
export const decisionMarginFor = (level) => Math.max(DECISION_MARGIN_MIN_MS, DECISION_MARGIN_MS - (level - 1) * DECISION_MARGIN_STEP_MS);

/** Arm a swipe direction points at, for a car arriving on S. */
export const armForIntent = (intent) => (intent === 'left' ? leftOf('S') : intent === 'right' ? rightOf('S') : oppositeOf('S'));

/**
 * The instructor's direction for a junction, phrased from the movement the
 * generator chose. "main" (follow the main road) is used when the main road
 * carries on where you are going, so the player has to read the panel.
 */
const instructionFor = (rng, scene, to) => {
  const straight = oppositeOf('S');
  const turn = to === straight ? 'straight' : to === leftOf('S') ? 'left' : 'right';
  if (scene.layout === 'roundabout') return { kind: 'roundabout', turn, to };
  const onMain = scene.mainRoad && scene.mainRoad.includes('S') && scene.mainRoad.includes(to);
  if (onMain && rng() < 0.6) return { kind: 'main', turn, to };
  // Straight on is the default and goes unsaid; the instructor only speaks
  // for a turn, or when the main road you are on bends away and "straight"
  // means leaving it (as an examiner would).
  const mainBendsAway = scene.mainRoad && scene.mainRoad.includes('S') && !scene.mainRoad.includes(to);
  if (turn === 'straight') return { kind: mainBendsAway ? 'straight' : 'none', turn, to };
  return { kind: turn, turn, to };
};

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
const placeAfter = (prev, scene, spacing) => {
  const you = prev.scene.vehicles.find((v) => v.id === 'you');
  const exitHeading = (prev.rot + EXIT_HEADING[you.to]) % 360; // world heading after leaving prev
  const dir = { x: Math.sin(rad(exitHeading)), y: -Math.cos(rad(exitHeading)) };
  // Walk along the road axis (not the lane) so the two frames share a centre line.
  const axisLocal = { N: { x: CENTER, y: 0 }, E: { x: SIZE, y: CENTER }, S: { x: CENTER, y: SIZE }, W: { x: 0, y: CENTER } }[you.to];
  const exitWorld = toWorld(prev, axisLocal);
  const gap = spacing - 2 * CENTER;
  const rot = exitHeading;
  // The next junction's S arm end sits `gap` beyond this arm end; its centre CENTER further.
  const centre = { x: exitWorld.x + dir.x * (gap + CENTER), y: exitWorld.y + dir.y * (gap + CENTER) };
  prev.gapAfter = gap;
  return { scene, cx: centre.x, cy: centre.y, rot, gapBefore: gap, gapAfter: gap };
};

/** Your route through a junction in world coordinates (wait line to exit arm end). */
const throughWorld = (junction) => {
  if (junction.ring) return junction.ring.path.map((p) => toWorld(junction, p));
  const you = junction.scene.vehicles.find((v) => v.id === 'you');
  const path = vehiclePath(junction.scene, you);
  return path.through.map((p) => toWorld(junction, p));
};

/**
 * Roundabout state for your car: you join the ring and keep circling; a
 * right swipe arms the blinker and you leave at the next exit. `path` is
 * the local polyline driven so far (wait line, entry bend, ring arcs, and
 * the exit bend once chosen); it grows one exit at a time.
 */
const createRing = () => {
  const order = ringExitOrder('S');
  const joinDeg = ringJoinDeg('S');
  const first = ringLeaveDeg(order[0]);
  const wait = approachPoint('S', RING_R + WAIT);
  const entry = ringEntryPoints('S');
  return {
    order,
    next: 0,          // index into order of the exit whose decision point comes next
    armed: false,     // right blinker on: leave at the next exit
    exitTo: null,     // arm chosen, once you are on the exit bend
    laps: 0,
    lastDeg: first,
    path: [wait, ...entry, ...ringArc(joinDeg, first).slice(1)],
  };
};

/** Extend the ring path past the next decision point: leave, or carry on round. */
const advanceRing = (run, junction) => {
  const ring = junction.ring;
  const arm = ring.order[ring.next];
  if (ring.armed) {
    ring.exitTo = arm;
    const exit = exitCurveFor(arm);
    ring.path = [...ring.path, ...exit.points.slice(1)];
    junction.executedTo = arm;
    const you = junction.scene.vehicles.find((v) => v.id === 'you');
    if (you.to !== arm) setYourMovement(run, junction, arm, true);
    else {
      junction.through = throughWorld(junction);
      rebuildRoute(run);
    }
    run.events.push({ type: 'ringExit', junction: junction.index, to: arm });
    return;
  }
  ring.next = (ring.next + 1) % ring.order.length;
  if (ring.next === 0) ring.laps += 1;
  const to = ringLeaveDeg(ring.order[ring.next]);
  ring.path = [...ring.path, ...ringArc(ring.lastDeg, to).slice(1)];
  ring.lastDeg = to;
  junction.through = throughWorld(junction);
  rebuildRoute(run);
};

/**
 * Milliseconds after its start when a vehicle has cleared your way at this
 * junction. Vehicles whose path never meets yours (priority by rule only,
 * e.g. the exam's right-turn convention) use the flat fraction and are
 * remembered in `junction.conflicts` as false: you can cut in on them, but
 * never hit them.
 */
const clearMsOf = (junction, id) => {
  if (junction.clearMs[id] === undefined) {
    const byId = Object.fromEntries(junction.scene.vehicles.map((v) => [v.id, v]));
    const fraction = clearFractionFor(junction.scene, byId[id], byId.you);
    junction.conflicts[id] = fraction !== null;
    junction.clearMs[id] = durationOf(byId[id]) * (fraction === null ? CLEAR_FRACTION : fraction);
  }
  return junction.clearMs[id];
};

/** The blocker among `ids` that clears your way last, or null. */
const latestOf = (junction, ids) => {
  let culprit = null;
  let latest = -1;
  for (const id of ids) {
    const start = junction.starts[id];
    if (start === null) continue;
    const clears = start + clearMsOf(junction, id);
    if (clears > latest) {
      latest = clears;
      culprit = id;
    }
  }
  return culprit;
};

/** Vehicles on the arms whose light is red in the scene (the cross phase). */
export const crossIdsOf = (scene) =>
  scene.control?.type === 'lights'
    ? scene.vehicles.filter((v) => v.id !== 'you' && scene.control.arms?.[v.from] === 'red').map((v) => v.id)
    : [];

const applyResolution = (junction) => {
  const { scene } = junction;
  const resolution = resolve(scene);
  junction.resolution = resolution;
  // Traffic lights cycle in the runner. The scene encodes the phase in which
  // you go (your arms green, the cross arms red), and the engine sorts out
  // that phase; the cross-arm vehicles get their own green either before you
  // (`crossFirst`) or after you.
  const cross = crossIdsOf(scene);
  if (cross.length) {
    const yourOrder = resolution.order.filter((g) => g.length);
    if (scene.control.crossFirst) {
      resolution.order = [cross, ...yourOrder];
      resolution.yields.you = [...(resolution.yields.you || []), ...cross];
      for (const id of cross) resolution.reasons.push({ who: 'you', to: id, rule: 'signal' });
    } else {
      resolution.order = [...yourOrder, cross];
      for (const id of cross) resolution.reasons.push({ who: id, to: 'you', rule: 'signal' });
    }
  }
  const group = resolution.order.findIndex((g) => g.includes('you'));
  // A player-chosen movement can deadlock the junction (the generator only
  // guarantees the instructed one). Then you simply go last and everyone
  // with priority over you is sent off first.
  junction.youGroup = group >= 0 ? group : resolution.order.length;
  junction.blockers = (resolution.yields.you || []).filter((id) => scene.vehicles.some((v) => v.id === id));
  junction.clearMs = {};
  junction.conflicts = {};
  // Vehicles sharing an arm queue behind each other in the order they go.
  junction.queueBack = Object.fromEntries(scene.vehicles.map((v) => [v.id, queueBackFor(scene, resolution.order, v.id)]));
};

const createJunction = (rng, level, prev) => {
  const scene = generatePlayable(rng, level);
  const you = scene.vehicles.find((v) => v.id === 'you');
  const junction = prev
    ? placeAfter(prev, scene, spacingFor(level))
    : { scene, cx: CENTER, cy: CENTER, rot: 0, gapBefore: LEAD_ROAD, gapAfter: spacingFor(level) - 2 * CENTER };
  junction.instruction = instructionFor(rng, scene, you.to);
  // The car goes straight unless the player turns; where there is no
  // straight ahead the frame is placed as if the instruction is followed.
  const straight = oppositeOf('S');
  // In a roundabout you circle until you leave; the road ahead is laid out
  // along the instructed exit.
  you.to = scene.layout === 'roundabout' ? junction.instruction.to : scene.arms.includes(straight) ? straight : junction.instruction.to;
  junction.ring = scene.layout === 'roundabout' ? createRing() : null;
  junction.executedTo = null;
  junction.needTurn = false;
  junction.late = false;
  junction.ranRed = false;
  junction.ranStop = false;
  junction.cutIn = null;
  junction.stoppedAtTime = null;
  junction.resumedAt = null;
  applyResolution(junction);
  junction.index = prev ? prev.index + 1 : 0;
  junction.starts = Object.fromEntries(scene.vehicles.map((v) => [v.id, null]));
  junction.scheduled = false;
  junction.passed = false;
  junction.crashed = false;
  junction.stopped = false;
  junction.hesitated = false;
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
  junction.sEnd = routeOffset + throughMeasured.length;           // exit arm end
  // Roughly leaving the box; on a roundabout that is the exit bend, so the
  // whole ring counts as this junction and you never "pass" it while circling.
  junction.sExitBox = junction.ring
    ? (junction.ring.exitTo ? junction.sEnd - (CENTER - RING_R - 6) : Infinity)
    : routeOffset + (WAIT + 1) + ROAD_HALF * 2;
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
    route: measure([approachPoint('S', CENTER + LEAD_ROAD), approachPoint('S', ROAD_HALF + WAIT)]), // placeholder
    s: 0,               // your distance along the route
    v: 0,               // current speed (units/s); eases towards `speed`
    brakeLights: false,
    speed: speedFor(level, false),
    coach: false,
    intent: null,
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
  const points = [approachPoint('S', CENTER + LEAD_ROAD)]; // open road before the first junction
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
  const clearAt = arriveAt + decisionMarginFor(run.level) * (scene.control?.type === 'lights' ? LIGHTS_MARGIN_FACTOR : 1);
  const groups = resolution.order;
  // Last blocking group clears at clearAt; earlier groups one gap earlier each.
  let groupStart = clearAt;
  for (let k = junction.youGroup - 1; k >= 0; k--) {
    let longest = 0;
    for (const id of groups[k]) longest = Math.max(longest, clearMsOf(junction, id));
    const start = Math.max(run.now, groupStart - longest);
    for (const id of groups[k]) junction.starts[id] = start;
    groupStart = start - (GROUP_GAP_MS - longest) ;
  }
  let clearAtReal = -Infinity;
  for (const id of junction.blockers) {
    const start = junction.starts[id];
    if (start === null) continue;
    clearAtReal = Math.max(clearAtReal, start + clearMsOf(junction, id));
  }
  // Vehicles scheduled to cross before you roll in just before they do;
  // anything that waits at its line first (followers, and a blocker left
  // out by a deadlock) stays put, no jumping back.
  junction.rollIn = Object.fromEntries(scene.vehicles.map((v) => [v.id, junction.starts[v.id] !== null ? ROLL_IN_MS : 0]));
  junction.arriveAt = arriveAt;
  junction.clearAt = junction.blockers.length ? clearAtReal : run.now;
  junction.t0 = run.now;
  junction.scheduled = true;
};

const startFollowers = (run, junction, from) => {
  const groups = junction.resolution.order;
  let t = from;
  for (let k = junction.youGroup; k < groups.length; k++) {
    for (const id of groups[k] || []) if (id !== 'you' && junction.starts[id] === null) junction.starts[id] = t;
    t += GROUP_GAP_MS;
  }
  // Vehicles left out of the order by a deadlock still cross, after you.
  for (const id of Object.keys(junction.starts)) if (id !== 'you' && junction.starts[id] === null) junction.starts[id] = t;
};

/**
 * Change where you will go at the junction ahead. Re-resolves priority for
 * the new movement, moves any vehicle that now has priority over you off at
 * once, and re-places the junctions after this one along the new exit.
 */
const setYourMovement = (run, junction, to, keepStarts = false) => {
  const you = junction.scene.vehicles.find((v) => v.id === 'you');
  if (!junction.scene.arms.includes(to) || you.to === to) return false;
  you.to = to;
  const previousBlockers = new Set(junction.blockers);
  applyResolution(junction);
  junction.through = throughWorld(junction);
  if (junction.scheduled && !keepStarts) {
    let clearAt = run.now;
    for (const id of junction.blockers) {
      if (junction.starts[id] === null) junction.starts[id] = run.now; // it goes before you: now
      clearAt = Math.max(clearAt, junction.starts[id] + clearMsOf(junction, id));
    }
    junction.clearAt = junction.blockers.length ? clearAt : run.now;
    // Followers that lost their start keep it; nothing else changes.
    for (const id of previousBlockers) if (!junction.blockers.includes(id) && junction.starts[id] === null) junction.starts[id] = null;
  }
  // Everything after this junction depends on where you leave it.
  run.junctions = run.junctions.filter((j) => j.index <= junction.index);
  rebuildRoute(run);
  ensureAhead(run);
  return true;
};

/**
 * Move off from the line. Never a crash by itself: the car needs a moment
 * to reach the box, and the box is where a still-crossing vehicle is hit.
 * Crossing the stop line on red is the red-light offence, though.
 */
const moveOff = (run, junction) => {
  if (redFor(junction, run.now) && !junction.ranRed) {
    junction.ranRed = true;
    run.streak = 0;
    run.events.push({ type: 'redLight', junction: junction.index });
  }
  const readyAt = readyAtOf(junction);
  const early = run.now <= readyAt + EARLY_BONUS_MS;
  junction.earlyResume = early && !junction.hesitated;
  junction.resumedAt = run.now;
  run.stoppedAt = null;
  run.events.push({ type: 'resumed', junction: junction.index, early });
};

/** Player input: 'brake' | 'go' | 'left' | 'right' | null. */
export const applyInput = (run, input) => {
  if (run.over || run.now < run.crashUntil) return;
  const junction = currentJunction(run);
  if (input === 'left' || input === 'right') {
    if (junction.ring) {
      // Roundabout: right arms the blinker for the next exit, left keeps you circling.
      if (junction.ring.exitTo) return;
      const armed = input === 'right';
      if (junction.ring.armed !== armed) {
        junction.ring.armed = armed;
        run.intent = armed ? 'right' : null;
        run.events.push({ type: 'intent', junction: junction.index, intent: run.intent, to: armed ? junction.ring.order[junction.ring.next] : null });
      }
      // Signalling from the line also means: go.
      if (armed && run.stoppedAt !== null) moveOff(run, junction);
      return;
    }
    if (run.s >= junction.sLine || junction.starts.you !== null) return;
    const next = run.intent === input ? null : input;
    const to = armForIntent(next);
    if (!junction.scene.arms.includes(to)) return; // no such arm here
    run.intent = next;
    setYourMovement(run, junction, to);
    run.events.push({ type: 'intent', junction: junction.index, intent: next, to });
    // A car waiting for a direction moves off again, even when the chosen
    // arm is the one the frame already assumed.
    if (junction.needTurn) junction.needTurn = false;
    // Choosing a direction while standing at the line also means: go.
    if (run.stoppedAt !== null && next !== null) moveOff(run, junction);
    return;
  }
  if (input === 'brake') {
    if (run.s < junction.sLine && run.stoppedAt === null) run.braking = true;
  } else if (input === 'go') {
    if (run.stoppedAt === null && run.braking) {
      run.braking = false; // changed your mind before the line
      return;
    }
    if (run.stoppedAt !== null) {
      if (junction.needTurn) return; // choose a direction first
      moveOff(run, junction);
    }
  }
};

/**
 * Your indicator right now: the turn you have set while approaching, the
 * turn you are making inside the box, or the right blinker while you
 * signal out of a roundabout, up to the end of the exit bend.
 */
export const youSignalFor = (run) => {
  // After a crash you still drive through that junction's turn.
  const crashed = run.junctions.find((j) => j.crashed && !j.passed && run.s < j.sExitBox);
  if (crashed) {
    if (crashed.ring) return run.s < crashed.sEnd - (CENTER - RING_R) ? 'right' : null;
    const you = crashed.scene.vehicles.find((v) => v.id === 'you');
    const turn = turnOf('S', crashed.executedTo || you.to);
    return turn === 'left' || turn === 'right' ? turn : null;
  }
  const junction = currentJunction(run);
  if (junction.ring) {
    if (junction.ring.exitTo) return run.s < junction.sEnd - (CENTER - RING_R) ? 'right' : null;
    return junction.ring.armed ? 'right' : null;
  }
  if (run.s >= junction.sLine) {
    const you = junction.scene.vehicles.find((v) => v.id === 'you');
    const turn = turnOf('S', junction.executedTo || you.to);
    return turn === 'left' || turn === 'right' ? turn : null;
  }
  return run.intent === 'left' || run.intent === 'right' ? run.intent : null;
};

/**
 * Traffic-light timing of a junction. Your arms and the cross arms take turns:
 * whichever side goes first is green from the moment the junction is
 * scheduled; the other side gets its green when the first side has cleared.
 * Returns null when the junction has no lights.
 */
export const lightPlan = (junction) => {
  const control = junction.scene.control;
  if (!control || control.type !== 'lights' || !junction.scheduled) return null;
  const cross = crossIdsOf(junction.scene);
  const yourArms = Object.keys(control.arms || {}).filter((a) => control.arms[a] !== 'red');
  const crossArms = Object.keys(control.arms || {}).filter((a) => control.arms[a] === 'red');
  if (control.crossFirst && cross.length) {
    return { yourArms, crossArms, yourGreenAt: junction.clearAt + ALL_RED_MS, crossGreenAt: junction.t0, next: 'you' };
  }
  const crossStarts = cross.map((id) => junction.starts[id]).filter((t) => t !== null);
  const crossGreenAt = crossStarts.length ? Math.min(...crossStarts) : null;
  return { yourArms, crossArms, yourGreenAt: junction.t0, crossGreenAt, next: 'cross' };
};

const phaseOf = (greenAt, loseAt, now) => {
  if (greenAt === null) return 'red';
  if (now < greenAt - LIGHT_CHANGE_MS) return 'red';
  if (now < greenAt) return 'redyellow';
  if (loseAt === null || now < loseAt - LIGHT_YELLOW_LEAD_MS) return 'green';
  if (now < loseAt - LIGHT_YELLOW_LEAD_MS + LIGHT_CHANGE_MS) return 'yellow';
  return 'red';
};

/** Colour per arm right now: 'red' | 'redyellow' | 'green' | 'yellow'. Null without lights. */
export const lightState = (junction, now) => {
  const plan = lightPlan(junction);
  if (!plan) return null;
  const state = {};
  const yourLose = plan.next === 'cross' ? plan.crossGreenAt : null;
  const crossLose = plan.next === 'you' ? plan.yourGreenAt : null;
  // The side that is green from the start was green before too: no red+yellow lead-in for it.
  const yourPhase = plan.yourGreenAt === junction.t0 && now < junction.t0 + LIGHT_CHANGE_MS ? 'green' : phaseOf(plan.yourGreenAt, yourLose, now);
  const crossPhase = plan.crossGreenAt === junction.t0 && now < junction.t0 + LIGHT_CHANGE_MS ? 'green' : phaseOf(plan.crossGreenAt, crossLose, now);
  for (const a of plan.yourArms) state[a] = yourPhase;
  for (const a of plan.crossArms) state[a] = crossPhase;
  return state;
};

/** A STOP sign on your arm: you must come to a halt at the line whatever the traffic. */
const stopSignFor = (junction) => {
  const sign = junction.scene.signs?.S;
  return sign === 'stop' || sign === 'roundabout-stop';
};

/** True while your light forbids entering the box. */
const redFor = (junction, now) => {
  const state = lightState(junction, now);
  if (!state) return false;
  const mine = state.S;
  return mine === 'red' || mine === 'redyellow';
};

/** When you may move off: the last blocker gone, your light green, or the moment you stopped. */
const readyAtOf = (junction) => {
  const plan = lightPlan(junction);
  let ready = junction.blockers.length ? junction.clearAt : junction.stoppedAtTime;
  if (plan && plan.yourGreenAt !== null) ready = Math.max(ready ?? 0, plan.yourGreenAt);
  return ready;
};

/** Blockers whose path really crosses yours and who are still on it at `now`. */
const stillCrossing = (junction, now) =>
  junction.blockers.filter((id) => {
    const start = junction.starts[id];
    return start !== null && now < start + clearMsOf(junction, id) && junction.conflicts[id];
  });

/** The scene's lights as they were when you had to decide: red for you when the cross traffic went first. */
const recordControl = (scene) => {
  const control = scene.control;
  if (!control || control.type !== 'lights' || !control.crossFirst) return control;
  const arms = Object.fromEntries(Object.entries(control.arms || {}).map(([arm, c]) => [arm, c === 'red' ? 'green' : 'red']));
  return { ...control, arms };
};

/**
 * What happened at a junction and why, for the drive log. `reasons` keeps
 * every rule that involved you, in both directions, so the log can say
 * both "you had to give way to the red car (right-hand rule)" and "the blue
 * car had to give way to you".
 */
export const junctionRecord = (run, junction, outcome) => {
  const you = junction.scene.vehicles.find((v) => v.id === 'you');
  const reasons = junction.resolution.reasons.filter((r) => r.who === 'you' || r.to === 'you');
  return {
    index: junction.index,
    level: run.level,
    outcome, // 'clean' | 'crash' | 'spoiled'
    crashed: Boolean(junction.crashed),
    culprit: junction.culprit || null,
    rule: junction.crashRule || null,
    hesitated: Boolean(junction.hesitated),
    late: Boolean(junction.late),
    ranRed: Boolean(junction.ranRed),
    ranStop: Boolean(junction.ranStop),
    cutIn: junction.cutIn || null,
    stopSign: stopSignFor(junction),
    lights: junction.scene.control?.type === 'lights' ? (junction.scene.control.crossFirst ? 'cross-first' : 'you-first') : null,
    laps: junction.ring ? junction.ring.laps : 0,
    wrongWay: Boolean(junction.wrongWay),
    stopped: Boolean(junction.stopped),
    points: junction.points || 0,
    instruction: junction.instruction,
    executedTo: junction.executedTo || you.to,
    blockers: [...junction.blockers],
    order: junction.resolution.order,
    reasons,
    scene: {
      layout: junction.scene.layout,
      arms: junction.scene.arms,
      signs: junction.scene.signs,
      mainRoad: junction.scene.mainRoad,
      tramTracks: junction.scene.tramTracks,
      control: recordControl(junction.scene),
      vehicles: junction.scene.vehicles.map((v) => ({ id: v.id, kind: v.kind, color: v.color, from: v.from, to: v.to })),
      pedestrians: junction.scene.pedestrians,
    },
  };
};

/** After a crash at a roundabout entry the car still drives round to the instructed exit. */
const completeRing = (run, junction) => {
  const ring = junction.ring;
  if (!ring || ring.exitTo) return;
  const target = junction.instruction.to;
  let guard = 0;
  while (ring.order[ring.next] !== target && guard++ < 4) {
    ring.next = (ring.next + 1) % ring.order.length;
    const to = ringLeaveDeg(ring.order[ring.next]);
    ring.path = [...ring.path, ...ringArc(ring.lastDeg, to).slice(1)];
    ring.lastDeg = to;
  }
  ring.exitTo = target;
  ring.path = [...ring.path, ...exitCurveFor(target).points.slice(1)];
  junction.executedTo = target;
  junction.through = throughWorld(junction);
  rebuildRoute(run);
};

const crash = (run, junction, culprit) => {
  junction.crashed = true;
  junction.culprit = culprit;
  completeRing(run, junction);
  run.lives -= 1;
  run.streak = 0;
  run.crashUntil = run.now + CRASH_PAUSE_MS;
  run.stoppedAt = null;
  run.braking = false;
  run.brakeLights = true;
  run.intent = null; // the swipe was for this junction; it must not linger into the next
  run.v = 0;
  const reason = junction.resolution.reasons.find((r) => r.who === 'you' && r.to === culprit);
  junction.crashRule = reason ? reason.rule : null;
  run.events.push({ type: 'crash', junction: junction.index, culprit, rule: junction.crashRule, record: junctionRecord(run, junction, 'crash') });
  if (run.lives <= 0) run.over = true;
};

const passJunction = (run, junction) => {
  junction.passed = true;
  run.passed += 1;
  const wrongWay = (junction.executedTo !== null && junction.executedTo !== junction.instruction.to) || Boolean(junction.ring && junction.ring.laps > 0);
  const base = 100 + (run.level - 1) * 15;
  const bonus = junction.earlyResume ? 60 : 0;
  const multiplier = Math.min(2, 1 + 0.1 * run.streak);
  const spoiled = junction.hesitated || wrongWay || junction.late || junction.ranRed || junction.ranStop || Boolean(junction.cutIn);
  const points = spoiled ? 0 : Math.round((base + bonus) * multiplier);
  junction.wrongWay = wrongWay;
  junction.points = points;
  run.score += points;
  run.streak = spoiled ? 0 : run.streak + 1;
  if (wrongWay) run.events.push({ type: 'wrongWay', junction: junction.index, instruction: junction.instruction, executed: junction.executedTo });
  run.events.push({
    type: 'passed', junction: junction.index, points, hesitated: junction.hesitated, wrongWay, late: junction.late, ranRed: junction.ranRed, ranStop: junction.ranStop, cutIn: junction.cutIn,
    early: Boolean(junction.earlyResume), record: junctionRecord(run, junction, spoiled ? 'spoiled' : 'clean'),
  });
  if (run.passed % JUNCTIONS_PER_LEVEL === 0) {
    run.level += 1;
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
  run.speed = speedFor(run.level, run.coach && run.passed < COACH_JUNCTIONS);
  if (!junction.scheduled && junction.sWait - run.s < run.speed * SCHEDULE_AHEAD_S) {
    schedule(run, junction);
    run.events.push({ type: 'instruction', junction: junction.index, ...junction.instruction, blockers: [...junction.blockers], stopSign: stopSignFor(junction) });
  }

  if (now < run.crashUntil) {
    return run.events.splice(0);
  }
  // After a crash you continue from the far side of the junction.
  const crashedHere = run.junctions.find((j) => j.crashed && !j.passed && j.index < junction.index);
  if (crashedHere) crashedHere.passed = true;

  // Movement
  if (run.stoppedAt !== null) {
    // Stopped at the line: only a swipe moves the car off again. Waiting
    // long after the way is clear counts as holding up traffic, once.
    const readyAt = readyAtOf(junction);
    if (!junction.needTurn && !junction.late && now > readyAt + LATE_MS) {
      junction.late = true;
      run.streak = 0;
      run.events.push({ type: 'late', junction: junction.index });
    }
  } else {
    // Speed eases: accelerate towards the cruise speed, and when a stop at
    // the line is due follow a braking curve that ends there. A late swipe
    // brakes harder.
    const straight = oppositeOf('S');
    const beforeLine = run.s < junction.sLine;
    const noStraight = !junction.ring && !junction.scene.arms.includes(straight) && run.intent === null && !junction.needTurn;
    const mustStop = beforeLine && (run.braking || noStraight);
    let target = run.speed;
    let rate = ACCEL;
    if (mustStop) {
      // React at once: slow to a creep, then follow the curve into the line.
      const curve = Math.sqrt(2 * DECEL * Math.max(0, junction.sWait - run.s));
      target = Math.min(target, Math.max(4, run.speed * CREEP), curve);
      rate = run.v > curve ? HARD_DECEL : SOFT_DECEL;
    } else if (target < run.v) {
      rate = SOFT_DECEL;
    }
    run.brakeLights = mustStop;
    run.v = target < run.v ? Math.max(target, run.v - (rate * dt) / 1000) : Math.min(target, run.v + (ACCEL * dt) / 1000);
    let next = run.s + (run.v * dt) / 1000;
    const atLine = mustStop && (next >= junction.sWait || junction.sWait - next < 0.3);
    if (atLine && noStraight && !run.braking) {
      // No straight ahead and no direction chosen: wait at the line for a swipe.
      next = junction.sWait;
      run.stoppedAt = next;
      run.v = 0;
      junction.stoppedAtTime = now;
      junction.needTurn = true;
      junction.stopped = true;
      run.events.push({ type: 'needTurn', junction: junction.index, instruction: junction.instruction });
    } else if (atLine) {
      next = junction.sWait;
      run.stoppedAt = next;
      run.v = 0;
      junction.stoppedAtTime = now;
      run.braking = false;
      junction.stopped = true;
      run.events.push({ type: 'stopped', junction: junction.index });
      const needless = (junction.blockers.length === 0 || now >= junction.clearAt) && !redFor(junction, now) && !stopSignFor(junction);
      if (needless) {
        junction.hesitated = true;
        run.events.push({ type: 'hesitated', junction: junction.index });
      }
    }
    run.s = next;
    // Roundabout: at each decision point either take the exit or carry on round.
    if (junction.ring && !junction.ring.exitTo && run.s >= junction.sLine && run.s + 1.5 >= junction.sEnd) advanceRing(run, junction);
  }

  // Entering the box while a blocker is still crossing your path is a crash.
  // A blocker you had to wait for by rule alone (its path never meets yours)
  // cannot be hit: entering before it has cleared is cutting in, a mistake.
  if (run.s >= junction.sLine && !junction.crashed && !junction.passed) {
    if (junction.blockers.length && now < junction.clearAt) {
      const crossing = stillCrossing(junction, now);
      if (crossing.length) {
        run.s = junction.sLine;
        crash(run, junction, latestOf(junction, crossing));
        return run.events.splice(0);
      }
      if (junction.starts.you === null && !junction.cutIn) {
        const to = latestOf(junction, junction.blockers.filter((id) => junction.starts[id] !== null && now < junction.starts[id] + clearMsOf(junction, id)));
        if (to) {
          junction.cutIn = to;
          run.streak = 0;
          run.events.push({ type: 'cutIn', junction: junction.index, to, rule: (junction.resolution.reasons.find((r) => r.who === 'you' && r.to === to) || {}).rule || null });
        }
      }
    }
    if (junction.starts.you === null) {
      junction.starts.you = now;
      if (!junction.ring) {
        junction.executedTo = junction.scene.vehicles.find((v) => v.id === 'you').to;
        run.intent = null;
      }
      if (redFor(junction, now) && !junction.ranRed) {
        junction.ranRed = true;
        run.streak = 0;
        run.events.push({ type: 'redLight', junction: junction.index });
      }
      if (stopSignFor(junction) && !junction.stopped) {
        junction.ranStop = true;
        run.streak = 0;
        run.events.push({ type: 'ranStop', junction: junction.index });
      }
      startFollowers(run, junction, now + 400);
    }
  }
  if (run.s >= junction.sExitBox && !junction.passed && !junction.crashed) {
    if (junction.ring) run.intent = null;
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
  for (const junction of visibleJunctions(run)) {
    for (const v of junction.scene.vehicles) {
      if (v.id === 'you') continue;
      // A vehicle with priority over you rolls in shortly before it crosses;
      // until the junction is scheduled it is not in sight at all.
      if (!junction.scheduled && junction.blockers.includes(v.id)) continue;
      // poseAt works on a scene-relative clock: both the start and "now"
      // must be measured from the moment the junction was scheduled.
      const absolute = junction.scheduled ? junction.starts[v.id] : null;
      const start = absolute === null ? null : absolute - junction.t0;
      const local = junction.scheduled ? run.now - junction.t0 : 0;
      const pose = poseAt(junction.scene, v, start, local, junction.pathCache, junction.rollIn ? junction.rollIn[v.id] : 0, junction.queueBack ? junction.queueBack[v.id] : 0);
      if (!pose) continue;
      const w = toWorld(junction, pose);
      const progress = start === null || local < start ? 0 : Math.min(1, (local - start) / durationOf(v));
      out.push({ junction, vehicle: v, pose: { x: w.x, y: w.y, angle: (pose.angle + junction.rot) % 360 }, progress, local: { x: pose.x, y: pose.y } });
    }
  }
  return out;
};

/**
 * Junctions worth drawing: the one behind you, the one you are at, and the
 * ones ahead within range. Older frames are never drawn, so a road that
 * loops back near itself does not show stale pieces of junction.
 */
export const visibleJunctions = (run) => {
  const me = youPose(run);
  const current = currentJunction(run);
  return run.junctions.filter((j) => j.index >= current.index - 1 && Math.hypot(j.cx - me.x, j.cy - me.y) < MAX_SPACING * 1.3);
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
    if (j.stoppedAtTime !== null) j.stoppedAtTime += delta;
    if (j.resumedAt !== null) j.resumedAt += delta;
    for (const id of Object.keys(j.starts)) if (j.starts[id] !== null) j.starts[id] += delta;
  }
};
