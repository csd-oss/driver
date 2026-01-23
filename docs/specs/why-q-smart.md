# “WHY THIS QUESTION?” LABEL — Smart Study Explanation Spec

**Version:** 1.0.0  
**Status:** Planned  
**Priority:** Very High (micro UX, huge perceived intelligence)

---

## 1. PURPOSE

When Smart Study selects a question, the app displays a small label explaining **why** that question was chosen.

This turns Smart Study from “random but different” into “personalized and intentional”, increasing trust and perceived intelligence without changing the underlying learning logic.

---

## 2. USER VALUE

Users see a pill above the question such as:

- Fixing a mistake
- New question
- Weak area: Right of way
- Review question

This builds:
- Confidence in Smart Study
- Motivation to follow the plan
- Clear mental model of what the app is doing

---

## 3. UI PLACEMENT

**Screen:** `Study` (Smart Study flow)  
**Placement:** Between the category selector and the question card (or directly above the question text if no category selector is present).  
**Component:** Small rounded pill, subtle outline/background.

Example:

- `[ Fixing a mistake ]`
- `[ Weak area: Traffic signs ]`

---

## 4. REASON TYPES (ENUM)

Smart Study already selects questions by priority. We expose that selection as a reason.

Supported reason types:

1. `mistake` — selected from mistakes list  
2. `unseen` — selected from unseen (not yet viewed) questions  
3. `weak` — selected from weakest category  
4. `random` — selected as fallback random review

---

## 5. LABEL COPY

Map reason type to user-facing label:

- `mistake` → `Fixing a mistake`
- `unseen` → `New question`
- `weak` → `Weak area: {categoryName}`
- `random` → `Review question`

Notes:
- `categoryName` is the category used by the weak-category selector logic.
- Keep copy short and consistent.

---

## 6. TECHNICAL CHANGES

### 6.1 Smart Study / Smart Practice Return Shape

Current behavior (conceptual):
- Smart selector returns only a `question`.

New behavior:
- Smart selector returns `{ question, reason }`.

New return shape:

- `question`: normalized question object (existing)
- `reason`: metadata describing why it was chosen

Reason object:

- `type`: one of `mistake | unseen | weak | random`
- `category`: optional string (only for `weak`)

Example:

- `{ question, reason: { type: "mistake" } }`
- `{ question, reason: { type: "weak", category: "Right of way" } }`

---

### 6.2 Study Screen State

In `app/study.tsx`:
- Store the `reason` alongside the selected question in component state.
- Render the pill whenever Smart Study is active and `reason` exists.

---

## 7. RENDERING LOGIC

Create a small helper:

- `getReasonLabel(reason)` returns the final string label.

Mapping rules:

- if `reason.type === "mistake"` → `Fixing a mistake`
- if `reason.type === "unseen"` → `New question`
- if `reason.type === "weak"` → `Weak area: ${reason.category}`
- if `reason.type === "random"` → `Review question`

---

## 8. STYLING GUIDELINES

The label should feel informational, not loud.

Recommended pill style:

- Rounded: `rounded-full`
- Border: subtle outline
- Background: light neutral (supports dark mode)
- Text: small (`text-sm`)
- Padding: `px-3 py-1`
- Position: aligned to left (preferred) or centered

---

## 9. CATEGORY AWARENESS

For `weak` reason:
- The category must be passed from selection logic at the moment the question is chosen.
- No extra category lookup should be required at render time.

For other reasons:
- `category` field is omitted.

---

## 10. EDGE CASES

- If category label is long: allow wrapping or truncate with ellipsis.
- If Smart Study is not used: do not show the pill.
- If reason is missing for any reason: do not render pill (fail gracefully).

---

## 11. SUCCESS CRITERIA

- Every Smart Study question shows a clear reason label.
- The label matches the selection logic (mistake/unseen/weak/random).
- Users perceive Smart Study as intentional and personalized.
- No regressions to existing Study/Mistakes/Mock flows.

---

## 12. FUTURE EXTENSIONS (NOT v1.0)

- Add additional reason types:
  - `spaced` — spaced repetition review
  - `streak` — daily streak maintenance prompt
- Add a “Why?” info tooltip that briefly explains Smart Study overall.
