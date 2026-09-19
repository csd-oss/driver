import { memo } from 'react';
import { Circle, G, Line, Path, Rect } from 'react-native-svg';

const Tree = ({ x, y, size = 3.5 }: { x: number; y: number; size?: number }) => (
  <G>
    <Circle cx={x + 1.4} cy={y + 1.8} r={size + 0.5} fill="#203f33" opacity={0.12} />
    <Circle cx={x} cy={y} r={size} fill="#6e9270" />
    <Circle cx={x - size * 0.28} cy={y - size * 0.28} r={size * 0.72} fill="#91ae7c" />
    <Circle cx={x - size * 0.4} cy={y - size * 0.4} r={size * 0.35} fill="#b3c58a" opacity={0.65} />
  </G>
);

const Garden = ({ variant }: { variant: number }) => (
  <G>
    <Rect x={0} y={0} width={27} height={29} rx={1} fill={variant % 2 ? '#b9cba8' : '#c3d2b1'} />
    <Path d="M0 1 H26 V28 H0" fill="none" stroke="#a7bb99" strokeWidth={0.6} />
    {variant % 4 === 0 ? <>
      <Rect x={5} y={6} width={17} height={15} rx={6} fill="#d8dcc1" />
      <Path d="M0 14 H27" stroke="#ede7d5" strokeWidth={2.2} />
      <Tree x={11} y={9} size={4.4} /><Tree x={20} y={22} size={3.2} />
      <Rect x={6} y={19} width={5} height={1.4} rx={0.3} fill="#947e61" />
    </> : <>
      <Rect x={0} y={19} width={13} height={5} fill="#e4decb" />
      <Rect x={8} y={6} width={17} height={17} rx={1.2} fill="#536450" opacity={0.16} />
      <Rect x={6} y={4} width={17} height={17} rx={1} fill="#f3e9d6" />
      <Rect x={6.7} y={4.7} width={15.6} height={15.6} rx={0.5} fill={variant % 3 === 0 ? '#71888b' : variant % 3 === 1 ? '#b18a72' : '#b4a48a'} />
      <Path d="M14.5 5 V20 L21.8 16 V8 Z" fill="#243d38" opacity={0.13} />
      <Line x1={14.5} y1={5} x2={14.5} y2={20} stroke="#f5ecda" strokeWidth={0.55} opacity={0.7} />
      <Rect x={9} y={8} width={3} height={4} rx={0.3} fill="#354c4e" />
      <Line x1={9.5} y1={8.5} x2={11.5} y2={8.5} stroke="#b2c8c0" strokeWidth={0.7} />
      <Rect x={18} y={15} width={2} height={3} fill="#e1c9aa" />
      <Tree x={5} y={26} size={2.7} /><Tree x={24} y={2} size={2.2} />
    </>}
  </G>
);

/** Continuous homes and gardens along approaches, leaving every road and sign clear. */
export const StreetEnvironment = memo(({ arms, extensions, seed }: { arms: string[]; extensions: Record<string, number>; seed: number }) => (
  <G>
    {arms.map((arm, armIndex) => {
      const rotation = { S: 0, W: 90, N: 180, E: 270 }[arm] ?? 0;
      const reach = extensions[arm] ?? 120;
      // The first lot sits outside the intersection frame; each arm owns its own strip.
      // Keep the whole lot inside this arm's half of a connecting road.
      // Rounding up stacks gardens on the neighbouring junction's gardens.
      const count = Math.max(0, Math.min(7, Math.floor((reach - 2) / 32)));
      return <G key={arm} transform={`translate(50 50) rotate(${rotation})`}>
        {Array.from({ length: count }, (_, i) => <G key={i} transform={`translate(0 ${52 + i * 32})`}>
          <G transform="translate(21 0)"><Garden variant={seed + i + armIndex} /></G>
          <G transform="translate(-21 0) scale(-1 1)"><Garden variant={seed + i + armIndex + 2} /></G>
          <Tree x={17.5} y={10} size={2.1} /><Tree x={-17.5} y={26} size={2.1} />
          <Line x1={-15.5} y1={0} x2={-15.5} y2={29} stroke="#a6b59b" strokeWidth={0.35} />
        </G>)}
      </G>;
    })}
  </G>
));
StreetEnvironment.displayName = 'StreetEnvironment';
