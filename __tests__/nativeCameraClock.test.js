import { act, create } from 'react-test-renderer';
import { useFrameCallback, withTiming } from 'react-native-reanimated';
import { SceneCamera, useSceneCamera } from '../components/game/SceneCamera.native';
import { NATIVE_PLAYBACK_DELAY } from '../src/lib/priority/nativeMotion';

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  return {
    Easing: { linear: value => value }, ReduceMotion: { Never: 'never' },
    withTiming: jest.fn(),
    useSharedValue: value => React.useRef({ value }).current,
    useDerivedValue: updater => {
      const current = React.useRef(updater); current.current = updater;
      return React.useRef({ get value() { return current.current(); } }).current;
    },
    useFrameCallback: jest.fn(() => React.useRef({ setActive: jest.fn() }).current),
  };
});

test('one stable display callback shares the simulation clock and suspends on pause', () => {
  let camera, tree;
  const clockNow = jest.spyOn(performance, 'now').mockReturnValue(1000);
  const Capture = () => { camera = useSceneCamera(); return null; };
  const render = (time, active = true) => <SceneCamera you={{ x: (time - 1000) * .02, y: 0, angle: 0 }} heading={0} snapshotTime={time} motionActive={active}><Capture /></SceneCamera>;
  try {
    act(() => { tree = create(render(1000)); });
    const tick = useFrameCallback.mock.calls[0][0];
    const callback = useFrameCallback.mock.results[0].value;
    tick({ timestamp: 500000 });
    expect(camera.clock.value).toBeCloseTo(1000 - NATIVE_PLAYBACK_DELAY, 8);
    for (let index = 1; index <= 90; index++) {
      const time = 1000 + index * 1000 / 30;
      act(() => tree.update(render(time)));
      clockNow.mockReturnValue(time);
      tick({ timestamp: 500000 + time - 1000 });
      if (index > 2) expect(camera.px.value).toBeCloseTo((time - NATIVE_PLAYBACK_DELAY - 1000) * .02, 8);
    }
    expect(new Set(useFrameCallback.mock.calls.map(([fn]) => fn)).size).toBe(1);
    expect(callback.setActive.mock.calls).toEqual([[true]]);
    expect(withTiming).not.toHaveBeenCalled();

    act(() => tree.update(render(4000, false)));
    expect(callback.setActive.mock.calls).toEqual([[true], [false]]);
    expect(camera.clock.value).toBe(4000);
    expect(camera.px.value).toBe(60);

    act(() => tree.update(render(4033, true)));
    clockNow.mockReturnValue(4033);
    tick({ timestamp: 503033 });
    expect(camera.clock.value).toBe(4000); // a short pause cannot rewind time
    expect(camera.px.value).toBe(60);
    expect(callback.setActive.mock.calls).toEqual([[true], [false], [true]]);
    expect(new Set(useFrameCallback.mock.calls.map(([fn]) => fn)).size).toBe(1);
  } finally {
    if (tree) act(() => tree.unmount());
    clockNow.mockRestore();
    jest.clearAllMocks();
  }
});

test('a slow first mount cannot become a permanent extra interpolation delay', () => {
  let camera, tree;
  const clockNow = jest.spyOn(performance, 'now').mockReturnValue(1000);
  const Capture = () => { camera = useSceneCamera(); return null; };
  const render = time => <SceneCamera you={{ x: time * .02, y: 0, angle: 0 }} heading={0} snapshotTime={time}><Capture /></SceneCamera>;
  try {
    act(() => { tree = create(render(1000)); });
    const tick = useFrameCallback.mock.calls[0][0];
    // React can deliver snapshots before the first native frame is presented.
    for (let i = 1; i <= 6; i++) act(() => tree.update(render(1000 + i * 1000 / 30)));
    clockNow.mockReturnValue(1200);
    tick({ timestamp: 999999 }); // display-link epoch is deliberately unrelated
    expect(camera.clock.value).toBeCloseTo(1200 - NATIVE_PLAYBACK_DELAY, 8);
    expect(camera.px.value).toBeCloseTo((1200 - NATIVE_PLAYBACK_DELAY) * .02, 8);
    let previous = camera.px.value;
    for (let frame = 1; frame <= 120; frame++) {
      const time = 1200 + frame * 1000 / 120;
      if (frame % 4 === 0) act(() => tree.update(render(time)));
      clockNow.mockReturnValue(time);
      tick({ timestamp: 999999 + frame * 1000 / 120 });
      expect(camera.px.value).toBeGreaterThan(previous);
      previous = camera.px.value;
    }
  } finally {
    if (tree) act(() => tree.unmount());
    clockNow.mockRestore();
    jest.clearAllMocks();
  }
});
