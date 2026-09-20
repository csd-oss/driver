import { act, create } from 'react-test-renderer';
import { WorldVehicle } from '../components/game/WorldVehicle.native';
import { WorldPathHint } from '../components/game/WorldPathHint.native';
import { __paint as paintVehicle } from '../components/game/VehicleBody';
import { PathTrail } from '../components/game/PathArrow';
import { lessonScene } from '../src/lib/priority/lessons';
import { vehiclePath } from '../src/lib/priority/layout';

jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: require('react-native').View },
  Easing: { linear: value => value }, ReduceMotion: { Never: 'never' },
  useSharedValue: value => require('react').useRef({ value }).current,
  useAnimatedStyle: updater => updater(),
}));
jest.mock('react-native-svg', () => ({ __esModule: true, default: require('react-native').View }));
jest.mock('../components/game/SceneCamera.native', () => ({
  useSceneCamera: () => ({ px: { value: 0 }, py: { value: 0 }, heading: { value: 0 }, clock: { value: 0 } }),
}));
jest.mock('../components/game/VehicleBody', () => {
  const paint = jest.fn(() => null);
  return { VehicleBody: require('react').memo(paint), __paint: paint };
});
jest.mock('../components/game/PathArrow', () => ({ PathTrail: jest.fn(() => null) }));

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

test('a waiting car keeps its SVG path artwork until it actually moves', () => {
  const scene = lessonScene(1), vehicle = scene.vehicles.find(car => car.id !== 'you');
  const path = vehiclePath(scene, vehicle), local = path.approach[0];
  const traffic = { junction: { index: 0, scene, rot: 0 }, vehicle, pose: { ...local, angle: 0 }, progress: 0 };
  const props = { width: 393, height: 700, scale: 3, shake: 0 };
  let tree;
  try {
    PathTrail.mockClear();
    act(() => { tree = create(<WorldPathHint {...props} traffic={traffic} local={local} snapshotTime={0} />); });
    for (let frame = 1; frame <= 90; frame++) act(() => tree.update(<WorldPathHint {...props} traffic={{ ...traffic }} local={{ ...local }} snapshotTime={frame * 1000 / 30} />));
    expect(PathTrail).toHaveBeenCalledTimes(1);
    const next = path.approach[1];
    act(() => tree.update(<WorldPathHint {...props} traffic={{ ...traffic, pose: { ...next, angle: 0 } }} local={next} snapshotTime={3033} />));
    expect(PathTrail).toHaveBeenCalledTimes(2);
  } finally {
    if (tree) act(() => tree.unmount());
  }
});
