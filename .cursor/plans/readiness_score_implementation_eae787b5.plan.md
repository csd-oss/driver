---
name: Readiness Score Implementation
overview: Implement a composite Readiness Score (0-100%) that combines mistakes, study performance, mock exam results, and coverage. Display prominently on Home screen and add detailed breakdown card to Statistics screen.
todos:
  - id: add-calculation-functions
    content: Add calculateReadinessScore() and getReadinessBreakdown() functions to src/lib/stats.js with full formula implementation
    status: completed
  - id: update-home-screen
    content: Update app/home.tsx to display readiness score prominently in the progress card with color coding
    status: completed
  - id: add-stats-card
    content: Add detailed Readiness Score breakdown card to app/stats.tsx showing all components
    status: completed
  - id: add-i18n-strings
    content: Add all readiness-related translation strings to src/i18n/strings.js for all three languages
    status: completed
isProject: false
---

# Readiness Score Implementation Plan

## Overview

Add a composite Exam Readiness Score that provides users with a single, actionable metric indicating their preparedness for the driving exam. The score combines four components with weighted importance and includes safeguards against inflated scores from insufficient data.

## Formula

```
Readiness Score = (MistakeScore × 0.30) + (PerformanceScore × 0.25) + (MockExamScore × 0.30) + (CoverageScore × 0.15)
```

### Component Details

1. **Mistake Score (30%)**: Based on mistakes remaining, with minimum threshold (10% coverage OR 50 questions) to prevent inflated scores from minimal study
2. **Performance Score (25%)**: Last 7 days study accuracy
3. **Mock Exam Score (30%)**: Overall pass rate (60% weight) + recent 3 exams performance (40% weight)
4. **Coverage Score (15%)**: Percentage of questions seen

## Implementation Tasks

### 1. Add Calculation Functions to `src/lib/stats.js`

Add two new exported functions:

- **`calculateReadinessScore(lang, mistakesCount, stats)`**: Main calculation function
  - Returns: number (0-100)
  - Implements the full formula with all four components
  - Handles edge cases (no data, insufficient coverage, no mock exams)

- **`getReadinessBreakdown(lang, mistakesCount, stats)`**: Detailed breakdown for UI
  - Returns: object with `overall` score and `components` object
  - Each component includes: `score`, `weight`, and relevant metadata
  - Includes `hasEnoughData` flag and `warning` message for mistake component

**Key Implementation Details:**

- Mistake score threshold: `MIN_COVERAGE_FOR_MISTAKES = 0.10` (10%) OR `MIN_QUESTIONS_FOR_MISTAKES = 50`
- If insufficient data for mistakes: cap at 30% (conservative score)
- Mock exam score: `(passRate × 0.6) + (recentPassRate × 0.4)` where recent is last 3 exams
- All scores clamped to 0-100 range

### 2. Update Home Screen (`app/home.tsx`)

Enhance the "Your Progress" card to prominently display readiness score:

- Add state: `readinessScore` and `readinessBreakdown`
- Load readiness data in `loadData()` callback using `getReadinessBreakdown()`
- Update card layout:
  - Add large readiness score display (e.g., "72%") with progress bar
  - Add color-coded status label (Ready/Getting there/Needs work)
  - Keep existing metrics (mistakes, accuracy, streak) below, but you can remove weekly accuracy bar.
  - Maintain existing "View stats →" navigation

**Color Coding:**

- 80-100%: Green (emerald) - "Ready"
- 60-79%: Yellow/Amber - "Getting there"  
- 0-59%: Red (rose) - "Needs work"

**Visual Design:**

- Large score number (title variant)
- Horizontal progress bar showing percentage
- Status pill with color-coded background
- Maintain existing gradient card styling

### 3. Add Readiness Card to Statistics Screen (`app/stats.tsx`)

Add new card section after the Overview card:

- Calculate readiness breakdown using `getReadinessBreakdown()`
- Display:
  - Overall score with large number and progress bar
  - Component breakdown showing:
    - Mistakes: score, count, weight (30%), warning if insufficient data
    - Performance: score, attempts (7d), weight (25%)
    - Mock Exam: score, pass rate, recent pass rate, exams taken, weight (30%)
    - Coverage: score, seen/total, weight (15%)
  - Optional: Actionable tip based on lowest component

