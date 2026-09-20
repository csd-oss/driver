import { createContext, useContext, type PropsWithChildren } from 'react';
import { useNativePose } from './useNativePose';
import type { VehiclePose } from './types';

const CameraContext = createContext<ReturnType<typeof useNativePose> | null>(null);

export function SceneCamera({ you, heading, children }: PropsWithChildren<{ you: VehiclePose; heading: number }>) {
  const camera = useNativePose(you.x, you.y, heading);
  return <CameraContext.Provider value={camera}>{children}</CameraContext.Provider>;
}

export function useSceneCamera() {
  const camera = useContext(CameraContext);
  if (!camera) throw new Error('A native world layer needs SceneCamera');
  return camera;
}
