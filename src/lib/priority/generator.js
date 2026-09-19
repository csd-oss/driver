import { resolve } from './engine';
import { ARMS, turnOf } from './geometry';
import { RING_DEFAULT_START, ringLeaveDeg } from './layout';

/**
 * Procedural intersections for the game. `generateScene(rng, level)` returns
 * a scene in the docs/game/scene-format.md shape plus its resolution, or
 * null when the random draw produced something unplayable (the caller
 * retries). `you` always arrives on S. Every feature can appear at any
 * level; the level only raises how many other vehicles there are.
 */

export const COLOURS = ['red', 'blue', 'green', 'yellow'];

/** Deterministic PRNG (mulberry32) so a level can be replayed from a seed. */
export const makeRng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const chance = (rng, p) => rng() < p;
const shuffle = (rng, list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const destinations = (from, arms, allowLeft) =>
  arms.filter((to) => to !== from && (allowLeft || turnOf(from, to) !== 'left'));

/**
 * One source arm per other vehicle, cycling the free arms: when there are
 * more vehicles than arms the extras share an arm and queue behind the first
 * (see queue.js) instead of being dropped.
 */
const sourceArms = (rng, freeArms, count) => {
  const order = shuffle(rng, freeArms);
  const out = [];
  for (let i = 0; i < count; i++) out.push(order[i % order.length]);
  return out;
};

/**
 * Everything is in play from the first junction; what rises with the level
 * is traffic density (and, in world.js, speed). Runner-style, not unlocks.
 */
const bandFor = (level) => ({
  others: level <= 2 ? 2 : level <= 5 ? 3 : 4,
  left: true,
  signs: true,
  t: true,
  bent: true,
  trams: level >= 3,
  lights: level >= 2,
  roundabout: level >= 2 ? 0.3 : 0.2,
});

/**
 * A crossroads with traffic lights. The scene shows the phase in which you
 * go (your arms green); `crossFirst` says whether the cross traffic had its
 * green before you (you arrive at red) or gets it after you.
 */
const buildLights = (rng, band) => {
  const arms = [...ARMS];
  const crossFirst = chance(rng, 0.6);
  const control = { type: 'lights', arms: { S: 'green', N: 'green', E: 'red', W: 'red' }, crossFirst };
  const vehicles = [{ id: 'you', kind: 'car', color: 'you', from: 'S', to: pick(rng, destinations('S', arms, band.left)) }];
  const colours = shuffle(rng, COLOURS);
  // At least one car on the cross road, so the lights visibly do something.
  const crossFrom = pick(rng, ['E', 'W']);
  vehicles.push({ id: colours[0], kind: chance(rng, 0.25) ? 'van' : 'car', color: colours[0], from: crossFrom, to: pick(rng, destinations(crossFrom, arms, band.left)) });
  const spare = sourceArms(rng, ['N', crossFrom === 'E' ? 'W' : 'E', crossFrom], Math.max(0, band.others - 1));
  spare.forEach((from, i) => {
    vehicles.push({ id: colours[i + 1], kind: chance(rng, 0.25) ? 'van' : 'car', color: colours[i + 1], from, to: pick(rng, destinations(from, arms, band.left)) });
  });
  return { layout: 'cross', arms, signs: {}, mainRoad: null, tramTracks: [], control, vehicles, pedestrians: [] };
};

const buildCrossing = (rng, band) => {
  const isT = band.t && chance(rng, 0.3);
  // A T-junction always keeps S; drop one of N, E, W.
  const dropped = isT ? pick(rng, ['N', 'E', 'W']) : null;
  const arms = ARMS.filter((a) => a !== dropped);
  const signs = {};
  let mainRoad = null;
  if (band.signs && chance(rng, 0.6)) {
    // The main road runs through two arms. About half the time you are on
    // it; otherwise you arrive on a side road and face a yield or STOP sign.
    const others = arms.filter((a) => a !== 'S');
    const candidates = [];
    if (arms.includes('N')) candidates.push(['S', 'N']);
    if (band.bent) for (const side of others.filter((a) => a === 'E' || a === 'W')) candidates.push(['S', side]);
    const notThroughYou = [];
    if (arms.includes('E') && arms.includes('W')) notThroughYou.push(['E', 'W']);
    if (band.bent && arms.includes('N')) for (const side of others.filter((a) => a === 'E' || a === 'W')) notThroughYou.push(['N', side]);
    mainRoad = notThroughYou.length && chance(rng, 0.5) ? pick(rng, notThroughYou) : pick(rng, candidates);
    for (const a of arms) {
      // Your own arm is always signed, so what you may do is readable from your seat.
      if (mainRoad.includes(a)) signs[a] = a === 'S' || chance(rng, 0.85) ? 'main' : null;
      else signs[a] = chance(rng, 0.7) ? 'yield' : 'stop';
    }
    // A plain straight main road through you sometimes goes unsigned (right-hand rule applies).
    if (mainRoad.includes('S') && mainRoad.includes('N') && chance(rng, 0.5)) {
      mainRoad = null;
      for (const a of arms) signs[a] = null;
    }
  }
  const tramTracks = band.trams && chance(rng, 0.35) && arms.includes('E') && arms.includes('W') ? [{ from: 'W', to: 'E' }] : [];

  const vehicles = [{ id: 'you', kind: 'car', color: 'you', from: 'S', to: pick(rng, destinations('S', arms, band.left)) }];
  const colours = shuffle(rng, COLOURS);
  const froms = sourceArms(rng, arms.filter((a) => a !== 'S'), band.others);
  froms.forEach((from, i) => {
    vehicles.push({ id: colours[i], kind: chance(rng, 0.25) ? 'van' : 'car', color: colours[i], from, to: pick(rng, destinations(from, arms, band.left)) });
  });
  if (tramTracks.length && chance(rng, 0.8)) {
    const dir = chance(rng, 0.5) ? ['W', 'E'] : ['E', 'W'];
    vehicles.push({ id: 'tram1', kind: 'tram', color: 'tram', from: dir[0], to: dir[1] });
  }
  return { layout: isT ? 't' : 'cross', arms, signs, mainRoad, tramTracks, control: null, vehicles, pedestrians: [] };
};

const RING_MAX = 3;                                 // cars already on the ring, at most
export const RING_MIN_GAP_DEG = 45;                 // never closer than this to each other
const RING_GAP_DEG = RING_MIN_GAP_DEG + 10;         // nominal gap, plus up to RING_JITTER_DEG
const RING_JITTER_DEG = 20;
const RING_SPAN_DEG = 200;                          // how far round the first one drives before it leaves

/** Exit arm for a car standing at ring angle `deg`, the one whose leave point is about `span` ahead. */
const ringExitFor = (deg, span) => {
  let best = null;
  for (const arm of ARMS) {
    const off = Math.abs(((deg - ringLeaveDeg(arm) + 360) % 360) - span);
    if (!best || off < best.off) best = { arm, off };
  }
  return best.arm;
};

const buildRoundabout = (rng, band) => {
  // Every entry to a roundabout carries the same regime, so one sign goes on
  // every arm. The ring always has priority here: a bare roundabout sign
  // would put circulating traffic behind you under the right-hand rule,
  // which effectively never happens on the road. The exam pictures still
  // cover it, so the quiz still teaches it.
  const sign = chance(rng, 0.8) ? 'roundabout-yield' : 'roundabout-stop';
  const arms = [...ARMS];
  const signs = Object.fromEntries(arms.map((a) => [a, sign]));
  const exits = arms.filter((a) => a !== 'S');
  const colours = shuffle(rng, COLOURS);
  const vehicles = [{ id: 'you', kind: 'car', color: 'you', from: 'S', to: pick(rng, exits) }];
  // Some of the traffic is already circulating, the rest is entering; there
  // is always at least one car on the ring.
  const onRing = Math.max(1, Math.min(band.others, RING_MAX, 1 + Math.floor(rng() * Math.ceil(band.others / 2))));
  // The cars on the ring roll towards your entry as a platoon, the first one
  // just before it. Each car behind it leaves one exit earlier (ARMS in order
  // is the reverse of the way round the ring), so the gaps hold all the way.
  let deg = (RING_DEFAULT_START + Math.floor(rng() * RING_JITTER_DEG) - RING_JITTER_DEG / 2 + 360) % 360;
  let exit = ARMS.indexOf(ringExitFor(deg, RING_SPAN_DEG));
  for (let i = 0; i < onRing; i++) {
    vehicles.push({ id: colours[i], kind: chance(rng, 0.2) ? 'van' : 'car', color: colours[i], from: 'ring', entryFrom: ['N', 'W', 'E'][i], ringAt: deg, to: ARMS[exit] });
    deg = (deg + RING_GAP_DEG + Math.floor(rng() * RING_JITTER_DEG)) % 360;
    exit = (exit + 1) % ARMS.length;
  }
  const entering = sourceArms(rng, exits, Math.min(band.others - onRing, exits.length - onRing));
  entering.forEach((from, i) => {
    const colour = colours[onRing + i];
    vehicles.push({ id: colour, kind: chance(rng, 0.2) ? 'van' : 'car', color: colour, from, to: pick(rng, arms.filter((a) => a !== from)) });
  });
  // Ring traffic arrives first on its own road. Do not place its approach
  // behind a vehicle already waiting to give way at that same entry.
  const entryArms = ['N', 'W', 'E'].filter(arm => !vehicles.some(v => v.from === arm));
  vehicles.filter(v => v.from === 'ring').forEach((v, i) => { v.entryFrom = entryArms[i]; });
  return { layout: 'roundabout', arms, signs, mainRoad: null, tramTracks: [], control: null, vehicles, pedestrians: [] };
};

export const generateScene = (rng, level = 1) => {
  const band = bandFor(level);
  const roll = rng();
  const scene = roll < band.roundabout ? buildRoundabout(rng, band) : band.lights && roll < band.roundabout + 0.2 ? buildLights(rng, band) : buildCrossing(rng, band);
  const result = resolve(scene);
  if (result.deadlock || result.blocked.length) return null;
  const youGroup = result.order.findIndex((g) => g.includes('you'));
  if (youGroup < 0) return null;
  return { ...scene, id: `gen-${level}`, level, resolution: result, youGoesAt: youGroup };
};

/** Keep drawing until a playable scene appears. */
export const generatePlayable = (rng, level = 1, attempts = 50) => {
  for (let i = 0; i < attempts; i++) {
    const scene = generateScene(rng, level);
    if (scene) return scene;
  }
  throw new Error(`No playable scene after ${attempts} attempts at level ${level}`);
};
