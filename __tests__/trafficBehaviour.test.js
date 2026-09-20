import { makeRng } from '../src/lib/priority/generator';
import { createRun, currentJunction, step, applyInput, vehiclePoses, youPose, lightState } from '../src/lib/priority/world';
import { followingGap } from '../src/lib/priority/traffic';
import { boxHalf, WAIT } from '../src/lib/priority/layout';

const careful = run => {
  const j = currentJunction(run);
  if (!j.scheduled) return;
  if (!j.ring && run.s < j.sWait && j.instruction.turn !== 'straight' && run.intent !== j.instruction.turn) applyInput(run, j.instruction.turn);
  if (!j.stopped && run.s < j.sWait && j.sWait - run.s < 45) applyInput(run, 'brake');
  if (j.ring && !j.ring.armed && j.ring.order[j.ring.next] === j.instruction.to) applyInput(run, 'right');
  if (run.stoppedAt !== null && run.now > j.clearAt + 1200 && (!lightState(j, run.now) || lightState(j, run.now).S === 'green')) applyInput(run, 'go');
};

test('traffic from previous junctions stops at a later red light and continues on green', () => {
  let crossings = 0, held = 0;
  const heldCars = new Set(), resumedCars = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const run = createRun(makeRng(seed), 4);
    let previous = new Map();
    for (let frame = 0; frame < 2800; frame++) {
      step(run, run.now + 32); careful(run);
      const cars = vehiclePoses(run);
      for (const area of run.junctions.filter(j => j.scene.control?.type === 'lights')) {
        const phases = lightState(area, run.now) || area.scene.control.arms;
        for (const car of cars.filter(c => c.junction.index < area.index)) {
          const key = `${car.junction.index}-${car.vehicle.id}`;
          const signalKey = `${seed}-${area.index}-${key}`;
          const old = previous.get(key); if (!old) continue;
          const c = Math.cos(area.rot*Math.PI/180), s = Math.sin(area.rot*Math.PI/180);
          const local = p => ({x:(p.x-area.cx)*c+(p.y-area.cy)*s,y:-(p.x-area.cx)*s+(p.y-area.cy)*c});
          const a=local(old), b=local(car.pose);
          const arm = Math.abs(a.x)>Math.abs(a.y) ? (a.x>0?'E':'W') : (a.y>0?'S':'N');
          const dist = p => arm==='E'?p.x:arm==='W'?-p.x:arm==='S'?p.y:-p.y;
          const line = boxHalf(area.scene,arm)+WAIT-1;
          if (dist(a)>=line && dist(a)<line+3 && dist(b)<line && Math.hypot(a.x-b.x,a.y-b.y)<3) {
            if(phases[arm]!=='green') throw new Error(JSON.stringify({seed,t:run.now,area:area.index,origin:car.junction.index,id:car.vehicle.id,arm,phase:phases[arm],a,b,line,kind:car.vehicle.kind})); crossings++;
            if (heldCars.has(signalKey)) resumedCars.add(signalKey);
          }
          if (dist(a)>line && dist(a)<line+2 && Math.abs(dist(b)-dist(a))<0.005 && phases[arm]==='red') { held++; heldCars.add(signalKey); }
        }
      }
      previous=new Map(cars.map(c=>[`${c.junction.index}-${c.vehicle.id}`,c.pose]));
    }
  }
  expect(crossings).toBeGreaterThan(5);
  expect(held).toBeGreaterThan(5);
  expect(resumedCars.size).toBeGreaterThan(2);
},60000);

test('braking behind another car leaves a visible bumper gap', () => {
  let queued=0;
  for(let seed=1;seed<=25;seed++) {
    const run=createRun(makeRng(seed),4);
    for(let frame=0;frame<2300;frame++) {
      step(run,run.now+32); careful(run);
      if(run.v>0.1 || run.now<run.crashUntil)continue;
      for(const car of vehiclePoses(run)) {
        const gap=followingGap(youPose(run),{kind:'car'},car.pose,car.vehicle);
        if(gap<15) { expect(gap).toBeGreaterThanOrEqual(5.5);queued++; }
      }
    }
  }
  expect(queued).toBeGreaterThan(10);
},60000);

test('one yielding car can clear a distant junction while another keeps yielding as the player arrives', () => {
  let examples=0;
  for(let seed=1;seed<=120;seed++) {
    const run=createRun(makeRng(seed),1),j=currentJunction(run);
    if(j.ring||j.scene.control)continue;
    const yielding=j.scene.vehicles.filter(v=>v.id!=='you'&&(j.resolution.yields[v.id]||[]).includes('you'));
    if(yielding.length<2)continue;
    let early=false, waited=false;
    while(run.now<12000 && run.s<j.sLine) {
      step(run,run.now+32);
      for(const car of vehiclePoses(run).filter(c=>c.junction===j&&yielding.some(v=>v.id===c.vehicle.id))) {
        if(car.progress>0.7&&j.sWait-run.s>35)early=true;
        if(car.progress===0&&j.sWait-run.s<40&&j.starts[car.vehicle.id]===null)waited=true;
      }
    }
    if(early&&waited)examples++;
  }
  expect(examples).toBeGreaterThan(2);
},30000);

test('moving forward in a queue does not report a red light before reaching the line', () => {
  let run;
  for (let seed = 1; seed < 80; seed++) {
    const candidate = createRun(makeRng(seed), 4);
    const j = currentJunction(candidate);
    if (j.scene.control?.type === 'lights' && j.scene.control.crossFirst) { run = candidate; break; }
  }
  expect(run).toBeDefined();
  const j = currentJunction(run);
  while (!j.scheduled) step(run, run.now + 32);
  expect(lightState(j, run.now).S).toBe('red');
  run.s = j.sWait - 25;
  run.stoppedAt = run.s;
  run.braking = true;
  applyInput(run, 'go');
  expect(j.ranRed).toBe(false);
  expect(run.events.some(e => e.type === 'redLight')).toBe(false);
});

test('an early crossing delayed by traffic yields again when the player is now close', () => {
  let run, j, id;
  for (let seed = 1; seed < 120 && !id; seed++) {
    const candidate = createRun(makeRng(seed), 1);
    const area = currentJunction(candidate);
    if (area.ring || area.scene.control || area.blockers.length) continue;
    while (!area.scheduled) step(candidate, candidate.now + 32);
    if (area.earlyTraffic?.size) { run = candidate; j = area; id = [...area.earlyTraffic][0]; }
  }
  expect(id).toBeDefined();
  j.starts[id] += 8000; // A queue ahead consumes the originally safe slot.
  let checked = false;
  for (let frame = 0; frame < 1200 && !j.passed; frame++) {
    if (j.instruction.turn !== 'straight' && run.intent !== j.instruction.turn && run.s < j.sWait) applyInput(run, j.instruction.turn);
    step(run, run.now + 32);
    if (j.sWait - run.s < 35 && run.s < j.sWait) {
      const car = vehiclePoses(run).find(c => c.junction === j && c.vehicle.id === id);
      expect(car.progress).toBe(0);
      checked = true;
    }
  }
  expect(checked).toBe(true);
  expect(j.passed).toBe(true);
  expect(run.lives).toBe(3);
  for (let frame = 0; frame < 500; frame++) step(run, run.now + 32);
  const car = vehiclePoses(run).find(c => c.junction === j && c.vehicle.id === id);
  expect(!car || car.progress === 1).toBe(true);
});
