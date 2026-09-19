import { useRef, type PropsWithChildren } from 'react';
import { G } from 'react-native-svg';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import { useNativePose } from './useNativePose';
import type { MotionProps } from './MotionGroup';

// matrix is a native SVG group prop, exposed by G's generic native-prop extension.
const AnimatedGroup = Animated.createAnimatedComponent(G<{ matrix?: number[] }>);

/** Interpolate the simulation snapshots on the UI thread, without React commits per display frame. */
export function MotionGroup({ x, y, angle, camera, anchorX = 0, anchorY = 0, opacity = 1, children }: PropsWithChildren<MotionProps>) {
  const { px, py, heading } = useNativePose(x, y, angle);
  const initial = useRef(camera
    ? `translate(${anchorX} ${anchorY}) rotate(${-angle}) translate(${-x} ${-y})`
    : `translate(${x} ${y}) rotate(${angle})`);
  const animatedProps = useAnimatedProps(() => {
    const a = heading.value * Math.PI / 180 * (camera ? -1 : 1);
    const c = Math.cos(a), s = Math.sin(a);
    return { matrix: [c, s, -s, c,
      camera ? anchorX - c * px.value + s * py.value : px.value,
      camera ? anchorY - s * px.value - c * py.value : py.value] };
  });
  return <AnimatedGroup transform={initial.current} animatedProps={animatedProps} opacity={opacity}>{children}</AnimatedGroup>;
}
