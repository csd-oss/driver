import { movementsConflict, pathCells, rightOf, turnOf } from '../src/lib/priority/geometry';
import { resolve } from '../src/lib/priority/engine';

const car = (id, from, to, extra = {}) => ({ id, kind: 'car', color: id, from, to, ...extra });
const tram = (id, from, to) => ({ id, kind: 'tram', color: 'tram', from, to });
const scene = (vehicles, extra = {}) => ({
  layout: 'cross', arms: ['N', 'E', 'S', 'W'], signs: {}, mainRoad: null, tramTracks: [], control: null,
  vehicles, pedestrians: [], ...extra,
});

describe('geometry', () => {
  it('knows right, turns and path cells', () => {
    expect(rightOf('S')).toBe('E');
    expect(rightOf('W')).toBe('S');
    expect(turnOf('S', 'N')).toBe('straight');
    expect(turnOf('S', 'W')).toBe('left');
    expect(turnOf('S', 'E')).toBe('right');
    expect(pathCells('S', 'N')).toEqual(['SE', 'NE']);
    expect(pathCells('S', 'E')).toEqual(['SE']);
    expect(pathCells('S', 'W')).toEqual(['SE', 'C', 'NW']);
    expect(pathCells('N', 'E')).toEqual(['NW', 'C', 'SE']);
  });

  it('detects conflicts the way the exam expects', () => {
    const m = (from, to) => ({ from, to });
    expect(movementsConflict(m('S', 'N'), m('E', 'W'))).toBe(true);   // crossing straights
    expect(movementsConflict(m('S', 'N'), m('N', 'S'))).toBe(false);  // opposite straights
    expect(movementsConflict(m('S', 'E'), m('N', 'S'))).toBe(false);  // right turn vs oncoming straight
    expect(movementsConflict(m('S', 'W'), m('N', 'S'))).toBe(true);   // left turn vs oncoming straight
    expect(movementsConflict(m('S', 'W'), m('N', 'E'))).toBe(false);  // opposite left turns
    expect(movementsConflict(m('S', 'E'), m('W', 'E'))).toBe(true);   // merge into the same lane
    expect(movementsConflict(m('S', 'E'), m('N', 'W'))).toBe(false);  // two right turns
    expect(movementsConflict(m('N', 'W'), m('W', 'E'))).toBe(true);   // right turn vs straight out of the entered arm (exam)
    expect(movementsConflict(m('N', 'W'), m('W', 'S'))).toBe(true);   // right turn vs right turn out of the entered arm (ds-23)
    expect(movementsConflict(m('S', 'W'), m('W', 'S'))).toBe(false);  // left turn vs right turn swapping roads (ds-06)
  });
});

describe('engine', () => {
  it('ds-01: no signs, blue from the right goes first, red turning left goes last', () => {
    const r = resolve(scene([car('you', 'S', 'W'), car('red', 'W', 'N'), car('blue', 'E', 'W')]));
    expect(r.order).toEqual([['blue'], ['you'], ['red']]);
  });

  it('roundabout sign only: the entering car has priority by the right-hand rule', () => {
    const r = resolve(scene([car('blue', 'ring', 'E'), car('red', 'S', 'ring')], { layout: 'roundabout', signs: { S: 'roundabout' } }));
    expect(r.order).toEqual([['red'], ['blue']]);
  });

  it('roundabout with yield or stop: the circulating car has priority', () => {
    for (const sign of ['roundabout-yield', 'roundabout-stop']) {
      const r = resolve(scene([car('blue', 'ring', 'E'), car('red', 'S', 'ring')], { layout: 'roundabout', signs: { S: sign } }));
      expect(r.order).toEqual([['blue'], ['red']]);
    }
  });

  it('side road yields to the main road, then right-hand rule among the main road', () => {
    const r = resolve(scene([car('you', 'S', 'N'), car('red', 'E', 'W'), car('green', 'W', 'E')], { signs: { S: 'yield' } }));
    // red and green are opposite straights: together, before you.
    expect(r.order).toEqual([['red', 'green'], ['you']]);
  });

  it('tram goes before cars at equal priority, and a left turn yields to oncoming trams', () => {
    const r = resolve(scene([car('you', 'S', 'W'), tram('tram1', 'N', 'S')], { tramTracks: [{ from: 'N', to: 'S' }] }));
    expect(r.order).toEqual([['tram1'], ['you']]);
  });

  it('protected left turn on the exit arrow beats oncoming traffic and trams', () => {
    const r = resolve(scene(
      [car('red', 'S', 'W'), car('blue', 'S', 'N'), car('green', 'N', 'E'), car('yellow', 'N', 'S'), tram('tram1', 'N', 'S')],
      { control: { type: 'lights', arms: { S: 'green', N: 'green', E: 'red', W: 'red' }, exitArrows: { S: 'left' } } }
    ));
    expect(r.order[0]).toEqual(expect.arrayContaining(['red', 'blue']));
    expect(r.order[0]).not.toContain('green');
  });

  it('flags a four-way deadlock instead of inventing an order', () => {
    const r = resolve(scene([car('a', 'N', 'S'), car('b', 'E', 'W'), car('c', 'S', 'N'), car('d', 'W', 'E')]));
    expect(r.deadlock).toBe(true);
  });
});
