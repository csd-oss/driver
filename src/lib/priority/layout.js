import { turnOf } from './geometry';

/**
 * Top-down coordinates for drawing a scene and moving vehicles along their
 * paths. Everything lives in a 100 x 100 viewBox with the intersection centre
 * at (50, 50). Right-hand traffic: a vehicle arriving on S waits in the east
 * lane and leaves N in the east lane.
 *
 * Headings are degrees clockwise from north: N 0, E 90, S 180, W 270.
 */

export const SIZE = 100;
export const CENTER = 50;
export const ROAD_HALF = 12;   // half the road width
export const LANE = 6;         // lane centre offset from the road centre line
export const EDGE = CENTER - ROAD_HALF; // 38, the near edge of the crossing box
export const FAR = CENTER + ROAD_HALF;  // 62
export const RING_R = 19;      // roundabout ring centre-line radius
export const ISLAND_R = 10;    // roundabout island radius

export const ARM_HEADING = { N: 180, E: 270, S: 0, W: 90 }; // heading when arriving from the arm
export const EXIT_HEADING = { N: 0, E: 90, S: 180, W: 270 }; // heading when leaving by the arm

/** Point on the arm `arm` at `d` units from the centre, offset `lane` to the right of travel towards the centre. */
const armPoint = (arm, d, lane) => {
  switch (arm) {
    case 'S': return { x: CENTER + lane, y: CENTER + d };
    case 'N': return { x: CENTER - lane, y: CENTER - d };
    case 'E': return { x: CENTER + d, y: CENTER - lane };
    case 'W': return { x: CENTER - d, y: CENTER + lane };
    default: throw new Error(`Unknown arm ${arm}`);
  }
};

/** Approach lane point for a vehicle arriving on `arm`, `d` from the centre. */
export const approachPoint = (arm, d) => armPoint(arm, d, LANE);
/** Exit lane point for a vehicle leaving by `arm`, `d` from the centre. */
export const exitPoint = (arm, d) => armPoint(arm, d, -LANE);

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

const bezier = (p0, p1, p2, n) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = lerp(p0, p1, t);
    const b = lerp(p1, p2, t);
    pts.push(lerp(a, b, t));
  }
  return pts;
};

const line = (a, b, n) => {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(lerp(a, b, i / n));
  return pts;
};

const cornerFor = (from, to) => {
  // Control point for a turn: the corner of the crossing box between the arms.
  const entry = approachPoint(from, ROAD_HALF);
  const exit = exitPoint(to, ROAD_HALF);
  const vertical = from === 'N' || from === 'S';
  return vertical ? { x: entry.x, y: exit.y } : { x: exit.x, y: entry.y };
};

/**
 * Polyline for a movement through a plain crossing: from the waiting
 * position (WAIT units before the box) to the far end of the exit arm.
 */
export const WAIT = 8;
export const crossingPath = (from, to) => {
  const start = approachPoint(from, CENTER);           // arm end
  const wait = approachPoint(from, ROAD_HALF + WAIT);   // waiting position
  const entry = approachPoint(from, ROAD_HALF);
  const exit = exitPoint(to, ROAD_HALF);
  const end = exitPoint(to, CENTER);
  const turn = turnOf(from, to);
  let through;
  if (turn === 'straight') through = line(entry, exit, 8);
  else if (turn === 'right') through = bezier(entry, cornerFor(from, to), exit, 10);
  else if (turn === 'left') {
    // Wide arc through the middle of the box.
    const mid = { x: CENTER, y: CENTER };
    through = bezier(entry, mid, exit, 14);
  } else through = bezier(entry, { x: CENTER, y: CENTER }, exit, 14); // U-turn, rough
  return { approach: [...line(start, wait, 6)], wait, through: [wait, ...line(wait, entry, 3).slice(1), ...through.slice(1), ...line(exit, end, 6).slice(1)] };
};

const ringPoint = (deg) => ({
  x: CENTER + RING_R * Math.sin((deg * Math.PI) / 180),
  y: CENTER - RING_R * Math.cos((deg * Math.PI) / 180),
});
const ARM_ANGLE = { N: 0, E: 90, S: 180, W: 270 };
// Rotation (clockwise on screen) that maps the S arm onto each arm.
const ARM_ROT = { S: 0, W: 90, N: 180, E: 270 };
const rotateAbout = (p, deg) => {
  const c = Math.cos((deg * Math.PI) / 180);
  const sn = Math.sin((deg * Math.PI) / 180);
  const dx = p.x - CENTER;
  const dy = p.y - CENTER;
  return { x: CENTER + dx * c - dy * sn, y: CENTER + dx * sn + dy * c };
};

// A car joins the ring this many degrees past its arm's axis (counter-clockwise)
// and leaves it this many degrees before the exit arm's axis, so both the entry
// and the exit are gentle curves instead of kinks.
export const RING_JOIN_DEG = 32;
const RING_STEP_DEG = 8;

