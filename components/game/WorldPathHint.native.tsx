import { memo, useMemo, useRef } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { vehiclePath } from '@/src/lib/priority/layout';
import { pathHint } from '@/src/lib/priority/pathHint';
import { PREVIEW_HALF, PREVIEW_SPAN } from '@/src/lib/priority/render';
import { PathTrail } from './PathArrow';
import { useSceneCamera } from './SceneCamera.native';
import type { WorldVehicle } from './WorldScene';

const PreviewTrail = memo(PathTrail);

/** A moving car's preview is redrawn once it has travelled this far, not every
 * snapshot: the trail's first units lie under the car body, so a redraw every
 * 2.5 units is invisible while it removes most SVG path rewrites per frame. */
export const HINT_STEP = 2.5;

type Anchor = { path: ReturnType<typeof vehiclePath>; local: { x: number; y: number }; pose: { x: number; y: number }; progress: number; points: { x: number; y: number }[] };

/** A small transparent canvas around this car, instead of one road-sized canvas. */
export function WorldPathHint({ traffic, local, width, height, scale, shake }: {
  traffic: WorldVehicle; local: { x: number; y: number }; width: number; height: number; scale: number; shake: number;
}) {
  const { junction, vehicle, pose, progress = 0 } = traffic;
  const path = useMemo(() => vehiclePath(junction.scene, vehicle), [junction.scene, vehicle]);
  // The geometry and the origin it was drawn from are kept together, so the
  // trail never slides away from its lane between redraws.
  const anchor = useRef<Anchor | null>(null);
  const current = anchor.current;
  const stale = !current || current.path !== path
    || Math.hypot(local.x - current.local.x, local.y - current.local.y) >= HINT_STEP
    || (progress === 0) !== (current.progress === 0) || (progress >= 0.9) !== (current.progress >= 0.9);
  if (stale) {
    anchor.current = { path, local, pose: { x: pose.x, y: pose.y }, progress, points: pathHint(path, progress, local, PREVIEW_SPAN).map((p: { x: number; y: number }) => ({ x: p.x - local.x, y: p.y - local.y })) };
  }
  const { points, pose: at } = anchor.current as Anchor;
  const camera = useSceneCamera();
  const size = PREVIEW_HALF * 2 * scale;
  const style = useAnimatedStyle(() => ({ transform: [
    { rotate: `${-camera.heading.value}deg` },
    { translateX: -camera.px.value * scale },
    { translateY: -camera.py.value * scale },
  ] }));
  if (points.length < 2) return null;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: width / 2 + shake * scale, top: height * .72, width: 0, height: 0 }, style]}>
    {/* Origin and SVG geometry share one React commit. Only the common camera
        is animated, so curved hints cannot slide away from their lane. */}
    <View style={{ position: 'absolute', left: at.x * scale - size / 2, top: at.y * scale - size / 2, width: size, height: size, transform: [{ rotate: `${junction.rot}deg` }] }}>
      <Svg width={size} height={size} viewBox={`${-PREVIEW_HALF} ${-PREVIEW_HALF} ${PREVIEW_HALF * 2} ${PREVIEW_HALF * 2}`}>
        <PreviewTrail points={points} color={vehicle.color} opacity={0.38} />
      </Svg>
    </View>
  </Animated.View>;
}
