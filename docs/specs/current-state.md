# CURRENT STATE SPECIFICATION — Driver SK (Slovakia Driving Exam App)

**Last Updated:** September 19, 2026  
**App Version:** 1.0.0 (`app.json`), iOS build 21  
**Status:** Shipping on iOS, Android, and the web as an installable PWA

---

## EXECUTIVE SUMMARY

**Driver SK** is an Expo React Native application that helps people prepare for the Slovak driving licence theory exam. It offers the whole official question bank, adaptive study with intelligent question selection, mistake tracking with spaced repetition, mock exam simulation, a composite exam-readiness score with a day-by-day forecast, a place to record the outcome of the real exam, two intersection-priority games with a teaching guide, and three languages (Slovak, English, Hungarian). Everything works offline: the question bank and its images ship with the binary, and all user data lives in a local SQLite database driven through Drizzle ORM, with every answer logged as an event so that every aggregate can be a SQL view.

The same codebase ships to iOS, Android, and — as an installable, offline PWA at `driver.smartie.team` — the web.

---

## 1. BUSINESS CONTEXT

### 1.1 Product Purpose
- **Primary Goal:** Enable users to study and practice for Slovakia driving license theoretical exams
- **Target Audience:** Aspiring drivers preparing for their driving license exam in Slovakia
- **Value Proposition:** 
  - Offline-first learning experience
  - Official exam questions and answers
  - Adaptive learning through Smart Practice Mode (intelligent question prioritization)
  - Mistake tracking with mastery system
  - Multi-language support for diverse learners
  - Realistic mock exam simulation

### 1.2 Core Features (Implemented)
1. **Onboarding Experience** - Six-slide onboarding with animated dot indicators, a Slovakia-branded first slide, and a notifications slide that makes the permission ask
2. **Smart Study** - Adaptive question selection prioritising mistakes, shaky questions, unseen questions, and weak categories
3. **Smart Study Reason Labels** - Visual indicators explaining why each question was selected (mistake, shaky, new question, weak area, review)
4. **Mistakes Review** - Focused practice on incorrectly answered questions, scheduled by spaced repetition
5. **Mock Exams** - Full exam simulation with timer, scoring, and interactive results review
6. **Category Filtering** - Study by topic categories (e.g., traffic signs, rules)
7. **Progress Tracking** - Mistake tracking with a 0 → 1 → 3 → 7 day review ladder
8. **Statistics Dashboard** - Hero progress summary, coverage bar, 7-day activity bars, readiness breakdown, and the forecast
9. **Exam Readiness Score** - Composite metric (0-100%) combining mistakes, performance, mock exams, and coverage, with configurable calculation modes
10. **Readiness Forecast and Exam-Date Planning** - Estimated days until "ready", a countdown to a user-set exam date, the daily pace that date needs, and the list of remaining blockers
11. **Real Exam Results** - Record pass/fail and points for the actual exam; the readiness score at save time is stored for calibration
12. **Crossings Minigame** - An endless swipe-driven junction runner built on a pure right-of-way engine, with a twelve-lesson guide and a per-junction drive log
13. **Exam-Picture Quiz** - A timed game built from the official intersection pictures
14. **Multi-language Support** - Slovak (1), English (2), Hungarian (3)
15. **Offline Operation** - All data and images stored locally; the web build precaches everything into a service worker
16. **Question Detail Modal** - Interactive review of wrong answers with full question context
17. **Local Study Reminders** - Up to three daily notification slots, scheduled locally (no server, no push)
18. **Subscription Gating** - Smart Study and Mistakes sit behind a RevenueCat entitlement on iOS; everything is free on Android and web
19. **Analytics** - PostHog, opt-out in Settings, and entirely absent when the keys are not configured

### 1.3 Business Rules
- **Scoring:** Each question has point value (`body`), exam pass threshold is `minbody` points
- **Answer Format:** 1-based indexing (answers are 1, 2, or 3)
- **Mistake Removal:** A mistake is reviewed on a spaced-repetition ladder — a correct answer moves its interval 0 → 1 → 3 → 7 days; a correct review at 7 days removes it; a wrong answer resets it to 0 and makes it immediately due
- **Readiness:** "Ready" means a score of **97 or more** (`READY_THRESHOLD`); labels are ready ≥ 97, almostReady ≥ 85, gettingThere ≥ 60, otherwise needsWork
- **Real Exam:** 100 points maximum, 90 to pass (`DEFAULT_MAX_POINTS` / `DEFAULT_MIN_TO_PASS`); one row per attempt, never updated. Passing turns every reminder off and clears the exam date
- **Language Isolation:** Progress (mistakes/streaks) is tracked separately per language
- **Category Persistence:** Selected category preference is saved per language

---

## 2. LOGICAL CONTEXT & USER FLOWS

### 2.1 Application Flow

```
App Launch (app/_layout.tsx: migrations + settings, then the tree mounts)
  ├─ Check hasOnboarded flag
  │   ├─ false → IntroAnimation → Onboarding (6 slides) → LanguageSelect → [Paywall] → Home
  │   └─ true → Home (direct; gated features present the paywall on tap)
  │
  ├─ Onboarding Screen (first-time users)
  │   ├─ 6 swipeable slides with animated dot indicators
  │   ├─ Skip button (top right) to exit early
  │   ├─ Change Language link (top left) → LanguageSelect (returns to onboarding)
  │   ├─ Next/Previous buttons for navigation
  │   ├─ Tappable dots to jump to specific slides
  │   └─ Get Started on the notifications slide → asks for permission → LanguageSelect / Home
  │
  ├─ LanguageSelect — two steps: tap a language, then Continue
  │
  └─ Home Screen
      ├─ Your Progress Card (readiness + forecast + exam countdown + accuracy + streak) → Stats
      ├─ "Did you take the exam?" card (only once the exam date has passed) → ExamResult
      ├─ Who goes first? → GameHub → Crossings runner / Guide / Drive log / Picture quiz
      ├─ Install hint (web only)
      ├─ Mock Exam → MockScreen (full exam simulation)
      ├─ Mistakes → MistakesScreen (PRO) (review incorrect answers)
      ├─ Smart Study → StudyScreen (PRO) (adaptive question selection)
      └─ Settings (gear, top right) → SettingsScreen
```

Reset Progress moved off Home: it lives at the bottom of Settings and goes through a confirm dialog.

### 2.2 Study Mode Flow
1. User selects Smart Study from Home
2. Screen loads current language and progress
3. Category selector displayed (default: "All")
4. Smart Study algorithm selects question using priority system:
   - **Priority 1:** Questions from the mistakes list, due first (ordered by `next_review_at`)
   - **Priority 2:** Shaky questions — accuracy between 0.3 and 0.7 **and** either slow (> 15 s) or stale (> 7 days), and not already a mistake
   - **Priority 3:** Unseen questions (never answered before)
   - **Priority 4:** Questions from the weakest category (lowest accuracy)
   - **Priority 5:** Random fallback (if all above exhausted)
   - Category filter applied at each priority level
   - **Anti-repetition:** Two-tier system prevents frequent repetition:
     - First excludes last 20 questions shown
     - If all candidates are recent, applies minimum gap (15 for mistakes, 5 for others)
     - If all within minimum gap → skips to next priority
5. User selects answer → immediate feedback (Correct/Wrong) plus a success/error haptic
6. Progress updated:
   - Wrong answer → added to mistakes (or reset to interval 0 and made due now), streak reset
   - Correct answer → if in mistakes, the review interval advances 0 → 1 → 3 → 7 days; a correct review at 7 removes it
7. "Next" button loads new question via Smart Practice algorithm

### 2.3 Mistakes Review Flow
1. User selects Mistakes from Home (gated behind the Pro entitlement on iOS)
2. Screen loads the **due** mistakes for the current language — `MistakesDB.getMistakes(lang)` returns only rows whose `next_review_at` is null or in the past, ordered due-first
3. Category filter applied (if selected)
4. Mistakes shuffled for random order
5. One question displayed at a time
6. User answers → feedback and a haptic → progress updated
7. A correct review advances the interval; a correct review at 7 days removes the question from the list automatically
8. Empty states are explicit: the zero-mistakes state offers Smart Study and Mock as next steps, and the category-empty state offers "Show all"

**Note:** the count on Home comes from `getMistakesCount(lang)`, which counts *every* mistake row, while this screen lists only the due ones. A user with open mistakes that are all scheduled for a future day therefore sees a non-zero count on Home and the empty state here.

### 2.4 Mock Exam Flow
1. User selects Mock Exam from Home — the one study feature that is **not** behind the paywall
2. Random test selected from official test bank
3. Timer starts (if test has time limit)
4. Questions displayed one at a time with navigation bar
5. User navigates between questions, answers stored. Leaving the screen with an exam in progress raises a confirm dialog before it finishes early
6. "Finish" button calculates score:
   - Score = sum of points for correct answers
   - Pass = score ≥ test.minbody
7. Results screen shows:
   - Pass/Fail status
   - Score breakdown
   - Per-question correctness list (large, button-like items)
8. Interactive wrong answers:
   - Wrong answer items are clickable (Pressable)
   - Tapping opens detail modal showing:
     - Original question text and image
     - All answer options with visual indicators:
       - Green background for correct answer (labeled "✓ Correct Answer")
       - Red/purple background for user's wrong answer (labeled "✗ Your Answer")
       - Neutral styling for other incorrect options
   - Modal respects safe zones (notch area)
   - Images fill full modal width
   - Smooth scrolling for long content
9. Options:
   - "Add wrong to mistakes" → adds incorrect answers to mistakes list
   - "New mock exam" → starts fresh exam

### 2.5 Data Flow

**Database Architecture:**
The app uses SQLite with Drizzle ORM for all persistent data storage. All user-generated data is stored in normalized relational tables with proper foreign keys and indexes.

**Settings Storage (`settings` table):**
```
SQLite → settings (single row, id=1)
  ├─ lang: integer (1-3)
  ├─ has_onboarded: boolean
  ├─ has_chosen_language: boolean
  ├─ use_conservative_readiness: boolean (default: false)
  ├─ analytics_opt_out: boolean (default: false)
  ├─ notification_morning_enabled: boolean (default: true)
  ├─ notification_lunch_enabled: boolean (default: true)
  ├─ notification_evening_enabled: boolean (default: true)
  ├─ exam_date: timestamp | null (the user's real exam date)
  ├─ has_finished_guide: boolean (default: false — the crossing guide has been completed once)
  ├─ created_at: timestamp
  └─ updated_at: timestamp
```

