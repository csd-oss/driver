import { View } from 'react-native';
import { cameraView } from '@/src/lib/priority/view';
import { trafficInView } from '@/src/lib/priority/render';
import { SceneCamera } from './SceneCamera.native';
import { RoadSurface } from './RoadSurface.native';
import { WorldVehicle } from './WorldVehicle.native';
import { WorldPathHint } from './WorldPathHint.native';
import type { WorldSceneProps } from './WorldScene';

/** All moving native artwork is composited, with no per-display-frame SVG paints. */
export function WorldScene({ width, height, junctions, vehicles, you, youVehicle, heading, highlight = [], blinkOn = true, shake = 0, lights = {}, youSignal, youBraking = false }: WorldSceneProps) {
  const view = cameraView(width, height, you, heading);
  const layer = { width, height, span: view.span, viewHeight: view.viewHeight, you, heading, shake };
  const sprite = { width, height, scale: width / view.span, shake, blinkOn };
  const drawn = vehicles.filter(p => trafficInView(p.pose, view));
  return <View style={{ width, height, backgroundColor: '#c6d5b7', overflow: 'hidden' }}>
    <SceneCamera you={you} heading={heading}>
      <RoadSurface {...layer} junctions={junctions} lights={lights} />
      {drawn.map(p => !p.junction.passed && (p.progress ?? 0) < .9 && p.local && <WorldPathHint key={`hint-${p.junction.index}-${p.vehicle.id}`} {...sprite} traffic={p} local={p.local} />)}
      {drawn.map(({ junction, vehicle, pose, progress }) => <WorldVehicle key={`${junction.index}-${vehicle.id}`} {...sprite} v={vehicle} pose={pose} glow={highlight.includes(`${junction.index}-${vehicle.id}`)} signal={progress === 1 ? null : undefined} />)}
      <WorldVehicle {...sprite} v={youVehicle} pose={you} player glow={highlight.includes('you')} signal={youSignal} brakeLights={youBraking} />
    </SceneCamera>
  </View>;
}
