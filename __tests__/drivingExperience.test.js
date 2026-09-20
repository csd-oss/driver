import { makeRng } from '../src/lib/priority/generator';
import { LESSONS, LESSON_COUNT } from '../src/lib/priority/lessons';
import { createRun, currentJunction, applyInput, drivingHint, junctionRecord, lightState, step, vehiclePoses, youPose } from '../src/lib/priority/world';
import { createInstructor, instructorFrame, shiftInstructorTime } from '../src/lib/priority/instructor';
import { createDriveRecorder, groupDrives, mergeDriveRecord } from '../src/lib/driveSession';
import { explainRecord, isDriveRecord } from '../src/lib/crossingLog';
import { PRACTICE } from '../src/i18n/practice';
import * as i18n from '../src/i18n/i18n';

const indexOf = id => LESSONS.findIndex(lesson => lesson.id === id);
const sceneRun = (id, practice = false) => {
  const run = createRun(makeRng(1000), 1, { lesson: indexOf(id) });
  run.coach = !practice;
  return run;
};
const obey = run => {
  const hint = drivingHint(run);
  if (['controlsStop', 'giveWay', 'stopSign', 'redLight'].includes(hint?.step)) applyInput(run, 'brake');
  if (hint?.step === 'go') applyInput(run, 'go');
  if (hint?.step === 'turn') applyInput(run, hint.dir);
  if (hint?.step === 'ring') applyInput(run, 'right');
};
const driveUntil = (run, done, input = () => {}, limit = 20000) => {
  const events = [];
  for (let frame = 0; frame < limit && !done() && !run.over; frame++) {
    events.push(...step(run, run.now + 32));
    input(run);
  }
  return events;
};

test('a missed route costs one life and is recorded immediately and once', () => {
  const run = sceneRun('leftTurn', true), junction = currentJunction(run);
  const events = driveUntil(run, () => junction.passed);
  const wrong = events.filter(event => event.type === 'wrongWay');
  expect(wrong).toHaveLength(1);
  expect(wrong[0].record).toMatchObject({ outcome: 'spoiled', wrongWay: true, lifeLost: true, completed: false, mode: 'practice' });
  expect(run.lives).toBe(2);
  expect(events.find(event => event.type === 'passed').record.points).toBe(0);
  const records = events.filter(event => event.record).reduce((all, event) => mergeDriveRecord(all, event.record), []);
  expect(records).toHaveLength(1);
  expect(records[0].completed).toBe(true);
});

test('the last route fault ends the drive with a usable log even before the exit', () => {
  const run = sceneRun('leftTurn', true);
  run.lives = 1;
  const events = driveUntil(run, () => run.over);
  expect(run.over).toBe(true);
  expect(run.lives).toBe(0);
  const record = events.find(event => event.type === 'wrongWay').record;
  expect(isDriveRecord(record)).toBe(true);
  expect(record.completed).toBe(false);
  expect(explainRecord(record, 2).lines).toContain('The drive ended before this junction was completed.');
});

test('a wrong turn and a missed STOP share one life and one complete explanation', () => {
  const run = sceneRun('stopSign', true), junction = currentJunction(run);
  step(run, 32);
  applyInput(run, 'left');
  const events = driveUntil(run, () => junction.passed);
  const record = events.find(event => event.type === 'passed').record;
  expect(run.lives).toBe(2);
  expect(record.faults).toEqual(expect.arrayContaining(['wrongWay', 'ranStop']));
  const info = explainRecord(record, 2);
  expect(info.headline).toMatch(/STOP/);
  expect(info.lines).toContain('You took a different route from the one I gave you.');
});

test('passing the requested roundabout exit costs one life, without charging every lap', () => {
  const run = sceneRun('roundabout', true), junction = currentJunction(run);
  const events = driveUntil(run, () => junction.ring.laps >= 2, run => {
    const hint = drivingHint(run);
    if (['giveWay', 'stopSign', 'redLight'].includes(hint?.step)) applyInput(run, 'brake');
    if (hint?.step === 'go') applyInput(run, 'go');
  });
  expect(junction.ring.laps).toBe(2);
  expect(events.filter(event => event.type === 'wrongWay')).toHaveLength(1);
  expect(events.find(event => event.type === 'wrongWay').record.movement).toBe('circling');
  expect(run.lives).toBe(2);
});

