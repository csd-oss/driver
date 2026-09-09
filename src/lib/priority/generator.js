import { resolve } from './engine';
import { ARMS, turnOf } from './geometry';

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
 * Everything is in play from the first junction; what rises with the level
 * is traffic density (and, in world.js, speed). Runner-style, not unlocks.
 */
const bandFor = (level) => ({
  others: level <= 2 ? 1 + (level - 1) : level <= 6 ? 2 : 3,
  left: true,
  signs: true,
  t: true,
  bent: true,
  trams: level >= 2,
  roundabout: true,
});

const buildCrossing = (rng, band) => {
  const isT = band.t && chance(rng, 0.3);
  // A T-junction always keeps S; drop one of N, E, W.
  const arms = isT ? ARMS.filter((a) => a !== pick(rng, ['N', 'E', 'W'])) : [...ARMS];
  const signs = {};
  let mainRoad = null;
  if (band.signs && chance(rng, 0.6)) {
    if (band.bent && chance(rng, 0.4)) {
      // Bent main road through S and one side arm.
      const side = pick(rng, arms.filter((a) => a === 'E' || a === 'W'));
      mainRoad = ['S', side];
    } else {
      const straight = arms.includes('N') ? ['S', 'N'] : [pick(rng, arms.filter((a) => a !== 'S')), 'S'];
      mainRoad = straight;
    }
    for (const a of arms) {
      if (mainRoad.includes(a)) signs[a] = chance(rng, 0.7) ? 'main' : null;
      else signs[a] = chance(rng, 0.7) ? 'yield' : 'stop';
    }
    if (chance(rng, 0.5)) mainRoad = mainRoad.includes('S') && mainRoad.includes('N') ? null : mainRoad;
  }
  const tramTracks = band.trams && chance(rng, 0.35) && arms.includes('E') && arms.includes('W') ? [{ from: 'W', to: 'E' }] : [];

  const vehicles = [{ id: 'you', kind: 'car', color: 'you', from: 'S', to: pick(rng, destinations('S', arms, band.left)) }];
  const freeArms = shuffle(rng, arms.filter((a) => a !== 'S'));
  const colours = shuffle(rng, COLOURS);
  const count = Math.min(band.others, freeArms.length);
  for (let i = 0; i < count; i++) {
    const from = freeArms[i];
    vehicles.push({ id: colours[i], kind: chance(rng, 0.25) ? 'van' : 'car', color: colours[i], from, to: pick(rng, destinations(from, arms, band.left)) });
  }
  if (tramTracks.length && chance(rng, 0.8)) {
    const dir = chance(rng, 0.5) ? ['W', 'E'] : ['E', 'W'];
    vehicles.push({ id: 'tram1', kind: 'tram', color: 'tram', from: dir[0], to: dir[1] });
  }
  return { layout: isT ? 't' : 'cross', arms, signs, mainRoad, tramTracks, control: null, vehicles, pedestrians: [] };
};

const buildRoundabout = (rng) => {
  const sign = pick(rng, ['roundabout', 'roundabout-yield', 'roundabout-stop']);
  const exits = ['N', 'E', 'W'];
  const colour = pick(rng, COLOURS);
  const vehicles = [
    { id: 'you', kind: 'car', color: 'you', from: 'S', to: pick(rng, exits) },
    { id: colour, kind: 'car', color: colour, from: 'ring', to: pick(rng, exits) },
  ];
  return { layout: 'roundabout', arms: [...ARMS], signs: { S: sign }, mainRoad: null, tramTracks: [], control: null, vehicles, pedestrians: [] };
};

export const generateScene = (rng, level = 1) => {
  const band = bandFor(level);
  const scene = band.roundabout && chance(rng, 0.3) ? buildRoundabout(rng) : buildCrossing(rng, band);
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
