import { act, create } from 'react-test-renderer';
import { View } from 'react-native';
import { WorldPathHint } from '../components/game/WorldPathHint.native';
import { HINT_WINDOW, hintDashArrays, pointAt } from '../src/lib/priority/routeHint';
import { nativePoseAt } from '../src/lib/priority/nativeMotion';
import { lessonScene } from '../src/lib/priority/lessons';
import { pointAlong, vehiclePath } from '../src/lib/priority/layout';
import { toWorld } from '../src/lib/priority/world';

// Animated props stay callable so the UI-thread worklets can be evaluated at
// any clock time; animated components render as plain views.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View, createAnimatedComponent: component => component },
  Easing: { linear: value => value }, ReduceMotion: { Never: 'never' },
  useSharedValue: value => require('react').useRef({ value }).current,
  useAnimatedStyle: updater => updater(),
  useAnimatedProps: updater => ({ read: updater }),
}));
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, G: View, Path: View, Polygon: View };
});
const camera = { px: { value: 0 }, py: { value: 0 }, heading: { value: 0 }, clock: { value: 0 } };
jest.mock('../components/game/SceneCamera.native', () => ({ useSceneCamera: () => camera }));

test('the dash window and arrowhead follow the interpolated car on the UI thread, on a static route canvas', () => {
  const scene = lessonScene(7), vehicle = scene.vehicles.find(car => car.id !== 'you');
  const path = vehiclePath(scene, vehicle);
  const junction = { index: 0, scene, rot: 90, cx: 300, cy: -40 };
  const props = { width: 393, height: 700, scale: 3, shake: 0 };
  const at = frame => frame < 30 ? { ...pointAlong(path.approach, frame / 30), progress: 0 }
    : { ...pointAlong(path.through, (frame - 30) / 90), progress: (frame - 30) / 90 };
  const render = frame => <WorldPathHint {...props} traffic={{ junction, vehicle, pose: { x: 0, y: 0, angle: 0 }, progress: at(frame).progress }} local={at(frame)} snapshotTime={frame * 1000 / 30} />;
  let tree;
  try {
    act(() => { tree = create(render(0)); });
    const dash = hintDashArrays();
    const host = node => typeof node.type === 'string';
    const paths = tree.root.findAll(node => host(node) && node.props.strokeDasharray !== undefined);
    expect(paths).toHaveLength(2);
    expect(paths[0].props.strokeDasharray).toEqual(dash.under);
    expect(paths[1].props.strokeDasharray).toEqual(dash.dashes);
    expect(paths[0].props.d).toBe(paths[1].props.d);
    const { d } = paths[0].props;
    const svg = tree.root.findAll(node => host(node) && node.props.viewBox)[0];
    const [minX, minY, bw, bh] = svg.props.viewBox.split(' ').map(Number);
    const canvas = tree.root.findAll(node => host(node) && node.props.style?.transformOrigin === 'top left' && node.props.style?.left !== undefined)[0];
    // The canvas corner sits where the junction frame puts it, rotated with the junction.
    const corner = toWorld(junction, { x: minX, y: minY });
    expect(canvas.props.style.left).toBeCloseTo(corner.x * 3, 9);
    expect(canvas.props.style.top).toBeCloseTo(corner.y * 3, 9);
    expect(canvas.props.style.transform).toEqual([{ rotate: '90deg' }]);
    expect(canvas.props.style.width).toBeCloseTo(bw * 3, 9);
    expect(canvas.props.style.height).toBeCloseTo(bh * 3, 9);

    for (let frame = 1; frame <= 90; frame++) act(() => tree.update(render(frame)));
    // Same static props after ninety snapshots: React never rewrote the SVG.
    const after = tree.root.findAll(node => host(node) && node.props.strokeDasharray !== undefined);
    expect(after[0].props.d).toBe(d);
    expect(tree.root.findAll(node => host(node) && node.props.viewBox)[0].props.viewBox).toBe(svg.props.viewBox);

    const head = tree.root.findAll(node => host(node) && node.props.animatedProps?.read && node.props.transform !== undefined)[0];
    const hint = tree.root.findAll(node => node.props.samples && node.props.table)[0].props;
    const samplesOf = hint.samples, table = hint.table;
    // Evaluate the worklets between two of the retained snapshots, as the
    // display frame would; the camera clock already carries the playback delay.
    for (const time of [86 * 1000 / 30 + 10, 87 * 1000 / 30 + 20, 89 * 1000 / 30]) {
      camera.clock.value = time;
      const s = nativePoseAt(samplesOf.value, time).x;
      expect(after[0].props.animatedProps.read().strokeDashoffset).toBeCloseTo(dash.period - s, 9);
      expect(after[1].props.animatedProps.read().strokeDashoffset).toBeCloseTo(dash.period - s, 9);
      const { matrix } = head.props.animatedProps.read();
      // The head's translation is the window's end on the route, its rotation the tangent.
      const end = pointAt(table, s + HINT_WINDOW);
      expect(matrix[4]).toBeCloseTo(end.x, 9);
      expect(matrix[5]).toBeCloseTo(end.y, 9);
      expect(Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI).toBeCloseTo(end.angle, 6);
      expect(matrix[2]).toBeCloseTo(-matrix[1], 9);
      // The window starts where the sprite is: between the two snapshots either side.
      const frame = time / (1000 / 30);
      const before = at(Math.floor(frame)), next = at(Math.ceil(frame));
      const start = pointAt(table, s);
      const span = Math.hypot(next.x - before.x, next.y - before.y) + 0.05;
      expect(Math.hypot(start.x - before.x, start.y - before.y)).toBeLessThanOrEqual(span);
      expect(Math.hypot(start.x - next.x, start.y - next.y)).toBeLessThanOrEqual(span);
    }
  } finally {
    if (tree) act(() => tree.unmount());
  }
});

test('the hint canvas still rides the shared camera transform like every other world layer', () => {
  const scene = lessonScene(1), vehicle = scene.vehicles.find(car => car.id !== 'you');
  const path = vehiclePath(scene, vehicle);
  const local = pointAlong(path.approach, 0.5);
  camera.px.value = 120; camera.py.value = -30; camera.heading.value = 45;
  let tree;
  try {
    act(() => { tree = create(<WorldPathHint width={393} height={700} scale={3} shake={2} traffic={{ junction: { index: 0, scene, rot: 0, cx: 50, cy: 50 }, vehicle, pose: { x: 0, y: 0, angle: 0 }, progress: 0 }} local={local} snapshotTime={0} />); });
    const outer = tree.root.findAllByType(View)[0];
    const [base, animated] = outer.props.style;
    expect(base).toEqual({ position: 'absolute', left: 393 / 2 + 2 * 3, top: 700 * .72, width: 0, height: 0 });
    expect(animated.transform).toEqual([{ rotate: '-45deg' }, { translateX: -360 }, { translateY: 90 }]);
  } finally {
    camera.px.value = 0; camera.py.value = 0; camera.heading.value = 0;
    if (tree) act(() => tree.unmount());
  }
});
