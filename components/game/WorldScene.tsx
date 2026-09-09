import { useColorScheme } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';
import { CENTER, SIZE } from '@/src/lib/priority/layout';
import { SPACING } from '@/src/lib/priority/world';
import { JunctionStatic } from './JunctionStatic';
import { PathArrow } from './PathArrow';
import { VehicleSprite } from './VehicleSprite';
import type { SceneVehicle, VehiclePose } from './types';

export interface WorldJunction {
  index: number;
  scene: any;
  cx: number;
  cy: number;
  rot: number;
  passed?: boolean;
  crashed?: boolean;
}

export interface WorldVehicle {
  junction: WorldJunction;
  vehicle: SceneVehicle;
  pose: VehiclePose;
}

interface Props {
  width: number;
  height: number;
  junctions: WorldJunction[];
  vehicles: WorldVehicle[];
  you: VehiclePose;
  youVehicle: SceneVehicle;
  /** Camera heading in degrees; the view rotates so this points up. */
  heading: number;
  highlight?: string[];
  blinkOn?: boolean;
  shake?: number;
}

/**
 * Scrolling top-down view of the run. The camera sits above your car and
 * turns with it; junctions are drawn in their own rotated frames.
 */
export const WorldScene = ({ width, height, junctions, vehicles, you, youVehicle, heading, highlight = [], blinkOn = true, shake = 0 }: Props) => {
  const dark = useColorScheme() === 'dark';
  const grass = dark ? '#1a2e1a' : '#cfe8bf';
  // Zoom in: the view spans ZOOM_W scene units across, the car sits lower down.
  const ZOOM_W = 78;
  const viewH = (ZOOM_W * height) / width;
  const camera = `translate(${ZOOM_W / 2 + shake} ${viewH * 0.78}) rotate(${-heading}) translate(${-you.x} ${-you.y})`;
  const extend = (SPACING - SIZE) / 2 + 2;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${ZOOM_W} ${viewH}`}>
      <Rect x={0} y={0} width={ZOOM_W} height={viewH} fill={grass} />
      <G transform={camera}>
        {junctions.map((j) => {
          const youAt = j.scene.vehicles.find((v: SceneVehicle) => v.id === 'you');
          const extendArms: Record<string, number> = { S: extend };
          if (youAt) extendArms[youAt.to] = extend;
          return (
            <G key={j.index} transform={`translate(${j.cx} ${j.cy}) rotate(${j.rot}) translate(${-CENTER} ${-CENTER})`}>
              <JunctionStatic scene={j.scene} dark={dark} extendArms={extendArms} />
              {!j.passed &&
                j.scene.vehicles.map((v: SceneVehicle) => (
                  <PathArrow key={`arrow-${j.index}-${v.id}`} scene={j.scene} vehicle={v} opacity={v.id === 'you' ? 0.95 : 0.7} span={v.id === 'you' ? 0.7 : 0.62} />
                ))}
            </G>
          );
        })}
        {vehicles.map(({ junction, vehicle, pose }) => (
          <VehicleSprite key={`${junction.index}-${vehicle.id}`} v={vehicle} pose={pose} glow={highlight.includes(`${junction.index}-${vehicle.id}`)} blinkOn={blinkOn} />
        ))}
        <VehicleSprite v={youVehicle} pose={you} glow={highlight.includes('you')} blinkOn={blinkOn} />
      </G>
    </Svg>
  );
};
