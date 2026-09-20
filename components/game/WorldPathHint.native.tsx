import { memo, useMemo } from 'react';
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

/** A small transparent canvas around this car, instead of one road-sized canvas. */
export function WorldPathHint({ traffic, local, width, height, scale, shake }: {
  traffic: WorldVehicle; local: { x: number; y: number }; width: number; height: number; scale: number; shake: number;
}) {
  const { junction, vehicle, pose, progress = 0 } = traffic;
  const path = useMemo(() => vehiclePath(junction.scene, vehicle), [junction.scene, vehicle]);
  const points = useMemo(() => pathHint(path, progress, local, PREVIEW_SPAN).map((p: { x: number; y: number }) => ({ x: p.x - local.x, y: p.y - local.y })), [path, progress, local.x, local.y]);
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
    <View style={{ position: 'absolute', left: pose.x * scale - size / 2, top: pose.y * scale - size / 2, width: size, height: size, transform: [{ rotate: `${junction.rot}deg` }] }}>
      <Svg width={size} height={size} viewBox={`${-PREVIEW_HALF} ${-PREVIEW_HALF} ${PREVIEW_HALF * 2} ${PREVIEW_HALF * 2}`}>
        <PreviewTrail points={points} color={vehicle.color} opacity={0.38} />
      </Svg>
    </View>
  </Animated.View>;
}
