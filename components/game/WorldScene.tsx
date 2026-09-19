import { StreetEnvironment } from './StreetEnvironment';
import { memo } from 'react';
import Svg, { G, Rect } from 'react-native-svg';
import { CENTER } from '@/src/lib/priority/layout';
import { cameraView, screenPoint } from '@/src/lib/priority/view';
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
  /** Position in the junction's own frame. */
  local?: { x: number; y: number };
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
  /** Your brake lights. */
  youBraking?: boolean;
}

/**
 * Scrolling top-down view of the run. The camera sits above your car and
 * turns with it; junctions are drawn in their own rotated frames.
 */
// Side roads run this far past the junction frame, off the screen in practice.
const SIDE_ROAD = 190;

interface FrameProps {
  scene: any;
  index: number;
  gapBefore: number;
  gapAfter: number;
  youTo: string | null;
  dark: boolean;
  lights: Record<string, LightPhase> | null;
}

// The static drawing of one junction does not change from frame to frame
// (only the camera above it does), so it is rebuilt only when these
// primitive props change. That keeps a turning camera smooth.
const JunctionFrame = memo(({ scene, index, gapBefore, gapAfter, youTo, dark, lights }: FrameProps) => {
  // The first junction owns its whole lead road; later ones meet halfway.
  const before = index === 0 ? gapBefore + SIDE_ROAD : gapBefore / 2 + 2;
  const extendArms: Record<string, number> = { S: before };
  if (youTo) extendArms[youTo] = gapAfter / 2 + 2;
  return <><StreetEnvironment scene={scene} extensions={extendArms} seed={index} /><JunctionStatic scene={scene} dark={dark} extendArms={extendArms} lights={lights} sideExtend={SIDE_ROAD} ownArm="S" /></>;
});
JunctionFrame.displayName = 'JunctionFrame';

export const WorldScene = ({ width, height, junctions, vehicles, you, youVehicle, heading, highlight = [], blinkOn = true, shake = 0, lights = {}, youSignal, youBraking = false }: Props) => {
  const dark = false; // Daylight road training stays readable in either app theme.
  const grass = dark ? '#233831' : '#c6d5b7';
  const view = cameraView(width, height, you, heading);
  const ZOOM_W = view.span;
  const viewH = view.viewHeight;
  const camera = `translate(${ZOOM_W / 2 + shake} ${viewH * 0.72}) rotate(${-heading}) translate(${-you.x} ${-you.y})`;
  // Is a world point on screen? Same transform as the camera, with a small margin.
  const inView = (p: VehiclePose) => {
    const point = screenPoint(p, view);
    return point.x > -12 && point.x < width + 12 && point.y > -12 && point.y < height + 12;
  };
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${ZOOM_W} ${viewH}`}>
      <Rect x={0} y={0} width={ZOOM_W} height={viewH} fill={grass} />
      <G transform={camera}>
        {junctions.map((j) => {
          const youAt = j.scene.vehicles.find((v: SceneVehicle) => v.id === 'you');
          return (
            <G key={j.index} transform={`translate(${j.cx} ${j.cy}) rotate(${j.rot}) translate(${-CENTER} ${-CENTER})`}>
              <JunctionFrame scene={j.scene} index={j.index} gapBefore={j.gapBefore ?? 80} gapAfter={j.gapAfter ?? 80} youTo={youAt ? youAt.to : null} dark={dark} lights={lights[j.index] ?? null} />
              {/* A vehicle that is on screen shows the part of its path still ahead of it, from where it is. */}
              {!j.passed &&
                vehicles
                  .filter((p) => p.junction.index === j.index && inView(p.pose))
                  .map((p) => (
                    <PathArrow key={`arrow-${j.index}-${p.vehicle.id}`} scene={j.scene} vehicle={p.vehicle} opacity={0.38} span={0.5} progress={p.progress ?? 0} from={p.local} />
                  ))}
            </G>
          );
        })}
        {vehicles.map(({ junction, vehicle, pose, progress }) => (
          <VehicleSprite key={`${junction.index}-${vehicle.id}`} v={vehicle} pose={pose} glow={highlight.includes(`${junction.index}-${vehicle.id}`)} blinkOn={blinkOn} signal={progress === 1 ? null : undefined} />
        ))}
        <VehicleSprite v={youVehicle} pose={you} glow={highlight.includes('you')} blinkOn={blinkOn} signal={youSignal} brakeLights={youBraking} />
      </G>
    </Svg>
  );
};
