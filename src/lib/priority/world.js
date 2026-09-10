import { resolve } from './engine';
import { generatePlayable } from './generator';
import { leftOf, rightOf, oppositeOf } from './geometry';
import { EXIT_HEADING, CENTER, RING_R, ROAD_HALF, SIZE, WAIT, vehiclePath, approachPoint } from './layout';
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
  // Straight on is the default and goes unsaid; the instructor only speaks for a turn.
  if (turn === 'straight') return { kind: 'none', turn, to };
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
  const you = junction.scene.vehicles.find((v) => v.id === 'you');
  const path = vehiclePath(junction.scene, you);
  return path.through.map((p) => toWorld(junction, p));
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
  you.to = scene.arms.includes(straight) ? straight : junction.instruction.to;
  junction.executedTo = null;
  junction.needTurn = false;
  junction.late = false;
  junction.ranRed = false;
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
  // Roughly leaving the box; on a roundabout that is the exit curve, so the
  // whole ring counts as this junction.
  junction.sExitBox = junction.scene.layout === 'roundabout'
    ? junction.sEnd - (CENTER - RING_R - 6)
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
const setYourMovement = (run, junction, to) => {
  const you = junction.scene.vehicles.find((v) => v.id === 'you');
  if (!junction.scene.arms.includes(to) || you.to === to) return false;
  you.to = to;
  const previousBlockers = new Set(junction.blockers);
  applyResolution(junction);
  junction.through = throughWorld(junction);
  if (junction.scheduled) {
    const byId = Object.fromEntries(junction.scene.vehicles.map((v) => [v.id, v]));
    let clearAt = run.now;
    for (const id of junction.blockers) {
      if (junction.starts[id] === null) junction.starts[id] = run.now; // it goes before you: now
      clearAt = Math.max(clearAt, junction.starts[id] + durationOf(byId[id]) * CLEAR_FRACTION);
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

/** Player input: 'brake' | 'go' | 'left' | 'right' | null. */
export const applyInput = (run, input) => {
  if (run.over || run.now < run.crashUntil) return;
  const junction = currentJunction(run);
  if (input === 'left' || input === 'right') {
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
    return;
  }
  if (input === 'brake') {
    if (run.s < junction.sLine && run.stoppedAt === null) run.braking = true;
  } else if (input === 'go') {
    if (run.stoppedAt !== null) {
      if (junction.needTurn) return; // choose a direction first
      if (junction.blockers.length && run.now < junction.clearAt) {
        crash(run, junction, culpritOf(junction));
      } else {
        const readyAt = readyAtOf(junction);
        const early = run.now <= readyAt + EARLY_BONUS_MS;
        junction.earlyResume = early && !junction.hesitated;
        junction.resumedAt = run.now;
        run.stoppedAt = null;
        run.events.push({ type: 'resumed', junction: junction.index, early });
      }
    }
  }
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
    lights: junction.scene.control?.type === 'lights' ? (junction.scene.control.crossFirst ? 'cross-first' : 'you-first') : null,
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

const crash = (run, junction, culprit) => {
  junction.crashed = true;
  junction.culprit = culprit;
  run.lives -= 1;
  run.streak = 0;
  run.crashUntil = run.now + CRASH_PAUSE_MS;
  run.stoppedAt = null;
  run.braking = false;
  const reason = junction.resolution.reasons.find((r) => r.who === 'you' && r.to === culprit);
  junction.crashRule = reason ? reason.rule : null;
  run.events.push({ type: 'crash', junction: junction.index, culprit, rule: junction.crashRule, record: junctionRecord(run, junction, 'crash') });
  if (run.lives <= 0) run.over = true;
};

const passJunction = (run, junction) => {
  junction.passed = true;
  run.passed += 1;
  const wrongWay = junction.executedTo !== null && junction.executedTo !== junction.instruction.to;
  const base = 100 + (run.level - 1) * 15;
  const bonus = junction.earlyResume ? 60 : 0;
  const multiplier = Math.min(2, 1 + 0.1 * run.streak);
  const spoiled = junction.hesitated || wrongWay || junction.late || junction.ranRed;
  const points = spoiled ? 0 : Math.round((base + bonus) * multiplier);
  junction.wrongWay = wrongWay;
  junction.points = points;
  run.score += points;
  run.streak = spoiled ? 0 : run.streak + 1;
  if (wrongWay) run.events.push({ type: 'wrongWay', junction: junction.index, instruction: junction.instruction, executed: junction.executedTo });
  run.events.push({
    type: 'passed', junction: junction.index, points, hesitated: junction.hesitated, wrongWay, late: junction.late, ranRed: junction.ranRed,
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
    run.events.push({ type: 'instruction', junction: junction.index, ...junction.instruction, blockers: [...junction.blockers] });
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
    let next = run.s + (run.speed * dt) / 1000;
    // No straight ahead and no direction chosen: wait at the line for a swipe.
    const straight = oppositeOf('S');
    if (!junction.scene.arms.includes(straight) && run.intent === null && !junction.needTurn && next >= junction.sWait && run.s < junction.sLine) {
      next = junction.sWait;
      run.stoppedAt = next;
      junction.stoppedAtTime = now;
      run.braking = false;
      junction.needTurn = true;
      run.events.push({ type: 'needTurn', junction: junction.index, instruction: junction.instruction });
    } else if (run.braking && next >= junction.sWait && run.s < junction.sLine) {
      next = junction.sWait;
      run.stoppedAt = next;
      junction.stoppedAtTime = now;
      run.braking = false;
      junction.stopped = true;
      run.events.push({ type: 'stopped', junction: junction.index });
      const needless = (junction.blockers.length === 0 || now >= junction.clearAt) && !redFor(junction, now);
      if (needless) {
        junction.hesitated = true;
        run.events.push({ type: 'hesitated', junction: junction.index });
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
      junction.executedTo = junction.scene.vehicles.find((v) => v.id === 'you').to;
      run.intent = null;
      if (redFor(junction, now)) {
        junction.ranRed = true;
        run.streak = 0;
        run.events.push({ type: 'redLight', junction: junction.index });
      }
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
    if (Math.hypot(junction.cx - me.x, junction.cy - me.y) > MAX_SPACING * 1.3) continue;
    for (const v of junction.scene.vehicles) {
      if (v.id === 'you') continue;
      // A vehicle with priority over you rolls in shortly before it crosses;
      // until the junction is scheduled it is not in sight at all.
      if (!junction.scheduled && junction.blockers.includes(v.id)) continue;
      // poseAt works on a scene-relative clock: both the start and "now"
      // must be measured from the moment the junction was scheduled.
      const absolute = junction.scheduled ? junction.starts[v.id] : null;
      const start = absolute === null ? null : absolute - junction.t0;
      const local = poseAt(junction.scene, v, start, junction.scheduled ? run.now - junction.t0 : 0, junction.pathCache, ROLL_IN_MS);
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
  return run.junctions.filter((j) => Math.hypot(j.cx - me.x, j.cy - me.y) < MAX_SPACING * 1.3);
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
