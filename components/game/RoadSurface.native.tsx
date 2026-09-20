import { WorldRoads } from './WorldRoads';
import { WorldLayer } from './WorldLayer.native';
import type { RoadSurfaceProps } from './RoadSurface';

/** The native compositor moves cached artwork; SVG only redraws content changes. */
export function RoadSurface(props: RoadSurfaceProps) {
  return <WorldLayer {...props} rasterize>
    <WorldRoads junctions={props.junctions} lights={props.lights} />
  </WorldLayer>;
}
