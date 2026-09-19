# Driver SK — Premium Feel Audit

Date: 2026-05-28
Scope: components, screens, hooks, gestures, package.json
Lens: how the app feels in someone's hand, not what it does.

> **Status reviewed 2026-09-19.** The findings below are kept as written on the audit
> date — including their line numbers, most of which have since moved. Each section now
> ends with a **Status** line saying what happened to it. Three of the five recommended
> fixes shipped, all with the libraries that were already installed.

## 1. Press states — 9 / 20

Every interactive surface routes through `components/ui/button.tsx`, `components/ui/card.tsx`, or a bare `Pressable` in screens. None of them use Reanimated, `react-native-gesture-handler`'s `Gesture.Tap`, or any worklet-driven feedback. The entire press vocabulary is two NativeWind classes:

- `components/ui/button.tsx:59` — `active:scale-[0.99]` (1% — at 60fps it's invisible)
- `components/ui/card.tsx:23` — `active:scale-[0.995]` (0.5%)

There's color shift (`active:bg-indigo-700`) and a static `shadow-lg`, but no animated shadow lift, no spring on release, no overshoot. Things presses sink ~3–4% with a sub-100ms spring; Linear pairs tactile color+scale with explicit release timing. `active:scale-[0.99]` is the CSS equivalent of "I read a blog post about press states."

Worse: bare Pressables (`app/home.tsx:119`, `app/onboarding.tsx:380`, `app/onboarding.tsx:396`, the header back at `components/ui/header.tsx:39`, every Pressable in `components/CategorySelector.tsx`) have no transform at all — only `active:bg-*` color swaps. Reanimated 4.1 and `react-native-worklets` 0.5 are shipped and not used for any touch feedback.

**Fix:** Replace the static button/card with a Reanimated wrapper that pushes scale to 0.96 on `onPressIn` with `withSpring({ damping: 18, stiffness: 320 })` and releases with the same spring. Start in `components/ui/button.tsx`.

**Status — done.** `components/ui/pressable-scale.tsx` is that wrapper, with exactly the prescribed spring (`SPRING_CONFIG = { damping: 18, stiffness: 320, mass: 0.4 }`) and a `useReducedMotion()` branch that keeps colour-only feedback for users who ask for it. `grep -rn "active:scale" app/ components/ src/` now returns nothing. Scale by call site: 0.96 default (Button, home readiness card, onboarding language/skip), 0.985 for Card, 0.92 for the header back button, the home settings gear, and the CategorySelector rows. Two holdouts: the onboarding page-dot indicator is still a bare `Pressable` with no transform, and `components/GameChip.tsx` uses an inline `pressed ? 0.97 : 1` rather than the spring. `PressableScale` also takes a `haptic` prop that fires `selectionAsync()` — no call site passes it, so that path is dead.

## 2. Subtle animations — 10 / 20

Reanimated is in `package.json` (`react-native-reanimated ~4.1.1`) but `grep useSharedValue|withSpring|withTiming` finds zero hits anywhere in `app/`, `components/`, or `src/`. Every animation in the app is the legacy `Animated` API.

What exists:

- `app/index.tsx` — a 4.5s splash that animates 9 letters with per-letter `Animated.sequence` + fade + jump + scale. Lovely on first launch, dead weight on every cold start after. No skip on tap; `setTimeout(letters.length * 180 + 1500)` forces ~3 seconds of waiting before `/home`.
- `app/onboarding.tsx` — `Animated.timing` fade on finish (300ms, fine); animated dot indicator interpolating width 8→24 (Apple-style page dots, good).

What's missing: no entrance animation when a new study question appears (`app/study.tsx:319` Card just snaps in); no transition between correct/wrong answer states (`bg-rose-500` mutates instantly with no flash or settle); no shared element between home cards and their destinations; no `LayoutAnimation` on the readiness bar at `app/home.tsx:174` — the most important number on the home screen and it changes with zero motion.

**Fix:** Animate the readiness bar with `useAnimatedStyle` + `withTiming(width, { duration: 600, easing: Easing.out(Easing.cubic) })`. File: `app/home.tsx:174–178`.

**Status — mostly done.** Three components drive worklets now: `components/ui/animated-bar.tsx` (`withTiming`, 800 ms, `Easing.out(Easing.cubic)`, with a reduced-motion snap), `components/ui/pressable-scale.tsx`, and `components/ui/skeleton.tsx` (`withRepeat` pulse). The prescribed fix shipped — the home readiness bar is `<AnimatedBar value={…} />`, and the stats screen uses the same component. The 4.5 s splash is gone: `app/index.tsx` is one cohesive wordmark motion of about 800 ms (500 ms under Reduce Motion or in a hidden browser tab), routing off the animation's completion callback rather than a `setTimeout` formula — but there is still no skip on tap. Legacy `Animated` remains in `app/index.tsx`, `app/onboarding.tsx`, and `components/game/SwipeHint.tsx`. Still open from the list above: no entrance animation for a new study question, no transition on the correct/wrong colour change, no shared element. `react-native-gesture-handler` is still installed with zero usage; the crossings game uses `PanResponder`.

## 3. Haptics — 2 / 20

`expo-haptics ~15.0.8` is in `package.json`. `grep -r "Haptics|impactAsync"` across the entire codebase: zero hits. Installed and never imported.

The single most important interaction in this app — submitting an answer and learning whether you got it right — at `app/study.tsx:159 handleAnswer` does this:

```js
setIsAnswered(true);
// ...no haptic, no sound, no nothing
```

A driving-test study app where the moment of "did I get this right" carries no physical feedback leaves the entire emotional payload on the table. Duolingo, Quizlet, Brilliant — all buzz on a correct answer and double-tap on a wrong one. This app does nothing.

Other missed beats: streak increment (`app/home.tsx:196`), mock exam completion, navigation push (Cards at `app/home.tsx:204, 224, 243`), category selector confirm (`components/CategorySelector.tsx`), onboarding slide change.

**Fix:** Add `Haptics.notificationAsync(Success)` on correct answer and `Haptics.notificationAsync(Error)` on wrong, in `app/study.tsx:159 handleAnswer`. 5-line change, highest leverage in the audit.

**Status — done.** That change shipped verbatim in `handleAnswer`, and the same Success/Error pair is in `app/mistakes.tsx` and `app/game-quiz.tsx`. The crossings game carries the richest vocabulary: `impactAsync` Heavy on a crash, Medium on stopping, Light on moving off and on a junction passed, `notificationAsync` Warning on a honk and Success on a level up — in both `app/crossing.tsx` and `app/crossing-guide.tsx`. Fifteen call sites in total. The audit's other missed beats are still missed: streak increment, mock completion, navigation push from a home card, category-selector confirm, onboarding slide change. One wrinkle: every call except the one in `app/study.tsx` chains a `.catch(() => {})`.

## 4. Keyboard behavior — N/A — scored 15 / 20

`grep -r TextInput` across `app/`, `components/`, `src/`: zero hits. No `KeyboardAvoidingView`, no `react-native-keyboard-controller`. Not a fail — there's no text input in the app. Question bank is multiple-choice, settings are toggles, language picker is buttons.

Scored 15 instead of full marks because the moment any input is added — a "report this question" form, a name field, search — there's no infrastructure. `react-native-keyboard-controller` is the modern, RN-officially-recommended primitive and isn't installed.

**Keep doing:** Don't add text inputs you don't need. The multiple-choice-only design is correct for the form factor.

**Status — the premise has changed, the gap has not.** There is now exactly one `TextInput` in the app: the points field on `app/exam.tsx`, `keyboardType="number-pad"` / `inputMode="numeric"` / `maxLength={3}`. Its only accommodation is `keyboardShouldPersistTaps="handled"` and `keyboardDismissMode="on-drag"` on the surrounding `ScrollView`; there is still no `KeyboardAvoidingView` and `react-native-keyboard-controller` is still not installed. The exam date deliberately dodges the problem — `components/ui/date-field.tsx` opens a platform date picker and `date-field.web.tsx` uses a native `<input type="date">`, so neither raises a keyboard.

## 5. Loading and empty states — 11 / 20

Loading states are uniformly `ActivityIndicator` in three places:

- `app/study.tsx:283` — `<ActivityIndicator size="large" color="#6366f1" />`
- `app/stats.tsx:71` — identical
- `app/mistakes.tsx` — same pattern

A native spinner is the cheapest possible loading UX. No skeleton card, no shimmer, no perceived-performance work. For Stats — a screen that loads from SQLite with an aggregate query and could render its layout immediately with `—` placeholders — blocking on a spinner is unnecessary.

Empty states are inconsistent:

- `app/mistakes.tsx:316–325` — bare centered title `t('mistakes.empty', lang)`. No illustration, no CTA, no "go practice to start tracking mistakes."
- `app/mistakes.tsx:327–356` — the "no mistakes in this category" path is much better: explains the state, shows a "Show all" button. This is the pattern. Use it everywhere.
- Home cards never reach a true empty state because counts default to zero, but on a fresh install the readiness card shows `0%` / "Needs Work" / `—` accuracy / `0 days` streak — functionally an empty state that feels punitive on first launch. No "let's get started" framing.

**Fix:** Replace `ActivityIndicator` in `app/stats.tsx:71` with a skeleton of the actual layout — gray pill bars where the readiness number, bar, and 7-day chart land. Perceived load time → ~0.

**Status — half done.** The prescribed fix shipped: `components/ui/skeleton.tsx` is a Reanimated pulse and `components/StatsOverviewSkeleton.tsx` mirrors the readiness card's shape (header pill, score, bar, 2×2 stat tiles); `app/stats.tsx` renders it instead of a spinner. `app/study.tsx` still shows a bare `ActivityIndicator`, and `app/mistakes.tsx` still imports `ActivityIndicator` without ever rendering it. The mistakes empty state was rewritten — it now carries a hint line and two CTAs (Smart Study, Mock) rather than a bare title, so the good pattern from the category-empty path is applied on both. The punitive first-launch home card is unchanged: a fresh install still reads `0%` / "Needs Work" / `—` accuracy / `0 days`, with no first-run framing. The only softening since the audit is the forecast line ("about N days at your pace") under the score.

---

## Total: 47 / 100 — Tier: Decent

You have the bones of a competent app — typography, color system, the readiness card composition, the dot indicator, the splash, the empty-with-CTA pattern on category-empty mistakes. None of it feels physical.

The damning data point isn't any single score — it's that `expo-haptics` is installed and never called, and `react-native-reanimated` is installed and never used for any interaction. The bundle cost is paid for both libraries and neither is used. The app feels like a well-designed website running on a phone.

## Single highest-leverage fix this week

**Add success/error haptics in `app/study.tsx:159 handleAnswer`.** Five lines. Ships in 20 minutes. Transforms the core loop from "tap, see color" to "tap, feel right/wrong in your hand." Gateway change: once it's in, you'll want the press-scale spring in `components/ui/button.tsx` and the readiness bar animation in `app/home.tsx:174` the same day.

**It played out exactly that way** — the haptics, the press-scale spring, and the animated readiness bar all landed together, plus the stats skeleton.

## What is still open (2026-09-19)

1. **The fresh-install home card.** Still `0%` / "Needs Work" on a brand-new install. The single most punitive first impression left in the app.
2. **Study-screen motion.** No entrance for a new question, no transition between the neutral and correct/wrong answer states, and still a spinner while it loads.
3. **Small holdouts.** The onboarding dot indicator has no press feedback, `PressableScale`'s `haptic` prop is never used, `app/mistakes.tsx` has a dead `ActivityIndicator` import, and there is still no skip-on-tap on the intro.
4. **Keyboard.** One numeric field with no keyboard-avoidance infrastructure behind it.
