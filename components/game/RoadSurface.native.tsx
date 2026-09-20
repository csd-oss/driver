import { useRef, type ReactNode } from 'react';
import { captureRoadLayout, sameRoadLayout } from '@/src/lib/priority/roadArtwork';
import { WorldRoads } from './WorldRoads';
import { WorldLayer } from './WorldLayer.native';
import type { RoadSurfaceProps } from './RoadSurface';

/** The native compositor moves cached artwork; SVG only redraws content changes. */
export function RoadSurface(props: RoadSurfaceProps) {
  const artwork = useRef<{ layout: ReturnType<typeof captureRoadLayout>; element: ReactNode } | null>(null);
  if (!artwork.current || !sameRoadLayout(artwork.current.layout, props.junctions)) {
    artwork.current = {
      layout: captureRoadLayout(props.junctions),
      element: <WorldRoads junctions={props.junctions} renderLights={false} />,
    };
  }
  return <WorldLayer {...props} rasterize>{artwork.current.element}</WorldLayer>;
}
