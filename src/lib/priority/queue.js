import { approachPoint, boxHalf, RING_R, RING_WAIT, vehiclePath, WAIT } from './layout';

/**
 * Queueing for vehicles that arrive on the same arm and lane. Only the first
 * one waits at the line; the others line up behind it, each a vehicle
 * length plus some air further back, in the order they will cross. A tram
 * has its own track, so it never queues behind a car nor a car behind it.
 */

export const QUEUE_GAP = 12; // a nominal car-to-car gap, used by the tests
export const QUEUE_AIR = 3;  // air between the rear of one vehicle and the nose of the next
export const VEHICLE_LENGTH = { car: 10, van: 11.5, truck: 13.5, bus: 13.5, tram: 21, motorcycle: 7, bicycle: 6, emergency: 10 };
const lengthOf = (v) => VEHICLE_LENGTH[v.kind] ?? VEHICLE_LENGTH.car;

/** Distance from the centre at which a vehicle on `from` waits. */
const waitDistance = (scene, vehicle) => scene.layout === 'roundabout' ? RING_R + RING_WAIT : boxHalf(scene, vehicle.from) + WAIT;

/** Index of the group `id` crosses in, or the end of the order when it is missing. */
const rankOf = (order, id) => {
  const i = (order || []).findIndex((group) => group.includes(id));
  return i >= 0 ? i : (order || []).length;
};

/**
 * How far behind its arm's waiting line this vehicle stands: 0 for the one
 * that goes first, then half of each neighbour's length plus QUEUE_AIR for
 * every vehicle ahead of it in the queue. A tram has its own track, so it
 * never queues with cars; vehicles already on a roundabout ring never queue.
 */
export const queueBackFor = (scene, order, vehicleId) => {
  const vehicles = scene.vehicles || [];
  const me = vehicles.find((v) => v.id === vehicleId);
  if (!me || me.from === 'ring') return 0;
  const tram = me.kind === 'tram';
  const peers = vehicles
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v.from === me.from && (v.kind === 'tram') === tram)
    .sort((a, b) => rankOf(order, a.v.id) - rankOf(order, b.v.id) || a.i - b.i);
  // The path's waiting point is the centre of a ten-unit car. Longer
  // vehicles must stand further back so their noses stay behind the line.
  const noseAllowance = Math.max(0, lengthOf(me) / 2 - VEHICLE_LENGTH.car / 2);
  let back = noseAllowance;
  for (let k = 1; k < peers.length; k++) {
    back += lengthOf(peers[k - 1].v) / 2 + lengthOf(peers[k].v) / 2 + QUEUE_AIR;
    if (peers[k].v.id === vehicleId) return back;
  }
  return noseAllowance;
};

/** The point `back` units behind the vehicle's waiting position, along its approach lane. */
export const queuePoint = (scene, vehicle, back) => {
  if (vehicle.from === 'ring') return { ...vehiclePath(scene, vehicle).wait };
  const p = approachPoint(vehicle.from, waitDistance(scene, vehicle) + Math.max(0, back), scene, vehicle);
  return { x: p.x, y: p.y };
};
