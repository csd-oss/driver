# Scene format for "Who goes first?"

A scene is a top-down, abstract description of one intersection situation. The
renderer draws it as SVG and the rules engine computes who goes first. Exam
pictures are encoded in this format so the engine can be checked against the
official answers, and the procedural generator produces new scenes in it.

Everything is JSON (one file per batch under `data/game/scenes.*.json`, merged
into `data/game/scenes.json`).

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
- `arms`: the arms that exist. For a T-junction give the three arms.
- `signs`: per arm, the priority sign facing traffic **arriving on that arm**:
  `null` (none), `"yield"` (P 1 Daj prednosť v jazde!), `"stop"` (P 2 Stoj,
  daj prednosť v jazde!), `"main"` (Hlavná cesta), `"main-end"` (Koniec
  hlavnej cesty), `"roundabout"` (roundabout sign only), `"roundabout-yield"`,
  `"roundabout-stop"`. Add `"tramPlate": true` on an arm when the yield or
  stop sign carries the tram additional panel (the picture with a tram symbol
  under the yield sign).
- `mainRoad`: the two arms that form the main road when the additional
  "tvar križovatky" panel shows it bending, e.g. `["W", "N"]`. `null` when
  the main road is straight through or there is no main road. When a sign says
  `"main"` on `S` and nothing else is visible, assume the main road continues
  straight (`["S", "N"]`).
- `tramTracks`: list of `{ "from": "W", "to": "E" }` pairs the tracks connect.
  Two trams on the same tracks are fine.
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
- `vehicles`: `id` is the colour word or `you` or `tram1`/`tram2`; `kind` is
  `car`, `van`, `truck`, `bus`, `tram`, `motorcycle`, `bicycle`, `emergency`
  (with `"siren": true` when the blue lights are on); `color` is `you`, `red`,
  `blue`, `green`, `yellow`, `white`, `black`, `tram`. `from`/`to` as above.
  For a vehicle already inside a roundabout use `"from": "ring"` and `to` the
  exit arm; for one entering give its arm and `"to": "ring"` when the exit is
  not shown. `"indicator": "left" | "right"` when the picture shows it (optional,
  the arrow already implies it).
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
