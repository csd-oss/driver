import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
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

test('everything Alex says shares one size and colour; only the label and swipe caption are small', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const instruction = 'At the roundabout, take the second exit.';
  const status = 'We have a STOP sign. Stop fully before the line, then check the junction.';
  const props = { lang: 2, detail: 'Guide · 5 / 11', instruction, status, swipe: 'down', onInput: jest.fn(), onBack: jest.fn(), onPause: jest.fn(), testID: 'drive' };
  let tree;
  try {
    await act(async () => { tree = create(<DriveStage {...props}>{() => <View />}</DriveStage>); });
    const styleOf = text => StyleSheet.flatten(text.props.style);
    const texts = tree.root.findAllByType(Text);
    const spoken = texts.filter(text => text.props.children === instruction || text.props.children === status);
    expect(spoken).toHaveLength(2);
    const [main, secondary] = spoken.map(styleOf);
    expect(secondary.fontSize).toBe(main.fontSize);
    expect(secondary.lineHeight).toBe(main.lineHeight);
    expect(secondary.color).toBe(main.color);
    const caption = texts.find(text => text.props.children === 'Swipe down');
    expect(styleOf(caption).fontSize).toBeLessThan(main.fontSize);
  } finally {
    if (tree) await act(async () => tree.unmount());
    jest.restoreAllMocks();
  }
});
