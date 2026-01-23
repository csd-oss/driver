---
name: Categories Feature Implementation
overview: Implement category filtering for Study and Mistakes screens using the existing okruhy data from data5.js, including helper functions, settings persistence, CategorySelector component, and integration into both screens.
todos:
  - id: create-categories-lib
    content: Create src/lib/categories.js with getCategories() and getCategoryForQuestion() helper functions
    status: completed
  - id: extend-settings
    content: Extend src/lib/settings.js to add selectedCategoryByLang persistence with getSelectedCategory() and setSelectedCategory() helpers
    status: completed
  - id: create-selector-component
    content: Create components/CategorySelector.tsx component with modal-based category selection UI
    status: completed
  - id: add-translations
    content: Add category-related translation strings to src/i18n/strings.js
    status: completed
  - id: integrate-study
    content: Integrate CategorySelector and category filtering logic into app/study.tsx
    status: completed
  - id: integrate-mistakes
    content: Integrate CategorySelector and category filtering logic into app/mistakes.tsx
    status: completed
  - id: extend-bank-helpers
    content: Extend src/lib/bank.js if needed to support getting test object for category computation
    status: completed
---

# Categories Feature Implementation Plan

## Overview

Implement category filtering for Study and Mistakes screens using the existing `okruhy` data structure in `data5.js`. Categories are determined dynamically based on question number ranges within each test.

## Data Structure Understanding

From `data5.js`, each test contains:

- `okruhy`: Object with keys "1", "2", etc., each containing array `[{txt, zacina}]`
  - `txt`: Category name (language-specific, user-friendly)
  - `zacina`: Starting question number for that category
- `pocet`: Total number of questions in the test

Example structure:

```javascript
okruhy: {
  "1": [{txt: "Pravidlá cestnej premávky", zacina: 1}],
  "2": [{txt: "Uplatňovanie pravidiel...", zacina: 9}],
  ...
}
```

## Implementation Tasks

### 1. Create Category Helper Functions (`src/lib/categories.js`)

**File**: `src/lib/categories.js`

**Functions**:

- `getCategories(lang)`: 
  - Get first test: `const test = data[lang-1][0]`
  - Convert `okruhy` object to array: `Object.values(test.okruhy).map(arr => arr[0])`
  - Return array of category texts: `test.okruhy.map(o => o.txt)`

- `getCategoryForQuestion(test, qNo)`:
  - Convert `okruhy` object to array and sort by `zacina`
  - For each okruh, determine range:
    - `start = okruh.zacina`
    - `end = nextOkruh.zacina - 1` OR `test.pocet` if last okruh
  - If `start <= qNo <= end`, return `okruh.txt`
  - Return `null` if no match (fallback to "all")

**Note**: Handle the object structure where `okruhy` has numeric string keys containing arrays.

### 2. Extend Settings Storage (`src/lib/settings.js`)

**Modifications**:

- Add `selectedCategoryByLang` to `DEFAULT_SETTINGS`:
  ```javascript
  selectedCategoryByLang: {
    "1": "all",
    "2": "all", 
    "3": "all"
  }
  ```

- Add helper functions:
  - `getSelectedCategory(lang)`: Returns current selected category for language (defaults to "all")
  - `setSelectedCategory(lang, categoryTxt)`: Updates selected category for language

