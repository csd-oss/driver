import { explainRecord } from '../src/lib/crossingLog';
import { makeRng } from '../src/lib/priority/generator';
import { applyInput, createRun, currentJunction, junctionRecord, lightState, step } from '../src/lib/priority/world';

const drive = (run, ms, onTick) => {
  const events = [];
  for (let t = 0; t <= ms; t += 16) {
    const evs = step(run, t);
    events.push(...evs);
    if (onTick) onTick(run, t, evs);
    if (run.over) break;
  }
  return events;
};

// A careful driver: brakes when someone has priority, turns as told, goes when clear.
const armRing = (r) => {
  const j = currentJunction(r);
  if (j.ring && !j.ring.exitTo && !j.ring.armed && j.ring.order[j.ring.next] === j.instruction.to) applyInput(r, 'right');
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

describe('crossing drive log', () => {
  it('explains every junction of a careful run in all three languages', () => {
    const run = createRun(makeRng(11), 1);
    const events = drive(run, 60000, careful);
    const records = events.filter((e) => e.type === 'passed').map((e) => e.record);
    expect(records.length).toBeGreaterThanOrEqual(4);
    for (const record of records) {
      for (const lang of [1, 2, 3]) {
        const info = explainRecord(record, lang);
        expect(info.headline).toBeTruthy();
        expect(info.headline).not.toMatch(/\{|undefined|\[/);
        expect(info.lines.length).toBeGreaterThan(0);
        for (const line of info.lines) expect(line).not.toMatch(/\{|undefined|\[/);
        expect(['clean', 'spoiled']).toContain(info.outcome);
      }
    }
  });

  it('a crash record names the culprit and the rule', () => {
    const run = createRun(makeRng(5), 1);
    const events = drive(run, 200000, (r, now, evs) => {
      const j = currentJunction(r);
      const last = evs[evs.length - 1];
      if (last && last.type === 'needTurn' && last.junction === j.index) applyInput(r, last.instruction.turn === 'left' ? 'left' : 'right');
      armRing(r);
      if (r.stoppedAt !== null && !j.needTurn) applyInput(r, 'go');
    });
    const crash = events.find((e) => e.type === 'crash');
    expect(crash).toBeTruthy();
    const info = explainRecord(crash.record, 2);
    expect(info.outcome).toBe('crash');
    expect(info.headline).toMatch(/^Crash with /);
    expect(info.lines[0]).toBeTruthy();
    expect(crash.record.reasons.some((r) => r.who === 'you' && r.to === crash.culprit)).toBe(true);
  });

  it('a cautious stop is logged as clean and keeps its points', () => {
    let cautious = null;
    for (let seed = 1; seed < 40 && !cautious; seed++) {
      const run = createRun(makeRng(seed), 1);
      let stoppedOnce = false;
      const events = drive(run, 60000, (r, now, evs) => {
        const j = currentJunction(r);
        careful(r, now, evs);
        const sign = j.scene.signs?.S;
        const mustStop = sign === 'stop' || sign === 'roundabout-stop';
        if (!stoppedOnce && !mustStop && !j.ring && !j.blockers.length && j.scheduled && j.sWait - r.s < 60 && r.s < j.sLine && r.stoppedAt === null && !r.braking) {
          applyInput(r, 'brake');
          stoppedOnce = true;
        }
      });
      cautious = events.find((e) => e.type === 'passed' && e.record.stopped && !e.wrongWay && !e.ranRed && !e.ranStop) || null;
    }
    expect(cautious).toBeTruthy();
    expect(cautious.record.outcome).toBe('clean');
    expect(cautious.points).toBeGreaterThan(0);
    expect(cautious.record.hesitated).toBe(false);
    expect(explainRecord(cautious.record, 2).outcome).toBe('clean');
  });

  it('junctionRecord carries a drawable scene', () => {
    const run = createRun(makeRng(3), 1);
    const j = currentJunction(run);
    const rec = junctionRecord(run, j, 'clean');
    expect(rec.scene.arms.length).toBeGreaterThanOrEqual(3);
    expect(rec.scene.vehicles.find((v) => v.id === 'you')).toBeTruthy();
    expect(JSON.parse(JSON.stringify(rec))).toEqual(rec);
  });
});
