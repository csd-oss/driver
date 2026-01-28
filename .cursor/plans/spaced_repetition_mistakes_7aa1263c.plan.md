---
name: Spaced Repetition Mistakes
overview: Implement time-based spaced repetition for the mistakes system, replacing the simple "2 correct to remove" logic with interval-based scheduling (1 day, 3 days, 7 days) and prioritized review ordering.
todos:
  - id: drizzle-schema
    content: Update Drizzle schema in src/db/schema/mistakes.ts with nextReviewAt and intervalDays
    status: in_progress
  - id: generate-migration
    content: Run drizzle-kit generate to create migration SQL
    status: pending
  - id: update-migrator
    content: Update src/db/migrate.ts to use Drizzle migrator for expo-sqlite
    status: pending
  - id: query-getMistakes
    content: Modify getMistakes to filter by due date and order by most overdue
    status: completed
  - id: query-recordCorrect
    content: Replace incrementStreak with recordCorrectAnswer implementing interval progression
    status: completed
  - id: query-addMistake
    content: Update addMistake to reset interval and set next_review_at to now
    status: completed
  - id: engine-update
    content: Update applyAnswer in engine.js to use new recordCorrectAnswer
    status: completed
  - id: smartpractice-update
    content: Update pickFromMistakes to use ordered selection instead of random
    status: completed
isProject: false
---

# Spaced Repetition for Mistakes

## Current Behavior

The current mistakes system uses a simple streak counter:

- Wrong answer: Added to mistakes (or streak reset to 0)
- Correct answer: Streak incremented
- Streak reaches 2: Removed from mistakes

Questions are selected randomly from non-recent mistakes with no consideration of when they were last answered.

## Proposed Behavior

Implement time-based intervals (simplified SM-2):

| Correct Answers | Next Review | Interval |

|-----------------|-------------|----------|

| 1st correct | +1 day | 1 |

| 2nd correct | +3 days | 3 |

| 3rd correct | +7 days | 7 |

| 4th correct (when interval=7) | Removed | - |

| Wrong answer | +0 (now) | Reset to 0 |

Questions are shown only when `next_review_at <= now()`, ordered by most overdue first.

---

## Implementation

### 1. Schema Migration (Using Drizzle)

**Step 1: Update Drizzle schema** in [`src/db/schema/mistakes.ts`](src/db/schema/mistakes.ts):

```typescript
nextReviewAt: integer('next_review_at', { mode: 'timestamp' }),
intervalDays: integer('interval_days').notNull().default(0),
```

**Step 2: Generate migration** with drizzle-kit:

```bash
npx drizzle-kit generate
```

This creates a SQL migration file in `drizzle/migrations/` (e.g., `0001_add_srs_columns.sql`).

**Step 3: Update migration runner** in [`src/db/migrate.ts`](src/db/migrate.ts):

Import and use the Drizzle migrator for expo-sqlite:

```typescript
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../../drizzle/migrations';

// In runMigrations():
await migrate(db, migrations);
```

**Migration strategy for existing data:**

- SQLite `ALTER TABLE ADD COLUMN` sets `NULL` for existing rows by default
- `next_review_at = NULL` means immediately reviewable (no scheduling yet)
- `interval_days = 0` (default) means question will follow normal progression

---

### 2. Query Changes

Modify [`src/db/queries/mistakes.ts`](src/db/queries/mistakes.ts):

**`getMistakes(lang)` - Filter by due date:**

```typescript
// Only return questions due for review
WHERE lang = ? AND (next_review_at IS NULL OR next_review_at <= ?)
ORDER BY next_review_at ASC NULLS FIRST
```

**`incrementStreak()` - Replace with `recordCorrectAnswer()`:**

```typescript
export async function recordCorrectAnswer(lang: number, questionId: string): Promise<{ removed: boolean; nextInterval: number }> {
  // Interval progression: 0 → 1 → 3 → 7 → remove
  const INTERVALS = [1, 3, 7];
  
  const existing = await getMistakeRow(lang, questionId);
  if (!existing) return { removed: false, nextInterval: 0 };
  
  const currentInterval = existing.intervalDays;
  const nextIntervalIndex = INTERVALS.indexOf(currentInterval) + 1;
  
  if (currentInterval === 7) {
    // Mastered - remove from mistakes
    await removeMistake(lang, questionId);
    return { removed: true, nextInterval: 0 };
  }
  
  const nextInterval = INTERVALS[nextIntervalIndex] ?? INTERVALS[0];
  const nextReview = new Date(Date.now() + nextInterval * 24 * 60 * 60 * 1000);
  
  await updateMistake(lang, questionId, {
    intervalDays: nextInterval,
    nextReviewAt: nextReview,
    streakCount: existing.streakCount + 1,
  });
  
  return { removed: false, nextInterval };
}
```

**`addMistake()` - Reset interval on wrong:**

```typescript
// Reset to interval 0, next_review_at = now (immediately due)
streakCount: 0,
intervalDays: 0,
nextReviewAt: new Date(),
```

---

### 3. Engine Update

Update [`src/lib/engine.js`](src/lib/engine.js) `applyAnswer()`:

```javascript
if (isCorrect) {
  const result = await MistakesDB.recordCorrectAnswer(lang, qid);
  // result.removed indicates if question was mastered
} else {
  await MistakesDB.addMistake(lang, qid);
}
```

---

### 4. Smart Practice Selection

Update [`src/lib/smartPractice.js`](src/lib/smartPractice.js) `pickFromMistakes()`:

- Remove random selection
- Use the pre-sorted order from `getMistakes()` (most overdue first)
- Still respect the MIN_GAP anti-repetition window
```javascript
const pickFromMistakes = ({ lang, selectedCategory, recentIds, mistakes, seenSet }) => {
  // mistakes is already sorted by next_review_at ASC (most overdue first)
  
  // Filter by category
  let candidates = selectedCategory === 'all' 
    ? [...mistakes] 
    : filterByCategory(lang, mistakes, selectedCategory);
  
  // Find first candidate not in recent window
  for (const qid of candidates) {
    if (!isRecent(qid, recentIds)) {
      return findQuestionById(lang, qid);
    }
  }
  
  // Fallback: check MIN_GAP window
  const recentWindow = recentIds.slice(-MIN_GAP);
  for (const qid of candidates) {
    if (!recentWindow.includes(qid)) {
      return findQuestionById(lang, qid);
    }
  }
  
  return null;
};
```


---

### 5. UI Updates (Optional)

Consider showing interval status in the mistakes review screen ([`app/mistakes.tsx`](app/mistakes.tsx)):

- "Due now" / "Due in 2 days" indicator
- Visual distinction between intervals (color coding)

---

## Files to Modify

- [`src/db/schema/mistakes.ts`](src/db/schema/mistakes.ts) - Add `nextReviewAt`, `intervalDays` fields
- `drizzle/migrations/` - Generated migration SQL (via `drizzle-kit generate`)
- [`src/db/migrate.ts`](src/db/migrate.ts) - Update to use Drizzle migrator
- [`src/db/queries/mistakes.ts`](src/db/queries/mistakes.ts) - Update queries for SRS logic
- [`src/lib/engine.js`](src/lib/engine.js) - Call new `recordCorrectAnswer()`
- [`src/lib/smartPractice.js`](src/lib/smartPractice.js) - Ordered selection instead of random

---

## Edge Cases

- **Existing mistakes**: `next_review_at = NULL` means immediately due
- **App offline for days**: Overdue questions show immediately, sorted by how overdue
- **Category filter**: Still respected, but within category uses due-date ordering
- **Mistakes screen**: Shows all mistakes (including not-yet-due) for manual review