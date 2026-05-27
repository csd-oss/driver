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

### Native projects (CNG)

`/ios` and `/android` are **gitignored** — both are generated by `expo prebuild`. `app.json` is the source of truth (bundle id, plugins, splash, etc.). Never run `expo prebuild --clean` without expecting to lose manual native customizations (Xcode signing, entitlements). After a fresh `expo prebuild -p android`, copy `assets/images/icon.png` to `android/app/src/main/res/drawable/splashscreen_logo.png` (the splash plugin has no `image` configured, so styles.xml references a drawable that isn't generated — see `.maestro/README.md` for the workaround).

iOS uses Apple team `DBPU7PVUBJ`. TestFlight deploy details (archive without API-key signing flags; upload via `xcrun altool` with the API key) are in the memory note `ios-deploy-workflow.md` — re-read it when shipping.

### Testing

- **Jest** — `jest.setup.js` mocks AsyncStorage, `expo-sqlite`, and `drizzle-orm/expo-sqlite` so any suite that transitively imports `src/db/index` can load. New tests that touch DB-backed modules should rely on those global mocks and add per-test `jest.mock` for specific query modules.
- **Maestro E2E** in `.maestro/` — five flows (`01_smoke`, `02_onboarding`, `03_navigation`, `04_study`, `05_settings`) running on iOS simulators and Android emulators. **Selector convention:** every interactive element has a `testID` equal to the **i18n key** of its label (e.g. `testID="home.smartStudyCta"`, `testID="settings.notificationsMorning"`), and every `<Screen>` carries `testID="screen.<name>"` for "are we here" assertions. This makes flows language-independent. The `testID` prop is threaded through the shared UI primitives in `components/ui/`. Re-recordings are committed at `.maestro/recordings/`.

### Conventions / pitfalls

- **UI primitives** (`components/ui/{button,card,screen,header,text,divider}.js`) are plain JavaScript. Their destructured params lack defaults, which makes TypeScript infer many props as **required** in the .tsx consumers (~400 `tsc --noEmit` errors). Builds still work — Babel strips types — but treat `tsc` output as a noisy guide, not a gate. When you must add a new prop, add it to the primitive's destructure and pass it through.
- **Drizzle vs raw SQL.** Both `db.<op>` and `database.<op>` are valid in queries. Drizzle is preferred for new code; raw `database.execSync` / `getAllAsync` is used where parameterized SQL is easier or where views are queried.
- **Don't use `git add -A` / `git add .`** — there are local artifacts (`build/`, `data/env/`, the App Store Connect `.p8`) that should not be staged. Add specific paths.
- **The user works direct to `main` and wants every completed change committed and pushed without asking** — see the memory note `feedback_commit_push.md`.
