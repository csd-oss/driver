# Driving practice

Practice is a continuous road made from generated junctions. The instructor
specifies turns; otherwise the player continues straight. Buttons select
Left/Right, Stop, and Go; equivalent swipes remain available. Choosing a turn
never moves a stopped car. Cautious stops and waiting have no time penalty.

The game hub offers both practice and an optional continuous guided drive.
See `guide-mode.md` for the fixed lessons and `priority-rules.md` for the rules
applied by the shared resolver.

## Code map

| File | Responsibility |
|---|---|
| `src/lib/priority/world.js` | Route, player motion, timing, input, scoring, events |
| `generator.js` | Deterministic playable scenes |
| `engine.js`, `geometry.js` | Priority and movement conflicts |
| `layout.js` | Road and vehicle path geometry |
| `timeline.js` | Vehicle poses over time |
| `traffic.js` | Trajectory reservations and rotated-body separation |
| `queue.js` | Physical ordering of vehicles sharing an approach |
| `view.js` | Shared camera transform and coaching visibility |
| `app/crossing.tsx` | Practice lifecycle, feedback, records |
| `components/game/DriveStage.tsx` | Native full-height viewport and bottom console |
| `DriveControls.tsx` | Explicit direction and pedal buttons |
| `WorldScene.tsx`, `StreetEnvironment.tsx`, `JunctionStatic.tsx` | SVG road, scenery, camera |
| `src/lib/crossingLog.js` | Explanation of recorded decisions |

Paths without a prefix in this table are relative to `src/lib/priority` unless
they name a rendering component. The simulation has no React or I/O; the screen
calls `step(run, now)` and consumes its events.

## Route and movement

Each junction uses a local 100×100 frame, centre `(50, 50)`. The player arrives
on S. `toWorld` rotates/translates each frame onto the connected road.
`placeAfter` aligns the next junction with the preceding exit; `rebuildRoute`
measures the connected player polyline. `run.s` is distance along that route.

Markers are `sWait` (stopping position), `sLine` (junction entry), `sExitBox`
(scoring point), and `sEnd` (exit arm end). Ordinary waiting positions use
`WAIT = 8`; roundabouts use `RING_WAIT = 14` to leave room for circulating cars.

The route keeps two junctions ahead. Turning rebuilds those future placements.
At a roundabout the player's path grows one exit at a time. Right arms the next
exit; passing the instructed exit counts as a wrong route. The complete path
for an earlier NPC is independent of this incremental player path, so that NPC
does not get stranded at the player's next decision point.

The instructor never asks for the first exit: the generator routes you to the
second (straight on) or third (left), `PLAYER_RING_EXITS`. The arm you entered
on is not an exit either (`createRing` drops S): a U-turn would lay the next
junction on top of the one you just left, so arming before it keeps you
circling to the first exit of the next lap. After a crash inside a ring the car
restarts at the entry and drives the direct path to the instructed exit; laps
already driven are not replayed. A brake pressed after the wait line stops the
car where it comes to rest, never pulled back to the line.

Cruise speed starts at 20 scene units/second and increases by 0.4 per level,
capped at 24. The guide uses 60%. Acceleration and braking are eased. Stop brakes
towards the line; Go explicitly releases the brake. Physical spacing can stop a
car short of the line if the space is occupied. A T-junction without a selected
turn waits for the driver to choose a direction and move off.

The player slows for a vehicle ahead in the same lane and keeps six scene units
between bumpers. Stop holds that queue position until Go; moving up a queue
behind a red signal is not a red-light offence before reaching the stop line.

## Other traffic

Scheduling starts seven seconds before expected arrival. Priority traffic has
a 5.5-second visible approach. Vehicles sharing an arm preserve their queue
order during that approach. Ring traffic enters from an actual road and follows
the entry curve onto the circle; it is never extrapolated along a tangent into
the grass. Generated roundabouts use at most three other vehicles, with distinct
entry roads for queued and circulating traffic.

`spaceTraffic` checks sampled trajectories before releasing cars at ordinary
junctions. At roundabouts, each approach yields to nearby circulating traffic
and cars already committed to merging. A car that has accepted a gap finishes
its merge; other entries can move when their own gap is clear. Vehicles use
their first intended exit, without an extra lap or a generated U-turn. Traffic
carried over from earlier junctions also slows to 18 units/second on the ring.

