import { memo } from 'react';
import { G, Image, Line } from 'react-native-svg';
import { Tree } from './StreetArtwork';
import { roadHalf, ROAD_HALF } from '@/src/lib/priority/layout';
import type { SceneLike } from './types';

const gardens = [
  require('../../assets/images/driving/lot-0.png'),
  require('../../assets/images/driving/lot-1.png'),
  require('../../assets/images/driving/lot-2.png'),
  require('../../assets/images/driving/lot-3.png'),
  require('../../assets/images/driving/lot-4.png'),
  require('../../assets/images/driving/lot-5.png'),
  require('../../assets/images/driving/lot-6.png'),
  require('../../assets/images/driving/lot-7.png'),
  require('../../assets/images/driving/lot-8.png'),
  require('../../assets/images/driving/lot-9.png'),
  require('../../assets/images/driving/lot-10.png'),
  require('../../assets/images/driving/lot-11.png'),
];
const Garden = ({ variant }: { variant: number }) => <Image x={-1} y={-1} width={31} height={33} href={gardens[((variant % 12) + 12) % 12]} />;

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
        {Array.from({ length: count }, (_, i) => <G key={i} transform={`translate(0 ${52 + i * 32})`}>
          <G transform={`translate(${21 + setback} 0)`}><Garden variant={seed + i + armIndex} /></G>
          <G transform={`translate(${-21 - setback} 0) scale(-1 1)`}><Garden variant={seed + i + armIndex + 2} /></G>
          <Tree x={17.5 + setback} y={10} size={2.1} /><Tree x={-17.5 - setback} y={26} size={2.1} />
          <Line x1={-15.5 - setback} y1={0} x2={-15.5 - setback} y2={29} stroke="#a6b59b" strokeWidth={0.35} />
        </G>)}
      </G>;
    })}
  </G>
));
StreetEnvironment.displayName = 'StreetEnvironment';
