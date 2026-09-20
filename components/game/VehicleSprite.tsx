import { MotionGroup } from './MotionGroup';
import { VehicleBody } from './VehicleBody';
import { turnOf } from '@/src/lib/priority/geometry';
import { type SceneVehicle, type VehiclePose } from './types';

export interface VehicleSpriteProps {
  v: SceneVehicle;
  pose: VehiclePose;
  glow?: boolean;
  dim?: boolean;
  /** Blinker phase; the sprite shows an indicator only when the vehicle turns. */
  blinkOn?: boolean;
  /** Which indicator is on; when given it replaces the turn derived from from/to. */
  signal?: 'left' | 'right' | null;
  /** Brake lights on (braking or standing). */
  brakeLights?: boolean;
}

/** One vehicle, drawn pointing up in its own frame and rotated to its heading. */
export const VehicleSprite = ({ v, pose, glow, dim, blinkOn, signal, brakeLights = false }: VehicleSpriteProps) => {
  const turn = signal !== undefined ? signal ?? 'straight' : v.from === 'ring' || v.to === 'ring' ? 'straight' : turnOf(v.from, v.to);
  return <MotionGroup x={pose.x} y={pose.y} angle={pose.angle} opacity={dim ? 0.35 : 1}>
    <VehicleBody kind={v.kind} color={v.color} glow={glow} turn={turn} blinkOn={blinkOn} brakeLights={brakeLights} />
  </MotionGroup>;
};
