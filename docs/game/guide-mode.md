# Driving practice with Alex

`components/game/DrivingExperience.tsx` runs both routes. The first drive always
starts with the eleven guided junctions, including when `/crossing` is opened
directly. After the final lesson, the existing run continues into practice on
the same road, with the same car and all three lives. Completing the guide saves
`has_finished_guide`. Later visits offer direct practice or a guided start.
Leaving a drive opens its review; there is no lesson completion screen.
`/game-quiz` redirects old links to the driving hub.

## The route

The fixed scenes in `src/lib/priority/lessons.js` teach controls, right-hand
priority, the main road, a side road, STOP, traffic lights, directions, left
turns, a tram approaching from the right, a tram yielding from a side road, and
roundabouts. They use the same road builder and rules as practice. Guide speed
is 60% of practice speed, with short approaches and 140-unit spacing.

The first Stop exercise is learner-paced. The car rolls slowly and waits before
the junction until Stop is pressed, then waits for Go. Reading the message
cannot skip the exercise. Later braking prompts allow current-speed braking
distance plus 2.5 seconds to react, with a minimum of 28 units.

## Instructor and controls

Alex speaks in the first person from the single top panel, and reviews the drive
afterwards. `src/lib/priority/instructor.js` gives guide and practice the same
message cadence: a situation is explained once, directions stay available until
the turn, and there is no repeated filler on a straight road. Feedback never
hides an upcoming route instruction. Situational coaching names traffic only
after it appears in the road viewport.

Buttons and swipes share the same inputs. Turn selection never releases the
brake. The first lesson teaches Stop/Go gestures; turn and exit prompts introduce
the lateral gestures. Guide and practice pause on backgrounding, shifting both
simulation and instructor clocks when resumed.

## Faults and the drive log

Guide mistakes are explained without losing lives. Practice starts with three
lives. A missed instruction or roundabout exit, crossing a red signal, missing a
mandatory STOP, or a collision costs one life, with at most one life deducted
per junction. All faults at that junction remain in the review. Cautious stops
and waiting have no penalty.

`src/lib/driveSession.js` assigns one stable saved ID per junction, serializes
writes, and retries failed snapshots. A fault is saved immediately, including a
terminal mistake before the junction ends. Finishing the junction updates that
entry instead of adding a duplicate. Records capture the signal at the stop line
and distinguish approach, circling and committed movement. Diagrams illustrate
routes and priority, rather than claiming to replay exact vehicle positions.

The guide and following practice share one drive ID. Sessions sort newest first;
junctions remain in route order even when timestamps match. Reviews show clean
decisions and situations to revisit, not speed or arcade-score judgments. The
stored log keeps the newest 300 junctions per language.

Database migrations and drive-log reads/writes use asynchronous SQLite calls.
On web, `src/db/index.web.ts` also routes every ORM query through the async
worker. SDK 54's synchronous web transport can truncate replies over 255 bytes
and time out under load, breaking both the log and settings on reopening.
Native retains the existing ORM adapter. No dependency patch is required.

## Validation

- `drivingExperience.test.js`: handover, fault deductions, terminal records,
  signal snapshots, instructor timing, save retry/order, session grouping.
- `world.test.js`, `guidePacing.test.js`, `practiceSafety.test.js`: road rules,
  safe stops, guide pacing, vehicle separation and continuous routes.
- `.maestro/07_game.yaml`, `08_crossing.yaml`, `09_guide.yaml`: first-use hub,
  quiz removal, native controls, pause and gesture teaching.
- Browser end-to-end check: all eleven lessons, uninterrupted handover, saved
  review and modal, persisted guide completion, returning choices and old-link
  redirect.
