---
name: SQLite Migration with Drizzle
overview: Migrate from AsyncStorage to SQLite using Drizzle ORM, redesigning the schema to be fully relational with a comprehensive answer attempt log for detailed analytics.
todos:
  - id: setup-deps
    content: Install expo-sqlite, drizzle-orm, drizzle-kit and create drizzle.config.ts
    status: completed
  - id: define-schema
    content: Create all table schemas in src/db/schema/ with proper types and indexes
    status: completed
  - id: create-views
    content: Define SQL views for computed statistics (daily, category, study, mock)
    status: completed
  - id: query-layer
    content: Implement typed query functions in src/db/queries/ for all operations
    status: completed
  - id: refactor-settings
    content: Refactor settings.js to use SQLite settings table
    status: completed
  - id: refactor-mistakes
    content: Refactor engine.js to use SQLite mistakes table with streaks
    status: completed
  - id: refactor-stats
    content: Refactor stats.js to use views and answer_attempts queries
    status: completed
  - id: update-study
    content: Update study.tsx to track timing and log answer_attempts
    status: completed
  - id: update-mistakes-screen
    content: Update mistakes.tsx to track timing and log answer_attempts
    status: completed
  - id: update-mock
    content: Update mock.tsx to use mock_exams table and log all attempts
    status: completed
  - id: update-home-stats
    content: Update home.tsx and stats.tsx to use new query layer
    status: completed
  - id: cleanup
    content: Remove deprecated AsyncStorage code and test all functionality
    status: completed
isProject: false
---

# SQLite Migration with Drizzle ORM

## Overview

Migrate from AsyncStorage (3 JSON blobs) to a normalized SQLite database using `expo-sqlite` and `drizzle-orm`. The new schema will capture every answer attempt with full timing data, enabling rich future analytics while maintaining all existing functionality.

## Current State

**AsyncStorage Keys:**

- `DRIVING_MVP_SETTINGS` - User preferences (lang, onboarding, category selections, readiness mode)
- `DRIVING_MVP_PROGRESS` - Mistakes and streaks by language
- `DRIVING_MVP_STATS` - Aggregated statistics, mock history, engagement

**Limitations:**

- No per-attempt history (only aggregates)
- No timing data for study mode answers
- Denormalized JSON requires full read/write cycles
- Cannot query efficiently (e.g., "show all attempts for question X")

---

## New Database Schema

### Core Tables

#### 1. `settings`

Stores user preferences (single row for now, extensible for multi-user).

```typescript
// src/db/schema/settings.ts
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lang: integer('lang').notNull().default(1), // 1=SK, 2=EN, 3=HU
  hasOnboarded: integer('has_onboarded', { mode: 'boolean' }).notNull().default(false),
  hasChosenLanguage: integer('has_chosen_language', { mode: 'boolean' }).notNull().default(false),
  useConservativeReadiness: integer('use_conservative_readiness', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
```

#### 2. `category_selections`

Persisted category preference per language (normalized from `selectedCategoryByLang`).

```typescript
// src/db/schema/categorySelections.ts
export const categorySelections = sqliteTable('category_selections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lang: integer('lang').notNull(), // 1, 2, 3
  categoryText: text('category_text').notNull().default('all'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  langUnique: uniqueIndex('category_selections_lang_unique').on(table.lang),
}));
```

#### 3. `mistakes`

Active mistakes with streak tracking (replaces `mistakesByLang` + `streaksByLang`).

```typescript
// src/db/schema/mistakes.ts
export const mistakes = sqliteTable('mistakes', {
  id: text('id').primaryKey(), // UUID - sync-ready
  deviceId: text('device_id').notNull(), // which device created this
  lang: integer('lang').notNull(),
  questionId: text('question_id').notNull(), // qid from question bank
  streakCount: integer('streak_count').notNull().default(0), // consecutive correct answers
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }), // null = not synced
}, (table) => ({
  langQuestionUnique: uniqueIndex('mistakes_lang_question_unique').on(table.lang, table.questionId),
  langIdx: index('mistakes_lang_idx').on(table.lang),
}));
```

#### 4. `answer_attempts` (NEW - Full History Log)

Every single answer attempt with complete context and timing. Sync-ready with UUID primary key.

