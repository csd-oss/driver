import { act, create } from 'react-test-renderer';
import { Path, Text as SvgText } from 'react-native-svg';
import { JunctionStatic } from '../components/game/JunctionStatic';
import { StopLabel } from '../components/game/StopLabel';
import { STOP_LABEL_PATHS } from '../components/game/stopLabelPaths';
import { LESSONS, lessonScene } from '../src/lib/priority/lessons';

test.each([false, true])('road and visible stop-sign labels use fixed outlines with their original colours (dark=%s)', dark => {
  const scene = lessonScene(LESSONS.findIndex(lesson => lesson.id === 'stopSign'));
  let tree;
  try {
    act(() => { tree = create(<JunctionStatic scene={scene} dark={dark} ownArm="S" />); });
    const labels = tree.root.findAllByType(StopLabel);
    expect(labels.filter(label => label.props.variant === 'road')).toHaveLength(2);
    // The opposite sign still presents its grey back, not readable STOP text.
    expect(labels.filter(label => label.props.variant === 'sign')).toHaveLength(1);
    expect(tree.root.findAllByType(SvgText)).toHaveLength(0);
    for (const label of labels) {
      const path = label.findByType(Path);
      expect(path.props.d).toBe(STOP_LABEL_PATHS[label.props.variant]);
      expect(path.props.fill).toBe(label.props.variant === 'sign' ? '#ffffff' : dark ? '#cbd5e1' : '#f8fafc');
      expect(path.props.transform).toBe(`translate(${label.props.x} ${label.props.y})`);
    }
  } finally {
    if (tree) act(() => tree.unmount());
  }
});

test('both static labels contain all four glyph outlines and fit the existing road/sign footprints', () => {
  for (const [variant, width, height] of [['road', 10, 3.4], ['sign', 7.7, 2.6]]) {
    const path = STOP_LABEL_PATHS[variant];
    // S and T each have one contour; O and P each include their inner counter.
    expect(path.match(/M /g)).toHaveLength(6);
    const coordinates = path.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const x = coordinates.filter((_value, index) => index % 2 === 0);
    const y = coordinates.filter((_value, index) => index % 2 === 1);
    expect(Math.max(...x) - Math.min(...x)).toBeLessThan(width);
    expect(Math.max(...x) - Math.min(...x)).toBeGreaterThan(width * .9);
    expect(Math.max(...y) - Math.min(...y)).toBeLessThan(height);
    expect(Math.max(...y) - Math.min(...y)).toBeGreaterThan(height * .65);
  }
});
