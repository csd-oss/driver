import { makeRng } from '../src/lib/priority/generator';
import { createRun, step, applyInput, currentJunction, youPose, vehiclePoses, visibleJunctions, toWorld, spacingFor, lightState, lightPlan, ALL_RED_MS, LIVES, speedFor } from '../src/lib/priority/world';

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

  it('allows cautious stops without hesitation penalties', () => {
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
    expect(hesitations).toHaveLength(0);
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
      if (checked || !j.scheduled || !j.blockers.length || j.scene.control || j.ring) return;
      const b = j.blockers.find((id) => j.rollIn && j.rollIn[id]);
      if (!b) return;
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
    const greenAt = lightPlan(j).yourGreenAt;
    const late = lightState(j, greenAt + 100);
    expect(late.S).toBe('green');
    expect(late.E).toBe('red');
    expect(lightState(j, greenAt - 400).S).toBe('redyellow');
    expect(lightState(j, greenAt - 600).S).toBe('redyellow');
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
          if (was) {
            const movement = Math.hypot(p.pose.x - was.x, p.pose.y - was.y);
            if (movement >= 3) throw new Error(`jump seed=${seed} t=${now} ${key} ${JSON.stringify({was, now:p.pose, vehicle:p.vehicle, starts:p.junction.starts, roll:p.junction.rollIn, s:r.s})}`);
            worst = Math.max(worst, movement);
          }
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
    const run = createRun(makeRng(7), 1);
    const j = run.junctions[0];
    expect(j.ring).toBeTruthy();
    while (run.stoppedAt === null) {
      if (j.sWait - run.s < 50) applyInput(run, 'brake');
      step(run, run.now + 32);
    }
    // Moving off immediately here reaches the circulating car's body.
    // A timer alone must never cause the collision this test recovers from.
    applyInput(run, 'go');
    const events = [];
    let now = run.now;
    const offRoad = [];
    for (let i = 0; i < 4000 && run.passed < 1; i++) {
      now += 16;
      events.push(...step(run, now));
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

  it('selecting a direction keeps the car stopped until Go', () => {
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
    expect(run.stoppedAt).not.toBeNull();
    expect(j.needTurn).toBe(false);
    applyInput(run, 'go');
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
      vehicles: [{ id: 'you', kind: 'car', color: 'you', from: 'S', to: 'N' }, { id: 'yellow', kind: 'car', color: 'yellow', from: 'E', to: 'W' }] };
    expect(resolve({ ...scene, vehicles: [{ ...scene.vehicles[0], to: 'E' }, scene.vehicles[1]] }).yields.you).toContain('yellow');
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
    j.starts = { you: null, yellow: null }; // the swapped-in scene has its own vehicles
    const { applyInput: input } = require('../src/lib/priority/world');
    input(run, 'right'); // switches you to E, re-resolves and re-lays the road
    expect(j.scene.vehicles.find((v) => v.id === 'you').to).toBe('E');
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
  it('a crash clears the turn you had set, and the blinker is off at the next junction', () => {
    const { youSignalFor } = require('../src/lib/priority/world');
    let seen = null;
    for (let seed = 1; seed < 200 && !seen; seed++) {
      const run = createRun(makeRng(seed), 2 + (seed % 5));
      let now = 0;
      let crashAt = null;
      // Never brake, and signal right at every junction: sooner or later a
      // vehicle with priority is hit while the indicator is on.
      for (let i = 0; i < 6000; i++) {
        now += 16;
        const evs = step(run, now);
        const j = currentJunction(run);
        if (crashAt === null && j.scheduled && !j.ring && run.s < j.sLine && run.intent === null) applyInput(run, 'right');
        const crash = evs.find((e) => e.type === 'crash');
        if (crash && crashAt === null) {
          crashAt = crash.junction;
          expect(run.intent).toBeNull(); // the swipe is spent on the junction it was meant for
        }
        // Past the junction you crashed at: the turn is finished, so is the blinker.
        const where = run.junctions.find((x) => x.index === crashAt);
        if (crashAt !== null && where && run.s > where.sExitBox + 10) {
          seen = { signal: youSignalFor(run), lives: run.lives, intent: run.intent };
          break;
        }
        if (run.over) break;
      }
    }
    expect(seen).toBeTruthy();
    expect(seen.intent).toBeNull();
    expect(seen.signal).toBeNull();
    expect(seen.lives).toBeLessThan(LIVES);
  });
});

describe('giving way is never punished', () => {
  const runFor = (run, untilNow, onTick) => {
    const events = [];
    let now = run.now;
    while (now < untilNow) {
      now += 16;
      events.push(...step(run, now));
      if (onTick) onTick(run, now);
      if (run.over) break;
    }
    return events;
  };

  it('stopping for a car with priority is never a needless stop, however late the halt comes', () => {
    let found = null;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const run = createRun(makeRng(seed), 2);
      const j = run.junctions[0];
      if (j.ring || !j.blockers.length || j.instruction.turn !== 'straight' || !j.scene.arms.includes('N')) continue;
      // Brake as soon as the junction is announced: the car creeps up and
      // halts well after the vehicle with priority has cleared.
      let stopped = null;
      const events = [];
      let now = 0;
      for (let i = 0; i < 4000 && run.passed < 1; i++) {
        now += 16;
        events.push(...step(run, now));
        if (j.scheduled && run.s < j.sWait && !run.braking && run.stoppedAt === null) applyInput(run, 'brake');
        if (run.stoppedAt !== null && stopped === null) stopped = now;
        if (run.stoppedAt !== null && (!lightState(j, now) || lightState(j, now).S === 'green')) applyInput(run, 'go');
      }
      if (stopped !== null && stopped > j.clearAt) found = { events, stopped, clearAt: j.clearAt };
      expect(events.some((e) => e.type === 'hesitated')).toBe(false);
    }
    // At least one seed halted after the way was clear and was still not blamed.
    expect(found).toBeTruthy();
    expect(found.stopped).toBeGreaterThan(found.clearAt);
    const passed = found.events.find((e) => e.type === 'passed');
    expect(passed.hesitated).toBe(false);
    expect(passed.points).toBeGreaterThan(0);
  });

  it('you are not too slow while a vehicle is still crossing in front of you', () => {
    let run = null;
    for (let seed = 1; seed < 400 && !run; seed++) {
      const r = createRun(makeRng(seed), 2);
      const j = r.junctions[0];
      const sign = j.scene.signs?.S;
      if (j.ring || j.blockers.length || sign === 'stop' || sign === 'roundabout-stop') continue;
      if (j.scene.vehicles.length > 1 && j.instruction.turn === 'straight' && j.scene.arms.includes('N')) run = r;
    }
    expect(run).toBeTruthy();
    const j = run.junctions[0];
    let now = run.now;
    while (run.stoppedAt === null && now < 40000) {
      now += 16;
      step(run, now);
      if (j.scheduled && j.sWait - run.s < 40) applyInput(run, 'brake');
    }
    expect(run.stoppedAt).not.toBeNull();
    const t0 = j.stoppedAtTime;
    // A vehicle whose path crosses yours drives through right now, although
    // it is not one you had to give way to.
    const crossing = Object.keys(j.clearFraction).find((id) => j.clearFraction[id] !== null);
    expect(crossing).toBeTruthy();
    j.starts[crossing] = t0 + 2000;
    run.now = now;
    // Past the plain grace: without the crossing vehicle this would be late.
    const first = runFor(run, t0 + 4600);
    expect(first.some((e) => e.type === 'late')).toBe(false);
    const later = runFor(run, t0 + 13000);
    expect(later.some((e) => e.type === 'late')).toBe(false);
    expect(run.stoppedAt).not.toBeNull();
  });
});

describe('traffic that does not involve you', () => {
  it('drives through on its own instead of waiting for you to pass', () => {
    const { resolve } = require('../src/lib/priority/engine');
    // You turn right (S to E); the other car turns right too (N to W). The
    // two paths never come near each other and it yields to nobody.
    const scene = {
      layout: 'cross', arms: ['N', 'E', 'S', 'W'], signs: {}, mainRoad: null, tramTracks: [], control: null, pedestrians: [],
      vehicles: [{ id: 'you', kind: 'car', color: 'you', from: 'S', to: 'N' }, { id: 'red', kind: 'car', color: 'red', from: 'N', to: 'W' }],
    };
    expect(resolve({ ...scene, vehicles: [{ ...scene.vehicles[0], to: 'E' }, scene.vehicles[1]] }).yields.red).toEqual([]);
    let run = null;
    for (let seed = 1; seed < 200 && !run; seed++) {
      const r = createRun(makeRng(seed), 1);
      if (!r.junctions[0].ring) run = r;
    }
    const j = run.junctions[0];
    j.scene = { ...scene, id: 'test', level: 1 };
    j.instruction = { kind: 'right', turn: 'right', to: 'E' };
    j.pathCache = {};
    j.starts = { you: null, red: null }; // the swapped-in scene has its own vehicles
    applyInput(run, 'right'); // switches you to E, re-resolves and re-lays the road
    expect(j.scene.vehicles.find((v) => v.id === 'you').to).toBe('E');
    expect(j.clearFraction.red).toBeNull();

    let now = 0;
    for (let i = 0; i < 3000 && !j.scheduled; i++) {
      now += 16;
      step(run, now);
    }
    expect(j.scheduled).toBe(true);
    // It has a start of its own, before you reach the box, and you have not moved off.
    expect(j.starts.red).not.toBeNull();
    expect(j.starts.red).toBeLessThan(j.arriveAt);
    expect(j.starts.you).toBeNull();
    // And it really moves while you are still approaching.
    const poseOf = () => vehiclePoses(run).find((p) => p.vehicle.id === 'red' && p.junction.index === j.index);
    const before = poseOf();
    for (let i = 0; i < 90; i++) {
      now += 16;
      step(run, now);
    }
    const after = poseOf();
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(Math.hypot(after.pose.x - before.pose.x, after.pose.y - before.pose.y)).toBeGreaterThan(2);
    expect(run.s).toBeLessThan(j.sLine);
  });
});

describe('cross traffic follows its own order', () => {
  it('a car that gives way only to other cars goes when they have gone, not when you pass', () => {
    // A roundabout: you enter from S, two cars circulate, one more enters
    // from W and must give way to the ring, not to you.
    let found = null;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const run = createRun(makeRng(seed), 4);
      const j = run.junctions[0];
      if (!j.ring) continue;
      const entering = j.scene.vehicles.find((v) => v.id !== 'you' && v.from !== 'ring' && j.clearFraction[v.id] === null);
      if (!entering) continue;
      const deps = j.resolution.yields[entering.id] || [];
      if (!deps.length || deps.includes('you')) continue;
      let now = 0;
      for (let i = 0; i < 3000 && !j.scheduled; i++) {
        now += 16;
        step(run, now);
      }
      if (j.scheduled) found = { run, j, id: entering.id, deps, now };
    }
    expect(found).toBeTruthy();
    const { j, id, deps } = found;
    // It has a start of its own, after the cars it follows and before you move off.
    expect(j.starts[id]).not.toBeNull();
    expect(j.starts.you).toBeNull();
    for (const d of deps) {
      expect(j.starts[d]).not.toBeNull();
      expect(j.starts[id]).toBeGreaterThan(j.starts[d]);
    }
  });
});