**Category Selections (`category_selections` table):**
```
SQLite → category_selections (one row per language)
  ├─ lang: integer (1, 2, or 3)
  └─ categoryText: text (default: 'all')
```

**Progress Storage (`mistakes` table):**
```
SQLite → mistakes
  ├─ id: text (UUID, sync-ready)
  ├─ deviceId: text (device identifier)
  ├─ lang: integer (1, 2, or 3)
  ├─ questionId: text (qid from question bank)
  ├─ streakCount: integer (consecutive correct answers)
  ├─ nextReviewAt: timestamp | null (null = due now)
  ├─ intervalDays: integer (0, 1, 3, or 7)
  ├─ createdAt: timestamp
  ├─ updatedAt: timestamp
  └─ syncedAt: timestamp | null (for future cloud sync)
```

**Answer Attempts (`answer_attempts` table):**
```
SQLite → answer_attempts (complete history log)
  ├─ id: text (UUID, sync-ready)
  ├─ deviceId: text
  ├─ lang: integer
  ├─ questionId: text
  ├─ mode: text ('study' | 'mock' | 'mistakes' | 'game')
  ├─ sessionId: text (FK to study_sessions, nullable)
  ├─ mockExamId: text (FK to mock_exams, nullable)
  ├─ categoryText: text (nullable)
  ├─ selectedAnswerIndex: integer (1, 2, or 3)
  ├─ correctAnswerIndex: integer (1, 2, or 3)
  ├─ isCorrect: boolean
  ├─ points: integer
  ├─ questionShownAt: timestamp
  ├─ answerSubmittedAt: timestamp
  ├─ responseTimeMs: integer (calculated timing)
  ├─ wasInMistakes: boolean
  ├─ createdAt: timestamp
  └─ syncedAt: timestamp | null (for future cloud sync)
```

**Mock Exams (`mock_exams` table):**
```
SQLite → mock_exams
  ├─ id: text (UUID, sync-ready)
  ├─ deviceId: text
  ├─ lang: integer
  ├─ testId: text ("L{lang}-T{testIndex}")
  ├─ startedAt: timestamp
  ├─ completedAt: timestamp | null
  ├─ durationSec: integer | null
  ├─ score: integer | null
  ├─ maxScore: integer
  ├─ minToPass: integer
  ├─ passed: boolean | null
  ├─ wrongCount: integer | null
  ├─ addedToMistakesCount: integer (default: 0)
  ├─ createdAt: timestamp
  └─ syncedAt: timestamp | null
```

**Study Sessions (`study_sessions` table):**
```
SQLite → study_sessions
  ├─ id: text (UUID, sync-ready)
  ├─ deviceId: text
  ├─ lang: integer
  ├─ mode: text ('study' | 'mistakes')
  ├─ categoryText: text | null
  ├─ startedAt: timestamp
  ├─ endedAt: timestamp | null
  ├─ questionsCount: integer (default: 0)
  ├─ correctCount: integer (default: 0)
  └─ syncedAt: timestamp | null
```

**Real Exam Results (`exam_results` table):**
```
SQLite → exam_results (one row per attempt, never updated)
  ├─ id: text (UUID, sync-ready)
  ├─ deviceId: text
  ├─ lang: integer
  ├─ passed: boolean
  ├─ points: integer (0..maxPoints)
  ├─ maxPoints: integer (default: 100)
  ├─ minToPass: integer (default: 90)
  ├─ readinessScore: integer | null (the score at the moment of saving, for calibration)
  ├─ takenAt: timestamp (the exam date)
  ├─ createdAt: timestamp
  └─ syncedAt: timestamp | null
```

**Game Rounds (`game_rounds` table):**
```
SQLite → game_rounds (one row per finished round)
  ├─ id: text (UUID, sync-ready)
  ├─ deviceId: text
  ├─ lang: integer
  ├─ mode: text ('quiz' = exam-picture quiz, 'crossing' = junction runner)
  ├─ score: integer
  ├─ correctCount: integer
  ├─ total: integer
  ├─ durationSec: integer | null
  ├─ createdAt: timestamp
  └─ syncedAt: timestamp | null
```

**Crossing Drive Log (`crossing_log` table):**
```
SQLite → crossing_log (one row per junction driven)
  ├─ id: text (UUID, sync-ready)
  ├─ deviceId: text
  ├─ lang: integer
  ├─ runId: text (groups the junctions of one run)
  ├─ outcome: text
  ├─ points: integer
  ├─ record: text (JSON — the scene plus the priority reasons, so the log can redraw it)
  ├─ createdAt: timestamp
  └─ syncedAt: timestamp | null
```
Purged to the newest 300 rows per language (`LOG_KEEP`) at the end of each run.

**Statistics (Computed from Database Views):**
All statistics are computed on-demand from `answer_attempts` and `mock_exams` tables using SQL views:
- `v_study_stats` - Lifetime study statistics (attempts, correct, wrong)
- `v_daily_stats` - Daily aggregates, one row per language per local date
- `v_category_stats` - Per-category statistics with accuracy
- `v_mock_stats` - Mock exam aggregates (exams taken, passed, best/last score)
- `v_questions_seen` - Unique questions seen per language

`v_study_stats`, `v_daily_stats` and `v_category_stats` filter on `mode IN ('study', 'mistakes', 'game')`, as do the 7-day accuracy and streak queries in `src/db/queries/` — so the exam-picture quiz counts toward accuracy and the daily bars while mock-exam answers do not (a *passed* mock still counts as an active day for the streak). `v_questions_seen` has no mode filter, so mock answers do count toward coverage. All five views are dropped and recreated on every launch, so a changed definition takes effect without a version bump.

**Engagement Metrics:**
Computed from `answer_attempts`:
- `currentStreak` - Calculated from distinct study dates
- `lastStudyDate` - Most recent study date
- `lastOpenedDate` - Most recent activity date

**Question Data:**
```
data5.js → data[lang-1] → tests[] → test object
  ├─ pocet: number (question count)
  ├─ cas: number (time limit in seconds)
  ├─ minbody: number (pass threshold)
  ├─ maxbody: number (max points)
  ├─ otazky: { "1": [{id, text, body, obrazok, platna}], ... }
  ├─ odpovede: { "1": [{odpoved}], ... }
  └─ okruhy: { "1": [{txt, zacina}], ... } (categories)
```

---

## 3. TECHNICAL CONTEXT

### 3.1 Technology Stack

**Framework & Core:**
- **Expo SDK:** ~54.0.32
- **React:** 19.1.0
- **React Native:** 0.81.5
- **Expo Router:** ~6.0.22 (file-based routing)

**Navigation:**
- **@react-navigation/native:** ^7.1.28
- **@react-navigation/native-stack:** ^7.10.1
- **expo-router:** File-based routing with Stack navigator

**Styling:**
- **NativeWind:** ^4.2.1 (Tailwind CSS for React Native)
- **Tailwind CSS:** ^3.4.19

**Database & Storage:**
- **expo-sqlite:** ^16.0.10 (SQLite database for local storage; a Worker + SharedArrayBuffer on web)
- **drizzle-orm:** ^0.45.2 (Type-safe ORM for SQLite)
- **expo-crypto:** ^15.0.8 (UUID generation for sync-ready primary keys)
- **drizzle-kit:** ^0.30.6 (dev) (Migration generation and schema management)
- **@react-native-async-storage/async-storage:** 2.2.0 (DEPRECATED - used only for device ID caching)

**Internationalization:**
- **i18n-js:** ^4.5.1
- **expo-localization:** ~17.0.8

**UI/UX:**
- **expo-haptics:** ~15.0.8
- **expo-image:** ~3.0.11
- **react-native-safe-area-context:** ~5.6.0
- **react-native-reanimated:** ~4.1.1 / **react-native-worklets:** 0.5.1
- **react-native-svg:** ^15.15.5 (every frame of the crossings game and its drive log)
- **@react-native-community/datetimepicker:** 8.4.4 (exam date)
- **@expo/vector-icons** / **expo-symbols**

**Platform & Product Services:**
- **expo-notifications:** ~0.32.12 (local reminders only — no push, no token registration)
- **react-native-purchases** / **react-native-purchases-ui:** ^10.2.0 (RevenueCat, iOS only)
- **posthog-react-native:** ^4.27.0 (analytics; a no-op without `EXPO_PUBLIC_POSTHOG_KEY`)
- **expo-web-browser**, **expo-application**, **expo-device**, **expo-file-system**

**Platform Support:**
- iOS (new architecture enabled, `supportsTablet: false`)
- Android (edge-to-edge enabled)
- Web — `web.output: "single"`, a client-rendered SPA shipped as an installable PWA

### 3.2 Architecture Overview

**Pattern:** Component-based architecture with separation of concerns

**Layers:**
1. **Presentation Layer** (`app/`): Screen components using Expo Router
2. **Business Logic Layer** (`src/lib/`): Core functionality (bank, engine, settings, categories, readiness, smart practice, the two games)
3. **Domain Engine** (`src/lib/priority/`): The right-of-way resolver and the runner world, both pure and test-covered, with no React and no database
4. **Database Layer** (`src/db/`): SQLite with Drizzle ORM, typed queries, and the startup migration
5. **Data Layer** (`data/`): Static question data, the image manifest, and the exam-picture scenes
6. **UI Components** (`components/ui/`, `components/game/`): Reusable primitives and the SVG layers of the crossings game
7. **Platform Services** (`src/lib/{notifications,purchases,analytics,platform,dialog}.ts`): Everything that talks to the OS, the store, or the browser
8. **Storage Layer** (`src/lib/storage.js`): DEPRECATED - AsyncStorage wrapper (kept for backward compatibility)

### 3.3 File Structure

