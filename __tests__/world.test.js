import { makeRng } from '../src/lib/priority/generator';
import { createRun, step, applyInput, currentJunction, youPose, vehiclePoses, visibleJunctions, LIVES } from '../src/lib/priority/world';

const runUntil = (run, predicate, { input = null, maxMs = 30000, dt = 16 } = {}) => {
  let now = run.now;
  const events = [];
  while (now < maxMs) {
    now += dt;
    events.push(...step(run, now));
    if (input) input(run, now);
    if (predicate(run, events)) break;
  }
  return events;
};

describe('world', () => {
  it('drives through junctions, keeps two ahead, and never rolls back', () => {
    const run = createRun(makeRng(3), 1);
    let last = -1;
    const events = runUntil(run, (r) => r.passed >= 3 || r.over, {
      input: (r) => {
        const j = currentJunction(r);
        // Brake exactly when the engine says someone has priority over us.
        if (j.blockers.length && j.scheduled && !j.stopped && r.s < j.sLine && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
        expect(r.s).toBeGreaterThanOrEqual(last);
        last = r.s;
      },
    });
    expect(run.passed).toBeGreaterThanOrEqual(3);
    expect(run.lives).toBe(LIVES);
    expect(events.filter((e) => e.type === 'crash')).toHaveLength(0);
    expect(run.junctions.filter((j) => j.index > currentJunction(run).index).length).toBeGreaterThanOrEqual(2);
    expect(visibleJunctions(run).length).toBeGreaterThan(0);
  });

  it('crashes when you ignore a vehicle with priority and names the rule', () => {
    const run = createRun(makeRng(11), 3);
    // Find a junction where someone blocks us and never brake.
    const events = runUntil(run, (r, evs) => evs.some((e) => e.type === 'crash') || r.passed > 12);
    const crash = events.find((e) => e.type === 'crash');
    expect(crash).toBeDefined();
    expect(crash.culprit).toBeTruthy();
    expect(crash.rule).toBeTruthy();
    expect(run.lives).toBe(LIVES - 1);
  });

  it('penalises a needless stop without taking a life and resumes by itself', () => {
    const run = createRun(makeRng(5), 1);
    // Brake at every junction regardless.
    const events = runUntil(run, (r) => r.passed >= 4 || r.over, {
      input: (r) => {
        const j = currentJunction(r);
        if (j.scheduled && !j.stopped && r.s < j.sLine && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
      },
    });
    const hesitations = events.filter((e) => e.type === 'hesitated');
    const crashes = events.filter((e) => e.type === 'crash');
    expect(crashes).toHaveLength(0);
    expect(run.lives).toBe(LIVES);
    expect(run.passed).toBeGreaterThanOrEqual(4);
    const passedEvents = events.filter((e) => e.type === 'passed');
    // A junction where the stop was needless scores nothing and resets the streak.
    for (const h of hesitations) {
      const passed = passedEvents.find((e) => e.junction === h.junction);
      expect(passed).toBeDefined();
      expect(passed.hesitated).toBe(true);
      expect(passed.points).toBe(0);
    }
    const spoiled = passedEvents.filter((e) => e.hesitated || e.wrongWay).length;
    expect(spoiled + passedEvents.filter((e) => e.points > 0).length).toBe(passedEvents.length);
  });

  it('places the next junction along your exit direction and rotates its frame', () => {
    const run = createRun(makeRng(9), 4);
    runUntil(run, (r) => r.junctions.length >= 3, { maxMs: 100 });
    const [a, b] = run.junctions;
    const you = a.scene.vehicles.find((v) => v.id === 'you');
    const expectedRot = { N: 0, E: 90, W: 270 }[you.to];
    expect(b.rot).toBe(expectedRot);
    expect(Math.round(Math.hypot(b.cx - a.cx, b.cy - a.cy))).toBe(180);
    // The frames share the road axis: the next centre lies on the exit arm's centre line.
    if (you.to === 'N') expect(b.cx).toBeCloseTo(a.cx);
    if (you.to === 'E') expect(b.cy).toBeCloseTo(a.cy);
    if (you.to === 'W') expect(b.cy).toBeCloseTo(a.cy);
    const pose = youPose(run);
    expect(pose.angle).toBe(0);
    expect(vehiclePoses(run).every((p) => Number.isFinite(p.pose.x) && Number.isFinite(p.pose.y))).toBe(true);
  });
});

describe('vehicle motion', () => {
  it('moves a vehicle with priority through the junction on time, even late in a run', () => {
    const run = createRun(makeRng(11), 3);
    run.now = 500000; // a long time after app start: absolute clocks are large
    let moved = false;
    let now = run.now;
    for (let i = 0; i < 1500 && !moved; i++) {
      now += 16;
      step(run, now);
      const j = currentJunction(run);
      if (!j.scheduled || !j.blockers.length) continue;
      const blocker = j.blockers[0];
      const before = vehiclePoses(run).find((p) => p.vehicle.id === blocker && p.junction.index === j.index);
      if (!before) continue;
      // Once the blocker's start time has passed it must have left its waiting spot.
      if (j.starts[blocker] !== null && now > j.starts[blocker] + 600) {
        const rest = vehiclePoses(run).find((p) => p.vehicle.id === blocker && p.junction.index === j.index);
        const local = j.pathCache[blocker];
        const waitPose = { x: local.through[0].x, y: local.through[0].y };
        const w = { x: rest.pose.x, y: rest.pose.y };
        const start = { x: j.cx, y: j.cy };
        // moved away from the waiting line by at least a few units
        moved = Math.hypot(w.x - start.x, w.y - start.y) < Math.hypot(waitPose.x - 50, waitPose.y - 50) - 3;
        expect(moved).toBe(true);
      }
    }
    expect(moved).toBe(true);
  });
});

describe('instructor directions', () => {
  const drive = (run, ms, input) => {
    let now = run.now;
    const events = [];
    const end = now + ms;
    while (now < end) {
      now += 16;
      events.push(...step(run, now));
      if (input) input(run, now, events);
      if (run.over) break;
    }
    return events;
  };

  it('announces a direction when a junction is scheduled and penalises the wrong way', () => {
    const run = createRun(makeRng(31), 5);
    run.now = 1000;
    // Never turn, never brake; compare executed movement against the instruction.
    const events = drive(run, 60000, (r, now, evs) => {
      const j = currentJunction(r);
      const last = evs[evs.length - 1];
      // At a T-junction with no straight ahead, deliberately take the other turn.
      if (last && last.type === 'needTurn' && last.junction === j.index) {
        const wanted = last.instruction.turn === 'left' ? 'right' : 'left';
        applyInput(r, wanted);
        if (r.stoppedAt !== null) applyInput(r, last.instruction.turn);
      }
      if (j.blockers.length && j.scheduled && !j.stopped && r.s < j.sLine && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
    });
    const instructions = events.filter((e) => e.type === 'instruction');
    expect(instructions.length).toBeGreaterThan(0);
    for (const i of instructions) expect(['left', 'right', 'straight', 'main', 'roundabout']).toContain(i.kind);
    const passed = events.filter((e) => e.type === 'passed');
    const wrong = events.filter((e) => e.type === 'wrongWay');
    // Some instruction other than straight must have come up and been ignored.
    expect(wrong.length).toBeGreaterThan(0);
    for (const w of wrong) {
      const p = passed.find((e) => e.junction === w.junction);
      expect(p.points).toBe(0);
    }
  });

  it('turns where the instructor says when the player swipes, re-placing the road', () => {
    const run = createRun(makeRng(31), 5);
    run.now = 1000;
    let wrong = 0;
    const events = drive(run, 60000, (r, now, evs) => {
      const j = currentJunction(r);
      const last = evs[evs.length - 1];
      if (last && last.type === 'instruction' && last.junction === j.index && last.turn !== 'straight') {
        applyInput(r, last.turn === 'left' ? 'left' : 'right');
      }
      if (j.blockers.length && j.scheduled && !j.stopped && r.s < j.sLine && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
      wrong += evs.filter((e) => e.type === 'wrongWay').length;
    });
    expect(events.filter((e) => e.type === 'wrongWay')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'passed').length).toBeGreaterThan(3);
    // Junctions ahead were rebuilt along the new exit: the run still keeps two ahead.
    expect(run.junctions.filter((j) => j.index > currentJunction(run).index).length).toBeGreaterThanOrEqual(2);
  });
});
