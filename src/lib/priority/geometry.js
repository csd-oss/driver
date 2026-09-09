/**
 * Intersection geometry for the priority engine.
 *
 * Arms are compass points in clockwise order. A vehicle arriving on an arm
 * faces the centre; "right" is the next arm counter-clockwise from where it
 * stands (a car arriving from S and facing N has E on its right).
 *
 * Paths are modelled on a 2x2 grid of conflict cells (NW, NE, SE, SW) with
 * right-hand traffic: a car arriving from S sits in the SE cell, goes
 * straight through SE then NE, turns right inside SE only, and turns left
 * through SE, NE and NW. Two movements conflict when they share a cell,
 * except opposite left turns, which pass each other.
 */

export const ARMS = ['N', 'E', 'S', 'W'];

const index = (arm) => {
  const i = ARMS.indexOf(arm);
  if (i < 0) throw new Error(`Unknown arm ${arm}`);
  return i;
};

export const rightOf = (arm) => ARMS[(index(arm) + 3) % 4];
export const leftOf = (arm) => ARMS[(index(arm) + 1) % 4];
export const oppositeOf = (arm) => ARMS[(index(arm) + 2) % 4];

/** 'straight' | 'left' | 'right' | 'uturn' */
export const turnOf = (from, to) => {
  if (to === oppositeOf(from)) return 'straight';
  if (to === leftOf(from)) return 'left';
  if (to === rightOf(from)) return 'right';
  return 'uturn';
};

// Entry cell for a vehicle arriving on an arm (right-hand traffic).
const ENTRY_CELL = { S: 'SE', N: 'NW', E: 'NE', W: 'SW' };
// Cell a vehicle occupies when leaving by an arm (its right-hand lane).
const EXIT_CELL = { N: 'NE', S: 'SW', W: 'NW', E: 'SE' };

/**
 * Cells a movement passes through. Five cells: the four quadrants and the
 * centre. Straight: entry quadrant then exit quadrant along one side. Right
 * turn: the entry quadrant only. Left turn: entry quadrant, centre, exit
 * quadrant. U-turn: entry, centre, then the quadrant beside the entry.
 */
export const pathCells = (from, to) => {
  const turn = turnOf(from, to);
  const start = ENTRY_CELL[from];
  const end = EXIT_CELL[to];
  if (turn === 'right') return [start];
  if (turn === 'straight') return [start, end];
  return [start, 'C', end];
};

/**
 * True when two movements cannot happen at the same time, the way the exam
 * reads its pictures:
 * - same arm: only the same turn (one lane each for straight, left, right);
 * - opposite left turns pass each other;
 * - a right turn also clashes with a vehicle going straight out of the arm it
 *   enters (the exam applies the right-hand rule there, ds-05 and ds-14);
 * - otherwise: any shared cell.
 */
export const movementsConflict = (a, b) => {
  const turnA = turnOf(a.from, a.to);
  const turnB = turnOf(b.from, b.to);
  if (a.from === b.from) return turnA === turnB;
  const opposite = b.from === oppositeOf(a.from);
  if (opposite && turnA === 'left' && turnB === 'left') return false;
  // Swapping roads (one turns left into the arm the other leaves by turning
  // right, or two opposite straights) never interacts.
  if (a.to === b.from && b.to === a.from) return false;
  // Turning into the arm the other vehicle is coming from counts as meeting
  // it, whatever the other does (ds-05, ds-23 in the exam pictures).
  if (turnA !== 'straight' && a.to === b.from) return true;
  if (turnB !== 'straight' && b.to === a.from) return true;
  const cellsA = new Set(pathCells(a.from, a.to));
  return pathCells(b.from, b.to).some((c) => cellsA.has(c));
};

/** Where `other` stands relative to a vehicle arriving on `arm`. */
export const relativeSide = (arm, other) => {
  if (other === arm) return 'same';
  if (other === rightOf(arm)) return 'right';
  if (other === leftOf(arm)) return 'left';
  return 'opposite';
};
