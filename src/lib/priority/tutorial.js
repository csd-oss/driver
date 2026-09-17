import { ARMS } from './geometry';

/**
 * The guided start. A first run drives three fixed junctions that teach the
 * three controls in turn: give way (swipe down, then up), turn where the
 * instructor says (swipe sideways), and keep going when the road is yours.
 * Nothing here is generated, so the lesson is the same for everyone, and
 * nothing at these junctions costs points or a life.
 */

const cross = (vehicles, signs = {}, mainRoad = null) => ({
  layout: 'cross',
  arms: [...ARMS],
  signs,
  mainRoad,
  tramTracks: [],
  control: null,
  vehicles,
  pedestrians: [],
});

const you = (to) => ({ id: 'you', kind: 'car', color: 'you', from: 'S', to });
const car = (id, colour, from, to) => ({ id, kind: 'car', color: colour, from, to });

export const TUTORIAL_STEPS = [
  {
    // A car from your right on an unmarked crossing: the right-hand rule.
    id: 'giveWay',
    scene: cross([you('N'), car('red', 'red', 'E', 'W')]),
    instruction: { kind: 'none', turn: 'straight', to: 'N' },
  },
  {
    // No road straight ahead, so the car waits for a direction.
    id: 'turn',
    scene: {
      layout: 't',
      arms: ['E', 'S', 'W'],
      signs: {},
      mainRoad: null,
      tramTracks: [],
      control: null,
      vehicles: [you('E')],
      pedestrians: [],
    },
    instruction: { kind: 'right', turn: 'right', to: 'E' },
  },
  {
    // You are on the main road: the other car gives way to you.
    id: 'priority',
    scene: cross([you('N'), car('blue', 'blue', 'E', 'W')], { S: 'main', N: 'main', E: 'yield', W: 'yield' }, ['S', 'N']),
    instruction: { kind: 'none', turn: 'straight', to: 'N' },
  },
];

export const TUTORIAL_LENGTH = TUTORIAL_STEPS.length;

/** The step for junction `index`, or null once the guided start is over. */
export const tutorialStep = (index) => TUTORIAL_STEPS[index] || null;

/** A fresh copy of a step's scene, so a run can move its vehicles about. */
export const tutorialScene = (index) => {
  const step = tutorialStep(index);
  if (!step) return null;
  return { ...step.scene, id: `tutorial-${step.id}`, level: 1, vehicles: step.scene.vehicles.map((v) => ({ ...v })), signs: { ...step.scene.signs } };
};
