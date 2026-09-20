import { appendNativePose, nativePoseAt, NATIVE_PLAYBACK_DELAY } from '../src/lib/priority/nativeMotion';
import { SNAPSHOT_MS } from '../src/lib/priority/render';

const pose = (time, x = time * .024, angle = 0) => ({ time, x, y: 3, angle });

function replay(hz) {
  const arrivals = [];
  let time = 0;
  const intervals = [25, 1000 / 24, 50, 1000 / 60, 1000 / 30, 1000 / 15, 1000 / 60];
  for (let i = 0; time < 10000; i++) {
    time += intervals[i % intervals.length];
    // A two-slot sampling gap uses all the buffer; ordinary gaps also include
    // independent React delivery jitter, as observed on a busy JS thread.
    const deliveryDelay = i % intervals.length === 5 ? 0 : [0, 4, 11, 0][i % 4];
    arrivals.push({ sample: pose(time), at: time + deliveryDelay });
  }
  let history = [pose(0)], next = 0;
  let oldFrom = 0, oldTo = 0, oldAt = 0;
  const oldValue = at => oldFrom + (oldTo - oldFrom) * Math.min(1, Math.max(0, (at - oldAt) / SNAPSHOT_MS));
  let previous, previousOld, flat = 0, oldFlat = 0, maxError = 0;
  for (let frame = 0; frame < hz * 10; frame++) {
    const displayTime = frame * 1000 / hz;
    while (next < arrivals.length && arrivals[next].at <= displayTime) {
      const { sample, at } = arrivals[next++];
      history = appendNativePose(history, sample);
      oldFrom = oldValue(at); oldTo = sample.x; oldAt = at;
    }
    const expectedTime = displayTime - NATIVE_PLAYBACK_DELAY;
    const actual = nativePoseAt(history, expectedTime).x;
    const old = oldValue(displayTime);
    // The initial buffer intentionally waits for its first complete segment.
    if (displayTime > 200) {
      if (actual - previous < 1e-8) flat++;
      if (old - previousOld < 1e-8) oldFlat++;
      maxError = Math.max(maxError, Math.abs(actual - expectedTime * .024));
    }
    previous = actual; previousOld = old;
  }
  return { flat, oldFlat, maxError };
}

describe('timestamped native motion', () => {
  test.each([60, 120])('uneven sample delivery does not introduce fixed-timer pauses at %i Hz', hz => {
    const result = replay(hz);
    // Missed display frames in the old timer are visible at both refresh rates.
    expect(result.oldFlat).toBeGreaterThan(20);
    expect(result.flat).toBe(0);
    expect(result.maxError).toBeLessThan(1e-8);
  });

  test('each timestamp is sampled accurately despite 25/41.7/50/66.7 ms intervals', () => {
    let history = [pose(0)];
    for (const time of [25, 66.7, 116.7, 183.4]) history = appendNativePose(history, pose(time));
    for (let time = 0; time < 183.4; time += 1000 / 120) {
      expect(nativePoseAt(history, time).x).toBeCloseTo(time * .024, 10);
    }
  });

  test('a stopped vehicle never drifts past its authoritative stopping point', () => {
    let history = [pose(0, 0)];
    for (const [time, x] of [[33, .7], [66, 1.1], [100, 1.2], [133, 1.2], [166, 1.2]]) {
      history = appendNativePose(history, pose(time, x));
    }
    for (let time = 0; time <= 1000; time += 1000 / 120) expect(nativePoseAt(history, time).x).toBeLessThanOrEqual(1.2);
    expect(nativePoseAt(history, 1000).x).toBe(1.2);
  });

  test('a 150 ms JS stall holds the last known pose, without extrapolation or rewind', () => {
    let history = [pose(0)];
    history = appendNativePose(history, pose(33));
    history = appendNativePose(history, pose(66));
    expect(nativePoseAt(history, 120)).toMatchObject(pose(66));
    history = appendNativePose(history, pose(216));
    const recovered = nativePoseAt(history, 216 - NATIVE_PLAYBACK_DELAY);
    expect(recovered.x).toBeGreaterThan(pose(66).x);
    expect(recovered.x).toBeLessThan(pose(216).x);
  });

  test('pause recovery and teleports reset history instead of sweeping across the world', () => {
    let history = appendNativePose([pose(0)], pose(33));
    history = appendNativePose(history, pose(1200, .9));
    expect(history).toHaveLength(1);
    expect(nativePoseAt(history, 1200 - NATIVE_PLAYBACK_DELAY).x).toBe(.9);
    history = appendNativePose(history, pose(1233, 100));
    expect(history).toHaveLength(1);
    expect(nativePoseAt(history, 1233 - NATIVE_PLAYBACK_DELAY).x).toBe(100);
  });

  test('heading crosses zero and repeated complete circles along the short arc', () => {
    let history = [pose(0, 0, 359)];
    history = appendNativePose(history, pose(33, 0, 1));
    expect(nativePoseAt(history, 16.5).angle).toBe(360);
    for (let index = 2; index < 40; index++) history = appendNativePose(history, pose(index * 33, 0, (index * 90) % 360));
    const last = history.at(-1), previous = history.at(-2);
    expect(last.angle).toBeGreaterThan(3000);
    expect(last.angle - previous.angle).toBe(90);
    expect(history.length).toBeLessThanOrEqual(6);
  });

  test('camera and traffic consume the same delayed time across separate histories', () => {
    let camera = [pose(0)], car = [pose(0, 8)];
    for (const time of [33, 75, 100, 150]) {
      camera = appendNativePose(camera, pose(time));
      car = appendNativePose(car, pose(time, time * .024 + 8));
    }
    for (let time = 0; time < 150; time += 1000 / 120) {
      expect(nativePoseAt(car, time).x - nativePoseAt(camera, time).x).toBeCloseTo(8, 10);
    }
  });
});
