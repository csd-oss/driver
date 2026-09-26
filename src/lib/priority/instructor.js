import { t, tf } from '../../i18n/i18n';
import { currentJunction, drivingHint } from './world';
import { vehicleName } from './vehicleName';

export const instructionText = (instruction, lang) => instruction.kind === 'roundabout'
  ? t(`crossing.instr.roundabout.${instruction.turn}`, lang)
  : t(`crossing.instr.${instruction.kind}`, lang);

export const createInstructor = () => ({ junction: -1, said: new Set(), message: null, until: 0, feedback: null, feedbackUntil: 0, feedbackJunction: -1, wasStopped: false });
export const shiftInstructorTime = (state, duration) => { state.until += duration; state.feedbackUntil += duration; };
export const MESSAGE_MS = 5500;        // practice advice is brief
export const COACH_MESSAGE_MS = 11000;  // the guide leaves a learner time to read

// Practice gives no hints about the junction itself: naming the vehicle with
// priority, telling you to wait or go, and pointing out a STOP sign or a red
// light are the guide's job. In practice you read the junction yourself and
// hear about it afterwards (fault feedback still explains a missed STOP or red).
const GUIDE_ONLY_STEPS = new Set(['giveWay', 'wait', 'go', 'stopSign', 'redLight', 'priority']);

/** The same quiet, situational coaching in the guide and in practice; only
 * the guide hints at priority, signs and signals before you decide.
 * @param {any} state
 * @param {any} run
 * @param {{lang?: number, events?: any[], visibility?: any, traffic?: any[]}} options
 */
export function instructorFrame(state, run, { lang, events = [], visibility = {}, traffic } = {}) {
  const junction = currentJunction(run);
  if (state.junction !== junction.index) {
    state.junction = junction.index;
    state.said.clear();
    state.message = null;
  }
  const stopped = run.stoppedAt !== null;
  if (stopped && !state.wasStopped) state.said.delete('crossing.coach.goSwipe');
  state.wasStopped = stopped;
  const fault = [...events].reverse().find(e => ['crash', 'wrongWay', 'redLight', 'ranStop'].includes(e.type));
  if (fault) {
    const key = fault.type === 'wrongWay' && fault.record?.movement === 'circling' ? 'missedExit' : fault.type;
    state.feedback = t(`practice.coach.${key}`, lang);
    state.feedbackUntil = run.now + (run.coach ? 9000 : 6500);
    state.feedbackJunction = fault.junction ?? junction.index;
  } else if (events.some(e => e.type === 'guideComplete')) {
    state.feedback = t('practice.coach.handover', lang);
    state.feedbackUntil = run.now + 8000;
    state.feedbackJunction = junction.index;
  }
  // Feedback belongs to the junction it explains and the road after it. It
  // never lingers into a later junction, whatever happens to the clock.
  const feedback = run.now < state.feedbackUntil && junction.index <= state.feedbackJunction + 1 ? state.feedback : null;

  const i = junction.instruction;
  const hasDirection = junction.scheduled && i.kind !== 'none' && !(i.kind === 'main' && i.turn === 'straight')
    && (junction.ring ? !junction.passed : run.s < junction.sLine);
  if (hasDirection && (state.route?.kind !== i.kind || state.route?.turn !== i.turn || state.route?.lang !== lang)) {
    state.route = { kind: i.kind, turn: i.turn, lang, text: instructionText(i, lang) };
  }
  const instruction = hasDirection ? state.route.text : null;
  const hint = drivingHint(run, { ...visibility, traffic });
  let candidate = null;
  if (hint && (run.coach || !GUIDE_ONLY_STEPS.has(hint.step))) {
    const car = junction.scene.vehicles.find(v => v.id === hint.vehicle);
    const prompt = (key, swipe = null, persistent = false) => {
      // Most snapshots keep exactly the same advice. Translate and allocate
      // its content only when the situation changes, not on every road tick.
      const previous = state.prompt;
      if (previous?.key === key && previous.lang === lang && previous.car === car && previous.dir === hint.dir
        && previous.swipe === swipe && previous.persistent === persistent) return previous;
      const values = key === 'crossing.coach.turn'
        ? { dir: t(`crossing.coach.dir${hint.dir === 'left' ? 'Left' : 'Right'}`, lang) }
        : { vehicle: car ? vehicleName(car, lang) : null };
      return state.prompt = { key, text: tf(key, lang, values), swipe, persistent, car, dir: hint.dir, lang };
    };
    if (hint.step === 'controlsStop') candidate = prompt('practice.coach.controls', 'down', true);
    else if (hint.step === 'go') candidate = prompt('crossing.coach.goSwipe', 'up', junction.lesson === 'controls');
    else if (hint.step === 'wait') candidate = car ? prompt('crossing.coach.waitSwipe') : prompt('practice.coach.wait');
    else if (hint.step === 'redLight') candidate = prompt('practice.coach.red', run.stoppedAt === null ? 'down' : null);
    else if (hint.step === 'stopSign' && !run.braking) candidate = prompt('practice.coach.stop', 'down');
    else if (hint.step === 'giveWay' && !run.braking && car) candidate = prompt('crossing.coach.giveWay', 'down');
    else if (hint.step === 'ring') candidate = prompt('practice.coach.exit', 'right');
    else if (hint.step === 'turn') candidate = prompt('crossing.coach.turn', hint.dir);
    // Having priority is a lesson too: say so on the main road, or when nobody
    // had to be waited for, rather than driving through in silence.
    else if (hint.step === 'priority' && junction.scene.signs?.S === 'main') candidate = prompt('practice.coach.mainRoad');
    else if (hint.step === 'priority' && !junction.blockers.length) candidate = prompt('practice.coach.yourWay');
  }

  // No timed repetition. A new state can speak once; obsolete advice vanishes
  // immediately (in particular, never keep saying Go after the light changes).
  if (state.message?.key !== candidate?.key) state.message = null;
  if (!feedback && candidate && (candidate.persistent || !state.said.has(candidate.key))) {
    state.message = candidate;
    state.until = run.now + (run.coach ? COACH_MESSAGE_MS : MESSAGE_MS);
    state.said.add(candidate.key);
  }
  const message = state.message && (state.message.persistent || run.now < state.until) ? state.message : null;
  // The route itself stays available until the turn; a matching swipe is enough
  // to teach that control without repeating the same turn in a second sentence.
  const duplicateTurn = instruction && message?.swipe === i.turn && !junction.ring;
  return {
    instruction: instruction || feedback || message?.text || null,
    status: instruction ? feedback || (!duplicateTurn ? message?.text : null) : null,
    direction: hasDirection ? i.turn : null,
    swipe: feedback ? null : message?.swipe || null,
  };
}
