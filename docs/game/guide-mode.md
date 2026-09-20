# Continuous driving guide

`app/crossing-guide.tsx` runs one connected route using
`createRun(rng, 1, { lesson: 0, continuousGuide: true })`. The introduction
appears once. Feedback appears during driving; there are no Next/Retry screens
between junctions. A review at the end lists mistakes and offers practice or a
new guided drive. Practice is also available directly from the game hub.

## The route

The eleven fixed scenes in `src/lib/priority/lessons.js` teach controls,
right-hand priority, the main road, a side road, STOP, traffic lights,
instructor directions, left turns, a tram approaching from the right, a tram
yielding from a side road, and roundabouts. Scenes are joined by the same road
builder as practice. The guide uses 60% of the regular cruise speed.

Build 34 starts the first lesson 16 units before its junction frame instead of
160, and spaces guide junctions 140 units apart instead of the practice minimum
of 180. Turn instructions still appear early; braking prompts wait until the
stopping zone (current-speed braking distance plus 2.5 seconds to react, minimum
28 units). This avoids asking learners to creep down a long empty road. Following
the first Stop prompt now takes about 6.7 seconds to reach the line, versus 26.7
seconds previously in the same deterministic simulation. Normal practice keeps
its existing road distances and speed-dependent spacing.

Build 35 makes the controls exercise learner-paced. It rolls at no more than
4 units/second and waits before the first junction until Stop is pressed. That
input brakes to a halt immediately rather than creeping to the line, then the
instructor waits for Go. Taking 30 seconds to read cannot skip the exercise.
The compact road and the later lessons keep their existing pacing.

Trams do not have universal priority. The two tram lessons demonstrate how
signs and the applicable priority rule affect the decision. Rules are documented
in `priority-rules.md` and resolved by the shared priority engine.

## Controls and coaching

`DriveStage` provides a full-width road viewport and one instructor panel at
the top for directions, explanations, feedback and animated gesture hints.
The bottom console contains progress and controls only. `DriveControls` groups
Left/Right and Stop/Go, with their corresponding swipe directions printed on
each button. The first lesson teaches both methods. Selecting a turn does not release the brake;
Go is a separate action. Waiting and cautious stops cost no points.

`lessonHint(run, visibility)` gates situational prompts using the same camera
transform as `WorldScene`. The instructor explains a car only after it is in
the visible road area, excluding the instruction overlay. Controls are explained
from the start. Each visible lesson explains its specific rule; subsequent
prompts tell the learner when to wait, move off, or select an exit.

Wrong turns, red lights, missed STOP signs, and priority mistakes produce
feedback during the drive. `lessonVerdict` marks them for the final review.
Guide mistakes do not consume lives. Finishing saves `has_finished_guide` for
the hub's Start/Replay label; it is not an access gate.

Both guide and practice pause on leaving the foreground. Resuming shifts all
simulation clocks so traffic does not jump forward.

## Validation

- `__tests__/world.test.js`: individual lessons, controls, lights, scoring.
- `__tests__/guidePacing.test.js`: short approaches, prompt timing, complete
  stops and safe resumption without shortening normal practice roads.
- `__tests__/practiceSafety.test.js`: complete continuous route, translated
  vehicle names, visibility-gated coaching, tram yielding, physical separation
  and forward progress across deterministic drives.
- `.maestro/09_guide.yaml`: native navigation, bottom controls, pause/resume,
  and continued driving without a lesson transition screen.

To add a lesson, extend `LESSONS`, add its title and explanation in all three
languages, and extend the lesson expectations in `world.test.js`.