describe('traffic lights hold their own phase', () => {
  const { crossIdsOf } = require('../src/lib/priority/world');
  const stopAtLine = (run, j) => {
    let now = run.now;
    while (run.stoppedAt === null && now < 60000) {
      now += 16;
      step(run, now);
      if (j.scheduled && j.sWait - run.s < 40) applyInput(run, 'brake');
    }
    return now;
  };

  it('never calls you slow while your light is red, even when no crossing car is in your way', () => {
    let run = null;
    for (let seed = 1; seed < 500 && !run; seed++) {
      const r = createRun(makeRng(seed), 3);
      const j = r.junctions[0];
      if (j.scene.control?.type !== 'lights' || !j.scene.control.crossFirst) continue;
      const cross = crossIdsOf(j.scene);
      if (cross.length && cross.every((id) => j.clearFraction[id] === null)) run = r;
    }
    expect(run).toBeTruthy();
    const j = run.junctions[0];
    const cross = crossIdsOf(j.scene);
    let now = stopAtLine(run, j);
    expect(run.stoppedAt).not.toBeNull();
    // The cross traffic still has green, so you are held even though none of
    // those cars could ever hit you.
    expect(lightState(j, now).S).toBe('red');
    const events = [];
    let greenAt = null;
    for (let i = 0; i < 1200; i++) {
      now += 16;
      events.push(...step(run, now));
      const phase = lightState(j, now).S;
      if (phase === 'green' && greenAt === null) greenAt = now;
      if (phase === 'red' || phase === 'redyellow') expect(events.some((e) => e.type === 'late')).toBe(false);
    }
    expect(greenAt).not.toBeNull();
    // Green only after the other phase has cleared the junction.
    for (const id of cross) expect(greenAt).toBeGreaterThan(j.starts[id]);
  });

  it('keeps the cross traffic waiting while you have the green', () => {
    let run = null;
    for (let seed = 1; seed < 500 && !run; seed++) {
      const r = createRun(makeRng(seed), 3);
      const j = r.junctions[0];
      if (j.scene.control?.type === 'lights' && !j.scene.control.crossFirst && crossIdsOf(j.scene).length) run = r;
    }
    expect(run).toBeTruthy();
    const j = run.junctions[0];
    const cross = crossIdsOf(j.scene);
    let now = stopAtLine(run, j);
    for (let i = 0; i < 400; i++) {
      now += 16;
      step(run, now);
      expect(lightState(j, now).S).toBe('green');
      for (const id of cross) expect(j.starts[id]).toBeNull();
    }
  });
});

