import { ARMS } from './geometry';
import { RING_DEFAULT_START } from './layout';

/**
 * The guide: one fixed junction per lesson, in order, covering every kind of
 * junction the game generates. Nothing here is random, so every player is
 * taught the same thing, and a lesson has to be passed before the next one.
 *
 * `demo` lists the swipes the brief shows; `pass` is what the lesson asks of
 * you beyond not crashing. Titles and texts live in `src/i18n/strings.js`
 * under `guide.lesson.<id>.*`.
 */

const you = (to) => ({ id: 'you', kind: 'car', color: 'you', from: 'S', to });
const car = (id, from, to, kind = 'car') => ({ id, kind, color: id, from, to });

const cross = ({ vehicles, signs = {}, mainRoad = null, tramTracks = [], control = null }) => ({
  layout: 'cross',
  arms: [...ARMS],
  signs,
  mainRoad,
  tramTracks,
  control,
  vehicles,
  pedestrians: [],
});

export const LESSONS = [
  {
    id: 'controls',
    demo: ['down', 'up'],
    pass: {},
    scene: cross({ vehicles: [you('N')] }),
    instruction: { kind: 'none', turn: 'straight', to: 'N' },
  },
  {
    id: 'rightHand',
    demo: ['down', 'up'],
    pass: {},
    scene: cross({ vehicles: [you('N'), car('red', 'E', 'W')] }),
    instruction: { kind: 'none', turn: 'straight', to: 'N' },
  },
  {
    id: 'mainRoad',
    demo: [],
    pass: { noNeedlessStop: true },
    scene: cross({
      vehicles: [you('N'), car('blue', 'E', 'W')],
      signs: { S: 'main', N: 'main', E: 'yield', W: 'yield' },
      mainRoad: ['S', 'N'],
    }),
    instruction: { kind: 'none', turn: 'straight', to: 'N' },
  },
  {
    id: 'sideRoad',
    demo: ['down', 'up'],
    pass: {},
    scene: cross({
      vehicles: [you('N'), car('green', 'W', 'E')],
      signs: { S: 'yield', N: 'yield', E: 'main', W: 'main' },
      mainRoad: ['E', 'W'],
    }),
    instruction: { kind: 'none', turn: 'straight', to: 'N' },
  },
  {
    id: 'stopSign',
    demo: ['down', 'up'],
    pass: { mustStop: true },
    scene: cross({
      vehicles: [you('N')],
      signs: { S: 'stop', N: 'stop', E: 'main', W: 'main' },
      mainRoad: ['E', 'W'],
    }),
    instruction: { kind: 'none', turn: 'straight', to: 'N' },
  },
  {
    id: 'lights',
    demo: ['down', 'up'],
    pass: { noRed: true },
    scene: cross({
      vehicles: [you('N'), car('yellow', 'W', 'E')],
      control: { type: 'lights', arms: { S: 'green', N: 'green', E: 'red', W: 'red' }, crossFirst: true },
    }),
    instruction: { kind: 'none', turn: 'straight', to: 'N' },
  },
  {
    id: 'turn',
    demo: ['right'],
    pass: { rightWay: true },
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
    id: 'leftTurn',
    demo: ['left', 'down'],
    pass: { rightWay: true },
    scene: cross({ vehicles: [you('W'), car('green', 'N', 'S')] }),
    instruction: { kind: 'left', turn: 'left', to: 'W' },
  },
  {
    id: 'tram',
    demo: ['down', 'up'],
    pass: {},
    scene: cross({
      vehicles: [you('N'), car('tram1', 'E', 'W', 'tram')],
      tramTracks: [{ from: 'W', to: 'E' }],
    }),
    instruction: { kind: 'none', turn: 'straight', to: 'N' },
  },
  {
    id: 'roundabout',
    demo: ['down', 'right'],
    pass: { rightWay: true },
    scene: {
      layout: 'roundabout',
      arms: [...ARMS],
      signs: { S: 'roundabout-yield', N: 'roundabout-yield', E: 'roundabout-yield', W: 'roundabout-yield' },
      mainRoad: null,
      tramTracks: [],
      control: null,
      vehicles: [you('N'), { ...car('red', 'ring', 'E'), ringAt: RING_DEFAULT_START }],
      pedestrians: [],
    },
    instruction: { kind: 'roundabout', turn: 'straight', to: 'N' },
  },
];

export const LESSON_COUNT = LESSONS.length;

/** The lesson at `index`, or null past the end. */
export const lessonAt = (index) => LESSONS[index] || null;

/** A fresh copy of a lesson's scene, so a run can move its vehicles about. */
export const lessonScene = (index) => {
  const lesson = lessonAt(index);
  if (!lesson) return null;
  return {
    ...lesson.scene,
    id: `lesson-${lesson.id}`,
    level: 1,
    signs: { ...lesson.scene.signs },
    vehicles: lesson.scene.vehicles.map((v) => ({ ...v })),
    tramTracks: lesson.scene.tramTracks.map((t) => ({ ...t })),
    control: lesson.scene.control ? { ...lesson.scene.control, arms: { ...lesson.scene.control.arms } } : null,
  };
};

/**
 * Did the player pass? Crashing always fails; each lesson adds the one
 * thing it teaches. `reason` names the first failure, for the verdict card.
 */
export const lessonVerdict = (lesson, junction) => {
  const fail = (reason) => ({ passed: false, reason });
  if (!lesson) return { passed: true, reason: null };
  if (junction.crashed) return fail('crash');
  if (lesson.pass.rightWay && junction.wrongWay) return fail('wrongWay');
  if (lesson.pass.noRed && junction.ranRed) return fail('red');
  if (lesson.pass.mustStop && (junction.ranStop || !junction.stopped)) return fail('noStop');
  if (lesson.pass.noNeedlessStop && junction.hesitated) return fail('needlessStop');
  return { passed: true, reason: null };
};
