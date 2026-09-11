import { approachPoint, RING_R, ROAD_HALF, vehiclePath, WAIT } from './layout';

/**
 * Queueing for vehicles that arrive on the same arm. They share one lane, so
 * only the first one waits at the line; the others line up behind it, a car
 * length apart, in the order they will cross.
 */

export const QUEUE_GAP = 12; // scene units between two queued vehicles

/** Distance from the centre at which a vehicle on `from` waits. */
const waitDistance = (scene) => (scene.layout === 'roundabout' ? RING_R : ROAD_HALF) + WAIT;

/** Index of the group `id` crosses in, or the end of the order when it is missing. */
const rankOf = (order, id) => {
  const i = (order || []).findIndex((group) => group.includes(id));
  return i >= 0 ? i : (order || []).length;
};

/**
 * How far behind its arm's waiting line this vehicle stands: 0 for the one
 * that goes first, then QUEUE_GAP per vehicle ahead of it. Trams queue with
 * cars; vehicles already on a roundabout ring never queue.
 */
export const queueBackFor = (scene, order, vehicleId) => {
  const vehicles = scene.vehicles || [];
  const me = vehicles.find((v) => v.id === vehicleId);
  if (!me || me.from === 'ring') return 0;
  const peers = vehicles
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v.from === me.from)
    .sort((a, b) => rankOf(order, a.v.id) - rankOf(order, b.v.id) || a.i - b.i);
  return peers.findIndex(({ v }) => v.id === vehicleId) * QUEUE_GAP;
};

/** The point `back` units behind the vehicle's waiting position, along its approach lane. */
export const queuePoint = (scene, vehicle, back) => {
  if (vehicle.from === 'ring') return { ...vehiclePath(scene, vehicle).wait };
  const p = approachPoint(vehicle.from, waitDistance(scene) + Math.max(0, back));
  return { x: p.x, y: p.y };
};