- **Important**: `resetProgress()` in `storage.js` must NOT reset `selectedCategoryByLang` (it's in settings, not progress)

### 3. Create CategorySelector Component (`components/CategorySelector.tsx`)

**Props**:

- `lang: number` (1-3)
- `selectedCategory: string` ("all" | categoryTxt)
- `onSelect: (categoryTxt | "all") => void`

**UI Behavior**:

- Display button/pressable showing current selection label
- On press, open Modal with:
  - ScrollView containing list of options
  - "All" option at top
  - Categories from `getCategories(lang)` below
- Use existing UI components (`Button`, `Card`, `UIText`)
- Simple, clean design matching app style

**Implementation**:

- Use React Native `Modal` component
- Use `Pressable` for selection items
- Highlight selected category
- Close modal on selection

### 4. Integrate into Study Screen (`app/study.tsx`)

**Changes**:

- Import category helpers and CategorySelector
- Add state for selected category (load from settings)
- Render CategorySelector at top of screen (before question card)
- Modify `loadNewQuestion` logic:
  - If `selectedCategory === "all"`: Use existing `flattenRandomQuestion(lang)`
  - If `selectedCategory !== "all"`: 
    - Loop up to 30 times:
      - Pick random test: `getRandomTest(lang)`
      - Pick random qNo: `1..test.pocet`
      - Get category: `getCategoryForQuestion(test, qNo)`
      - If matches `selectedCategory`, use this question
    - After 30 attempts, fallback to "all" and show warning
- On category change: Save via `setSelectedCategory(lang, categoryTxt)`
- Reload question when category changes

**Note**: Need to modify `flattenRandomQuestion` usage or create new helper that accepts category filter.

### 5. Integrate into Mistakes Screen (`app/mistakes.tsx`)

**Changes**:

- Import category helpers and CategorySelector
- Add state for selected category (load from settings)
- Render CategorySelector at top of screen
- Filter mistakes list:
  - For each qid in mistakes:
    - Find question: `findQuestionById(lang, qid)`
    - Get test and qNo from question index (need to access test object)
    - Compute category: `getCategoryForQuestion(test, qNo)`
    - Filter: keep only if category matches `selectedCategory` (or if "all")
- Update empty state:
  - If mistakes exist but filtered list is empty:
    - Show message: "No mistakes in this category"
    - Button: "Show all" → sets category to "all"
- Handle navigation safety:
  - When mistake removed, filtered list shrinks
  - Ensure currentIndex doesn't exceed bounds
  - Re-filter when category changes

**Challenge**: Need to get test object for each qid. Options:

- Extend `findQuestionById` to return test object
- Use `buildQuestionIndex` to get testIndex, then get test
- Cache test lookup per qid

### 6. Add Translation Strings (`src/i18n/strings.js`)

**New keys**:

- `category.all`: "All" / "All" / "Összes"
- `category.select`: "Select Category" / "Select Category" / "Kategória kiválasztása"
- `mistakes.noInCategory`: "No mistakes in this category" / "No mistakes in this category" / "Nincsenek hibák ebben a kategóriában"
- `mistakes.showAll`: "Show all" / "Show all" / "Összes mutatása"

## Technical Considerations

### Question-to-Category Mapping

For Study screen:

- Need to get test object when picking random question
- Modify or extend `flattenRandomQuestion` to support category filtering
- Alternative: Create `getRandomQuestionByCategory(lang, categoryTxt)`

For Mistakes screen:

- `findQuestionById` returns question with `qNo` but not test object
- Need to get test object to call `getCategoryForQuestion`
- Solution: Use `buildQuestionIndex` to get `testIndex`, then `getTests(lang)[testIndex]`

### Performance

- Category computation is O(n) where n = number of okruhy (typically ~10)
- No precomputation needed per spec
- Cache categories list per language if needed

### Edge Cases

- Test with no okruhy: Return empty array from `getCategories`
- Question number outside all ranges: Return null from `getCategoryForQuestion`
- Category not found in test: Handle gracefully
- Language change: Reset category to "all" or keep per-language selection

## Files to Create/Modify

**New Files**:

- `src/lib/categories.js` - Category helper functions
- `components/CategorySelector.tsx` - Category selector UI component

**Modified Files**:

- `src/lib/settings.js` - Add category persistence
- `app/study.tsx` - Add category selector and filtering
- `app/mistakes.tsx` - Add category selector and filtering  
- `src/i18n/strings.js` - Add category-related translations

**No Changes**:

- `data/data5.js` - Do not modify
- `src/lib/storage.js` - No changes (category stored in settings)
- `src/lib/bank.js` - May need minor extension for test lookup
- `src/lib/engine.js` - No changes