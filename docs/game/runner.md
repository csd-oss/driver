# The Crossings endless runner

Crossings is the driving half of the minigame hub. You drive a car down an
endless road; every junction on it is a generated scene resolved by the same
priority engine the quiz uses. Swipe down to give way, up to move off, left or
right to turn. The car never moves off by itself.

This file describes the runner. The rules the engine applies are in
`docs/game/priority-rules.md`, the scene JSON is in `docs/game/scene-format.md`,
and the exam pictures behind the quiz are in `docs/game/situations-by-image.md`.
A separate guide mode is being built right now in `app/crossing-guide.tsx` with
its lessons in `src/lib/priority/lessons.js`; see `docs/game/guide-mode.md` for
that (written separately, not covered here).

## Where the code lives

| file | what it owns |
|---|---|
| `src/lib/priority/world.js` | the run: route, junction placement, scheduling, your car, scoring, events |
| `src/lib/priority/generator.js` | one random scene per junction (`generatePlayable`) |
| `src/lib/priority/engine.js` | `resolve(scene)`: order, yields, reasons |
| `src/lib/priority/geometry.js` | arms, turns, conflict cells |
| `src/lib/priority/layout.js` | the 100x100 coordinate system, every vehicle path |
| `src/lib/priority/conflict.js` | whether two paths really meet, and how far along |
| `src/lib/priority/timeline.js` | where another vehicle is at time `t` (`poseAt`) |
| `src/lib/priority/queue.js` | same-arm queueing offsets |
| `src/lib/priority/lessons.js` | the fixed junctions of the guide (`guide-mode.md`) |
| `app/crossing.tsx` | the screen: RAF loop, swipes, HUD, toasts, game-over card |
| `components/game/*` | the SVG layers |
| `src/lib/crossingLog.js`, `app/crossing-log.tsx` | the drive log |

`world.js` is a pure module with no React and no I/O. The screen calls
`step(run, now)` once per frame and reacts to the events it returns. That split
is what makes `__tests__/world.test.js` and `__tests__/runnerFuzz.test.js`
possible, so keep it.

## The world model

A run is a list of junctions and one polyline through all of them.

Each junction is a generated scene in its **own local frame**: a 100x100 box
with the centre at (50, 50), and you always arrive on its `S` arm. The frame
carries `cx`, `cy` (its centre in world coordinates) and `rot` (its rotation).
`toWorld(junction, p)` maps a local point into the world by rotating about the
frame centre. Because you always arrive on `S`, the frame rotates with you: the
junction after a left turn is simply placed with a different `rot`.

`placeAfter(prev, scene, spacing)` builds junction *j+1* from *j*. It takes the
world heading you leave *j* with (`prev.rot + EXIT_HEADING[you.to]`), walks
along the **road axis** rather than your lane (so the two frames share a centre
line), and puts the next centre `gap + CENTER` further along, where
`gap = spacing - 2 * CENTER`. It records `gapAfter` on the previous junction and
`gapBefore` on the new one; the renderer uses those to draw the open road
between the two frames.

`spacingFor(level)` is the distance between junction centres:

```js
spacingFor = clamp(round(speedFor(level) * SECONDS_BETWEEN), SPACING, MAX_SPACING)
```

`SECONDS_BETWEEN` is 7.5, so roughly 7.5 seconds of driving separates two wait
lines whatever the speed. `SPACING` 180 is the floor, `MAX_SPACING` 320 the
ceiling (reached around level 14). `LEAD_ROAD` 160 is the open road before the
first junction of a run, so the first line is not already on screen at the
start.

`rebuildRoute(run)` recomputes the whole polyline from scratch. It starts with
one point `CENTER + LEAD_ROAD` up the first junction's `S` approach lane, then
appends every junction's `through` path (`throughWorld`, which is your own
movement through that junction in world coordinates, or the ring path on a
roundabout) and calls `markJunction` for each. `measure()` attaches cumulative
lengths, so your position is a single scalar `run.s`.

`markJunction` records four distances along the route:

| field | meaning |
|---|---|
| `sWait` | the waiting line, `WAIT` (8) before the crossing box |
| `sLine` | `sWait + WAIT + 1`, the box edge; crossing it is "entering" |
| `sExitBox` | roughly leaving the box, where the junction counts as passed |
| `sEnd` | the far end of the exit arm |

`sExitBox` is `sLine + 2 * boxHalf(scene, 'S')` at a plain junction. On a
roundabout it is `Infinity` until you have chosen an exit, then
`sEnd - (CENTER - RING_R - 6)`. That is the trick that makes the whole ring one
junction: you cannot "pass" a roundabout while you are still circling it.

