# CURRENT STATE SPECIFICATION — Driver SK (Slovakia Driving Exam App)

**Last Updated:** January 28, 2026  
**Version:** 2.0.0  
**Status:** Production MVP (SQLite Migration Complete)

---

## EXECUTIVE SUMMARY

**Driver SK** is a fully functional Expo React Native mobile application designed to help users prepare for Slovakia driving license exams. The app provides comprehensive question bank access, adaptive study modes with intelligent question selection, mistake tracking, mock exam simulations, exam readiness scoring, and multi-language support (Slovak, English, Hungarian). All functionality works completely offline with local SQLite database storage and embedded images. The app uses Drizzle ORM for type-safe database operations and comprehensive answer attempt logging with full timing data for future analytics.

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
1. **Onboarding Experience** - Premium onboarding flow with animated dot indicators, Slovakia-branded first slide, and clear value proposition across 5 slides
2. **Smart Study** - Adaptive question selection prioritizing mistakes, unseen questions, and weak categories
3. **Smart Study Reason Labels** - Visual indicators explaining why each question was selected (mistake, new question, weak area, review)
4. **Mistakes Review** - Focused practice on incorrectly answered questions with clear answer indicators
5. **Mock Exams** - Full exam simulation with timer, scoring, and interactive results review
6. **Category Filtering** - Study by topic categories (e.g., traffic signs, rules)
7. **Progress Tracking** - Mistake tracking with mastery system (2 correct answers removes from mistakes)
8. **Statistics Dashboard** - Comprehensive statistics tracking with visual emphasis (hero progress summary, coverage bar, and 7-day activity bars)
9. **Exam Readiness Score** - Composite metric (0-100%) combining mistakes, performance, mock exams, and coverage with configurable calculation modes
10. **Multi-language Support** - Slovak (1), English (2), Hungarian (3)
11. **Offline Operation** - All data and images stored locally
12. **Question Detail Modal** - Interactive review of wrong answers with full question context
13. **Smart Practice Algorithm** - Intelligent question prioritization system that adapts to user's learning state

### 1.3 Business Rules
- **Scoring:** Each question has point value (`body`), exam pass threshold is `minbody` points
- **Answer Format:** 1-based indexing (answers are 1, 2, or 3)
- **Mistake Removal:** Questions are removed from mistakes after 2 consecutive correct answers
- **Language Isolation:** Progress (mistakes/streaks) is tracked separately per language
- **Category Persistence:** Selected category preference is saved per language

---

## 2. LOGICAL CONTEXT & USER FLOWS

### 2.1 Application Flow

```
App Launch
  ├─ Check hasOnboarded flag
  │   ├─ false → IntroAnimation → Onboarding (5 slides) → LanguageSelect → Home
  │   └─ true → Home (direct)
  │
  ├─ Onboarding Screen (first-time users)
  │   ├─ 5 swipeable slides with animated dot indicators
  │   ├─ Skip button (top right) to exit early
  │   ├─ Change Language link (top left) → LanguageSelect (returns to onboarding)
  │   ├─ Next/Previous buttons for navigation
  │   ├─ Tappable dots to jump to specific slides
  │   └─ Get Started button on final slide → LanguageSelect → Home
  │
  └─ Home Screen
      ├─ Your Progress Card (readiness score + accuracy + streak) → StatisticsScreen
      ├─ Smart Study → StudyScreen (adaptive question selection)
      ├─ Mistakes → MistakesScreen (review incorrect answers)
      ├─ Mock Exam → MockScreen (full exam simulation)
      ├─ Settings → SettingsScreen (language selection + readiness mode toggle)
      └─ Reset Progress → Clears mistakes/streaks (keeps language/onboarding)
```

### 2.2 Study Mode Flow
1. User selects Smart Study from Home
2. Screen loads current language and progress
3. Category selector displayed (default: "All")
4. Smart Study algorithm selects question using priority system:
   - **Priority 1:** Questions from mistakes list (if any)
   - **Priority 2:** Unseen questions (never displayed before)
   - **Priority 3:** Questions from weakest category (lowest accuracy)
   - **Priority 4:** Random fallback (if all above exhausted)
   - Category filter applied at each priority level
   - **Anti-repetition:** Two-tier system prevents frequent repetition:
     - First excludes last 20 questions shown
     - If all candidates are recent, applies minimum gap (15 for mistakes, 5 for others)
     - If all within minimum gap → skips to next priority
