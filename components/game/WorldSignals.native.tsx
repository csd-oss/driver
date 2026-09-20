import { memo } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { signPoint } from '@/src/lib/priority/layout';
import { toWorld } from '@/src/lib/priority/world';
import { projectVehicle, trafficInView } from '@/src/lib/priority/render';
import { cameraView } from '@/src/lib/priority/view';
import { LightHead, type LightPhase } from './JunctionStatic';
import { useSceneCamera } from './SceneCamera.native';
import type { WorldJunction, WorldSceneProps } from './WorldScene';

const Signal = memo(function Signal({ junction, arm, phase, width, height, scale, shake }: {
  junction: WorldJunction; arm: string; phase: LightPhase; width: number; height: number; scale: number; shake: number;
}) {
  const local = signPoint(arm, junction.scene.layout, junction.scene);
  const point = toWorld(junction, local);
  const camera = useSceneCamera();
  const size = 16 * scale;
  const x = point.x, y = point.y, rotation = junction.rot;
  const style = useAnimatedStyle(() => {
    const screen = projectVehicle(x, y, rotation, camera.px.value, camera.py.value, camera.heading.value, scale, width, height, shake);
    return { transform: [{ translateX: screen.x - size / 2 }, { translateY: screen.y - size / 2 }, { rotate: `${screen.angle}deg` }] };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
    <View shouldRasterizeIOS renderToHardwareTextureAndroid>
      <Svg width={size} height={size} viewBox={`${local.x - 8} ${local.y - 8} 16 16`}>
        <LightHead scene={junction.scene} arm={arm} phase={phase} />
      </Svg>
    </View>
  </Animated.View>;
});

/** A changing signal repaints a tiny lamp, never either full road texture. */
export function WorldSignals({ junctions, lights = {}, width, height, you, heading, shake = 0 }: Pick<WorldSceneProps, 'junctions' | 'lights' | 'width' | 'height' | 'you' | 'heading' | 'shake'>) {
  const view = cameraView(width, height, you, heading);
  return <>{junctions.flatMap(junction => junction.scene.control?.type !== 'lights' ? [] : junction.scene.arms.map((arm: string) => {
    const phase = lights[junction.index]?.[arm] ?? junction.scene.control.arms?.[arm];
    const point = toWorld(junction, signPoint(arm, junction.scene.layout, junction.scene));
    if (!phase || !trafficInView(point, view)) return null;
    return <Signal key={`${junction.index}-${arm}`} junction={junction} arm={arm} phase={phase} width={width} height={height} scale={width / view.span} shake={shake} />;
  }))}</>;
}
