import type { PropsWithChildren } from 'react';
import { G } from 'react-native-svg';

export interface MotionProps {
  x: number;
  y: number;
  angle: number;
  camera?: boolean;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
}

// Web receives display-rate snapshots and uses ordinary SVG transforms.
export function MotionGroup({ x, y, angle, camera, anchorX = 0, anchorY = 0, opacity = 1, children }: PropsWithChildren<MotionProps>) {
  const transform = camera
    ? `translate(${anchorX} ${anchorY}) rotate(${-angle}) translate(${-x} ${-y})`
    : `translate(${x} ${y}) rotate(${angle})`;
  return <G transform={transform} opacity={opacity}>{children}</G>;
}
