# Guide mode

The guide is the way into the Crossings minigame. It teaches the four swipes
and walks through every kind of junction the runner generates, one fixed
lesson at a time. It has to be finished once before Crossings can be played.

Screen: `app/crossing-guide.tsx`. Lessons: `src/lib/priority/lessons.js`.
Swipe animation: `components/game/SwipeHint.tsx`. The runner itself is
documented in `runner.md`.

## The lessons

Ten lessons, in this order. Each one is a single hand-built scene, so every
player is taught exactly the same situation.

| id | teaches | scene |
|---|---|---|
| `controls` | the car drives itself; swipe down to stop, up to move off | empty crossing |
| `rightHand` | the right-hand rule | unmarked crossing, car from the right |
| `mainRoad` | the yellow diamond means you keep going | you on the main road, car waiting on the side road |
| `sideRoad` | the give-way triangle | you on the side road, car on the main road |
| `stopSign` | a STOP sign needs a full halt | STOP on your arm, nothing coming |
| `lights` | red means wait, green means go | lights with the cross road on green first |
| `turn` | the turn swipe | T-junction with no road straight ahead |
| `leftTurn` | turning left yields to oncoming traffic | crossing, oncoming car, instructor says left |
| `tram` | a tram has priority | tram tracks across your road, tram from the right |
| `roundabout` | give way to the ring, then signal out of it | roundabout with a give-way sign and a car on the ring |

Each lesson carries:

- `scene` and `instruction` — fed to the engine as junction 0 of a one-lesson
  run (`createRun(rng, level, { lesson: index })`).
- `demo` — the swipes the brief animates, e.g. `['down', 'up']`.
- `pass` — what the lesson asks for beyond not crashing: `mustStop`,
  `noNeedlessStop`, `noRed`, `rightWay`. `lessonVerdict(lesson, junction)`
  turns the finished junction into `{ passed, reason }`, where `reason` is one
  of `crash`, `wrongWay`, `red`, `noStop`, `needlessStop`.

Strings live under `guide.lesson.<id>.title` and `guide.lesson.<id>.goal` in
`src/i18n/strings.js`, in all three languages.

## How a lesson runs

`phase` in the screen moves `brief → driving → verdict` and then either back
to `brief` for the next lesson or to `done`.

- **brief** — lesson number, title, what to do, and the `demo` swipes playing
  as looping animations.
- **driving** — the ordinary world loop (`step`, `vehiclePoses`, `WorldScene`)
  with one junction that matters. The prompt bar shows the instructor line
  when there is one, plus the live prompt from `lessonHint(run)`; the swipe
  that prompt asks for is animated over the bottom of the scene.
- **verdict** — pass or fail with the reason, then *Next lesson* or *Try
  again*. A lesson can be retried as often as needed.
- **done** — writes the `has_finished_guide` setting and offers Crossings.

Nothing in the guide costs points or a life: `junction.lesson` is set, so
`crash()` skips the life and `passJunction` never marks the junction spoiled.
Lessons drive at `COACH_SPEED` (60%).

## The live prompt

`lessonHint(run)` in `src/lib/priority/world.js` reads the run state and
returns the step being asked for, or null outside the guide:

| step | when | swipe shown |
|---|---|---|
| `turn` | the instructor asked for a turn you have not set yet, or a T-junction is waiting for a direction | left or right |
| `giveWay` | a vehicle with priority is coming and you have not stopped | down |
| `redLight` | your light is red and you have not stopped | down |
| `stopSign` | a STOP sign on your arm and you have not stopped | down |
| `wait` | stopped, and the way is not clear yet (or the light is still red) | none |
| `go` | stopped, and the way is clear | up |
| `ring` | on the ring, and the next exit is the one you were told to take | right |
| `rolling` | moving off again, nothing to decide | none |
| `priority` | nothing in your way | none |

The screen maps each step to a sentence (reusing the `crossing.coach.*`
strings) and to a `SwipeDirection` for the animation.

## The gate

`has_finished_guide` on the settings row (`src/db/schema/settings.ts`,
migrated in `src/db/migrate.ts`, read and written through
`getGuideFinished` / `setGuideFinished` in `src/db/queries/settings.ts` and
`src/lib/settings.js`).

The game hub (`app/game.tsx`) reads it on focus: until it is true the
Crossings card says the game unlocks after the guide and its button opens the
guide; afterwards the button plays the game and a secondary button replays the
guide. The Crossings intro card also links to the guide.

## Adding a lesson

1. Append an entry to `LESSONS` in `src/lib/priority/lessons.js` with the
   scene, the instruction, the `demo` swipes and the `pass` rules. Scenes
   follow `scene-format.md`.
2. Add `guide.lesson.<id>.title` and `.goal` in all three languages.
3. Extend the expectation table in the `the guide` block of
   `__tests__/world.test.js`: it asserts, for every lesson, which vehicles end
   up with priority over you and that the instruction survives into the
   junction. The same block plays every lesson obediently (all must pass) and
   then disobediently (each must fail with the expected reason).

The lesson order is the teaching order, so put a new lesson after everything
it depends on.

## Testing

- `npx jest __tests__/world.test.js -t "the guide"` — setup, obedient and
  disobedient play, the prompt sequence, and that an ordinary run has no
  lessons in it.
- `npx jest __tests__/swipeHint.test.js` — the animation component. It needs
  `jest.useFakeTimers()`: a real `Animated.loop` outlives the test otherwise.
- `.maestro/09_guide.yaml` — the happy path on a simulator, from a fresh
  install through the gate into the first lesson.
