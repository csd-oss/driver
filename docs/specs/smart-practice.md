# SMART PRACTICE MODE SPECIFICATION — Driver SK

**Version:** 1.0.0  
**Status:** Planned  
**Priority:** High (next feature after Statistics)

---

## 1. PURPOSE

Smart Practice Mode replaces purely random question selection with an adaptive algorithm that prioritizes questions based on the user’s weaknesses and learning state.

This feature makes the app feel intelligent and personalized without requiring any backend or AI.

---

## 2. USER VALUE

Instead of:  
> “I get random questions”

User feels:  
> “The app knows exactly what I need to study”

Smart Practice ensures users spend time on:
- Questions they got wrong (mistakes)
- Questions they have never seen (coverage)
- Categories where they perform poorly (byCategory accuracy)

This increases:
- Learning efficiency
- Perceived intelligence of the app
- Retention and session quality

---

## 3. ENTRY POINT

### 3.1 Study Screen Integration

On `Study` screen, replace current behavior:

- Current: random question selection
- New: Smart Practice selection (default)

Optional (future):
- Toggle: `Smart` / `Random`

For v1.0, Smart Practice is always used.

---

## 4. QUESTION SELECTION PRIORITY

When loading the next question, selection follows this strict order.

### Priority 1 — Mistakes (Highest Priority)

If user has mistakes remaining:

- Candidate pool: `mistakesByLang[lang]`
- Apply selected category filter (if not "All")
- Apply anti-repetition rules:
  - Exclude questions from last 20 shown
  - If all are recent, exclude questions from last 15 shown (minimum gap)
  - If all are within minimum gap → skip to next priority
- Random pick from eligible candidates
- If no eligible candidates → continue to next priority

---

### Priority 2 — Unseen Questions

Questions that have **never been seen** (not in `stats.coverage.questionsSeen`)

- Candidate pool: all questions minus seen set
- Apply selected category filter (if not "All")
- Apply anti-repetition rules:
  - Exclude questions from last 20 shown
  - If all are recent, exclude questions from last 5 shown (minimum gap)
  - If all are within minimum gap → skip to next priority
- Random pick from eligible candidates
- If none → continue

---

### Priority 3 — Weak Categories

Use `stats.study.byCategory`:

1. Compute accuracy per category:
   - `accuracy = correct / attempts` (if attempts = 0, treat as "unknown")
2. Select weakest category:
   - Only among categories with `attempts > 0` (v1.0 rule)
   - Sort by lowest accuracy
3. Pick question from that category:
   - Apply anti-repetition rules:
     - Exclude questions from last 20 shown
     - If all are recent, exclude questions from last 5 shown (minimum gap)
     - If all are within minimum gap → try next weakest category
   - Random pick from eligible candidates
4. If no eligible question in any category → continue

Notes:
- If no category has attempts > 0, skip this priority (fall through to random)

---

### Priority 4 — Random Fallback

If all above exhausted:
- Use existing `flattenRandomQuestion(lang)`
- Apply anti-repetition rules:
  - Prefer questions outside last 5 shown (minimum gap)
  - Try up to 50 attempts to find a question outside minimum gap
  - If still not found, allow any random question as final fallback

---

## 5. ANTI-REPETITION RULE

To avoid the user seeing the same question repeatedly:

Maintain in memory (not AsyncStorage):

- `recentQuestionIds: string[]` with `max = 20`

### 5.1 Two-Tier Anti-Repetition System

When selecting a question, the algorithm uses a two-tier approach:

**Tier 1: Full Recent Window (20 questions)**
- First, exclude all candidates whose `qid` is in `recentQuestionIds` (last 20 questions)
- If non-recent candidates exist → pick from them

**Tier 2: Minimum Gap Window**
- If all candidates are in the recent window, check against a **minimum gap window**
- Minimum gap requirements:
  - **Mistakes**: 15 questions (prevents mistakes from appearing too frequently)
  - **Unseen questions**: 5 questions
  - **Weak category**: 5 questions
  - **Random fallback**: 5 questions
- Pick from candidates outside the minimum gap window
- If ALL candidates are within the minimum gap → **skip to next priority** (do not force repetition)

### 5.2 Rationale

This ensures:
- Mistakes won't appear back-to-back or with only 1-2 questions in between
- Users get sufficient spacing between seeing the same question again
- The algorithm gracefully falls through to other priorities when repetition would be too frequent
- Learning is more effective with proper spacing between repetitions

---

## 6. CATEGORY AWARENESS

