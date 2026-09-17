import { AccessibilityInfo, Animated, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SwipeHint, gestureVector } from '../components/game/SwipeHint';

const DIRECTIONS = ['up', 'down', 'left', 'right'];

let tree = null;

// Renders and lets the reduce-motion check settle before anything is asserted.
const render = async (props) => {
  await act(async () => {
    tree = create(<SwipeHint {...props} />);
  });
  return tree;
};

const unmount = async () => {
  if (!tree) return;
  const done = tree;
  tree = null;
  await act(async () => done.unmount());
};

const flatStyle = (node) => {
  const style = node.props?.style;
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
};

// Every transform in the rendered tree, flattened, so positions can be checked.
const transforms = (t) => {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node === 'string') return;
    const style = flatStyle(node);
    if (style?.transform) found.push(Object.assign({}, ...style.transform));
    (node.children ?? []).forEach(walk);
  };
  walk(t.toJSON());
  return found;
};

beforeEach(() => {
  // Animated leans on timers; faking them keeps frames from running into teardown.
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(async () => {
  await unmount();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('gestureVector', () => {
  it('travels the right way for each direction', () => {
    const up = gestureVector('up', 120);
    const down = gestureVector('down', 120);
    const left = gestureVector('left', 120);
    const right = gestureVector('right', 120);
    // Screen coordinates: up is negative y, left is negative x.
    expect(up.to.y - up.from.y).toBeLessThan(0);
    expect(down.to.y - down.from.y).toBeGreaterThan(0);
    expect(left.to.x - left.from.x).toBeLessThan(0);
    expect(right.to.x - right.from.x).toBeGreaterThan(0);
    // The other axis never moves.
    expect(Math.abs(up.from.x)).toBe(0);
    expect(Math.abs(up.to.x)).toBe(0);
    expect(Math.abs(right.from.y)).toBe(0);
    expect(Math.abs(right.to.y)).toBe(0);
  });

  it('centres the gesture on the square and scales with the size', () => {
    const length = (v) => Math.hypot(v.to.x - v.from.x, v.to.y - v.from.y);
    for (const direction of DIRECTIONS) {
      const small = gestureVector(direction, 60);
      const big = gestureVector(direction, 120);
      // Start and end are mirror images, so the gesture is centred on the square.
      expect(small.from.x).toBeCloseTo(-small.to.x);
      expect(small.from.y).toBeCloseTo(-small.to.y);
      expect(length(big)).toBeCloseTo(length(small) * 2);
      // The travel stays inside the square it is drawn in.
      expect(length(big)).toBeGreaterThan(0);
      expect(length(big)).toBeLessThan(120);
    }
    // A square with no room is a gesture that goes nowhere.
    expect(length(gestureVector('up', 0))).toBe(0);
  });
});

describe('SwipeHint', () => {
  it('renders every direction without throwing', async () => {
    for (const direction of DIRECTIONS) {
      const t = await render({ direction, testID: `hint.${direction}` });
      expect(t.root.findByProps({ testID: `hint.${direction}` })).toBeTruthy();
      await unmount();
    }
  });

  it('keeps the whole gesture, arrowhead included, inside the square', async () => {
    for (const direction of DIRECTIONS) {
      const t = await render({ direction, size: 120 });
      const drawn = [];
      const walk = (node) => {
        if (!node || typeof node === 'string') return;
        const style = flatStyle(node);
        // Only the parts that move: the layers themselves fill the square.
        if (style?.transform && style.width) {
          const move = Object.assign({}, ...style.transform);
          drawn.push({ x: move.translateX ?? 0, y: move.translateY ?? 0, w: style.width, h: style.height });
        }
        (node.children ?? []).forEach(walk);
      };
      walk(t.toJSON());
      expect(drawn.length).toBeGreaterThan(0);
      for (const part of drawn) {
        expect(Math.abs(part.x) + part.w / 2).toBeLessThanOrEqual(60);
        expect(Math.abs(part.y) + part.h / 2).toBeLessThanOrEqual(60);
      }
      await unmount();
    }
  });

  it('is decoration: not accessible and never takes touches', async () => {
    const t = await render({ direction: 'up', testID: 'hint' });
    const root = t.toJSON();
    expect(root.props.testID).toBe('hint');
    expect(root.props.accessible).toBe(false);
    expect(flatStyle(root).pointerEvents).toBe('none');
    // No caption, so the root is exactly the square the gesture is drawn in.
    expect(flatStyle(root)).toMatchObject({ width: 120, height: 120 });
  });

  it('renders the caption when there is a label, and makes room for it', async () => {
    const t = await render({ direction: 'down', label: 'Swipe down to give way', testID: 'hint' });
    const captions = t.root.findAllByType(Text);
    expect(captions).toHaveLength(1);
    expect(captions[0].props.children).toBe('Swipe down to give way');
    expect(captions[0].props.numberOfLines).toBe(2);
    expect(flatStyle(t.toJSON()).height).toBe(142);
  });

  it('honours the colour and size props', async () => {
    const t = await render({ direction: 'left', size: 60, colour: '#ff0055', label: 'Left' });
    const json = JSON.stringify(t.toJSON());
    expect(json).toContain('#ff0055');
    expect(json).not.toContain('#ffffff');
  });

  it('stops the animation on unmount and leaves no warnings behind', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const stop = jest.fn();
    const loop = jest.spyOn(Animated, 'loop').mockImplementation(() => ({ start: jest.fn(), stop, reset: jest.fn() }));

    await render({ direction: 'right' });
    expect(loop).toHaveBeenCalledTimes(1);
    await unmount();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('parks the hand at the end of the gesture when motion is reduced', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true);
    const t = await render({ direction: 'right', label: 'Swipe right' });
    const { to } = gestureVector('right', 120);

    // No interpolation left: the hand sits on the end offset as a plain number.
    const parked = transforms(t).filter((x) => x.translateX === to.x && !x.rotate);
    expect(parked).toHaveLength(1);
    expect(parked[0].translateY).toBeCloseTo(to.y);
    // The arrowhead and the caption still show.
    expect(transforms(t).some((x) => x.rotate === '45deg')).toBe(true);
    expect(t.root.findAllByType(Text)).toHaveLength(1);
  });

  it('treats a failed reduce-motion check as motion allowed', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockRejectedValue(new Error('no bridge'));
    const t = await render({ direction: 'up' });
    const { to } = gestureVector('up', 120);
    // Animated, so nothing is parked on the end offset.
    expect(transforms(t).some((x) => x.translateY === to.y && !x.rotate)).toBe(false);
  });
});
