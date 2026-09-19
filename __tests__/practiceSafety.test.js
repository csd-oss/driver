import { makeRng } from '../src/lib/priority/generator';
import { createRun, step, currentJunction, applyInput, vehiclePoses, lessonHint, lightState, youPose } from '../src/lib/priority/world';
import { bodiesOverlap } from '../src/lib/priority/traffic';
import { LESSONS, lessonScene, lessonVerdict } from '../src/lib/priority/lessons';
import { resolve } from '../src/lib/priority/engine';
import { vehicleName } from '../src/lib/priority/vehicleName';
import { vehiclePath } from '../src/lib/priority/layout';

function careful(run) {
  const j = currentJunction(run);
  if (!j.scheduled) return;
  if (!j.ring && run.s < j.sWait && j.instruction.turn !== 'straight' && run.intent !== j.instruction.turn) applyInput(run, j.instruction.turn);
  if (!j.stopped && run.s < j.sWait && j.sWait - run.s < 45) applyInput(run, 'brake');
  if (j.ring && !j.ring.armed && j.ring.order[j.ring.next] === j.instruction.to) applyInput(run, 'right');
  if (run.stoppedAt !== null && run.now > j.clearAt + 1200 && (!lightState(j, run.now) || lightState(j, run.now).S === 'green')) applyInput(run, 'go');
}

test('traffic bodies remain separate on a careful drive', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const run = createRun(makeRng(seed), 5);
    for (let frame = 0; frame < 2500 && !run.over; frame++) {
      const events = step(run, run.now + 32);
      const crash = events.find(e => e.type === 'crash');
      if (crash) throw new Error(`careful crash seed=${seed} t=${run.now} ${JSON.stringify(crash.record)}`);
      careful(run);
      const vehicles = vehiclePoses(run);
      for (let i = 0; i < vehicles.length; i++) for (let k = i + 1; k < vehicles.length; k++) {
        const a = vehicles[i], b = vehicles[k];
        if (bodiesOverlap(a.pose, a.vehicle, b.pose, b.vehicle, 0)) {
          throw new Error(`seed=${seed} t=${run.now} j=${a.junction.index} ${a.vehicle.id}/${b.vehicle.id} ${JSON.stringify({a:a.pose,b:b.pose,starts:a.junction.starts,roll:a.junction.rollIn})}`);
        }
      }
      const player = { kind: 'car' };
      for (const v of vehicles) {
        if (bodiesOverlap(v.pose, v.vehicle, youPose(run), player, 0)) throw new Error(`player overlap seed=${seed} t=${run.now} j=${v.junction.index} ${v.vehicle.id} ${JSON.stringify({p:youPose(run),other:v.pose,vehicle:v.vehicle,scene:v.junction.scene,starts:v.junction.starts,s:run.s,end:v.junction.sEnd,clear:v.junction.clearAt})}`);
      }
    }
    if (run.passed < 2 || run.lives !== 3) { const j=currentJunction(run); throw new Error(`stalled seed=${seed} ${JSON.stringify({passed:run.passed,lives:run.lives,s:run.s,wait:j.sWait,stopped:run.stoppedAt,braking:run.braking,clear:j.clearAt,starts:j.starts,scene:j.scene,player:youPose(run),traffic:vehiclePoses(run).map(v=>({id:v.vehicle.id,j:v.junction.index,p:v.pose}))})}`); }
    expect(run.lives).toBe(3);
  }
}, 60000);

test('every guide vehicle has a translated display name in all three languages', () => {
  for (const lesson of LESSONS) for (const vehicle of lesson.scene.vehicles) for (const lang of [1, 2, 3]) {
    expect(vehicleName(vehicle, lang)).not.toMatch(/crossing\.|tram1|missing/i);
  }
});

test('ignoring the instructor gives immediate feedback and no crossing points', () => {
  const index = LESSONS.findIndex(l => l.id === 'leftTurn');
  const run = createRun(makeRng(1), 1, { lesson: index });
  const junction = currentJunction(run);
  const events = [];
  let announcedBeforePassing = false;
  while (!junction.passed && run.now < 30000) {
    const next = step(run, run.now + 32);
    if (next.some(e => e.type === 'wrongWay')) announcedBeforePassing = !junction.passed;
    events.push(...next);
  }
  expect(announcedBeforePassing).toBe(true);
  expect(events.filter(e => e.type === 'wrongWay')).toHaveLength(1);
  expect(junction.points).toBe(0);
  expect(lessonVerdict(LESSONS[index], junction)).toEqual({ passed: false, reason: 'wrongWay' });
});

test('a tram on the side road yields to the player on the main road', () => {
  const index = LESSONS.findIndex(l => l.id === 'tramYield');
  const result = resolve(lessonScene(index));
  expect(result.yields.tram1).toContain('you');
  expect(result.yields.you).not.toContain('tram1');
});

