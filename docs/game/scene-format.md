# Scene format for "Who goes first?"

A scene is a top-down, abstract description of one intersection situation. The
renderer draws it as SVG and the rules engine computes who goes first. Exam
pictures are encoded in this format so the engine can be checked against the
official answers, and the procedural generator produces new scenes in it.

Everything is JSON (one file per batch under `data/game/scenes.*.json`, merged
into `data/game/scenes.json`).

> **(new)** Additions made after the endless runner landed are marked
> **(new)** below. Three tags say where a field comes from:
> **(exam only)** never appears in a generated scene, **(generator)** is set by
> `src/lib/priority/generator.js` and never appears in the exam data, and
> **(runner)** is read only by `src/lib/priority/world.js`. The section
> "Which fields come from where" at the end lists them together.

## Orientation

Top-down. Compass arms: `N` (top), `E` (right), `S` (bottom), `W` (left).
The exam pictures are driver's-eye views; map them as: the driver's car is on
`S` heading `N`, the left side of the picture is `W`, the right side is `E`,
the far side is `N`. Roundabout and police pictures are drawn from above or
from the side; pick `S` as the arm nearest the viewer and keep left = `W`.

A vehicle's movement is `from` (arm it arrives on) and `to` (arm it leaves by).
`from: "S", to: "N"` is straight, `to: "W"` is a left turn, `to: "E"` a right
turn. The engine derives straight/left/right/U-turn from the two arms.

## Scene object

```json
{
  "id": "ds-01",
  "image": "obr3/ds/01.png",
  "layout": "cross",
  "arms": ["N", "E", "S", "W"],
  "signs": { "S": null, "W": null, "E": null, "N": null },
  "mainRoad": null,
  "tramTracks": [],
  "control": null,
  "vehicles": [
    { "id": "you",  "kind": "car", "color": "you",  "from": "S", "to": "W" },
    { "id": "red",  "kind": "car", "color": "red",  "from": "W", "to": "N" },
    { "id": "blue", "kind": "van", "color": "blue", "from": "E", "to": "W" }
  ],
  "pedestrians": [],
  "expected": { "order": [["blue"], ["you"], ["red"]] },
  "questions": [1813, 1814],
  "notes": "No signs. Blue comes from your right; red turns left across blue."
}
```

### Fields

- `id`: `ds-NN` for `obr3/ds/NN.png`, `ds35` for the 2023 picture.
- `layout`: `"cross"` (four arms), `"t"` (three arms; list which in `arms`),
  `"roundabout"`, `"entry"` (a vehicle enters the road from a place that is
  not a road: driveway, parking, field road, pedestrian zone; mark that
  vehicle with `"fromEntry": true`).
  **(new)** Only the first three are used by anything that runs. `"entry"` is
  not in the data; what the engine actually keys on is `"fromEntry"` on the
  vehicle, wherever it appears. Two more layouts exist in the exam data and
  are **(exam only)**: `"obstacle"` (a lane closed by an obstacle, `ds-36`,
  `ds-37`) and `"merge"` (an ending lane, `ds-38`). Neither is an
  intersection; all three scenes carry `"outOfScope": true` and neither the
  engine nor the renderer understands them.
- `arms`: the arms that exist. For a T-junction give the three arms.
- `signs`: per arm, the priority sign facing traffic **arriving on that arm**:
  `null` (none), `"yield"` (P 1 Daj prednosť v jazde!), `"stop"` (P 2 Stoj,
  daj prednosť v jazde!), `"main"` (Hlavná cesta), `"main-end"` (Koniec
  hlavnej cesty), `"roundabout"` (roundabout sign only), `"roundabout-yield"`,
  `"roundabout-stop"`. Add `"tramPlate": true` on an arm when the yield or
  stop sign carries the tram additional panel (the picture with a tram symbol
  under the yield sign).

  **(new)** That is the whole vocabulary, and the engine and the renderer both
  accept exactly those eight values. What each one does:

  | value | `engine.js` reads it as | `JunctionStatic.tsx` draws |
  |---|---|---|
  | `null` | equal road, or main when some other arm yields | nothing |
  | `"yield"` | side road | triangle, dashed give-way line, painted triangle in the lane |
  | `"stop"` | side road | octagon, solid stop line, painted STOP in the lane |
  | `"main"` | main road | yellow diamond, plus the shape panel when `mainRoad` bends |
  | `"main-end"` | **side** road at this intersection | diamond with a stroke through it |
  | `"roundabout"` | ring has no priority: right-hand rule | blue disc with three arrows, plus give-way markings on a roundabout layout |
  | `"roundabout-yield"` | entering yields to the ring | triangle above the blue disc |
  | `"roundabout-stop"` | entering halts, then yields to the ring | octagon above the blue disc |

  `"main-end"` is the one that catches people out. "Koniec hlavnej cesty"
  stands where the main road stops being main, so at *this* intersection that
  arm is a side road.

  The tram panel is really stored one level down, in a sibling field
  `signAddons` (see the `ds-12` example below), and **nothing reads it**.
  Neither the engine nor the renderer looks at `signAddons` or `tramPlate`; it
  records what the picture shows. Tram priority comes out of `tramTracks` and
  the vehicle kinds instead.

  In the runner, `signs.S` is also read on its own by `stopSignFor` in
  `world.js`: `"stop"` or `"roundabout-stop"` there means you must come to a
  real halt at the line whatever the traffic is doing.