```typescript
// src/db/schema/answerAttempts.ts
export const answerAttempts = sqliteTable('answer_attempts', {
  id: text('id').primaryKey(), // UUID - sync-ready
  deviceId: text('device_id').notNull(), // which device created this
  lang: integer('lang').notNull(),
  questionId: text('question_id').notNull(),
  
  // Context
  mode: text('mode').notNull(), // 'study' | 'mock' | 'mistakes'
  sessionId: text('session_id').references(() => studySessions.id), // FK to study_sessions (study/mistakes modes)
  mockExamId: text('mock_exam_id').references(() => mockExams.id), // FK to mock_exams (mock mode)
  categoryText: text('category_text'), // category at time of attempt
  
  // Answer data
  selectedAnswerIndex: integer('selected_answer_index').notNull(), // 1, 2, or 3
  correctAnswerIndex: integer('correct_answer_index').notNull(), // 1, 2, or 3
  isCorrect: integer('is_correct', { mode: 'boolean' }).notNull(),
  points: integer('points').notNull(), // question point value
  
  // Timing (NEW - enables future analytics)
  questionShownAt: integer('question_shown_at', { mode: 'timestamp' }).notNull(),
  answerSubmittedAt: integer('answer_submitted_at', { mode: 'timestamp' }).notNull(),
  responseTimeMs: integer('response_time_ms').notNull(), // calculated
  
  // Metadata
  wasInMistakes: integer('was_in_mistakes', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }), // null = not synced
}, (table) => ({
  langIdx: index('answer_attempts_lang_idx').on(table.lang),
  questionIdx: index('answer_attempts_question_idx').on(table.questionId),
  modeIdx: index('answer_attempts_mode_idx').on(table.mode),
  sessionIdx: index('answer_attempts_session_idx').on(table.sessionId),
  dateIdx: index('answer_attempts_date_idx').on(table.createdAt),
  mockExamIdx: index('answer_attempts_mock_exam_idx').on(table.mockExamId),
  syncIdx: index('answer_attempts_sync_idx').on(table.syncedAt), // for finding unsynced records
}));
```

#### 5. `mock_exams`

Complete mock exam sessions (replaces `mock.history`). Sync-ready with UUID primary key.

```typescript
// src/db/schema/mockExams.ts
export const mockExams = sqliteTable('mock_exams', {
  id: text('id').primaryKey(), // UUID - sync-ready
  deviceId: text('device_id').notNull(), // which device created this
  lang: integer('lang').notNull(),
  testId: text('test_id').notNull(), // "L{lang}-T{testIndex}"
  
  // Timing
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  durationSec: integer('duration_sec'),
  
  // Results
  score: integer('score'),
  maxScore: integer('max_score').notNull(),
  minToPass: integer('min_to_pass').notNull(),
  passed: integer('passed', { mode: 'boolean' }),
  wrongCount: integer('wrong_count'),
  addedToMistakesCount: integer('added_to_mistakes_count').default(0),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }), // null = not synced
}, (table) => ({
  langIdx: index('mock_exams_lang_idx').on(table.lang),
  dateIdx: index('mock_exams_date_idx').on(table.createdAt),
  syncIdx: index('mock_exams_sync_idx').on(table.syncedAt),
}));
```

#### 6. `study_sessions` (NEW)

Track study/mistakes mode sessions for grouping. Sync-ready with UUID primary key.

```typescript
// src/db/schema/studySessions.ts
export const studySessions = sqliteTable('study_sessions', {
  id: text('id').primaryKey(), // UUID - sync-ready
  deviceId: text('device_id').notNull(), // which device created this
  lang: integer('lang').notNull(),
  mode: text('mode').notNull(), // 'study' | 'mistakes'
  categoryText: text('category_text'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  questionsCount: integer('questions_count').default(0),
  correctCount: integer('correct_count').default(0),
  syncedAt: integer('synced_at', { mode: 'timestamp' }), // null = not synced
}, (table) => ({
  langIdx: index('study_sessions_lang_idx').on(table.lang),
  dateIdx: index('study_sessions_date_idx').on(table.startedAt),
  syncIdx: index('study_sessions_sync_idx').on(table.syncedAt),
}));
```

---

### Database Views

Views provide computed statistics without storing redundant data.

#### 1. `v_questions_seen`

Unique questions seen per language (replaces `coverage.questionsSeen`).

```sql
CREATE VIEW v_questions_seen AS
SELECT DISTINCT lang, question_id
FROM answer_attempts;
```

**Usage:** `SELECT COUNT(*) FROM v_questions_seen WHERE lang = ?`

#### 2. `v_daily_stats`

Daily aggregates (replaces `study.daily`).

```sql
CREATE VIEW v_daily_stats AS
SELECT 
  lang,
  DATE(created_at / 1000, 'unixepoch') as study_date,
  COUNT(*) as attempts,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
  SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) as wrong
FROM answer_attempts
WHERE mode IN ('study', 'mistakes')
GROUP BY lang, DATE(created_at / 1000, 'unixepoch');
```

#### 3. `v_category_stats`