Smart Practice respects current category selection:

- If category = "All": full logic across entire bank
- If specific category selected:
  - Apply that filter to each priority’s candidate pool
  - If a priority yields no candidates under that filter, try next priority
  - If none yields a candidate, fallback to global random (existing behavior)

---

## 7. DATA SOURCES USED (ALREADY AVAILABLE)

No new persistent storage required.

| Data | Source |
|---|---|
| Mistakes list | `DRIVING_MVP_PROGRESS.mistakesByLang[lang]` |
| Questions seen | `DRIVING_MVP_STATS.statsByLang[lang].coverage.questionsSeen` |
| Category accuracy | `DRIVING_MVP_STATS.statsByLang[lang].study.byCategory` |
| Question → category | `getCategoryForQuestion(test, qNo)` / bank lookup |
| Random fallback | `flattenRandomQuestion(lang)` |

---

## 8. ALGORITHM (PSEUDOCODE)

```js
function getSmartQuestion({ lang, selectedCategory, recentIds }) {
  // Priority 1: mistakes (minimum gap: 15 questions)
  const q1 = pickFromMistakes({ lang, selectedCategory, recentIds });
  if (q1) return q1;

  // Priority 2: unseen (minimum gap: 5 questions)
  const q2 = pickUnseen({ lang, selectedCategory, recentIds });
  if (q2) return q2;

  // Priority 3: weakest category (minimum gap: 5 questions)
  const q3 = pickFromWeakCategory({ lang, selectedCategory, recentIds });
  if (q3) return q3;

  // Priority 4: fallback random (minimum gap: 5 questions)
  return flattenRandomQuestion(lang);
}

// Each picker function follows this pattern:
function pickFromMistakes({ lang, selectedCategory, recentIds, mistakes }) {
  // Filter by category
  let candidates = filterByCategory(mistakes, selectedCategory);
  
  // Tier 1: Exclude last 20 questions
  const nonRecent = candidates.filter(qid => !isRecent(qid, recentIds));
  if (nonRecent.length > 0) return randomPick(nonRecent);
  
  // Tier 2: Exclude last MIN_GAP questions (15 for mistakes)
  const minGapWindow = recentIds.slice(-MIN_GAP);
  const outsideGap = candidates.filter(qid => !minGapWindow.includes(qid));
  if (outsideGap.length > 0) return randomPick(outsideGap);
  
  // All within minimum gap - skip to next priority
  return null;
}
9. IMPLEMENTATION PLAN
9.1 New Module

Create:

src/lib/smartPractice.js

Export:

getSmartQuestion({ lang, selectedCategory, recentIds })

Internal helpers (recommended):

pickFromMistakes(...)

pickUnseen(...)

pickFromWeakCategory(...)

isRecent(qid, recentIds)

pushRecent(qid, recentIds, max=20)

### 9.2 Study Screen Changes

- In `app/study.tsx`:
  - Replace existing random selection call with `getSmartQuestion(...)`.
  - Store `recentQuestionIds` in component state or `useRef([])`.
  - After picking a question, add it to `recentQuestionIds`.
  - _(Optionally apply same logic to `app/mistakes.tsx` later, but not required for v1.0)_

---

### 10. PERFORMANCE NOTES

- Avoid scanning the full bank repeatedly:
  - Build `seenSet` once per session (`new Set(questionsSeen)`).
  - Use cached bank indices (`buildQuestionIndex(lang)` already exists).
  - Weak category selection should read from `byCategory` only (small map).
  - Recent IDs list is small (≤ 20).

---

### 11. EDGE CASES

- No mistakes, no unseen, no category stats → fallback random.
- Category selected but no candidates exist in that category:
  - Continue through priorities within category.
  - If still none → fallback global random.
- Very small mistake pool (e.g., only 1-2 mistakes):
  - If all mistakes are within the minimum gap window (last 15 questions), the algorithm will skip to Priority 2 (unseen questions) instead of forcing immediate repetition.
  - This ensures proper spacing between mistake repetitions while still prioritizing mistakes when sufficient time has passed.
- All candidates within minimum gap:
  - Algorithm gracefully falls through to next priority rather than forcing repetition.
  - This maintains learning effectiveness through proper spacing.

---

### 12. SUCCESS CRITERIA

After implementation:

- Users see fewer repeats during a session.
- Users are automatically guided to mistakes and unseen questions.
- Coverage rises faster than with random.
- Users improve weak areas without manually changing categories.
- The app should feel:  
  **“This is not random. This is smart.”**