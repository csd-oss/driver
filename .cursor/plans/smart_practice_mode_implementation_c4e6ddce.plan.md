---
name: Smart Practice Mode Implementation
overview: Implement adaptive question selection algorithm that prioritizes mistakes, unseen questions, and weak categories, replacing random selection in Study mode with intelligent prioritization.
todos:
  - id: create-smart-practice-module
    content: Create src/lib/smartPractice.js with getSmartQuestion() and helper functions (pickFromMistakes, pickUnseen, pickFromWeakCategory, isRecent, pushRecent)
    status: completed
  - id: update-study-screen
    content: Update app/study.tsx to use getSmartQuestion() instead of random selection, add recentQuestionIds tracking with useRef
    status: completed
  - id: load-required-data
    content: Ensure study.tsx loads stats and progress data needed for smart practice algorithm
    status: completed
  - id: test-smart-practice
    content: "Test smart practice with various scenarios: fresh user, user with mistakes, category filtering, weak categories"
    status: completed
---

# Smart Practice Mode Implementation Plan

## Overview

Replace random question selection in Study mode with an adaptive algorithm that prioritizes questions based on user weaknesses and learning state. This makes the app feel intelligent and personalized without requiring backend or AI.

## Architecture

The implementation follows a priority-based selection system with four tiers:

```
Priority 1: Mistakes (highest)
    ↓ (if no candidates)
Priority 2: Unseen Questions
    ↓ (if no candidates)
Priority 3: Weak Categories
    ↓ (if no candidates)
Priority 4: Random Fallback
```

## Implementation Details

### 1. New Module: `src/lib/smartPractice.js`

Create a new module that exports `getSmartQuestion()` function with internal helper functions:

**Main Function:**

- `getSmartQuestion({ lang, selectedCategory, recentIds })` - Main entry point that implements priority-based selection

**Helper Functions:**

- `pickFromMistakes({ lang, selectedCategory, recentIds, mistakes, seenSet })` - Priority 1: Select from mistakes list
- `pickUnseen({ lang, selectedCategory, recentIds, seenSet })` - Priority 2: Select questions never seen
- `pickFromWeakCategory({ lang, selectedCategory, recentIds, stats })` - Priority 3: Select from weakest category
- `isRecent(qid, recentIds)` - Check if question is in recent list
- `pushRecent(qid, recentIds, max=20)` - Add question to recent list (maintains max size)

**Data Sources Used:**

- `DRIVING_MVP_PROGRESS.mistakesByLang[lang]` - Mistakes list
- `DRIVING_MVP_STATS.statsByLang[lang].coverage.questionsSeen` - Questions seen set
- `DRIVING_MVP_STATS.statsByLang[lang].study.byCategory` - Category accuracy stats
- `getCategoryForQuestion(test, qNo)` - Category lookup
- `flattenRandomQuestion(lang)` - Random fallback

**Performance Optimizations:**

- Build `seenSet` once per session using `new Set(questionsSeen)`
- Use cached question indices from `buildQuestionIndex(lang)`
- Weak category selection reads only from `byCategory` map (small, fast)
- Recent IDs list is small (≤20 items)

### 2. Study Screen Updates: `app/study.tsx`

**Changes Required:**

1. **Import new module:**

   - Import `getSmartQuestion` from `@/src/lib/smartPractice`

2. **Add recent question tracking:**

   - Add `recentQuestionIds` state using `useRef<string[]>([])` (in-memory, not persisted)
   - Maintain max 20 items using `pushRecent()` helper

3. **Replace question selection logic:**

   - In `loadNewQuestion()` function, replace current random selection (lines 57-90) with:
     ```javascript
     const q = await getSmartQuestion({
       lang: currentLang,
       selectedCategory: category,
       recentIds: recentQuestionIds.current
     });
     ```


4. **Update recent list:**

   - After successfully loading a question, add it to recent list:
     ```javascript
     if (q && q.qid) {
       recentQuestionIds.current = pushRecent(q.qid, recentQuestionIds.current, 20);
     }
     ```


