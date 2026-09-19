import { railLinks } from '../src/lib/priority/railLinks';
import { createRun, applyInput, currentJunction, step } from '../src/lib/priority/world';
import { makeRng } from '../src/lib/priority/generator';

const junction = (index, tracks = [], arms = ['N', 'E', 'S', 'W'], to = 'N') => ({
  index, scene: { arms, tramTracks: tracks, vehicles: [{ id: 'you', to }] },
});

test('rails continue across a plain neighbour and turn into a side street', () => {
  const a = junction(0, [{ from: 'S', to: 'N' }]), b = junction(1);
  expect(railLinks([a, b]).get(1)).toEqual([{ from: 'S', to: 'E' }]);
  expect(b.scene.tramTracks).toEqual([]);
});

test('rails arriving from ahead connect back through the preceding junction', () => {
  const a = junction(0), b = junction(1, [{ from: 'S', to: 'E' }]);
  expect(railLinks([a, b]).get(0)).toEqual([{ from: 'N', to: 'E' }]);
});

test('connections propagate through streets without a side exit', () => {
  const streets = [junction(0, [{ from: 'S', to: 'N' }]), junction(1, [], ['S', 'N']), junction(2)];
  const result = railLinks(streets);
  expect(result.get(1)).toEqual([{ from: 'S', to: 'N' }]);
  expect(result.get(2)).toEqual([{ from: 'S', to: 'E' }]);
});

test('turning onto the tram road connects rails into the next junction', () => {
  const run = createRun(makeRng(1000), 1, { lesson: 9, continuousGuide: true });
  while (!currentJunction(run).scheduled) step(run, run.now + 32);
  applyInput(run, 'left');
  expect(run.junctions[1].railKey).toContain('S');
  const saved = run.junctions[1].railKey;
  const rails = run.junctions[1].scene.tramTracks;
  for (let frame = 0; frame < 20; frame++) step(run, run.now + 32);
  expect(run.junctions[1].railKey).toBe(saved);
  expect(run.junctions[1].scene.tramTracks).toEqual(rails);
});
