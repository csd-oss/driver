import { vehiclePath } from './layout';
import { CLEAR_FRACTION } from './timeline';

/**
 * When has another vehicle really cleared your way? The timeline's flat
 * CLEAR_FRACTION says "62% of its path", which is long after a car has
 * crossed your lane. Here the two paths are compared: the other vehicle
 * has cleared once it is past the last point of its path that comes within
 * CONFLICT_RADIUS of yours, plus a short margin for its rear. Vehicles whose
 * paths never meet yours have priority by rule only: `clearFractionFor`
 * returns null for them, so the caller can treat them as something you must
 * wait for but can never physically hit.
 */
export const CONFLICT_RADIUS = 6;   // half your width + half its length + a little air
const CLEAR_MARGIN = 2;             // its rear has passed once its centre is this far beyond

const cumulative = (pts) => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return cum;
};

const nearest = (p, pts) => {
  let best = Infinity;
  for (const q of pts) {
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best) best = d;
  }
  return best;
};

/**
 * Can two vehicles' bodies meet while they drive their paths through this
 * scene? Their centre lines come within BODY_RADIUS: two turning cars at an
 * angle touch corners well beyond CONFLICT_RADIUS, while the two lanes of a
 * road, 12 apart, stay clear. Cached per scene and pair for per-frame checks.
 */
export const BODY_RADIUS = 11;
const meetings = new WeakMap();
export const pathsMeet = (scene, a, b) => {
  let cache = meetings.get(scene);
  if (!cache) { cache = new Map(); meetings.set(scene, cache); }
  const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
  let hit = cache.get(key);
  if (hit === undefined) {
    const pa = vehiclePath(scene, a).through;
    const pb = vehiclePath(scene, b).through;
    hit = pa.some((p) => nearest(p, pb) < BODY_RADIUS);
    cache.set(key, hit);
  }
  return hit;
};

/** Fraction of `other`'s through path after which it no longer conflicts with `you`; null when the paths never meet. */
export const clearFractionFor = (scene, other, you) => {
  const a = vehiclePath(scene, other).through;
  const b = vehiclePath(scene, you).through;
  const cum = cumulative(a);
  const total = cum[cum.length - 1];
  if (!total) return null;
  let last = -1;
  for (let i = 0; i < a.length; i++) if (nearest(a[i], b) < CONFLICT_RADIUS) last = i;
  if (last < 0) return null;
  const fraction = (cum[last] + CLEAR_MARGIN) / total;
  return Math.max(0.15, Math.min(CLEAR_FRACTION, fraction));
};
