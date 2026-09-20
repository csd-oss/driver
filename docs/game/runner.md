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

Cruise speed starts at 20 scene units/second and increases by 0.4 per level,
capped at 24. The guide uses 60%. Acceleration and braking are eased. Stop brakes
towards the line; Go explicitly releases the brake. Physical spacing can stop a
car short of the line if the space is occupied. A T-junction without a selected
turn waits for the driver to choose a direction and move off.

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

At ordinary junctions, followers are released after the player has cleared the
junction. Roundabout arrivals do not wait for the player's whole traversal.
Departing vehicles remain visible beyond the original
100×100 frame. Vehicles joining the connected road follow its next curve rather
than continuing straight through the next roundabout. Nearby old junctions stay
in the simulation until they fall behind the visible road range.

Roundabout crashes require vehicle-body contact; the old clearance timestamp
does not penalise a safe gap. Guide advice checks the actual entrance traffic,
including cars that entered from other approaches. The player waits
before the junction during recovery, allowing the conflicting traffic to clear.
Guide interventions explain the error without consuming a life.

## Instructor, scoring, and review

Instructor directions and relevant feedback share the top panel, which shrinks
when quiet. Routine narration and repeated praise are omitted.
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
