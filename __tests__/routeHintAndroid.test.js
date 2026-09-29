import { act, create } from 'react-test-renderer';
import { RouteHint, chordsPerPeriod, tightestRadius } from '../components/game/RouteHint.android';
import { HINT_DASH_OFF, HINT_DASH_ON, HINT_WINDOW, arrowAt, pointAt, routeDistance, routeTable } from '../src/lib/priority/routeHint';
import { appendNativePose, nativePoseAt } from '../src/lib/priority/nativeMotion';
import { lessonScene } from '../src/lib/priority/lessons';
import { pointAlong, vehiclePath } from '../src/lib/priority/layout';

// Animated styles are evaluated at render, so a re-render at a new camera
// clock shows where the UI-thread worklets would put every piece.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  useAnimatedStyle: updater => updater(),
}));
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, G: View, Polygon: View };
});

const host = node => typeof node.type === 'string';
const chordsOf = tree => tree.root.findAll(node => host(node) && node.props.style?.[0]?.backgroundColor?.startsWith('rgba(255,255,255'));
const dashesOf = tree => tree.root.findAll(node => host(node) && node.props.style?.borderRadius !== undefined && node.props.style?.backgroundColor);
// The only transform-animated piece without a background is the arrowhead's view around its static SVG.
const headOf = tree => tree.root.findAll(node => host(node) && Array.isArray(node.props.style) && node.props.style[1]?.transform && !node.props.style[0].backgroundColor)[0];

// A straight crossing, a car from the left, one from ahead, and the roundabout.
describe.each([1, 3, 7, 10])('lesson %i', lesson => {
  const scene = lessonScene(lesson), vehicle = scene.vehicles.find(car => car.id !== 'you');
  const path = vehiclePath(scene, vehicle);
  const scale = 3;
  const at = frame => frame < 30 ? { ...pointAlong(path.approach, frame / 30), progress: 0 }
    : { ...pointAlong(path.through, (frame - 30) / 90), progress: (frame - 30) / 90 };
  const table = routeTable(path, at(0));
  const { minX, minY } = table.bounds;
  const camera = { px: { value: 0 }, py: { value: 0 }, heading: { value: 0 }, clock: { value: 0 } };
  let history = [{ x: routeDistance(table, at(0), 0), y: 0, angle: 0, time: 0 }];
  for (let frame = 1; frame <= 60; frame++) history = appendNativePose(history, { x: routeDistance(table, at(frame), at(frame).progress), y: 0, angle: 0, time: frame * 1000 / 30 });
  const samples = { value: history };
  const render = () => <RouteHint table={table} color={vehicle.color} ox={7} oy={-4} rot={90} scale={scale} samples={samples} camera={camera} />;

  test('the window is the same 35 units of 3-on 2-off dashes over a white under-stroke, with round caps', () => {
    let tree;
    try {
      camera.clock.value = 55 * 1000 / 30;
      act(() => { tree = create(render()); });
      const chords = chordsOf(tree);
      // A route that bends gets three chords per dash period, a straight one gets one.
      const perPeriod = chordsPerPeriod(table);
      expect(perPeriod).toBe(tightestRadius(table) < 12 ? 3 : 1);
      expect(chords).toHaveLength(7 * perPeriod);
      const total = chords.reduce((sum, chord) => sum + chord.props.style[0].width, 0) / scale;
      // The SVG's single 35-unit dash gets a 1.1-unit round cap at each end.
      expect(total).toBeCloseTo(HINT_WINDOW + 2.2, 9);
      expect(chords[0].props.style[0].borderTopLeftRadius).toBeCloseTo(1.1 * scale, 9);
      expect(chords[chords.length - 1].props.style[0].borderTopRightRadius).toBeCloseTo(1.1 * scale, 9);
      expect(chords[1].props.style[0].borderTopRightRadius).toBe(0);
      chords.forEach(chord => expect(chord.props.style[0].height).toBeCloseTo(2.2 * scale, 9));
      const dashes = dashesOf(tree);
      expect(dashes).toHaveLength(HINT_WINDOW / (HINT_DASH_ON + HINT_DASH_OFF));
      dashes.forEach(dash => {
        expect(dash.props.style.width).toBeCloseTo((HINT_DASH_ON + 1.2) * scale, 9);
        expect(dash.props.style.height).toBeCloseTo(1.2 * scale, 9);
        expect(dash.props.style.backgroundColor).toMatch(/^rgba\(\d+,\d+,\d+,0\.38\)$/);
      });
      // The canvas corner and rotation are the ones the iOS hint uses.
      const canvas = tree.root.findAll(node => host(node) && node.props.style?.transformOrigin === 'top left')[0];
      expect(canvas.props.style.left).toBe(7 * scale);
      expect(canvas.props.style.top).toBe(-4 * scale);
      expect(canvas.props.style.transform).toEqual([{ rotate: '90deg' }]);
    } finally {
      if (tree) act(() => tree.unmount());
    }
  });

  test('every chord and the arrowhead sit on the route at the interpolated car distance, between snapshots', () => {
    let tree;
    try {
      for (const time of [40 * 1000 / 30 + 10, 41 * 1000 / 30 + 20, 59 * 1000 / 30]) {
        camera.clock.value = time;
        // The hint is memoised and its props never change, so mount afresh to
        // read what the worklets evaluate at this clock.
        if (tree) act(() => tree.unmount());
        act(() => { tree = create(render()); });
        const s = nativePoseAt(samples.value, time).x;
        const chords = chordsOf(tree);
        let cursor = -1.1;
        chords.forEach(chord => {
          const { width, height } = chord.props.style[0];
          const [{ translateX }, { translateY }, { rotate }] = chord.props.style[1].transform;
          const length = width / scale, mid = cursor + length / 2;
          const p = pointAt(table, s + mid);
          expect(translateX + width / 2).toBeCloseTo((p.x - minX) * scale, 9);
          expect(translateY + height / 2).toBeCloseTo((p.y - minY) * scale, 9);
          expect(rotate).toBe(`${p.angle}deg`);
          cursor += length;
        });
        expect(cursor).toBeCloseTo(HINT_WINDOW + 1.1, 9);
        // Each period's dash is centred one unit past where the SVG pattern
        // centres it (2.5, 7.5, ... 32.5 units from the car), on the period's middle chord.
        const perPeriod = chordsPerPeriod(table), chordLength = 5 / perPeriod;
        chords.forEach((chord, i) => {
          const dash = chord.children.find(child => typeof child !== 'string' && child.props.style?.borderRadius !== undefined);
          if (i % perPeriod !== Math.floor(perPeriod / 2)) { expect(dash).toBeUndefined(); return; }
          const chordStart = i === 0 ? -1.1 : i * chordLength;
          // left is measured from the chord's start and includes the dash's own round cap.
          expect(dash.props.style.left / scale + 0.6 + 1.5 + chordStart).toBeCloseTo(Math.floor(i / perPeriod) * 5 + 2.5, 9);
        });
        const head = headOf(tree);
        const { width } = head.props.style[0];
        const [{ translateX }, { translateY }, { rotate }] = head.props.style[1].transform;
        const end = arrowAt(table, s);
        expect(translateX + width / 2).toBeCloseTo((end.x - minX) * scale, 9);
        expect(translateY + width / 2).toBeCloseTo((end.y - minY) * scale, 9);
        expect(rotate).toBe(`${end.angle}deg`);
      }
    } finally {
      if (tree) act(() => tree.unmount());
    }
  });
});