- `mainRoad`: the two arms that form the main road when the additional
  "tvar križovatky" panel shows it bending, e.g. `["W", "N"]`. `null` when
  the main road is straight through or there is no main road. When a sign says
  `"main"` on `S` and nothing else is visible, assume the main road continues
  straight (`["S", "N"]`).
- `tramTracks`: list of `{ "from": "W", "to": "E" }` pairs the tracks connect.
  Two trams on the same tracks are fine.

  **(new)** The two arms need not be opposite. A turning track is legal and
  the data uses one (`ds-18` has `{ "from": "W", "to": "S" }`); the renderer
  bends its rails through the box corner exactly the way `crossingPath` bends
  a turning vehicle. An entry counts for **both** its arms: `hasTrack(scene,
  arm)` is true for either end, which widens both roads to `WIDE_HALF` 18,
  pushes the car lanes out to `laneOffset` 12, and grows the crossing box
  through `boxHalf`. That is a geometry change, not just a drawing change, so
  adding a track moves every waiting line at the junction.
- `control`: `null`, or
  `{ "type": "police", "pose": "arms-sides" | "right-forward-left-side" | "arm-raised", "facing": "S" }`
  where `facing` is the arm the officer's chest faces (with `arms-sides`,
  traffic on the arms to the officer's left and right may go). Or
  `{ "type": "lights", "arms": { "S": "green", "N": "green", "E": "red", "W": "red" }, "exitArrows": { "N": "left" } }`
  where `exitArrows` lists the separate green arrow signal for leaving the
  intersection, keyed by the corner it is placed on and giving the direction
  it allows (for the picture with the green left arrow in the opposite corner
  facing the driver on `S`, use `"exitArrows": { "S": "left" }`: the arm whose
  drivers it protects).

  **(new)** Two more keys on a `lights` control:

  - `"turnArrows": { "E": "right" }`: the small green right-turn arrow beside
    a red light. `lightsAllow` in `engine.js` turns a red arm from "may not
    move" into "may turn right only", and a vehicle with the arrow beats one
    without it (rule `signal`). `ds35` uses it; only the value `"right"` is
    interpreted.
  - `"crossFirst": true` **(generator, runner)**: the runner's light cycle.
    The scene always encodes the phase in which *you* go, your arms green and
    the cross arms red, so the engine can resolve one fixed phase.
    `crossFirst` says the cross road has its green *before* you, so you arrive
    at a red and wait; without it you go first and the cross arms turn green
    behind you. `world.js` reads it in `applyResolution` (which splices the
    cross-arm vehicles into the resolved order), `lightPlan` and
    `recordControl`. The exam scenes never set it, because a picture is one
    phase.

  In the runner it is `lightState(junction, now)` in `world.js`, not
  `control.arms`, that decides what colour each head shows; `control.arms` is
  the fallback for a still picture.
