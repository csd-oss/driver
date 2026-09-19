import { durationOf, poseAt } from './timeline';

export const vehicleSize = (v) => ({
  width: v.kind === 'tram' ? 6.4 : ['van', 'truck', 'bus'].includes(v.kind) ? 6.6 : 5.8,
  length: v.kind === 'tram' ? 21 : v.kind === 'van' ? 11.5 : ['truck', 'bus'].includes(v.kind) ? 13.5 : 10,
});

/** Separating-axis test for the actual rotated vehicle bodies. */
export const bodiesOverlap = (a, av, b, bv, margin = 0.8) => {
  if (!a || !b) return false;
  const shape = (p, v) => {
    const rad = p.angle * Math.PI / 180;
    const { width, length } = vehicleSize(v);
    return { x: p.x, y: p.y, axes: [{ x: Math.cos(rad), y: Math.sin(rad) }, { x: -Math.sin(rad), y: Math.cos(rad) }], half: [width / 2 + margin, length / 2 + margin] };
  };
  const sa = shape(a, av), sb = shape(b, bv);
  if (Math.hypot(a.x - b.x, a.y - b.y) > Math.hypot(...sa.half) + Math.hypot(...sb.half)) return false;
  for (const axis of [...sa.axes, ...sb.axes]) {
    const radius = (s) => s.axes.reduce((sum, v, i) => sum + Math.abs(v.x * axis.x + v.y * axis.y) * s.half[i], 0);
    if (Math.abs((sa.x - sb.x) * axis.x + (sa.y - sb.y) * axis.y) >= radius(sa) + radius(sb)) return false;
  }
  return true;
};

/** Reserve non-overlapping trajectories before vehicles begin moving. */
export const spaceTraffic = (junction, now, newIds = null) => {
  const vehicles = junction.scene.vehicles.filter(v => v.id !== 'you' && junction.starts[v.id] !== null);
  const fixed = newIds ? vehicles.filter(v => !newIds.includes(v.id)) : [];
  const pending = vehicles.filter(v => !fixed.includes(v)).sort((a, b) => junction.starts[a.id] - junction.starts[b.id]);
  const position = (v, t) => poseAt(junction.scene, v, junction.starts[v.id] - junction.t0, t - junction.t0, junction.pathCache, junction.rollIn[v.id] || 0, junction.queueBack[v.id] || 0, 100);
  for (const v of pending) {
    // A newly released car waits at its line while we find a safe slot.
    let attempts = 0;
    const overlaps = () => {
      const until = junction.starts[v.id] + durationOf(v) * 2 + 3000;
      for (let t = now; t <= until; t += 80) {
        const p = position(v, t);
        if (fixed.some(other => bodiesOverlap(p, v, position(other, t), other))) return true;
      }
      return false;
    };
    while (attempts++ < 100 && overlaps()) junction.starts[v.id] += 250;
    fixed.push(v);
  }
};