5. User selects answer → immediate feedback (Correct/Wrong)
6. Progress updated:
   - Wrong answer → added to mistakes, streak reset to 0
   - Correct answer → if in mistakes, increment streak; if streak ≥ 2, remove from mistakes
7. "Next" button loads new question via Smart Practice algorithm

### 2.3 Mistakes Review Flow
1. User selects Mistakes from Home
2. Screen loads mistakes list for current language
3. Category filter applied (if selected)
4. Mistakes shuffled for random order
5. One question displayed at a time
6. User answers → feedback → progress updated
7. If question mastered (2 correct), removed from list automatically
8. Navigation handles empty states gracefully

### 2.4 Mock Exam Flow
1. User selects Mock Exam from Home
2. Random test selected from official test bank
3. Timer starts (if test has time limit)
4. Questions displayed one at a time with navigation bar
5. User navigates between questions, answers stored
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
  ├─ hasOnboarded: boolean
  ├─ hasChosenLanguage: boolean
  └─ useConservativeReadiness: boolean (default: false)
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
  ├─ createdAt: timestamp
  ├─ updatedAt: timestamp
  └─ syncedAt: timestamp | null (for future cloud sync)
```

**Answer Attempts (`answer_attempts` table - NEW):**
```
SQLite → answer_attempts (complete history log)
  ├─ id: text (UUID, sync-ready)
  ├─ deviceId: text
  ├─ lang: integer
  ├─ questionId: text
  ├─ mode: text ('study' | 'mock' | 'mistakes')
  ├─ sessionId: text (FK to study_sessions, nullable)
  ├─ mockExamId: text (FK to mock_exams, nullable)
  ├─ categoryText: text (nullable)
  ├─ selectedAnswerIndex: integer (1, 2, or 3)
  ├─ correctAnswerIndex: integer (1, 2, or 3)
  ├─ isCorrect: boolean
  ├─ points: integer
  ├─ questionShownAt: timestamp (NEW - timing data)
  ├─ answerSubmittedAt: timestamp (NEW - timing data)
  ├─ responseTimeMs: integer (NEW - calculated timing)
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

**Study Sessions (`study_sessions` table - NEW):**
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

**Statistics (Computed from Database Views):**
All statistics are computed on-demand from `answer_attempts` and `mock_exams` tables using SQL views:
- `v_study_stats` - Lifetime study statistics (attempts, correct, wrong)
- `v_daily_stats` - Daily aggregates for last 14 days
- `v_category_stats` - Per-category statistics with accuracy
- `v_mock_stats` - Mock exam aggregates (exams taken, passed, best/last score)
- `v_questions_seen` - Unique questions seen per language

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
- **expo-sqlite:** ~16.0.0 (SQLite database for local storage)
- **drizzle-orm:** ^0.39.0 (Type-safe ORM for SQLite)
- **expo-crypto:** ~14.1.0 (UUID generation for sync-ready primary keys)
- **drizzle-kit:** ^0.30.0 (dev) (Migration generation and schema management)
- **@react-native-async-storage/async-storage:** 2.2.0 (DEPRECATED - used only for device ID caching)

**Internationalization:**
- **i18n-js:** ^4.5.1
- **expo-localization:** ~17.0.8

**UI/UX:**
- **expo-haptics:** ~15.0.8
- **expo-image:** ~3.0.11
- **react-native-safe-area-context:** ~5.6.0
- **react-native-reanimated:** ~4.1.1

**Platform Support:**
- iOS (with new architecture enabled)
- Android (edge-to-edge enabled)
- Web (static output)

### 3.2 Architecture Overview

**Pattern:** Component-based architecture with separation of concerns

**Layers:**
1. **Presentation Layer** (`app/`): Screen components using Expo Router
2. **Business Logic Layer** (`src/lib/`): Core functionality (bank, engine, settings, categories)
3. **Database Layer** (`src/db/`): SQLite database with Drizzle ORM, queries, and migrations
4. **Data Layer** (`data/`): Static question data and image manifest
5. **UI Components** (`components/ui/`): Reusable UI primitives
6. **Storage Layer** (`src/lib/storage.js`): DEPRECATED - AsyncStorage wrapper (kept for backward compatibility)

