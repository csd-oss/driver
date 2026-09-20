# Exam-picture quiz

Removed from the app in build 36. `/game-quiz` redirects to driving practice.
The following describes the previous implementation; the underlying question
bank and priority fixtures remain available to theory study and engine tests.

"Who goes first?" is the second game in the hub: a timed quiz built from the
official intersection pictures rather than from generated scenes. The engine
and the renderer are shared with the runner, but nothing here is procedural.

Code: `src/lib/game.js` (pure, testable) and `app/game-quiz.tsx` (the screen).
Tests: `__tests__/game.test.js`.

## Which questions it uses

A question qualifies when its image is an intersection situation:
`isSituationImage(path)` matches `obr3/ds/…` and `2023/<n>_DS…`. That is 88
questions in the bank. `getGameItems(lang)` builds and caches the playable
list for a language, one entry per question id.

## Turning an answer text into an interaction

`classifyQuestion(question, lang, category)` reads the three answer texts and
decides how the question can be played. There is no per-question metadata: the
type is inferred from the wording, in this order.

| type | when the answers are | how it plays |
|---|---|---|
| `order` | the same set of vehicles in different orders (`parseSequence`) | tap the vehicles in crossing order |
| `pick` | different vehicles or vehicle pairs (`parseVehicleGroup`) | tap the vehicle that goes first; a pair such as "at the same time as" becomes one two-colour chip |
| `ordinal` | first / second / third / fourth / last (`parseOrdinal`) | tap the position |
| `choice` | anything else, including reason-based questions | the three answers as plain buttons |

`parseVehicle` maps the colour words of all three languages onto the vehicle
ids used by the scenes (`you`, `tram`, `red`, `blue`, `green`, `yellow`), so
the chips can be drawn in the vehicle's own colour and highlighted on the
picture.

`answerIndexForSequence(item, sequence)` maps a tapped order back to the
original answer number, so an `order` question is still scored against the
official answer.

## A round

`createRound(lang, { size, random })` shuffles the playable items and takes
`ROUND_SIZE` (10) of them. The screen gives you `LIVES` (3) and
`TIME_LIMIT_MS` (20 s) per question; running out of time counts as a wrong
answer.

`scoreAnswer({ correct, elapsedMs, streak })`: a wrong answer scores nothing.
A correct one scores `BASE_POINTS` (100) plus a speed bonus that decays
linearly to zero over the time limit (`MAX_SPEED_BONUS` 100), multiplied by
the streak (`STREAK_STEP` 10% per consecutive correct answer, capped at
`MAX_MULTIPLIER` 2x).

## What a round writes

- Every answer goes to `answer_attempts` with `mode = 'game'`, like a study
  answer, and through `applyAnswer` so a wrong answer becomes a mistake with
  its review schedule. The study views, the 7-day accuracy and the streak all
  count that mode, so quiz play moves the readiness score.
- The finished round goes to `game_rounds` with `mode = 'quiz'`; the hub shows
  the best score from there.

## Rendering

The quiz shows the official picture from the question bank: `AspectImage`
with the file looked up in `data/imageManifest.js` by the question's `obrazok`
key. It does not draw the vector scenes; those are the runner's and the drive
log's. Redrawing the quiz with `components/game/IntersectionScene.tsx` and the
scenes in `data/game/scenes.json` would be a natural next step, since 39 of
the 88 situations already have a scene.

## Relationship to the runner

The quiz keeps the exam's conventions exactly: it asks for the official
answer, including the cases where the runner deliberately behaves differently
(see the last section of `priority-rules.md`). Keep it that way. If the engine
stops reproducing an official answer, `__tests__/scenes.test.js` fails.
