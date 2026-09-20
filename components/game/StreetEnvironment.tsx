import { memo } from 'react';
import { G, Image } from 'react-native-svg';
import { leftVerges, rightVerges } from './drivingArtwork';
import { roadHalf, ROAD_HALF } from '@/src/lib/priority/layout';
import type { SceneLike } from './types';

const variantIndex = (variant: number) => ((variant % 12) + 12) % 12;

/** Continuous homes and gardens along approaches, leaving every road and sign clear. */
export const StreetEnvironment = memo(({ scene, extensions, seed }: { scene: SceneLike; extensions: Record<string, number>; seed: number }) => (
  <G>
    {scene.arms.map((arm, armIndex) => {
      const rotation = { S: 0, W: 90, N: 180, E: 270 }[arm] ?? 0;
      const reach = extensions[arm] ?? 120;
      // The first lot sits outside the intersection frame; each arm owns its own strip.
      // Keep the whole lot inside this arm's half of a connecting road.
      // Rounding up stacks gardens on the neighbouring junction's gardens.
      const count = Math.max(0, Math.min(7, Math.floor((reach - 2) / 32)));
      const setback = roadHalf(scene, arm) - ROAD_HALF;
      return <G key={arm} transform={`translate(50 50) rotate(${rotation})`}>
        {Array.from({ length: count }, (_, i) => <G key={i}>
          <Image x={13 + setback} y={51 + i * 32} width={39} height={34} href={rightVerges[variantIndex(seed + i + armIndex)]} />
          <Image x={-52 - setback} y={51 + i * 32} width={39} height={34} href={leftVerges[variantIndex(seed + i + armIndex + 2)]} />
        </G>)}
      </G>;
    })}
  </G>
));
StreetEnvironment.displayName = 'StreetEnvironment';