`rebuildRoute` is called after anything that changes the shape of the road:
appending a junction (`ensureAhead`), changing your movement
(`setYourMovement`), and every ring decision (`advanceRing`).

`ensureAhead(run)` keeps two junctions in front of you; `currentJunction(run)`
is the first one that is neither passed nor crashed.

`pointAtDistance(measured, s)` gives your position and heading. The heading is
not the current segment's direction. It is read from the chord between
`s - HEADING_REACH` and `s + HEADING_REACH` (1.5 units either side), so a curve
sampled as short chords turns the car evenly instead of snapping between
segment angles. `layout.js`'s `pointAlong` does the same for other vehicles.

`visibleJunctions(run)` is what gets drawn: `index >= current.index - 1` and
within `MAX_SPACING * 1.3` of you. The index floor matters. A route that loops
back near itself would otherwise show stale pieces of a junction you drove
through minutes ago.

Speed comes from `speedFor(level, coachActive)`:
`min(MAX_SPEED 44, BASE_SPEED 20 + (level - 1) * SPEED_STEP 1.8)`, times
`COACH_SPEED` 0.6 while a guided junction is current. Every
`JUNCTIONS_PER_LEVEL` (4) junctions passed raises the level.

## Scheduling the other traffic

A junction is scheduled once it is `SCHEDULE_AHEAD_S` (7) seconds of driving
away, in `step()`. `schedule(run, junction)` is where the whole junction's
timing is decided at once, and it is the most load-bearing function in the file.

It starts from `arriveAt`, the moment you would reach `sWait` if you never
braked, and works backwards from a target:

```js
arriveAt = now + ((sWait - s) / speed) * 1000
clearAt  = arriveAt + decisionMarginFor(level) * (lights ? LIGHTS_MARGIN_FACTOR : 1)
```

`decisionMarginFor(level)` is `DECISION_MARGIN_MS` 1000 shrinking by
`DECISION_MARGIN_STEP_MS` 60 per level down to `DECISION_MARGIN_MIN_MS` 600, so
the last vehicle with priority clears your path that long *after* you would have
arrived. You therefore have to brake, and the margin is the reaction window.
`LIGHTS_MARGIN_FACTOR` 2.2 stretches it at a signalled junction, because a red
light holds you longer than a single crossing car.

The groups before yours are then laid out backwards from `clearAt`, one
`GROUP_GAP_MS` (1100) apart, each group's start pulled back by the longest
`clearMsOf` in it:

```js
let groupStart = clearAt;
for (let k = youGroup - 1; k >= 0; k--) {
  longest = max(clearMsOf(id) for id in groups[k]);
  start = max(now, groupStart - longest);
  starts[id] = start for id in groups[k];
  groupStart = start - (GROUP_GAP_MS - longest);   // == groupStart - GROUP_GAP_MS
}
```

Three per-junction maps come out of this:

- `junction.starts[id]`: absolute ms at which each vehicle begins its drive
  through the junction, or `null` while it is unknown. Everything else is
  derived from these.
- `junction.rollIn[id]`: `ROLL_IN_MS` (2500) for a vehicle that arrives at
  cruising speed and crosses without stopping, `0` for one that waits at its
  line first.
- `junction.willRollIn`: a `Set`, computed earlier in `applyResolution`, of the
  vehicles that will roll in. `vehiclePoses` skips those until the junction is
  scheduled, so a car with priority appears rolling up the road rather than
  popping into existence. The ones that wait at a line are drawn standing there
  from the moment the junction is on screen.

### Traffic that has nothing to do with you

Vehicles whose path never crosses yours (`clearFraction === null`, see below)
do not wait for you. They drive on their own order, whether or not you have
reached the line. The loop that schedules them runs up to four passes:

```js
for (let pass = 0; pass < 4; pass++)
  for (const v of scene.vehicles) {
    if (v is you || starts[v.id] != null) continue;
    if (clearFraction[v.id] !== null) continue;      // it crosses your path: not this loop's job
    deps = resolution.yields[v.id] || [];
    if (deps.includes('you') || deps.some(d => starts[d] == null)) continue;   // wait for the next pass
    at = max(now + ROLL_IN_MS, ...deps.map(d => starts[d] + clearMsOf(d) + 300));
    starts[v.id] = at;
    rollIn[v.id] = at <= now + ROLL_IN_MS + 400 ? ROLL_IN_MS : 0;
  }
```

The passes exist because these vehicles can depend on each other. A car queued
behind two cars in front of it only gets a start once both of theirs are known,
and one pass per level of the dependency chain resolves that. Four passes covers
the generator's maximum of four other vehicles. A vehicle that must yield to
*you* is skipped entirely; it keeps standing at its line until `startFollowers`
releases it.

