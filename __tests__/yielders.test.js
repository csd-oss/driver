import { makeRng } from '../src/lib/priority/generator';
import { createRun, currentJunction, step, applyInput, EARLY_CLEAR_MS, STOP_LEAD_MIN_MS, STOP_LEAD_MAX_MS } from '../src/lib/priority/world';
import { clearTimeMs, poseAt, ROLL_UP_MS, ROLL_UP_DISTANCE, ROLL_UP_SPEED } from '../src/lib/priority/timeline';
import { vehiclePath, pointAlong } from '../src/lib/priority/layout';
import { clearFractionFor } from '../src/lib/priority/conflict';
import { summariseYielders } from './support/trafficAudit';

/**
 * Traffic that gives way to the player at a plain junction. Build 46 parked
 * every such car on its line from the start and kept the last of them
 * waiting however far off the player was. Now a car with the time to clear
 * goes, and most of the rest is seen driving up and stopping in front of you.
 */

const scene = {
  layout: 'cross', arms: ['N', 'E', 'S', 'W'], signs: {}, mainRoad: null, tramTracks: [], control: null, pedestrians: [],
  vehicles: [{ id: 'you', kind: 'car', color: 'you', from: 'S', to: 'N' }, { id: 'red', kind: 'car', color: 'red', from: 'E', to: 'W' }],
};

describe('rolling up to the line', () => {
  const red = scene.vehicles[1];
  const along = (p) => { const wait = vehiclePath(scene, red).wait; return Math.hypot(p.x - wait.x, p.y - wait.y); };

  it('drives in from ROLL_UP_DISTANCE behind the line, slows to a stop on it and waits there', () => {
    const cache = {};
    const arrive = 8000;
    expect(poseAt(scene, red, null, arrive - ROLL_UP_MS - 1, cache, 0, 0, Infinity, arrive)).toBeNull();
    const first = poseAt(scene, red, null, arrive - ROLL_UP_MS, cache, 0, 0, Infinity, arrive);
    expect(along(first)).toBeCloseTo(ROLL_UP_DISTANCE, 0);
    let previous = first, speeds = [];
    for (let t = arrive - ROLL_UP_MS + 100; t <= arrive; t += 100) {
      const p = poseAt(scene, red, null, t, cache, 0, 0, Infinity, arrive);
      expect(p.progress).toBe(0);
      expect(along(p)).toBeLessThanOrEqual(along(previous) + 1e-9);
      speeds.push((along(previous) - along(p)) / 100);
      previous = p;
    }
    expect(along(previous)).toBeLessThan(0.2);
    expect(speeds[0]).toBeCloseTo(ROLL_UP_SPEED, 2);           // cruising at first
    expect(speeds[speeds.length - 1]).toBeLessThan(ROLL_UP_SPEED / 8); // braked to rest
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeLessThanOrEqual(speeds[i - 1] + 1e-6);
    const waiting = poseAt(scene, red, null, arrive + 3000, cache, 0, 0, Infinity, arrive);
    expect(along(waiting)).toBeLessThan(0.2);
    expect(waiting.progress).toBe(0);
  });

  it('never starts before it has arrived, then pulls away from rest', () => {
    const cache = {};
    const arrive = 8000;
    const early = poseAt(scene, red, 6000, 7000, cache, 0, 0, Infinity, arrive); // a start set before its arrival
    expect(along(early)).toBeGreaterThan(2); // still braking towards the line
    expect(early.progress).toBe(0);
    const goes = poseAt(scene, red, 6000, arrive + 400, cache, 0, 0, Infinity, arrive);
    expect(goes.progress).toBeGreaterThan(0);
    expect(goes.progress).toBeLessThan(0.1); // eased away from rest, not a jump
  });

  it('a queued car rolls up to its place in the queue', () => {
    const cache = {};
    const arrive = 8000;
    const p = poseAt(scene, red, null, arrive + 100, cache, 0, 13, Infinity, arrive);
    const line = pointAlong(vehiclePath(scene, red).through, 0);
    expect(Math.hypot(p.x - line.x, p.y - line.y)).toBeCloseTo(13, 0);
  });
});

/** The first plain junction of a seed with at least `count` cars giving way to you, scheduled. */
const scheduledPlain = (seed, level = 1, count = 1) => {
  const run = createRun(makeRng(seed), level);
  const j = currentJunction(run);
  if (j.ring || j.scene.control) return null;
  const yielders = j.scene.vehicles.filter((v) => v.id !== 'you' && v.kind !== 'tram' && (j.resolution.yields[v.id] || []).includes('you'));
  if (yielders.length < count) return null;
  while (!j.scheduled) step(run, run.now + 32);
  return { run, j, yielders };
};