describe('roundabout traffic keeps moving', () => {
  it('a car with priority circulates towards your entry instead of standing on the ring', () => {
    const { RING_R } = require('../src/lib/priority/layout');
    let found = null;
    for (let seed = 1; seed < 300 && !found; seed++) {
      const run = createRun(makeRng(seed), 4);
      const j = run.junctions[0];
      if (!j.ring || !j.blockers.length) continue;
      const onRing = j.blockers.find((id) => j.scene.vehicles.find((v) => v.id === id)?.from === 'ring');
      if (!onRing) continue;
      let now = 0;
      for (let i = 0; i < 3000 && !j.scheduled; i++) {
        now += 16;
        step(run, now);
      }
      if (j.scheduled) found = { run, j, id: onRing, now };
    }
    expect(found).toBeTruthy();
    const { run, j, id } = found;
    let now = found.now;
    const poseOf = () => vehiclePoses(run).find((p) => p.vehicle.id === id && p.junction.index === j.index);
    let moved = 0;
    let still = 0;
    let offRing = 0;
    let last = null;
    while (now < j.starts[id] + 200 && now < found.now + 30000) {
      now += 16;
      step(run, now);
      const p = poseOf();
      if (!p) continue;
      const local = { x: p.pose.x - j.cx, y: p.pose.y - j.cy };
      const r = Math.hypot(local.x, local.y);
      if (Math.abs(r - RING_R) > 9 && Math.abs(local.x) > 13 && Math.abs(local.y) > 13) offRing += 1;
      if (last) {
        const d = Math.hypot(p.pose.x - last.x, p.pose.y - last.y);
        if (d > 0.15) moved += 1;
        // Waiting on the approach for a circulating car is expected. The
        // regression is a parked car ON the ring, not sensible entry yielding.
        else if (Math.abs(r - RING_R) < 3) still += 1;
      }
      last = p.pose;
    }
    expect(now).toBeGreaterThanOrEqual(j.starts[id] + 200);
    expect(moved).toBeGreaterThan(30);
    expect(still).toBeLessThan(moved / 4);
    expect(offRing).toBe(0);
  });
});

