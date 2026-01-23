# CURRENT STATE SPECIFICATION — Driver SK (Slovakia Driving Exam App)

**Last Updated:** January 23, 2026  
**Version:** 1.0.0  
**Status:** Production MVP

---

## EXECUTIVE SUMMARY

**Driver SK** is a fully functional Expo React Native mobile application designed to help users prepare for Slovakia driving license exams. The app provides comprehensive question bank access, study modes, mistake tracking, mock exam simulations, and multi-language support (Slovak, English, Hungarian). All functionality works completely offline with local data storage and embedded images.

---

## 1. BUSINESS CONTEXT

### 1.1 Product Purpose
- **Primary Goal:** Enable users to study and practice for Slovakia driving license theoretical exams
- **Target Audience:** Aspiring drivers preparing for their driving license exam in Slovakia
- **Value Proposition:** 
  - Offline-first learning experience
  - Official exam questions and answers
  - Adaptive learning through mistake tracking
  - Multi-language support for diverse learners
  - Realistic mock exam simulation

### 1.2 Core Features (Implemented)
1. **Study Mode** - Random question practice with immediate feedback
2. **Mistakes Review** - Focused practice on incorrectly answered questions
3. **Mock Exams** - Full exam simulation with timer and scoring
4. **Category Filtering** - Study by topic categories (e.g., traffic signs, rules)
5. **Progress Tracking** - Mistake tracking with mastery system (2 correct answers removes from mistakes)
6. **Multi-language Support** - Slovak (1), English (2), Hungarian (3)
7. **Offline Operation** - All data and images stored locally

### 1.3 Business Rules
- **Scoring:** Each question has point value (`body`), exam pass threshold is `minbody` points
- **Answer Format:** 1-based indexing (answers are 1, 2, or 3)
- **Mistake Removal:** Questions are removed from mistakes after 2 consecutive correct answers
- **Language Isolation:** Progress (mistakes/streaks) is tracked separately per language
- **Category Persistence:** Selected category preference is saved per language

---

## 2. LOGICAL CONTEXT & USER FLOWS

### 2.1 Application Flow

```
App Launch
  ├─ Check hasOnboarded flag
  │   ├─ false → IntroAnimation → LanguageSelect → Home
  │   └─ true → Home (direct)
  │
  └─ Home Screen
      ├─ Study → StudyScreen (random questions)
      ├─ Mistakes → MistakesScreen (review incorrect answers)
      ├─ Mock Exam → MockScreen (full exam simulation)
      ├─ Settings → SettingsScreen (language selection)
      └─ Reset Progress → Clears mistakes/streaks (keeps language/onboarding)
```

### 2.2 Study Mode Flow
1. User selects Study from Home
2. Screen loads current language and progress
3. Category selector displayed (default: "All")
4. Random question selected:
   - If "All": random across entire question bank
   - If category: random within selected category (up to 30 attempts, fallback to "All")
5. User selects answer → immediate feedback (Correct/Wrong)
6. Progress updated:
   - Wrong answer → added to mistakes, streak reset to 0
   - Correct answer → if in mistakes, increment streak; if streak ≥ 2, remove from mistakes
7. "Next" button loads new random question

### 2.3 Mistakes Review Flow
1. User selects Mistakes from Home
2. Screen loads mistakes list for current language
3. Category filter applied (if selected)
4. Mistakes shuffled for random order
5. One question displayed at a time
6. User answers → feedback → progress updated
7. If question mastered (2 correct), removed from list automatically
8. Navigation handles empty states gracefully

### 2.4 Mock Exam Flow
1. User selects Mock Exam from Home
2. Random test selected from official test bank
3. Timer starts (if test has time limit)
4. Questions displayed one at a time with navigation bar
5. User navigates between questions, answers stored
6. "Finish" button calculates score:
   - Score = sum of points for correct answers
   - Pass = score ≥ test.minbody
7. Results screen shows:
   - Pass/Fail status
   - Score breakdown
   - Per-question correctness
8. Options:
   - "Add wrong to mistakes" → adds incorrect answers to mistakes list
   - "New mock exam" → starts fresh exam

### 2.5 Data Flow

**Settings Storage:**
```
AsyncStorage → DRIVING_MVP_SETTINGS
  ├─ lang: number (1-3)
  ├─ hasOnboarded: boolean
  └─ selectedCategoryByLang: { "1": string, "2": string, "3": string }
```

**Progress Storage:**
```
AsyncStorage → DRIVING_MVP_PROGRESS
  ├─ mistakesByLang: { "1": string[], "2": string[], "3": string[] }
  └─ streaksByLang: { "1": { [qid]: number }, "2": {...}, "3": {...} }
```