test('all guide lessons flow into ordinary practice without replacing the car or road', () => {
  const run = createRun(makeRng(1000), 1, { lesson: 0, continuousGuide: true, continueAfterGuide: true });
  let handoverPose;
  const events = driveUntil(run, () => run.guideComplete, current => {
    if (current.guideComplete) handoverPose = youPose(current);
    obey(current);
  });
  expect(run.guideComplete).toBe(true);
  expect(run.coach).toBe(false);
  expect(run.lives).toBe(3);
  expect(events.filter(event => event.type === 'guideComplete')).toHaveLength(1);
  expect(run.junctions.filter(junction => junction.lesson !== null && junction.passed)).toHaveLength(LESSON_COUNT);
  expect(events.filter(event => event.record).every(event => event.record.mode === 'guide' && event.record.points === 0)).toBe(true);
  const distance = run.s;
  step(run, run.now + 32);
  const after = youPose(run);
  expect(run.s).toBeGreaterThanOrEqual(distance);
  expect(Math.hypot(after.x - handoverPose.x, after.y - handoverPose.y)).toBeLessThan(2);
  expect(currentJunction(run).lesson).toBeNull();
  expect(run.passed).toBe(0);
}, 30000);

test('guide mistakes teach without taking lives', () => {
  const run = sceneRun('leftTurn'), junction = currentJunction(run);
  const events = driveUntil(run, () => junction.passed);
  expect(run.lives).toBe(3);
  expect(events.find(event => event.type === 'wrongWay').record).toMatchObject({ mode: 'guide', lifeLost: false });
});

test('Alex helps a stopped learner resume inside a roundabout', () => {
  const run = sceneRun('roundabout'), junction = currentJunction(run);
  driveUntil(run, () => run.s > junction.sLine + 2, obey);
  applyInput(run, 'brake');
  driveUntil(run, () => run.stoppedAt !== null);
  expect(drivingHint(run).step).toBe('go');
  applyInput(run, 'go');
  const before = run.s;
  driveUntil(run, () => run.s > before + 3, obey);
  expect(run.s).toBeGreaterThan(before + 3);
});

test('a newly visible car does not trigger entry braking after we entered', () => {
  const run = sceneRun('rightHand'), junction = currentJunction(run);
  step(run, 32);
  run.s = junction.sWait + 1;
  expect(drivingHint(run, { junctionVisible: true, visibleVehicles: ['red'] }).step).not.toBe('giveWay');
});

test('the log captures the green entry phase after waiting for a red', () => {
  const run = sceneRun('lights'), junction = currentJunction(run);
  const events = driveUntil(run, () => junction.passed, obey);
  const record = events.find(event => event.type === 'passed').record;
  expect(record.entryLights.S).toBe('green');
  expect(record.scene.control.arms.S).toBe('green');
  expect(record.stoppedForRed).toBe(true);
  expect(explainRecord(record, 2).headline).toBe('You stopped at the red and went on green.');
  junction.scene.control.arms.S = 'red';
  junction.instruction.kind = 'left';
  expect(record.scene.control.arms.S).toBe('green');
  expect(record.instruction.kind).toBe('none');
});

test('a cautious stop is not described as yielding, urgency or hesitation', () => {
  const run = sceneRun('controls'), junction = currentJunction(run);
  driveUntil(run, () => junction.passed, obey);
  const record = junctionRecord(run, junction, 'clean');
  expect(explainRecord(record, 2).headline).toBe('You stopped to look, then continued safely.');
});

test('moving off on red records the actual entry and costs exactly one life', () => {
  const run = sceneRun('lights', true), junction = currentJunction(run);
  driveUntil(run, () => run.stoppedAt !== null, current => applyInput(current, 'brake'));
  expect(lightState(junction, run.now).S).toBe('red');
  applyInput(run, 'go');
  expect(junction.ranRed).toBe(false);
  const events = driveUntil(run, () => junction.ranRed);
  const fault = events.find(event => event.type === 'redLight');
  expect(fault.record).toMatchObject({ ranRed: true, lifeLost: true, entryLights: { S: 'red' }, faults: ['redLight'] });
  expect(run.lives).toBe(2);
});