`startFollowers(run, junction, from)` runs the moment you enter the box
(`now + 400`). It walks the groups from yours onward, `GROUP_GAP_MS` apart, and
gives a start to anything still on `null`. The last line is deliberate: a
player-chosen movement can deadlock the junction, and vehicles the engine left
out of the order entirely still have to drive away afterwards.

`junction.clearAt` is set from `holdIds`, which is `junction.blockers` plus, at a
signalled junction where the cross traffic goes first, every cross-arm vehicle
whether or not it crosses your path. A red light is a red light even when
nothing is coming.

## What "cleared" means

`timeline.js` has a flat `CLEAR_FRACTION` of 0.62: a vehicle has left the box
once it is 62% along its path. That is far too late for a runner, because a car
crossing your lane is out of *your* way long before it leaves the junction.
`conflict.js` computes the real figure per pair:

`clearFractionFor(scene, other, you)` samples both `through` polylines, finds
the **last** point of the other vehicle's path that comes within
`CONFLICT_RADIUS` (6, about half your width plus half its length plus air) of
any point of yours, adds `CLEAR_MARGIN` 2 for its rear, and returns that as a
fraction clamped to `[0.15, CLEAR_FRACTION]`.

It returns **null** when no point of the other path comes within
`CONFLICT_RADIUS` of yours. That is the important case. The engine legitimately
orders you behind vehicles you could never hit, because the exam reads its
pictures that way (see R4 and the right-turn convention in
`docs/game/priority-rules.md`). On the road there is nothing there to give way
to, so `applyResolution` filters those out:

```js
junction.clearFraction = { id: clearFractionFor(scene, v, you) for each v != you };
junction.blockers = (resolution.yields.you || []).filter(id => byId[id] && clearFraction[id] !== null);
```

`junction.blockers` is the list that can crash you and the list the coach names.
Everything else derives from it:

| helper | what it answers |
|---|---|
| `clearMsOf(junction, id)` | ms after its start when that vehicle is out of your way; uses its own `clearFraction`, whether it eases from rest, and its queue offset |
| `latestOf(junction, ids)` | which of `ids` clears your path last (the one you would have hit) |
| `wayClearAt(junction)` | the last moment any vehicle whose path meets yours is gone, **whoever had priority** |
| `stillCrossing(junction, now)` | blockers still on your path right now |
| `readyAtOf(junction)` | when you may move off: `clearAt` (or the moment you stopped), raised to `wayClearAt`, raised again to your green |

`wayClearAt` ignores priority on purpose. You cannot be judged slow while
somebody is physically in front of you, even a car that should have given way to
you and went anyway.

## Your car

State on `run`: `s` (distance along the route), `v` (current speed),
`speed` (cruise target), `brakeLights`, `braking`, `intent`, `stoppedAt`,
`crashUntil`, `now`, `lives`, `score`, `streak`, `passed`, `level`, `over`.

### The speed model

All of it is in the else-branch of `step()` (the branch that runs while you are
not stopped). Five rates:

| constant | value | used for |
|---|---|---|
| `ACCEL` | 14 | moving off and speeding up |
| `SOFT_DECEL` | 6 | the immediate, gentle slow-down after a swipe down, and any coast-down |
| `DECEL` | 12 | the braking curve that ends exactly at the line |
| `HARD_DECEL` | 40 | a late swipe, when you are already above the curve |
| `CREEP` | 0.6 | after the swipe the car rolls on at this share of cruise speed until the line is near |

A stop is due when `mustStop` holds: you are before `sLine` and either
`run.braking` is set, or there is no straight ahead and you have not chosen a
direction (`noStraight`). Then

```js
curve  = sqrt(2 * DECEL * max(0, sWait - s));
target = min(speed, max(4, speed * CREEP), curve);
rate   = v > curve ? HARD_DECEL : SOFT_DECEL;
```

The `max(4, ...)` floor keeps the car rolling rather than crawling to a halt
metres early. The car stops when `next >= sWait` or it is within 0.3 of it;
`run.stoppedAt` is set, `v` goes to 0, `junction.stoppedAtTime = now`,
`junction.stopped = true`, and either a `stopped` or a `needTurn` event fires.
`run.brakeLights` mirrors `mustStop`; the screen also lights them while you
stand still.

### The inputs

`applyInput(run, input)` takes `'brake' | 'go' | 'left' | 'right' | null` and
does nothing while the run is over or during the crash pause. The screen maps
swipes to it in a `PanResponder` with a 28 px threshold: down is brake, up is
go, left and right are turns.

- **brake** sets `run.braking` when you are before `sLine` and not already
  stopped. It never applies inside the box.
