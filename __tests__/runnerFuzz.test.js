import { makeRng, generatePlayable } from '../src/lib/priority/generator';
import { createRun, step, applyInput, currentJunction } from '../src/lib/priority/world';
test('every generated scene has three or four arms and a destination for every vehicle', () => {
  for (let level = 1; level <= 12; level++) {
    const rng = makeRng(level * 7919);
    for (let i = 0; i < 3000; i++) {
      const s = generatePlayable(rng, level);
      const you = s.vehicles.find((v) => v.id === 'you');
      if (s.arms.length < 3 || (s.layout === 't') !== (s.arms.length === 3)) throw new Error(`bad arms ${JSON.stringify(s)}`);
      if (!you.to || !s.arms.includes(you.to)) throw new Error(`bad you.to ${JSON.stringify(s)}`);
      for (const v of s.vehicles) if (!v.to) throw new Error(`bad v.to ${JSON.stringify(s)}`);
    }
  }
});
test('the runner survives random swipes for a long time on many seeds', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const rng = makeRng(seed * 31);
    const run = createRun(makeRng(seed), 1);
    let now = 0;
    try {
      for (let i = 0; i < 6000 && !run.over; i++) {
        now += 16;
        step(run, now);
        if (rng() < 0.03) applyInput(run, ['brake', 'go', 'left', 'right'][Math.floor(rng() * 4)]);
      }
    } catch (e) {
      const j = currentJunction(run);
      throw new Error(`seed ${seed} at ${now}: ${e.message} junction ${JSON.stringify({ arms: j.scene.arms, layout: j.scene.layout, you: j.scene.vehicles.find((v) => v.id === 'you'), instr: j.instruction, intent: run.intent })}`);
    }
  }
});