/** Ring points from angle a counter-clockwise (decreasing) to angle b. */
const ringArc = (a, b) => {
  const span = (a - b + 360) % 360;
  const steps = Math.max(2, Math.round(span / RING_STEP_DEG));
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(ringPoint(a - (span * i) / steps));
  return pts;
};

// Tangent direction on the ring at `deg`, going counter-clockwise.
const ringTangent = (deg) => ({ x: -Math.cos((deg * Math.PI) / 180), y: -Math.sin((deg * Math.PI) / 180) });

/** Where a line from `p` along `dir` crosses the vertical x = `x`. */
const hitVertical = (p, dir, x) => ({ x, y: p.y + ((x - p.x) / dir.x) * dir.y });

/**
 * Entry curve for the S arm: up the approach lane, then a bend onto the ring.
 * Returns points from the approach lane point at RING_R + 4 to the join.
 */
const entryCurveS = () => {
  const joinDeg = ARM_ANGLE.S - RING_JOIN_DEG;
  const join = ringPoint(joinDeg);
  const from = approachPoint('S', RING_R + 4);
  const control = hitVertical(join, ringTangent(joinDeg), from.x);
  return { joinDeg, points: bezier(from, control, join, 6) };
};

/** Exit curve for a given exit arm angle, computed in the S frame then rotated. */
const exitCurveFor = (exitArm) => {
  // Build the curve as if leaving by the N arm of a frame, then rotate so N maps to exitArm.
  const leaveDeg = ARM_ANGLE.N + RING_JOIN_DEG; // in the N frame, leave 32° before the N axis (ccw)
  const leave = ringPoint(leaveDeg);
  const to = exitPoint('N', RING_R + 4);
  const control = hitVertical(leave, ringTangent(leaveDeg), to.x);
  const local = [...bezier(leave, control, to, 6), ...line(to, exitPoint('N', CENTER), 5).slice(1)];
  const rot = (ARM_ROT[exitArm] - ARM_ROT.N + 360) % 360;
  return { leaveDeg: (ARM_ANGLE[exitArm] + RING_JOIN_DEG) % 360, points: local.map((p) => rotateAbout(p, rot)) };
};

/**
 * Counter-clockwise (as seen from above) roundabout path. Entering vehicles
 * come up their arm, bend onto the ring, go round, and bend off at their
 * exit. `from: 'ring'` vehicles start on the ring a quarter turn before the
 * S entry; `to: 'ring'` vehicles stay on it and stop opposite their entry.
 */
export const roundaboutPath = (from, to) => {
  if (from === 'ring') {
    const startDeg = ARM_ANGLE.S + 90; // a quarter turn before the S entry, coming from W
    const exit = exitCurveFor(to);
    const ring = ringArc(startDeg, exit.leaveDeg);
    return { approach: [], wait: ring[0], through: [...ring, ...exit.points.slice(1)] };
  }
  const rot = ARM_ROT[from];
  const start = approachPoint(from, CENTER);
  const wait = approachPoint(from, RING_R + WAIT);
  const entry = entryCurveS();
  const entryPts = entry.points.map((p) => rotateAbout(p, rot));
  const joinDeg = (entry.joinDeg + rot) % 360;
  if (to === 'ring') {
    const exitDeg = (ARM_ANGLE[from] - 180 + 360) % 360;
    const ring = ringArc(joinDeg, exitDeg);
    return { approach: line(start, wait, 6), wait, through: [wait, ...entryPts, ...ring.slice(1)] };
  }
  const exit = exitCurveFor(to);
  const ring = ringArc(joinDeg, exit.leaveDeg);
  return { approach: line(start, wait, 6), wait, through: [wait, ...entryPts, ...ring.slice(1), ...exit.points.slice(1)] };
};

export const vehiclePath = (scene, vehicle) =>
  scene.layout === 'roundabout' ? roundaboutPath(vehicle.from, vehicle.to) : crossingPath(vehicle.from, vehicle.to);

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** Point and heading at fraction `t` (0..1) along a polyline. */
export const pointAlong = (points, t) => {
  if (points.length === 1) return { ...points[0], angle: 0 };
  const total = points.reduce((sum, p, i) => (i ? sum + dist(points[i - 1], p) : 0), 0);
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < points.length; i++) {
    const seg = dist(points[i - 1], points[i]);
    if (target <= seg || i === points.length - 1) {
      const f = seg === 0 ? 0 : Math.min(1, target / seg);
      const p = lerp(points[i - 1], points[i], f);
      const angle = (Math.atan2(points[i].x - points[i - 1].x, -(points[i].y - points[i - 1].y)) * 180) / Math.PI;
      return { x: p.x, y: p.y, angle: (angle + 360) % 360 };
    }
    target -= seg;
  }
  const last = points[points.length - 1];
  return { ...last, angle: 0 };
};

/** Where a sign for traffic arriving on `arm` stands: right of the lane, before the box. */
export const signPoint = (arm, layout) => {
  const d = (layout === 'roundabout' ? RING_R : ROAD_HALF) + 5;
  return armPoint(arm, d, ROAD_HALF + 4);
};
