---
name: Smart Study Enhancements
overview: Improve the Smart Study algorithm by persisting the recent questions window across sessions and implementing smarter question selection based on the rich answer attempt data now stored in the database.
todos:
  - id: persist-recent
    content: Add getRecentQuestionIds query and initialize recentQuestionIds from DB on study screen load
    status: completed
  - id: question-scoring
    content: Create per-question mastery scoring based on historical accuracy and response time
    status: completed
  - id: shaky-priority
    content: Add Priority 1.5 for 'shaky' questions (low accuracy or high hesitation)
    status: completed
  - id: time-weighted-categories
    content: Update category weakness calculation to weight recent performance more heavily
    status: completed
  - id: spaced-repetition
    content: Implement time-based spaced repetition for mistakes with next_review_at scheduling
    status: in_progress
isProject: false
---

# Smart Study Enhancements

## Current State

The smart study algorithm in [`src/lib/smartPractice.js`](src/lib/smartPractice.js) uses a 4-priority system:

1. **Mistakes** - Questions previously answered incorrectly
2. **Unseen** - Questions never attempted
3. **Weak categories** - Categories with lowest accuracy
4. **Random fallback**

### Problem: Lost Recent Questions Window

The 20-question anti-repetition window is stored in memory:

```49:app/study.tsx
const recentQuestionIds = useRef([]);
```

When exiting study mode, this resets to empty. On return, questions can repeat immediately.

---

## Proposed Enhancements

### 1. Persist Recent Questions Window (Quick Win)

**Solution:** Query the last N questions from `answer_attempts` on load instead of maintaining an in-memory array.

```sql
SELECT DISTINCT question_id 
FROM answer_attempts 
WHERE lang = ? AND mode IN ('study', 'mistakes')
ORDER BY created_at DESC 
LIMIT 20
```

**Changes:**

- Add new query in [`src/db/queries/attempts.ts`](src/db/queries/attempts.ts): `getRecentQuestionIds(lang, limit)`
- Modify [`app/study.tsx`](app/study.tsx): Initialize `recentQuestionIds` from DB on `loadData()`
- Keep the in-memory array for current session efficiency, but seed it from DB

---

### 2. Question-Level Performance Scoring (Medium Effort)

Currently, the algorithm only knows:

- Is this question in mistakes? (binary)
- Has this question been seen? (binary)

**Enhancement:** Calculate a per-question "mastery score" from historical attempts:

```sql
SELECT 
  question_id,
  COUNT(*) as attempts,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
  AVG(response_time_ms) as avg_response_time,
  MAX(created_at) as last_seen
FROM answer_attempts
WHERE lang = ? AND mode IN ('study', 'mistakes')
GROUP BY question_id
```

**Mastery formula:**

- `accuracy = correct / attempts`
- `recency_factor` = how long since last seen (older = higher priority)
- `hesitation_factor` = if avg_response_time > threshold (suggests uncertainty)

**New priority between "Mistakes" and "Unseen":**

- **Priority 1.5: "Shaky" Questions** - Questions with:
  - Low accuracy (30-60%) but not in mistakes
  - High response time (> 15 seconds avg)
  - Not seen in last 7 days

---

### 3. Spaced Repetition for Mistakes (Higher Effort)

Current mistake handling: Answer wrong → added to mistakes → answer right 2x → removed.

**Enhancement:** Use time-based intervals (simplified SM-2 algorithm):

- First correct answer: show again after 1 day
- Second correct answer: show again after 3 days
- Third correct answer: show again after 7 days
- Wrong answer: reset interval to 1 day

**Schema change:** Add to `mistakes` table (or create new `srs_schedule` table):

- `next_review_at` - timestamp for when to show again
- `interval_days` - current interval

**Algorithm change:** In `pickFromMistakes`:

- Only pick questions where `next_review_at <= now()`
- Order by `next_review_at ASC` (most overdue first)

---

### 4. Time-Weighted Category Weakness (Medium Effort)

Current: Category accuracy = all-time correct / all-time attempts

**Enhancement:** Weight recent performance more heavily:

- Last 7 days: 70% weight
- Last 30 days: 20% weight
- Older: 10% weight

This makes the algorithm responsive to current learning state rather than historical averages.

---

## Recommended Implementation Order

| Phase | Enhancement | Complexity | Impact |

|-------|-------------|------------|--------|

| 1 | Persist recent window | Low | High - directly fixes user's issue |

| 2 | Question-level scoring | Medium | High - smarter selection |

| 3 | Time-weighted categories | Medium | Medium - more responsive |

| 4 | Spaced repetition | High | High - but more complex |

---

## Phase 1 Implementation Details

### New Query: `getRecentQuestionIds`

Add to [`src/db/queries/attempts.ts`](src/db/queries/attempts.ts):

```typescript
export async function getRecentQuestionIds(
  lang: number, 
  limit: number = 20
): Promise<string[]> {
  const result = await database.getAllAsync(
    `SELECT DISTINCT question_id 
    FROM answer_attempts 
    WHERE lang = ? AND mode IN ('study', 'mistakes')
    ORDER BY created_at DESC 
    LIMIT ?`,
    [lang, limit]
  );
  return result.map((r: any) => r.question_id);
}
```

### Modify Study Screen

In [`app/study.tsx`](app/study.tsx), update `loadData()`:

```typescript
const loadData = useCallback(async () => {
  const currentLang = await getLanguage();
  setLang(currentLang);
  
  // ... existing code ...
  
  // Initialize recent questions from DB
  const recentFromDb = await AttemptsDB.getRecentQuestionIds(currentLang, 20);
  recentQuestionIds.current = recentFromDb;
  
  loadNewQuestion(currentLang, category);
}, []);
```

This single change preserves the recent window across app exits.