```
driver/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout: migrations, analytics gate, Stack navigator
│   ├── index.tsx                 # IntroAnimation screen (~0.8s wordmark, then routes)
│   ├── onboarding.tsx            # Onboarding flow (6 slides)
│   ├── language.tsx              # Language selection (pick, then Continue)
│   ├── home.tsx                  # Home screen (readiness + forecast + entry points)
│   ├── study.tsx                 # Study mode
│   ├── mistakes.tsx              # Mistakes review
│   ├── mock.tsx                  # Mock exam
│   ├── stats.tsx                 # Statistics dashboard
│   ├── settings.tsx              # Settings
│   ├── exam.tsx                  # Record the real exam result
│   ├── paywall.tsx               # One-shot RevenueCat paywall after onboarding (iOS)
│   ├── game.tsx                  # "Who goes first?" hub
│   ├── game-quiz.tsx             # Timed exam-picture quiz
│   ├── crossing.tsx              # Crossings runner (endless junction game)
│   ├── crossing-guide.tsx        # Twelve-lesson guide; must be finished before the runner
│   └── crossing-log.tsx          # Drive log: every junction driven, explained
│
├── src/
│   ├── db/                       # Database layer (SQLite + Drizzle)
│   │   ├── index.ts              # Database connection & initialization
│   │   ├── migrate.ts            # Migration runner (creates tables & views)
│   │   ├── utils.ts              # UUID generation utilities
│   │   ├── device.ts             # Device ID management
│   │   ├── schema/               # Drizzle table schemas (used for query typing only)
│   │   │   ├── index.ts          # Export all tables
│   │   │   ├── settings.ts       # Settings table
│   │   │   ├── categorySelections.ts
│   │   │   ├── mistakes.ts       # Mistakes table (sync-ready)
│   │   │   ├── answerAttempts.ts # Answer attempts table (sync-ready)
│   │   │   ├── mockExams.ts      # Mock exams table (sync-ready)
│   │   │   ├── studySessions.ts  # Study sessions table (sync-ready)
│   │   │   ├── examResults.ts    # Real exam results (sync-ready)
│   │   │   ├── gameRounds.ts     # Finished game rounds (sync-ready)
│   │   │   └── crossingLog.ts    # Per-junction drive log (sync-ready)
│   │   ├── queries/              # Typed query functions
│   │   │   ├── settings.ts       # Settings CRUD
│   │   │   ├── categorySelections.ts
│   │   │   ├── mistakes.ts       # Mistake operations + spaced repetition
│   │   │   ├── attempts.ts       # Answer attempt logging
│   │   │   ├── mockExams.ts      # Mock exam operations
│   │   │   ├── studySessions.ts  # Study session management
│   │   │   ├── examResults.ts    # Real exam results
│   │   │   ├── gameRounds.ts     # Game round records and bests
│   │   │   ├── crossingLog.ts    # Drive log writes, reads, and purge
│   │   │   ├── stats.ts          # Statistics queries (uses views)
│   │   │   └── engagement.ts     # Streak calculations
│   │   └── views.sql             # SQL view definitions (reference copy; migrate.ts is authoritative)
│   ├── lib/                      # Business logic
│   │   ├── bank.ts               # Question bank helpers
│   │   ├── engine.js             # Learning engine (mistakes/streaks) - uses DB
│   │   ├── settings.js           # Settings management - uses DB
│   │   ├── storage.js            # DEPRECATED - AsyncStorage wrapper
│   │   ├── stats.js              # Statistics tracking - uses DB views
│   │   ├── readiness.js          # Score formula, forecast, exam-date maths
│   │   ├── categories.js         # Category helpers
│   │   ├── smartPractice.js      # Smart Practice algorithm - uses DB
│   │   ├── game.js               # Exam-picture quiz: classification and scoring
│   │   ├── crossingLog.js        # Turns a junction record into readable sentences
│   │   ├── notifications.ts      # Local study reminders
│   │   ├── purchases.ts          # RevenueCat wrapper (iOS only)
│   │   ├── analytics.ts          # PostHog helpers
│   │   ├── platform.ts           # Web/PWA helpers (install prompt, standalone)
│   │   ├── dialog.ts             # confirmDialog / alertDialog (work on web too)
│   │   ├── dates.ts, links.ts
│   │   └── priority/             # The crossings engine
│   │       ├── engine.js         # Pure right-of-way resolver for a scene
│   │       ├── geometry.js       # Whether two movements interact
│   │       ├── conflict.js, timeline.js, queue.js
│   │       ├── generator.js      # Seeded random scenes by level band
│   │       ├── layout.js         # Shared top-down coordinate system
│   │       ├── lessons.js        # The twelve fixed guide junctions
│   │       └── world.js          # The endless run: scheduling, lights, events
│   │
│   └── i18n/                     # Internationalization
│       ├── i18n.js               # t / tf / tp
│       └── strings.js            # Translation strings (all three languages)
│
├── components/
│   ├── ui/                       # UI primitives (TypeScript)
│   │   ├── screen.tsx            # Screen wrapper (centres at 480px on web)
│   │   ├── card.tsx, button.tsx, text.tsx, divider.tsx, header.tsx
│   │   ├── pressable-scale.tsx   # Reanimated press spring used by the above
│   │   ├── animated-bar.tsx      # Animated progress bar
│   │   ├── skeleton.tsx          # Pulsing loading placeholder
│   │   ├── aspect-image.tsx      # Question images at their natural aspect ratio
│   │   ├── date-field.tsx / date-field.web.tsx
│   │   └── icon-symbol.tsx / icon-symbol.ios.tsx
│   ├── game/                     # SVG layers for the crossings game
│   │   ├── WorldScene.tsx        # Scrolling camera over the road
│   │   ├── IntersectionScene.tsx # A single junction (used by the drive log)
│   │   ├── JunctionStatic.tsx, VehicleSprite.tsx, PathArrow.tsx
│   │   └── RecordModal.tsx, SwipeHint.tsx, roadShapes.ts, types.ts
│   ├── CategorySelector.tsx      # Category selection UI
│   ├── StatsOverviewSkeleton.tsx # Skeleton for the stats hero card
│   ├── InstallHint.tsx           # "Add to Home Screen" (web only)
│   ├── GameChip.tsx              # Vehicle chip used by the picture quiz
│   └── ErrorBoundary.tsx
│
├── data/
│   ├── data5.js                  # Official question data, ~4.8 MB (ES module)
│   ├── imageManifest.js          # Static image require map (~250 entries)
│   ├── minv_images/              # Local image files
│   └── game/scenes.json          # The 39 official exam pictures as scenes
│
├── drizzle/migrations/           # Drizzle-generated SQL — present but NOT executed
├── drizzle.config.ts             # Drizzle Kit configuration
├── scripts/
│   ├── genImageManifest.mjs      # Image manifest generator
│   ├── build-web.mjs             # PWA export + service worker generation
│   ├── sw.template.js            # Service worker template
│   ├── serve-web.mjs             # Local server with COOP/COEP headers
│   ├── bump-ios-build.js         # Bump ios.buildNumber
│   └── reset-project.js          # create-expo-app reset utility
│
├── public/index.html             # Web HTML template (one-tab lock, install capture)
├── vercel.json                   # Headers + SPA rewrites for the PWA
├── .maestro/                     # E2E flows (9 numbered + a reusable subflow)
├── __tests__/                    # Jest suites
├── contexts/FontScaleContext.tsx # Font scaling context
├── hooks/                        # use-color-scheme, use-large-text, use-theme-color
├── constants/theme.ts
└── assets/                       # Static assets
```

### 3.4 Key Implementation Details

#### 3.4.1 Navigation (Expo Router)
- **File-based routing:** Each screen is a file in `app/` directory
- **Stack Navigator:** Configured in `app/_layout.tsx`, which declares all 16 routes explicitly with `headerShown: false`
- **Startup gate:** `_layout.tsx` runs `runMigrations()` and reads settings before mounting the tree at all, so nothing renders against a missing schema and no analytics event can fire before the opt-out preference is known. The native splash covers that window. `paywall` is the only route with `gestureEnabled: false`
- **Conditional first screen:** `app/index.tsx` is always the entry route; it replaces itself with `/onboarding` or `/home` based on `hasOnboarded`
- **No headers:** All screens use custom Header component

#### 3.4.2 Question Bank System (`src/lib/bank.ts`)
- **Cached Indices:** Question indices cached per language for performance
- **Functions:**
  - `getTests(lang)` - Get all tests for language
  - `getRandomTest(lang)` - Random test selection
  - `getRandomTestWithIndex(lang)` - Random test with index for tracking
  - `getQuestionFromTest(test, qNo)` - Normalize question object
  - `flattenRandomQuestion(lang)` - Random question across all tests
  - `buildQuestionIndex(lang)` - Build qid → {testIndex, qNo} map
  - `findQuestionById(lang, qid)` - Fast question lookup
  - `getTestForQuestion(lang, qid)` - Get test for question (for categories)
  - `getTotalUniqueQuestions(lang)` - Get total count of unique questions

#### 3.4.3 Learning Engine (`src/lib/engine.js`)
- **Shape:** a single async `applyAnswer(state, lang, qid, isCorrect)`. The `state` argument is vestigial and ignored — the engine writes straight to the `mistakes` table
- **Logic:**
  - Wrong answer → `addMistake()`: insert if new, otherwise reset `streak_count`, `interval_days = 0` and `next_review_at = now`
  - Correct answer → `recordCorrectAnswer()`: advance the review interval 0 → 1 → 3 → 7 days and push `next_review_at` out by that many days; at 7 days the row is deleted (mastered)
- **Language-aware:** All operations scoped to language

#### 3.4.4 Category System (`src/lib/categories.js`)
- **Dynamic Computation:** Categories computed from `okruhy` data
- **Functions:**
  - `getCategories(lang)` - Extract category names from first test
  - `getCategoryForQuestion(test, qNo)` - Determine category by question number range
- **Storage:** Selected category persisted per language in settings
- **Filtering:** Study and Mistakes screens filter by selected category

#### 3.4.5 Smart Practice System (`src/lib/smartPractice.js`)
- **Adaptive Algorithm:** Priority-based question selection system
- **Main Function:**
  - `getSmartQuestion({ lang, selectedCategory, recentIds })` - Main entry point for smart question selection
  - **Return Shape:** Returns `{ question, reason }` object where:
    - `question`: Normalized question object
    - `reason`: Object with `type` (one of: `mistake`, `shaky`, `unseen`, `weak`, `random`) and optional `category` (for `weak` type)
- **Helper Functions:**
  - `pickFromMistakes(...)` - Priority 1: Select from the due mistakes, due-first
  - `pickShakyQuestion(...)` - Priority 2: Select a question that is half-learned (fed by `AttemptsDB.getQuestionPerformanceStats`)
  - `pickUnseen(...)` - Priority 3: Select questions never answered
  - `pickFromWeakCategory(...)` - Priority 4: Select from weakest category
  - `isRecent(qid, recentIds)` - Check if question is in recent list
  - `pushRecent(qid, recentIds, max=20)` - Add to recent list (maintains max size)
- **Priority System:**
  1. Mistakes (highest priority) - Questions user got wrong, ordered by `next_review_at` → reason type: `mistake`
  2. Shaky - Per-question accuracy in [0.3, 0.7] **and** (average response time > 15 s **or** last seen more than 7 days ago), excluding anything already in mistakes → reason type: `shaky`
  3. Unseen Questions - Questions never answered → reason type: `unseen`
  4. Weak Categories - Questions from categories with lowest accuracy → reason type: `weak` (includes category name)
  5. Random Fallback - Existing random selection if all above exhausted → reason type: `random`