test('the instructor does not announce priority in either guide or practice', () => {
  const run = sceneRun('mainRoad');
  step(run, 32);
  const guided = createInstructor(), practice = createInstructor();
  const options = { lang: 2, visibility: { junctionVisible: true, visibleVehicles: ['blue'] } };
  for (let tick = 0; tick < 300; tick++) {
    run.now += 32;
    const speech = instructorFrame(guided, run, options);
    expect(speech).toEqual(instructorFrame(practice, { ...run, coach: false }, options));
    expect(speech.instruction).toBeNull();
    expect(speech.status).toBeNull();
  }
  expect(instructorFrame(guided, run, options).instruction).toBeNull();
  expect(guided.said.size).toBe(0);
});

test('pause preserves an explanation, and unseen traffic is not announced', () => {
  const run = sceneRun('rightHand');
  step(run, 32);
  const state = createInstructor();
  expect(instructorFrame(state, run, { lang: 2, visibility: { junctionVisible: false, visibleVehicles: [] } }).instruction).toBeNull();
  state.until = 6000;
  state.feedbackUntil = 7000;
  shiftInstructorTime(state, 30000);
  expect(state.until).toBe(36000);
  expect(state.feedbackUntil).toBe(37000);
});

test('unchanged coaching does not keep formatting the same text on every snapshot', () => {
  const run = sceneRun('controls'), state = createInstructor();
  const format = jest.spyOn(i18n, 'tf');
  try {
    const first = instructorFrame(state, run, { lang: 2 });
    expect(first.swipe).toBe('down');
    format.mockClear();
    for (let frame = 0; frame < 90; frame++) {
      step(run, run.now + 1000 / 30);
      expect(instructorFrame(state, run, { lang: 2 })).toEqual(first);
    }
    expect(format).not.toHaveBeenCalled();
    applyInput(run, 'brake');
    driveUntil(run, () => run.stoppedAt !== null);
    expect(instructorFrame(state, run, { lang: 2 }).swipe).toBe('up');
    expect(format).toHaveBeenCalledTimes(1);
  } finally { format.mockRestore(); }
});

test('coaching reuses the drawn traffic without changing roundabout advice', () => {
  const run = sceneRun('roundabout'), junction = currentJunction(run);
  const reuse = createInstructor(), resample = createInstructor();
  driveUntil(run, () => junction.passed, current => {
    expect(instructorFrame(reuse, current, { lang: 2, traffic: vehiclePoses(current) }))
      .toEqual(instructorFrame(resample, current, { lang: 2 }));
    obey(current);
  });
  expect(junction.passed).toBe(true);
});

test('record writes preserve order, reuse IDs and retry a failed latest snapshot', async () => {
  const written = [], ids = jest.fn(() => 'one-id');
  let fail = true;
  const recorder = createDriveRecorder({ generateId: ids, write: async (id, record) => {
    if (record.completed && fail) { fail = false; throw Error('temporary storage error'); }
    written.push({ id, ...record });
  } });
  recorder.save({ index: 0, completed: false });
  recorder.save({ index: 0, completed: true });
  expect(await recorder.flush()).toBe(true);
  expect(ids).toHaveBeenCalledTimes(1);
  expect(written).toEqual([{ id: 'one-id', index: 0, completed: false }, { id: 'one-id', index: 0, completed: true }]);
});

test('log sessions sort by junction index, deduplicate, and keep guide plus practice together', () => {
  const entry = (id, index, time, mode = 'practice') => ({ id, runId: 'drive', createdAt: new Date(time), record: { index, mode, outcome: 'clean' } });
  const sessions = groupDrives([entry('later', 2, 4000), entry('old', 1, 3000), entry('first', 0, 3000, 'guide'), entry('replacement', 1, 4000)]);
  expect(sessions).toHaveLength(1);
  expect(sessions[0].entries.map(value => value.id)).toEqual(['first', 'replacement', 'later']);
  expect(sessions[0]).toMatchObject({ total: 3, clean: 3, faults: 0, practice: 2 });
});

test('all new instructor and practice copy is translated', () => {
  for (const values of Object.values(PRACTICE)) for (const lang of [1, 2, 3]) expect(values[lang]?.length).toBeGreaterThan(0);
  expect(isDriveRecord(null)).toBeFalsy();
  expect(isDriveRecord({ outcome: 'clean' })).toBeFalsy();
});
