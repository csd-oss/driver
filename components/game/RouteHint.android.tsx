import { memo, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { G, Polygon } from 'react-native-svg';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { nativePoseAt } from '@/src/lib/priority/nativeMotion';
import { HEAD_POINTS, HINT_DASH_OFF, HINT_DASH_ON, HINT_WINDOW, pointAt } from '@/src/lib/priority/routeHint';
import { VEHICLE_FILL } from './types';
import type { RouteHintProps, RouteTable } from './RouteHint.native';

/**
 * Android draws every react-native-svg canvas with the CPU into a bitmap and
 * draws it again whenever any prop inside changes, so the iOS hint (one SVG
 * per route whose dash offset moves every display frame) costs a full
 * rasterisation and texture upload per hint per frame here. This version
 * keeps the same window, dash pattern, widths, colours and arrowhead, but
 * builds the window from plain views: chords of the white under-stroke, one
 * per dash period carrying its coloured dash, and one static arrowhead SVG.
 * Each piece is placed along the route by a worklet that only changes the
 * view's transform, which the compositor applies without repainting
 * anything. The route table, samples and camera are the ones the iOS hint
 * uses, so line and car read the same delayed clock.
 *
 * Every animated view costs a worklet and a native prop update per display
 * frame, so a route that never bends gets one chord per dash period and only
 * a route with a turn (bends of about 4 to 7 units radius) gets three.
 */

const UNDER_WIDTH = 2.2, UNDER_CAP = 1.1;
const DASH_WIDTH = 1.2, DASH_CAP = 0.6;
const HINT_OPACITY = 0.38;
const PERIOD = HINT_DASH_ON + HINT_DASH_OFF;
/** Bends tighter than this radius get the short chords; turns are 4 to 7. */
const STRAIGHT_RADIUS = 12;
const HEAD_HALF = 3.5;

const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};
/** The SVG paints the white stroke at 0.55 inside a 0.38 group. */
const UNDER_COLOUR = `rgba(255,255,255,${(0.55 * HINT_OPACITY).toFixed(3)})`;

/** Tightest bend of a route, from the turn between consecutive polyline segments. */
export function tightestRadius(table: RouteTable) {
  const { xs, ys } = table;
  let curvature = 0;
  for (let i = 2; i < xs.length; i++) {
    const before = Math.atan2(ys[i - 1] - ys[i - 2], xs[i - 1] - xs[i - 2]);
    const after = Math.atan2(ys[i] - ys[i - 1], xs[i] - xs[i - 1]);
    let turn = Math.abs(after - before);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    const length = (Math.hypot(xs[i - 1] - xs[i - 2], ys[i - 1] - ys[i - 2]) + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1])) / 2;
    if (length > 0) curvature = Math.max(curvature, turn / length);
  }
  return curvature ? 1 / curvature : Infinity;
}

/** How many chords make up one dash period on this route. */
export const chordsPerPeriod = (table: RouteTable) => tightestRadius(table) < STRAIGHT_RADIUS ? 3 : 1;

interface Chord {
  start: number;
  length: number;
  capStart: boolean;
  capEnd: boolean;
  /** Where the period's dash is centred, from the chord's start; null when another chord carries it. */
  dashAt: number | null;
}

/**
 * The window [0, HINT_WINDOW] ahead of the car, as chords with the round caps
 * of the SVG's single 35-unit dash. Each period's dash (3 on, 2 off) is
 * centred on the period's middle chord, one unit past where the SVG starts
 * it, so its straight piece leaves the curve equally at both ends.
 */
function chordsFor(perPeriod: number): Chord[] {
  const chord = PERIOD / perPeriod;
  const count = Math.round(HINT_WINDOW / chord);
  const carrier = Math.floor(perPeriod / 2);
  return Array.from({ length: count }, (_, i) => {
    const first = i === 0, last = i === count - 1;
    const start = i * chord - (first ? UNDER_CAP : 0);
    const period = Math.floor(i / perPeriod);
    return {
      start,
      length: chord + (first ? UNDER_CAP : 0) + (last ? UNDER_CAP : 0),
      capStart: first,
      capEnd: last,
      dashAt: i % perPeriod === carrier ? period * PERIOD + PERIOD / 2 - start : null,
    };
  });
}
const CHORDS = new Map<number, Chord[]>();
const chordsOf = (perPeriod: number) => {
  let chords = CHORDS.get(perPeriod);
  if (!chords) CHORDS.set(perPeriod, chords = chordsFor(perPeriod));
  return chords;
};