- **Features:**
  - Category-aware: Respects selected category filter at each priority level
  - **Two-Tier Anti-Repetition System:**
    - **Tier 1:** Excludes last 20 questions shown (full recent window)
    - **Tier 2:** Minimum gap windows to prevent frequent repetition:
      - Mistakes: 15 questions minimum gap (prevents mistakes from appearing too frequently)
      - Unseen/Weak/Random: 5 questions minimum gap
    - If all candidates are within minimum gap → skips to next priority (prevents forced repetition)
  - Performance optimized: Uses cached indices, builds seen set once per session
  - Loads stats and progress internally for separation of concerns
  - **Reason Tracking:** Exposes selection logic as reason metadata for UI display

#### 3.4.6 Image Handling
- **Static Manifest:** `data/imageManifest.js` contains static `require()` calls
- **Generator:** `scripts/genImageManifest.mjs` scans `data/minv_images/` and generates manifest
- **Fallback:** Missing images show placeholder text (no crashes)
- **Format:** Supports .png, .jpg, .jpeg, .webp

#### 3.4.7 Localization (`src/i18n/`)
- **Simple System:** Key-based translation with language index (1-3)
- **Fallback:** Falls back to lang 1 if translation missing
- **Keys:** Organized by feature (home.*, study.*, mistakes.*, stats.*, readiness.*, settings.*, onboarding.*, language.*, etc.)
- **Languages:** Slovak (1), English (2), Hungarian (3)
- **Onboarding Strings:** Slide titles and descriptions, navigation buttons (Next, Previous, Skip, Get Started), change language link
- **Language Strings:** Selection title, description, language names, questions note
- **Readiness Strings:** Title, status labels (Ready / Almost ready / Getting there / Needs work), component names, weight labels, warnings, plus the `forecast.*` family for the day estimate and exam countdown
- **Plurals and placeholders:** `tf(key, lang, vars)` substitutes `{name}` placeholders and `tp(keyBase, lang, n, vars)` picks `.one` / `.few` (Slovak 2..4) / `.many`. `__tests__/i18n.test.js` fails if a key is missing a language or a plural sibling

