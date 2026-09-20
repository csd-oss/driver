import { act, create } from 'react-test-renderer';
import Svg from 'react-native-svg';
import { RoadSurface } from '../components/game/RoadSurface.native';
import { WorldRoads } from '../components/game/WorldRoads';
import { lessonScene } from '../src/lib/priority/lessons';

jest.mock('../components/game/WorldRoads', () => ({ WorldRoads: jest.fn(() => null) }));
jest.mock('../components/game/SceneCamera.native', () => ({
  useSceneCamera: () => ({ px: { value: 0 }, py: { value: 0 }, heading: { value: 0 } }),
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  useAnimatedStyle: callback => callback(),
}));
jest.mock('react-native-svg', () => ({ __esModule: true, default: jest.fn(({ children }) => children) }));

test('native road snapshots reuse painted SVG trees while immutable patch handovers and real route edits still update', () => {
  const junction = { index: 0, cx: 50, cy: 50, rot: 0, scene: lessonScene(0), gapBefore: 16, gapAfter: 40 };
  const render = (x = 0, width = 393) => <RoadSurface width={width} height={700} span={138} viewHeight={246}
    you={{ x, y: 0, angle: 0 }} heading={0} shake={0} junctions={[junction]} lights={{}} />;
  let tree;
  try {
    act(() => { tree = create(render()); });
    expect(Svg).toHaveBeenCalledTimes(1);
    expect(WorldRoads).toHaveBeenCalledTimes(1);
    for (let frame = 0; frame < 90; frame++) act(() => tree.update(render(frame / 3)));
    expect(Svg).toHaveBeenCalledTimes(1);
    expect(WorldRoads).toHaveBeenCalledTimes(1);

    act(() => tree.update(render(32.1)));
    expect(Svg).toHaveBeenCalledTimes(2);
    expect(WorldRoads).toHaveBeenCalledTimes(2);
    // Crossing back uses the same two mounted patches, with no blank replacement.
    act(() => tree.update(render(31.9)));
    expect(Svg).toHaveBeenCalledTimes(2);
    expect(tree.root.findAllByType(Svg)).toHaveLength(2);

    // Mutable simulation objects require captured primitives, not identity alone.
    junction.gapAfter = 80;
    act(() => tree.update(render(31.9)));
    expect(Svg).toHaveBeenCalledTimes(4);
    expect(WorldRoads).toHaveBeenCalledTimes(4);
    junction.scene.vehicles.find(vehicle => vehicle.id === 'you').to = 'E';
    act(() => tree.update(render(31.9)));
    expect(WorldRoads).toHaveBeenCalledTimes(6);

    act(() => tree.update(render(31.9, 430)));
    expect(Svg).toHaveBeenCalledTimes(8);
    // Resize redraws the native bounds but can keep the unchanged road artwork.
    expect(WorldRoads).toHaveBeenCalledTimes(6);
  } finally {
    if (tree) act(() => tree.unmount());
  }
});
