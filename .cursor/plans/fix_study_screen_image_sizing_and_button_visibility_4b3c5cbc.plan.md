---
name: Fix study screen image sizing and button visibility
overview: Fix the study screen layout so that images don't take unnecessary space and the result feedback + Next button are always visible after answering. The solution includes making images responsive with maxHeight constraints, increasing bottom padding when answered, and auto-scrolling to the Next button.
todos:
  - id: "1"
    content: Update image style in study.tsx to use maxHeight instead of fixed height
    status: completed
  - id: "2"
    content: Add conditional bottom padding to ScrollView based on isAnswered state
    status: completed
  - id: "3"
    content: Add useRef hooks for ScrollView and Next button container
    status: completed
  - id: "4"
    content: Implement auto-scroll effect when answer is submitted
    status: completed
  - id: "5"
    content: Apply same fixes to mistakes.tsx for consistency
    status: completed
---

# Fix Study Screen Image Sizing and Button Visibility

## Problem Analysis

Based on the screenshots and code review:

1. **Fixed image height**: Images use `width: 300, height: 300` forcing all images to take 300px height even when unnecessary (like the traffic sign in screenshot 1)
2. **Insufficient bottom padding**: `pb-2` (8px) is too small when result feedback and Next button are added
3. **No auto-scroll**: When answer is submitted, the result/Next button may be pushed off-screen with no automatic scrolling

## Solution Approach

### 1. Make Images Responsive

- Replace fixed `height: 300` with `maxHeight: 300` to allow smaller images to use less space
- Keep `width: 300` or use percentage-based width with `maxWidth` constraint
- Use `resizeMode: 'contain'` to maintain aspect ratio

### 2. Increase Bottom Padding Dynamically

- Increase `pb-2` to `pb-6` or `pb-8` when `isAnswered` is true to ensure Next button has space
- Alternatively, use conditional padding: `pb-${isAnswered ? '8' : '2'}`

### 3. Auto-scroll to Next Button

- Add a `useRef` for the ScrollView
- Add a `useRef` for the Next button container
- When `isAnswered` becomes true, scroll to the Next button using `scrollToEnd()` or `scrollTo()` with the button's position
- Use `useEffect` to trigger scroll when `isAnswered` changes from false to true

## Files to Modify

### `app/study.tsx`

- Line 90: Update ScrollView `contentContainerClassName` to conditionally increase padding
- Line 109: Change image style from fixed `height: 300` to `maxHeight: 300`
- Add `useRef` imports and refs for ScrollView and Next button
- Add `useEffect` to handle auto-scrolling when answer is submitted

### `app/mistakes.tsx` (Optional - same issue exists)

- Apply the same fixes for consistency

## Implementation Details

### Image Style Change

```tsx
// Before:
style={{ width: 300, height: 300, resizeMode: 'contain' }}

// After:
style={{ width: 300, maxHeight: 300, resizeMode: 'contain' }}
```

### ScrollView Padding

```tsx
// Before:
contentContainerClassName="gap-4 pb-2"

// After:
contentContainerClassName={`gap-4 ${isAnswered ? 'pb-8' : 'pb-2'}`}
```

### Auto-scroll Implementation

- Import `useRef` and `useEffect` from React
- Create `scrollViewRef` using `useRef<ScrollView>(null)`
- Create `nextButtonRef` using `useRef<View>(null)`
- Add `useEffect` that triggers when `isAnswered` changes to `true`
- Use `scrollViewRef.current?.scrollToEnd({ animated: true })` or measure button position and scroll to it

## Testing Considerations

- Test with small images (traffic signs) - should use less vertical space
- Test with large images (traffic scenarios) - should be constrained to maxHeight
- Test that Next button is always visible after answering
- Test that scrolling works smoothly on different screen sizes
- Verify both study.tsx and mistakes.tsx screens work correctly