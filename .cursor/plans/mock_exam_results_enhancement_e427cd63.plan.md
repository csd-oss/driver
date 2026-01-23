---
name: Mock Exam Results Enhancement
overview: Enhance the mock exam results screen to make wrong answers clickable, showing a detail modal with the original question, user's answer, and correct answer. Also improve visual clarity in the detail modal, study mode, and mistakes mode to clearly distinguish correct vs wrong answers.
todos:
  - id: make-wrong-answers-clickable
    content: Convert wrong answer Views to Pressable components in mock.tsx results section
    status: completed
  - id: add-modal-state
    content: Add selectedQuestionDetail state and handler function to manage modal visibility
    status: completed
  - id: create-detail-modal
    content: Create question detail modal component showing question, all answers with visual indicators
    status: completed
  - id: improve-study-mode
    content: Enhance study mode answer styling for better correct/wrong distinction
    status: in_progress
  - id: improve-mistakes-mode
    content: Enhance mistakes mode answer styling for better correct/wrong distinction
    status: pending
  - id: test-functionality
    content: Test modal interactions, visual clarity, and dark mode support
    status: pending
---

# Mock Exam Results Enhancement Plan

## Overview

Make wrong answers in the mock exam results screen interactive, allowing users to tap them to see a detailed view showing the original question, their selected answer, and the correct answer. Also improve visual clarity in the detail view, study mode, and mistakes mode.

## Current State Analysis

### Mock Exam Results Screen (`app/mock.tsx`)

- Lines 252-280: Results list displays questions with correctness status
- Wrong answers are shown with red background (`bg-rose-50`) but are not clickable
- The `test` object contains all question data needed via `getQuestionFromTest()`
- User answers are stored in `answers` state object keyed by question number

### Study Mode (`app/study.tsx`)

- Lines 195-224: Answer options are displayed
- When answered, correct answer gets green background but clarity could be improved
- Wrong selected answer uses `secondary` variant (gray) which may not be clear enough

### Mistakes Mode (`app/mistakes.tsx`)

- Lines 353-381: Answer options are displayed
- When answered, correct answer gets green background (line 375)
- Wrong selected answer uses `secondary` variant (gray, line 364) which is not clear
- Same visual clarity issues as Study mode

## Implementation Plan

### 1. Make Wrong Answers Clickable in Results Screen

**File: `app/mock.tsx`**

- Convert the `View` component for wrong answers (lines 257-278) to a `Pressable`
- Add state to track which question detail modal is open: `const [selectedQuestionDetail, setSelectedQuestionDetail] = useState(null)`
- Add `onPress` handler that:
  - Gets the question data using `getQuestionFromTest(test, qNo)`
  - Gets the user's answer from `answers[qNoStr]`
  - Sets `selectedQuestionDetail` with question data, user answer, and correct answer

### 2. Create Question Detail Modal Component

**File: `app/mock.tsx`** (add new modal component)

Create a modal similar to `CategorySelector.tsx` pattern that displays:

- Question text
- Question image (if available)
- All answer options with visual indicators:
  - **Correct answer**: Green background (`bg-emerald-500 dark:bg-emerald-600`)
  - **User's wrong answer**: Red/purple background (`bg-rose-500 dark:bg-rose-600` or `bg-purple-500 dark:bg-purple-600`)
  - **Other incorrect answers**: Neutral outline style
- Text labels: "Your Answer" and "Correct Answer" for clarity
- Close button

Modal structure:

```tsx
<Modal
  visible={selectedQuestionDetail !== null}
  transparent={true}
  animationType="fade"
  onRequestClose={() => setSelectedQuestionDetail(null)}
>
  {/* Modal content with question details */}
</Modal>
```

### 3. Improve Visual Clarity in Detail Modal

**File: `app/mock.tsx`**

For each answer option in the modal:

- Check if it's the correct answer (`answerNum === question.correct`)
- Check if it's the user's answer (`answerNum === userAnswer`)
- Apply appropriate styling:
  - Correct answer: Green background, white text, optional checkmark icon
  - User's wrong answer: Red/purple background, white text, optional X icon
  - Other answers: Outline variant, neutral colors
