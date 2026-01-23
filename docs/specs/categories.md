# FEATURE SPEC — Categories integrated into Study and Mistakes (using okruhy directly)

Scope:
Implement Categories for Study and Mistakes screens using the existing `okruhy` data inside `data5.js`.
Do NOT add scripts, generated files, mappings, or preprocessing.
Do NOT change any other features.

The official data already contains everything needed.

---

## Core Idea

Each test in `data5.js` contains:

- `okruhy`: array of `{ txt, zacina }`
- `pocet`: number of questions in the test

This defines topic ranges inside the test.

A question’s category is determined dynamically by:
> Which okruh range its question number falls into.

**Category key = `okruh.txt`** (use the text directly).

No slugs. No ids. No mappings.

---

## Helper Functions (create in `src/lib/categories.js`)

### 1) getCategories(lang)

Return the list of categories for a language.

Implementation:
- Use the first test of that language:
  `const test = data[lang-1][0]`
- Return `test.okruhy.map(o => o.txt)`

These are the official category names.

---

### 2) getCategoryForQuestion(test, qNo)

Determine category for a question inside a test.

Algorithm:

1. Sort `test.okruhy` by `zacina`
2. For each okruh `i`:
   - start = okruh[i].zacina
   - end = nextOkruh.zacina - 1 OR test.pocet if last
3. If `start <= qNo <= end`, return `okruh.txt`

Return null if none found (rare, fallback to "All").

---

## Persistence (selected category)

Extend existing settings storage with:

selectedCategoryByLang: {
"1": "all" | okruhTxt,
"2": "all" | okruhTxt,
"3": "all" | okruhTxt
}


Rules:
- Default = "all"
- Stored per language
- Reset Progress must NOT reset this

Provide helpers:
- getSelectedCategory(lang)
- setSelectedCategory(lang, categoryTxt)

---

## Reusable UI: CategorySelector component

Props:
- lang
- selectedCategory
- onSelect(categoryTxt | "all")

UI behavior:
- Displays current selection label
- On press opens simple list/modal with:
  - "All"
  - categories from `getCategories(lang)`

No fancy UI required.

---

## Study Screen Integration

At top of Study screen, render CategorySelector.

Question selection logic:

### If selectedCategory == "all"
Use existing random question logic.

### If selectedCategory != "all"

Repeat:
- Pick random test
- Pick random question number qNo
- Determine category using `getCategoryForQuestion(test, qNo)`
- If matches selectedCategory → use this question
- Else repeat

Add safety: after ~30 failed attempts, fallback to "all".

Persistence:
- When user changes category, save via setSelectedCategory.

---

## Mistakes Screen Integration

At top of Mistakes screen, render CategorySelector.

You already have mistakes list as qids.

For each mistake qid when rendering:

1. Use existing lookup to find:
   - test
   - qNo
2. Compute category using `getCategoryForQuestion(test, qNo)`

Filtering:

### If selectedCategory == "all"
Show all mistakes.

### Else
Show only mistakes where computed category == selectedCategory.

Empty state:
- If mistakes exist but none in this category:
  Show message:
  "No mistakes in this category"
  Button: "Show all" → sets category to "all"

Navigation safety:
- When a mistake is removed (after 2 correct), the filtered list shrinks.
- Screen must handle this without crashing.

---

## Important Notes

- Category text is language-specific and already user-friendly → use it directly.
- Do NOT generate any files.
- Do NOT precompute mappings.
- Do NOT modify data5.js.
- Everything is computed dynamically from the official data.

---

## Deliverables

AI must:
1. Create `src/lib/categories.js` with the two helpers.
2. Extend settings storage for selectedCategoryByLang.
3. Create CategorySelector component.
4. Integrate selector + filtering into Study.
5. Integrate selector + filtering into Mistakes.
6. Keep all other behaviors unchanged.
