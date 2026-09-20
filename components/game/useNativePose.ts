import { useLayoutEffect, useMemo, useRef } from 'react';
import { Easing, ReduceMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { SNAPSHOT_MS } from '@/src/lib/priority/render';
import { appendNativePose } from '@/src/lib/priority/nativeMotion';

const timing = { duration: SNAPSHOT_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never };

export function useNativePose(x: number, y: number, angle: number) {
  const px = useSharedValue(x), py = useSharedValue(y), heading = useSharedValue(angle);
  const lastAngle = useRef(angle), continuousAngle = useRef(angle);
  useLayoutEffect(() => {
    continuousAngle.current += ((angle - lastAngle.current + 540) % 360) - 180;
    lastAngle.current = angle;
    px.value = withTiming(x, timing);
    py.value = withTiming(y, timing);
    heading.value = withTiming(continuousAngle.current, timing);
  }, [x, y, angle, px, py, heading]);
  return useMemo(() => ({ px, py, heading }), [px, py, heading]);
}

/** Publish one atomic pose history, rather than restarting three UI timers. */
export function useNativePoseSamples(x: number, y: number, angle: number, time: number) {
  const previous = useRef([{ x, y, angle, time }]);
  const samples = useSharedValue(previous.current);
  useLayoutEffect(() => {
    const last = previous.current[previous.current.length - 1];
    if (last.time === time && last.x === x && last.y === y && last.angle === angle) return;
    previous.current = appendNativePose(previous.current, { x, y, angle, time });
    samples.value = previous.current;
  }, [x, y, angle, time, samples]);
  return samples;
}
