import { useMemo } from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { vehiclePath } from '@/src/lib/priority/layout';
import { HINT_FADE_AT, routeDistance, routeTable } from '@/src/lib/priority/routeHint';
import { toWorld } from '@/src/lib/priority/world';
// Resolved per platform: RouteHint.android.tsx draws with views, iOS keeps RouteHint.native.tsx.
import { RouteHint } from './RouteHint';
import { useSceneCamera } from './SceneCamera.native';
import { useNativePoseSamples } from './useNativePose';
import type { WorldVehicle } from './WorldScene';

/**
 * A vehicle's path hint. Per snapshot React only measures how far along its
 * route the car is and publishes that as a pose sample; the route's SVG is
 * static and the window ahead of the car moves on the UI thread, in step with
 * the car sprite, which reads the same clock.
 */
export function WorldPathHint({ traffic, local, width, height, scale, shake, snapshotTime }: {
  traffic: WorldVehicle; local: { x: number; y: number }; width: number; height: number; scale: number; shake: number; snapshotTime: number;
}) {
  const { junction, vehicle, progress = 0 } = traffic;
  // Built where the hint mounts: cars only move forward, so the extension
  // back to the mount position covers every later snapshot.
  const table = useMemo(() => routeTable(vehiclePath(junction.scene, vehicle), local),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [junction.scene, vehicle]);
  const distance = routeDistance(table, local, progress);
  const samples = useNativePoseSamples(distance, 0, 0, snapshotTime);
  const camera = useSceneCamera();
  const style = useAnimatedStyle(() => ({ transform: [
    { rotate: `${-camera.heading.value}deg` },
    { translateX: -camera.px.value * scale },
    { translateY: -camera.py.value * scale },
  ] }));
  // The canvas corner in world units; junctions ahead can be re-placed after a turn.
  const origin = toWorld(junction, { x: table.bounds.minX, y: table.bounds.minY });
  if (progress >= HINT_FADE_AT) return null;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: width / 2 + shake * scale, top: height * .72, width: 0, height: 0 }, style]}>
    {/* The canvas is placed once in junction coordinates and only the common
        camera is animated, so a curved hint cannot slide away from its lane. */}
    <RouteHint table={table} color={vehicle.color} ox={origin.x} oy={origin.y} rot={junction.rot} scale={scale} samples={samples} camera={camera} />
  </Animated.View>;
}
