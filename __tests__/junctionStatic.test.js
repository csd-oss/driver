import {
  approachLine,
  armRect,
  boxRect,
  extensionShapes,
  laneLines,
  mainRoadBend,
  pedestrianPoint,
  trackRailPaths,
} from '../components/game/roadShapes';
import scenes from '../data/game/scenes.json';

// The shapes `JunctionStatic` draws one junction from. react-test-renderer is
// not a declared dependency, so the geometry is tested straight instead.
const base = { layout: 'cross', arms: ['N', 'E', 'S', 'W'], signs: {}, mainRoad: null, tramTracks: [], control: null, vehicles: [], pedestrians: [] };
const tram = { ...base, tramTracks: [{ from: 'W', to: 'E' }] };
const halfOf = (scene, arm) => {
  const r = armRect(scene, arm, 0);
  return arm === 'N' || arm === 'S' ? r.w / 2 : r.h / 2;
};

describe('road shapes', () => {
  it('draws a plain junction 24 wide with a 24 x 24 box', () => {
    for (const arm of base.arms) expect(halfOf(base, arm)).toBe(12);
    expect(boxRect(base)).toEqual({ x: 38, y: 38, w: 24, h: 24 });
    expect(armRect(base, 'N', 0)).toEqual({ x: 38, y: 0, w: 24, h: 50 });
    expect(armRect(base, 'E', 20)).toEqual({ x: 50, y: 38, w: 70, h: 24 });
  });

  it('widens only the arms that carry tracks', () => {
    expect(halfOf(tram, 'W')).toBe(18);
    expect(halfOf(tram, 'E')).toBe(18);
    expect(halfOf(tram, 'N')).toBe(12);
    expect(halfOf(tram, 'S')).toBe(12);
    // The box is as wide as the N–S road and as tall as the (wide) E–W road.
    expect(boxRect(tram)).toEqual({ x: 38, y: 32, w: 24, h: 36 });
  });

  it('leaves roundabouts alone', () => {
    const ring = { ...tram, layout: 'roundabout' };
    for (const arm of ring.arms) expect(halfOf(ring, arm)).toBe(12);
  });

  it('tapers an extended wide arm down to the plain road', () => {
    const segs = extensionShapes(tram, 'W', 40, true);
    expect(segs[0].halfFrom).toBe(18);
    expect(segs[segs.length - 1].halfTo).toBe(12);
    expect(segs).toEqual([
      { from: 0, to: 10, halfFrom: 18, halfTo: 18 },
      { from: 10, to: 24, halfFrom: 18, halfTo: 12 },
      { from: 24, to: 40, halfFrom: 12, halfTo: 12 },
    ]);
    // Half way into the taper is half way between the two widths.
    expect(extensionShapes(tram, 'W', 17, true)[1]).toEqual({ from: 10, to: 17, halfFrom: 18, halfTo: 15 });
    // A tram street only cut off by the frame keeps its width, and a plain arm never tapers.
    expect(extensionShapes(tram, 'W', 40)).toEqual([{ from: 0, to: 40, halfFrom: 18, halfTo: 18 }]);
    expect(extensionShapes(base, 'S', 40, true)).toEqual([{ from: 0, to: 40, halfFrom: 12, halfTo: 12 }]);
    expect(extensionShapes(base, 'S', 0, true)).toEqual([]);
  });

  it('replaces the centre line with a lane line each side of the tracks', () => {
    expect(laneLines(base, 'N', 0)).toEqual([{ x1: 50, y1: 0, x2: 50, y2: 38 }]);
    expect(laneLines(tram, 'W', 0)).toEqual([
      { x1: 0, y1: 56, x2: 38, y2: 56 },
      { x1: 0, y1: 44, x2: 38, y2: 44 },
    ]);
    // A plain arm crossing a tram road still stops at the (taller) box.
    expect(laneLines(tram, 'N', 0)).toEqual([{ x1: 50, y1: 0, x2: 50, y2: 32 }]);
  });

  it('runs four rails along a track and bends them through the box', () => {
    const straight = trackRailPaths(tram, tram.tramTracks[0], 10, 0);
    expect(straight).toHaveLength(4);
    expect(straight[0]).toBe('M -10 51.6 L 38 51.6 L 62 51.6 L 100 51.6');
    expect(straight.some((d) => d.includes('Q'))).toBe(false);
    // A turning track widens both its arms, so the box it bends through is 36 x 36.
    const turn = { from: 'W', to: 'S' };
    const bent = trackRailPaths({ ...base, tramTracks: [turn] }, turn);
    expect(bent).toHaveLength(4);
    expect(bent[0]).toBe('M 0 51.6 L 32 51.6 Q 48.4 51.6 48.4 68 L 48.4 100');
  });

  it('keeps the plain stop line and moves the one beside tracks into the car lane', () => {
    expect(approachLine(base, 'N')).toEqual({ x1: 38, y1: 37, x2: 50, y2: 37 });
    expect(approachLine(tram, 'W')).toEqual({ x1: 37, y1: 56, x2: 37, y2: 68 });
    expect(approachLine(tram, 'N')).toEqual({ x1: 38, y1: 31, x2: 50, y2: 31 });
    // A pedestrian waits at the kerb, where the plain-road position has always been.
    expect(pedestrianPoint(base, 'N')).toEqual({ x: 38, y: 35.5 });
    expect(pedestrianPoint(tram, 'W')).toEqual({ x: 35.5, y: 68 });
  });

  it('draws every official scene with finite coordinates', () => {
    const finite = (o) => Object.values(o).every((v) => Number.isFinite(v));
    for (const scene of scenes) {
      for (const arm of scene.arms) {
        expect(finite(armRect(scene, arm, 20))).toBe(true);
        expect(laneLines(scene, arm, 20).every(finite)).toBe(true);
        expect(finite(approachLine(scene, arm))).toBe(true);
        expect(finite(pedestrianPoint(scene, arm))).toBe(true);
      }
      expect(finite(boxRect(scene))).toBe(true);
      for (const t of scene.tramTracks ?? []) {
        expect(trackRailPaths(scene, t, 20, 20).every((d) => !d.includes('NaN'))).toBe(true);
      }
    }
  });

  it('knows which way the main road bends from each arm', () => {
    const bent = { ...base, mainRoad: ['S', 'E'] };
    expect(mainRoadBend(bent, 'S')).toBe('right');
    expect(mainRoadBend(bent, 'E')).toBe('left');
    expect(mainRoadBend(bent, 'N')).toBeNull();
    expect(mainRoadBend({ ...base, mainRoad: ['S', 'N'] }, 'S')).toBeNull();
    expect(mainRoadBend(base, 'S')).toBeNull();
  });
});
