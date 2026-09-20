import { patchKey, retainRoadPatches, roadPatch } from '../src/lib/priority/render';

const patch = (x, y = 0) => roadPatch(x, y, 138, 246);

describe('road cache handover', () => {
  test('the painted surface stays mounted when a new origin appears', () => {
    const painted = patch(31.9);
    const replacement = patch(32.1);
    const layers = retainRoadPatches([painted], replacement);
    expect(layers).toEqual([painted, replacement]);
    expect(layers[0]).toBe(painted);
    expect(patchKey(layers[0])).toBe(patchKey(painted));
    // Ordinary movement within this interval cannot retire the fallback.
    expect(retainRoadPatches(layers, patch(63))).toBe(layers);
  });

  test('only the oldest surface retires at the next cache boundary', () => {
    let layers = [patch(0)];
    for (let x = 64; x < 6400; x += 64) {
      const visible = layers[layers.length - 1];
      layers = retainRoadPatches(layers, patch(x));
      expect(layers).toHaveLength(2);
      expect(layers[0]).toBe(visible);
    }
  });

  test('reversing across a boundary reuses both mounted surfaces', () => {
    const first = patch(0), second = patch(64);
    const layers = retainRoadPatches([first, second], patch(31));
    expect(layers[0]).toBe(second);
    expect(layers[1]).toBe(first);
  });

  test('the previous surface covers the viewport during a diagonal handover', () => {
    const previous = patch(31.9, 31.9);
    const you = { x: 32.5, y: 32.5 };
    for (let heading = 0; heading < 360; heading += 5) {
      const a = heading * Math.PI / 180;
      for (const dx of [-69, 69]) for (const dy of [-246 * .72, 246 * .28]) {
        const x = you.x + dx * Math.cos(a) - dy * Math.sin(a);
        const y = you.y + dx * Math.sin(a) + dy * Math.cos(a);
        expect(Math.abs(x - previous.anchorX)).toBeLessThan(previous.half);
        expect(Math.abs(y - previous.anchorY)).toBeLessThan(previous.half);
      }
    }
  });
});
