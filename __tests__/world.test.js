import { makeRng } from '../src/lib/priority/generator';
import { createRun, step, applyInput, currentJunction, youPose, vehiclePoses, visibleJunctions, toWorld, spacingFor, lightState, ALL_RED_MS, LIVES } from '../src/lib/priority/world';

// A T-junction with no straight ahead waits for a direction: take the instructed one.
// A stopped car only moves off on a swipe: do that once the way is clear.
// In a roundabout, arm the blinker once the next exit is the instructed one.
const armRing = (run) => {
  const j = currentJunction(run);
  if (j.ring && !j.ring.exitTo && !j.ring.armed && j.ring.order[j.ring.next] === j.instruction.to) applyInput(run, 'right');
};

const followInstructor = (run, events) => {
  const j = currentJunction(run);
  const last = events[events.length - 1];
  if (last && last.type === 'needTurn' && last.junction === j.index) {
    applyInput(run, last.instruction.turn === 'left' ? 'left' : 'right');
  }
  armRing(run);
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
        if (j.blockers.length && j.scheduled && !j.stopped && r.s < j.sLine && j.sWait - r.s < 70 && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
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
      maxMs: 90000,
      input: (r) => {
        const j = currentJunction(r);
        if (j.scheduled && !j.stopped && r.s < j.sLine && j.sWait - r.s < 70 && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
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
      if (!j.stopped && run.s < j.sLine && j.sWait - run.s < 70 && run.stoppedAt === null && !run.braking) applyInput(run, 'brake');
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
      if (j.blockers.length && j.scheduled && !j.stopped && r.s < j.sLine && j.sWait - r.s < 70 && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
    });
    const instructions = events.filter((e) => e.type === 'instruction');
    expect(instructions.length).toBeGreaterThan(0);
    for (const i of instructions) expect(['none', 'straight', 'left', 'right', 'main', 'roundabout']).toContain(i.kind);
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
      if (j.blockers.length && j.scheduled && !j.stopped && r.s < j.sLine && j.sWait - r.s < 70 && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
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
    armRing(r);
    const red = j.scene.control?.type === 'lights' && j.scene.control.crossFirst;
    if ((j.blockers.length || red) && j.scheduled && !j.stopped && r.s < j.sLine && j.sWait - r.s < 70 && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
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
    const { j } = found;
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
        armRing(r);
        // Brake for cars, ignore lights, and go the moment the cars have cleared.
        if (j.blockers.length && j.scheduled && !j.stopped && r.s < j.sLine && j.sWait - r.s < 70 && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
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

describe('motion and roundabouts', () => {
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

  it('eases the speed: accelerates from rest and brakes to a halt exactly at the line', () => {
    const run = createRun(makeRng(4), 1);
    expect(run.v).toBe(0);
    let peak = 0;
    let braked = false;
    let stoppedAt = null;
    const vs = [];
    drive(run, 40000, (r) => {
      const j = currentJunction(r);
      peak = Math.max(peak, r.v);
      if (!braked && j.scheduled && j.sWait - r.s < 60) {
        applyInput(r, 'brake');
        braked = true;
      }
      if (braked && stoppedAt === null) vs.push(r.v);
      if (r.stoppedAt !== null && stoppedAt === null) stoppedAt = { s: r.stoppedAt, sWait: j.sWait, v: r.v };
    });
    expect(peak).toBeGreaterThan(run.speed * 0.95);
    expect(stoppedAt).toBeTruthy();
    expect(stoppedAt.s).toBeCloseTo(stoppedAt.sWait, 5);
    expect(stoppedAt.v).toBe(0);
    // Braking is gradual: the speed goes down over many frames, never in one jump to zero.
    const drops = vs.slice(1).map((v, i) => vs[i] - v);
    expect(Math.max(...drops)).toBeLessThan(run.speed * 0.5);
    expect(drops.filter((d) => d > 0).length).toBeGreaterThan(10);
  });

  it('keeps circling a roundabout until the right swipe, then leaves at the next exit with the blinker', () => {
    let ring = null;
    for (let seed = 1; seed < 60 && !ring; seed++) {
      const run = createRun(makeRng(seed), 1);
      if (run.junctions[0].ring) ring = { run, seed };
    }
    expect(ring).toBeTruthy();
    const { run } = ring;
    const j = run.junctions[0];
    // Give way to anyone in the ring, but never signal: the car goes round and round.
    drive(run, 45000, (r) => {
      if (j.blockers.length && j.scheduled && !j.stopped && r.s < j.sLine && j.sWait - r.s < 70 && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
      if (r.stoppedAt !== null && r.now >= j.clearAt) applyInput(r, 'go');
    });
    expect(j.passed).toBe(false);
    expect(j.ring.laps).toBeGreaterThanOrEqual(1);
    expect(run.passed).toBe(0);
    // Now signal right: the car leaves at the next exit and the road is re-laid along it.
    applyInput(run, 'right');
    expect(run.intent).toBe('right');
    const exitArm = j.ring.order[j.ring.next];
    const events = drive(run, 20000);
    expect(j.ring.exitTo).toBe(exitArm);
    expect(events.some((e) => e.type === 'ringExit' && e.to === exitArm)).toBe(true);
    const passed = events.find((e) => e.type === 'passed' && e.junction === j.index);
    expect(passed).toBeTruthy();
    expect(passed.wrongWay).toBe(true); // a full lap is not what the instructor asked for
    expect(run.junctions[1].rot).toBe({ N: 0, E: 90, W: 270, S: 180 }[exitArm]);
  });

  it('leaves the roundabout at the instructed exit when the swipe comes in time', () => {
    let found = null;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const run = createRun(makeRng(seed), 1);
      if (run.junctions[0].ring) found = run;
    }
    const run = found;
    const j = run.junctions[0];
    const events = drive(run, 60000, (r, now, evs) => {
      followInstructor(r, evs);
      if (j.blockers.length && j.scheduled && !j.stopped && r.s < j.sLine && j.sWait - r.s < 70 && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
      if (r.stoppedAt !== null && r.now >= j.clearAt) applyInput(r, 'go');
    });
    const passed = events.find((e) => e.type === 'passed' && e.junction === j.index);
    expect(passed).toBeTruthy();
    expect(passed.wrongWay).toBe(false);
    expect(j.executedTo).toBe(j.instruction.to);
    expect(j.ring.laps).toBe(0);
  });

  it('other vehicles never jump: no pose moves more than a few units between frames', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const run = createRun(makeRng(seed), 3);
      let prev = new Map();
      let worst = 0;
      drive(run, 90000, (r, now, evs) => {
        followInstructor(r, evs);
        const j = currentJunction(r);
        if (j.blockers.length && j.scheduled && !j.stopped && r.s < j.sLine && j.sWait - r.s < 70 && r.stoppedAt === null && !r.braking) applyInput(r, 'brake');
        if (r.stoppedAt !== null && !j.needTurn && (!j.blockers.length || r.now >= j.clearAt)) applyInput(r, 'go');
        const cur = new Map();
        for (const p of vehiclePoses(r)) {
          const key = `${p.junction.index}-${p.vehicle.id}`;
          cur.set(key, p.pose);
          const was = prev.get(key);
          if (was) worst = Math.max(worst, Math.hypot(p.pose.x - was.x, p.pose.y - was.y));
        }
        prev = cur;
      });
      expect(worst).toBeLessThan(3);
    }
  });

  it('a car crossing from the left has cleared your way long before 62% of its path', () => {
    const { clearFractionFor } = require('../src/lib/priority/conflict');
    const scene = { layout: 'cross', arms: ['N', 'E', 'S', 'W'], vehicles: [{ id: 'you', from: 'S', to: 'N' }, { id: 'w', from: 'W', to: 'E' }, { id: 'e', from: 'E', to: 'N' }] };
    const you = scene.vehicles[0];
    expect(clearFractionFor(scene, scene.vehicles[1], you)).toBeLessThan(0.5);
    expect(clearFractionFor(scene, scene.vehicles[1], you)).toBeGreaterThan(0.2);
    // A car from the right turning right only shares the far quadrant with you.
    expect(clearFractionFor(scene, scene.vehicles[2], you)).toBeLessThanOrEqual(0.62);
  });
});

describe('roundabout crash', () => {
  it('after a crash at the ring entry the car still drives round the ring to the instructed exit', () => {
    let run = null;
    for (let seed = 1; seed < 80 && !run; seed++) {
      const r = createRun(makeRng(seed), 2);
      if (r.junctions[0].ring && r.junctions[0].blockers.length) run = r;
    }
    expect(run).toBeTruthy();
    const j = run.junctions[0];
    let now = 0;
    const events = [];
    const offRoad = [];
    for (let i = 0; i < 4000 && run.passed < 1; i++) {
      now += 16;
      events.push(...step(run, now)); // never brakes: crashes at the entry
      const me = youPose(run);
      // Local position in the roundabout frame while near it: must be on the ring band or an arm.
      const dx = me.x - j.cx;
      const dy = me.y - j.cy;
      const r = Math.hypot(dx, dy);
      if (r < 40 && !(Math.abs(r - 19) <= 8 || Math.abs(dx) <= 12.5 || Math.abs(dy) <= 12.5)) offRoad.push({ dx, dy, r });
    }
    expect(events.some((e) => e.type === 'crash' && e.junction === j.index)).toBe(true);
    expect(offRoad).toEqual([]);
    expect(j.ring.exitTo).toBe(j.instruction.to);
    expect(run.junctions[1].rot).toBe({ N: 0, E: 90, W: 270, S: 180 }[j.instruction.to]);
  });
});

describe('STOP sign', () => {
  const drive = (run, ms, onTick) => {
    const events = [];
    let now = run.now;
    for (let t = 0; t <= ms; t += 16) {
      now += 16;
      const evs = step(run, now);
      events.push(...evs);
      if (onTick) onTick(run, now, evs);
      if (run.over || run.passed >= 1) break;
    }
    return events;
  };
  const withStop = () => {
    for (let seed = 1; seed < 600; seed++) {
      const run = createRun(makeRng(seed), 1);
      const j = run.junctions[0];
      const sign = j.scene.signs?.S;
      if ((sign === 'stop' || sign === 'roundabout-stop') && !j.blockers.length && !j.ring && j.scene.arms.includes('N') && j.instruction.turn === 'straight') return run;
    }
    return null;
  };

  it('stopping at a STOP sign with nothing coming is not a needless stop', () => {
    const run = withStop();
    expect(run).toBeTruthy();
    const j = run.junctions[0];
    let braked = false;
    const events = drive(run, 60000, (r, now, evs) => {
      followInstructor(r, evs);
      if (!braked && j.scheduled && j.sWait - r.s < 50) {
        applyInput(r, 'brake');
        braked = true;
      }
      if (r.stoppedAt !== null && !j.needTurn && now - j.stoppedAtTime > 300) applyInput(r, 'go');
    });
    expect(events.some((e) => e.type === 'hesitated')).toBe(false);
    const passed = events.find((e) => e.type === 'passed');
    expect(passed.points).toBeGreaterThan(0);
    expect(passed.record.stopSign).toBe(true);
  });

  it('driving through a STOP sign without stopping spoils the junction', () => {
    const run = withStop();
    const events = drive(run, 60000, (r, now, evs) => followInstructor(r, evs));
    expect(events.some((e) => e.type === 'ranStop')).toBe(true);
    const passed = events.find((e) => e.type === 'passed');
    expect(passed.ranStop).toBe(true);
    expect(passed.points).toBe(0);
    expect(passed.record.outcome).toBe('spoiled');
  });
});

describe('brake reaction, turn-means-go, blinker', () => {
  const { youSignalFor } = require('../src/lib/priority/world');
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

  it('slows down right after the swipe, lights the brake lights, and still stops exactly at the line', () => {
    const run = createRun(makeRng(4), 1);
    let swipedAt = null;
    let vAtSwipe = 0;
    let vAfter = null;
    let lightsOn = false;
    let stop = null;
    drive(run, 40000, (r, now) => {
      const j = currentJunction(r);
      if (swipedAt === null && r.v >= r.speed * 0.98 && j.sWait - r.s > 120) {
        applyInput(r, 'brake');
        swipedAt = now;
        vAtSwipe = r.v;
      }
      if (swipedAt !== null && vAfter === null && now >= swipedAt + 300) vAfter = r.v;
      if (swipedAt !== null && r.brakeLights) lightsOn = true;
      if (r.stoppedAt !== null && stop === null) stop = { s: r.stoppedAt, sWait: j.sWait, v: r.v };
    });
    expect(swipedAt).not.toBeNull();
    expect(vAfter).toBeLessThan(vAtSwipe - 1.5); // visibly slower within 300 ms
    expect(lightsOn).toBe(true);
    expect(stop).toBeTruthy();
    expect(stop.s).toBeCloseTo(stop.sWait, 5);
  });

  it('a direction swipe while standing at the line moves the car off', () => {
    let run = null;
    for (let seed = 1; seed < 200 && !run; seed++) {
      const r = createRun(makeRng(seed), 1);
      const j = r.junctions[0];
      if (!j.ring && !j.scene.arms.includes('N') && !j.blockers.length) run = r;
    }
    expect(run).toBeTruthy();
    const j = run.junctions[0];
    drive(run, 30000, (r) => {
      if (r.stoppedAt !== null) return;
    });
    // Without a direction the car waits at the line.
    expect(run.stoppedAt).not.toBeNull();
    expect(j.needTurn).toBe(true);
    const dir = j.instruction.turn === 'left' ? 'left' : 'right';
    applyInput(run, dir);
    expect(run.stoppedAt).toBeNull();
    expect(youSignalFor(run)).toBe(dir);
    const events = drive(run, 20000);
    expect(events.some((e) => e.type === 'passed' && e.junction === j.index)).toBe(true);
    expect(events.some((e) => e.type === 'resumed')).toBe(true);
  });

  it('the blinker is on from the swipe through the turn and off once the box is left', () => {
    let run = null;
    for (let seed = 1; seed < 200 && !run; seed++) {
      const r = createRun(makeRng(seed), 1);
      const j = r.junctions[0];
      if (!j.ring && j.scene.arms.includes('N') && j.scene.arms.includes('E') && !j.blockers.length) run = r;
    }
    const j = run.junctions[0];
    const seen = { before: false, inBox: false, afterOff: false };
    drive(run, 40000, (r) => {
      if (r.s < j.sWait - 40 && r.s > 20 && r.intent === null) applyInput(r, 'right');
      const sig = youSignalFor(r);
      if (r.s < j.sLine && r.intent === 'right' && sig === 'right') seen.before = true;
      if (r.s >= j.sLine && r.s < j.sExitBox && sig === 'right') seen.inBox = true;
      if (j.passed && currentJunction(r).index === j.index + 1 && sig === null) seen.afterOff = true;
    });
    expect(seen).toEqual({ before: true, inBox: true, afterOff: true });
  });
});

describe('vehicles you could never meet', () => {
  it('are not blockers: no crash, no penalty, and they are not among the reasons', () => {
    const { resolve } = require('../src/lib/priority/engine');
    // A right turn while a car comes straight out of the arm you enter: the
    // engine orders you behind it (exam convention), the road does not.
    const scene = { layout: 'cross', arms: ['N', 'E', 'S', 'W'], signs: {}, mainRoad: null, tramTracks: [], control: null, pedestrians: [],
      vehicles: [{ id: 'you', kind: 'car', color: 'you', from: 'S', to: 'E' }, { id: 'yellow', kind: 'car', color: 'yellow', from: 'E', to: 'W' }] };
    expect(resolve(scene).yields.you).toContain('yellow');
    let run = null;
    for (let seed = 1; seed < 200 && !run; seed++) {
      const r = createRun(makeRng(seed), 1);
      if (!r.junctions[0].ring) run = r;
    }
    // Swap in the scene above as the first junction.
    const j = run.junctions[0];
    j.scene = { ...scene, id: 'test', level: 1 };
    j.instruction = { kind: 'right', turn: 'right', to: 'E' };
    j.pathCache = {};
    const { applyInput: input } = require('../src/lib/priority/world');
    input(run, 'right'); // re-resolves and re-lays the road along E
    expect(j.blockers).toEqual([]);
    let now = 0;
    const events = [];
    for (let i = 0; i < 4000 && run.passed < 1; i++) {
      now += 16;
      events.push(...step(run, now));
    }
    expect(events.some((e) => e.type === 'crash')).toBe(false);
    const passed = events.find((e) => e.type === 'passed');
    expect(passed.points).toBeGreaterThan(0);
    expect(passed.record.reasons.filter((r) => r.who === 'you')).toEqual([]);
  });
});

describe('crash clears the swipe', () => {
  it('the blinker goes off after the crashed junction and the intent does not leak into the next one', () => {
    const { youSignalFor } = require('../src/lib/priority/world');
    // A run whose first junction still has a vehicle crossing your path after you signal right.
    let run = null;
    let j = null;
    let now = 0;
    for (let seed = 1; seed < 400 && !run; seed++) {
      const r = createRun(makeRng(seed), 3);
      const first = r.junctions[0];
      if (first.ring || !first.scene.arms.includes('E') || !first.scene.arms.includes('N')) continue;
      let t = 0;
      while (t < 30000 && !(first.scheduled && first.sWait - r.s < 80)) {
        t += 16;
        step(r, t);
      }
      applyInput(r, 'right');
      if (first.blockers.length) {
        run = r;
        j = first;
        now = t;
      }
    }
    expect(run).toBeTruthy();
    expect(youSignalFor(run)).toBe('right');
    const events = [];
    for (let i = 0; i < 6000 && run.passed < 2; i++) {
      now += 16;
      events.push(...step(run, now));
      if (j.passed && currentJunction(run).index === j.index + 1) {
        expect(run.intent).toBeNull();
        expect(youSignalFor(run)).toBeNull();
      }
    }
    expect(events.some((e) => e.type === 'crash' && e.junction === j.index)).toBe(true);
    expect(j.passed).toBe(true);
  });
});