Per-category statistics (replaces `study.byCategory`).

```sql
CREATE VIEW v_category_stats AS
SELECT 
  lang,
  category_text,
  COUNT(*) as attempts,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
  SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) as wrong,
  ROUND(SUM(CASE WHEN is_correct THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as accuracy
FROM answer_attempts
WHERE category_text IS NOT NULL AND mode IN ('study', 'mistakes')
GROUP BY lang, category_text;
```

#### 4. `v_study_stats`

Lifetime study statistics (replaces `study.attempts/correct/wrong`).

```sql
CREATE VIEW v_study_stats AS
SELECT 
  lang,
  COUNT(*) as attempts,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
  SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) as wrong
FROM answer_attempts
WHERE mode IN ('study', 'mistakes')
GROUP BY lang;
```

#### 5. `v_mock_stats`

Mock exam aggregates (replaces `mock.examsTaken/examsPassed/bestScore`).

```sql
CREATE VIEW v_mock_stats AS
SELECT 
  lang,
  COUNT(*) as exams_taken,
  SUM(CASE WHEN passed THEN 1 ELSE 0 END) as exams_passed,
  MAX(score) as best_score,
  (SELECT score FROM mock_exams m2 
   WHERE m2.lang = mock_exams.lang 
   ORDER BY completed_at DESC LIMIT 1) as last_score
FROM mock_exams
WHERE completed_at IS NOT NULL
GROUP BY lang;
```

---

## Sync-Ready Design

All tables that store user-generated data are designed for future cloud sync:

### UUID Primary Keys

Tables use `text('id').primaryKey()` with UUIDs generated at insert time:

```typescript
// src/db/utils.ts
import * as Crypto from 'expo-crypto';

export function generateId(): string {
  return Crypto.randomUUID();
}
```

### Device Identification

Each record tracks which device created it:

```typescript
// src/db/device.ts
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'DEVICE_ID';

export async function getDeviceId(): Promise<string> {
  // Try to get existing device ID
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  
  if (!deviceId) {
    // Generate new device ID (installation-specific)
    deviceId = Application.getInstallationIdAsync 
      ? await Application.getInstallationIdAsync()
      : Crypto.randomUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  
  return deviceId;
}
```

### Sync Metadata

- `syncedAt: null` = record created locally, not yet synced
- `syncedAt: timestamp` = record has been synced to server

### Tables by Sync Strategy

| Table | Sync-Ready | Reason |

|-------|------------|--------|

| `answer_attempts` | Yes | High volume, primary analytics data |

| `study_sessions` | Yes | Session grouping for analytics |

| `mock_exams` | Yes | Exam history |

| `mistakes` | Yes | Current learning state |

| `settings` | No | Single row, upsert on sync |

| `category_selections` | No | Low volume, upsert on sync |

### Insert Example

```typescript
// Creating an answer attempt
import { generateId } from '../db/utils';
import { getDeviceId } from '../db/device';

const deviceId = await getDeviceId(); // cached after first call

await db.insert(answerAttempts).values({
  id: generateId(), // UUID generated at insert time
  deviceId,
  lang,
  questionId: question.qid,
  mode: 'study',
  sessionId: currentSessionId,
  // ... other fields
  syncedAt: null, // not synced yet
});
```

---

## Data Population Strategy

### On Migration (One-time)

No migration needed for existing data since you're the only user. Fresh start with new schema.

### Runtime Population

| Data | Source | When Populated |

|------|--------|----------------|

| `settings` | User actions | On first launch (defaults), on settings change |

| `category_selections` | User actions | When user selects category |

| `mistakes` | Answer logic | INSERT on wrong answer, DELETE when streak >= 2 |

| `answer_attempts` | Every answer | INSERT on every answer submission |

| `mock_exams` | Mock flow | INSERT on exam start, UPDATE on finish |

| `study_sessions` | Study/Mistakes | INSERT on screen open, UPDATE on leave |

### Computed Data (Views)

| View | Replaces | Computed From |

|------|----------|---------------|

| `v_questions_seen` | `coverage.questionsSeen` | `answer_attempts` |

| `v_daily_stats` | `study.daily` | `answer_attempts` |

| `v_category_stats` | `study.byCategory` | `answer_attempts` |

| `v_study_stats` | `study.attempts/correct/wrong` | `answer_attempts` |

| `v_mock_stats` | `mock.*` aggregates | `mock_exams` |

### Engagement Tracking

**Current streak** and **last study date** will be computed from `answer_attempts`:

