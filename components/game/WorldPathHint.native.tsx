import { useMemo } from 'react';
import Svg from 'react-native-svg';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { vehiclePath } from '@/src/lib/priority/layout';
import { pathHint } from '@/src/lib/priority/pathHint';
import { PREVIEW_HALF, PREVIEW_SPAN, projectVehicle } from '@/src/lib/priority/render';
import { PathTrail } from './PathArrow';
import { useNativePose } from './useNativePose';
import { useSceneCamera } from './SceneCamera.native';
import type { WorldVehicle } from './WorldScene';

/** A small transparent canvas around this car, instead of one road-sized canvas. */
export function WorldPathHint({ traffic, local, width, height, scale, shake }: {
  traffic: WorldVehicle; local: { x: number; y: number }; width: number; height: number; scale: number; shake: number;
}) {
  const { junction, vehicle, pose, progress = 0 } = traffic;
  const path = useMemo(() => vehiclePath(junction.scene, vehicle), [junction.scene, vehicle]);
  const points = pathHint(path, progress, local, PREVIEW_SPAN).map((p: { x: number; y: number }) => ({ x: p.x - local.x, y: p.y - local.y }));
  const camera = useSceneCamera();
  const motion = useNativePose(pose.x, pose.y, junction.rot);
  const size = PREVIEW_HALF * 2 * scale;
  const style = useAnimatedStyle(() => {
    const point = projectVehicle(motion.px.value, motion.py.value, motion.heading.value,
      camera.px.value, camera.py.value, camera.heading.value, scale, width, height, shake);
    return { transform: [{ translateX: point.x - size / 2 }, { translateY: point.y - size / 2 }, { rotate: `${point.angle}deg` }] };
  });
  if (points.length < 2) return null;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, style]}>
    <Svg width={size} height={size} viewBox={`${-PREVIEW_HALF} ${-PREVIEW_HALF} ${PREVIEW_HALF * 2} ${PREVIEW_HALF * 2}`}>
      <PathTrail points={points} color={vehicle.color} opacity={0.38} />
    </Svg>
  </Animated.View>;
}