describe('scheduling the traffic that gives way to you', () => {
  it('sends every car that can clear your paths in time, standing or arriving, and never one that cannot', () => {
    let went = 0, stopped = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const found = scheduledPlain(seed);
      if (!found) continue;
      const { run, j, yielders } = found;
      const earliest = j.t0 + (j.sWait - run.s) / run.speed * 1000;
      const you = j.scene.vehicles.find((v) => v.id === 'you');
      for (const v of yielders) {
        const start = j.starts[v.id];
        if (start !== null) {
          // Out of every path you could take EARLY_CLEAR_MS before you could arrive.
          let clears = 0;
          for (const to of j.scene.arms.filter((a) => a !== 'S')) {
            const f = clearFractionFor(j.scene, v, { ...you, to }) ?? 0.15;
            clears = Math.max(clears, clearTimeMs(j.scene, v, f, !j.rollIn[v.id], j.queueBack[v.id] || 0, j.pathCache));
          }
          expect(start + clears + EARLY_CLEAR_MS).toBeLessThan(earliest + 1);
          went++;
        } else if (j.arrivals[v.id] != null) {
          // Rolls up and stops shortly before you could arrive (a little later
          // when the traffic ahead of it needs the room), never after you.
          expect(j.arrivals[v.id]).toBeLessThanOrEqual(earliest - STOP_LEAD_MIN_MS + 1000);
          expect(j.arrivals[v.id]).toBeGreaterThanOrEqual(Math.min(earliest - STOP_LEAD_MAX_MS, j.t0 + ROLL_UP_MS) - 1);
          stopped++;
        }
      }
    }
    expect(went).toBeGreaterThan(20);
    expect(stopped).toBeGreaterThan(20);
  });

  it('does not keep the last yielder waiting when it has the time', () => {
    // A junction with exactly one car giving way to you: build 46 always
    // kept it at its line ("the last one keeps waiting").
    let alone = 0, released = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const found = scheduledPlain(seed);
      if (!found || found.yielders.length !== 1) continue;
      alone++;
      const { j, yielders } = found;
      if (j.starts[yielders[0].id] !== null) released++;
    }
    expect(alone).toBeGreaterThan(10);
    expect(released / alone).toBeGreaterThan(0.25);
  });

  it('a car you have just given priority to by turning is waited for, not held at its line', () => {
    // Level 6, seed 4, junction 0: turning left makes red (N to S) a blocker
    // after it was released to cross early. Held by the early-crossing check
    // while the player waited for it, the junction never cleared.
    const run = createRun(makeRng(4), 6);
    const j = currentJunction(run);
    let entered = null;
    for (let frame = 0; frame < 3000 && !j.passed; frame++) {
      step(run, run.now + 32);
      if (!j.scheduled) continue;
      if (run.s < j.sWait && run.intent !== 'left') applyInput(run, 'left');
      if (!j.stopped && run.s < j.sWait && j.sWait - run.s < 45) applyInput(run, 'brake');
      if (run.stoppedAt !== null && entered === null) entered = run.now;
      if (run.stoppedAt !== null && run.now > j.clearAt + 600) applyInput(run, 'go');
    }
    expect(j.passed).toBe(true);
    expect(run.lives).toBe(3);
    expect(j.starts.you - entered).toBeLessThan(15000);
  });

  it('leaves the guide lessons as they were: their traffic has no arrival styles', () => {
    const run = createRun(makeRng(1000), 1, { lesson: 2, continuousGuide: true });
    const j = currentJunction(run);
    expect(j.lesson).toBe('mainRoad');
    expect(j.styles).toBeNull();
    expect(j.willRollIn.has('blue')).toBe(false); // drawn waiting at its line from the start
    while (!j.scheduled) step(run, run.now + 32);
    expect(j.starts.blue).toBeNull();
    expect(j.arrivals.blue).toBeUndefined();
  });
});

describe('what the player sees over many drives', () => {
  // Twelve seeds at levels 1, 3 and 8, 5000 frames each (support/trafficAudit.js).
  // Build 46 (HEAD before this change), 24 seeds: parkedWaiting 64..76% of the
  // yielders in view, rolledUp 0..2%, idle-with-time 9.0 / 2.5 / 1.0 s per run.
  const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
  test.each([1, 3, 8])('at level %i most yielders are seen driving up and stopping, and few wait with time to go', (level) => {
    const s = summariseYielders(seeds, [level], 5000);
    const summary = { level, seenShares: s.seenShares, perRun: s.perRun, crashes: s.crashes, overlapPairs: s.overlapPairs, popIns: s.popIns };
    const fail = (why) => { throw new Error(`${why}: ${JSON.stringify(summary)}`); };
    if (s.livesLost > 0) fail('a rule-following driver lost a life');
    if (s.seenShares.rolledUp < 0.4) fail('too few yielders roll up and stop');
    if (s.seenShares.parkedWaiting > 0.2) fail('too many yielders stand at the line all along');
    if (s.seenShares.parkedWent + s.seenShares.through < 0.05) fail('too few yielders go while there is time');
    if (s.perRun.idleWithTime > 1) fail('yielders wait with time to go');
    if (s.overlapPairs > 2) fail('NPC bodies overlap');
    if (s.popIns > 8) fail('cars appear on screen out of nowhere');
    expect(s.crashes).toBe(0);
  }, 120000);
});
