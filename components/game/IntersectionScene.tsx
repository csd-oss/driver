import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import Svg from 'react-native-svg';
import { pointAlong, SIZE, vehiclePath } from '@/src/lib/priority/layout';
import { JunctionStatic } from './JunctionStatic';
import { PathArrow } from './PathArrow';
import { VehicleSprite } from './VehicleSprite';
import type { SceneLike, VehiclePose } from './types';

export type { SceneLike, VehiclePose } from './types';
export { VEHICLE_FILL } from './types';

interface Props {
  scene: SceneLike;
  size: number;
  poses?: Record<string, VehiclePose>;
  showPaths?: boolean;
  highlight?: string[];
  hidden?: string[];
  blinkOn?: boolean;
}

/** One junction on its own, e.g. for the quiz or a preview. */
export const IntersectionScene = ({ scene, size, poses, showPaths, highlight = [], hidden = [], blinkOn = true }: Props) => {
  const dark = useColorScheme() === 'dark';
  const restingPoses = useMemo(() => {
    const out: Record<string, VehiclePose> = {};
    for (const v of scene.vehicles) out[v.id] = pointAlong(vehiclePath(scene, v).through, 0.001);
    return out;
  }, [scene]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <JunctionStatic scene={scene} dark={dark} />
      {showPaths && scene.vehicles.map((v) => <PathArrow key={`path-${v.id}`} scene={scene} vehicle={v} />)}
      {[...scene.vehicles]
        .sort((a, b) => (a.kind === 'tram' ? -1 : 0) - (b.kind === 'tram' ? -1 : 0))
        .filter((v) => !hidden.includes(v.id))
        .map((v) => (
          <VehicleSprite key={v.id} v={v} pose={poses?.[v.id] ?? restingPoses[v.id]} glow={highlight.includes(v.id)} blinkOn={blinkOn} />
        ))}
    </Svg>
  );
};