- **go** while rolling and braking just cancels the brake (you changed your mind
  before the line). While stopped it calls `moveOff`, unless `needTurn` is set,
  in which case you have to pick a direction first.
- **left / right** before `sLine`, and only while you have not entered the box
  (`starts.you === null`), set `run.intent` and call `setYourMovement`. Swiping
  the same direction twice clears the intent. An arm that does not exist here is
  ignored.
- On a roundabout, **right** arms the blinker for the next exit and **left**
  disarms it and keeps you circling.

`moveOff(run, junction)` is the single door out of a stop. It records a red-light
offence if your light forbids entry, sets `earlyResume` when you went within
`EARLY_BONUS_MS` (700) of `readyAtOf` and your stop was not needless, clears
`run.stoppedAt`, and pushes `resumed`.

Two shortcuts matter for feel: choosing a direction while standing at the line
also means "go", and arming the roundabout blinker while standing at the entry
also means "go". Both call `moveOff` directly.

`setYourMovement(run, junction, to)` is what a turn really costs. It rewrites
`you.to`, re-runs `applyResolution` (so priority is computed for the movement
you are actually going to make), rebuilds `junction.through`, and then **drops
every junction after this one** and calls `rebuildRoute` + `ensureAhead`,
because where the road goes next depends on where you leave this junction. If
the junction is already scheduled, any vehicle that newly has priority over you
is given a start of `now`, so it moves off at once instead of politely waiting
for a car that is no longer coming.

`youSignalFor(run)` is your indicator. Before the line it follows `run.intent`.
Inside the box it comes from `turnOf('S', executedTo || you.to)`. On a roundabout
it is right while the blinker is armed and stays right through the exit bend,
until `s >= sEnd - (CENTER - RING_R)`. It also handles the case after a crash,
where the car still completes that junction's turn even though the junction is
marked crashed.

## How the other vehicles move

`timeline.js` `poseAt(scene, vehicle, start, now, pathCache, rollInMs, queueBack)`
returns `{x, y, angle, progress}` in the junction's local frame, or `null` once
the vehicle has left. `vehiclePoses(run)` calls it for every vehicle of every
visible junction and converts to world coordinates. Note the clock: `poseAt`
works on a scene-relative time, so both `start` and `now` are passed as offsets
from `junction.t0`.

Two motion profiles:

**Rolling in** (`rollInMs > 0`). The vehicle appears `rollInMs` before its
start, drives up its approach at cruising speed (`V = L / D`, path length over
duration), and carries straight on through the junction without stopping.
`tailOf(points, dist)` gives the last `dist` units of the approach polyline,
extending it backwards in a straight line when `dist` is longer than the frame
covers, so the car can roll in from further up the road than the 100x100 box.
`ROLL_IN_MAX` 88 caps how far back it appears.

**Starting from rest**. Before its start the vehicle rolls up to its (queued)
line over `APPROACH_MS` 700 with an ease-out, then waits. When its start comes it
accelerates away: `EASE` 0.3 says it spends the first 30% of the drive time
building up to cruising speed, then holds it. `easeIn(u)` is that distance
profile and `easeInTime(d)` its inverse, which is what lets `clearTimeMs` answer
"when will it be 40% along?" for a vehicle that has not started yet.

`DURATION_MS` is per kind: car 2300, van 2500, truck and bus 2800, tram 3400,
motorcycle 2100, bicycle 3000, emergency 2000. `durationOf` falls back to the
car value.

### Same-arm queueing

The generator cycles source arms, so with four other vehicles two of them can
share an arm. `queue.js` `queueBackFor(scene, order, vehicleId)` returns how far
behind its arm's waiting line a vehicle stands: 0 for the one that crosses
first, then half the length of the car ahead plus half its own plus `QUEUE_AIR`
3 for each one further back. `VEHICLE_LENGTH` is car 10, van 11.5, truck and bus
13.5, tram 21, motorcycle 7, bicycle 6, emergency 10. Trams queue only with
trams, since they have their own track; ring vehicles never queue.

The offsets are computed in `applyResolution` **only when the junction is not
yet scheduled**:

```js
if (!junction.scheduled) junction.queueBack = { ... };
```

Once the junction is running those offsets are physical positions on screen.
Changing your own movement re-resolves priority, but it must never shunt a car
that is already standing in a queue.

`clearTimeMs` charges the queue gap as extra distance, so a car standing second
in line genuinely takes longer to clear your path than the one at the line.

`QUEUE_GAP` (12) is a nominal car-to-car gap kept for the tests; the code
itself spaces vehicles by their own lengths.

## Junction kinds and what they do in the runner

