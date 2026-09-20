import { memo } from 'react';
import { G } from 'react-native-svg';
import { StreetEnvironment } from './StreetEnvironment';
import { JunctionStatic, type LightPhase } from './JunctionStatic';
import { CENTER } from '@/src/lib/priority/layout';
import type { WorldJunction } from './WorldScene';
import type { SceneVehicle } from './types';

// Side roads run this far past the junction frame, off the screen in practice.
const SIDE_ROAD = 190;

interface FrameProps {
  scene: any;
  index: number;
  gapBefore: number;
  gapAfter: number;
  youTo: string | null;
  dark: boolean;
  lightKey: string;
  renderLights: boolean;
}

// The static drawing of one junction does not change from frame to frame
// (only the camera above it does), so it is rebuilt only when these
// primitive props change. That keeps a turning camera smooth.
const JunctionFrame = memo(({ scene, index, gapBefore, gapAfter, youTo, dark, lightKey, renderLights }: FrameProps) => {
  // The first junction owns its whole lead road; later ones meet halfway.
  const before = index === 0 ? gapBefore + SIDE_ROAD : gapBefore / 2 + 2;
  const extendArms: Record<string, number> = { S: before };
  if (youTo) extendArms[youTo] = gapAfter / 2 + 2;
  const phases = lightKey.split(',');
  const lights = Object.fromEntries(['N', 'E', 'S', 'W'].flatMap((arm, i) => phases[i] ? [[arm, phases[i] as LightPhase]] : []));
  return <><StreetEnvironment scene={scene} extensions={extendArms} seed={index} /><JunctionStatic scene={scene} dark={dark} extendArms={extendArms} lights={lights} renderLights={renderLights} sideExtend={SIDE_ROAD} ownArm="S" /></>;
});
JunctionFrame.displayName = 'JunctionFrame';


export function WorldRoads({ junctions, lights = {}, renderLights = true }: { junctions: WorldJunction[]; lights?: Record<number, Record<string, LightPhase> | null>; renderLights?: boolean }) {
  return <>{junctions.map(j => <G key={j.index} transform={`translate(${j.cx} ${j.cy}) rotate(${j.rot}) translate(${-CENTER} ${-CENTER})`}>
    <JunctionFrame scene={j.scene} index={j.index} gapBefore={j.gapBefore ?? 80} gapAfter={j.gapAfter ?? 80} youTo={j.scene.vehicles.find((v: SceneVehicle) => v.id === 'you')?.to ?? null} dark={false}
      renderLights={renderLights} lightKey={renderLights ? ['N', 'E', 'S', 'W'].map(arm => lights[j.index]?.[arm] ?? '').join(',') : ''} />
  </G>)}</>;
}
