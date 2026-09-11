# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Driver SK** — an offline-first Slovak driving-license study app, with English and Hungarian translations of the same question bank. Expo SDK 54 / React Native 0.81 / React 19 / expo-router (file-based routing) / NativeWind (Tailwind for RN). Bundle id `com.smartie.driver` on both platforms.

## Commands

```bash
npm install
npx expo start                                      # Metro + dev menu (chooses iOS sim / Android emulator)
npx expo run:ios --device <UDID> --configuration Release    # build + install on a connected sim or device
npx expo run:android --variant release              # build + install on a running emulator/device

npm test                                            # full Jest suite
npx jest __tests__/<file>.test.js                   # single test file
npx jest -t "<name pattern>"                        # single test by name

npm run lint                                        # expo lint (eslint)
npx tsc --noEmit                                    # type-check (not enforced in build; see Conventions)

npm run bump:ios                                    # bump iOS build number before each TestFlight upload

npm run build:web                                   # PWA: expo export -p web + service worker into dist/
npm run serve:web                                   # serve dist/ locally with the COOP/COEP headers the DB needs
vercel --prod                                       # deploy dist/ to driver.smartie.team (see docs/pwa.md)

cd .maestro && maestro test .                       # E2E suite (see .maestro/README.md for env setup)
```

PostHog setup is optional: `cp .env.example .env` and fill `EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST`. Without it, analytics is a no-op.

## Architecture

### Routing
File-based via expo-router. Top-level screens live at `app/<screen>.tsx` (`onboarding`, `language`, `home`, `study`, `mistakes`, `mock`, `stats`, `settings`). `app/index.tsx` is a ~4.5 s intro animation that routes to `/home` (onboarded) or `/onboarding` (fresh). `app/_layout.tsx` runs migrations and an initial notification sync at startup.

### Languages
`1 = Slovak`, `2 = English`, `3 = Hungarian`. Language is auto-detected from device locale by `src/lib/settings.js` (`detectLanguageFromDevice`) and overridden by the user on the language screen. All UI strings live in `src/i18n/strings.js`; access them with `t(key, lang)` from `src/i18n/i18n.js`. The whole question bank is translated through these three indexes.

### Data layer — event-sourced SQLite

The DB is **the** source of truth; AsyncStorage is legacy. The design (see `docs/sqlite-schema.md`) is event-sourcing: every answer is written to `answer_attempts`, and every aggregate (daily, per-category, study totals, mock stats) is a SQL **view** over that table. There are *no* aggregate tables. Tables: `settings`, `category_selections`, `mistakes`, `study_sessions`, `mock_exams`, `answer_attempts`. Views: `v_questions_seen`, `v_daily_stats`, `v_category_stats`, `v_study_stats`, `v_mock_stats`.

- `src/db/index.ts` — opens SQLite at module load (`openDatabaseSync('driver.db')`) and creates the Drizzle instance. Both `database` (raw) and `db` (Drizzle) are exported.
- `src/db/migrate.ts` — hand-written raw-SQL `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` migrations. Runs from `app/_layout.tsx` at startup. **Errors are currently swallowed**; if a migration fails, the app continues against a partial schema.
- `src/db/schema/*.ts` — Drizzle schema, used *for query typing only*.
- `src/db/queries/*.ts` — query helpers that mix Drizzle (`db.select()`, `db.insert()`) and raw `database.getAllAsync(...)`.

**Two sources of schema truth.** `drizzle-kit` is installed but no Drizzle-generated migrations exist. If you change a table shape, update **both** the Drizzle schema file *and* `migrate.ts`; they drift silently otherwise.

### Readiness score and forecast (`src/lib/readiness.js`)

`scoreComponents()` is the single weighted formula (mistakes 30 / 7-day accuracy 25 / mock 30 / coverage 15). `stats.js`'s `calculateReadinessScore` and `getReadinessBreakdown` delegate to it. **"Ready" means score ≥ 97** (`READY_THRESHOLD`); labels: ready ≥ 97, almostReady ≥ 85, gettingThere ≥ 60, else needsWork (`getReadinessLabel`).