- `vehicles`: `id` is the colour word or `you` or `tram1`/`tram2`; `kind` is
  `car`, `van`, `truck`, `bus`, `tram`, `motorcycle`, `bicycle`, `emergency`
  (with `"siren": true` when the blue lights are on); `color` is `you`, `red`,
  `blue`, `green`, `yellow`, `white`, `black`, `tram`. `from`/`to` as above.
  For a vehicle already inside a roundabout use `"from": "ring"` and `to` the
  exit arm; for one entering give its arm and `"to": "ring"` when the exit is
  not shown. `"indicator": "left" | "right"` when the picture shows it (optional,
  the arrow already implies it).

  **(new)** `"ringAt": 235` on a `"from": "ring"` vehicle: the absolute ring
  angle it starts from, in the same convention as the rest of `layout.js` (0
  at the `N` axis, growing clockwise on screen, while traffic drives round
  counter-clockwise). `roundaboutPath` in `layout.js` reads it and falls back
  to `RING_DEFAULT_START` 235, which sits just before the `S` entry so a car
  you must give way to is seen waiting at the entry it blocks rather than a
  quarter turn away. The generator sets it on every ring car, spacing the
  platoon at least `RING_MIN_GAP_DEG` 45 apart; it also survives into the
  drive-log record. The exam scenes leave it out and take the default.

  **(new)** Two vehicle fields are **(exam only)** and read by nothing:
  `"lane"` (`"right"`, `"middle"`, `"through"`, `"ending"`, in the obstacle
  and merge scenes) and `"note"`. `"indicator"` is also unread; the sprite
  derives its blinker from `from`/`to`. `"fromEntry": true` and
  `"siren": true` *are* read, by `engine.js`.
- `pedestrians`: `{ "crossing": "S", "onCrossing": true }` per group that is
  on or stepping onto the crossing of that arm.
- `expected`: what the official answers say. Use only what the questions
  state; do not invent the rest:
  - `"order"`: full sequence, groups are simultaneous: `[["blue"], ["you"], ["red"]]`.
  - `"first"`, `"second"`, `"last"`: groups, e.g. `"first": ["red", "blue"]`.
  - `"priority"`: pairwise, `[["blue", "red"]]` means blue goes before red.
  - `"mayGo"` / `"mustStop"` for police and lights questions: vehicle ids.
  - `"position"`: `{ "you": 2 }` for "your vehicle crosses second/last"
    (use `"last"` for last).
- `questions`: the question ids from `docs/game/situations-by-image.md`.
- `notes`: one or two sentences: what the picture shows and why the answer is
  what it is, in plain words.
- **(new)** `conflict: true` **(exam only)**: the official answer disagrees
  with the law as we read it. `__tests__/scenes.test.js` still runs the scene
  but reports the mismatch instead of failing. One scene has it today
  (`ds-19`).
- **(new)** `outOfScope: true` **(exam only)**: not an intersection at all, so
  the engine is not expected to handle it. `scenes.test.js` skips these
  outright. Three scenes have it (`ds-36`, `ds-37`, `ds-38`).

## Examples

Roundabout with the roundabout sign only (`obr3/ds/07.png`): blue is inside,
red enters from the right. Right-hand rule applies because there is no yield
sign, so red goes first.

```json
{
  "id": "ds-07", "image": "obr3/ds/07.png", "layout": "roundabout",
  "arms": ["N", "E", "S", "W"],
  "signs": { "S": "roundabout" },
  "mainRoad": null, "tramTracks": [], "control": null,
  "vehicles": [
    { "id": "blue", "kind": "car", "color": "blue", "from": "ring", "to": "E" },
    { "id": "red",  "kind": "car", "color": "red",  "from": "S",    "to": "ring" }
  ],
  "pedestrians": [],
  "expected": { "priority": [["red", "blue"]] },
  "questions": [1863],
  "notes": "Roundabout sign without a yield sign: the entering car comes from the right of the circulating car and has priority."
}
```

Tram crossing with the tram plate (`obr3/ds/12.png`): two trams on the tracks
across, a blue car opposite turning to its right (our left), you going straight,
yield sign with the tram panel on your arm.

```json
{
  "id": "ds-12", "image": "obr3/ds/12.png", "layout": "cross",
  "arms": ["N", "E", "S", "W"],
  "signs": { "S": "yield", "N": null, "E": null, "W": null },
  "signAddons": { "S": { "tramPlate": true } },
  "mainRoad": null,
  "tramTracks": [{ "from": "W", "to": "E" }],
  "control": null,
  "vehicles": [
    { "id": "you",   "kind": "car",  "color": "you",  "from": "S", "to": "N" },
    { "id": "blue",  "kind": "car",  "color": "blue", "from": "N", "to": "W" },
    { "id": "tram1", "kind": "tram", "color": "tram", "from": "W", "to": "E" },
    { "id": "tram2", "kind": "tram", "color": "tram", "from": "E", "to": "W" }
  ],
  "pedestrians": [],
  "expected": {},
  "questions": [],
  "notes": "Fill expected from the questions for this image."
}
```

