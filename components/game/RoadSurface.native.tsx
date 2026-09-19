import { View } from 'react-native';
import Svg from 'react-native-svg';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { WorldRoads } from './WorldRoads';
import { useNativePose } from './useNativePose';
import type { RoadSurfaceProps } from './RoadSurface';

/** A reusable rasterized road surface, moved by the native compositor. */
export function RoadSurface({ width, height, span, viewHeight, you, heading, shake, junctions, lights }: RoadSurfaceProps) {
  const motion = useNativePose(you.x, you.y, heading);
  const scale = width / span;
  // Cover every viewport corner while rotating, plus a 32-unit anchor error.
  // Quantized anchors avoid repainting the SVG whenever the car moves.
  const anchorX = Math.round(you.x / 64) * 64, anchorY = Math.round(you.y / 64) * 64;
  const half = Math.ceil(Math.hypot(span / 2, viewHeight * 0.72) + 48);
  const size = half * 2 * scale;
  const style = useAnimatedStyle(() => ({ transform: [
    { rotate: `${-motion.heading.value}deg` },
    { translateX: (anchorX - motion.px.value) * scale },
    { translateY: (anchorY - motion.py.value) * scale },
  ] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: width / 2 + shake * scale - size / 2, top: height * 0.72 - size / 2, width: size, height: size }, style]}>
    <View shouldRasterizeIOS renderToHardwareTextureAndroid style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`${anchorX - half} ${anchorY - half} ${half * 2} ${half * 2}`}>
        <WorldRoads junctions={junctions} lights={lights} />
      </Svg>
    </View>
  </Animated.View>;
}