**Question Data:**
```
data5.js → data[lang-1] → tests[] → test object
  ├─ pocet: number (question count)
  ├─ cas: number (time limit in seconds)
  ├─ minbody: number (pass threshold)
  ├─ maxbody: number (max points)
  ├─ otazky: { "1": [{id, text, body, obrazok, platna}], ... }
  ├─ odpovede: { "1": [{odpoved}], ... }
  └─ okruhy: { "1": [{txt, zacina}], ... } (categories)
```

---

## 3. TECHNICAL CONTEXT

### 3.1 Technology Stack

**Framework & Core:**
- **Expo SDK:** ~54.0.32
- **React:** 19.1.0
- **React Native:** 0.81.5
- **Expo Router:** ~6.0.22 (file-based routing)

**Navigation:**
- **@react-navigation/native:** ^7.1.28
- **@react-navigation/native-stack:** ^7.10.1
- **expo-router:** File-based routing with Stack navigator

**Styling:**
- **NativeWind:** ^4.2.1 (Tailwind CSS for React Native)
- **Tailwind CSS:** ^3.4.19

**Storage:**
- **@react-native-async-storage/async-storage:** 2.2.0

**Internationalization:**
- **i18n-js:** ^4.5.1
- **expo-localization:** ~17.0.8

**UI/UX:**
- **expo-haptics:** ~15.0.8
- **expo-image:** ~3.0.11
- **react-native-safe-area-context:** ~5.6.0
- **react-native-reanimated:** ~4.1.1

**Platform Support:**
- iOS (with new architecture enabled)
- Android (edge-to-edge enabled)
- Web (static output)

### 3.2 Architecture Overview

**Pattern:** Component-based architecture with separation of concerns

**Layers:**
1. **Presentation Layer** (`app/`): Screen components using Expo Router
2. **Business Logic Layer** (`src/lib/`): Core functionality (bank, engine, settings, categories)
3. **Data Layer** (`data/`): Static question data and image manifest
4. **UI Components** (`components/ui/`): Reusable UI primitives
5. **Storage Layer** (`src/lib/storage.js`): AsyncStorage abstraction

### 3.3 File Structure

```
driver/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout with Stack navigator
│   ├── index.tsx                 # IntroAnimation screen
│   ├── language.tsx              # Language selection
│   ├── home.tsx                  # Home screen
│   ├── study.tsx                 # Study mode
│   ├── mistakes.tsx              # Mistakes review
│   ├── mock.tsx                  # Mock exam
│   └── settings.tsx             # Settings
│
├── src/
│   ├── lib/                      # Business logic
│   │   ├── bank.js              # Question bank helpers
│   │   ├── engine.js             # Learning engine (mistakes/streaks)
│   │   ├── settings.js           # Settings management
│   │   ├── storage.js            # AsyncStorage wrapper
│   │   └── categories.js         # Category helpers
│   │
│   └── i18n/                     # Internationalization
│       ├── i18n.js               # Translation function
│       └── strings.js             # Translation strings
│
├── components/
│   ├── ui/                       # UI primitives
│   │   ├── screen.js             # Screen wrapper
│   │   ├── card.js               # Card component
│   │   ├── button.js             # Button component
│   │   ├── text.js               # Typography component
│   │   ├── divider.js            # Divider component
│   │   ├── header.js             # Header component
│   │   └── icon-symbol.tsx       # Icon component
│   │
│   └── CategorySelector.tsx      # Category selection UI
│
├── data/
│   ├── data5.js                  # Official question data (ES module)
│   ├── imageManifest.js          # Static image require map
│   └── minv_images/              # Local image files (90 files)
│
├── scripts/
│   ├── genImageManifest.mjs      # Image manifest generator
│   └── reset-project.js          # Project reset utility
│
├── contexts/
│   └── FontScaleContext.tsx      # Font scaling context
│
├── hooks/                        # Custom React hooks
├── constants/                    # App constants
└── assets/                       # Static assets
```

### 3.4 Key Implementation Details

#### 3.4.1 Navigation (Expo Router)
- **File-based routing:** Each screen is a file in `app/` directory
- **Stack Navigator:** Configured in `app/_layout.tsx`
- **Conditional Initial Route:** Based on `hasOnboarded` flag
- **No headers:** All screens use custom Header component