test('roundabout traffic begins on an approach road, not a tangent in the grass', () => {
  const scene = lessonScene(LESSONS.findIndex(l => l.id === 'roundabout'));
  const car = scene.vehicles.find(v => v.from === 'ring');
  const path = vehiclePath(scene, car);
  expect(path.approach[0].y).toBeLessThan(0);
  expect(path.approach[0].x).toBe(44);
});

test('coach does not announce an unseen car or junction', () => {
  const run = createRun(makeRng(1), 1, { lesson: 1 });
  while (!currentJunction(run).scheduled) step(run, run.now + 16);
  expect(lessonHint(run, { junctionVisible: false, visibleVehicles: [] }).step).toBe('observe');
  expect(lessonHint(run, { junctionVisible: true, visibleVehicles: [] }).step).toBe('observe');
});

test('continuous guide connects every lesson without restarting the route', () => {
  const run = createRun(makeRng(1000), 1, { lesson: 0, continuousGuide: true });
  const seen = new Set();
  for (let i = 0; i < 30000; i++) {
    step(run, run.now + 32);
    const j = currentJunction(run);
    if (j.lessonIndex !== null) seen.add(j.lessonIndex);
    careful(run);
    if (run.junctions.find(j => j.lessonIndex === LESSONS.length - 1)?.passed) break;
  }
  expect(seen.size).toBe(LESSONS.length);
  for (const j of run.junctions.filter(j => j.lessonIndex !== null)) {
    expect(lessonVerdict(LESSONS[j.lessonIndex], j)).toEqual({ passed: true, reason: null });
  }
}, 60000);

test('stopping inside a roundabout holds position and resumes without a deadlock', () => {
  const index = LESSONS.findIndex(l => l.id === 'roundabout');
  const run = createRun(makeRng(1), 1, { lesson: index });
  const junction = currentJunction(run);
  let stopped = false, resumed = false, holdUntil = Infinity, heldAt;
  for (let frame = 0; frame < 3000 && !junction.passed; frame++) {
    step(run, run.now + 32);
    if (!stopped && run.s > junction.sLine + 10) {
      applyInput(run, 'brake');
      stopped = true;
    }
    if (stopped && !resumed) {
      if (run.stoppedAt !== null && holdUntil === Infinity) {
        heldAt = run.s;
        holdUntil = run.now + 8000;
      }
      if (heldAt !== undefined) expect(run.s).toBe(heldAt);
      if (run.now >= holdUntil) { applyInput(run, 'go'); resumed = true; }
    } else careful(run);
    for (const car of vehiclePoses(run)) expect(bodiesOverlap(car.pose, car.vehicle, youPose(run), { kind: 'car' }, 0)).toBe(false);
  }
  expect(stopped && resumed).toBe(true);
  expect(junction.passed).toBe(true);
  expect(run.lives).toBe(3);
});

test('traffic stays clear during extended stops, including the next roundabout', () => {
  let ringStops = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const run = createRun(makeRng(seed), 5);
    let heldJunction = -1, releaseAt = 0, passedBeforeHold = 0;
    let previous = [];
    for (let frame = 0; frame < 5000; frame++) {
      step(run, run.now + 32);
      const j = currentJunction(run);
      const current = vehiclePoses(run);
      const player = youPose(run);
      for (const old of previous) {
        if (!current.some(c => c.junction.index === old.junction.index && c.vehicle.id === old.vehicle.id) && Math.hypot(old.pose.x - player.x, old.pose.y - player.y) < 70) throw new Error(`visible disappearance seed=${seed} junction=${old.junction.index} car=${old.vehicle.id} ${JSON.stringify({player,pose:old.pose,starts:old.junction.starts,current:j.index,originEnd:old.junction.sEnd,s:run.s})}`);
      }
      previous = current;
      if (j.ring && j.index > 0 && heldJunction === -1 && run.s > j.sLine + 8) {
        heldJunction = j.index; passedBeforeHold = run.passed;
        releaseAt = run.now + 12000;
        ringStops++;
        applyInput(run, 'brake');
      }
      if (releaseAt && run.now < releaseAt) {
        for (const car of vehiclePoses(run)) {
          if (bodiesOverlap(car.pose, car.vehicle, youPose(run), {kind:'car'}, 0)) throw new Error(`rear contact seed=${seed} car=${car.vehicle.id} junction=${j.index}`);
        }
      } else {
        if (releaseAt) { applyInput(run, 'go'); releaseAt = 0; }
        careful(run);
      }
      if (heldJunction >= 0 && run.passed > passedBeforeHold + 1) break;
    }
    if (heldJunction >= 0 && run.passed <= passedBeforeHold + 1) throw new Error(`stalled after roundabout stop: seed=${seed}, junction=${heldJunction}, passed=${run.passed}`);
    expect(run.lives).toBe(3);
  }
  expect(ringStops).toBeGreaterThan(0);
}, 60000);