describe('the guide', () => {
  const { lessonHint } = require('../src/lib/priority/world');
  const { LESSONS, LESSON_COUNT, lessonVerdict } = require('../src/lib/priority/lessons');

  // Follow the lesson's own prompts, whatever they ask for.
  const obey = (run) => {
    const hint = lessonHint(run);
    if (!hint) return;
    if (hint.step === 'giveWay' || hint.step === 'redLight' || hint.step === 'stopSign') applyInput(run, 'brake');
    if (hint.step === 'go') applyInput(run, 'go');
    if (hint.step === 'turn') applyInput(run, hint.dir);
    if (hint.step === 'ring') applyInput(run, 'right');
  };

  const play = (index, drive) => {
    const run = createRun(makeRng(4), 1, { lesson: index });
    const j = run.junctions[0];
    const events = [];
    let now = 0;
    for (let i = 0; i < 9000 && !j.passed && !j.crashed; i++) {
      now += 16;
      events.push(...step(run, now));
      drive(run, j, now);
    }
    return { run, j, events, verdict: lessonVerdict(LESSONS[index], j) };
  };

  it('sets up every lesson with the junction it means to teach', () => {
    const expected = {
      controls: { blockers: [], stop: false },
      rightHand: { blockers: ['red'], stop: false },
      mainRoad: { blockers: [], stop: false },
      sideRoad: { blockers: ['green'], stop: false },
      stopSign: { blockers: [], stop: true },
      lights: { blockers: ['yellow'], stop: false },
      turn: { blockers: [], stop: false },
      // You go straight until you swipe left, so the oncoming car is not
      // yet in your way when the junction is built.
      leftTurn: { blockers: [], stop: false },
      tram: { blockers: ['tram1'], stop: false },
      tramYield: { blockers: [], stop: false },
      roundabout: { blockers: ['red'], stop: false },
    };
    expect(LESSONS.map((l) => l.id)).toEqual(Object.keys(expected));
    LESSONS.forEach((lesson, index) => {
      const run = createRun(makeRng(1), 1, { lesson: index });
      const j = run.junctions[0];
      expect(j.lesson).toBe(lesson.id);
      expect(j.scene.vehicles.find((v) => v.id === 'you')).toBeTruthy();
      expect(j.blockers).toEqual(expected[lesson.id].blockers);
      expect(j.instruction).toEqual(lesson.instruction);
      expect(run.coach).toBe(true);
    });
  });

  it('passes every lesson when the player does as it says', () => {
    LESSONS.forEach((lesson, index) => {
      const { run, j, verdict } = play(index, (r, junction, now) => {
        obey(r);
        if (r.stoppedAt !== null && !junction.needTurn && (!junction.blockers.length || r.now >= junction.clearAt) && now > junction.stoppedAtTime + 500) applyInput(r, 'go');
      });
      expect(j.crashed).toBe(false);
      expect(verdict).toEqual({ passed: true, reason: null });
      expect(run.lives).toBe(LIVES); // the guide never takes a life
    });
  });

  it('fails the lesson, without cost, when the player ignores it', () => {
    const cases = { rightHand: 'crash', sideRoad: 'crash', stopSign: 'noStop', lights: 'crash', turn: 'wrongWay', leftTurn: 'wrongWay' };
    for (const [id, reason] of Object.entries(cases)) {
      const index = LESSONS.findIndex((l) => l.id === id);
      const { run, verdict } = play(index, (r, junction) => {
        // Drive straight on regardless: no braking, and the wrong way at a T.
        if (junction.needTurn) applyInput(r, junction.instruction.turn === 'left' ? 'right' : 'left');
        if (r.stoppedAt !== null && !junction.needTurn) applyInput(r, 'go');
      });
      expect(verdict.passed).toBe(false);
      expect(verdict.reason).toBe(reason);
      expect(run.lives).toBe(LIVES);
    }
  });

  it('fails a lesson for moving off on red, and it still costs nothing', () => {
    const index = LESSONS.findIndex((l) => l.id === 'lights');
    const { run, j, verdict } = play(index, (r, junction) => {
      // Brake at the last moment, then pull away while the light is still red.
      if (junction.scheduled && junction.sWait - r.s < 40 && r.stoppedAt === null) applyInput(r, 'brake');
      if (r.stoppedAt !== null) applyInput(r, 'go');
    });
    expect(j.ranRed).toBe(true);
    expect(verdict).toEqual({ passed: false, reason: 'red' });
    expect(run.lives).toBe(LIVES);
  });

  it('asks for the swipe that matches the moment', () => {
    const index = LESSONS.findIndex((l) => l.id === 'rightHand');
    const run = createRun(makeRng(4), 1, { lesson: index });
    const j = run.junctions[0];
    const seen = [];
    let now = 0;
    for (let i = 0; i < 6000 && !j.passed; i++) {
      now += 16;
      step(run, now);
      const hint = lessonHint(run);
      if (hint && seen[seen.length - 1] !== hint.step) seen.push(hint.step);
      obey(run);
    }
    expect(seen[0]).toBe('giveWay');
    expect(seen).toContain('go');
    expect(seen.indexOf('go')).toBeGreaterThan(seen.indexOf('giveWay'));
  });

  it('is not part of an ordinary run', () => {
    const run = createRun(makeRng(5), 1);
    expect(run.coach).toBe(false);
    expect(run.lesson).toBeNull();
    expect(run.junctions[0].lesson).toBeNull();
    expect(lessonHint(run)).toBeNull();
    expect(LESSON_COUNT).toBe(LESSONS.length);
  });
});

