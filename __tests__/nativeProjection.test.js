import { projectVehicle, roadPatch, nextSnapshotAt, SNAPSHOT_MS } from '../src/lib/priority/render';
import { cameraView, screenPoint } from '../src/lib/priority/view';

describe('native composited world', () => {
  test.each([60, 120])('snapshot scheduling stays at 30 Hz with jitter on a %i Hz display', hz => {
    let deadline = SNAPSHOT_MS, count = 0;
    for (let frame = 1; frame <= hz * 10; frame++) {
      const time = frame * 1000 / hz + (frame % 3) * 1.2;
      const next = nextSnapshotAt(deadline, time);
      if (next !== deadline) count++;
      deadline = next;
    }
    expect(count).toBe(300);
  });

  test('a long stall drops missed snapshots instead of creating a catch-up burst', () => {
    const next = nextSnapshotAt(SNAPSHOT_MS, 800);
    expect(next).toBeGreaterThan(800);
    expect(next).toBeLessThanOrEqual(800 + SNAPSHOT_MS);
    expect(nextSnapshotAt(next, 801)).toBe(next);
  });

  test('cars and the existing road camera agree through turns and cache boundaries', () => {
    for (const heading of [-450, -180, -90, 0, 45, 90, 180, 359, 720]) {
      for (const x of [-32.001, -31.999, 31.999, 32.001, 95.999, 96.001, 10000]) {
        const you = { x, y: x + 40 };
        const view = cameraView(393, 700, you, heading);
        const car = { x: x - 23, y: you.y - 51 };
        const actual = projectVehicle(car.x, car.y, 30, you.x, you.y, heading, view.width / view.span, view.width, view.height, 0);
        const expected = screenPoint(car, view);
        expect(actual.x).toBeCloseTo(expected.x, 8);
        expect(actual.y).toBeCloseTo(expected.y, 8);
        expect(actual.angle).toBe(30 - heading);
      }
    }
  });

  test('every rotating viewport corner stays inside the patch, including diagonal anchor rounding', () => {
    for (const [width, height] of [[393, 700], [430, 810], [1024, 500]]) {
      for (const x of [-32.001, -31.999, 31.999, 32.001]) {
        for (const y of [-32.001, -31.999, 31.999, 32.001]) {
          const view = cameraView(width, height, { x, y }, 0);
          const patch = roadPatch(x, y, view.span, view.viewHeight);
          for (let heading = 0; heading < 360; heading += 5) {
            const a = heading * Math.PI / 180;
            for (const dx of [-view.span / 2, view.span / 2]) {
              for (const dy of [-view.viewHeight * .72, view.viewHeight * .28]) {
                const worldX = x + dx * Math.cos(a) - dy * Math.sin(a);
                const worldY = y + dx * Math.sin(a) + dy * Math.cos(a);
                expect(Math.abs(worldX - patch.anchorX)).toBeLessThan(patch.half);
                expect(Math.abs(worldY - patch.anchorY)).toBeLessThan(patch.half);
              }
            }
          }
        }
      }
    }
  });

  test('the player remains at the camera pivot even while the road turns', () => {
    for (const heading of [-359, -90, 0, 45, 180, 361]) {
      const point = projectVehicle(923, -480, 88, 923, -480, heading, 3, 414, 760, 0);
      expect(point.x).toBe(207);
      expect(point.y).toBe(760 * .72);
    }
  });
});