### 3.3 File Structure

```
driver/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout with Stack navigator
│   ├── index.tsx                 # IntroAnimation screen
│   ├── onboarding.tsx            # Onboarding flow (5 slides)
│   ├── language.tsx              # Language selection
│   ├── home.tsx                  # Home screen (with progress preview card)
│   ├── study.tsx                 # Study mode
│   ├── mistakes.tsx              # Mistakes review
│   ├── mock.tsx                  # Mock exam
│   ├── stats.tsx                 # Statistics dashboard
│   └── settings.tsx             # Settings
│
├── src/
│   ├── db/                       # Database layer (SQLite + Drizzle)
│   │   ├── index.ts              # Database connection & initialization
│   │   ├── migrate.ts            # Migration runner (creates tables & views)
│   │   ├── utils.ts              # UUID generation utilities
│   │   ├── device.ts             # Device ID management
│   │   ├── schema/               # Drizzle table schemas
│   │   │   ├── index.ts          # Export all tables
│   │   │   ├── settings.ts      # Settings table
│   │   │   ├── categorySelections.ts
│   │   │   ├── mistakes.ts       # Mistakes table (sync-ready)
│   │   │   ├── answerAttempts.ts # Answer attempts table (sync-ready)
│   │   │   ├── mockExams.ts     # Mock exams table (sync-ready)
│   │   │   └── studySessions.ts # Study sessions table (sync-ready)
│   │   ├── queries/             # Typed query functions
│   │   │   ├── settings.ts      # Settings CRUD
│   │   │   ├── categorySelections.ts
│   │   │   ├── mistakes.ts      # Mistake operations
│   │   │   ├── attempts.ts      # Answer attempt logging
│   │   │   ├── mockExams.ts     # Mock exam operations
│   │   │   ├── studySessions.ts # Study session management
│   │   │   ├── stats.ts         # Statistics queries (uses views)
│   │   │   └── engagement.ts    # Streak calculations
│   │   └── views.sql             # SQL view definitions
│   ├── lib/                      # Business logic
│   │   ├── bank.js              # Question bank helpers
│   │   ├── engine.js             # Learning engine (mistakes/streaks) - uses DB
│   │   ├── settings.js           # Settings management - uses DB
│   │   ├── storage.js            # DEPRECATED - AsyncStorage wrapper
│   │   ├── stats.js              # Statistics tracking - uses DB views
│   │   ├── categories.js         # Category helpers
│   │   └── smartPractice.js      # Smart Practice algorithm - uses DB
│   │
│   └── i18n/                     # Internationalization
│       ├── i18n.js               # Translation function
│       └── strings.js             # Translation strings
│
├── components/
│   ├── ui/                       # UI primitives
│   │   ├── screen.js             # Screen wrapper
│   │   ├── card.js               # Card component
│   │   ├── button.js             # Button component
│   │   ├── text.js               # Typography component
│   │   ├── divider.js            # Divider component
│   │   ├── header.js             # Header component
│   │   └── icon-symbol.tsx       # Icon component
│   │
│   └── CategorySelector.tsx      # Category selection UI
│
├── data/
│   ├── data5.js                  # Official question data (ES module)
│   ├── imageManifest.js          # Static image require map
│   └── minv_images/              # Local image files (90 files)
│
├── drizzle/                      # Drizzle migration files (future)
│   ├── migrations/               # Generated migration SQL files
│   └── meta/                     # Migration metadata
├── drizzle.config.ts             # Drizzle Kit configuration
├── scripts/
│   ├── genImageManifest.mjs      # Image manifest generator
│   └── reset-project.js          # Project reset utility
│
├── contexts/
│   └── FontScaleContext.tsx      # Font scaling context
│
├── hooks/                        # Custom React hooks
├── constants/                    # App constants
└── assets/                       # Static assets
```

### 3.4 Key Implementation Details

#### 3.4.1 Navigation (Expo Router)
- **File-based routing:** Each screen is a file in `app/` directory
- **Stack Navigator:** Configured in `app/_layout.tsx`
- **Conditional Initial Route:** Based on `hasOnboarded` flag
- **No headers:** All screens use custom Header component

