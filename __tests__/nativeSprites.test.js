import { act, create } from 'react-test-renderer';
import { WorldVehicle } from '../components/game/WorldVehicle.native';
import { WorldPathHint } from '../components/game/WorldPathHint.native';
import { __paint as paintVehicle } from '../components/game/VehicleBody';
import { RouteHint } from '../components/game/RouteHint.native';
import { lessonScene } from '../src/lib/priority/lessons';
import { pointAlong, vehiclePath } from '../src/lib/priority/layout';

jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: require('react-native').View },
  Easing: { linear: value => value }, ReduceMotion: { Never: 'never' },
  useSharedValue: value => require('react').useRef({ value }).current,
  useAnimatedStyle: updater => updater(),
}));
jest.mock('react-native-svg', () => ({ __esModule: true, default: require('react-native').View }));
jest.mock('../components/game/SceneCamera.native', () => {
  // The real hook returns one memoized context value for the whole scene.
  const camera = { px: { value: 0 }, py: { value: 0 }, heading: { value: 0 }, clock: { value: 0 } };
  return { useSceneCamera: () => camera };
});
jest.mock('../components/game/VehicleBody', () => {
  const paint = jest.fn(() => null);
  return { VehicleBody: require('react').memo(paint), __paint: paint };
});
jest.mock('../components/game/RouteHint.native', () => {
  const paint = jest.fn(() => null);
  return { RouteHint: require('react').memo(paint), __paint: paint };
});
const paintHint = require('../components/game/RouteHint.native').__paint;

test.each(['car', 'tram'])('a straight %s is not repainted by an unrelated indicator; actual lamps still update', kind => {
  const props = { v: { id: 'one', kind, color: 'red', from: 'N', to: 'S' }, pose: { x: 0, y: 0, angle: 0 }, width: 393, height: 700, scale: 3, shake: 0 };
  let tree;
  try {
    paintVehicle.mockClear();
    act(() => { tree = create(<WorldVehicle {...props} snapshotTime={0} blinkOn />); });
    for (let frame = 1; frame <= 90; frame++) act(() => tree.update(<WorldVehicle {...props} snapshotTime={frame * 1000 / 30} blinkOn={frame % 10 < 5} />));
    expect(paintVehicle).toHaveBeenCalledTimes(1);
    act(() => tree.update(<WorldVehicle {...props} snapshotTime={3033} signal="left" blinkOn />));
    expect(paintVehicle).toHaveBeenCalledTimes(2);
    act(() => tree.update(<WorldVehicle {...props} snapshotTime={3066} signal="left" blinkOn={false} />));
    expect(paintVehicle).toHaveBeenCalledTimes(3);
    act(() => tree.update(<WorldVehicle {...props} snapshotTime={3100} signal="left" blinkOn={false} brakeLights />));
    expect(paintVehicle).toHaveBeenCalledTimes(4);
  } finally {
    if (tree) act(() => tree.unmount());
  }
});

test('a path hint never re-renders its route artwork while the car drives; only its distance sample changes', () => {
  const scene = lessonScene(1), vehicle = scene.vehicles.find(car => car.id !== 'you');
  const path = vehiclePath(scene, vehicle);
  const junction = { index: 0, scene, rot: 90, cx: 300, cy: -40 };
  const props = { width: 393, height: 700, scale: 3, shake: 0 };
  const at = frame => frame < 30 ? { ...pointAlong(path.approach, frame / 30), progress: 0 }
    : { ...pointAlong(path.through, (frame - 30) / 90), progress: (frame - 30) / 90 };
  const traffic = frame => ({ junction, vehicle, pose: { x: 0, y: 0, angle: 0 }, progress: at(frame).progress });
  let tree;
  try {
    paintHint.mockClear();
    act(() => { tree = create(<WorldPathHint {...props} traffic={traffic(0)} local={at(0)} snapshotTime={0} />); });
    for (let frame = 1; frame <= 90; frame++) act(() => tree.update(<WorldPathHint {...props} traffic={traffic(frame)} local={at(frame)} snapshotTime={frame * 1000 / 30} />));
    expect(paintHint).toHaveBeenCalledTimes(1);
    const [first] = paintHint.mock.calls[0];
    expect(first.table.d.startsWith('M ')).toBe(true);
    // The route table, the sample store and the camera are the same objects
    // throughout; the distance samples advance with the car.
    expect(first.samples.value.length).toBeGreaterThan(1);
    const last = first.samples.value[first.samples.value.length - 1];
    expect(last.time).toBe(90 * 1000 / 30);
    expect(last.x).toBeGreaterThan(first.samples.value[0].x);
    expect(RouteHint).toBeDefined();
    // Re-placing the junction after a turn does move the canvas, once.
    junction.cx = 420;
    act(() => tree.update(<WorldPathHint {...props} traffic={traffic(91)} local={at(91)} snapshotTime={91 * 1000 / 30} />));
    expect(paintHint).toHaveBeenCalledTimes(2);
    expect(paintHint.mock.calls[1][0].table).toBe(first.table);
    // Past the fade-out point nothing is drawn.
    act(() => tree.update(<WorldPathHint {...props} traffic={{ ...traffic(0), progress: 0.9 }} local={at(111)} snapshotTime={92 * 1000 / 30} />));
    expect(tree.toJSON()).toBeNull();
  } finally {
    if (tree) act(() => tree.unmount());
  }
});
