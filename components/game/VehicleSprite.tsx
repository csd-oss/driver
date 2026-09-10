import { Circle, Ellipse, G, Rect } from 'react-native-svg';
import { turnOf } from '@/src/lib/priority/geometry';
import { VEHICLE_FILL, type SceneVehicle, type VehiclePose } from './types';

interface Props {
  v: SceneVehicle;
  pose: VehiclePose;
  glow?: boolean;
  dim?: boolean;
  /** Blinker phase; the sprite shows an indicator only when the vehicle turns. */
  blinkOn?: boolean;
  /** Which indicator is on; when given it replaces the turn derived from from/to. */
  signal?: 'left' | 'right' | null;
}

const darken = (hex: string, f = 0.72) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
};

/** One vehicle, drawn pointing up in its own frame and rotated to its heading. */
export const VehicleSprite = ({ v, pose, glow, dim, blinkOn, signal }: Props) => {
  const fill = VEHICLE_FILL[v.color] ?? '#64748b';
  const roof = darken(fill, 0.8);
  const isTram = v.kind === 'tram';
  const big = v.kind === 'van' || v.kind === 'truck' || v.kind === 'bus';
  const w = isTram ? 6.4 : big ? 6.6 : 5.8;
  const h = isTram ? 21 : v.kind === 'van' ? 11.5 : big ? 13.5 : 10;
  const turn = signal !== undefined ? signal ?? 'straight' : v.from === 'ring' || v.to === 'ring' ? 'straight' : turnOf(v.from, v.to);
  const blinkX = turn === 'left' ? -w / 2 + 0.7 : turn === 'right' ? w / 2 - 0.7 : null;
  const wheel = { w: 1.3, h: 2.4 };
  return (
    <G transform={`translate(${pose.x} ${pose.y}) rotate(${pose.angle})`} opacity={dim ? 0.35 : 1}>
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
      <Rect x={-w / 2} y={-h / 2} width={w} height={h} rx={isTram ? 1.4 : 2} fill={fill} stroke="rgba(0,0,0,0.3)" strokeWidth={0.35} />
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
          <Rect x={-w / 2 + 0.8} y={-h / 2 + 1.7} width={w - 1.6} height={2} rx={0.6} fill="#dbeafe" opacity={0.95} />
          <Rect x={-w / 2 + 0.9} y={h / 2 - 3.2} width={w - 1.8} height={1.6} rx={0.5} fill="#dbeafe" opacity={0.75} />
          {/* headlights and tail lights */}
          <Rect x={-w / 2 + 0.5} y={-h / 2 + 0.2} width={1.3} height={0.7} rx={0.3} fill="#fef9c3" />
          <Rect x={w / 2 - 1.8} y={-h / 2 + 0.2} width={1.3} height={0.7} rx={0.3} fill="#fef9c3" />
          <Rect x={-w / 2 + 0.5} y={h / 2 - 0.9} width={1.3} height={0.6} rx={0.3} fill="#fca5a5" />
          <Rect x={w / 2 - 1.8} y={h / 2 - 0.9} width={1.3} height={0.6} rx={0.3} fill="#fca5a5" />
        </>
      )}
      {blinkX !== null && blinkOn && (
        <>
          <Circle cx={blinkX} cy={-h / 2 + 0.6} r={1} fill="#fbbf24" />
          <Circle cx={blinkX} cy={h / 2 - 0.6} r={1} fill="#fbbf24" />
        </>
      )}
      {v.id === 'you' && <Rect x={-1.1} y={-h / 2 + 4.2} width={2.2} height={h - 8.2} rx={0.6} fill="#ffffff" opacity={0.9} />}
    </G>
  );
};