**Card Structure:**

- Title: "Exam Readiness" (translated)
- Overall score section (hero display)
- Component breakdown (grid or list)
- Each component shows score, weight percentage, and relevant metrics

### 4. Add i18n Strings (`src/i18n/strings.js`)

Add translations for all three languages (Slovak, English, Hungarian):

**New Keys:**

- `readiness.title`: "Exam Readiness" / "Skúšobná pripravenosť" / "Vizsga felkészültség"
- `readiness.ready`: "Ready" / "Pripravený" / "Kész"
- `readiness.gettingThere`: "Getting there" / "Na ceste" / "Úton"
- `readiness.needsWork`: "Needs work" / "Potrebuje prácu" / "Munkára szorul"
- `readiness.overall`: "Overall Score" / "Celkové skóre" / "Összpontszám"
- `readiness.mistakes`: "Mistakes" / "Chyby" / "Hibák"
- `readiness.performance`: "Performance" / "Výkon" / "Teljesítmény"
- `readiness.mockExam`: "Mock Exams" / "Skúšobné testy" / "Próba vizsgák"
- `readiness.coverage`: "Coverage" / "Pokrytie" / "Lefedettség"
- `readiness.weight`: "{weight}% weight" / "{weight}% váha" / "{weight}% súly"
- `readiness.insufficientData`: "Need more practice to assess" / "Potrebujete viac praxe" / "Több gyakorlásra van szükség"
- `readiness.passRate`: "Pass rate" / "Úspešnosť" / "Sikeres arány"
- `readiness.recentPassRate`: "Recent (last 3)" / "Nedávne (posledné 3)" / "Legutóbbi (utolsó 3)"
- `readiness.examsTaken`: "Exams taken" / "Uskutočnené testy" / "Elvégzett vizsgák"
- `readiness.tip`: "💡 Tip: {message}" (contextual tips based on lowest component)

### 5. Styling & UI Patterns

Follow existing patterns from the codebase:

- Use `Card` component with gradient backgrounds for hero sections
- Use `UIText` variants: `title` for large scores, `subtitle` for labels, `caption` for metadata
- Progress bars: `h-2 rounded-full bg-slate-200/70` with colored fill
- Color coding: Use existing badge classes pattern (see `getAccuracyBadgeClass` in stats.tsx)
- Status pills: `rounded-full px-3 py-1` with color-coded backgrounds
- Component breakdown: Use existing grid pattern (flex-row gap-3) from stats screen

**Color Scheme:**

- Ready (80-100%): `bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200`
- Getting there (60-79%): `bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200`
- Needs work (0-59%): `bg-rose-500/15 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200`

## Edge Cases

1. **No study data**: Score = 0%, show "Start studying to see your readiness"
2. **Insufficient mistake data**: Mistake score capped at 30%, show warning
3. **No mock exams**: Mock exam score = 0, doesn't break calculation
4. **No recent performance**: Performance score = 0 if no attempts in last 7 days
5. **Zero coverage**: Coverage score = 0, overall score reflects this

## Testing Considerations

- Test with new user (minimal data)
- Test with user who has 0 mistakes but low coverage
- Test with user who has many mistakes but high accuracy
- Test with user who passes all mock exams
- Test with user who fails all mock exams
- Test language switching (scores should recalculate per language)

## Files to Modify

1. `src/lib/stats.js` - Add calculation functions
2. `app/home.tsx` - Add readiness score display to progress card
3. `app/stats.tsx` - Add readiness breakdown card
4. `src/i18n/strings.js` - Add all translation strings

## Success Criteria

- Readiness score displays correctly on Home screen
- Score updates in real-time as user studies
- Breakdown card shows all components with correct weights
- Color coding works for all score ranges
- Translations work for all three languages
- Edge cases handled gracefully (no crashes, appropriate fallbacks)
- Formula correctly prevents inflated scores from insufficient data
- Mock exam integration works (0% if no exams, weighted calculation if exams exist)