#### 3.4.2 Question Bank System (`src/lib/bank.js`)
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
- **State Management:** Immutable state updates
- **Logic:**
  - Wrong answer → add to mistakes (no duplicates), reset streak to 0
  - Correct answer → if in mistakes, increment streak; if streak ≥ 2, remove
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
    - `reason`: Object with `type` (one of: `mistake`, `unseen`, `weak`, `random`) and optional `category` (for `weak` type)
- **Helper Functions:**
  - `pickFromMistakes(...)` - Priority 1: Select from mistakes list
  - `pickUnseen(...)` - Priority 2: Select questions never seen
  - `pickFromWeakCategory(...)` - Priority 3: Select from weakest category
  - `isRecent(qid, recentIds)` - Check if question is in recent list
  - `pushRecent(qid, recentIds, max=20)` - Add to recent list (maintains max size)
- **Priority System:**
  1. Mistakes (highest priority) - Questions user got wrong → reason type: `mistake`
  2. Unseen Questions - Questions never displayed → reason type: `unseen`
  3. Weak Categories - Questions from categories with lowest accuracy → reason type: `weak` (includes category name)
  4. Random Fallback - Existing random selection if all above exhausted → reason type: `random`
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
- **Readiness Strings:** Title, status labels (Ready/Getting there/Needs work), component names, weight labels, warnings

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
3. **`mistakes`** - Active mistakes with streak tracking (sync-ready with UUID)
4. **`answer_attempts`** - Complete history log of every answer attempt with timing data (sync-ready)
5. **`mock_exams`** - Mock exam sessions and results (sync-ready)
6. **`study_sessions`** - Study/mistakes mode session tracking (sync-ready)

**Database Views (Computed Statistics):**
- `v_questions_seen` - Unique questions seen per language
- `v_daily_stats` - Daily aggregates (last 14 days)
- `v_category_stats` - Per-category statistics with accuracy
- `v_study_stats` - Lifetime study statistics
- `v_mock_stats` - Mock exam aggregates

**Migration System:**
- **Current (v2.0.0):** Manual table creation in `src/db/migrate.ts` (runs on app startup)
  - Uses raw SQL with `CREATE TABLE IF NOT EXISTS` for idempotency
  - No versioning or migration tracking
  - Suitable for initial migration and fresh installs
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
- `getCurrentStreak(lang)` - Calculated from distinct study dates in `answer_attempts`
- `getLastStudyDate(lang)` - Most recent study date
- `getLastOpenedDate(lang)` - Most recent activity date
- **Readiness Score Functions:**
  - `calculateReadinessScore(lang, mistakesCount, stats, useConservative)` - Calculate composite readiness score (0-100%)
    - Combines: Mistakes (30%), Performance (25%), Mock Exams (30%), Coverage (15%)
    - Respects `useConservative` setting for insufficient data handling
  - `getReadinessBreakdown(lang, mistakesCount, stats, useConservative)` - Get detailed breakdown with component scores
    - Returns overall score and component details (score, weight, metadata, warnings)
- **Helper Functions:**
  - `todayKey()`, `yesterdayKey()` - Date utilities (yyyyMMdd format)
  - `getLast7Days()` - Get last 7 days date keys
  - `calculateAccuracy(attempts, correct)` - Calculate percentage
  - `calculateCoverage(lang, questionsSeen)` - Calculate question coverage percentage
  - `getTotalUniqueQuestions(lang)` - Get total unique questions count
  - `pruneDaily(stats, keepDays)` - Remove old daily entries
  - `capHistory(history, max)` - Limit history array size
- **Tracking Rules:**
  - Every answer attempt logged to `answer_attempts` table with full timing
  - Questions marked as "seen" when displayed (computed from `answer_attempts`)
  - Streak calculated from distinct study dates in `answer_attempts`
  - Daily stats computed from `answer_attempts` (no pruning needed - views filter by date)
  - Mock history stored in `mock_exams` table (no artificial cap, can query last N)
  - Coverage computed from distinct `question_id` values in `answer_attempts`
- **Readiness Score Calculation:**
  - **Mistake Score (30%):** Requires minimum 10% coverage OR 50 questions seen; otherwise 0% (strict) or capped at 30% (conservative)
  - **Performance Score (25%):** Requires minimum 10 attempts in last 7 days; otherwise 0% (strict) or capped at 30% (conservative)
  - **Mock Exam Score (30%):** Overall pass rate (60% weight) + recent 3 exams performance (40% weight); 0% if no exams taken
  - **Coverage Score (15%):** Percentage of questions seen vs total