describe('a stop before a turn is not a needless stop', () => {
  it('counts the priority of the way you actually took', () => {
    // Straight on nobody has priority over you; turning left the oncoming
    // car does. Stopping and then turning left is correct driving.
    const scene = {
      layout: 'cross', arms: ['N', 'E', 'S', 'W'], signs: {}, mainRoad: null, tramTracks: [], control: null, pedestrians: [],
      vehicles: [{ id: 'you', kind: 'car', color: 'you', from: 'S', to: 'N' }, { id: 'green', kind: 'car', color: 'green', from: 'N', to: 'S' }],
    };
    let run = null;
    for (let seed = 1; seed < 100 && !run; seed++) {
      const r = createRun(makeRng(seed), 1);
      if (!r.junctions[0].ring) run = r;
    }
    const j = run.junctions[0];
    j.scene = { ...scene, id: 'test', level: 1 };
    j.starts = { you: null, green: null };
    j.pathCache = {};
    j.instruction = { kind: 'left', turn: 'left', to: 'W' };
    let now = 0;
    // Approach going straight, with nothing in the way, and stop at the line.
    while (run.stoppedAt === null && now < 40000) {
      now += 16;
      step(run, now);
      if (j.scheduled && j.sWait - run.s < 40) applyInput(run, 'brake');
    }
    expect(run.stoppedAt).not.toBeNull();
    expect(j.blockers).toEqual([]);
    expect(j.stopWasNeedless).toBe(true);
    // Now swipe left, as the instructor asked: the green car has priority.
    applyInput(run, 'left');
    expect(j.blockers).toEqual(['green']);
    const events = [];
    for (let i = 0; i < 2000 && !j.passed; i++) {
      now += 16;
      events.push(...step(run, now));
      if (run.stoppedAt !== null && run.now >= j.clearAt) applyInput(run, 'go');
    }
    const passed = events.find((e) => e.type === 'passed');
    expect(passed.hesitated).toBe(false);
    expect(events.some((e) => e.type === 'hesitated')).toBe(false);
    expect(passed.points).toBeGreaterThan(0);
    expect(passed.record.reasons.some((r) => r.who === 'you' && r.to === 'green')).toBe(true);
  });
});


describe('safety-first practice', () => {
  it('keeps later levels at a readable cruising speed', () => {
    expect(speedFor(1)).toBe(20);
    expect(speedFor(100)).toBeLessThanOrEqual(24);
  });

  it('awards the same points after a short or long observation stop', () => {
    const driveFirst = (waitMs) => {
      const run = createRun(makeRng(5), 1);
      const j = run.junctions[0];
      let resumeAt = null;
      const events = [];
      while (run.now < 90000 && !j.passed && !j.crashed) {
        events.push(...step(run, run.now + 16));
        if (j.scheduled && run.s < j.sWait && !j.stopped) applyInput(run, 'brake');
        if (run.stoppedAt !== null) {
          if (resumeAt === null) resumeAt = Math.max(run.now, j.clearAt) + waitMs;
          if (run.now >= resumeAt) applyInput(run, 'go');
        }
      }
      expect(j.passed).toBe(true);
      expect(events.some((e) => e.type === 'late' || e.type === 'hesitated')).toBe(false);
      return run.score;
    };
    const prompt = driveFirst(1000);
    expect(prompt).toBeGreaterThan(0);
    expect(driveFirst(20000)).toBe(prompt);
  });
});
