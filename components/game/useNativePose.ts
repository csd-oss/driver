import { useEffect, useRef } from 'react';
import { Easing, ReduceMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const timing = { duration: 1000 / 30, easing: Easing.linear, reduceMotion: ReduceMotion.Never };

export function useNativePose(x: number, y: number, angle: number) {
  const px = useSharedValue(x), py = useSharedValue(y), heading = useSharedValue(angle);
  const lastAngle = useRef(angle), continuousAngle = useRef(angle);
  useEffect(() => {
    continuousAngle.current += ((angle - lastAngle.current + 540) % 360) - 180;
    lastAngle.current = angle;
    px.value = withTiming(x, timing);
    py.value = withTiming(y, timing);
    heading.value = withTiming(continuousAngle.current, timing);
  }, [x, y, angle, px, py, heading]);
  return { px, py, heading };
}
