import { hintLength } from './pathHint';
import { PREVIEW_SPAN } from './render';

/**
 * A native path hint is one static route polyline, built once per vehicle,
 * with a dash window revealed along it on the UI thread. This module holds
 * the pure parts: the arc-length table, where a car is along it, the dash
 * patterns, and the arrowhead lookup used inside the worklet.
 */

/** Preview length ahead of the car, in scene units (35 at PREVIEW_SPAN). */
export const HINT_WINDOW = hintLength(PREVIEW_SPAN);
export const HINT_DASH_ON = 3;
export const HINT_DASH_OFF = 2;
/** Longer than any route, so each pattern shows exactly one window. */
export const HINT_PERIOD_GAP = 10000;
/** A hint disappears this far through the junction, as pathHint does. */
export const HINT_FADE_AT = 0.9;
/** Arrowhead size and how far its tip reaches past the trail's end. */
export const HINT_HEAD = 3.2;
export const HINT_HEAD_REACH = 1.2;
/** Canvas margin: the arrow reach and head, plus a round stroke cap. */
export const HINT_MARGIN = HINT_HEAD + HINT_HEAD_REACH + 1.1;

const EPSILON = 0.01;

/** Arrowhead outline pointing along +x with its tip at the trail's end. */
export const HEAD_POINTS = [
  [HINT_HEAD_REACH, 0],
  [-HINT_HEAD * Math.cos(0.55), HINT_HEAD * Math.sin(0.55)],
  [-HINT_HEAD * 0.45, 0],
  [-HINT_HEAD * Math.cos(0.55), -HINT_HEAD * Math.sin(0.55)],
].map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');

/**
 * The whole route as one polyline with cumulative arc lengths: a straight
 * extension back to `from` when the car starts behind the approach (queued
 * cars roll in from further back), the approach, and the through path clipped
 * where no window can ever reach. `throughStart` is the arc length of the
 * through path's first point, so a progress fraction maps to
 * `throughStart + progress * throughLength`, exactly as the simulation places
 * the car with pointAlong. Cars only move forward, so the table built where
 * the hint mounts covers every later position.
 */
export function routeTable(path, from) {
  const xs = [], ys = [], cumulative = [];
  const push = (p) => {
    const n = xs.length;
    if (n && Math.hypot(p.x - xs[n - 1], p.y - ys[n - 1]) < EPSILON) return false;
    cumulative.push(n ? cumulative[n - 1] + Math.hypot(p.x - xs[n - 1], p.y - ys[n - 1]) : 0);
    xs.push(p.x); ys.push(p.y);
    return true;
  };
  for (const p of path.approach) push(p);
  // The through path starts where the approach ends (that shared point is
  // pushed once), or at zero when there is no approach at all.
  const approachLength = cumulative.length ? cumulative[cumulative.length - 1] : 0;
  let throughStart = approachLength;
  for (const p of path.through) push(p);
  const throughLength = cumulative[cumulative.length - 1] - throughStart;
  // Extend straight back along the first segment to a car that starts
  // behind it, plus a little so its projection never clamps at the start.
  let extendBack = 0;
  if (from && xs.length >= 2) {
    const len = Math.hypot(xs[1] - xs[0], ys[1] - ys[0]) || 1;
    const along = ((from.x - xs[0]) * (xs[1] - xs[0]) + (from.y - ys[0]) * (ys[1] - ys[0])) / len;
    extendBack = along < 0 ? -along + 1 : 0;
  }
  if (extendBack > 0) {
    const len = Math.hypot(xs[1] - xs[0], ys[1] - ys[0]) || 1;
    xs.unshift(xs[0] + (xs[0] - xs[1]) / len * extendBack);
    ys.unshift(ys[0] + (ys[0] - ys[1]) / len * extendBack);
    cumulative.unshift(0);
    for (let i = 1; i < cumulative.length; i++) cumulative[i] += extendBack;
    throughStart += extendBack;
  }
  // Clip where a window starting at the fade-out point ends: beyond that
  // nothing is ever revealed, so the canvas need not cover it.
  const clipAt = throughStart + HINT_FADE_AT * throughLength + HINT_WINDOW + HINT_MARGIN;
  while (cumulative.length > 2 && cumulative[cumulative.length - 2] >= clipAt) { xs.pop(); ys.pop(); cumulative.pop(); }
  const last = cumulative.length - 1;
  if (last >= 1 && cumulative[last] > clipAt) {
    const f = (clipAt - cumulative[last - 1]) / (cumulative[last] - cumulative[last - 1]);
    xs[last] += (xs[last] - xs[last - 1]) * (f - 1);
    ys[last] += (ys[last] - ys[last - 1]) * (f - 1);
    cumulative[last] = clipAt;
  }
  const total = cumulative[last];
  const approachEnd = xs.findIndex((_, i) => cumulative[i] >= throughStart - EPSILON);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
    minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]);
  }
  const d = xs.map((x, i) => `${i ? 'L' : 'M'} ${x.toFixed(2)} ${ys[i].toFixed(2)}`).join(' ');
  return {
    xs, ys, cumulative, total, d, throughStart, throughLength, extendBack,
    approachEnd: Math.max(1, approachEnd),
    bounds: { minX: minX - HINT_MARGIN, minY: minY - HINT_MARGIN, maxX: maxX + HINT_MARGIN, maxY: maxY + HINT_MARGIN },
  };
}

