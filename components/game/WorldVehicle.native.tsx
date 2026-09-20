import { View } from 'react-native';
import Svg from 'react-native-svg';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { turnOf } from '@/src/lib/priority/geometry';
import { projectVehicle } from '@/src/lib/priority/render';
import { VehicleBody } from './VehicleBody';
import { useNativePose } from './useNativePose';
import { useSceneCamera } from './SceneCamera.native';
import type { VehicleSpriteProps } from './VehicleSprite';

export function WorldVehicle({ v, pose, glow, dim, blinkOn, signal, brakeLights = false, width, height, scale, shake, player = false }: VehicleSpriteProps & { width: number; height: number; scale: number; shake: number; player?: boolean }) {
  const camera = useSceneCamera();
  const motion = useNativePose(pose.x, pose.y, pose.angle);
  const turn = signal !== undefined ? signal ?? 'straight' : v.from === 'ring' || v.to === 'ring' ? 'straight' : turnOf(v.from, v.to);
  const w = 16 * scale, h = 28 * scale;
  const style = useAnimatedStyle(() => {
    const point = projectVehicle(player ? camera.px.value : motion.px.value, player ? camera.py.value : motion.py.value,
      motion.heading.value, camera.px.value, camera.py.value, camera.heading.value, scale, width, height, shake);
    return { transform: [{ translateX: point.x - w / 2 }, { translateY: point.y - h / 2 }, { rotate: `${point.angle}deg` }] };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h, opacity: dim ? 0.35 : 1 }, style]}>
    <View shouldRasterizeIOS renderToHardwareTextureAndroid style={{ width: w, height: h }}>
      <Svg width={w} height={h} viewBox="-8 -14 16 28">
        <VehicleBody kind={v.kind} color={v.color} glow={glow} turn={turn} blinkOn={blinkOn} brakeLights={brakeLights} />
      </Svg>
    </View>
  </Animated.View>;
}
