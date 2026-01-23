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
- Random pick from candidates
- If no candidates (e.g., none in category) → continue to next priority

---

### Priority 2 — Unseen Questions

Questions that have **never been seen** (not in `stats.coverage.questionsSeen`)

- Candidate pool: all questions minus seen set
- Apply selected category filter (if not "All")
- Random pick from candidates
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
   - Prefer questions not in recent history (Anti-Repetition)
4. If no eligible question → continue

Notes:
- If no category has attempts > 0, skip this priority (fall through to random)

---

### Priority 4 — Random Fallback

If all above exhausted:
- Use existing `flattenRandomQuestion(lang)`

---

## 5. ANTI-REPETITION RULE

To avoid the user seeing the same question repeatedly:

Maintain in memory (not AsyncStorage):

- `recentQuestionIds: string[]` with `max = 20`

When selecting a question:
- Skip candidates whose `qid` is in `recentQuestionIds`
- If all candidates are recent → allow reuse (do not block the user)

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
  // Priority 1: mistakes
  const q1 = pickFromMistakes({ lang, selectedCategory, recentIds });
  if (q1) return q1;

  // Priority 2: unseen
  const q2 = pickUnseen({ lang, selectedCategory, recentIds });
  if (q2) return q2;

  // Priority 3: weakest category
  const q3 = pickFromWeakCategory({ lang, selectedCategory, recentIds });
  if (q3) return q3;

  // Priority 4: fallback random
  return flattenRandomQuestion(lang);
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
- Very small mistake pool:
  - Anti-repetition may temporarily allow reuse to avoid dead ends.

---

### 12. SUCCESS CRITERIA

After implementation:

- Users see fewer repeats during a session.
- Users are automatically guided to mistakes and unseen questions.
- Coverage rises faster than with random.
- Users improve weak areas without manually changing categories.
- The app should feel:  
  **“This is not random. This is smart.”**