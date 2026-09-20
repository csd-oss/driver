import { spaceTraffic } from '../src/lib/priority/traffic';
import * as timeline from '../src/lib/priority/timeline';

// Captured from route 1, junction 20 when a left turn releases three cars.
// A car waiting on the east approach occupies the same position during
// every retry. Postponing it cannot remove that earlier overlap.
const waitingQueue = () => ({
  scene: {
    layout: 'cross', arms: ['N', 'E', 'S', 'W'], signs: {}, mainRoad: null,
    tramTracks: [], control: null, pedestrians: [],
    vehicles: [
      { id: 'you', kind: 'car', from: 'S', to: 'W' },
      { id: 'yellow', kind: 'car', from: 'E', to: 'W' },
      { id: 'blue', kind: 'car', from: 'N', to: 'W' },
      { id: 'red', kind: 'van', from: 'W', to: 'S' },
      { id: 'green', kind: 'car', from: 'E', to: 'S' },
    ],
  },
  starts: { you: null, yellow: 6183, blue: 3526, red: 700, green: 5500 },
  t0: 0,
  rollIn: { you: 0, yellow: 0, blue: 0, red: 0, green: 5500 },
  queueBack: { you: 0, yellow: 0, blue: 0, red: 0.75, green: 13 },
  pathCache: {},
});

afterEach(() => jest.restoreAllMocks());

test('a stationary queue reserves the same start times without rechecking a futile delay 100 times', () => {
  const junction = waitingQueue();
  const sample = jest.spyOn(timeline, 'poseAt');
  spaceTraffic(junction, 0, ['blue', 'green', 'yellow']);
  expect(junction.starts).toEqual({ you: null, yellow: 31183, blue: 3526, red: 700, green: 5500 });
  // The former retry loop made more than 15,000 trajectory samples here.
  // A work bound is deterministic and catches this hitch without timing CI.
  expect(sample.mock.calls.length).toBeLessThan(1000);
});

test('reservations sample changed vehicle starts afresh on the next call', () => {
  const junction = waitingQueue();
  spaceTraffic(junction, 0, ['blue', 'green', 'yellow']);
  junction.starts = { you: null, yellow: 6183, blue: -20000, red: -20000, green: -20000 };
  const fromScratch = waitingQueue();
  fromScratch.starts = { ...junction.starts };
  spaceTraffic(junction, 0, ['yellow']);
  spaceTraffic(fromScratch, 0, ['yellow']);
  expect(junction.starts).toEqual(fromScratch.starts);
  expect(junction.starts.yellow).toBe(6183);
});
