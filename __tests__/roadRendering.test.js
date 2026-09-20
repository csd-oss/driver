import { act, create } from 'react-test-renderer';
import { WorldRoads } from '../components/game/WorldRoads';
import { JunctionStatic } from '../components/game/JunctionStatic';
import { lessonScene, LESSONS } from '../src/lib/priority/lessons';

jest.mock('../components/game/JunctionStatic', () => ({ JunctionStatic: jest.fn(() => null) }));
jest.mock('../components/game/StreetEnvironment', () => ({ StreetEnvironment: () => null }));

const scene = () => lessonScene(LESSONS.findIndex(lesson => lesson.id === 'lights'));
const phases = phase => ({ N: phase, S: phase, E: 'red', W: 'red' });

test.each([true, false])('road artwork is stable across snapshots; live lamps=%s', renderLights => {
  JunctionStatic.mockClear();
  const junction = { index: 0, cx: 50, cy: 50, rot: 0, scene: scene(), gapBefore: 16, gapAfter: 40 };
  let tree;
  act(() => { tree = create(<WorldRoads junctions={[junction]} lights={{ 0: phases('green') }} renderLights={renderLights} />); });
  for (let frame = 0; frame < 90; frame++) {
    // The simulation creates new arrays/maps on every snapshot.
    act(() => tree.update(<WorldRoads junctions={[junction]} lights={{ 0: phases('green') }} renderLights={renderLights} />));
  }
  expect(JunctionStatic).toHaveBeenCalledTimes(1);
  act(() => tree.update(<WorldRoads junctions={[junction]} lights={{ 0: phases('yellow') }} renderLights={renderLights} />));
  expect(JunctionStatic).toHaveBeenCalledTimes(renderLights ? 2 : 1);
  // A real route edit must still repaint, even though the junction is mutable.
  junction.gapAfter = 80;
  act(() => tree.update(<WorldRoads junctions={[junction]} lights={{ 0: phases('yellow') }} renderLights={renderLights} />));
  expect(JunctionStatic).toHaveBeenCalledTimes(renderLights ? 3 : 2);
  act(() => tree.unmount());
});
