import Svg from 'react-native-svg';
import { MotionGroup } from './MotionGroup';
import { WorldRoads } from './WorldRoads';
import type { WorldJunction } from './WorldScene';
import type { VehiclePose } from './types';
import type { LightPhase } from './JunctionStatic';

export interface RoadSurfaceProps {
  width: number;
  height: number;
  span: number;
  viewHeight: number;
  you: VehiclePose;
  heading: number;
  shake: number;
  junctions: WorldJunction[];
  lights: Record<number, Record<string, LightPhase> | null>;
}

export function RoadSurface({ width, height, span, viewHeight, you, heading, shake, junctions, lights }: RoadSurfaceProps) {
  return <Svg width={width} height={height} viewBox={`0 0 ${span} ${viewHeight}`}>
    <MotionGroup camera x={you.x} y={you.y} angle={heading} anchorX={span / 2 + shake} anchorY={viewHeight * 0.72}>
      <WorldRoads junctions={junctions} lights={lights} />
    </MotionGroup>
  </Svg>;
}
