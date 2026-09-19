import { makeRng } from '../src/lib/priority/generator';
import { createRun, currentJunction, step, applyInput, vehiclePoses, lightState } from '../src/lib/priority/world';

// Level three combines STOP signs, opposing turns, mixed-length queues and
// traffic carried into the next junction. A stationary player must never
// leave those vehicles permanently blocking one another.
test.each(Array.from({ length: 60 }, (_, i) => i + 1))('traffic clears for a cautious driver on route %i', seed => {
  const run = createRun(makeRng(seed), 3);
  let lastIndex = 0, entered = 0;
  for (let frame = 0; frame < 4000; frame++) {
    step(run, run.now + 32);
    const j = currentJunction(run);
    if (j.index !== lastIndex) { lastIndex = j.index; entered = run.now; }
    if (j.scheduled) {
      if (!j.ring && run.s < j.sWait && j.instruction.turn !== 'straight' && run.intent !== j.instruction.turn) applyInput(run, j.instruction.turn);
      if (!j.stopped && run.s < j.sWait && j.sWait - run.s < 45) applyInput(run, 'brake');
      if (j.ring && !j.ring.armed && j.ring.order[j.ring.next] === j.instruction.to) applyInput(run, 'right');
      if (run.stoppedAt !== null && run.now > j.clearAt + 1200 && (!lightState(j, run.now) || lightState(j, run.now).S === 'green')) applyInput(run, 'go');
    }
    if (run.now - entered > 45000) {
      throw new Error(`Traffic stalled: ${JSON.stringify({ seed, time: run.now, scene: j.scene, junction: j.index, starts: j.starts, traffic: vehiclePoses(run).map(c => ({ id: c.vehicle.id, junction: c.junction.index, pose: c.pose })) })}`);
    }
  }
  expect(run.lives).toBe(3);
}, 15000);
