import { useColorScheme } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';
import { CENTER } from '@/src/lib/priority/layout';
import { JunctionStatic, type LightPhase } from './JunctionStatic';
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
  /** Open road before / after this junction's frame (scene units). */
  gapBefore?: number;
  gapAfter?: number;
}

export interface WorldVehicle {
  junction: WorldJunction;
  vehicle: SceneVehicle;
  pose: VehiclePose;
  /** 0..1 along its path through the junction; 0 while approaching. */
  progress?: number;
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
  /** Live traffic-light phases keyed by junction index. */
  lights?: Record<number, Record<string, LightPhase> | null>;
  /** Your indicator: right while you signal to leave a roundabout, otherwise from your turn. */
  youSignal?: 'left' | 'right' | null;
}

/**
 * Scrolling top-down view of the run. The camera sits above your car and
 * turns with it; junctions are drawn in their own rotated frames.
 */
// Side roads run this far past the junction frame, off the screen in practice.
const SIDE_ROAD = 70;

export const WorldScene = ({ width, height, junctions, vehicles, you, youVehicle, heading, highlight = [], blinkOn = true, shake = 0, lights = {}, youSignal }: Props) => {
  const dark = useColorScheme() === 'dark';
  const grass = dark ? '#1a2e1a' : '#cfe8bf';
  // Zoom in: the view spans ZOOM_W scene units across, the car sits lower down.
  const ZOOM_W = 78;
  const viewH = (ZOOM_W * height) / width;
  const camera = `translate(${ZOOM_W / 2 + shake} ${viewH * 0.78}) rotate(${-heading}) translate(${-you.x} ${-you.y})`;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${ZOOM_W} ${viewH}`}>
      <Rect x={0} y={0} width={ZOOM_W} height={viewH} fill={grass} />
      <G transform={camera}>
        {junctions.map((j) => {
          const youAt = j.scene.vehicles.find((v: SceneVehicle) => v.id === 'you');
          // The first junction owns its whole lead road; later ones meet halfway.
          const before = j.index === 0 ? (j.gapBefore ?? 0) + 2 : (j.gapBefore ?? 80) / 2 + 2;
          const extendArms: Record<string, number> = { S: before };
          if (youAt) extendArms[youAt.to] = (j.gapAfter ?? 80) / 2 + 2;
          return (
            <G key={j.index} transform={`translate(${j.cx} ${j.cy}) rotate(${j.rot}) translate(${-CENTER} ${-CENTER})`}>
              <JunctionStatic scene={j.scene} dark={dark} extendArms={extendArms} lights={lights[j.index] ?? null} sideExtend={SIDE_ROAD} />
              {/* Each visible vehicle shows the part of its path still ahead of it. */}
              {!j.passed &&
                vehicles
                  .filter((p) => p.junction.index === j.index)
                  .map((p) => (
                    <PathArrow key={`arrow-${j.index}-${p.vehicle.id}`} scene={j.scene} vehicle={p.vehicle} opacity={0.7} span={0.5} progress={p.progress ?? 0} />
                  ))}
            </G>
          );
        })}
        {vehicles.map(({ junction, vehicle, pose }) => (
          <VehicleSprite key={`${junction.index}-${vehicle.id}`} v={vehicle} pose={pose} glow={highlight.includes(`${junction.index}-${vehicle.id}`)} blinkOn={blinkOn} />
        ))}
        <VehicleSprite v={youVehicle} pose={you} glow={highlight.includes('you')} blinkOn={blinkOn} signal={youSignal} />
      </G>
    </Svg>
  );
};
