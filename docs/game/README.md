# The games

Two games share one engine, one renderer and the scene format.

| doc | what it covers |
|---|---|
| `runner.md` | Crossings, the endless runner: world, scheduling, motion, penalties, events, rendering, debugging |
| `guide-mode.md` | the ten guided lessons that unlock Crossings, and how to add one |
| `quiz.md` | "Who goes first?", the timed quiz on the 88 exam pictures |
| `priority-rules.md` | the legal rules the engine implements, cited to zákon 8/2009 and vyhláška 30/2020, and where the runner differs from the exam |
| `scene-format.md` | the scene JSON: arms, signs, control, vehicles, tram tracks |
| `situations-by-image.md`, `situations.json` | the exam pictures, their answers and how they were encoded |

Start with `priority-rules.md` if you are changing who goes first, `runner.md`
if you are changing how the drive feels, and `scene-format.md` if you are
adding situations.

`data/game/scenes.json` holds all 39 in-scope exam pictures as scenes, and
`__tests__/scenes.test.js` fails if the engine stops reproducing an official
answer. Nothing about priority may change with that suite red.
