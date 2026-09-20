import { memo } from 'react';
import { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { VEHICLE_FILL } from './types';

const darken = (hex: string, f = 0.72) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
};

export const VehicleBody = memo(function VehicleBody({ kind, color, glow, turn, blinkOn, brakeLights }: { kind: string; color: string; glow?: boolean; turn: string; blinkOn?: boolean; brakeLights: boolean }) {
  const fill = VEHICLE_FILL[color] ?? '#64748b';
  const roof = darken(fill, 0.8);
  const isTram = kind === 'tram';
  const big = kind === 'van' || kind === 'truck' || kind === 'bus';
  const w = isTram ? 6.4 : big ? 6.6 : 5.8;
  const h = isTram ? 21 : kind === 'van' ? 11.5 : big ? 13.5 : 10;
  const blinkX = turn === 'left' ? -w / 2 + 0.7 : turn === 'right' ? w / 2 - 0.7 : null;
  const wheel = { w: 1.3, h: 2.4 };
  return (
    <G>
      {/* shadow */}
      <Ellipse cx={0.6} cy={0.8} rx={w / 2 + 0.4} ry={h / 2 + 0.2} fill="rgba(0,0,0,0.22)" />
      {glow && <Rect x={-w / 2 - 1.8} y={-h / 2 - 1.8} width={w + 3.6} height={h + 3.6} rx={3} fill="none" stroke="#f59e0b" strokeWidth={1.3} />}
      {/* wheels */}
      {!isTram && (
        <>
          <Rect x={-w / 2 - 0.5} y={-h / 2 + 1.6} width={wheel.w} height={wheel.h} rx={0.5} fill="#111827" />
          <Rect x={w / 2 - 0.8} y={-h / 2 + 1.6} width={wheel.w} height={wheel.h} rx={0.5} fill="#111827" />
          <Rect x={-w / 2 - 0.5} y={h / 2 - 4} width={wheel.w} height={wheel.h} rx={0.5} fill="#111827" />
          <Rect x={w / 2 - 0.8} y={h / 2 - 4} width={wheel.w} height={wheel.h} rx={0.5} fill="#111827" />
        </>
      )}
      {/* body */}
      <Path d={`M ${-w/2+1.1} ${-h/2} Q 0 ${-h/2-0.35} ${w/2-1.1} ${-h/2} Q ${w/2} ${-h/2+0.2} ${w/2} ${-h/2+1.7} L ${w/2} ${h/2-1} Q ${w/2} ${h/2} ${w/2-1} ${h/2} H ${-w/2+1} Q ${-w/2} ${h/2} ${-w/2} ${h/2-1} V ${-h/2+1.7} Q ${-w/2} ${-h/2+0.2} ${-w/2+1.1} ${-h/2} Z`} fill={fill} stroke={roof} strokeWidth={0.3} />
      {isTram ? (
        <>
          <Rect x={-w / 2 + 0.7} y={-h / 2 + 0.9} width={w - 1.4} height={2.4} rx={0.5} fill="#e0f2fe" opacity={0.9} />
          <Rect x={-w / 2 + 0.7} y={-h / 2 + 4.2} width={w - 1.4} height={h - 8.2} rx={0.5} fill="#fde68a" opacity={0.9} />
          <Rect x={-w / 2 + 0.7} y={h / 2 - 3.3} width={w - 1.4} height={2.4} rx={0.5} fill="#e0f2fe" opacity={0.9} />
          <Rect x={-0.6} y={-h / 2 + 5} width={1.2} height={h - 10} fill="rgba(0,0,0,0.15)" />
        </>
      ) : (
        <>
          {/* roof */}
          <Rect x={-w / 2 + 0.9} y={-h / 2 + 3.4} width={w - 1.8} height={h - 6.6} rx={1} fill={roof} />
          {/* windscreen and rear window */}
          <Path d={`M ${-w/2+0.65} ${-h/2+2.2} Q 0 ${-h/2+1.65} ${w/2-0.65} ${-h/2+2.2} L ${w/2-1.1} ${-h/2+4.25} H ${-w/2+1.1} Z`} fill="#253d4b" stroke="#aac5cf" strokeWidth={0.2} />
          <Path d={`M ${-w/2+0.9} ${-h/2+2.4} L ${w/2-1.1} ${-h/2+2.2} L ${-w/2+1.2} ${-h/2+3.5} Z`} fill="#b8d3d9" opacity={0.5} />
          <Path d={`M ${-w/2+0.35} ${-h/2+1.1} V ${h/2-1.3}`} stroke="#ffffff" strokeWidth={0.3} opacity={0.5} />
          <Rect x={-w / 2 + 0.9} y={h / 2 - 3.2} width={w - 1.8} height={1.6} rx={0.5} fill="#344d5a" stroke="#9cb7c0" strokeWidth={0.2} />
          {/* headlights and tail lights */}
          <Rect x={-w / 2 + 0.5} y={-h / 2 + 0.2} width={1.3} height={0.7} rx={0.3} fill="#fef9c3" />
          <Rect x={w / 2 - 1.8} y={-h / 2 + 0.2} width={1.3} height={0.7} rx={0.3} fill="#fef9c3" />
          <Rect x={-w / 2 + 0.5} y={h / 2 - 0.9} width={1.3} height={0.6} rx={0.3} fill={brakeLights ? '#ef4444' : '#fca5a5'} />
          <Rect x={w / 2 - 1.8} y={h / 2 - 0.9} width={1.3} height={0.6} rx={0.3} fill={brakeLights ? '#ef4444' : '#fca5a5'} />
          {brakeLights && (
            <>
              <Rect x={-w / 2 + 0.1} y={h / 2 - 1.3} width={2.1} height={1.4} rx={0.6} fill="#ef4444" opacity={0.45} />
              <Rect x={w / 2 - 2.2} y={h / 2 - 1.3} width={2.1} height={1.4} rx={0.6} fill="#ef4444" opacity={0.45} />
            </>
          )}
        </>
      )}
      {blinkX !== null && blinkOn && (
        <>
          <Circle cx={blinkX} cy={-h / 2 + 0.6} r={1} fill="#fbbf24" />
          <Circle cx={blinkX} cy={h / 2 - 0.6} r={1} fill="#fbbf24" />
        </>
      )}
    </G>
  );
});