The generator (`bandFor(level)`) decides what a junction is. Everything is
available from level 1 except trams (level 3) and lights (level 2); what rises
with the level is traffic density, from 2 other vehicles up to 4.

**Plain crossings and T-junctions.** `buildCrossing` drops one of `N`, `E`, `W`
for a T (30% chance). Priority is the right-hand rule, plus the left-turn rule.
If there is no straight ahead and you have not swiped, the car stops at the line
and waits for a direction: that is `needTurn`, and it does not count as
hesitating.

**Signed main and side roads.** 60% of crossings get a main road through two
arms; about half the time you are on it, otherwise you arrive on a side road
with a yield or a STOP sign. Your own arm is always signed, so what you may do
is readable from the driver's seat. A plain straight main road through you
sometimes has its signs removed, which turns it back into a right-hand-rule
junction. `mainRoad` can bend (`['S', 'W']`), and then the sign carries the
"tvar križovatky" panel; the instructor may say "follow the main road" and leave
you to read it.

**STOP signs.** `stopSignFor(junction)` looks at `signs.S` only and accepts
`'stop'` and `'roundabout-stop'`. A STOP sign asks for a real halt whatever the
traffic. If you enter the box without ever having stopped
(`stopSignFor && !junction.stopped`), that is a `ranStop` penalty. In return it
buys patience: the late deadline gains `STOP_GRACE_MS` 1500, and a stop at a
STOP sign is never counted as needless.

**Traffic lights.** Lights cycle in the runner rather than sitting in a fixed
phase. The scene encodes the phase in which *you* go (your arms green, the cross
arms red) so the engine can resolve that phase; `control.crossFirst` says whether
the cross road gets its green before you (60% of generated lights scenes) or
after.

`crossIdsOf(scene)` is the vehicles on red arms. `applyResolution` splices them
into the resolved order: ahead of everything with `crossFirst` (and they become
your blockers, reason `signal`), or after everything without it (and then they
yield to *you*, so nothing can send them off early and turn your light red while
you stand there).

`lightPlan(junction)` gives `yourArms`, `crossArms`, `yourGreenAt`,
`crossGreenAt` and which side is `next`. With `crossFirst` your green is
`junction.clearAt + ALL_RED_MS` (700) after the cross traffic has cleared;
otherwise you are green from `junction.t0` and the cross side goes green at the
earliest cross start. `lightState(junction, now)` turns that into a phase per arm
through `phaseOf`: `LIGHT_CHANGE_MS` 800 of red+yellow before a green, and
`LIGHT_YELLOW_LEAD_MS` 1500 before the other side's green the losing side goes
yellow for `LIGHT_CHANGE_MS`. The side that is green from `t0` skips its
red+yellow lead-in, because it was green before the junction appeared.

`redFor(junction, now)` treats both `red` and `redyellow` as forbidding entry.
Crossing the line then is a `redLight` penalty, charged once per junction, both
from `moveOff` and from the "entering the box" branch of `step()`.

**Roundabouts.** 20% of junctions at level 1, 30% from level 2. `createRing()`
sets up your ring state: `ringExitOrder('S')` is the arms in the order you meet
them going counter-clockwise, `next` indexes the exit whose decision point is
coming, `armed` is the blinker, `exitTo` is fixed once you are on the exit bend,
and `path` is the local polyline driven so far. It starts as the wait line, the
entry bend, and the arc to the first exit's leave point.

`advanceRing(run, junction)` fires from `step()` when you reach the end of the
path so far. If the blinker is armed it appends the exit curve, sets `exitTo` and
`executedTo`, and pushes `ringExit`; if the chosen arm is not the one the frame
assumed, it also calls `setYourMovement` to re-place the road after the
roundabout. If the blinker is off it advances `next`, appends another arc, counts
a lap when it wraps, and rebuilds the route. A lap counts as a wrong way, so
circling to hunt for the exit costs the junction's points.

The geometry is in `layout.js`. `RING_R` 19 is the ring centre line,
`ISLAND_R` 10 the island. `RING_JOIN_DEG` 32 is how far past its arm's axis a car
joins the ring and how far before the exit arm's axis it leaves, which makes both
tangential curves instead of kinks. `RING_DEFAULT_START` 235 is where a ring
vehicle stands when its scene does not say (just before the `S` entry, so a car
you must give way to is visible right at the entry it blocks).
`RING_APPROACH_DEG` 190 is how much ring a circulating vehicle comes round
before its start point, so it is seen circulating into place.

The generator only ever produces ring-priority roundabouts:
`roundabout-yield` (80%) or `roundabout-stop` (20%), the same sign on every arm.
A bare `roundabout` sign puts circulating traffic behind you under the
right-hand rule, which effectively never happens on a Slovak road. The exam
pictures still have that case, and the quiz still teaches it.

