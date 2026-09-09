import { resolve } from '../src/lib/priority/engine';
import { buildTimeline, judgeGo, scoreCrossing, startsAfterGo, patienceFor, FIRST_GROUP_AT, GROUP_GAP_MS } from '../src/lib/priority/timeline';

const car = (id, from, to) => ({ id, kind: 'car', color: id, from, to });
const base = { layout: 'cross', arms: ['N', 'E', 'S', 'W'], signs: {}, mainRoad: null, tramTracks: [], control: null, pedestrians: [] };

describe('timeline', () => {
  it('lets the player go at once when nobody has priority over them', () => {
    const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('red', 'W', 'E')] };
    const tl = buildTimeline(scene, resolve(scene), 1);
    expect(tl.youGoesAt).toBe(0);
    expect(tl.starts.red).toBeNull();
    expect(judgeGo(tl, scene, FIRST_GROUP_AT).verdict).toBe('ok');
    expect(judgeGo(tl, scene, tl.deadline + 1).verdict).toBe('late');
  });

  it('makes the player wait for the car on the right and names it when cut off', () => {
    const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('blue', 'E', 'W')] };
    const tl = buildTimeline(scene, resolve(scene), 3);
    expect(tl.youGoesAt).toBe(1);
    expect(tl.starts.blue).toBe(FIRST_GROUP_AT);
    expect(tl.clearAt).toBeGreaterThan(FIRST_GROUP_AT);
    expect(judgeGo(tl, scene, FIRST_GROUP_AT + 100)).toEqual({ verdict: 'early', culprit: 'blue' });
    expect(judgeGo(tl, scene, tl.clearAt + 10).verdict).toBe('ok');
    expect(tl.deadline - tl.clearAt).toBe(patienceFor(3));
  });

  it('starts later groups after the player goes', () => {
    const scene = { ...base, vehicles: [car('you', 'S', 'N'), car('red', 'W', 'E'), car('green', 'N', 'E')] };
    const r = resolve(scene);
    const tl = buildTimeline(scene, r, 1);
    const starts = startsAfterGo(scene, r, tl, 2000);
    expect(starts.you).toBe(2000);
    expect(starts.green).toBe(2000 + GROUP_GAP_MS * (r.order.findIndex((g) => g.includes('green')) - tl.youGoesAt));
  });

  it('scores reaction and streak', () => {
    expect(scoreCrossing({ level: 1, goAt: 1000, clearAt: 1000, deadline: 3000 })).toBe(200);
    expect(scoreCrossing({ level: 1, goAt: 3000, clearAt: 1000, deadline: 3000 })).toBe(100);
    expect(scoreCrossing({ level: 5, goAt: 1000, clearAt: 1000, deadline: 3000, streak: 10 })).toBe(560);
  });
});