`getReadinessForecast(lang, { useConservative, examDate })` runs `simulateDaysToReady`, a deterministic expected-value simulation of Smart Practice day by day (due mistakes first, then unseen; accuracy improves at the measured weekly trend clamped 0..5 pts, or +2/week; mocks taken once accuracy ≥ 92) until the score crosses 97, capped at `MAX_FORECAST_DAYS` (90). Pace = attempts over the last 14 calendar days, `DEFAULT_PACE` 30 when there is no history. With an `examDate` it also returns `daysUntilExam`, `requiredPace` (binary search) and `onTrackForExam`. `blockers` lists what still stands in the way (`unseen`, `mistakes`, `accuracy`, `mocks`); the stats screen renders them.

### Real exam results (`exam_results` table)

`app/exam.tsx` records the outcome of the real exam (pass/fail, points 0..100, date) via `src/db/queries/examResults.ts`; one row per attempt, never updated. The readiness score at save time is stored for calibration and sent to PostHog as `exam_result_recorded`. A pass turns all reminder slots off and clears `settings.exam_date`. Home shows a "Did you take the exam?" card once the exam date has passed with no result recorded on or after it, and swaps the readiness section for a "passed" card after a pass.

### Crossings minigame (`src/lib/priority/`, `app/crossing.tsx`)

