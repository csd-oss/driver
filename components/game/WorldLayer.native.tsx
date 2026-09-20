import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSceneCamera } from './SceneCamera.native';
import type { RoadSurfaceProps } from './RoadSurface';
import { roadPatch } from '@/src/lib/priority/render';

/** Immutable world-space patches under one continuously moving camera. */
export function WorldLayer({ width, height, span, viewHeight, you, shake, rasterize = false, children }: PropsWithChildren<Pick<RoadSurfaceProps, 'width' | 'height' | 'span' | 'viewHeight' | 'you' | 'shake'> & { rasterize?: boolean }>) {
  const camera = useSceneCamera();
  const scale = width / span;
  const { anchorX, anchorY, half } = roadPatch(you.x, you.y, span, viewHeight);
  const size = half * 2 * scale;
  // No cache anchor in this worklet: the old texture cannot move to a new
  // anchor while React is still painting its replacement.
  const style = useAnimatedStyle(() => ({ transform: [
    { rotate: `${-camera.heading.value}deg` },
    { translateX: -camera.px.value * scale },
    { translateY: -camera.py.value * scale },
  ] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: width / 2 + shake * scale, top: height * 0.72, width: 0, height: 0 }, style]}>
    <View key={`${anchorX}:${anchorY}:${half}:${scale}`} collapsable={false} shouldRasterizeIOS={rasterize} renderToHardwareTextureAndroid={rasterize}
      style={{ position: 'absolute', left: (anchorX - half) * scale, top: (anchorY - half) * scale, width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`${anchorX - half} ${anchorY - half} ${half * 2} ${half * 2}`}>
        {children}
      </Svg>
    </View>
  </Animated.View>;
}
