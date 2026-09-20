import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, type PropsWithChildren } from 'react';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { NATIVE_PLAYBACK_DELAY, nativePoseAt } from '@/src/lib/priority/nativeMotion';
import { useNativePoseSamples } from './useNativePose';
import type { VehiclePose } from './types';

function useCamera(you: VehiclePose, heading: number, snapshotTime: number, motionActive: boolean) {
  const samples = useNativePoseSamples(you.x, you.y, heading, snapshotTime);
  const clock = useSharedValue(snapshotTime - NATIVE_PLAYBACK_DELAY);
  const tick = useCallback(() => {
    'worklet';
    // RN 0.81 NativePerformance and Worklets 0.7 both use steady_clock's epoch
    // for performance.now(). Display-link timestamps use a different API.
    // Reading this shared monotonic clock also excludes first-mount latency.
    clock.value = Math.max(clock.value, performance.now() - NATIVE_PLAYBACK_DELAY);
  }, [clock]);
  const frameCallback = useFrameCallback(tick, false);
  useEffect(() => {
    frameCallback.setActive(motionActive);
  }, [frameCallback, motionActive]);
  useLayoutEffect(() => {
    // Finish at the authoritative pose when freezing the scene. A brief pause
    // must not rewind the shared clock when display callbacks resume.
    if (!motionActive) clock.value = snapshotTime;
  }, [clock, motionActive, snapshotTime]);
  const pose = useDerivedValue(() => nativePoseAt(samples.value, clock.value));
  const px = useDerivedValue(() => pose.value.x);
  const py = useDerivedValue(() => pose.value.y);
  const angle = useDerivedValue(() => pose.value.angle);
  return useMemo(() => ({ px, py, heading: angle, clock }), [px, py, angle, clock]);
}

const CameraContext = createContext<ReturnType<typeof useCamera> | null>(null);

export function SceneCamera({ you, heading, snapshotTime, motionActive = true, children }: PropsWithChildren<{ you: VehiclePose; heading: number; snapshotTime: number; motionActive?: boolean }>) {
  const camera = useCamera(you, heading, snapshotTime, motionActive);
  return <CameraContext.Provider value={camera}>{children}</CameraContext.Provider>;
}

export function useSceneCamera() {
  const camera = useContext(CameraContext);
  if (!camera) throw new Error('A native world layer needs SceneCamera');
  return camera;
}