#### 3.4.2 Question Bank System (`src/lib/bank.js`)
- **Cached Indices:** Question indices cached per language for performance
- **Functions:**
  - `getTests(lang)` - Get all tests for language
  - `getRandomTest(lang)` - Random test selection
  - `getQuestionFromTest(test, qNo)` - Normalize question object
  - `flattenRandomQuestion(lang)` - Random question across all tests
  - `buildQuestionIndex(lang)` - Build qid → {testIndex, qNo} map
  - `findQuestionById(lang, qid)` - Fast question lookup
  - `getTestForQuestion(lang, qid)` - Get test for question (for categories)

#### 3.4.3 Learning Engine (`src/lib/engine.js`)
- **State Management:** Immutable state updates
- **Logic:**
  - Wrong answer → add to mistakes (no duplicates), reset streak to 0
  - Correct answer → if in mistakes, increment streak; if streak ≥ 2, remove
- **Language-aware:** All operations scoped to language

#### 3.4.4 Category System (`src/lib/categories.js`)
- **Dynamic Computation:** Categories computed from `okruhy` data
- **Functions:**
  - `getCategories(lang)` - Extract category names from first test
  - `getCategoryForQuestion(test, qNo)` - Determine category by question number range
- **Storage:** Selected category persisted per language in settings
- **Filtering:** Study and Mistakes screens filter by selected category

#### 3.4.5 Image Handling
- **Static Manifest:** `data/imageManifest.js` contains static `require()` calls
- **Generator:** `scripts/genImageManifest.mjs` scans `data/minv_images/` and generates manifest
- **Fallback:** Missing images show placeholder text (no crashes)
- **Format:** Supports .png, .jpg, .jpeg, .webp

#### 3.4.6 Localization (`src/i18n/`)
- **Simple System:** Key-based translation with language index (1-3)
- **Fallback:** Falls back to lang 1 if translation missing
- **Keys:** Organized by feature (home.*, study.*, mistakes.*, etc.)
- **Languages:** Slovak (1), English (2), Hungarian (3)

#### 3.4.7 UI Components
- **Design System:** Minimal "shadcn-like" components
- **Styling:** NativeWind (Tailwind CSS) with className prop
- **Variants:** Button (default, outline, secondary), Text (title, subtitle, body, caption)
- **Accessibility:** Font scaling support via FontScaleContext
- **Dark Mode:** Automatic via system preference

#### 3.4.8 Storage (`src/lib/storage.js`)
- **Keys:**
  - `DRIVING_MVP_SETTINGS` - User settings
  - `DRIVING_MVP_PROGRESS` - Learning progress
- **Operations:** Load, save, reset (progress only)
- **Settings Caching:** In-memory cache in `settings.js` for performance

### 3.5 Screen Implementations

#### IntroAnimation (`app/index.tsx`)
- **Animation:** Letter-by-letter fade, scale, and lift animation
- **Duration:** ~3-4 seconds total
- **Navigation:** Routes to `/language` or `/home` based on onboarding status

#### LanguageSelect (`app/language.tsx`)
- **Options:** 3 language buttons (Slovak, English, Hungarian)
- **Action:** Sets language, sets `hasOnboarded=true`, navigates to home

#### Home (`app/home.tsx`)
- **Display:** Mistake count card, feature buttons, reset progress option
- **Data:** Loads language and progress on focus
- **Navigation:** Routes to Study, Mistakes, Mock, Settings

#### Study (`app/study.tsx`)
- **Features:**
  - Category selector
  - Random question display
  - Image rendering (if available)
  - Answer buttons with feedback
  - Points display
  - Next button (appears after answer)
- **Logic:** Category filtering, progress tracking, auto-scroll

#### Mistakes (`app/mistakes.tsx`)
- **Features:**
  - Category selector
  - Filtered mistake list
  - Shuffled question order
  - Mastery streak display
  - Empty state handling
- **Logic:** Category filtering, dynamic list updates, graceful navigation

#### Mock (`app/mock.tsx`)
- **Features:**
  - Timer display (if test has time limit)
  - Question navigation bar (numbered buttons)
  - Current question indicator
  - Answer selection
  - Previous/Next navigation
  - Finish button
  - Results screen with score breakdown
- **Logic:** Score calculation, pass/fail determination, wrong answer collection

#### Settings (`app/settings.tsx`)
- **Features:** Language selection buttons
- **Action:** Updates language immediately, clears cache

### 3.6 Data Structure

#### Question Object (Normalized)
```javascript
{
  qid: string,           // Question ID
  text: string,           // Question text
  points: number,        // Point value (body)
  image: string,          // Image filename or ""
  correct: number,       // Correct answer (1-3)
  answers: string[3],     // Array of 3 answer strings
  qNo: number            // Question number (1-based)
}
```