type Placed = Pick<RouteHintProps, 'table' | 'scale' | 'samples' | 'camera'>;

function UnderChord({ chord, colour, table, scale, samples, camera }: Placed & { chord: Chord; colour: string }) {
  const { minX, minY } = table.bounds;
  const w = chord.length * scale, h = UNDER_WIDTH * scale, mid = chord.start + chord.length / 2;
  const style = useAnimatedStyle(() => {
    const s = nativePoseAt(samples.value, camera.clock.value).x;
    const p = pointAt(table, s + mid);
    return { transform: [{ translateX: (p.x - minX) * scale - w / 2 }, { translateY: (p.y - minY) * scale - h / 2 }, { rotate: `${p.angle}deg` }] };
  });
  const cap = UNDER_CAP * scale;
  return <Animated.View pointerEvents="none" style={[{
    position: 'absolute', left: 0, top: 0, width: w, height: h, backgroundColor: UNDER_COLOUR,
    borderTopLeftRadius: chord.capStart ? cap : 0, borderBottomLeftRadius: chord.capStart ? cap : 0,
    borderTopRightRadius: chord.capEnd ? cap : 0, borderBottomRightRadius: chord.capEnd ? cap : 0,
  }, style]}>
    {chord.dashAt !== null && <View style={{
      position: 'absolute', left: (chord.dashAt - HINT_DASH_ON / 2 - DASH_CAP) * scale, top: (UNDER_WIDTH - DASH_WIDTH) / 2 * scale,
      width: (HINT_DASH_ON + 2 * DASH_CAP) * scale, height: DASH_WIDTH * scale, borderRadius: DASH_CAP * scale, backgroundColor: colour,
    }} />}
  </Animated.View>;
}

function Arrowhead({ colour, table, scale, samples, camera }: Placed & { colour: string }) {
  const { minX, minY } = table.bounds;
  const size = HEAD_HALF * 2 * scale;
  const style = useAnimatedStyle(() => {
    const s = nativePoseAt(samples.value, camera.clock.value).x;
    const head = pointAt(table, s + HINT_WINDOW);
    return { transform: [{ translateX: (head.x - minX) * scale - size / 2 }, { translateY: (head.y - minY) * scale - size / 2 }, { rotate: `${head.angle}deg` }] };
  });
  // The polygon sits at the canvas centre, so rotating the view rotates it about its own origin.
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, style]}>
    <Svg width={size} height={size} viewBox={`${-HEAD_HALF} ${-HEAD_HALF} ${HEAD_HALF * 2} ${HEAD_HALF * 2}`}>
      <G opacity={HINT_OPACITY}>
        <Polygon points={HEAD_POINTS} fill={colour} stroke="rgba(255,255,255,0.7)" strokeWidth={0.4} strokeLinejoin="round" />
      </G>
    </Svg>
  </Animated.View>;
}

export const RouteHint = memo(function RouteHint({ table, color, ox, oy, rot, scale, samples, camera }: RouteHintProps) {
  const { bounds } = table;
  const w = (bounds.maxX - bounds.minX) * scale, h = (bounds.maxY - bounds.minY) * scale;
  const fill = VEHICLE_FILL[color] ?? '#ffffff';
  const dash = rgba(fill, HINT_OPACITY);
  const chords = useMemo(() => chordsOf(chordsPerPeriod(table)), [table]);
  const placed = { table, scale, samples, camera };
  return <View pointerEvents="none" collapsable={false} style={{ position: 'absolute', left: ox * scale, top: oy * scale, width: w, height: h, transformOrigin: 'top left', transform: [{ rotate: `${rot}deg` }] }}>
    {chords.map((chord, i) => <UnderChord key={i} chord={chord} colour={dash} {...placed} />)}
    <Arrowhead colour={fill} {...placed} />
  </View>;
});
