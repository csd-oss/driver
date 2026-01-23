---
name: Driving Exam MVP Build
overview: Build a complete Expo React Native driving exam app following the spec, adapted to use Expo Router instead of React Navigation native stack. The app will include question bank management, study mode, mistakes tracking, mock exams, localization, and offline image support.
todos:
  - id: "1"
    content: "Create data layer: storage.js, settings.js, bank.js, engine.js"
    status: completed
  - id: "2"
    content: "Create localization system: strings.js, i18n.js"
    status: completed
  - id: "3"
    content: "Create UI components: screen.js, card.js, button.js, divider.js, text.js"
    status: completed
  - id: "4"
    content: Create root layout with conditional routing based on hasOnboarded
    status: completed
  - id: "5"
    content: Create IntroAnimation screen with fade/scale animation
    status: completed
  - id: "6"
    content: Create LanguageSelect screen
    status: completed
  - id: "7"
    content: Create HomeScreen with navigation buttons and mistake count
    status: completed
  - id: "8"
    content: Create StudyScreen with random questions and answer feedback
    status: completed
  - id: "9"
    content: Create MistakesScreen with question review and mastery tracking
    status: completed
  - id: "10"
    content: Create MockScreen with full exam simulation and scoring
    status: completed
  - id: "11"
    content: Create SettingsScreen with language selection
    status: completed
---

# Driving Exam MVP Build Plan

## Overview

Build a complete Expo React Native driving exam training app with offline support, multiple languages, and learning features. The app will be adapted to use Expo Router (instead of React Navigation native stack as originally specified) while maintaining all functional requirements.

## Architecture

### Navigation Flow (Expo Router)

```
Root Layout (_layout.tsx)
├── IntroAnimation (index.tsx - conditional)
├── LanguageSelect (language.tsx)
└── Main Stack
    ├── Home (home.tsx)
    ├── Study (study.tsx)
    ├── Mistakes (mistakes.tsx)
    ├── Mock (mock.tsx)
    └── Settings (settings.tsx)
```

### Data Flow

- Settings & Progress: AsyncStorage → `src/lib/storage.js` → `src/lib/settings.js`
- Question Bank: `data/data5.js` → `src/lib/bank.js` → Screens
- Learning Engine: `src/lib/engine.js` → Updates mistakes/streaks
- Images: `data/imageManifest.js` → Static require map → Screens
- Localization: `src/i18n/strings.js` → `src/i18n/i18n.js` → Screens

## Implementation Tasks

### 1. Data Layer (`src/lib/`)

**storage.js**

- AsyncStorage wrapper functions
- Keys: `DRIVING_MVP_SETTINGS`, `DRIVING_MVP_PROGRESS`
- Functions: `loadSettings()`, `saveSettings()`, `loadProgress()`, `saveProgress()`, `resetProgress()`

**settings.js**

- Settings management with defaults
- Structure: `{ lang: 1, hasOnboarded: false }`
- Functions: `getSettings()`, `updateSettings()`, `getLanguage()`

**bank.js**

- Question bank helpers using `data/data5.js`
- Functions:
  - `getTests(lang)` - returns `data[lang-1]`
  - `getRandomTest(lang)` - random test from language dataset
  - `getQuestionFromTest(test, qNo)` - normalized question object
  - `flattenRandomQuestion(lang)` - random question across all tests
  - `buildQuestionIndex(lang)` - cached qid → {testIndex, qNo} map
  - `findQuestionById(lang, qid)` - lookup by qid using index

**engine.js**

- Learning/mistakes tracking logic
- Function: `applyAnswer(state, lang, qid, isCorrect)`
- Rules:
  - Wrong answer → add to mistakes, reset streak to 0
  - Correct answer + in mistakes → increment streak
  - Streak >= 2 → remove from mistakes

### 2. Localization (`src/i18n/`)

**strings.js**

- Translation keys for lang 1, 2, 3
- Keys: `app.title`, `home.*`, `study.*`, `mistakes.*`, `mock.*`, `language.*`, `settings.*`
- Structure: `{ [key]: { 1: "...", 2: "...", 3: "..." } }`

**i18n.js**

- Translation function: `t(key, lang)`
- Fallback to lang 1 if missing

### 3. UI Components (`components/ui/`)

**screen.js**

- SafeAreaView wrapper with padding/background
- Uses NativeWind className

**card.js**

- Rounded border, padding, gap
- Pressable variant support

**button.js**

- Variants: default, outline, secondary
- Disabled state support
- Uses Pressable + NativeWind

**divider.js**

- Thin horizontal line

**text.js** (optional)

