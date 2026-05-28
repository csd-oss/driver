import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
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

  useEffect(() => {
    progress.value = withTiming(Math.max(value, 0), {
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, durationMs, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return <Animated.View className={`h-full ${className}`} style={animatedStyle} />;
};