Runtime checks
use rotated vehicle rectangles, including tram length, to maintain physical gaps
between NPCs and the player. Delaying a blocking vehicle extends the clearance
time; delayed cross-phase traffic also extends its traffic-light phase.

At ordinary junctions, followers are released once the player's rear has left
the box (`FOLLOWER_CLEAR` past `sExitBox`), each following group
`FOLLOWER_GAP_MS` after the previous.

In generated junctions without lights the traffic that gives way to the
player is scheduled by `scheduleYielders` against the earliest moment the
player could reach the line at cruising speed. Each vehicle has a style drawn
once from the scene (`stylesFor`, not from the run's generator, so a seed's
road is unchanged): `PARKED_SHARE` of them stand at their line from the start,
the rest are not there yet and drive in once the junction is scheduled
(`willRollIn`). Whatever its style, a car that can be out of every path the
player could swipe into (`clearMsAnyTurn`) `EARLY_CLEAR_MS` before that moment
goes: a standing car moves off at once, an arriving one rolls in and through
(`THROUGH_SHARE` of them prefer this, reaching the line no sooner than
`THROUGH_LEAD_MS` after scheduling so that they appear off screen). There is
no "last one keeps waiting" rule any more. The other arriving cars roll up and
stop in front of the player: `junction.arrivals[id]` is the moment a car
reaches its line, `STOP_LEAD_MIN_MS`..`STOP_LEAD_MAX_MS` before the player
could, and `poseAt` drives it in over `ROLL_UP_MS` (`ROLL_UP_CRUISE` units at
`ROLL_UP_SPEED`, then a straight-line brake over `ROLL_UP_BRAKE` units) and
holds it there until its start, which is never before its arrival. A standing
car without the time to go simply keeps waiting; a car behind another in its
lane goes after it (`queueAhead`), arrives `QUEUE_ARRIVAL_GAP_MS` later, and
`spaceTraffic` shifts arrivals as it shifts starts. A car released early
rechecks its gap before entering and brakes to its line if the gap has gone,
unless a swipe has since given it priority over the player: then it is waited
for. Traffic unrelated to the player that has to wait its turn for a rolling
priority vehicle also rolls up and stops rather than standing at its line
from the moment of scheduling. A car whose path never meets yours rolls in
and through; one whose path merely passes near yours goes from its line when
it is clear 1.2 s before your arrival, otherwise it follows you.
Among themselves, cars use gaps too (`slotAmong`): a car may cross ahead of a
priority vehicle that is still rolling in when it is out of that vehicle's
path with a margin before it arrives, and a rule-only dependency whose paths
never meet imposes no timing. Roundabout entrants start at once and judge
their own gap at the entrance (`RING_LOOK_BACK_DEG`, about 3.5 s of ring
travel); they never wait for a scheduled turn while the ring is empty.

`yielders.test.js` audits what the player sees of that traffic over many
drives (`support/trafficAudit.js`): build 46 parked 64 to 76 percent of the
yielders in view on their line for the whole approach and showed 0 to 2
percent driving up and stopping; now 53 to 83 percent are seen rolling up and
stopping, 3 to 7 percent stand all along, and the time yielders spend waiting
with room to go fell from 9.0 / 2.5 / 1.0 s per drive (levels 1 / 3 / 8) to
0.25 / 0.33 / 0.22 s. The guide's lessons are excluded (`plainJunction`): their
traffic waits on its line as the lesson describes.

The crossing is held against an arriving car only while the occupant's path
can meet its body (`pathsMeet`, `BODY_RADIUS`); two cars whose movements never
come near each other cross together. Two bodies that touch inside a crossing
are held apart for `MUTUAL_FREEZE_MS`; then the one the other gives way to
(or the one further along) drives on so the junction always clears, and a
later pass of the same frame does not freeze it again for that contact. `npcStalls.test.js` audits on-screen traffic that
stands still with no rule or body requiring it, and fails above a few short
stalls per drive.
Departing vehicles remain visible beyond the original
100×100 frame. Vehicles joining the connected road follow its next curve rather
than continuing straight through the next roundabout. Nearby old junctions stay
in the simulation until they fall behind the visible road range.