After a crash at a roundabout entry, `completeRing` drives the car round to the
instructed exit anyway, so the camera has somewhere to go.

**Trams and wide roads.** `hasTrack(scene, arm)` is true for an arm that is
either end of a `tramTracks` entry. Such an arm is wider: `roadHalf` returns
`WIDE_HALF` 18 instead of `ROAD_HALF` 12, the two tracks run down the middle at
`TRACK_OFFSET` 2.5 either side of the axis, and the car lanes sit outside them at
`laneOffset` (`roadHalf - LANE_HALF` = 12). `boxHalf(scene, arm)` is the half
width of the road the arm *crosses*, so it grows with the crossing road and the
whole crossing box gets bigger. That feeds `sLine`, `sExitBox`, every path, and
the waiting distances in `queue.js`, which is why every width in the drawing code
comes from these helpers rather than a constant.

The generator adds a `W`-`E` track to 35% of crossings that have both those arms
(from level 3), and a tram on it 80% of the time.

## Scoring and penalties

`passJunction(run, junction)` runs when `s >= sExitBox`:

```js
base       = 100 + (level - 1) * 15
bonus      = earlyResume ? 60 : 0
multiplier = min(2, 1 + 0.1 * streak)
points     = spoiled ? 0 : round((base + bonus) * multiplier)
streak     = spoiled ? 0 : streak + 1
```

`spoiled` is `hesitated || wrongWay || late || ranRed || ranStop`, and is forced
to false on the guided junctions of a first run.

| penalty | trigger | cost |
|---|---|---|
| `hesitated` | judged at pass time: `stopWasNeedless && !blockers.length`. `stopWasNeedless` is set at the moment you stop, when there was no blocker, no red light, no STOP sign, and `now >= wayClearAt` | junction scores 0, streak reset |
| `late` | stopped at the line and `now > readyAtOf(junction) + LATE_MS (4000) + (stopSign ? STOP_GRACE_MS : 0)`, and you are not waiting for a direction. Fires once | streak reset at once, junction scores 0 |
| `redLight` | entering the box, or moving off, while your arm shows red or red+yellow | streak reset, junction scores 0 |
| `ranStop` | entering the box with a STOP sign on your arm and `junction.stopped` never set | streak reset, junction scores 0 |
| `wrongWay` | at pass time: `executedTo !== instruction.to`, or a roundabout lap | streak reset, junction scores 0 |
| crash | entering the box (`s >= sLine`) while `stillCrossing(junction, now)` is not empty | a life (`LIVES` 3), streak reset, `CRASH_PAUSE_MS` 1400 pause, junction never scores |

Two notes on the hesitation rule. It is judged **twice**: `stopWasNeedless` is
recorded when you stop, and the verdict is taken again at pass time, because
swiping into a turn after stopping can give somebody priority over you, and then
the stop was right after all. And stopping a moment later than strictly needed is
driving, not a mistake. Dawdling *from* the line is what `late` catches.

A crash never happens by moving off. `moveOff` only clears `stoppedAt`; the car
needs a moment to roll to `sLine`, and `sLine` is where a still-crossing vehicle
is hit. `crash` picks the culprit with `latestOf(junction, crossing)`, the one
that clears last, and looks up the engine's reason for that pair so the toast can
name the rule. A crash on a guided junction costs no life (it does still reset
the streak).

`run.over` is set when `lives <= 0`; the screen waits out `crashUntil` and then
calls `finishRun`.

## The event stream

`step(run, now)` returns the events raised since the last call and clears the
queue (`run.events.splice(0)`). The screen loop in `app/crossing.tsx` walks them.

| event | payload | what the screen does |
|---|---|---|
| `instruction` | `junction`, `kind`, `turn`, `to`, `blockers`, `stopSign` | shows the instructor bar; `kind === 'none'` clears it instead |
| `needTurn` | `junction`, `instruction` | toast, honk haptic |
| `stopped` | `junction` | medium impact haptic |
| `resumed` | `junction`, `early` | light impact haptic |
| `intent` | `junction`, `intent`, `to` | updates the turn arrow in the HUD |
| `ringExit` | `junction`, `to` | nothing (not handled) |
| `hesitated` | `junction` | toast, honk |
| `late` | `junction` | toast, honk |
| `redLight` | `junction` | toast, honk |
| `ranStop` | `junction` | toast, honk |
| `wrongWay` | `junction`, `instruction`, `executed` | toast naming the instruction, honk |
| `crash` | `junction`, `culprit`, `rule`, `record` | glow on you and the culprit, screen shake for 600 ms, double heavy haptic, a toast from `rule.<rule>`, logs the record, `crossing_crash` to PostHog |
| `passed` | `junction`, `points`, `hesitated`, `wrongWay`, `late`, `ranRed`, `ranStop`, `early`, `record` | clears the bar; on a clean pass a `+points` toast and a light haptic; logs the record |
| `level` | `level` | toast, success haptic |

