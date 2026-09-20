import { AccessibilityInfo, Animated, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { DriveStage } from '../components/game/DriveStage';
import * as i18n from '../src/i18n/i18n';

jest.mock('../components/game/drivePalette', () => ({ useDrivePalette: () => ({ background: '#fff', text: '#111', secondary: '#555', accent: '#44f' }) }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('nativewind', () => ({ cssInterop: jest.fn() }));

test('road snapshots do not rebuild unchanged coaching or its native animation graph', async () => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const loop = jest.spyOn(Animated, 'loop').mockReturnValue({ start: jest.fn(), stop: jest.fn() });
  const interpolate = jest.spyOn(Animated.Value.prototype, 'interpolate');
  const translate = jest.spyOn(i18n, 't');
  const props = { lang: 2, detail: '1 / 11', instruction: 'Try Stop.', swipe: 'down', onInput: jest.fn(), onBack: jest.fn(), onPause: jest.fn(), testID: 'drive' };
  const render = (overrides = {}) => <DriveStage {...props} {...overrides}>{() => <View />}</DriveStage>;
  let tree;
  try {
    await act(async () => { tree = create(render()); });
    interpolate.mockClear();
    translate.mockClear();
    for (let frame = 0; frame < 90; frame++) act(() => tree.update(render()));
    expect(interpolate).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
    // A real prompt change still updates immediately, including its gesture.
    await act(async () => tree.update(render({ instruction: 'Now Go.', swipe: 'up' })));
    expect(interpolate).toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('Now Go.');
    expect(loop).toHaveBeenCalledTimes(2);
    await act(async () => tree.update(render({ paused: true })));
    expect(tree.root.findAllByProps({ testID: 'crossing.swipeHint' })).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).toContain('Drive paused');
  } finally {
    if (tree) await act(async () => tree.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});
