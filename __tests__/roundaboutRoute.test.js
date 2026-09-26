import { act, create } from 'react-test-renderer';
import { makeRng, generatePlayable, PLAYER_RING_EXITS } from '../src/lib/priority/generator';
import { applyInput, createRun, currentJunction, step } from '../src/lib/priority/world';
import { createInstructor, instructorFrame } from '../src/lib/priority/instructor';
import { explainRecord } from '../src/lib/crossingLog';
import { WorldRoads } from '../components/game/WorldRoads';
import { JunctionStatic } from '../components/game/JunctionStatic';
import { t } from '../src/i18n/i18n';

jest.mock('../components/game/JunctionStatic', () => ({ JunctionStatic: jest.fn(() => null) }));
jest.mock('../components/game/StreetEnvironment', () => ({ StreetEnvironment: () => null }));

const firstRing = (from = 1, level = 1) => {
  for (let seed = from; seed < from + 200; seed++) {
    const run = createRun(makeRng(seed), level);
    if (run.junctions[0].ring) return { run, seed };
  }
  throw new Error('no roundabout seed');
};

const drive = (run, ms, control = () => {}) => {
  const events = [];
  const until = run.now + ms;
  while (run.now < until && !run.over) {
    events.push(...step(run, run.now + 32));
    control(run, events);
  }
  return events;
};

describe('roundabout route instructions', () => {
  it('never asks for the first exit in generated scenes', () => {
    for (let level = 1; level <= 12; level++) {
      const rng = makeRng(level * 104729);
      let rings = 0;
      for (let i = 0; i < 1500; i++) {
        const scene = generatePlayable(rng, level);
        if (scene.layout !== 'roundabout') continue;
        rings++;
        const you = scene.vehicles.find((v) => v.id === 'you');
        expect(PLAYER_RING_EXITS).toContain(you.to);
        expect(you.to).not.toBe('E');
      }
      expect(rings).toBeGreaterThan(100);
    }
  });

  it('phrases every roundabout instruction as the second or third exit, in all languages', () => {
    let rings = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const run = createRun(makeRng(seed), 1 + (seed % 9));
      drive(run, 30000);
      for (const junction of run.junctions) {
        if (!junction.ring) continue;
        rings++;
        expect(junction.instruction.kind).toBe('roundabout');
        expect(['straight', 'left']).toContain(junction.instruction.turn);
        for (const lang of [1, 2, 3]) expect(t(`crossing.instr.roundabout.${junction.instruction.turn}`, lang)).not.toBe(t('crossing.instr.roundabout.right', lang));
      }
    }
    expect(rings).toBeGreaterThan(20);
  });
});

describe('leaving a roundabout', () => {
  it('never offers the arm you entered on, so the next junction is laid out ahead, not on the last one', () => {
    const { run } = firstRing();
    const j = run.junctions[0];
    expect(j.ring.order).toEqual(['E', 'N', 'W']);
    // Circle a whole lap, then signal right as soon as the last exit (W) is behind us.
    const events = drive(run, 60000, (r) => {
      if (j.ring.laps >= 1 && !j.ring.armed && !j.ring.exitTo) applyInput(r, 'right');
      if (r.stoppedAt !== null) applyInput(r, 'go');
    });
    const exit = events.find((e) => e.type === 'ringExit');
    expect(exit).toBeTruthy();
    expect(exit.to).toBe('E');
    expect(j.ring.exitTo).toBe('E');
    const next = run.junctions.find((x) => x.index === 1);
    expect(next.rot).toBe(90);
    expect(Math.hypot(next.cx - j.cx, next.cy - j.cy)).toBeGreaterThanOrEqual(180);
    for (let a = 0; a < run.junctions.length; a++) for (let b = a + 1; b < run.junctions.length; b++) {
      const A = run.junctions[a], B = run.junctions[b];
      expect(Math.hypot(A.cx - B.cx, A.cy - B.cy)).toBeGreaterThan(150);
    }
  });

  it('a brake pressed after the wait line stops the car where it is, never behind', () => {
    const { run } = firstRing();
    const j = run.junctions[0];
    drive(run, 60000, (r) => { if (r.s > j.sWait + 4) r.now = 1e9; });
    run.now = run.junctions[0].t0 + 20000;
    // Reset the clock to something sane and keep the current position.
    const start = run.s;
    expect(start).toBeGreaterThan(j.sWait + 4);
    expect(start).toBeLessThan(j.sLine);
    applyInput(run, 'brake');
    let previous = run.s;
    for (let i = 0; i < 60; i++) {
      step(run, run.now + 32);
      expect(run.s).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = run.s;
    }
    expect(run.stoppedAt).not.toBeNull();
    expect(run.stoppedAt).toBeGreaterThanOrEqual(start);
  });
});