#### Test Object (from data5.js)
```javascript
{
  pocet: number,          // Number of questions
  cas: number,            // Time limit (seconds)
  minbody: number,       // Minimum points to pass
  maxbody: number,        // Maximum points
  otazky: {               // Questions by number
    "1": [{id, text, body, obrazok, platna}],
    ...
  },
  odpovede: {             // Answers by number
    "1": [{odpoved}],
    ...
  },
  okruhy: {               // Categories by number
    "1": [{txt, zacina}],
    ...
  }
}
```

### 3.7 Performance Optimizations

1. **Cached Question Indices:** Built once per language, reused
2. **Settings Caching:** In-memory cache to avoid AsyncStorage reads
3. **Image Manifest:** Static requires for fast image loading
4. **Lazy Loading:** Screens load data on focus (useFocusEffect)
5. **Efficient Filtering:** Category filtering uses cached test lookups

### 3.8 Error Handling

- **Missing Images:** Placeholder text displayed, no crashes
- **Missing Questions:** "Question not found" message, reload option
- **Empty States:** Proper empty state UI for mistakes, categories
- **Storage Errors:** Console errors logged, graceful degradation
- **Invalid Data:** Fallbacks to defaults (lang 1, empty arrays)

### 3.9 Platform-Specific Considerations

- **iOS:** Uses Avenir Next font, supports Dynamic Type scaling
- **Android:** Uses sans-serif-medium, edge-to-edge enabled
- **Web:** Static output, favicon support
- **Dark Mode:** Automatic via system preference
- **Safe Areas:** Handled via SafeAreaView and SafeAreaProvider

---

## 4. DEPENDENCIES & CONFIGURATION

### 4.1 Key Dependencies
- **expo:** ~54.0.32
- **react:** 19.1.0
- **react-native:** 0.81.5
- **expo-router:** ~6.0.22
- **nativewind:** ^4.2.1
- **@react-native-async-storage/async-storage:** 2.2.0
- **i18n-js:** ^4.5.1

### 4.2 Configuration Files

**app.json:**
- App name: "Driver SK"
- Bundle ID: com.mishabuyalo.driver
- New architecture enabled
- Splash screen configured
- Typed routes enabled
- React compiler enabled

**tailwind.config.js:**
- Content paths: app, src, components
- NativeWind preset

**babel.config.js:**
- NativeWind babel plugin

**metro.config.js:**
- Standard Expo Metro configuration

---

## 5. KNOWN LIMITATIONS & FUTURE CONSIDERATIONS

### 5.1 Current Limitations
1. **No Backend:** All data is static, no sync across devices
2. **No Analytics:** No usage tracking or analytics
3. **No User Accounts:** No login or user profiles
4. **No Offline Updates:** Question data updates require app update
5. **Timer Only in Mock:** Study mode has no timer
6. **No Statistics:** No detailed progress statistics or charts

### 5.2 Potential Enhancements
1. **Statistics Dashboard:** Progress charts, accuracy rates, study streaks
2. **Favorites System:** Bookmark questions for later review
3. **Study Plans:** Structured learning paths
4. **Explanation Text:** Add explanations for correct answers
5. **Exam History:** Save and review past mock exam results
6. **Achievements:** Gamification with badges/achievements
7. **Backend Sync:** Cloud sync for progress across devices
8. **Question Updates:** OTA updates for question data

---

## 6. DEVELOPMENT NOTES

### 6.1 Running the App
```bash
npm install
npx expo start
```

### 6.2 Generating Image Manifest
```bash
node scripts/genImageManifest.mjs
```

### 6.3 Project Reset
```bash
npm run reset-project
```

### 6.4 Code Style
- Uses ESLint with Expo config
- TypeScript for some components (CategorySelector, contexts)
- JavaScript for most screens and lib files
- NativeWind for styling (className prop)

---

## 7. TESTING STATUS

**Manual Testing:**
- ✅ All screens render correctly
- ✅ Navigation flows work
- ✅ Study mode with categories
- ✅ Mistakes tracking and removal
- ✅ Mock exam with timer
- ✅ Language switching
- ✅ Progress persistence
- ✅ Image loading
- ✅ Dark mode support

**Automated Testing:**
- Not implemented (future consideration)

---

## END OF CURRENT STATE SPECIFICATION

This document reflects the current implementation state as of January 23, 2026. For the original build specification, see `docs/specs/spec.md`. For category feature details, see `docs/specs/categories.md`.
