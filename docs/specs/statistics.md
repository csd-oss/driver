# Feature: Statistics / Progress (with Local Tracking)

## Goal

Add a Statistics screen that makes the app feel like a “serious exam prep product” by tracking:
- Study performance (attempts, accuracy, trends)
- Mistake reduction progress
- Mock exam performance (history, pass rate, improvement)
- Engagement (streak, last activity)

All data is stored locally and tracked separately per language.

---

## Non-Goals

- No backend or accounts
- No charts required in v1 (optional later)
- No complicated analytics/events platform

---

## Entry Points

1. Home screen top card (currently “Mistake Count”) becomes “Your Progress”
2. Tapping the card opens Statistics screen

---

## Home Screen Card (Updated)

Replace current card:

> MISTAKE COUNT

With:

**YOUR PROGRESS**
- Mistakes left: X
- Accuracy (7d): Y%
- Streak: Z days

Tap → Statistics screen

Notes:
- If no study data exists, show:
  - Accuracy: “—”
  - Streak: 0

---

## New Data Model (Local)

### Storage Key
Add new key:
- `DRIVING_MVP_STATS`

Keep existing:
- `DRIVING_MVP_PROGRESS` (mistakes/streaks)

### Stats Structure
```ts
type StatsState = {
  statsByLang: {
    [lang: "1" | "2" | "3"]: {
      // --- Study counters (lifetime) ---
      study: {
        attempts: number            // total answers submitted in Study + Mistakes screens
        correct: number
        wrong: number

        // Rolling window (last 7 days) for "recent accuracy"
        daily: {
          [yyyyMMdd: string]: { attempts: number; correct: number; wrong: number }
        }

        // Optional: per-category counters (only if category is selected)
        byCategory?: {
          [categoryName: string]: { attempts: number; correct: number; wrong: number }
        }
      }

      // --- Mock exam tracking ---
      mock: {
        examsTaken: number
        examsPassed: number
        bestScore: number            // highest achieved score
        lastScore: number            // last exam score
        history: Array<{
          id: string                 // uuid
          date: number               // timestamp ms
          testId: string             // stable identifier (see "Mock Test ID Strategy")
          score: number
          maxScore: number
          minToPass: number
          passed: boolean
          durationSec?: number       // optional, if timer exists
          wrongCount?: number        // optional
          addedToMistakesCount?: number // optional
        }>
      }

      // --- Engagement ---
      engagement: {
        currentStreak: number
        lastStudyDate: string | null  // yyyyMMdd
        lastOpenedDate: string | null  // yyyyMMdd (optional)
      }
    }
  }
}
```

---

## Tracking Rules

### Study Attempts Tracking (Study + Mistakes screens)
When user taps an answer (first submission only):
- Increment `study.attempts`
- Increment `study.correct` OR `study.wrong`
- Update `study.daily[today]` counters
- If category is selected and not "All", update `study.byCategory[category]`

Notes:
- Count only the first answer per question view (avoid double counting if they tap again).
- Works identically in Study and Mistakes screens.

### Streak Tracking
Definition: A day counts if the user answers ≥ 1 question (Study or Mistakes) or if 1 mock exam passed.

On first answer of the day:
- If `lastStudyDate` is yesterday → `currentStreak += 1`
- If `lastStudyDate` is today → no change
- Otherwise → `currentStreak = 1`
- Set `lastStudyDate = today`

### Mock Exam Tracking
When user taps “Finish” and results are computed:
- Increment `mock.examsTaken`
- If passed → increment `mock.examsPassed`
- Update `mock.lastScore`
- Update `mock.bestScore` if higher
- Push history item into `mock.history` (newest first)
- Optional: cap history to last 50 entries to keep storage small

Additionally, when user taps “Add wrong to mistakes”:
- Update the most recent history item’s `addedToMistakesCount`

---

## Mock Test ID Strategy

The test data does not expose a clean test ID.
We need a stable identifier to associate history entries.

Proposed approach:
- Use `(lang)-(testIndex)` from `getRandomTest(lang)` selection.
- Store as `testId = "L{lang}-T{testIndex}"`

This is stable as long as test array order doesn’t change (good enough for v1).

---

## Statistics Screen Layout (v1)

### Header
Title: **Statistics**
Subtitle: language-specific, same as app language context

---

### Section 1 — Overview

Card: **Your Progress**
- Mistakes remaining: X
- Study attempts: A
- Accuracy (lifetime): B%
- Accuracy (last 7 days): C%
- Mastered count (optional): M

Mastered definition (simple):
- `mastered = totalUniqueQuestionsSeen - mistakesRemaining`
If unique tracking is not implemented yet, omit mastered for v1.

---

### Section 2 — Study Trends (no charts required)

Card: **Last 7 days**
List rows (today → 6 days ago):
- Day label (Mon/Tue or date)
- Attempts
- Accuracy %

If no data: show empty state text:
> "Start studying to see your progress here."

---

### Section 3 — Mock Exams

Card: **Mock Exams**
- Exams taken: X
- Pass rate: Y%
- Best score: Z / maxScore
- Last score: W / maxScore

CTA row (optional):
- Button: “View exam history” → opens history list screen (can be v2)
OR inline show last 5 items.

If no exams taken:
> "Take a mock exam to track your results."

---

### Section 4 — Engagement

Card: **Consistency**
- Current streak: X days
- Last study: date label (“Today”, “Yesterday”, or formatted)

---

### Section 5 — Debug / Reset (optional, for development builds)

- “Reset statistics” button (does NOT reset mistakes, only stats)
- Hide behind dev flag or long-press

---

## UX & UI Notes

- Keep the screen read-only (no complex interactions)
- Same styling system as existing cards/buttons
- Make it scrollable, with comfortable spacing
- Avoid charts initially; text stats already create a premium feel

---

## Implementation Tasks (Engineering Checklist)

1. Add `src/lib/stats.js`
   - `loadStats()`, `saveStats()`, `getStatsForLang(lang)`
   - `recordStudyAttempt({ lang, category, isCorrect })`
   - `recordMockResult({ lang, testId, score, maxScore, minToPass, passed, durationSec, wrongCount })`
   - `recordAddedToMistakes({ lang, historyId, count })`
   - Helpers: `todayKey()`, `yesterdayKey()`, `pruneDaily(keep=14)`, `capHistory(50)`

2. Add new AsyncStorage key `DRIVING_MVP_STATS`

3. Integrate tracking calls:
   - Study screen: on answer submit → `recordStudyAttempt`
   - Mistakes screen: on answer submit → `recordStudyAttempt`
   - Mock screen: on finish → `recordMockResult`
   - Mock screen: on “Add wrong to mistakes” → `recordAddedToMistakes`

4. Update Home top card UI to show preview stats
   - Mistakes remaining
   - Recent accuracy (7d)
   - Current streak

5. Create new screen `app/stats.tsx`
   - Load lang + progress + stats on focus
   - Render sections described above

---

## Edge Cases

- If attempts = 0 → accuracy is “—”
- If daily map has missing days → show 0 attempts and “—” accuracy
- Language switching:
  - Stats tracked separately per language (matches mistakes behavior)
- Reset Progress should NOT reset stats (unless explicitly desired)
  - If you want it to reset everything, add checkbox/confirm modal later

---

## Future Enhancements (v2+)

- Exam history screen with per-question review links
- Category accuracy breakdown
- Unique questions seen (coverage)
- Charts (accuracy trend line)
- “Readiness score” based on mistakes + recent performance