- Add text labels above or within buttons: "✓ Correct Answer" and "✗ Your Answer"

### 4. Improve Study Mode Visual Clarity

**File: `app/study.tsx`**

Enhance answer display (lines 195-224) when `isAnswered` is true:

- **Correct answer**: Keep green background but make it more prominent
- **User's wrong answer**: Change from `secondary` variant to red/purple background (`bg-rose-500 dark:bg-rose-600` or `bg-purple-500 dark:bg-purple-600`) with white text
- **Other incorrect answers**: Keep outline variant but ensure they're visually distinct
- Consider adding text labels or icons for clarity

### 5. Improve Mistakes Mode Visual Clarity

**File: `app/mistakes.tsx`**

Enhance answer display (lines 353-381) when `isAnswered` is true:

- **Correct answer**: Keep green background (line 375) but ensure consistency with other modes
- **User's wrong answer**: Change from `secondary` variant (line 364) to red/purple background (`bg-rose-500 dark:bg-rose-600` or `bg-purple-500 dark:bg-purple-600`) with white text
- **Other incorrect answers**: Keep outline variant but ensure they're visually distinct
- Apply the same visual improvements as Study mode for consistency across the app

### 6. Data Flow

When user taps a wrong answer in results:

1. Extract question number from the pressed item
2. Get question data: `const question = getQuestionFromTest(test, qNo)`
3. Get user's answer: `const userAnswer = answers[qNoStr]`
4. Set modal state: `setSelectedQuestionDetail({ question, userAnswer, qNo })`

Modal displays:

- `question.text` - question text
- `question.image` - question image (via IMAGE_MANIFEST)
- `question.answers` - all answer options
- `question.correct` - correct answer index
- `userAnswer` - user's selected answer

## Files to Modify

1. **`app/mock.tsx`**

   - Add `selectedQuestionDetail` state
   - Convert wrong answer Views to Pressable components
   - Add `handleQuestionDetailPress` function
   - Create question detail modal component
   - Import `Modal` from 'react-native' if not already imported

2. **`app/study.tsx`**

   - Update answer button styling when answered
   - Improve visual distinction between correct, wrong, and neutral answers

3. **`app/mistakes.tsx`**

   - Update answer button styling when answered (lines 353-381)
   - Apply same visual improvements as Study mode for consistency
   - Improve visual distinction between correct, wrong, and neutral answers

## Visual Design Specifications

### Detail Modal Answer Styling:

- **Correct Answer**: 
  - Background: `bg-emerald-500 dark:bg-emerald-600`
  - Text: White
  - Border: `border-emerald-400/60`
  - Label: "✓ Correct Answer" (optional)

- **User's Wrong Answer**:
  - Background: `bg-rose-500 dark:bg-rose-600` or `bg-purple-500 dark:bg-purple-600`
  - Text: White
  - Border: `border-rose-400/60` or `border-purple-400/60`
  - Label: "✗ Your Answer" (optional)

- **Other Answers**:
  - Background: `bg-white dark:bg-slate-800`
  - Text: `text-slate-700 dark:text-slate-300`
  - Border: `border-slate-300 dark:border-slate-600`

### Study Mode Answer Styling (when answered):

- Same color scheme as detail modal for consistency
- Ensure wrong selected answers are clearly red/purple, not gray

### Mistakes Mode Answer Styling (when answered):

- Same color scheme as detail modal and Study mode for consistency across the app
- Ensure wrong selected answers are clearly red/purple, not gray
- Match Study mode improvements exactly for unified user experience

## Testing Considerations

- Test tapping wrong answers in results screen
- Test tapping correct answers (should not open modal, or open with different styling)
- Test modal close functionality
- Test with questions that have images
- Test in both light and dark modes
- Verify study mode improvements are clear and consistent
- Verify mistakes mode improvements match study mode for consistency
- Test all three modes (mock results, study, mistakes) to ensure unified visual language