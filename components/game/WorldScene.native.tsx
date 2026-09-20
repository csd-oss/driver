import { View } from 'react-native';
import { G } from 'react-native-svg';
import { CENTER } from '@/src/lib/priority/layout';
import { cameraView, screenPoint } from '@/src/lib/priority/view';
import { SceneCamera } from './SceneCamera.native';
import { RoadSurface } from './RoadSurface.native';
import { WorldLayer } from './WorldLayer.native';
import { WorldVehicle } from './WorldVehicle.native';
import { PathArrow } from './PathArrow';
import type { WorldSceneProps } from './WorldScene';

/** All moving native artwork is composited, with no per-display-frame SVG paints. */
export function WorldScene({ width, height, junctions, vehicles, you, youVehicle, heading, highlight = [], blinkOn = true, shake = 0, lights = {}, youSignal, youBraking = false }: WorldSceneProps) {
  const view = cameraView(width, height, you, heading);
  const layer = { width, height, span: view.span, viewHeight: view.viewHeight, you, heading, shake };
  const sprite = { width, height, scale: width / view.span, shake, blinkOn };
  return <View style={{ width, height, backgroundColor: '#c6d5b7', overflow: 'hidden' }}>
    <SceneCamera you={you} heading={heading}>
      <RoadSurface {...layer} junctions={junctions} lights={lights} />
      <WorldLayer {...layer}>
        {junctions.map(j => <G key={j.index} transform={`translate(${j.cx} ${j.cy}) rotate(${j.rot}) translate(${-CENTER} ${-CENTER})`}>
          {!j.passed && vehicles.filter(p => {
            if (p.junction.index !== j.index) return false;
            const point = screenPoint(p.pose, view);
            return point.x > -12 && point.x < width + 12 && point.y > -12 && point.y < height + 12;
          }).map(p => <PathArrow key={p.vehicle.id} scene={j.scene} vehicle={p.vehicle} opacity={0.38} span={0.5} progress={p.progress ?? 0} from={p.local} />)}
        </G>)}
      </WorldLayer>
      {vehicles.map(({ junction, vehicle, pose, progress }) => <WorldVehicle key={`${junction.index}-${vehicle.id}`} {...sprite} v={vehicle} pose={pose} glow={highlight.includes(`${junction.index}-${vehicle.id}`)} signal={progress === 1 ? null : undefined} />)}
      <WorldVehicle {...sprite} v={youVehicle} pose={you} player glow={highlight.includes('you')} signal={youSignal} brakeLights={youBraking} />
    </SceneCamera>
  </View>;
}