All traffic reads the lights at the junction it is actually approaching,
including vehicles carried over from earlier junctions. Red-light queues do not
reserve the crossing against green traffic. The phase change depends on the
cross traffic clearing, independently of cars waiting for that next green.

Every crash requires vehicle-body contact. Entering a junction while a vehicle
with priority is still due is failing to give way (`noGiveWay`): it costs the
same single life, the log says "You did not give way to …" with the rule, and
the vehicles you cut up brake and hold where they are (`heldUntil`, applied with
the other traffic delays) until you are through. It used to be recorded as a
crash with a car that had not even left its line. After a crash at an ordinary
junction the car stays where the contact happened; only the ring moves it back
to the entry, because its exit path is rebuilt from there.

Two deadlock breakers keep a junction from freezing: two vehicles touching for
`MUTUAL_FREEZE_MS` are let apart, and a vehicle that blocks you while it is held
only because it touches you drives on after `PLAYER_DEADLOCK_MS`. You standing
still on purpose releases nobody. A car that sets off after you counts as
following you only if it comes out after you have left the junction; one that
comes out ahead takes its own departure route, so it is never held "behind" you
from in front. `__tests__/fuzzRegressions.test.js` keeps the fuzzed cases.

Roundabout crashes likewise need contact; the old clearance timestamp does not
penalise a safe gap. Guide advice checks the actual entrance traffic,
including cars that entered from other approaches. The player waits
before the junction during recovery, allowing the conflicting traffic to clear.
Guide interventions explain the error without consuming a life.

## Instructor, scoring, and review

Instructor directions and relevant feedback share the top panel, which shrinks
when quiet. Routine narration and repeated praise are omitted. Fault feedback
belongs to the junction it explains and the road after it; it never lingers
into a later junction. The drive log names the sign you faced at a roundabout
(`rule.roundabout` for give way, `rule.roundaboutStop` for STOP).
A wrong non-roundabout turn is reported as soon as the player enters the
junction, not only after leaving. A wrong route, red light, or missed STOP earns
zero points and resets the streak. Safe crossings receive the same points
regardless of how long the player observed or waited. There is no reaction bonus
or hesitation penalty.

Crossing records preserve the scene, instruction, actual movement, rules, and
result. `vehicleName.js` resolves display names by vehicle kind and known colour;
internal IDs such as `tram1` are never used as translation keys. Tram behaviour
follows signs, lights, and applicable priority rules, not universal priority.

## Presentation and lifecycle

The camera shows at least 138 scene units across and at least 115 vertically,
with the player 72% down the road viewport. `view.js` is also used by guide
coaching to exclude offscreen vehicles and the area hidden by the instructor
panel. The road stays in a readable daylight palette in either app theme.
Roadside homes, gardens, pavements, and trees continue along the route.
Earlier junctions are painted over later ones: after two turns the same way, a
side road of the junction two ahead runs across the block behind you, and
drawn underneath it can never lay its kerb across the road you are on.

`DriveStage` uses explicit React Native layout styles for the bottom console.
Direction and pedal groups contain 78-point-high buttons. The road fills the
remaining height; coaching text wraps without truncation. Pause is available in
both modes, and leaving the foreground pauses automatically. `shiftTime` moves
all simulation timestamps on resuming to prevent traffic jumping forward.

## Validation and debugging

`npm test -- --runInBand` covers rules, generated scenes, motion, lessons,
queueing, traffic lights, scoring, and random-input fuzzing. The dedicated
`practiceSafety.test.js` drives deterministic routes while checking physical
separation, progress, instructor feedback, translated names, and the complete
guided route. `.maestro/09_guide.yaml` covers native controls and guide navigation.

In development, `driver://crossing?seed=1&level=3` replays a known generated route.
The screen logs the seed under `__DEV__`; production uses a new seed. If Metro's
file watcher misses local edits, restart with a cleared cache before trusting
screenshots. Native screenshot checks should use the freshly exported iOS bundle.
