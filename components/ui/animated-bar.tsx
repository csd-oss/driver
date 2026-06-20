import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface AnimatedBarProps {
  value: number;
  className?: string;
  durationMs?: number;
}

export const AnimatedBar = ({ value, className = '', durationMs = 800 }: AnimatedBarProps) => {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const target = Math.max(value, 0);
    // Reduce Motion: jump to the value, no growing animation.
    progress.value = reducedMotion
      ? target
      : withTiming(target, { duration: durationMs, easing: Easing.out(Easing.cubic) });
  }, [value, durationMs, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return <Animated.View className={`h-full ${className}`} style={animatedStyle} />;
};