#### 3.4.8 UI Components
- **Design System:** Minimal "shadcn-like" components
- **Styling:** NativeWind (Tailwind CSS) with className prop
- **Variants:** Button (default, outline, secondary), Text (title, subtitle, body, caption)
- **Accessibility:** Font scaling support via FontScaleContext
- **Dark Mode:** Automatic via system preference
- **Visual Clarity Enhancements:**
  - Answer buttons use color-coded backgrounds for clarity:
    - Correct: `bg-emerald-500 dark:bg-emerald-600` (green)
    - Wrong (user's selection): `bg-rose-500 dark:bg-rose-600` (red/purple)
    - Neutral: Outline variant with slate colors
  - Consistent visual language across Study, Mistakes, and Mock Exam modes
  - Modal components respect safe areas using `useSafeAreaInsets()`

#### 3.4.9 Database Storage (`src/db/`)

**Database:** SQLite database (`driver.db`) managed by Drizzle ORM

**Tables:**
1. **`settings`** - Single row (id=1) storing user preferences
2. **`category_selections`** - One row per language for category preference
3. **`mistakes`** - Active mistakes with streak and spaced-repetition state (sync-ready with UUID)
4. **`answer_attempts`** - Complete history log of every answer attempt with timing data (sync-ready)
5. **`mock_exams`** - Mock exam sessions and results (sync-ready)
6. **`study_sessions`** - Study/mistakes mode session tracking (sync-ready)
7. **`exam_results`** - Outcomes of the real driving exam, one row per attempt (sync-ready)
8. **`game_rounds`** - Finished rounds of either game, `mode` = `'quiz'` or `'crossing'` (sync-ready)
9. **`crossing_log`** - One row per junction driven, with the scene and reasons as JSON (sync-ready)

**Database Views (Computed Statistics):**
- `v_questions_seen` - Unique questions seen per language (no mode filter)
- `v_daily_stats` - Daily aggregates, one row per language per local date
- `v_category_stats` - Per-category statistics with accuracy
- `v_study_stats` - Lifetime study statistics
- `v_mock_stats` - Mock exam aggregates

There are **no aggregate tables**: every number the app shows is derived from `answer_attempts` or `mock_exams` at read time. The views are dropped and recreated on every launch.

**Migration System:**
- **Current:** Hand-written table creation in `src/db/migrate.ts` (runs on app startup)
  - Uses raw SQL with `CREATE TABLE IF NOT EXISTS` plus `ALTER TABLE … ADD COLUMN` inside `try/catch` for columns added later (`analytics_opt_out`, the three notification slots, `exam_date`, `has_finished_guide`, `next_review_at`, `interval_days`, `game_rounds.mode`)
  - No versioning or migration tracking
  - **Errors are swallowed.** `runMigrations()` catches and logs, so a failed migration leaves the app running against a partial schema rather than crashing
  - **Two sources of schema truth.** `drizzle/migrations/` contains generated SQL (`0000_smooth_dark_beast.sql`, `0001_add_srs_columns.sql`, `0002_happy_king_cobra.sql`) but nothing executes it — `migrate.ts` is what actually shapes the database. A change to a table must be made in **both** the Drizzle schema file and `migrate.ts`, or they drift silently
- **Future (Planned):** Drizzle Kit versioned migrations (`npx drizzle-kit generate`)
  - Migration files stored in `drizzle/migrations/` with version numbers
  - Migration tracking table `__drizzle_migrations` tracks applied migrations
  - Supports incremental schema evolution, rollbacks, and production-safe updates
  - See section 6.5 for detailed migration versioning implementation plan

**Sync-Ready Design:**
- All user-generated tables use UUID primary keys (`text('id').primaryKey()`)
- Each record tracks `deviceId` for multi-device sync
- `syncedAt` field tracks sync status (null = not synced)
- Tables ready for future cloud sync without schema changes

**Query Layer:**
- Typed query functions in `src/db/queries/` provide type-safe database access
- All queries use Drizzle ORM for compile-time type safety
- Statistics computed from views (no redundant data storage)

**Deprecated Storage:**
- `src/lib/storage.js` - AsyncStorage wrapper (DEPRECATED, kept for backward compatibility)
- Old AsyncStorage keys no longer used: `DRIVING_MVP_SETTINGS`, `DRIVING_MVP_PROGRESS`, `DRIVING_MVP_STATS`

#### 3.4.10 Statistics System (`src/lib/stats.js` + `src/db/queries/stats.ts`)

**Database-Backed Statistics:**
- All statistics computed from `answer_attempts` and `mock_exams` tables
- No redundant storage - statistics calculated on-demand using SQL views
- Full answer attempt history enables rich future analytics

**Core Functions:**
- `loadStats()` - Computes statistics from database (maintains backward-compatible API)
- `getStatsForLang(lang)` - Gets stats for specific language from database
- Statistics queries in `src/db/queries/stats.ts`:
  - `getStudyStats(lang)` - Lifetime study statistics
  - `getDailyStats(lang, days)` - Daily aggregates for last N days
  - `getCategoryStats(lang)` - Per-category statistics with accuracy
  - `getMockStats(lang)` - Mock exam aggregates
  - `getQuestionsSeenCount(lang)` - Count of unique questions seen
  - `getLast7DaysAccuracy(lang)` - 7-day accuracy percentage

**Answer Attempt Logging:**
- Every answer attempt logged to `answer_attempts` table with:
  - Full timing data (`questionShownAt`, `answerSubmittedAt`, `responseTimeMs`)
  - Context (mode, session, category)
  - Answer details (selected, correct, points)
  - Metadata (was in mistakes, etc.)

**Engagement Tracking (`src/db/queries/engagement.ts`):**
- `getCurrentStreak(lang)` - Consecutive days with at least one study/mistakes/game attempt or one passed mock exam; buckets by local date, and returns 0 unless the most recent active day is today or yesterday
- `getLastStudyDate(lang)` - Most recent study date
- `getLastOpenedDate(lang)` - Most recent activity date

**Readiness (`src/lib/readiness.js`):**
- `scoreComponents({...})` is the one weighted formula — mistakes 30 / 7-day accuracy 25 / mock 30 / coverage 15. `stats.js`'s `calculateReadinessScore` and `getReadinessBreakdown` delegate to it, so there is no second copy of the maths
- `READY_THRESHOLD = 97`; `getReadinessLabel(score)` maps to ready ≥ 97, almostReady ≥ 85, gettingThere ≥ 60, else needsWork
- `simulateDaysToReady(inputs)` is a deterministic expected-value simulation of Smart Practice, day by day (due mistakes first, then unseen; accuracy improves at the measured weekly trend clamped to 0..5 points, or +2/week when nothing is measured; a mock is taken once accuracy reaches 92), stopping when the score crosses 97 and capped at `MAX_FORECAST_DAYS = 90`
- `getReadinessForecast(lang, { useConservative, examDate })` gathers the inputs from the database and runs that simulation. Pace is the attempts of the last 14 calendar days (`DEFAULT_PACE = 30` when there is no usable history); with an `examDate` it also returns `daysUntilExam`, `requiredPace` (binary search via `requiredPaceForDate`) and `onTrackForExam`
- `blockers` lists what still stands in the way, as `unseen`, `mistakes`, `accuracy`, and `mocks` entries; the stats screen renders them

**Statistics helpers (`src/lib/stats.js`):**
- `todayKey()`, `yesterdayKey()` - Date utilities
- `getLast7Days()` - Get last 7 days date keys
- `calculateAccuracy(attempts, correct)` - Calculate percentage
- `calculateCoverage(lang, questionsSeen)` - Calculate question coverage percentage
- `getTotalUniqueQuestions(lang)` - Get total unique questions count
- `resetStats()` - Clear the user's progress (used by Settings)

- **Tracking Rules:**
  - Every answer attempt logged to `answer_attempts` table with full timing
  - Questions marked as "seen" once answered (computed from `answer_attempts`; mock answers count)
  - Streak calculated from distinct local dates in `answer_attempts` plus passed mock exams
  - Daily stats computed from `answer_attempts` (no pruning needed — nothing is stored twice)
  - Mock history stored in `mock_exams` table (no artificial cap, can query last N)
  - Coverage computed from distinct `question_id` values in `answer_attempts`
- **Readiness Score Calculation:**
  - **Mistake Score (30%):** Requires minimum 10% coverage OR 50 questions seen; otherwise 0% (strict) or capped at 30% (conservative)
  - **Performance Score (25%):** Requires minimum 10 attempts in last 7 days; otherwise 0% (strict) or capped at 30% (conservative)
  - **Mock Exam Score (30%):** Overall pass rate (60% weight) + recent 3 exams performance (40% weight); 0% if no exams taken
  - **Coverage Score (15%):** Percentage of questions seen vs total

### 3.5 Screen Implementations

#### IntroAnimation (`app/index.tsx`)
- **Animation:** The "Driver SK" wordmark fades and rises as a single unit (per-letter `Text` nodes inside one `Animated.View`, because a multi-character `Text` collapses to one glyph in this RN version)
- **Duration:** ~0.8 s (300/380 ms in, a 200 ms hold, 220 ms out). Under Reduce Motion — or in a background browser tab, which gets no animation frames — it shows statically for 500 ms instead
- **Navigation:** Routes to `/onboarding` or `/home` based on onboarding status, from the animation's completion callback. There is no skip-on-tap, and this screen carries no `screen.*` testID

#### Onboarding (`app/onboarding.tsx`)
- **Purpose:** Premium onboarding experience for first-time users
- **Slides (6 total):**
  1. **Slovak Driving License** (🪪) - Welcome slide with 🇸🇰 Slovakia badge, explains app purpose
  2. **Study Smarter** (🎯) - Adaptive algorithm benefits
  3. **No Mistake Left Behind** (💪) - Mistake tracking feature
  4. **Realistic Practice Tests** (⏱️) - Mock exam with 20-minute timer
  5. **Watch Yourself Improve** (🏆) - Progress and readiness tracking
  6. **Study Reminders** (🔔) - Where the notification permission is asked for; Skip avoids it entirely
- **Navigation:**
  - Horizontal swipeable ScrollView with paging
  - Animated dot indicators (scroll-driven, tappable)
  - Next/Previous buttons at bottom
  - Skip button (top right) to exit early
  - Change Language link (top left) → Language screen with return to onboarding
- **Visual Design:**
  - Color-coded cards per slide (indigo, emerald, rose, amber, sky)
  - Large emoji icons in circular containers
  - Slovakia badge on first slide (🇸🇰 Slovakia)
  - Clean header with language selector and skip option
- **Animations:**
  - Scroll-driven dot indicators (width: 8px → 24px, opacity: 40% → 100%)
  - Fade-out animation on completion
  - Delayed state updates to sync with scroll animations (prevents flickering)
- **Technical:**
  - Uses `Animated.ScrollView` with `Animated.event` for scroll tracking
  - `scrollX` Animated.Value drives dot indicator interpolation
  - Multi-language support for all slide content
  - Respects safe areas with `useSafeAreaInsets()`
- **Completion:** Sets `hasOnboarded=true`, navigates to the Language screen; if a language was already chosen it goes to the paywall on iOS (when not yet subscribed) or straight Home

#### LanguageSelect (`app/language.tsx`)
- **Options:** 3 language buttons (Slovak, English, Hungarian)
- **Visual Highlight:** Amber-colored notice box emphasizing "Questions will be in this language"
- **Two steps:** tapping a language only selects it; a separate **Continue** button commits
- **Action:** Sets language, sets `hasChosenLanguage=true`, reschedules notifications, then returns to onboarding (if it was reached from there) or moves on to the paywall/home

#### Paywall (`app/paywall.tsx`)
- A thin route that presents RevenueCat's hosted paywall once, at the end of onboarding, in the app's language (not the device locale)
- On any platform where `isPurchasesSupported()` is false — Android, web, or an E2E build with `EXPO_PUBLIC_BYPASS_PAYWALL=true` — it immediately replaces itself with `/home`
- Gated features present the paywall on tap instead, through `ensureProAccess()`

#### Home (`app/home.tsx`)
- **Display:** 
  - "YOUR PROGRESS" card (pressable) showing:
    - **Exam Readiness Score** (0-100%) with an animated progress bar and color-coded status (Ready / Almost ready / Getting there / Needs work)
    - The forecast line ("about N days at your pace")
    - The exam countdown line when an exam date is set, with either "on track" or the daily pace it would take
    - Accuracy (last 7 days) and current streak
    - After a passed real exam, the whole readiness block is replaced by a "passed" card
  - "Did you take the exam?" card — shown once the exam date has passed with no result recorded on or after it
  - "Who goes first?" card → the game hub
  - Install hint (web only)
  - Mock Exam, Mistakes (PRO), and the Smart Study card (PRO)
  - Settings gear in the top-right corner
- **Data:** Loads language, mistake count, 7-day accuracy, streak, forecast, and the latest exam result on focus. Notification scheduling is deliberately *not* re-run here
- **Gating:** `openGated()` routes to Study/Mistakes only if the Pro entitlement is held or just acquired; a `PRO` pill shows on those cards until then
- **Readiness Score:** Calculated using current settings (strict or conservative mode)

#### Study (`app/study.tsx`)
- **Features:**
  - Category selector
  - Smart Practice question selection (adaptive algorithm)
  - **Reason label pill** - Displays why question was selected (mistake, shaky, unseen, weak area with its name, or random)
  - **Points bubble** - Question point value displayed in pill format on the right side
  - Image rendering (if available)
  - Answer buttons with enhanced visual feedback:
    - Correct answer: Green background (emerald-500/600)
    - Wrong selected answer: Red/purple background (rose-500/600) with white text
    - Other answers: Neutral outline styling
  - Next button (appears after answer)
- **Logic:** 
  - Smart Practice algorithm for intelligent question selection
  - Category filtering integrated into priority system
  - Recent question tracking (in-memory, max 20) for anti-repetition
  - Progress tracking via database, auto-scroll
- **Database Integration:**
  - Creates `study_sessions` entry when screen opens
  - Tracks `questionShownAt` timestamp when question loads
  - Logs every answer attempt to `answer_attempts` table with:
    - Full timing data (`questionShownAt`, `answerSubmittedAt`, `responseTimeMs`)
    - Session ID linking to `study_sessions`
    - Category context
    - Answer details and correctness
  - Updates `mistakes` table directly (no intermediate state)
- **Statistics Tracking:**
  - Answer attempts logged to database (computed statistics via views)
  - Questions seen computed from `answer_attempts` table
  - Daily and category statistics computed from database views
  - Engagement streak calculated from distinct study dates
- **Visual Clarity:** Clear distinction between correct and incorrect answers with color-coded backgrounds
- **Smart Practice Integration:**
  - Uses `getSmartQuestion()` from `smartPractice.js` (queries database for mistakes/stats)
  - Maintains `recentQuestionIds` ref for anti-repetition
  - Automatically prioritizes mistakes, unseen questions, and weak categories

#### Mistakes (`app/mistakes.tsx`)
- **Features:**
  - Category selector
  - Filtered mistake list (loaded from `mistakes` table)
  - Shuffled question order
  - Mastery streak display (from `mistakes.streakCount`)
  - Empty state handling
  - Answer buttons with enhanced visual feedback (same as Study mode):
    - Correct answer: Green background (emerald-500/600)
    - Wrong selected answer: Red/purple background (rose-500/600) with white text
    - Other answers: Neutral outline styling
- **Database Integration:**
  - Creates `study_sessions` record when screen opens (mode: 'mistakes')
  - Loads mistakes from `mistakes` table (not AsyncStorage)
  - Logs every answer attempt to `answer_attempts` table with timing
  - Updates mistakes table directly (add/remove/increment streak)
- **Logic:** Category filtering, dynamic list updates, graceful navigation
- **Statistics Tracking:**
  - Every answer attempt logged to database with full context
  - Statistics computed from database views
- **Visual Clarity:** Consistent visual language with Study mode for unified user experience

#### Mock (`app/mock.tsx`)
- **Features:**
  - Timer display (if test has time limit)
  - Question navigation bar (numbered buttons)
  - Current question indicator
  - Answer selection
  - Previous/Next navigation
  - Finish button
  - Results screen with score breakdown:
    - Large, button-like question items (min-height 56px, increased padding)
    - Wrong answers are clickable (Pressable)
    - Correct answers remain non-interactive (View)
  - Question Detail Modal:
    - Opens when tapping wrong answer items
    - Displays full question context (text, image, all answers)
    - Visual indicators: green for correct, red/purple for user's wrong answer
    - Respects safe zones (notch area)
    - Images fill full modal width
    - Smooth scrolling with proper height constraints
    - Close button at bottom
- **Database Integration:**
  - Creates `mock_exams` record when exam starts (stores testId, maxScore, minToPass)
  - Tracks `questionShownAt` for each question when navigated to
  - Logs every answer attempt to `answer_attempts` table (mode: 'mock') with timing
  - Updates `mock_exams` record on finish (score, passed, duration, wrongCount)
  - Updates `addedToMistakesCount` when wrong answers added to mistakes
- **Logic:** Score calculation, pass/fail determination, wrong answer collection, modal state management
- **Statistics Tracking:**
  - Every answer attempt logged with full timing data
  - Mock exam history stored in `mock_exams` table
  - Engagement streak computed from database (includes passed mock exams)

#### Statistics (`app/stats.tsx`)
- **Features:**
  - Overview Card (hero):
    - Accuracy (last 7 days) and accuracy (lifetime), with a coverage badge
    - Coverage bar: questions seen of the total
    - Mistakes remaining, study attempts (lifetime), current streak, question coverage
  - **Forecast block:** days until the score reaches 97 at the current pace, the exam countdown when a date is set, the pace that date would need, and the remaining blockers (`unseen`, `mistakes`, `accuracy`, `mocks`)
  - **Exam Readiness Card:**
    - Overall readiness score (0-100%) with an animated bar and status badge
    - Component breakdown showing:
      - Mistakes: score, count, weight (30%), warning if insufficient data
      - Performance: score, attempts (7d), weight (25%), warning if insufficient data
      - Mock Exams: score, pass rate, recent pass rate, exams taken, weight (30%)
      - Coverage: score, seen/total, weight (15%)
    - Each component displays score, weight percentage, and relevant metrics
  - Last 7 Days Card:
    - Daily breakdown showing attempts and accuracy per day
    - Empty state if no data
  - Mock Exams Card:
    - Exams taken, pass rate, best score, last score
    - Empty state if no exams taken
  - Consistency Card:
    - Current streak
    - Last study date (formatted: "Today", "Yesterday", or date)
- **Loading:** `components/StatsOverviewSkeleton.tsx` stands in for the hero card while the queries run, rather than a spinner
- **Data:** Loads statistics, mistake count, readiness breakdown and forecast on focus
- **Calculations:** All metrics derived from the database at read time; the readiness score respects the user's calculation mode preference
- **Large text:** `useLargeText()` restacks the side-by-side rows into full-width blocks so nothing clips at accessibility text sizes

#### Settings (`app/settings.tsx`)
- **Language** — three buttons; changing one clears the settings cache and reschedules notifications
- **Install hint** — web only
- **Readiness Score Mode Toggle** — "Conservative mode" switch: insufficient data scores 0% when off, or partial scores capped at 30% when on
- **Real exam card** — set or clear the exam date (`components/ui/date-field.tsx`, or a browser date input on web), a button through to the result screen, and the history of recorded attempts with points and a pass/fail pill
- **Study reminders** — three switches (morning 08:30, lunch 12:30, evening 19:00). Hidden entirely on web. Turning one on triggers the permission request, and every change re-runs `syncNotificationsWithCurrentSettings()`
- **Analytics** — opt-out switch, which also calls `posthog.optOut()` / `optIn()`
- **Subscription** — RevenueCat Customer Center for subscribers, the paywall for everyone else. Only rendered where `isPurchasesSupported()`
- **About** — privacy policy, terms, support email, and the native app version and build number
- **Reset progress** — clears the user's progress behind a confirm dialog

#### Record Exam Result (`app/exam.tsx`)
- Reached from the Settings card or from the "Did you take the exam?" prompt on Home
- A numeric `TextInput` for points (0–100) and a date field; typing the score preselects pass/fail at the 90-point threshold, which the user can still override
- On save it writes one `exam_results` row via `ExamResultsDB.addExamResult()`, storing the **readiness score at that moment** alongside the result so the estimate can be calibrated later, and sends `exam_result_recorded` to PostHog
- A pass turns all three reminder slots off and clears `settings.exam_date`
- Returns with `router.back()`, or `replace('/home')` when there is nothing to go back to (a PWA deep link or reload)

#### Game Hub (`app/game.tsx`)
- Two cards: the crossings runner and the exam-picture quiz, each showing the best score from `game_rounds`
- The crossings card leads to `/crossing-guide` until `settings.has_finished_guide` is set, and to `/crossing` afterwards, with a "replay the guide" button once it has been finished
- A link to the drive log sits on the same card
- Free on every platform — neither game is behind the paywall

#### Crossing Guide (`app/crossing-guide.tsx`)
- Twelve fixed lessons (`src/lib/priority/lessons.js`), in order, covering every kind of junction the generator produces: the controls, the right-hand rule, main road, side road, turning, trams, lights, roundabouts, and so on
- Nothing is random, so every player is taught the same thing, and a lesson must be passed before the next one unlocks
- Each lesson opens with a brief (the swipes it will ask for), runs the junction at reduced speed, then shows a verdict
- Finishing the last lesson calls `setGuideFinished(true)`, which is what unlocks the runner card on the hub

#### Crossings Runner (`app/crossing.tsx`)
- An endless drive: junctions are placed along the exit direction of the previous one, with other vehicles scheduled against the player's expected arrival so the decision is always live
- Controls are swipes only — down to give way, up to move off, left/right to turn at the junction ahead. The car never moves off by itself
- Three lives; a crash costs one, and a needless stop, a late start, a red light, or taking the wrong way costs the points and the streak
- Every junction driven produces a record (outcome flags, the instruction, the way taken, the priority reasons involving the player, and a drawable scene) written to `crossing_log`; the log is purged to the newest 300 rows per language at the end of a run
- A finished run writes one `game_rounds` row with `mode = 'crossing'`
- Haptics carry the feedback: heavy on a crash, medium on stopping, light on moving off and on a junction cleared, a warning buzz on a honk, and a success pattern on a level up

#### Drive Log (`app/crossing-log.tsx`)
- A list of the junctions driven, newest first, each as an `IntersectionScene` thumbnail
- `explainRecord()` (`src/lib/crossingLog.js`) turns a stored record into an outcome label, a headline, and one sentence per rule that applied, using the `rule.*` and `crossing.log.*` strings
- The instructor bar stays above the road and the scene takes the remaining height

#### Exam-Picture Quiz (`app/game-quiz.tsx`)
- Built from the official intersection situations — questions whose image lives under `obr3/ds/` or matches `2023/*_DS*`
- `classifyQuestion` (`src/lib/game.js`) reads the answer texts alone and turns each question into one of four interactions: `order` (tap the vehicles in crossing order), `pick` (tap the vehicle; "at the same time as" answers become two-colour chips), `ordinal` (first / second / last), or `choice` (a plain three-answer fallback for reason-based questions)
- Rounds are `ROUND_SIZE` 10, with `LIVES` 3 and a `TIME_LIMIT_MS` of 20 s per item. `scoreAnswer` gives 100 base points plus a linear speed bonus, multiplied by a streak multiplier capped at 2×
- Every answer is logged to `answer_attempts` with `mode = 'game'` and run through `applyAnswer`, so the quiz feeds mistakes, the study views, 7-day accuracy, and the streak
- A finished round writes one `game_rounds` row with `mode = 'quiz'`

### 3.6 Data Structure

#### Question Object (Normalized)
```javascript
{
  qid: string,           // Question ID
  text: string,           // Question text
  points: number,        // Point value (body)
  image: string,          // Image filename or ""
  correct: number,       // Correct answer (1-3)
  answers: string[3],     // Array of 3 answer strings
  qNo: number            // Question number (1-based)
}
```

#### Test Object (from data5.js)
```javascript
{
  pocet: number,          // Number of questions
  cas: number,            // Time limit (seconds)
  minbody: number,       // Minimum points to pass
  maxbody: number,        // Maximum points
  otazky: {               // Questions by number
    "1": [{id, text, body, obrazok, platna}],
    ...
  },
  odpovede: {             // Answers by number
    "1": [{odpoved}],
    ...
  },
  okruhy: {               // Categories by number
    "1": [{txt, zacina}],
    ...
  }
}
```

### 3.7 Performance Optimizations

1. **Cached Question Indices:** Built once per language, reused
2. **Settings Caching:** In-memory cache to avoid database reads
3. **Image Manifest:** Static requires for fast image loading
4. **Lazy Loading:** Screens load data on focus (useFocusEffect)
5. **Efficient Filtering:** Category filtering uses cached test lookups
6. **Database Indexes:** All foreign keys and frequently queried columns indexed
7. **Database Views:** Statistics computed via views (no redundant storage)
8. **Smart Practice Optimizations:**
   - Seen set built once per session from database query
   - Uses cached question indices from `buildQuestionIndex()`
   - Category stats queried from database view (efficient)
   - Recent IDs list is small (max 20 items, in-memory)
   - No repeated full bank scans
   - Minimum gap windows use efficient array slicing (`slice(-MIN_GAP)`)
   - Two-tier filtering prevents unnecessary priority fallthroughs
9. **Answer Attempt Logging:** Efficient batch inserts, indexes on frequently queried columns

### 3.8 Error Handling

- **Component crashes:** `components/ErrorBoundary.tsx` wraps the whole tree and reports `app_crash` to PostHog (with the component stack) when analytics is on
- **Missing Images:** Placeholder text displayed, no crashes
- **Missing Questions:** "Question not found" message, reload option
- **Empty States:** Explicit empty states with next steps — the zero-mistakes screen offers Smart Study and Mock, the category-empty screen offers "Show all"
- **Database Errors:** Console errors logged, graceful degradation, migration errors don't crash app
- **Invalid Data:** Fallbacks to defaults (lang 1, empty arrays). `addExamResult()` is the exception and throws on out-of-range points or an invalid date, which `app/exam.tsx` surfaces as a dialog
- **Migration Failures:** Tables created with `IF NOT EXISTS` for idempotency, and `runMigrations()` catches rather than rethrows — so a failure is silent from the user's point of view
- **Analytics failure mode:** if migrations fail, `_layout.tsx` defaults to opted-out so a broken launch never leaks tracking events
- **Web storage unavailable:** `index.js` gives up after three warm-up attempts and `public/index.html` renders a localised "cannot start here" message with a retry button
- **Sync Errors:** Future sync operations will handle conflicts gracefully (local-first approach)

### 3.9 Platform-Specific Considerations

- **iOS:** Uses Avenir Next font, supports Dynamic Type scaling. The only platform with purchases and the paywall
- **Android:** Uses sans-serif-medium, edge-to-edge enabled. Everything is free
- **Web:** A client-rendered SPA (`web.output: "single"`) shipped as an installable, offline PWA. SQLite runs in a Worker over `SharedArrayBuffer`, so the page must be cross-origin isolated (COOP/COEP headers in `vercel.json` and `scripts/serve-web.mjs`) and `index.js` warms the worker before loading the router. Only one tab per origin — `public/index.html` holds a Web Lock and shows an overlay in a second tab. Notification rows are hidden, purchases are skipped, `components/ui/screen.tsx` centres the app at 480 px, and `date-field.web.tsx` uses a browser date input. Both games run unchanged. `Alert.alert` does nothing here, so `src/lib/dialog.ts` is used instead. Full detail in `docs/pwa.md`
- **Dark Mode:** Automatic via system preference
- **Safe Areas:** Handled via SafeAreaView and SafeAreaProvider
  - Modal components use `useSafeAreaInsets()` to respect notch/dynamic island areas
  - Proper padding applied to prevent content overlap with system UI

---

## 4. DEPENDENCIES & CONFIGURATION

### 4.1 Key Dependencies
- **expo:** ~54.0.32
- **react:** 19.1.0
- **react-native:** 0.81.5
- **expo-router:** ~6.0.22
- **nativewind:** ^4.2.1
- **expo-sqlite:** ^16.0.10 (SQLite database)
- **drizzle-orm:** ^0.45.2 (Type-safe ORM)
- **drizzle-kit:** ^0.30.6 (dev dependency; installed but not wired into startup)
- **expo-crypto:** ^15.0.8 (UUID generation)
- **react-native-svg:** ^15.15.5 (the crossings game and the drive log)
- **react-native-reanimated:** ~4.1.1 + **react-native-worklets:** 0.5.1
- **expo-notifications:** ~0.32.12 (local reminders)
- **react-native-purchases** / **-ui:** ^10.2.0 (RevenueCat, iOS only)
- **posthog-react-native:** ^4.27.0
- **@react-native-async-storage/async-storage:** 2.2.0 (Deprecated - used only for device ID caching)
- **i18n-js:** ^4.5.1

### 4.2 Configuration Files

**app.json:**
- App name: "Driver SK"
- Bundle ID / Android package: **com.smartie.driver**
- New architecture enabled, portrait only, `supportsTablet: false`
- iOS privacy manifest declared (tracking off; analytics and crash-data purposes listed)
- Android: edge-to-edge, adaptive icon, predictive back disabled
- `web.output: "single"` with the PWA name, theme, and description
- Plugins: `expo-router`, `expo-splash-screen` (no `image` — see the Android splash caveat in `.maestro/README.md`), `./plugins/withDarkSplash`, `expo-notifications`, `expo-localization`
- Typed routes enabled, React compiler enabled

**app.config.js:**
- Wraps `app.json` and injects `extra`: `posthogKey`, `posthogHost`, `revenueCatIosKey` (only when explicitly set — the default key is chosen at runtime from `__DEV__`), and `bypassPaywall` from `EXPO_PUBLIC_BYPASS_PAYWALL`, which the Maestro suite uses to get past the paywall

**tailwind.config.js:**
- Content paths: app, src, components
- NativeWind preset

**babel.config.js:**
- NativeWind babel plugin

**metro.config.js:**
- Standard Expo Metro configuration

**vercel.json:**
- `buildCommand: npm run build:web`, output `dist/`
- COOP/COEP/CORP and `X-Content-Type-Options` on every path; immutable caching for `/_expo/*` and `/assets/*`; `no-cache` for `/sw.js` and `/index.html`
- A rewrite sending every non-file path to `/index.html`

**jest.config.js:**
- `jest-expo` preset, `jest.setup.js` mocks AsyncStorage, `expo-sqlite`, and `drizzle-orm/expo-sqlite` so suites that transitively import `src/db/index` can load

**drizzle.config.ts:**
- Schema path: `./src/db/schema/index.ts`
- Migration output: `./drizzle/migrations`
- Dialect: `sqlite`
- Used for generating migrations with `npx drizzle-kit generate` — but nothing runs the generated files; `src/db/migrate.ts` is what shapes the database

---

## 5. KNOWN LIMITATIONS & FUTURE CONSIDERATIONS

### 5.1 Current Limitations
1. **No Backend:** All data is local, no sync across devices (schema is sync-ready for future implementation)
2. **No User Accounts:** No login or user profiles
3. **No Offline Updates:** Question data updates require an app update (or, on web, a redeploy)
4. **Timer Only in Mock and the games:** Study mode has no timer
5. **Limited Charts:** Progress and coverage bars and the 7-day activity bars; no trend lines or long-range charts
6. **Manual Migrations:** Migration is hand-written SQL in `src/db/migrate.ts`; the generated files under `drizzle/migrations/` are not executed
7. **No Migration Versioning:** Tables created directly without migration tracking, and migration errors are caught and logged rather than raised — a failed migration leaves the app on a partial schema
8. **Mistake count vs due list:** Home counts every open mistake; the Mistakes screen lists only the ones due today (see 2.3)
9. **Web caveats:** one tab per origin, no SQLite in private browsing, and a large first download (the whole question bank and its images are precached)

### 5.2 Potential Enhancements
1. **Visual Charts:** Add charts/graphs for accuracy trends, study activity over time
2. **Exam History Detail:** Detailed exam history screen with per-question review links
3. **Category Breakdown:** Category-specific accuracy statistics (now possible via `v_category_stats` view)
4. **Question Difficulty Scoring:** Analyze `responseTimeMs` and success rate from `answer_attempts` to score question difficulty
5. **Favorites System:** Bookmark questions for later review
6. **Study Plans:** Structured learning paths
7. **Explanation Text:** Add explanations for correct answers
8. **Achievements:** Gamification with badges/achievements
9. **Backend Sync:** Cloud sync for progress across devices (schema already sync-ready with UUIDs and `deviceId`)
10. **Question Updates:** OTA updates for question data
11. **Readiness Score Enhancements:** Historical trends, category-specific readiness, personalized recommendations
12. **Advanced Analytics:** Response time analysis, learning curves, time-of-day patterns (enabled by `answer_attempts` timing data)
13. **Drizzle Kit Migrations:** Migrate to proper versioned migrations using `drizzle-kit generate` for schema evolution tracking

---

## 6. DEVELOPMENT NOTES

### 6.1 Running the App
```bash
npm install
npx expo start                                   # Metro + dev menu
npx expo run:ios --configuration Release         # build onto a simulator or device
npx expo run:android --variant release
```

### 6.2 Generating Image Manifest
```bash
node scripts/genImageManifest.mjs
```

### 6.3 Checks and the Web Build
```bash
npm test                    # Jest
npm run lint                # expo lint
npx tsc --noEmit            # type-check (noisy; not a build gate — see 6.4)
npm run build:web           # export the PWA into dist/ and generate its service worker
npm run serve:web           # serve dist/ locally with the COOP/COEP headers SQLite needs
npm run bump:ios            # bump ios.buildNumber before a TestFlight upload
cd .maestro && maestro test .   # E2E suite
```

### 6.4 Project Reset
```bash
npm run reset-project
```
The `create-expo-app` starter script. It moves `app/`, `components/`, `hooks/`, `constants/` and `scripts/` into `app-example/` — i.e. it wipes this app. Only useful when reusing the repo as a template.

### 6.5 Code Style
- Uses ESLint with Expo config
- TypeScript for the database layer (`src/db/`), the UI primitives, and most components
- JavaScript for several screens, the i18n strings, and the domain libraries (`readiness.js`, `smartPractice.js`, `game.js`, `src/lib/priority/*`)
- NativeWind for styling (className prop)
- `npx tsc --noEmit` currently reports 183 errors, almost all of them in `app/stats.tsx`, `app/mock.tsx`, and `app/mistakes.tsx` — screens that hold loaded data in untyped `useState(null)` and then read properties off it (mostly TS2339 and implicit-`any` parameters). Builds are unaffected, because Babel strips types; treat the output as a guide, not a gate

### 6.6 Database Migrations

**Current Approach:**
- Hand-written table creation in `src/db/migrate.ts` using raw SQL
- Tables created with `CREATE TABLE IF NOT EXISTS` for idempotency; columns added later go in as `ALTER TABLE … ADD COLUMN` wrapped in `try/catch`
- Views are **dropped and recreated** on every startup, so an edited definition takes effect immediately
- No migration versioning (tables created if missing)
- Migration function `runMigrations()` called on app startup in `app/_layout.tsx`, before the React tree mounts
- **Limitation:** Cannot track schema evolution or roll back changes, and `runMigrations()` swallows its errors — a failure is logged and the app continues against whatever schema exists
- **Limitation:** `drizzle/migrations/` holds generated SQL from earlier `drizzle-kit generate` runs that nothing executes, so the Drizzle schema files and `migrate.ts` are two independent sources of truth that must be changed together

**Future Migration Strategy (not implemented):** the steps below describe
Drizzle Kit's versioned migrations. Nothing in the app runs them today: there
is no `useMigrations` call and no `__drizzle_migrations` table, and the three
files in `drizzle/migrations/` stop at `analytics_opt_out`, before
`exam_results`, `game_rounds`, `crossing_log`, `exam_date` and
`has_finished_guide`. Treat them as history, not as the schema.

- **Goal:** Migrate to proper versioned migrations using Drizzle Kit
- **Benefits:**
  - Track schema changes over time with versioned migration files
  - Support incremental schema evolution (add columns, modify tables, etc.)
  - Enable rollback capabilities for schema changes
  - Track applied migrations to prevent re-execution
  - Better collaboration and deployment workflows
  - Production-safe schema updates

**Migration Versioning Implementation Plan:**
1. **Migration Generation:**
   - Use `npx drizzle-kit generate` to create migration SQL files
   - Migration files stored in `drizzle/migrations/` directory
   - Each migration file named with timestamp and description (e.g., `0001_initial_schema.sql`)
   - Migration metadata stored in `drizzle/migrations/meta/`

2. **Migration Tracking:**
   - Drizzle Kit creates `__drizzle_migrations` table automatically
   - Tracks applied migrations with hash, timestamp, and name
   - Prevents duplicate execution of migrations

3. **Migration Runner:**
   - Update `src/db/migrate.ts` to use Drizzle Kit's migration runner
   - Execute pending migrations on app startup
   - Verify migration integrity using hash checksums
   - Handle migration failures gracefully (log errors, don't crash app)

4. **Schema Evolution Workflow:**
   - Modify schema files in `src/db/schema/`
   - Run `npx drizzle-kit generate` to create migration SQL
   - Review generated migration files for correctness
   - Test migrations on development database
   - Commit migration files to version control
   - Migration runner executes pending migrations on app startup

5. **Migration Best Practices:**
   - Always review generated migrations before committing
   - Test migrations on development/staging before production
   - Use transactions where possible for atomic schema changes
   - Document breaking changes in migration files
   - Keep migrations small and focused (one logical change per migration)

**Migration Files Structure (Future):**
```
drizzle/
├── migrations/
│   ├── 0001_initial_schema.sql
│   ├── 0002_add_sync_fields.sql
│   ├── 0003_add_indexes.sql
│   └── ...
└── meta/
    ├── _journal.json
    └── 0001_snapshot.json
```

**Transition Strategy:**
- Current manual migration (`src/db/migrate.ts`) will remain until Drizzle Kit migration system is implemented
- Initial migration will create all tables and views (equivalent to current manual approach)
- Subsequent migrations will handle schema evolution incrementally
- Migration runner will handle both initial setup and incremental updates seamlessly

---

## 7. TESTING STATUS

**Automated — Jest (`npm test`):**
18 suites under `__tests__/`, covering the pure logic rather than the screens:
- `priority.test.js`, `scenes.test.js`, `geometry`-backed cases — the right-of-way engine. `scenes.test.js` replays all 39 official exam pictures from `data/game/scenes.json` and fails if the engine stops reproducing an official answer, so the engine may only be changed with that suite green
- `generator.test.js`, `world.test.js`, `runnerFuzz.test.js`, `timeline.test.js`, `queue.test.js`, `junctionStatic.test.js`, `swipeHint.test.js` — the runner, its scheduling, and its drawing
- `readiness.test.js` — the score formula and the forecast simulation
- `smartPractice.test.js`, `engine.test.js`, `stats.test.js`, `categories.test.js` — study selection, mistakes, and statistics
- `game.test.js`, `crossingLog.test.js` — the picture quiz and the drive-log explanations
- `examResults.test.js` — validation and storage of real exam results
- `i18n.test.js` — fails if any key is missing one of the three languages or a plural sibling

`jest.setup.js` mocks AsyncStorage, `expo-sqlite`, and `drizzle-orm/expo-sqlite`, so any suite that transitively imports `src/db/index` can load.

**Automated — Maestro E2E (`.maestro/`):**
Nine numbered flows plus a reusable onboarding subflow, run against iOS simulators and Android emulators. Selectors are `testID`s, with `screen.<name>` for screens and the i18n key for labelled controls, so the flows are language-independent. See `.maestro/README.md` — including the two flows that are currently stale.

**Manual Testing:**
- ✅ All screens render correctly
- ✅ Navigation flows work
- ✅ Onboarding flow: all 6 slides display correctly with proper content
- ✅ Onboarding navigation: Swipe, Next/Previous buttons, dot indicators work
- ✅ Onboarding animations: Scroll-driven dots animate smoothly without flickering
- ✅ Onboarding skip: Skip button exits to language/home correctly
- ✅ Onboarding language change: Returns to onboarding after language selection
- ✅ Language screen: Highlighted note about questions language displays correctly
- ✅ Study mode with categories
- ✅ Mistakes tracking and removal
- ✅ Mock exam with timer
- ✅ Language switching
- ✅ Progress persistence
- ✅ Image loading
- ✅ Dark mode support
- ✅ Mock exam results: Wrong answers clickable, detail modal functional
- ✅ Visual clarity: Correct/wrong answer indicators work in Study and Mistakes modes
- ✅ Modal scrolling: Smooth scrolling with proper height constraints
- ✅ Safe zones: Modals respect notch/dynamic island areas
- ✅ Image display: Images fill full width in modals
- ✅ Statistics tracking: Study attempts, mock exams, streaks tracked correctly
- ✅ Statistics screen: All metrics display correctly
- ✅ Question coverage: Questions seen tracking works
- ✅ Home progress card: Displays readiness score, forecast, accuracy, and streak correctly
- ✅ Smart Practice Mode: Adaptive question selection prioritizes mistakes, shaky and unseen questions, and weak categories
- ✅ Anti-repetition: Two-tier system prevents frequent repetition (20-question window + minimum gaps: 15 for mistakes, 5 for others)
- ✅ Smart Study Reason Labels: Reason pills display correctly for all question types
- ✅ Points Display: Points bubble displays correctly on right side with proper styling
- ✅ Readiness Score: Composite score calculates correctly with all four components
- ✅ Readiness Breakdown: Statistics screen shows detailed component breakdown with weights and warnings
- ✅ Readiness Mode Toggle: Settings screen allows switching between strict and conservative modes
- ✅ Insufficient Data Handling: Minimum thresholds work correctly for mistakes and performance components
- ✅ Mock Exam Integration: Mock exam scores contribute correctly to readiness calculation

---

## END OF CURRENT STATE SPECIFICATION

This document reflects the implementation state as of September 19, 2026.

**Since the last revision of this document (January 2026):**
- **Readiness forecast and exam-date planning** — `src/lib/readiness.js` became the single home of the score formula, a day-by-day simulation of how long the user still needs, and the maths around a user-set exam date (countdown, required pace, on-track). Home and Stats both render it, and Stats also lists the remaining blockers
- **Real exam results** — `app/exam.tsx` and the `exam_results` table record the outcome of the actual exam, storing the readiness score at save time for calibration. A pass turns the reminders off, clears the exam date, and changes what Home shows
- **The crossings minigame** — a pure right-of-way engine (`src/lib/priority/`), an endless swipe-driven runner, SVG rendering in `components/game/`, a twelve-lesson guide that gates the runner through `settings.has_finished_guide`, and a per-junction drive log in `crossing_log` that can explain each decision
- **The exam-picture quiz** — a timed game built from the official intersection pictures, feeding `answer_attempts` with `mode = 'game'` so it counts toward accuracy, mistakes, and the streak
- **Spaced repetition for mistakes** — the flat "two correct answers" rule became a 0 → 1 → 3 → 7 day review ladder with `next_review_at` and `interval_days`
- **PWA** — the same code ships as an installable, offline web app at `driver.smartie.team`, with a generated service worker, cross-origin isolation for SQLite, and a one-tab lock
- **Subscriptions** — Smart Study and Mistakes are gated behind a RevenueCat entitlement on iOS; Android and web are free
- **Notifications, analytics, and accessibility** — local reminders in three slots, PostHog with an opt-out, and a pass over VoiceOver names, roles, and large-text layouts
- **Automated testing** — a Jest suite and a nine-flow Maestro E2E suite, where this document previously said none existed

**Previous Updates (v2.0.0):**
- **SQLite Migration:** Complete migration from AsyncStorage to SQLite database
  - All user data now stored in normalized SQLite database using Drizzle ORM
  - Comprehensive `answer_attempts` table logs every answer with full timing data (`questionShownAt`, `answerSubmittedAt`, `responseTimeMs`)
  - Database views compute all statistics (no redundant storage)
  - Sync-ready schema with UUID primary keys, `deviceId`, and `syncedAt` fields
  - Type-safe query layer in `src/db/queries/`
  - Migration system creates tables and views on app startup
  - Backward-compatible APIs maintained in `src/lib/` layer
  - Future-ready for cloud sync and advanced analytics
  - **Migration Versioning:** Current implementation uses manual table creation; future migration to Drizzle Kit versioned migrations planned for proper schema evolution tracking

**Previous Updates (v1.6.0):**
- Premium Onboarding Experience: Complete redesign of first-time user experience
  - 5-slide onboarding flow with clear Slovakia driving exam focus (a sixth, notifications slide was added later)
  - Animated scroll-driven dot indicators (replaces progress bar to eliminate flickering)
  - Slovakia badge (🇸🇰) on welcome slide for clear branding
  - Updated slide content: compelling, action-oriented copy highlighting key features
  - Updated icons: 🪪 (license), 🎯 (smart study), 💪 (mistakes), ⏱️ (mock exams), 🏆 (progress)
  - Tappable dots for direct slide navigation
  - Synchronized animations: state updates delayed to match scroll animations
  - Clean header: language selector + skip option (removed redundant step counter)
- Language Screen Enhancement:
  - Highlighted amber notice box: "Questions will be in this language"
  - Clearer description emphasizing both app and exam questions use selected language
  - Improved visual hierarchy and spacing

**Previous Updates (v1.5.0):**
- Exam Readiness Score: Composite metric feature implemented
  - Single score (0-100%) combining mistakes, performance, mock exams, and coverage
  - Weighted formula: Mistakes (30%), Performance (25%), Mock Exams (30%), Coverage (15%)
  - Minimum data thresholds: Mistakes require 10% coverage or 50 questions; Performance requires 10 attempts in last 7 days
  - Two calculation modes: Strict (insufficient data = 0%) and Conservative (insufficient data = partial scores capped at 30%)
  - Settings toggle to switch between calculation modes
  - Prominent display on Home screen with color-coded status (Ready/Getting there/Needs work)
  - Detailed breakdown card on Statistics screen showing all components with weights and warnings
  - Multi-language support for all readiness-related strings
  - Real-time updates as user studies and takes mock exams

**Previous Updates (v1.4.0):**
- Smart Study Reason Labels: "Why this question?" feature implemented
  - Visual pill labels explaining question selection rationale
  - Four reason types: mistake, unseen, weak (with category), random
  - Multi-language support for all reason labels
  - Points display moved to pill format on right side
  - Enhanced user trust and perceived intelligence of Smart Study
  - Clean UI: Reason pill on left, points bubble on right, both outside question card

**Previous Updates (v1.3.0):**
- Smart Practice Mode: Intelligent adaptive question selection system implemented
  - Priority-based algorithm: Mistakes → Unseen → Weak Categories → Random
  - **Two-Tier Anti-Repetition System:** Enhanced to prevent frequent repetition
    - Tier 1: Excludes last 20 questions shown (full recent window)
    - Tier 2: Minimum gap windows (15 questions for mistakes, 5 for others)
    - Graceful fallthrough: Skips to next priority if all candidates within minimum gap
  - Category-aware: Respects selected category filter at each priority level
  - Performance optimized: Uses cached indices, builds seen set once per session
  - Study Mode Enhancement: Replaced random selection with Smart Practice algorithm
  - User Experience: App feels intelligent and personalized, automatically guides users to weaknesses
  - **Minimum Gap Enhancement:** Prevents mistakes from appearing back-to-back or with only 1-2 questions in between, ensuring proper spacing for effective learning

**Previous Updates (v1.2.0):**
- Statistics Dashboard: Comprehensive statistics tracking system implemented
  - Study performance tracking (attempts, accuracy, daily trends)
  - Mock exam history and performance metrics
  - Engagement streak tracking
  - Question coverage tracking (questions seen vs total)
- Home Screen Enhancement: Progress preview card showing key metrics
- Statistics Screen: Full-featured dashboard with overview, trends, mock exams, and consistency metrics
- Per-Language Statistics: All statistics tracked separately per language
- Local Storage: Statistics stored in separate AsyncStorage key (`DRIVING_MVP_STATS`)

**Previous Updates (v1.1.0):**
- Enhanced Mock Exam Results: Wrong answers are now clickable, opening a detail modal
- Improved Visual Clarity: Study and Mistakes modes use color-coded answer backgrounds (green for correct, red/purple for wrong)
- Question Detail Modal: Interactive review of wrong answers with full context and clear visual indicators
- UI Improvements: Larger, more button-like question items in results list
- Modal Enhancements: Proper safe zone handling, full-width images, smooth scrolling

For the original build specification, see `docs/specs/spec.md`. For category feature details, see `docs/specs/categories.md`. For statistics feature specification, see `docs/specs/statistics.md`. For Smart Practice Mode specification, see `docs/specs/smart-practice.md`. For Smart Study Reason Labels specification, see `docs/specs/why-q-smart.md`. For Readiness Score implementation plan, see `.cursor/plans/readiness_score_implementation_eae787b5.plan.md`. For SQLite migration plan, see `.cursor/plans/sqlite_migration_with_drizzle_98d9308c.plan.md`.

For the database design, see `docs/sqlite-schema.md`. For the crossings game — its rules, their legal citations, the scene format, the runner, and the guide — see `docs/game/`. For the web build and its deployment, see `docs/pwa.md`. For the E2E suite, see `.maestro/README.md`. For a tour of the architecture as a whole, see `CLAUDE.md`.