- Typography variants: title, subtitle, body

### 4. Screens (`app/`)

**Root Layout (`app/_layout.tsx`)**

- Check `hasOnboarded` from AsyncStorage
- Conditional initial route:
  - `hasOnboarded === false` → `index` (IntroAnimation)
  - `hasOnboarded === true` → `home` (HomeScreen)
- Stack navigator with all screens

**IntroAnimation (`app/index.tsx`)**

- Animated fade + scale (0.95 → 1.0 over 800ms)
- Display "COOL AUTO SCHOOL" centered in ComicSans(or symylar) and with different colors
- After 1.6-2s: navigate to `language` if not onboarded, else `home`

**LanguageSelect (`app/language.tsx`)**

- 3 language buttons (lang 1, 2, 3)
- On select: save lang, set `hasOnboarded=true`, navigate to `home`

**HomeScreen (`app/home.tsx`)**

- Title (translated)
- Mistake count for current language
- Buttons: Study, Mistakes, Mock Exam, Settings
- Reset Progress button (clears mistakes/streaks only)

**StudyScreen (`app/study.tsx`)**

- Load lang + progress on mount
- Display random question via `flattenRandomQuestion(lang)`
- Show: question text, image (via IMAGE_MANIFEST), 3 answer buttons
- On answer: lock selection, show Correct/Wrong, show points, highlight correct
- Update progress via `applyAnswer`, persist
- Next button loads new random question

**MistakesScreen (`app/mistakes.tsx`)**

- Load lang + progress
- Get `mistakesByLang[lang]` list
- If empty: show "No mistakes" message
- Else: show one question at a time via `findQuestionById`
- Display mastery streak: `streaksByLang[lang][qid] / 2`
- Answer + feedback + next
- Handle removal after mastery gracefully

**MockScreen (`app/mock.tsx`)**

- Load lang + progress
- Pick random test via `getRandomTest(lang)`
- Render questions 1..test.pocet in ScrollView
- Store answers: `{ [qNo]: choice(1..3) }`
- Finish button:
  - Compute score = sum(body where choice == platna)
  - Show summary: score, max, pass/fail
  - Show per-question correctness
- "Add wrong to mistakes" button: add wrong qids to mistakes
- "New mock exam" button: pick new test, reset answers
- Optional: Timer countdown from `test.cas`

**SettingsScreen (`app/settings.tsx`)**

- Show current language
- Language selection buttons
- Save and apply immediately (persist, update global state)

### 5. Data Files

**data/data5.js**

- Already converted to ES module (`export const data`)
- No changes needed

**data/imageManifest.js**

- Already generated
- No changes needed

**scripts/genImageManifest.mjs**

- Already exists
- No changes needed

### 6. Configuration

**babel.config.js**

- Already has `nativewind/babel` plugin
- No changes needed

**tailwind.config.js**

- Already configured with content paths
- No changes needed

**package.json**

- All required dependencies already installed
- No changes needed

## Key Implementation Details

### Answer Indexing

- Use 1-based indexing consistently (1, 2, 3)
- `platna` and `userChoice` both 1..3

### Image Handling

- Check `IMAGE_MANIFEST[question.obrazok]`
- If missing: show placeholder text "Image missing: {filename}"
- Never crash on missing images

### Error Handling

- Missing question: show "Question not found", allow Next
- Missing image: show placeholder, continue
- Invalid data: graceful fallbacks

### Performance

- Cache question index per language in module scope
- Don't rebuild index on every render
- Load settings/progress once per screen mount

## File Structure Summary

```
/app
  _layout.tsx (root layout with conditional routing)
  index.tsx (IntroAnimation)
  language.tsx (LanguageSelect)
  home.tsx (HomeScreen)
  study.tsx (StudyScreen)
  mistakes.tsx (MistakesScreen)
  mock.tsx (MockScreen)
  settings.tsx (SettingsScreen)

/src/lib
  storage.js
  settings.js
  bank.js
  engine.js

/src/i18n
  strings.js
  i18n.js

/components/ui
  screen.js
  card.js
  button.js
  divider.js
  text.js (optional)

/data
  data5.js (already ES module)
  imageManifest.js (already generated)
  lang.js (reference only)
  test_mini.js (reference only)
  minv_images/ (already exists)

/scripts
  genImageManifest.mjs (already exists)
```

## Testing Considerations

- Verify AsyncStorage persistence across app restarts
- Test language switching updates all screens
- Verify mistakes tracking and streak logic
- Test mock exam scoring matches official logic
- Verify image loading from manifest
- Test offline functionality (no network required)