The loop also eases the camera heading towards your heading every frame
(`headingRef += diff * 0.12`) rather than on an event. The guide screen does the
same with `lessonHint(run)`, so its prompt follows what you are doing.

`shiftTime(run, delta)` exists for backgrounding. When the RAF gap exceeds
400 ms the screen calls it with `gap - 16`, and it pushes every absolute
timestamp on the run and its junctions forward so the pause is not charged to
the player.

## The drive log

`junctionRecord(run, junction, outcome)` builds a self-contained JSON snapshot of
one junction, attached to both the `crash` and the `passed` event. It carries the
outcome flags (`crashed`, `hesitated`, `late`, `ranRed`, `ranStop`, `wrongWay`,
`stopped`), the `culprit` and its `rule`, `laps`, `points`, the `instruction` and
the `executedTo` you actually took, the `blockers`, the resolved `order`, the
`reasons`, and a drawable copy of the scene.

Two details of the snapshot. `reasons` is filtered to the rules that involved
you in either direction, so the log can say both "you had to give way to the red
car (right-hand rule)" and "the blue car had to give way to you". And the scene's
`control` goes through `recordControl`, which **flips the light colours** when
`crossFirst` was set, so the picture shows the lights as they were when you had
to make the decision (red for you) rather than the phase the scene encodes.

`app/crossing.tsx` writes each record to the `crossing_log` table via
`src/db/queries/crossingLog.ts` (`addCrossingLog`), and calls
`purgeCrossingLog(lang)` at the end of a run to keep the newest `LOG_KEEP` 300
rows per language. The game-over card lists the run's junctions inline.

`src/lib/crossingLog.js` `explainRecord(record, lang)` turns a record into what
the UI shows: `outcome`, `outcomeLabel`, a `headline`, one `line` per rule, the
`instruction` label and `yourMove`. The headline is a priority ladder: crash
first, then wrong way, red light, ran a STOP, hesitated, late, and only then the
clean variants (stopped at lights, stopped at a STOP sign, stopped, or went
straight through). Strings come from `rule.*` and `crossing.log.*`; a rule in the
`THEIRS` set gets a "they yielded to you because ..." sentence, anything else
falls back to `crossing.log.theirs.other`.

`app/crossing-log.tsx` is the full log screen. Rows come back newest first from
`getRecentCrossingLog`, get grouped by `runId`, and each run's junctions are
reversed so they read in driving order. The newest run starts expanded.
`components/game/RecordModal.tsx` is the tap-through: the scene at up to 420 px
with every path drawn, the crash pair highlighted, and `explainRecord`'s lines as
bullets.

## The rendering layers

Everything is SVG through `react-native-svg`, drawn in scene units. Nothing in
the drawing code knows about pixels except the outer `Svg` width and height.

**`WorldScene.tsx`** is the camera. The viewBox spans `ZOOM_W` 78 scene units
across, and the transform is
`translate(ZOOM_W/2 + shake, viewH * 0.78) rotate(-heading) translate(-you.x, -you.y)`,
so your car sits 78% of the way down the screen and the world turns around it.
Each junction is drawn inside
`translate(cx, cy) rotate(rot) translate(-50, -50)`.

`JunctionFrame` is a `memo` around `JunctionStatic` taking only primitive props
(`scene`, `index`, `gapBefore`, `gapAfter`, `youTo`, `dark`, `lights`). The
static drawing of a junction does not change from frame to frame, only the camera
above it does, and rebuilding that subtree every frame is what makes a turning
camera stutter. It sets `extendArms` so the `S` arm covers the road behind
(`gapBefore + 2` for the first junction, which owns its whole lead road, else
`gapBefore / 2 + 2`, meeting the previous junction halfway) and the exit arm
covers `gapAfter / 2 + 2`. Arms not listed get `sideExtend` `SIDE_ROAD` 70, which
runs them off screen instead of ending them in the grass.

`inView(pose)` applies the same rotation by hand and filters which vehicles get a
`PathArrow`. Arrows for cars off screen are pure cost.

**`JunctionStatic.tsx` + `roadShapes.ts`** draw one junction. `roadShapes.ts`
holds the pure geometry: `armRect` per arm at its own width, `boxRect` (as wide
as the N-S road, as tall as the E-W road), `laneLines` (the dashed centre line,
or a pair at `TRACK_EDGE` ±6 flanking the tram tracks), `trackRailPaths` (four
rails per track entry from `RAIL_OFFSETS`, bent through the box corner for a
turning track exactly the way `crossingPath` bends), `approachLine`,
`laneMarkPoint`, `pedestrianPoint`, and `mainRoadBend`.