describe('fault feedback', () => {
  it('belongs to its junction and the road after it, not to later junctions', () => {
    const run = createRun(makeRng(3), 2);
    drive(run, 60000, (r) => {
      const j = currentJunction(r);
      if (!j.ring && r.s < j.sWait && j.instruction.turn !== 'straight' && r.intent !== j.instruction.turn) applyInput(r, j.instruction.turn);
      if (j.ring && !j.ring.armed && j.ring.order[j.ring.next] === j.instruction.to) applyInput(r, 'right');
      if (r.stoppedAt !== null && r.now > j.clearAt + 500) applyInput(r, 'go');
    });
    const junction = currentJunction(run);
    expect(junction.index).toBeGreaterThanOrEqual(2);
    const stale = createInstructor();
    const missed = { type: 'wrongWay', junction: junction.index - 2, record: { movement: 'circling' } };
    const spoken = instructorFrame(stale, run, { lang: 2, events: [missed], visibility: {}, traffic: [] });
    expect(`${spoken.instruction} ${spoken.status}`).not.toContain(t('practice.coach.missedExit', 2));
    const recent = createInstructor();
    const last = { ...missed, junction: junction.index - 1 };
    const said = instructorFrame(recent, run, { lang: 2, events: [last], visibility: {}, traffic: [] });
    expect(`${said.instruction} ${said.status}`).toContain(t('practice.coach.missedExit', 2));
  });
});

describe('drive log wording', () => {
  it('names the STOP sign at a roundabout with a stop regime', () => {
    const base = {
      index: 0, outcome: 'spoiled', ranStop: true, movement: 'committed', executedTo: 'N', instruction: { kind: 'roundabout', turn: 'straight', to: 'N' },
      reasons: [{ who: 'you', to: 'red', rule: 'roundabout' }], blockers: ['red'],
      scene: { layout: 'roundabout', arms: ['N', 'E', 'S', 'W'], signs: { N: 'roundabout-stop', E: 'roundabout-stop', S: 'roundabout-stop', W: 'roundabout-stop' }, mainRoad: null, tramTracks: [],
        control: null, pedestrians: [], vehicles: [{ id: 'you', kind: 'car', color: 'you', from: 'S', to: 'N' }, { id: 'red', kind: 'car', color: 'red', from: 'ring', to: 'N' }] },
    };
    const stop = explainRecord(base, 2);
    expect(stop.lines.join(' ')).toContain('STOP sign');
    expect(stop.lines.join(' ')).not.toContain('give-way');
    const yieldScene = { ...base, scene: { ...base.scene, signs: { N: 'roundabout-yield', E: 'roundabout-yield', S: 'roundabout-yield', W: 'roundabout-yield' } } };
    expect(explainRecord(yieldScene, 2).lines.join(' ')).toContain('give-way');
  });
});

describe('road drawing order', () => {
  it('paints earlier junctions over later ones, so a side road ahead never crosses the road behind', () => {
    JunctionStatic.mockClear();
    const scene = (id) => ({ id, layout: 'cross', arms: ['N', 'E', 'S', 'W'], signs: {}, tramTracks: [], control: null, vehicles: [{ id: 'you', from: 'S', to: 'N' }], pedestrians: [] });
    const junctions = [0, 1, 2].map((index) => ({ index, cx: 50, cy: 50 - 180 * index, rot: 0, scene: scene(`j${index}`), gapBefore: 80, gapAfter: 80 }));
    let tree;
    act(() => { tree = create(<WorldRoads junctions={junctions} renderLights={false} />); });
    expect(JunctionStatic.mock.calls.map((call) => call[0].scene.id)).toEqual(['j2', 'j1', 'j0']);
    act(() => tree.unmount());
  });
});