Signalized junction (`2023/2000001_DS35.jpg`): full green for the bottom arm,
a separate green left arrow in the opposite corner protecting the left turn
from `S`.

```json
{
  "id": "ds35", "image": "2023/2000001_DS35.jpg", "layout": "cross",
  "arms": ["N", "E", "S", "W"],
  "signs": {},
  "mainRoad": null,
  "tramTracks": [{ "from": "S", "to": "N" }],
  "control": { "type": "lights", "arms": { "S": "green", "N": "green", "E": "red", "W": "red" }, "exitArrows": { "S": "left" } },
  "vehicles": [
    { "id": "red",    "kind": "car",  "color": "red",    "from": "S", "to": "W" },
    { "id": "blue",   "kind": "car",  "color": "blue",   "from": "S", "to": "N" },
    { "id": "green",  "kind": "car",  "color": "green",  "from": "N", "to": "E" },
    { "id": "yellow", "kind": "van",  "color": "yellow", "from": "N", "to": "S" },
    { "id": "tram1",  "kind": "tram", "color": "tram",   "from": "N", "to": "S" },
    { "id": "tram2",  "kind": "tram", "color": "tram",   "from": "S", "to": "N" }
  ],
  "pedestrians": [],
  "expected": { "priority": [["red", "green"], ["red", "yellow"], ["red", "tram1"], ["red", "tram2"]], "first": ["red", "blue"] },
  "questions": [1891, 1892],
  "notes": "The green exit arrow protects the left turn: red goes before the oncoming green, yellow and both trams, together with blue going straight."
}
```

## Which fields come from where (new)

Two producers write scenes in this format and they do not overlap much. Knowing
which is which saves an hour of wondering why a field is always empty.

| field | exam scenes | generator | notes |
|---|---|---|---|
| `id` | `ds-NN` | `gen-<level>` | the generator also adds `level` |
| `image`, `questions`, `expected`, `notes` | yes | never | the generator has no official answer to check against |
| `conflict`, `outOfScope`, `signAddons` | yes | never | documentation and test flags |
| `layout` | `cross`, `t`, `roundabout`, `obstacle`, `merge` | `cross`, `t`, `roundabout` | |
| `arms` | 3 or 4 | 3 or 4 | a T always keeps `S` |
| `signs` | all eight values | `yield`, `stop`, `main`, `roundabout-yield`, `roundabout-stop`, `null` | the generator never emits `main-end` or a bare `roundabout` |
| `mainRoad` | yes | yes | |
| `tramTracks` | straight and turning | `W`-`E` only, from level 3 | |
| `control` police | yes | never | police scenes are quiz-only |
| `control` lights | fixed phase, `turnArrows`, `exitArrows` | fixed phase plus `crossFirst`, from level 2 | the generator never emits either arrow field |
| `vehicles` | `car`, `van`, `tram`; `lane`, `note`, `indicator`, `fromEntry` | `car`, `van`, `tram`; `ringAt` on ring cars | the generator uses only the four colours in `COLOURS` plus `you` and `tram` |
| `pedestrians` | yes | always `[]` | so nothing in the runner ever waits for a pedestrian |

On top of the scene, `generateScene` attaches `resolution` (the `resolve()`
result) and `youGoesAt`, and `world.js` hangs a lot more runtime state on the
*junction* that wraps a scene (`starts`, `rollIn`, `clearFraction`, `ring`,
`blockers`, and so on). None of that belongs in a stored scene; see
`docs/game/runner.md`.

## Encoding checklist

1. Open the picture. Decide the layout and which arms exist.
2. Place every vehicle by the arm it comes from and the arm its red arrow ends
   on. A vehicle with no arrow and no indicator goes straight.
3. Note every sign and which arm it faces. Signs stand on the right of the
   arm they apply to. A yield sign seen ahead on the far side applies to `N`
   traffic, not to you.
4. Note trams, tracks, pedestrians, police, lights.
5. Copy the expected facts from every question for this image in
   `docs/game/situations-by-image.md` (Slovak text; the answers name colours,
   "vaše vozidlo" = `you`, "električka" = tram, "súčasne" = same group).
6. Explain the answer in `notes`; if the official answer contradicts what the
   rules would give, say so explicitly with `"conflict": true`.
