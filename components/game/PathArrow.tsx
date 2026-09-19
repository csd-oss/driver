import { useMemo } from 'react';
import { G, Path, Polygon } from 'react-native-svg';
import { vehiclePath } from '@/src/lib/priority/layout';
import { VEHICLE_FILL, type SceneLike, type SceneVehicle } from './types';

interface Props {
  scene: SceneLike;
  vehicle: SceneVehicle;
  opacity?: number;
  /** Fraction of the path to draw, from the waiting line (default: through the box). */
  span?: number;
  /** How far along its path the vehicle already is (0..1); the arrow starts there. */
  progress?: number;
  /** The vehicle's current local position; while it is still approaching, the arrow starts here. */
  from?: { x: number; y: number };
}

/** Chevron trail with an arrowhead showing where a vehicle intends to go. */
export const PathArrow = ({ scene, vehicle, opacity = 0.85, span = 0.62, progress = 0, from }: Props) => {
  const path = useMemo(() => vehiclePath(scene, vehicle), [scene, vehicle]);
  const pts = path.through;
  const n = Math.max(2, Math.round(pts.length * span));
  const startIdx = Math.min(pts.length - 2, Math.floor(progress * (pts.length - 1)));
  let shown = pts.slice(startIdx, startIdx + n);
  if (progress === 0 && from && Math.hypot(from.x - pts[0].x, from.y - pts[0].y) > 1) shown = [from, ...shown];
  if (shown.length < 2 || progress >= 0.9) return null;
  const d = shown.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const tip = shown[shown.length - 1];
  const prev = shown[shown.length - 2];
  const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  const size = 3.2;
  const head = [
    `${tip.x + Math.cos(angle) * 1.2},${tip.y + Math.sin(angle) * 1.2}`,
    `${tip.x - size * Math.cos(angle - 0.55)},${tip.y - size * Math.sin(angle - 0.55)}`,
    `${tip.x - size * 0.45 * Math.cos(angle)},${tip.y - size * 0.45 * Math.sin(angle)}`,
    `${tip.x - size * Math.cos(angle + 0.55)},${tip.y - size * Math.sin(angle + 0.55)}`,
  ].join(' ');
  const colour = VEHICLE_FILL[vehicle.color] ?? '#ffffff';
  return (
    <G opacity={opacity}>
      <Path d={d} stroke="rgba(255,255,255,0.55)" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Path d={d} stroke={colour} strokeWidth={1.2} strokeDasharray="3 2" fill="none" strokeLinecap="round" />
      <Polygon points={head} fill={colour} stroke="rgba(255,255,255,0.7)" strokeWidth={0.4} strokeLinejoin="round" />
    </G>
  );
};
