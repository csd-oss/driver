import { memo, useMemo } from 'react';
import { PixelRatio, View } from 'react-native';
import Svg, { G, Path, Polygon } from 'react-native-svg';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { nativePoseAt } from '@/src/lib/priority/nativeMotion';
import { roadRasterScale } from '@/src/lib/priority/render';
import { HEAD_POINTS, arrowAt, hintDashArrays, hintDashoffset, type routeTable } from '@/src/lib/priority/routeHint';
import { VEHICLE_FILL } from './types';
import type { useSceneCamera } from './SceneCamera.native';

const AnimatedPath = Animated.createAnimatedComponent(Path);
// matrix is a native SVG group prop, exposed by G's generic native-prop extension.
const AnimatedGroup = Animated.createAnimatedComponent(G<{ matrix?: number[] }>);

export type RouteTable = ReturnType<typeof routeTable>;
export type PoseSamples = SharedValue<{ x: number; y: number; angle: number; time: number }[]>;

export interface RouteHintProps {
  /** The vehicle's whole route, built once; its SVG never changes after mount. */
  table: RouteTable;
  color: string;
  /** World position of the canvas's top-left corner and the junction's rotation. */
  ox: number;
  oy: number;
  rot: number;
  scale: number;
  /** Arc length along the route as x, sampled like the car sprite's pose. */
  samples: PoseSamples;
  camera: ReturnType<typeof useSceneCamera>;
}

const dash = hintDashArrays();

/**
 * One static SVG per vehicle covering its route in junction coordinates. The
 * window ahead of the car is revealed by animating the dash offset and the
 * arrowhead's matrix on the UI thread; React never touches the paths again.
 */
export const RouteHint = memo(function RouteHint({ table, color, ox, oy, rot, scale, samples, camera }: RouteHintProps) {
  const { bounds } = table;
  const bw = bounds.maxX - bounds.minX, bh = bounds.maxY - bounds.minY;
  const w = bw * scale, h = bh * scale;
  // Paint at the road's capped density; the compositor scales the layer back.
  const resolution = roadRasterScale(PixelRatio.get());
  const colour = VEHICLE_FILL[color] ?? '#ffffff';
  const initial = useMemo(() => {
    const s = samples.value[samples.value.length - 1].x;
    const head = arrowAt(table, s);
    return { offset: hintDashoffset(dash.period, s), head: `translate(${head.x} ${head.y}) rotate(${head.angle})` };
  }, [samples, table]);
  const strokeProps = useAnimatedProps(() => {
    const s = nativePoseAt(samples.value, camera.clock.value).x;
    return { strokeDashoffset: hintDashoffset(dash.period, s) };
  });
  const headProps = useAnimatedProps(() => {
    const s = nativePoseAt(samples.value, camera.clock.value).x;
    const head = arrowAt(table, s);
    const a = head.angle * Math.PI / 180;
    const c = Math.cos(a), sn = Math.sin(a);
    return { matrix: [c, sn, -sn, c, head.x, head.y] };
  });
  return <View pointerEvents="none" style={{ position: 'absolute', left: ox * scale, top: oy * scale, width: w, height: h, transformOrigin: 'top left', transform: [{ rotate: `${rot}deg` }] }}>
    <View style={{ width: w * resolution, height: h * resolution, transformOrigin: 'top left', transform: [{ scale: 1 / resolution }] }}>
      <Svg width={w * resolution} height={h * resolution} viewBox={`${bounds.minX} ${bounds.minY} ${bw} ${bh}`}>
        <G opacity={0.38}>
          <AnimatedPath d={table.d} stroke="rgba(255,255,255,0.55)" strokeWidth={2.2} fill="none" strokeLinecap="round"
            strokeDasharray={dash.under} strokeDashoffset={initial.offset} animatedProps={strokeProps} />
          <AnimatedPath d={table.d} stroke={colour} strokeWidth={1.2} fill="none" strokeLinecap="round"
            strokeDasharray={dash.dashes} strokeDashoffset={initial.offset} animatedProps={strokeProps} />
          <AnimatedGroup transform={initial.head} animatedProps={headProps}>
            <Polygon points={HEAD_POINTS} fill={colour} stroke="rgba(255,255,255,0.7)" strokeWidth={0.4} strokeLinejoin="round" />
          </AnimatedGroup>
        </G>
      </Svg>
    </View>
  </View>;
});
