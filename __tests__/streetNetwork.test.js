import { createRun, applyInput, currentJunction, step, vehiclePoses, toWorld } from '../src/lib/priority/world';
import { makeRng } from '../src/lib/priority/generator';
import { hasTrack, roadHalf, TRACK_OFFSET } from '../src/lib/priority/layout';
import { oppositeOf } from '../src/lib/priority/geometry';
import { LESSONS } from '../src/lib/priority/lessons';
import { bodiesOverlap } from '../src/lib/priority/traffic';

function checkStreets(run) {
  for (const j of run.junctions) {
    for (const track of j.scene.tramTracks) {
      expect(j.scene.layout).not.toBe('roundabout');
      expect(track.to).toBe(oppositeOf(track.from));
      expect(j.scene.arms).toEqual(expect.arrayContaining([track.from, track.to]));
    }
    const previous = run.junctions.find(p => p.index === j.index - 1);
    if (!previous) continue;
    const exit = previous.scene.vehicles.find(v => v.id === 'you').to;
    expect(hasTrack(previous.scene, exit)).toBe(hasTrack(j.scene, 'S'));
    expect(roadHalf(previous.scene, exit)).toBe(roadHalf(j.scene, 'S'));
  }
}

test('opposing trams fit on their tracks with the simulation safety clearance', () => {
  const tram = { kind: 'tram' };
  expect(bodiesOverlap({ x: 50 - TRACK_OFFSET, y: 50, angle: 180 }, tram,
    { x: 50 + TRACK_OFFSET, y: 50, angle: 0 }, tram, 1.2)).toBe(false);
});

test.each(['left', 'right'])('a %s turn onto a tram street leads to a side road, not rails through a roundabout', turn => {
  const run = createRun(makeRng(1000), 1, { lesson: 9, continuousGuide: true });
  while (!currentJunction(run).scheduled) step(run, run.now + 32);
  applyInput(run, turn);
  const next = run.junctions[1];
  expect(next.tramStreet).toBe(true);
  expect(next.scene.layout).toBe('t');
  expect(next.scene.tramTracks).toEqual([{ from: 'S', to: 'N' }]);
  expect(next.resumeLessonIndex).toBe(10);
  expect(next.instruction.turn).toBe('right');
  checkStreets(run);
});

test.each([0, 2])('wrong turns retain the guide and tram alignment after missing %i side-road exits', missedExits => {
  const run = createRun(makeRng(1000), 1, { lesson: 9, continuousGuide: true });
  let turnedOntoTracks = false, tookSideRoad = false, sawTramAfterExit = false;
  for (let frame = 0; frame < 9000; frame++) {
    step(run, run.now + 32);
    const current = currentJunction(run);
    if (current.scheduled && run.s < current.sWait) {
      if (!turnedOntoTracks) { applyInput(run, 'right'); turnedOntoTracks = true; }
      else if (current.tramStreet && current.index > missedExits && run.intent !== 'right') { applyInput(run, 'right'); tookSideRoad = true; }
    }
    const source = run.junctions[0];
    const tram = vehiclePoses(run).find(v => v.vehicle.kind === 'tram');
    if (tram?.progress === 1) {
      // The original tram travels W→E; following the player's N-bound
      // route at the next junction would move it off this world track.
      const track = toWorld(source, { x: 50, y: 50 + TRACK_OFFSET });
      expect(tram.pose.y).toBeCloseTo(track.y, 5);
      expect(tram.pose.angle).toBeCloseTo(90, 5);
      expect(tram.routeS).toBeUndefined();
      if (current.index > 1) sawTramAfterExit = true;
    }
    if (current.ring && !current.ring.armed && current.ring.order[current.ring.next] === current.instruction.to) applyInput(run, 'right');
    if (current.scheduled && !current.stopped && run.s < current.sWait && current.sWait - run.s < 45) applyInput(run, 'brake');
    if (run.stoppedAt !== null && run.now > current.clearAt + 1200) applyInput(run, 'go');
    if (run.junctions.find(j => j.lessonIndex === LESSONS.length - 1)?.passed) break;
  }
  expect(turnedOntoTracks && tookSideRoad).toBe(true);
  if (missedExits === 0) expect(sawTramAfterExit).toBe(true);
  expect(run.junctions.filter(j => j.tramStreet)).toHaveLength(missedExits + 1);
  const ring = run.junctions.find(j => j.lessonIndex === 10);
  expect(ring.passed).toBe(true);
  expect(ring.scene.tramTracks).toEqual([]);
  expect(run.lives).toBe(3);
  checkStreets(run);
});

test('generated streets remain compatible when entering and leaving tram roads', () => {
  let tramTurns = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const run = createRun(makeRng(seed), 4);
    step(run, 16);
    const j = currentJunction(run);
    if (j.scene.tramTracks.length) {
      applyInput(run, 'right');
      tramTurns++;
    }
    checkStreets(run);
  }
  expect(tramTurns).toBeGreaterThan(0);
});
