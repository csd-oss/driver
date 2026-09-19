import { pathHint } from '../src/lib/priority/pathHint';
import { vehiclePath, CENTER, ISLAND_R, RING_R, LANE, ROAD_HALF } from '../src/lib/priority/layout';
import { poseAt } from '../src/lib/priority/timeline';
import { lessonScene } from '../src/lib/priority/lessons';

test('roundabout previews follow the entry road and bend instead of cutting over the verge or island', () => {
  const scene = lessonScene(10), car = scene.vehicles.find(v => v.from === 'ring');
  const path = vehiclePath(scene, car), cache = {};
  for (let now = 0; now < 6500; now += 80) {
    const pose = poseAt(scene, car, 5500, now, cache, 5500, 0, Infinity);
    const points = pathHint(path, pose.progress, pose, 0.5);
    for (let i = 1; i < points.length; i++) for (let f = 0; f <= 1; f += 0.1) {
      const dx = points[i - 1].x * (1 - f) + points[i].x * f - CENTER;
      const dy = points[i - 1].y * (1 - f) + points[i].y * f - CENTER;
      const radius = Math.hypot(dx, dy);
      expect(radius).toBeGreaterThan(ISLAND_R);
      expect(radius <= RING_R + LANE + 1 || Math.abs(dx) <= ROAD_HALF || Math.abs(dy) <= ROAD_HALF).toBe(true);
    }
  }
});

test('completed movements do not show a stale direction preview', () => {
  const scene = lessonScene(10), car = scene.vehicles[1];
  expect(pathHint(vehiclePath(scene, car), 1, { x: 150, y: 56 }, 0.5)).toEqual([]);
});