`extensionShapes` is the tapering. An arm that continues into the next junction
holds its width for `TAPER_HOLD` 10 and then narrows to `ROAD_HALF` over
`TAPER_LEN` 14, because the next junction's road is a plain one. Only arms
actually listed in `extendArms` taper; a tram street cut off by the frame keeps
its full width. Kerbs (`K` 2.2) run along the road with no cap across it, so
consecutive junction frames join without a visible seam.

`ownArm` is what makes the drawing honest. Only signs on the arm you arrive on
are drawn face-on; every other arm shows a grey `SignBack`, where the silhouette
is all you get, just as from the driver's seat. Painted lane markings back that
up: a give-way triangle or the word STOP in the approach lane, plus the matching
stop line, so you can see from above which road a sign belongs to. A
`roundabout-yield` or `roundabout-stop` arm draws both signs stacked, and its
back draws two backs stacked. `MainShapePanel` hangs the junction-shape panel
under a main-road diamond, rotated with the arm so the bend goes the way the
driver would steer. `LightHead` is a three-lamp head per arm, lit from the live
phase when the runner passes one and from the scene's static colours otherwise.

**`VehicleSprite.tsx`** draws one vehicle pointing up in its own frame, rotated
to `pose.angle`. Size comes from `kind`; the blinker side comes from
`turnOf(from, to)` unless a `signal` prop overrides it, which is how your own
roundabout blinker works. `brakeLights` swaps the tail-light fill and adds a
glow. `glow` is the amber crash outline. Your car gets a white stripe down the
roof.

**`PathArrow.tsx`** is the intention trail: a dashed chevron with an arrowhead
along a slice of the vehicle's `through` path, starting at `progress` (or at the
vehicle's current local position while it is still approaching) and running for
`span`. It returns null past `progress >= 0.9`.

**`IntersectionScene.tsx`** is one junction on its own at a fixed size, used by
the quiz, the log thumbnails and `RecordModal`. It resolves the scene itself for
the queue offsets, so vehicles sharing an arm sit behind each other instead of
overlapping, and takes `showPaths`, `highlight` and `hidden`.

## How to debug

**Replay a road.** `driver://crossing?seed=1&level=3` starts a run on a known
seed and level. Both params are honoured only under `__DEV__`; otherwise the seed
is `Date.now() % 1000003` and the level is 1. The scheme comes from `app.json`.

**Find the seed of a run you just played.** Every run prints one line to Metro
under `__DEV__`:

```
[crossing] run seed=734521 level=1
```

Paste it back into the deep link and you get the same road, the same junctions
and the same traffic, because the whole generator runs off `makeRng(seed)`
(mulberry32).

**Restart Metro after editing.** Metro's file watcher does not work on this Mac.
Run `npx expo start --clear` or the simulator keeps running the old bundle and
your screenshots lie. This has cost real hours.

**Tests to run before touching anything.**

```bash
npx jest __tests__/world.test.js        # the runner's behaviour, junction by junction
npx jest __tests__/runnerFuzz.test.js   # 60 seeds x 6000 frames of random swipes
npx jest __tests__/scenes.test.js       # the engine still reproduces all 39 official answers
npx jest __tests__/generator.test.js    # every generated scene is playable and well formed
npx jest __tests__/timeline.test.js __tests__/queue.test.js __tests__/junctionStatic.test.js
```

`scenes.test.js` is the one that protects the exam answers. If you change
`engine.js` or `geometry.js`, that suite has to stay green.

## Loose ends

Things in the code that a new reader will trip over:

- `buildTimeline`, `judgeGo`, `startsAfterGo`, `scoreCrossing`, `patienceFor` and
  `FIRST_GROUP_AT` in `timeline.js` are only reachable from
  `__tests__/timeline.test.js`. The runner scores in `passJunction` and times in
  `schedule`. They are leftovers from the earlier tap-a-junction mode.
- `QUEUE_GAP` in `queue.js` is test-only; the code spaces vehicles by length.
- The `ringExit` event is pushed but nothing listens for it.
- The individual penalties (`late`, `redLight`, `ranStop`) reset `run.streak` the
  moment they fire, including on a guide lesson, where `passJunction` then treats
  the junction as clean and increments the streak again. Harmless there, because
  the guide shows no score.
- `junction.blockers` filters to ids present in `scene.vehicles`, so pedestrians
  could never be blockers. It does not matter today, because the generator never
  produces pedestrians.
