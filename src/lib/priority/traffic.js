import { traversalDuration, poseAt } from './timeline';

const CAR = Object.freeze({ width: 5.8, length: 10 });
const VAN = Object.freeze({ width: 6.6, length: 11.5 });
const LARGE = Object.freeze({ width: 6.6, length: 13.5 });
const TRAM = Object.freeze({ width: 6.4, length: 21 });
export const vehicleSize = (v) => v.kind === 'tram' ? TRAM : v.kind === 'van' ? VAN : v.kind === 'truck' || v.kind === 'bus' ? LARGE : CAR;

/** Smooth speed reduction for traffic following the same lane, before bumpers meet. */
export const followingFraction = (pose, vehicle, leader, leaderVehicle) => {
  const angle = pose.angle * Math.PI / 180;
  const dx = leader.x - pose.x, dy = leader.y - pose.y;
  if (Math.abs(dx) > 50 || Math.abs(dy) > 50) return 1;
  if (Math.cos((leader.angle - pose.angle) * Math.PI / 180) < 0.65) return 1;
  const ahead = dx * Math.sin(angle) - dy * Math.cos(angle);
  const side = Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle));
  if (ahead <= 0 || side > 4.5) return 1;
  const clearance = ahead - (vehicleSize(vehicle).length + vehicleSize(leaderVehicle).length) / 2;
  return Math.max(0, Math.min(1, (clearance - 8) / 22));
};

/** Separating-axis test for the actual rotated vehicle bodies. */
export const bodiesOverlap = (a, av, b, bv, margin = 0.8) => {
  if (!a || !b) return false;
  const sizeA = vehicleSize(av), sizeB = vehicleSize(bv);
  const aw = sizeA.width / 2 + margin, al = sizeA.length / 2 + margin;
  const bw = sizeB.width / 2 + margin, bl = sizeB.length / 2 + margin;
  const dx = a.x - b.x, dy = a.y - b.y;
  // Cheap conservative rejection before trigonometry; no temporary shapes,
  // arrays or callbacks in this frequently executed pairwise check.
  const reach = aw + al + bw + bl;
  if (Math.abs(dx) > reach || Math.abs(dy) > reach) return false;
  const aa = a.angle * Math.PI / 180, ba = b.angle * Math.PI / 180;
  const ac = Math.cos(aa), as = Math.sin(aa), bc = Math.cos(ba), bs = Math.sin(ba);
  const c = Math.abs(ac * bc + as * bs), s = Math.abs(ac * bs - as * bc);
  return Math.abs(dx * ac + dy * as) < aw + bw * c + bl * s
    && Math.abs(-dx * as + dy * ac) < al + bw * s + bl * c
    && Math.abs(dx * bc + dy * bs) < bw + aw * c + al * s
    && Math.abs(-dx * bs + dy * bc) < bl + aw * s + al * c;
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
      if (!fixed.length) return false;
      const until = junction.starts[v.id] + traversalDuration(junction.scene, v, junction.pathCache) * 2 + 3000;
      for (let t = now; t <= until; t += 80) {
        const p = position(v, t);
        if (fixed.some(other => bodiesOverlap(p, v, position(other, t), other, 1.5))) return true;
      }
      return false;
    };
    while (attempts++ < 100 && overlaps()) junction.starts[v.id] += 250;
    fixed.push(v);
  }
};