### 3.5 Screen Implementations

#### IntroAnimation (`app/index.tsx`)
- **Animation:** Letter-by-letter fade, scale, and lift animation
- **Duration:** ~3-4 seconds total
- **Navigation:** Routes to `/onboarding` or `/home` based on onboarding status

#### Onboarding (`app/onboarding.tsx`)
- **Purpose:** Premium onboarding experience for first-time users
- **Slides (5 total):**
  1. **Slovak Driving License** (🪪) - Welcome slide with 🇸🇰 Slovakia badge, explains app purpose
  2. **Study Smarter** (🎯) - Adaptive algorithm benefits
  3. **No Mistake Left Behind** (💪) - Mistake tracking feature
  4. **Realistic Practice Tests** (⏱️) - Mock exam with 20-minute timer
  5. **Watch Yourself Improve** (🏆) - Progress and readiness tracking
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
- **Completion:** Sets `hasOnboarded=true`, navigates to Language screen (or Home if language already chosen)

#### LanguageSelect (`app/language.tsx`)
- **Options:** 3 language buttons (Slovak, English, Hungarian)
- **Visual Highlight:** Amber-colored notice box emphasizing "Questions will be in this language"
- **Action:** Sets language, sets `hasChosenLanguage=true`, navigates to onboarding (if from onboarding) or home

#### Home (`app/home.tsx`)
- **Display:** 
  - "YOUR PROGRESS" card (pressable) showing:
    - **Exam Readiness Score** (0-100%) with progress bar and color-coded status (Ready/Getting there/Needs work)
    - Accuracy (last 7 days)
    - Current streak
  - Feature buttons (Study, Mistakes, Mock, Settings)
  - Reset progress option
- **Data:** Loads language, progress, statistics, and readiness score on focus
- **Navigation:** Routes to Study, Mistakes, Mock, Settings, Statistics
- **Readiness Score:** Calculated using current settings (strict or conservative mode)

#### Study (`app/study.tsx`)
- **Features:**
  - Category selector
  - Smart Practice question selection (adaptive algorithm)
  - **Reason label pill** - Displays why question was selected (e.g., "Fixing a mistake", "New question", "Weak area: Traffic signs", "Review question")
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
  - Overview Card:
    - Mistakes remaining
    - Study attempts (lifetime)
    - Accuracy (lifetime)
    - Accuracy (last 7 days)
    - Question coverage (X / Y questions seen, Z%)
  - **Exam Readiness Card:**
    - Overall readiness score (0-100%) with progress bar and status badge
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
    - Exams taken
    - Pass rate
    - Best score
    - Last score
    - Empty state if no exams taken
  - Consistency Card:
    - Current streak
    - Last study date (formatted: "Today", "Yesterday", or date)
- **Data:** Loads statistics, progress, and readiness breakdown on focus
- **Calculations:** All metrics calculated from stored statistics data, readiness score respects user's calculation mode preference

#### Settings (`app/settings.tsx`)
- **Features:** 
  - Language selection buttons (Slovak, English, Hungarian)
  - **Readiness Score Mode Toggle:**
    - Switch to toggle between "Strict mode" (insufficient data = 0%) and "Conservative mode" (insufficient data = partial scores capped at 30%)
    - Setting persists across app sessions
- **Action:** Updates language immediately, clears cache; updates readiness mode preference

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

- **Missing Images:** Placeholder text displayed, no crashes
- **Missing Questions:** "Question not found" message, reload option
- **Empty States:** Proper empty state UI for mistakes, categories
- **Database Errors:** Console errors logged, graceful degradation, migration errors don't crash app
- **Invalid Data:** Fallbacks to defaults (lang 1, empty arrays)
- **Migration Failures:** Tables created with `IF NOT EXISTS` for idempotency
- **Sync Errors:** Future sync operations will handle conflicts gracefully (local-first approach)

### 3.9 Platform-Specific Considerations

