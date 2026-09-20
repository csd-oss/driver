import { memo, useState, type PropsWithChildren } from 'react';
import { PixelRatio, View } from 'react-native';
import Svg from 'react-native-svg';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSceneCamera } from './SceneCamera.native';
import type { RoadSurfaceProps } from './RoadSurface';
import { roadPatch, patchKey, retainRoadPatches, roadRasterScale } from '@/src/lib/priority/render';

// An unchanged snapshot must not walk the SVG tree or recreate its native props.
// A new immutable patch still mounts beneath the same camera, retaining the
// preceding painted patch throughout handover.
const CachedPatch = memo(function CachedPatch({ patch: p, scale, resolution, rasterize, children }: PropsWithChildren<{
  patch: ReturnType<typeof roadPatch>; scale: number; resolution: number; rasterize: boolean;
}>) {
  const size = p.half * 2 * scale;
  const paintedSize = size * resolution;
  return <View collapsable={false}
    style={{ position: 'absolute', left: (p.anchorX - p.half) * scale, top: (p.anchorY - p.half) * scale, width: size, height: size }}>
    <View collapsable={false} shouldRasterizeIOS={rasterize} renderToHardwareTextureAndroid={rasterize}
      style={{ width: paintedSize, height: paintedSize, transformOrigin: 'top left', transform: [{ scale: 1 / resolution }] }}>
      <Svg width={paintedSize} height={paintedSize} viewBox={`${p.anchorX - p.half} ${p.anchorY - p.half} ${p.half * 2} ${p.half * 2}`}>
        {children}
      </Svg>
    </View>
  </View>;
});

/** Immutable world-space patches under one continuously moving camera. */
export function WorldLayer({ width, height, span, viewHeight, you, shake, rasterize = false, children }: PropsWithChildren<Pick<RoadSurfaceProps, 'width' | 'height' | 'span' | 'viewHeight' | 'you' | 'shake'> & { rasterize?: boolean }>) {
  const camera = useSceneCamera();
  const scale = width / span;
  const resolution = rasterize ? roadRasterScale(PixelRatio.get()) : 1;
  const patch = roadPatch(you.x, you.y, span, viewHeight);
  const [retained, setRetained] = useState(() => [patch]);
  const next: typeof retained = retainRoadPatches(retained, patch);
  // Adjust before committing children, so the previous surface never unmounts
  // in the same commit that creates an unpainted replacement. Keep the fallback
  // for the entire cache interval, rather than guessing readiness with a timer.
  if (next !== retained) setRetained(next);
  const patches = rasterize ? next : [patch];
  // No cache anchor in this worklet: the old texture cannot move to a new
  // anchor while React is still painting its replacement.
  const style = useAnimatedStyle(() => ({ transform: [
    { rotate: `${-camera.heading.value}deg` },
    { translateX: -camera.px.value * scale },
    { translateY: -camera.py.value * scale },
  ] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: width / 2 + shake * scale, top: height * 0.72, width: 0, height: 0 }, style]}>
    {patches.map(p => <CachedPatch key={patchKey(p)} patch={p} scale={scale} resolution={resolution} rasterize={rasterize}>{children}</CachedPatch>)}
  </Animated.View>;
}
