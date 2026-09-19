import { oppositeOf, turnOf } from '@/src/lib/priority/geometry';
import {
  CENTER,
  LANE,
  LANE_HALF,
  RING_R,
  ROAD_HALF,
  TRACK_OFFSET,
  WIDE_HALF,
  approachPoint,
  armPointOf,
  boxHalf,
  hasTrack,
  roadHalf,
} from '@/src/lib/priority/layout';
import type { SceneLike } from './types';

/**
 * The shapes one junction is drawn from, in the scene's 100 x 100 frame.
 * Roads with tram tracks are wider (the tracks run down the middle), so every
 * width here comes from the scene-aware helpers in `priority/layout`.
 */

export interface RoadRect { x: number; y: number; w: number; h: number }
export interface Seg { x1: number; y1: number; x2: number; y2: number }
export interface Point { x: number; y: number }
/** One length of an arm's extension: the road is `halfFrom` wide at `from` and `halfTo` at `to`. */
export interface ExtSegment { from: number; to: number; halfFrom: number; halfTo: number }

export const TAPER_HOLD = 10; // a wide arm keeps its width this far past the frame
export const TAPER_LEN = 14;  // then narrows to the plain road over this much
export const TRACK_EDGE = WIDE_HALF - 2 * LANE_HALF; // lane line between the tracks and the car lane
const RAIL = 0.9;             // half the rail gauge
const PED_GAP = 2.5;          // a pedestrian stands this far beyond the box

/** Lateral offsets of the four rails on an arm with tracks: a pair per direction. */
export const RAIL_OFFSETS = [TRACK_OFFSET - RAIL, TRACK_OFFSET + RAIL, -TRACK_OFFSET + RAIL, -TRACK_OFFSET - RAIL];

const round = (n: number) => Math.round(n * 100) / 100;
/** Where an arm's far end sits before the frame (never -0, which SVG dislikes). */
const before = (extend: number) => (extend ? -extend : 0);
/** Half width of the road on `arm` (roundabout arms are always plain). */
export const armHalf = (scene: SceneLike, arm: string) => (scene.layout === 'roundabout' ? ROAD_HALF : roadHalf(scene, arm));
const isRing = (scene: SceneLike) => scene.layout === 'roundabout';
/** How far from the centre the markings of `arm` stop: the box edge, or the ring. */
const innerOf = (scene: SceneLike, arm: string) => (isRing(scene) ? RING_R + LANE : boxHalf(scene, arm));

/** The road rectangle of one arm, from its far end (the frame edge plus `extend`) to the centre. */
export const armRect = (scene: SceneLike, arm: string, extend = 0): RoadRect => {
  const half = armHalf(scene, arm);
  switch (arm) {
    case 'N': return { x: CENTER - half, y: before(extend), w: 2 * half, h: CENTER + extend };
    case 'S': return { x: CENTER - half, y: CENTER, w: 2 * half, h: CENTER + extend };
    case 'W': return { x: before(extend), y: CENTER - half, w: CENTER + extend, h: 2 * half };
    default: return { x: CENTER, y: CENTER - half, w: CENTER + extend, h: 2 * half };
  }
};

/** The crossing box: as wide as the N–S road, as tall as the E–W road. */
export const boxRect = (scene: SceneLike): RoadRect => {
  const hx = boxHalf(scene, 'E');
  const hy = boxHalf(scene, 'N');
  return { x: CENTER - hx, y: CENTER - hy, w: 2 * hx, h: 2 * hy };
};

/**
 * The extension of `arm` beyond the frame, split into segments along the arm.
 * The next junction's road is a plain one, so an extended wide arm holds its
 * width for a bit and then tapers down to it.
 */
export const extensionShapes = (scene: SceneLike, arm: string, extend: number, taper = false): ExtSegment[] => {
  const half = armHalf(scene, arm);
  if (!(extend > 0)) return [];
  if (!taper || half === ROAD_HALF) return [{ from: 0, to: extend, halfFrom: half, halfTo: half }];
  const hold = Math.min(TAPER_HOLD, extend);
  const segs: ExtSegment[] = [{ from: 0, to: hold, halfFrom: half, halfTo: half }];
  if (extend <= TAPER_HOLD) return segs;
  const end = Math.min(TAPER_HOLD + TAPER_LEN, extend);
  const f = (end - TAPER_HOLD) / TAPER_LEN;
  segs.push({ from: TAPER_HOLD, to: end, halfFrom: half, halfTo: half + (ROAD_HALF - half) * f });
  if (extend > end) segs.push({ from: end, to: extend, halfFrom: ROAD_HALF, halfTo: ROAD_HALF });
  return segs;
};

/** The four corners of an extension segment, `pad` wider on each side (for the kerb). */
export const extensionPoints = (arm: string, seg: ExtSegment, pad = 0): Point[] => [
  armPointOf(arm, CENTER + seg.from, -(seg.halfFrom + pad)),
  armPointOf(arm, CENTER + seg.from, seg.halfFrom + pad),
  armPointOf(arm, CENTER + seg.to, seg.halfTo + pad),
  armPointOf(arm, CENTER + seg.to, -(seg.halfTo + pad)),
];

export const pointsAttr = (pts: Point[]) => pts.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');