- **iOS:** Uses Avenir Next font, supports Dynamic Type scaling
- **Android:** Uses sans-serif-medium, edge-to-edge enabled
- **Web:** Static output, favicon support
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
- **expo-sqlite:** ~16.0.0 (SQLite database)
- **drizzle-orm:** ^0.39.0 (Type-safe ORM)
- **drizzle-kit:** ^0.30.0 (Migration management - dev dependency)
- **expo-crypto:** ~14.1.0 (UUID generation)
- **@react-native-async-storage/async-storage:** 2.2.0 (Deprecated - used only for device ID caching)
- **i18n-js:** ^4.5.1

### 4.2 Configuration Files

**app.json:**
- App name: "Driver SK"
- Bundle ID: com.mishabuyalo.driver
- New architecture enabled
- Splash screen configured
- Typed routes enabled
- React compiler enabled

**tailwind.config.js:**
- Content paths: app, src, components
- NativeWind preset

**babel.config.js:**
- NativeWind babel plugin

**metro.config.js:**
- Standard Expo Metro configuration

**drizzle.config.ts:**
- Schema path: `./src/db/schema/index.ts`
- Migration output: `./drizzle/migrations`
- Dialect: `sqlite`
- Used for generating migrations with `npx drizzle-kit generate`

---

## 5. KNOWN LIMITATIONS & FUTURE CONSIDERATIONS

### 5.1 Current Limitations
1. **No Backend:** All data is local, no sync across devices (schema is sync-ready for future implementation)
2. **No User Accounts:** No login or user profiles
3. **No Offline Updates:** Question data updates require app update
4. **Timer Only in Mock:** Study mode has no timer
5. **No Charts:** Statistics displayed as text/metrics only (no visual charts)
6. **Manual Migrations:** Current migration system uses manual SQL (will migrate to Drizzle Kit versioning)
7. **No Migration Versioning:** Tables created directly without migration tracking (planned for future)

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
npx expo start
```

### 6.2 Generating Image Manifest
```bash
node scripts/genImageManifest.mjs
```

### 6.3 Project Reset
```bash
npm run reset-project
```

### 6.4 Code Style
- Uses ESLint with Expo config
- TypeScript for database layer (`src/db/`), some components (CategorySelector, contexts)
- JavaScript for most screens and lib files
- NativeWind for styling (className prop)

### 6.5 Database Migrations

**Current Approach (v2.0.0):**
- Manual table creation in `src/db/migrate.ts` using raw SQL
- Tables created with `CREATE TABLE IF NOT EXISTS` for idempotency
- Views created on app startup via `CREATE VIEW IF NOT EXISTS`
- No migration versioning (tables created if missing)
- Migration function `runMigrations()` called on app startup in `app/_layout.tsx`
- Suitable for initial migration and fresh installs
- **Limitation:** Cannot track schema evolution or rollback changes

**Future Migration Strategy (Planned):**
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
   - Migration metadata stored in `drizzle/meta/` directory

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

**Manual Testing:**
- ✅ All screens render correctly
- ✅ Navigation flows work
- ✅ Onboarding flow: All 5 slides display correctly with proper content
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
- ✅ Home progress card: Displays readiness score, accuracy, and streak correctly
- ✅ Smart Practice Mode: Adaptive question selection prioritizes mistakes, unseen questions, and weak categories
- ✅ Anti-repetition: Two-tier system prevents frequent repetition (20-question window + minimum gaps: 15 for mistakes, 5 for others)
- ✅ Smart Study Reason Labels: Reason pills display correctly for all question types (mistake, unseen, weak, random)
- ✅ Points Display: Points bubble displays correctly on right side with proper styling
- ✅ Readiness Score: Composite score calculates correctly with all four components
- ✅ Readiness Score Display: Home screen shows score with progress bar and color-coded status
- ✅ Readiness Breakdown: Statistics screen shows detailed component breakdown with weights and warnings
- ✅ Readiness Mode Toggle: Settings screen allows switching between strict and conservative modes
- ✅ Insufficient Data Handling: Minimum thresholds work correctly for mistakes and performance components
- ✅ Mock Exam Integration: Mock exam scores contribute correctly to readiness calculation

**Automated Testing:**
- Not implemented (future consideration)

---

## END OF CURRENT STATE SPECIFICATION

This document reflects the current implementation state as of January 28, 2026. 

**Recent Updates (v2.0.0):**
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
  - 5-slide onboarding flow with clear Slovakia driving exam focus
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
