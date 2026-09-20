import { LESSONS, lessonScene } from '../src/lib/priority/lessons';
import { pointAlong, vehiclePath } from '../src/lib/priority/layout';
import { pathHint } from '../src/lib/priority/pathHint';
import { cameraView, screenPoint } from '../src/lib/priority/view';
import { PREVIEW_HALF, PREVIEW_SPAN, projectVehicle, trafficInView } from '../src/lib/priority/render';
import { toWorld } from '../src/lib/priority/world';

test('compact previews contain the full path and align with the road through camera turns', () => {
  for (let index = 0; index < LESSONS.length; index++) {
    const scene = lessonScene(index);
    for (const vehicle of scene.vehicles) for (const progress of [0, .25, .6, .89]) {
      const path = vehiclePath(scene, vehicle);
      const local = pointAlong(progress ? path.through : path.approach, progress || .4);
      const shown = pathHint(path, progress, local, PREVIEW_SPAN);
      for (const rot of [0, 90, 180, 270]) {
        const junction = { cx: 231, cy: -70, rot };
        const pose = toWorld(junction, local);
        const view = cameraView(393, 700, { x: 230, y: -30 }, rot + 37);
        const anchor = projectVehicle(pose.x, pose.y, rot, view.you.x, view.you.y, view.heading, view.width / view.span, view.width, view.height, 0);
        const a = anchor.angle * Math.PI / 180, scale = view.width / view.span;
        for (const p of shown) {
          const dx = p.x - local.x, dy = p.y - local.y;
          expect(Math.abs(dx) + 3.5).toBeLessThan(PREVIEW_HALF);
          expect(Math.abs(dy) + 3.5).toBeLessThan(PREVIEW_HALF);
          const expected = screenPoint(toWorld(junction, p), view);
          expect(anchor.x + (dx * Math.cos(a) - dy * Math.sin(a)) * scale).toBeCloseTo(expected.x, 7);
          expect(anchor.y + (dx * Math.sin(a) + dy * Math.cos(a)) * scale).toBeCloseTo(expected.y, 7);
        }
      }
    }
  }
});

test('traffic stays mounted through every viewport edge and turns, with a warm-up margin', () => {
  for (let heading = 0; heading < 360; heading += 15) {
    const view = cameraView(393, 700, { x: 230, y: -30 }, heading);
    const a = heading * Math.PI / 180;
    for (const dx of [-view.span / 2 - 20, 0, view.span / 2 + 20]) {
      for (const dy of [-view.viewHeight * .72 - 20, 0, view.viewHeight * .28 + 20]) {
        const p = { x: view.you.x + dx * Math.cos(a) - dy * Math.sin(a), y: view.you.y + dx * Math.sin(a) + dy * Math.cos(a) };
        expect(trafficInView(p, view)).toBe(true);
      }
    }
    expect(trafficInView({ x: 20000, y: 20000 }, view)).toBe(false);
  }
});
