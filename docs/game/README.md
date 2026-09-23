# Driving practice

One continuous guided drive and practice experience share the engine, renderer
and scene format. Alex teaches the controls and reviews each drive.

| doc | what it covers |
|---|---|
| `runner.md` | Crossings, the endless runner: world, scheduling, motion, penalties, events, rendering, debugging |
| `guide-mode.md` | the eleven lessons, seamless practice handover, Alex, fault penalties and drive log |
| `quiz.md` | historical documentation for the removed intersection quiz |
| `priority-rules.md` | the legal rules the engine implements, cited to zákon 8/2009 and vyhláška 30/2020, and where the runner differs from the exam |
| `scene-format.md` | the scene JSON: arms, signs, control, vehicles, tram tracks |
| `situations-by-image.md`, `situations.json` | the exam pictures, their answers and how they were encoded |

Start with `priority-rules.md` if you are changing who goes first, `runner.md`
if you are changing how the drive feels, and `scene-format.md` if you are
adding situations.

`data/game/scenes.json` holds all 39 in-scope exam pictures as scenes, and
`__tests__/scenes.test.js` fails if the engine stops reproducing an official
answer. Nothing about priority may change with that suite red.

## Analytics (PostHog)

| event | when | properties |
|---|---|---|
| screen `GameHub` | the practice hub gains focus | `language`, `guide_finished` |
| screen `DrivingPractice` | a drive screen opens | — |
| `crossing_started` | a drive begins | `language`, `guided` |
| `crossing_junction` | once per junction, when it is finished (or at drive end for one left unfinished) | `language`, `index`, `mode` (`guide`/`practice`), `lesson`, `level`, `kind`, `layout`, `trams`, `turn`, `outcome` (`clean`/`spoiled`/`crash`), `faults`, `life_lost`, `crash_rule`, `points` |
| `guide_completed` | the last lesson is passed and Crossings unlocks | `language`, `junctions`, `faults`, `duration_sec` |
| `crossing_finished` | the drive ends (lives gone or the player ends it) | `language`, `score`, `junctions`, `faults` |
| screen `CrossingLog` | the drive log opens | — |

`kind` is what you faced from your own arm: `roundabout`, `lights`, `stop`,
`yield`, `main_road` or `right_hand_rule` (`junctionKind` in
`src/lib/driveSession.js`). A drive that is killed mid-run sends
`crossing_started` with no `crossing_finished`.