```typescript
// Get current streak
async function getCurrentStreak(lang: number): Promise<number> {
  // Query distinct study dates, count consecutive days from today backwards
  const result = await db.execute(sql`
    WITH dates AS (
      SELECT DISTINCT DATE(created_at / 1000, 'unixepoch') as d
      FROM answer_attempts WHERE lang = ${lang}
    ),
    ranked AS (
      SELECT d, 
        DATE(d, '-' || ROW_NUMBER() OVER (ORDER BY d DESC) || ' days') as grp
      FROM dates
    )
    SELECT COUNT(*) as streak FROM ranked 
    WHERE grp = (SELECT grp FROM ranked WHERE d = DATE('now') OR d = DATE('now', '-1 day') LIMIT 1)
  `);
  return result[0]?.streak || 0;
}
```

---

## Project Structure

```
src/
├── db/
│   ├── index.ts           # Database connection & initialization
│   ├── migrate.ts         # Migration runner
│   ├── schema/
│   │   ├── index.ts       # Export all tables
│   │   ├── settings.ts
│   │   ├── categorySelections.ts
│   │   ├── mistakes.ts
│   │   ├── answerAttempts.ts
│   │   ├── mockExams.ts
│   │   └── studySessions.ts
│   ├── queries/
│   │   ├── settings.ts    # Settings CRUD
│   │   ├── mistakes.ts    # Mistake operations
│   │   ├── attempts.ts    # Answer attempt logging
│   │   ├── mockExams.ts   # Mock exam operations
│   │   ├── stats.ts       # Statistics queries (uses views)
│   │   └── engagement.ts  # Streak calculations
│   └── views.sql          # View definitions
├── lib/
│   ├── storage.js         # DEPRECATED - remove after migration
│   ├── stats.js           # REFACTOR - use db/queries/stats.ts
│   ├── settings.js        # REFACTOR - use db/queries/settings.ts
│   └── engine.js          # REFACTOR - use db/queries/mistakes.ts
drizzle/
├── migrations/            # Generated migration files
└── meta/                  # Drizzle migration metadata
drizzle.config.ts          # Drizzle Kit configuration
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "expo-sqlite": "~16.0.0",
    "drizzle-orm": "^0.39.0",
    "expo-crypto": "~14.1.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0"
  }
}
```

Note: `expo-application` is already included with Expo SDK for device identification.

---

## Implementation Approach

### Phase 1: Setup Database Infrastructure

- Install dependencies (`expo-sqlite`, `drizzle-orm`, `drizzle-kit`)
- Create `drizzle.config.ts` for Expo SQLite
- Set up database connection in `src/db/index.ts`
- Define all table schemas in `src/db/schema/`
- Generate initial migration with `drizzle-kit generate`

### Phase 2: Implement Query Layer

- Create typed query functions in `src/db/queries/`
- Implement CRUD for settings, category selections
- Implement mistake add/remove/streak logic
- Implement answer attempt logging with timing
- Implement mock exam session management
- Create view definitions and streak calculations

### Phase 3: Refactor Existing Code

- Replace `src/lib/storage.js` calls with new DB queries
- Refactor `src/lib/stats.js` to use views/queries
- Refactor `src/lib/settings.js` to use DB
- Refactor `src/lib/engine.js` for mistakes
- Update all screens to use new data layer

### Phase 4: Add Timing to UI

- Track `questionShownAt` timestamp when question loads
- Track `answerSubmittedAt` when user taps answer
- Calculate and store `responseTimeMs`
- Update Study, Mistakes, and Mock screens

### Phase 5: Testing and Cleanup

- Test all existing functionality works identically
- Remove old AsyncStorage code
- Delete deprecated files

---

## Key Files to Modify

| File | Changes |

|------|---------|

| `package.json` | Add expo-sqlite, drizzle-orm, drizzle-kit |

| `app/study.tsx` | Track timing, use new DB, log attempts |

| `app/mistakes.tsx` | Track timing, use new DB, log attempts |

| `app/mock.tsx` | Use new mock_exams table, log all attempts |

| `app/home.tsx` | Use new stats queries |

| `app/stats.tsx` | Use new stats queries and views |

| `app/settings.tsx` | Use new settings queries |

| `src/lib/smartPractice.js` | Use new DB for stats/progress |

| `src/lib/engine.js` | Refactor to use mistakes table |

---

## Future Analytics Enabled

With `answer_attempts` containing full timing data, you can later build:

- **Response time analysis**: Average time per question, by category
- **Learning curves**: How response time improves over attempts
- **Difficulty scoring**: Questions with longest average response time
- **Time-of-day patterns**: When user performs best
- **Session analysis**: Performance degradation over long sessions
- **Mistake patterns**: Questions frequently answered wrong, time spent on them
- **Spaced repetition optimization**: Optimal review intervals based on forgetting curves