/** Dashed lines along `arm`: the centre line, or one each side of the tram tracks. */
export const laneLines = (scene: SceneLike, arm: string, extend = 0): Seg[] => {
  const inner = innerOf(scene, arm);
  const offsets = !isRing(scene) && hasTrack(scene, arm) ? [TRACK_EDGE, -TRACK_EDGE] : [0];
  return offsets.map((o) => {
    const a = armPointOf(arm, CENTER + extend, o);
    const b = armPointOf(arm, inner, o);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
};

/** One rail of a track, from the far end of `from` through the box to the far end of `to`. */
const railPath = (scene: SceneLike, track: { from: string; to: string }, r: number, extFrom: number, extTo: number) => {
  const { from, to } = track;
  const a = armPointOf(from, CENTER + extFrom, r);
  const b = armPointOf(from, boxHalf(scene, from), r);
  const c = armPointOf(to, boxHalf(scene, to), -r);
  const d = armPointOf(to, CENTER + extTo, -r);
  if (isRing(scene)) {
    const axes: Record<string, number> = { N: 0, E: 90, S: 180, W: 270 };
    const start = axes[from] - 32, end = axes[to] + 32;
    const span = (start - end + 360) % 360;
    const radius = RING_R + r;
    const point = (angle: number) => ({ x: CENTER + radius * Math.sin(angle * Math.PI / 180), y: CENTER - radius * Math.cos(angle * Math.PI / 180) });
    const join = point(start), leave = point(end);
    const approach = armPointOf(from, RING_R + 13, r);
    const departure = armPointOf(to, RING_R + 13, -r);
    const inControl = armPointOf(from, RING_R + 2, r);
    const outControl = armPointOf(to, RING_R + 2, -r);
    const joinControl = { x: join.x + 8 * Math.cos(start * Math.PI / 180), y: join.y + 8 * Math.sin(start * Math.PI / 180) };
    const leaveControl = { x: leave.x - 8 * Math.cos(end * Math.PI / 180), y: leave.y - 8 * Math.sin(end * Math.PI / 180) };
    const arc = Array.from({ length: 25 }, (_, i) => point(start - span * i / 24)).map(p => `L ${round(p.x)} ${round(p.y)}`).join(' ');
    return `M ${round(a.x)} ${round(a.y)} L ${round(approach.x)} ${round(approach.y)} C ${round(inControl.x)} ${round(inControl.y)} ${round(joinControl.x)} ${round(joinControl.y)} ${round(join.x)} ${round(join.y)} ${arc} C ${round(leaveControl.x)} ${round(leaveControl.y)} ${round(outControl.x)} ${round(outControl.y)} ${round(departure.x)} ${round(departure.y)} L ${round(d.x)} ${round(d.y)}`;
  }
  // Through the box: straight, or bent through the box corner like `crossingPath` does.
  const vertical = from === 'N' || from === 'S';
  const k = vertical ? { x: b.x, y: c.y } : { x: c.x, y: b.y };
  const bend = turnOf(from, to) === 'straight' ? `L ${round(c.x)} ${round(c.y)}` : `Q ${round(k.x)} ${round(k.y)} ${round(c.x)} ${round(c.y)}`;
  return `M ${round(a.x)} ${round(a.y)} L ${round(b.x)} ${round(b.y)} ${bend} L ${round(d.x)} ${round(d.y)}`;
};

/** The four rails (two tracks, one per direction) of one track entry. */
export const trackRailPaths = (scene: SceneLike, track: { from: string; to: string }, extFrom = 0, extTo = 0) =>
  RAIL_OFFSETS.map((r) => railPath(scene, track, r, extFrom, extTo));

/** Lane centre of the approach on `arm` (a roundabout keeps the plain lane). */
const laneScene = (scene: SceneLike) => (isRing(scene) ? null : scene);

/** Stop / give-way line across the approach lane of `arm`. */
export const approachLine = (scene: SceneLike, arm: string): Seg => {
  const a = approachPoint(arm, innerOf(scene, arm) + 1, laneScene(scene));
  if (arm === 'N' || arm === 'S') return { x1: a.x - LANE_HALF, y1: a.y, x2: a.x + LANE_HALF, y2: a.y };
  return { x1: a.x, y1: a.y - LANE_HALF, x2: a.x, y2: a.y + LANE_HALF };
};

/** Where the painted triangle or STOP text sits: in the approach lane, behind the line. */
export const laneMarkPoint = (scene: SceneLike, arm: string): Point => approachPoint(arm, innerOf(scene, arm) + 1 + 6, laneScene(scene));

/** Where a pedestrian waiting to cross `arm` stands: at the kerb beside the car lane, just before the box. */
export const pedestrianPoint = (scene: SceneLike, arm: string): Point => armPointOf(arm, boxHalf(scene, arm) + PED_GAP, armHalf(scene, arm));

/**
 * Which way the main road bends as seen from `arm`: 'right' or 'left' when it
 * leaves by a side arm, null when it runs straight on (nothing to show).
 */
export const mainRoadBend = (scene: SceneLike, arm: string): 'left' | 'right' | null => {
  const main = scene.mainRoad;
  if (!main || main.length !== 2) return null;
  if (main.includes(oppositeOf(arm))) return null;
  const other = main.find((a) => a !== arm);
  if (!other) return null;
  const turn = turnOf(arm, other);
  return turn === 'left' || turn === 'right' ? turn : null;
};
