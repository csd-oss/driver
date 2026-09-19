import { performance } from 'perf_hooks';
import { makeRng } from '../../src/lib/priority/generator';
import { createRun, step, currentJunction, applyInput, vehiclePoses } from '../../src/lib/priority/world';

test('profile a deterministic busy drive', () => {
 const samples=[];const schedules=[];
 for (const seed of [1,2,5,8]) {
  const run=createRun(makeRng(seed),5);
  for(let i=0;i<1800&&!run.over;i++) {
   const before=performance.now(); const scheduled=currentJunction(run).scheduled;
   step(run,run.now+32);vehiclePoses(run);
   const elapsed=performance.now()-before;samples.push(elapsed);if(!scheduled)schedules.push(elapsed);
   const j=currentJunction(run);
   if(j.scheduled&&run.s<j.sWait&&!j.stopped)applyInput(run,'brake');
   if(!j.ring&&j.instruction.turn!=='straight'&&run.s<j.sWait)applyInput(run,j.instruction.turn);
   if(j.ring&&j.ring.order[j.ring.next]===j.instruction.to&&!j.ring.armed)applyInput(run,'right');
   if(run.stoppedAt!==null&&run.now>j.clearAt+1200)applyInput(run,'go');
  }
 }
 samples.sort((a,b)=>a-b);
 console.log(JSON.stringify({frames:samples.length,p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],max:samples.at(-1),schedulingMax:Math.max(...schedules),totalMs:samples.reduce((a,b)=>a+b,0)}));
});