5. **Load required data:**

   - Load statistics (`loadStats()`) to access `coverage.questionsSeen` and `study.byCategory`
   - Load progress to access `mistakesByLang`
   - Pass this data to `getSmartQuestion()` (or load internally within the function)

**Note:** The function signature may need to accept progress and stats, or load them internally. For better separation of concerns, loading internally is preferred.

### 3. Algorithm Implementation Details

**Priority 1 - Mistakes:**

- Get mistakes list: `progress.mistakesByLang[lang] `or `[]`
- Filter by category if `selectedCategory !== 'all'`:
  - For each mistake qid, find question → get test → get category → filter
- Exclude recent questions (using `isRecent()`)
- Random pick from remaining candidates
- Return question or `null` if no candidates

**Priority 2 - Unseen Questions:**

- Get seen set: `new Set(stats.coverage.questionsSeen || [])`
- Get all questions using `buildQuestionIndex(lang)` to get all qids
- Filter: qids not in seenSet
- Filter by category if `selectedCategory !== 'all'`
- Exclude recent questions
- Random pick from remaining candidates
- Return question or `null` if no candidates

**Priority 3 - Weak Categories:**

- Get category stats: `stats.study.byCategory`
- Filter categories with `attempts > 0`
- Calculate accuracy: `correct / attempts` for each category
- Sort by lowest accuracy (weakest first)
- For weakest category:
  - Get all questions in that category
  - Filter by `selectedCategory` (should match, but verify)
  - Exclude recent questions
  - Random pick from remaining candidates
- Return question or `null` if no eligible category

**Priority 4 - Random Fallback:**

- Use existing `flattenRandomQuestion(lang)`
- This already respects category filtering in current implementation, but Smart Practice should handle category filtering at higher priorities

**Anti-Repetition:**

- Maintain `recentQuestionIds: string[]` with max 20 items
- When adding new qid, if array length >= max, remove oldest (shift)
- Check `recentIds.includes(qid)` before selecting
- If all candidates are recent, allow reuse (don't block user)

**Category Awareness:**

- If `selectedCategory === 'all'`: full logic across entire bank
- If specific category selected:
  - Apply filter to each priority's candidate pool
  - If priority yields no candidates, try next priority
  - If all priorities exhausted, fallback to global random

### 4. Edge Cases Handling

- **No mistakes, no unseen, no category stats:** Fallback to random
- **Category selected but no candidates:** Continue through priorities within category, then fallback to global random
- **Very small mistake pool:** Anti-repetition may temporarily allow reuse to avoid dead ends
- **Empty question bank:** Return `null`, handle gracefully in UI
- **Invalid language:** Default to lang 1
- **Missing stats/progress data:** Initialize defaults, continue gracefully

### 5. Testing Considerations

**Manual Testing Scenarios:**

1. Fresh user (no mistakes, no seen questions) → should prioritize unseen
2. User with mistakes → should prioritize mistakes
3. User with mistakes but all recent → should allow reuse or move to next priority
4. Category filter active → should respect filter at each priority
5. Weak category exists → should prioritize questions from weakest category
6. All priorities exhausted → should fallback to random

**Success Criteria:**

- Users see fewer repeats during a session
- Users are automatically guided to mistakes and unseen questions
- Coverage rises faster than with random
- Users improve weak areas without manually changing categories
- App feels intelligent: "This is not random. This is smart."

## File Changes Summary

1. **New File:** `src/lib/smartPractice.js` - Core smart practice algorithm
2. **Modified:** `app/study.tsx` - Replace random selection with smart practice, add recent tracking

## Dependencies

All required dependencies already exist:

- `src/lib/bank.js` - Question bank functions
- `src/lib/stats.js` - Statistics tracking
- `src/lib/storage.js` - AsyncStorage access
- `src/lib/categories.js` - Category helpers
- `src/lib/engine.js` - (not directly used, but mistakes come from progress)

## Performance Notes

- Question index is cached per language (already implemented in `bank.js`)
- Seen set built once per session (not per question)
- Recent IDs list is small (max 20)
- Category stats map is small (typically < 20 categories)
- No repeated full bank scans - use cached indices and efficient filtering