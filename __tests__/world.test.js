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
    expect(hesitations.length + passedEvents.filter((e) => e.points > 0).length).toBe(passedEvents.length);
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