/**
 * Arc length of the car along the route. Inside the junction the simulation's
 * progress is exact; while approaching (progress 0, which includes queue
 * departures and roll-ins) the car's local position is projected onto the
 * approach part of the polyline.
 */
export function routeDistance(table, local, progress = 0) {
  if (progress > 0) return Math.min(table.total, table.throughStart + progress * table.throughLength);
  const { xs, ys, cumulative } = table;
  let best = 0, nearest = Infinity;
  for (let i = 1; i <= table.approachEnd && i < xs.length; i++) {
    const dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1];
    const seg = dx * dx + dy * dy;
    const f = seg ? Math.max(0, Math.min(1, ((local.x - xs[i - 1]) * dx + (local.y - ys[i - 1]) * dy) / seg)) : 0;
    const distance = Math.hypot(local.x - xs[i - 1] - f * dx, local.y - ys[i - 1] - f * dy);
    if (distance < nearest) { nearest = distance; best = cumulative[i - 1] + f * Math.sqrt(seg); }
  }
  return best;
}

/**
 * The dash patterns for one window. The under-stroke is a single dash; the
 * coloured stroke repeats 3-on 2-off across the window, anchored at the car.
 * Both end with a gap longer than any route and share one period, so one
 * dash offset moves both.
 */
export function hintDashArrays(window = HINT_WINDOW, gap = HINT_PERIOD_GAP) {
  const dashes = [];
  let used = 0;
  while (used < window) {
    const on = Math.min(HINT_DASH_ON, window - used);
    dashes.push(on);
    used += on;
    const off = Math.min(HINT_DASH_OFF, window - used);
    if (used + off >= window) { dashes.push(off + gap); used = window; } else { dashes.push(off); used += off; }
  }
  return { under: [window, gap], dashes, period: window + gap };
}

/** Positive offset that starts the window at arc length `s`. */
export function hintDashoffset(period, s) {
  'worklet';
  return period - s;
}

/** Point and tangent angle (degrees) at arc length `s`, by binary search. */
export function pointAt(table, s) {
  'worklet';
  const { xs, ys, cumulative } = table;
  const target = Math.max(0, Math.min(table.total, s));
  let lo = 1, hi = cumulative.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < target) lo = mid + 1; else hi = mid; }
  const seg = cumulative[lo] - cumulative[lo - 1];
  const f = seg > 0 ? (target - cumulative[lo - 1]) / seg : 0;
  const dx = xs[lo] - xs[lo - 1], dy = ys[lo] - ys[lo - 1];
  return { x: xs[lo - 1] + dx * f, y: ys[lo - 1] + dy * f, angle: Math.atan2(dy, dx) * 180 / Math.PI };
}

/** Where the arrowhead sits for a car at arc length `s`: the window's end.
 * No default parameter here: a worklet evaluates defaults before it unpacks
 * its closure, so `window = HINT_WINDOW` throws on the UI runtime. */
export function arrowAt(table, s, window) {
  'worklet';
  return pointAt(table, s + (window === undefined ? HINT_WINDOW : window));
}