The real game. `engine.js` is a pure priority resolver for a scene (format in `docs/game/scene-format.md`): police and lights first, then entries from non-roads, signs (side road waits for every main-road vehicle except a road-swapping pair), the right-hand rule, left turn yields to oncoming and to trams, a tram turning across parallel traffic, roundabouts (roundabout sign alone = right-hand rule, with yield/stop = ring first), pedestrians, emergency vehicles. `geometry.js` decides whether two movements interact (five conflict cells plus the exam's conventions: opposite lefts pass, turning into an arm the other vehicle comes from counts as meeting it). Every rule is cited in `docs/game/priority-rules.md` (zákon 8/2009, vyhláška 30/2020). `data/game/scenes.json` holds all 39 exam pictures as scenes; `__tests__/scenes.test.js` fails if the engine stops reproducing an official answer, so change the engine only with that suite green. `generator.js` makes seeded random scenes by level band; `layout.js` is the shared top-down coordinate system for the SVG layers in `components/game/` (`JunctionStatic`, `VehicleSprite` with blinkers, `PathArrow`, `WorldScene` with the scrolling camera, `IntersectionScene` for a single junction) and for the car animation. `world.js` is the endless run: junctions are placed along your exit direction (the frame rotates with you) at `spacingFor(level)` so roughly `SECONDS_BETWEEN` of driving separates two lines whatever the speed, with `LEAD_ROAD` of open road before the first one; other vehicles are scheduled against your expected arrival so the last one with priority is still crossing when you get there (`decisionMarginFor(level)`), and vehicles with priority roll in visibly `ROLL_IN_MS` before they cross while yielding ones wait at their line. `step()` raises `crash` / `hesitated` / `late` / `redLight` / `passed` / `level` / `ringExit` events. Speed eases (`run.v` towards `run.speed` at `ACCEL`; a swipe to stop reacts at once: `SOFT_DECEL` down to `CREEP` of cruise speed with `run.brakeLights` on, then the `DECEL` curve into the line, a late swipe brakes at `HARD_DECEL`). A direction swipe while standing at the line also moves the car off (`moveOff`), and `youSignalFor(run)` gives your indicator: the set turn while approaching, the turn being made inside the box, the right blinker while leaving a roundabout up to the end of the exit bend. Controls are swipes only: down to give way, up to move off (the car never moves off by itself; waiting `LATE_MS` past clear is a `late` penalty, moving within `EARLY_BONUS_MS` earns a bonus; moving off is never a crash by itself, the crash check is at the box edge, so anticipating a crossing car is allowed), left or right to turn at the junction ahead (the car goes straight by default; where there is no straight ahead it waits at the line for a direction). In a roundabout (`junction.ring`) you keep circling: a right swipe arms the blinker and you leave at the next exit (`advanceRing` at each decision point, `ringExitOrder` in layout.js), a left swipe cancels; a full lap counts as `wrongWay`. "Cleared" is geometric (`conflict.js`: the other vehicle has passed the last point of its path within `CONFLICT_RADIUS` of yours), not the timeline's flat `CLEAR_FRACTION`. A vehicle the engine orders ahead of you whose path never meets yours (the exam's right-turn convention in geometry.js, a main-road car turning away, a tram from the right when you turn right) is not a blocker in the runner at all: nothing to wait for, no crash, no penalty, and it is left out of the record's reasons. The quiz keeps the exam ordering. Roads with tram tracks are wider (`WIDE_HALF`, tracks at `TRACK_OFFSET` each side of the axis, car lanes at `laneOffset`); every geometry helper takes the scene, and `boxHalf(scene, arm)` is the crossing box's half extent along an arm. The instructor is silent for straight on except when the main road you are on bends away (`kind: 'straight'`). Only the previous junction onwards is drawn (`visibleJunctions`), so a route that loops back never shows stale frames; vehicles carry `progress` so `PathArrow` draws only the part still ahead of them; followers keep `rollIn` 0 so they never jump back to their approach. Traffic lights cycle in the runner: the generator's lights scenes encode the phase in which you go, `control.crossFirst` says whether the cross road has its green before you, and `lightState(junction, now)` gives red / red+yellow / green / yellow per arm (`ALL_RED_MS` between the cross traffic clearing and your green); entering on red is a `redLight` penalty. Roundabout paths in `layout.js` join and leave the ring with tangential curves (`RING_JOIN_DEG`); the whole ring counts as the junction. Each junction carries an instructor direction (`junction.instruction`: left, right, straight, follow the main road, roundabout exit) shown when the junction is scheduled; taking another way is a `wrongWay` event. Changing the intended turn re-resolves priority for the real movement, sends any newly blocking vehicle off at once, and re-places the junctions after it along the new exit. A crash costs a life; a needless stop, a late start, a red light or a wrong turn costs the points and the streak. A first run (`run.coach`, no rounds played yet) runs the first three junctions at 60% speed with on-screen hints. `timeline.js` keeps the per-scene helpers (durations, clear fraction, poseAt). Rounds go to `game_rounds` with `mode = 'crossing'`. Every junction driven also produces `junctionRecord()` (attached to the `crash` and `passed` events): outcome flags, instruction, the way taken, the priority reasons involving you, and a drawable scene. `app/crossing.tsx` stores them in `crossing_log` (`src/db/queries/crossingLog.ts`, purged to the newest 300 per language), lists the run's junctions on the game-over card, and `app/crossing-log.tsx` is the drive log: `IntersectionScene` thumbnails with `explainRecord()` (`src/lib/crossingLog.js`) turning the record into an outcome label, a headline and one sentence per rule, using the `rule.*` and `crossing.log.*` strings. The screen keeps the instructor bar above the road (never over it, coach hints included) and the scene takes all the height left below it. Painted lane markings (give-way triangle, STOP text) and a three-lamp light head per arm show which road each sign or light belongs to; in the runner only your own arm's signs face you (`ownArm="S"`), the other arms show grey sign backs whose shape still says yield / STOP / main road. Path arrows are drawn only for vehicles on screen and start at the vehicle. The drive log groups junctions by run (newest run expanded, older ones collapsed) and `components/game/RecordModal.tsx` opens any junction full size. Dev aid: `driver://crossing?seed=N&level=M` replays a known road (iOS asks "Open in Driver SK?" first).

### Exam-picture quiz (`src/lib/game.js`, `app/game-quiz.tsx`)

A timed game built from the 88 intersection situations (questions whose image is under `obr3/ds/` or `2023/*_DS*`). `classifyQuestion` turns each one into an interaction from its answer texts alone: `order` (tap vehicles in crossing order), `pick` (tap the vehicle, paired "at the same time as" answers become two-colour chips), `ordinal` (first/second/last), or `choice` (plain three-answer fallback for reason-based questions). Rounds are `ROUND_SIZE` 10 with `LIVES` 3 and `TIME_LIMIT_MS` 20 s; `scoreAnswer` gives 100 base plus a linear speed bonus, times a streak multiplier capped at 2x. Every answer is logged to `answer_attempts` with `mode = 'game'` and goes through `applyAnswer` for mistakes; the study views, 7-day accuracy, and streak count that mode. Finished rounds land in `game_rounds` with `mode = 'quiz'`. `app/game.tsx` is the hub that offers both games. Free on every platform.

### Smart Practice (`src/lib/smartPractice.js`)

`getSmartQuestion({ lang, selectedCategory, recentIds })` picks the next study question via a 4-tier priority:

1. **Mistakes** — due-first (sorted by `next_review_at` from `MistakesDB.getMistakes`).
2. **Shaky** — accuracy ∈ [0.3, 0.7] AND (slow > 15 s OR stale > 7 d), not already a mistake.
3. **Unseen** — questions not in `answer_attempts`.
4. **Weak category** — from `stats.study.byCategory`, lowest-accuracy bucket first.
5. Random fallback (filtered by selected category if any).

`MIN_GAP` constants prevent the same qid from being picked again until ≥N other questions have been shown. The "recent" window is 20 items, maintained by `pushRecent` in the caller.

### Assets, images, and the Android id collision gotcha

Images are required via `data/imageManifest.js` (~250 entries) and looked up by string key. The question bank in `data/data5.js` (4.8 MB) references those keys via the `obrazok` field on each question.

**Gotcha:** React Native's Android resource-id function *strips* `-` (it does **not** replace it with `_`), so two sibling files like `data/minv_images/obr3/dz/1-11.png` and `data/minv_images/obr3/dz/111.jpg` collapse to the same id `data_minv_images_obr3_dz_111` and the Android build fails on duplicate resources. Six PNGs in that directory have been renamed `-` → `_` to break the collision; their **lookup keys in `imageManifest.js` were left unchanged** so call sites that reference `"obr3/dz/1-11.png"` still resolve. If you add new images here with a hyphen, watch for the same collision pattern.

### Notifications

`src/lib/notifications.ts` schedules **local** study reminders at 08:30 / 12:30 / 19:00 for the next 14 days. There is **no remote push** — no token registration, no server. The `aps-environment=development` entitlement in `ios/DriverSK/DriverSK.entitlements` is unused. `expo-notifications` 0.32 requires the typed `DateTriggerInput` (`{ type: SchedulableTriggerInputTypes.DATE, date }`), not a raw `Date`. `home.tsx`, `settings.tsx`, `language.tsx`, and `_layout.tsx` all call `syncNotificationsWithCurrentSettings()` on focus/launch; `sync` starts with `cancelAllScheduledNotificationsAsync()`, so anything you schedule outside that flow can be wiped by the next focus.

### PWA (web target)

The same code ships as an installable, offline PWA at `driver.smartie.team` (Vercel). `docs/pwa.md` is the full guide. What matters when touching code:

- **SQLite on web** runs in a Worker with SharedArrayBuffer, so the page must be cross-origin isolated (`vercel.json` and `scripts/serve-web.mjs` send COOP/COEP). `index.js` is the app entry: on web it warms the SQLite worker with one async open before loading expo-router, because the sync `openDatabaseSync` gives up on a cold worker.
- **One tab at a time.** `public/index.html` holds a Web Lock for the page lifetime; a second tab shows an overlay until the first closes. A full-page navigation in the same tab can show that overlay for a few seconds while the old document releases the lock.
- `web.output` is `single` (client rendering only). `public/index.html` is the HTML template; `scripts/build-web.mjs` generates `dist/sw.js` (full precache, network-first navigations) from `scripts/sw.template.js`.
- Web-only differences: notification rows hidden, purchases skipped (everything free), `components/InstallHint.tsx` on home, `components/ui/date-field.web.tsx` renders a browser date input, `Screen` centres content at 480 px on wide viewports.

### Native projects (CNG)

`/ios` and `/android` are **gitignored** — both are generated by `expo prebuild`. `app.json` is the source of truth (bundle id, plugins, splash, etc.). Never run `expo prebuild --clean` without expecting to lose manual native customizations (Xcode signing, entitlements). After a fresh `expo prebuild -p android`, copy `assets/images/icon.png` to `android/app/src/main/res/drawable/splashscreen_logo.png` (the splash plugin has no `image` configured, so styles.xml references a drawable that isn't generated — see `.maestro/README.md` for the workaround).

iOS uses Apple team `DBPU7PVUBJ`. TestFlight deploy details (archive without API-key signing flags; upload via `xcrun altool` with the API key) are in the memory note `ios-deploy-workflow.md` — re-read it when shipping.

### Testing

- **Jest** — `jest.setup.js` mocks AsyncStorage, `expo-sqlite`, and `drizzle-orm/expo-sqlite` so any suite that transitively imports `src/db/index` can load. New tests that touch DB-backed modules should rely on those global mocks and add per-test `jest.mock` for specific query modules.
- **Maestro E2E** in `.maestro/` — five flows (`01_smoke`, `02_onboarding`, `03_navigation`, `04_study`, `05_settings`) running on iOS simulators and Android emulators. **Selector convention:** every interactive element has a `testID` equal to the **i18n key** of its label (e.g. `testID="home.smartStudyCta"`, `testID="settings.notificationsMorning"`), and every `<Screen>` carries `testID="screen.<name>"` for "are we here" assertions. This makes flows language-independent. The `testID` prop is threaded through the shared UI primitives in `components/ui/`. Re-recordings are committed at `.maestro/recordings/`.

### Conventions / pitfalls

- **UI primitives** (`components/ui/{button,card,screen,header,text,divider}.js`) are plain JavaScript. Their destructured params lack defaults, which makes TypeScript infer many props as **required** in the .tsx consumers (~400 `tsc --noEmit` errors). Builds still work — Babel strips types — but treat `tsc` output as a noisy guide, not a gate. When you must add a new prop, add it to the primitive's destructure and pass it through.
- **Drizzle vs raw SQL.** Both `db.<op>` and `database.<op>` are valid in queries. Drizzle is preferred for new code; raw `database.execSync` / `getAllAsync` is used where parameterized SQL is easier or where views are queried.
- **Metro's file watcher does not work on this Mac.** After editing source, restart the dev server with `npx expo start --clear`; otherwise the simulator keeps running the old bundle and screenshots lie.
- **Dialogs.** `Alert.alert` does nothing on web. Use `confirmDialog` / `alertDialog` from `src/lib/dialog.ts` for anything that must also work in the PWA.
- **i18n helpers.** `tf(key, lang, vars)` substitutes `{name}` placeholders; `tp(keyBase, lang, n, vars)` picks `.one` / `.few` (Slovak 2..4) / `.many`. `__tests__/i18n.test.js` fails if any key lacks one of the three languages or a plural sibling.
- **Don't use `git add -A` / `git add .`** — there are local artifacts (`build/`, `data/env/`, the App Store Connect `.p8`) that should not be staged. Add specific paths.
- **The user works direct to `main` and wants every completed change committed and pushed without asking** — see the memory note `feedback_commit_push.md`.
