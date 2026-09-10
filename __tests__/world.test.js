import { makeRng } from '../src/lib/priority/generator';
import { createRun, step, applyInput, currentJunction, youPose, vehiclePoses, visibleJunctions, toWorld, spacingFor, lightState, ALL_RED_MS, LIVES } from '../src/lib/priority/world';

// A T-junction with no straight ahead waits for a direction: take the instructed one.
// A stopped car only moves off on a swipe: do that once the way is clear.
const followInstructor = (run, events) => {
  const j = currentJunction(run);
  const last = events[events.length - 1];
  if (last && last.type === 'needTurn' && last.junction === j.index) {
    applyInput(run, last.instruction.turn === 'left' ? 'left' : 'right');
  }
  if (run.stoppedAt !== null && !j.needTurn) {
    const ready = j.blockers.length ? run.now >= j.clearAt : true;
    if (ready) applyInput(run, 'go');
  }
};

const runUntil = (run, predicate, { input = null, maxMs = 60000, dt = 16 } = {}) => {
  let now = run.now;
  const events = [];
  while (now < maxMs) {
    now += dt;
    events.push(...step(run, now));
    followInstructor(run, events);
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
    const events = runUntil(run, (r, evs) => evs.some((e) => e.type === 'crash') || r.passed > 12, { maxMs: 90000 });
    const crash = events.find((e) => e.type === 'crash');
    expect(crash).toBeDefined();
    expect(crash.culprit).toBeTruthy();
    expect(crash.rule).toBeTruthy();
    expect(crash.record.outcome).toBe('crash');
    expect(run.lives).toBe(LIVES - 1);
  });

  it('penalises a needless stop without taking a life and resumes by itself', () => {
    const run = createRun(makeRng(5), 1);
    // Brake at every junction regardless.
    const events = runUntil(run, (r) => r.passed >= 4 || r.over, {
      maxMs: 60000,
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
    for (const e of events.filter((x) => x.type === 'passed')) {
      expect(e.record.scene.vehicles.some((v) => v.id === 'you')).toBe(true);
      expect(Array.isArray(e.record.reasons)).toBe(true);
    }
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
    expect(Math.round(Math.hypot(b.cx - a.cx, b.cy - a.cy))).toBe(spacingFor(4));
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
    const events = [];
    for (let i = 0; i < 3000 && !moved; i++) {
      now += 16;
      events.push(...step(run, now));
      followInstructor(run, events);
      const j = currentJunction(run);
      if (!j.scheduled || !j.blockers.length) continue;
      const blocker = j.blockers[0];
      const before = vehiclePoses(run).find((p) => p.vehicle.id === blocker && p.junction.index === j.index);
      if (!before) continue;
      // Once the blocker's start time has passed it must have left its waiting spot.
      if (j.starts[blocker] !== null && now > j.starts[blocker] + 700) {
        const rest = vehiclePoses(run).find((p) => p.vehicle.id === blocker && p.junction.index === j.index);
        const local = j.pathCache[blocker];
        const waitWorld = toWorld(j, local.through[0]);
        moved = Math.hypot(rest.pose.x - waitWorld.x, rest.pose.y - waitWorld.y) > 3;
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
      followInstructor(r, evs);
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
    for (const i of instructions) expect(['none', 'left', 'right', 'main', 'roundabout']).toContain(i.kind);
    // Straight on is never announced.
    for (const i of instructions) if (i.kind === 'none') expect(i.turn).toBe('straight');
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
    const events = drive(run, 60000, (r, now, evs) => {
      followInstructor(r, evs);
      const j = currentJunction(r);
      const last = evs[evs.length - 1];
      if (last && last.type === 'instruction' && last.junction === j.index && last.turn !== 'straight') {
        applyInput(r, last.turn === 'left' ? 'left' : 'right');
      }
      if (j.blockers.length && j.scheduled && !j.stopped && r.s < j.sLine && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
    });
    expect(events.filter((e) => e.type === 'wrongWay')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'passed').length).toBeGreaterThan(3);
    // Junctions ahead were rebuilt along the new exit: the run still keeps two ahead.
    expect(run.junctions.filter((j) => j.index > currentJunction(run).index).length).toBeGreaterThanOrEqual(2);
  });
});

describe('pacing and lights', () => {
  const drive = (run, ms, onTick) => {
    const events = [];
    let now = run.now;
    for (let t = 0; t <= ms; t += 16) {
      now += 16;
      const evs = step(run, now);
      events.push(...evs);
      if (onTick) onTick(run, now, evs);
      if (run.over) break;
    }
    return events;
  };
  const careful = (r, now, evs) => {
    const j = currentJunction(r);
    const last = evs[evs.length - 1];
    if (last && last.type === 'needTurn' && last.junction === j.index) applyInput(r, last.instruction.turn === 'left' ? 'left' : 'right');
    const red = j.scene.control?.type === 'lights' && j.scene.control.crossFirst;
    if ((j.blockers.length || red) && j.scheduled && !j.stopped && r.s < j.sLine && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
    const state = lightState(j, r.now);
    const green = state ? state.S === 'green' : true;
    if (r.stoppedAt !== null && !j.needTurn && green && (!j.blockers.length || r.now >= j.clearAt)) applyInput(r, 'go');
  };

  it('gives the driver open road before the first junction and a fair gap between junctions', () => {
    const run = createRun(makeRng(21), 1);
    const first = run.junctions[0];
    expect(first.sWait / run.speed).toBeGreaterThanOrEqual(9);
    drive(run, 40000, careful);
    const [a, b] = run.junctions;
    expect((b.sWait - a.sWait) / run.speed).toBeGreaterThanOrEqual(7);
  });

  it('a vehicle with priority is rolling before you arrive, not waiting at its line', () => {
    const run = createRun(makeRng(11), 3);
    let checked = false;
    drive(run, 120000, (r, now, evs) => {
      careful(r, now, evs);
      const j = currentJunction(r);
      if (checked || !j.scheduled || !j.blockers.length || j.scene.control) return;
      const b = j.blockers[0];
      const start = j.starts[b];
      if (start === null || now < start - 800 || now > start - 200) return;
      const pose = vehiclePoses(r).find((p) => p.vehicle.id === b && p.junction.index === j.index);
      expect(pose).toBeTruthy();
      const waitWorld = toWorld(j, j.pathCache[b].through[0]);
      // Still on its approach, i.e. moving towards the line, and you have not arrived yet.
      expect(Math.hypot(pose.pose.x - waitWorld.x, pose.pose.y - waitWorld.y)).toBeGreaterThan(2);
      expect(r.s).toBeLessThan(j.sWait);
      checked = true;
    });
    expect(checked).toBe(true);
  });

  it('cycles the lights: red for you while the cross traffic goes, green once it has cleared', () => {
    let found = null;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const run = createRun(makeRng(seed), 2);
      drive(run, 150000, (r, now, evs) => {
        const j = currentJunction(r);
        careful(r, now, evs);
        if (found || !j.scheduled || j.scene.control?.type !== 'lights' || !j.scene.control.crossFirst) return;
        found = { run: r, j };
      });
    }
    expect(found).toBeTruthy();
    const { run, j } = found;
    expect(j.blockers.length).toBeGreaterThan(0);
    expect(j.resolution.reasons.some((x) => x.who === 'you' && x.rule === 'signal')).toBe(true);
    const early = lightState(j, j.t0 + 100);
    expect(early.S).toBe('red');
    expect(early.E).toBe('green');
    // When you would reach the line the cross road still has its green and you are on red.
    const atLine = lightState(j, j.arriveAt);
    expect(atLine.S).toBe('red');
    expect(['green', 'yellow']).toContain(atLine.E);
    const late = lightState(j, j.clearAt + ALL_RED_MS + 100);
    expect(late.S).toBe('green');
    expect(late.E).toBe('red');
    expect(lightState(j, j.clearAt + ALL_RED_MS - 400).S).toBe('redyellow');
    expect(lightState(j, j.clearAt + 100).S).toBe('redyellow');
  });

  it('running a red light spoils the junction without a crash when nothing is crossing', () => {
    let seen = false;
    for (let seed = 1; seed < 80 && !seen; seed++) {
      const run = createRun(makeRng(seed), 2);
      const events = drive(run, 150000, (r, now, evs) => {
        const j = currentJunction(r);
        const last = evs[evs.length - 1];
        if (last && last.type === 'needTurn' && last.junction === j.index) applyInput(r, last.instruction.turn === 'left' ? 'left' : 'right');
        // Brake for cars, ignore lights, and go the moment the cars have cleared.
        if (j.blockers.length && j.scheduled && !j.stopped && r.s < j.sLine && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
        if (r.stoppedAt !== null && !j.needTurn && (!j.blockers.length || r.now >= j.clearAt)) applyInput(r, 'go');
      });
      const red = events.find((e) => e.type === 'redLight');
      if (red) {
        seen = true;
        const passed = events.find((e) => e.type === 'passed' && e.junction === red.junction);
        expect(passed.ranRed).toBe(true);
        expect(passed.points).toBe(0);
        expect(passed.record.outcome).toBe('spoiled');
      }
    }
    expect(seen).toBe(true);
  });
});
