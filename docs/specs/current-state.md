# CURRENT STATE SPECIFICATION — Driver SK (Slovakia Driving Exam App)

**Last Updated:** January 23, 2026  
**Version:** 1.4.0  
**Status:** Production MVP

---

## EXECUTIVE SUMMARY

**Driver SK** is a fully functional Expo React Native mobile application designed to help users prepare for Slovakia driving license exams. The app provides comprehensive question bank access, adaptive study modes with intelligent question selection, mistake tracking, mock exam simulations, and multi-language support (Slovak, English, Hungarian). All functionality works completely offline with local data storage and embedded images.

---

## 1. BUSINESS CONTEXT

### 1.1 Product Purpose
- **Primary Goal:** Enable users to study and practice for Slovakia driving license theoretical exams
- **Target Audience:** Aspiring drivers preparing for their driving license exam in Slovakia
- **Value Proposition:** 
  - Offline-first learning experience
  - Official exam questions and answers
  - Adaptive learning through Smart Practice Mode (intelligent question prioritization)
  - Mistake tracking with mastery system
  - Multi-language support for diverse learners
  - Realistic mock exam simulation

### 1.2 Core Features (Implemented)
1. **Smart Study** - Adaptive question selection prioritizing mistakes, unseen questions, and weak categories
2. **Smart Study Reason Labels** - Visual indicators explaining why each question was selected (mistake, new question, weak area, review)
3. **Mistakes Review** - Focused practice on incorrectly answered questions with clear answer indicators
4. **Mock Exams** - Full exam simulation with timer, scoring, and interactive results review
5. **Category Filtering** - Study by topic categories (e.g., traffic signs, rules)
6. **Progress Tracking** - Mistake tracking with mastery system (2 correct answers removes from mistakes)
7. **Statistics Dashboard** - Comprehensive statistics tracking with visual emphasis (hero progress summary, coverage bar, and 7-day activity bars)
8. **Multi-language Support** - Slovak (1), English (2), Hungarian (3)
9. **Offline Operation** - All data and images stored locally
10. **Question Detail Modal** - Interactive review of wrong answers with full question context
11. **Smart Practice Algorithm** - Intelligent question prioritization system that adapts to user's learning state

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
      ├─ Your Progress Card (hero KPI summary + accuracy bar) → StatisticsScreen
      ├─ Smart Study → StudyScreen (adaptive question selection)
      ├─ Mistakes → MistakesScreen (review incorrect answers)
      ├─ Mock Exam → MockScreen (full exam simulation)
      ├─ Settings → SettingsScreen (language selection)
      └─ Reset Progress → Clears mistakes/streaks (keeps language/onboarding)
```

### 2.2 Study Mode Flow
1. User selects Smart Study from Home
2. Screen loads current language and progress
3. Category selector displayed (default: "All")
4. Smart Study algorithm selects question using priority system:
   - **Priority 1:** Questions from mistakes list (if any)
   - **Priority 2:** Unseen questions (never displayed before)
   - **Priority 3:** Questions from weakest category (lowest accuracy)
   - **Priority 4:** Random fallback (if all above exhausted)
   - Category filter applied at each priority level
   - Anti-repetition: Excludes last 20 questions seen (allows reuse if needed)
5. User selects answer → immediate feedback (Correct/Wrong)
6. Progress updated:
   - Wrong answer → added to mistakes, streak reset to 0
   - Correct answer → if in mistakes, increment streak; if streak ≥ 2, remove from mistakes
7. "Next" button loads new question via Smart Practice algorithm

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
   - Per-question correctness list (large, button-like items)
8. Interactive wrong answers:
   - Wrong answer items are clickable (Pressable)
   - Tapping opens detail modal showing:
     - Original question text and image
     - All answer options with visual indicators:
       - Green background for correct answer (labeled "✓ Correct Answer")
       - Red/purple background for user's wrong answer (labeled "✗ Your Answer")
       - Neutral styling for other incorrect options
   - Modal respects safe zones (notch area)
   - Images fill full modal width
   - Smooth scrolling for long content
9. Options:
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

**Statistics Storage:**
```
AsyncStorage → DRIVING_MVP_STATS
  └─ statsByLang: {
       "1": {
         study: {
           attempts: number,
           correct: number,
           wrong: number,
           daily: { [yyyyMMdd]: { attempts, correct, wrong } },
           byCategory: { [category]: { attempts, correct, wrong } }
         },
         mock: {
           examsTaken: number,
           examsPassed: number,
           bestScore: number,
           lastScore: number,
           history: Array<{id, date, testId, score, maxScore, minToPass, passed, durationSec, wrongCount, addedToMistakesCount}>
         },
         engagement: {
           currentStreak: number,
           lastStudyDate: string | null,  // yyyyMMdd
           lastOpenedDate: string | null
         },
         coverage: {
           questionsSeen: string[]  // Array of question IDs seen at least once
         }
       },
       "2": {...},
       "3": {...}
     }
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
│   ├── home.tsx                  # Home screen (with progress preview card)
│   ├── study.tsx                 # Study mode
│   ├── mistakes.tsx              # Mistakes review
│   ├── mock.tsx                  # Mock exam
│   ├── stats.tsx                 # Statistics dashboard
│   └── settings.tsx             # Settings
│
├── src/
│   ├── lib/                      # Business logic
│   │   ├── bank.js              # Question bank helpers
│   │   ├── engine.js             # Learning engine (mistakes/streaks)
│   │   ├── settings.js           # Settings management
│   │   ├── storage.js            # AsyncStorage wrapper
│   │   ├── stats.js              # Statistics tracking
│   │   ├── categories.js         # Category helpers
│   │   └── smartPractice.js      # Smart Practice algorithm
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
  - `getRandomTestWithIndex(lang)` - Random test with index for tracking
  - `getQuestionFromTest(test, qNo)` - Normalize question object
  - `flattenRandomQuestion(lang)` - Random question across all tests
  - `buildQuestionIndex(lang)` - Build qid → {testIndex, qNo} map
  - `findQuestionById(lang, qid)` - Fast question lookup
  - `getTestForQuestion(lang, qid)` - Get test for question (for categories)
  - `getTotalUniqueQuestions(lang)` - Get total count of unique questions

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

#### 3.4.5 Smart Practice System (`src/lib/smartPractice.js`)
- **Adaptive Algorithm:** Priority-based question selection system
- **Main Function:**
  - `getSmartQuestion({ lang, selectedCategory, recentIds })` - Main entry point for smart question selection
  - **Return Shape:** Returns `{ question, reason }` object where:
    - `question`: Normalized question object
    - `reason`: Object with `type` (one of: `mistake`, `unseen`, `weak`, `random`) and optional `category` (for `weak` type)
- **Helper Functions:**
  - `pickFromMistakes(...)` - Priority 1: Select from mistakes list
  - `pickUnseen(...)` - Priority 2: Select questions never seen
  - `pickFromWeakCategory(...)` - Priority 3: Select from weakest category
  - `isRecent(qid, recentIds)` - Check if question is in recent list
  - `pushRecent(qid, recentIds, max=20)` - Add to recent list (maintains max size)
- **Priority System:**
  1. Mistakes (highest priority) - Questions user got wrong → reason type: `mistake`
  2. Unseen Questions - Questions never displayed → reason type: `unseen`
  3. Weak Categories - Questions from categories with lowest accuracy → reason type: `weak` (includes category name)
  4. Random Fallback - Existing random selection if all above exhausted → reason type: `random`
- **Features:**
  - Category-aware: Respects selected category filter at each priority level
  - Anti-repetition: Tracks last 20 questions (in-memory, not persisted)
  - Performance optimized: Uses cached indices, builds seen set once per session
  - Loads stats and progress internally for separation of concerns
  - **Reason Tracking:** Exposes selection logic as reason metadata for UI display

#### 3.4.6 Image Handling
- **Static Manifest:** `data/imageManifest.js` contains static `require()` calls
- **Generator:** `scripts/genImageManifest.mjs` scans `data/minv_images/` and generates manifest
- **Fallback:** Missing images show placeholder text (no crashes)
- **Format:** Supports .png, .jpg, .jpeg, .webp

#### 3.4.7 Localization (`src/i18n/`)
- **Simple System:** Key-based translation with language index (1-3)
- **Fallback:** Falls back to lang 1 if translation missing
- **Keys:** Organized by feature (home.*, study.*, mistakes.*, etc.)
- **Languages:** Slovak (1), English (2), Hungarian (3)

#### 3.4.8 UI Components
- **Design System:** Minimal "shadcn-like" components
- **Styling:** NativeWind (Tailwind CSS) with className prop
- **Variants:** Button (default, outline, secondary), Text (title, subtitle, body, caption)
- **Accessibility:** Font scaling support via FontScaleContext
- **Dark Mode:** Automatic via system preference
- **Visual Clarity Enhancements:**
  - Answer buttons use color-coded backgrounds for clarity:
    - Correct: `bg-emerald-500 dark:bg-emerald-600` (green)
    - Wrong (user's selection): `bg-rose-500 dark:bg-rose-600` (red/purple)
    - Neutral: Outline variant with slate colors
  - Consistent visual language across Study, Mistakes, and Mock Exam modes
  - Modal components respect safe areas using `useSafeAreaInsets()`

#### 3.4.9 Storage (`src/lib/storage.js`)
- **Keys:**
  - `DRIVING_MVP_SETTINGS` - User settings
  - `DRIVING_MVP_PROGRESS` - Learning progress
- **Operations:** Load, save, reset (progress only)
- **Settings Caching:** In-memory cache in `settings.js` for performance

#### 3.4.10 Statistics System (`src/lib/stats.js`)
- **Tracking:** Comprehensive statistics tracking per language
- **Core Functions:**
  - `loadStats()` - Load statistics from AsyncStorage
  - `saveStats(stats)` - Persist statistics
  - `getStatsForLang(lang)` - Get stats for specific language
  - `recordStudyAttempt({ lang, category, isCorrect })` - Track study answers
  - `recordQuestionSeen({ lang, qid })` - Track questions displayed
  - `recordMockResult({ lang, testId, score, maxScore, minToPass, passed, durationSec, wrongCount })` - Track mock exams
  - `recordAddedToMistakes({ lang, historyId, count })` - Update mock history
  - `updateStreak({ lang, isMockPass })` - Update engagement streak
- **Helper Functions:**
  - `todayKey()`, `yesterdayKey()` - Date utilities (yyyyMMdd format)
  - `getLast7Days()` - Get last 7 days date keys
  - `calculateAccuracy(attempts, correct)` - Calculate percentage
  - `calculateCoverage(lang, questionsSeen)` - Calculate question coverage percentage
  - `getTotalUniqueQuestions(lang)` - Get total unique questions count
  - `pruneDaily(stats, keepDays)` - Remove old daily entries
  - `capHistory(history, max)` - Limit history array size
- **Tracking Rules:**
  - Study attempts tracked only on first answer submission per question view
  - Questions marked as "seen" when displayed (not just answered)
  - Streak increments when last study was yesterday, resets on gap
  - Daily stats kept for last 14 days (auto-pruned)
  - Mock history capped at 50 entries
  - Coverage tracks unique questions seen vs total in bank

### 3.5 Screen Implementations

#### IntroAnimation (`app/index.tsx`)
- **Animation:** Letter-by-letter fade, scale, and lift animation
- **Duration:** ~3-4 seconds total
- **Navigation:** Routes to `/language` or `/home` based on onboarding status

#### LanguageSelect (`app/language.tsx`)
- **Options:** 3 language buttons (Slovak, English, Hungarian)
- **Action:** Sets language, sets `hasOnboarded=true`, navigates to home

#### Home (`app/home.tsx`)
- **Display:** 
  - "YOUR PROGRESS" card (pressable) showing:
    - Mistakes remaining
    - Accuracy (last 7 days)
    - Current streak
  - Feature buttons (Study, Mistakes, Mock, Settings)
  - Reset progress option
- **Data:** Loads language, progress, and statistics on focus
- **Navigation:** Routes to Study, Mistakes, Mock, Settings, Statistics

#### Study (`app/study.tsx`)
- **Features:**
  - Category selector
  - Smart Practice question selection (adaptive algorithm)
  - **Reason label pill** - Displays why question was selected (e.g., "Fixing a mistake", "New question", "Weak area: Traffic signs", "Review question")
  - **Points bubble** - Question point value displayed in pill format on the right side
  - Image rendering (if available)
  - Answer buttons with enhanced visual feedback:
    - Correct answer: Green background (emerald-500/600)
    - Wrong selected answer: Red/purple background (rose-500/600) with white text
    - Other answers: Neutral outline styling
  - Next button (appears after answer)
- **Logic:** 
  - Smart Practice algorithm for intelligent question selection
  - Category filtering integrated into priority system
  - Recent question tracking (in-memory, max 20) for anti-repetition
  - Progress tracking, auto-scroll
- **Statistics Tracking:**
  - Tracks question as "seen" when displayed
  - Records first answer attempt only (prevents double-counting)
  - Updates daily statistics
  - Updates category statistics (if category selected)
  - Updates engagement streak on first answer of day
- **Visual Clarity:** Clear distinction between correct and incorrect answers with color-coded backgrounds
- **Smart Practice Integration:**
  - Uses `getSmartQuestion()` from `smartPractice.js`
  - Maintains `recentQuestionIds` ref for anti-repetition
  - Automatically prioritizes mistakes, unseen questions, and weak categories

#### Mistakes (`app/mistakes.tsx`)
- **Features:**
  - Category selector
  - Filtered mistake list
  - Shuffled question order
  - Mastery streak display
  - Empty state handling
  - Answer buttons with enhanced visual feedback (same as Study mode):
    - Correct answer: Green background (emerald-500/600)
    - Wrong selected answer: Red/purple background (rose-500/600) with white text
    - Other answers: Neutral outline styling
- **Logic:** Category filtering, dynamic list updates, graceful navigation
- **Statistics Tracking:**
  - Tracks question as "seen" when displayed
  - Records first answer attempt only (prevents double-counting)
  - Updates daily statistics
  - Updates category statistics (if category selected)
  - Updates engagement streak on first answer of day
- **Visual Clarity:** Consistent visual language with Study mode for unified user experience

#### Mock (`app/mock.tsx`)
- **Features:**
  - Timer display (if test has time limit)
  - Question navigation bar (numbered buttons)
  - Current question indicator
  - Answer selection
  - Previous/Next navigation
  - Finish button
  - Results screen with score breakdown:
    - Large, button-like question items (min-height 56px, increased padding)
    - Wrong answers are clickable (Pressable)
    - Correct answers remain non-interactive (View)
  - Question Detail Modal:
    - Opens when tapping wrong answer items
    - Displays full question context (text, image, all answers)
    - Visual indicators: green for correct, red/purple for user's wrong answer
    - Respects safe zones (notch area)
    - Images fill full modal width
    - Smooth scrolling with proper height constraints
    - Close button at bottom
- **Logic:** Score calculation, pass/fail determination, wrong answer collection, modal state management
- **Statistics Tracking:**
  - Tracks test index for stable test ID generation (format: "L{lang}-T{testIndex}")
  - Marks all questions in exam as "seen" when exam starts
  - Records mock exam result on finish (score, pass/fail, duration, wrong count)
  - Updates engagement streak if exam passed
  - Records count when wrong answers added to mistakes

#### Statistics (`app/stats.tsx`)
- **Features:**
  - Overview Card:
    - Mistakes remaining
    - Study attempts (lifetime)
    - Accuracy (lifetime)
    - Accuracy (last 7 days)
    - Question coverage (X / Y questions seen, Z%)
  - Last 7 Days Card:
    - Daily breakdown showing attempts and accuracy per day
    - Empty state if no data
  - Mock Exams Card:
    - Exams taken
    - Pass rate
    - Best score
    - Last score
    - Empty state if no exams taken
  - Consistency Card:
    - Current streak
    - Last study date (formatted: "Today", "Yesterday", or date)
- **Data:** Loads statistics and progress on focus
- **Calculations:** All metrics calculated from stored statistics data

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
6. **Smart Practice Optimizations:**
   - Seen set built once per session (not per question)
   - Uses cached question indices from `buildQuestionIndex()`
   - Category stats map is small and fast to read
   - Recent IDs list is small (max 20 items)
   - No repeated full bank scans

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
  - Modal components use `useSafeAreaInsets()` to respect notch/dynamic island areas
  - Proper padding applied to prevent content overlap with system UI

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
2. **No User Accounts:** No login or user profiles
3. **No Offline Updates:** Question data updates require app update
4. **Timer Only in Mock:** Study mode has no timer
5. **No Charts:** Statistics displayed as text/metrics only (no visual charts)
6. **Limited History:** Mock exam history capped at 50 entries

### 5.2 Potential Enhancements
1. **Visual Charts:** Add charts/graphs for accuracy trends, study activity over time
2. **Exam History Detail:** Detailed exam history screen with per-question review links
3. **Category Breakdown:** Category-specific accuracy statistics
4. **Unique Questions Tracking:** Track which specific questions have been seen
5. **Readiness Score:** Composite score based on mistakes + recent performance
6. **Favorites System:** Bookmark questions for later review
7. **Study Plans:** Structured learning paths
8. **Explanation Text:** Add explanations for correct answers
9. **Achievements:** Gamification with badges/achievements
10. **Backend Sync:** Cloud sync for progress across devices
11. **Question Updates:** OTA updates for question data

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
- ✅ Mock exam results: Wrong answers clickable, detail modal functional
- ✅ Visual clarity: Correct/wrong answer indicators work in Study and Mistakes modes
- ✅ Modal scrolling: Smooth scrolling with proper height constraints
- ✅ Safe zones: Modals respect notch/dynamic island areas
- ✅ Image display: Images fill full width in modals
- ✅ Statistics tracking: Study attempts, mock exams, streaks tracked correctly
- ✅ Statistics screen: All metrics display correctly
- ✅ Question coverage: Questions seen tracking works
- ✅ Home progress card: Displays correct metrics and navigates to stats
- ✅ Smart Practice Mode: Adaptive question selection prioritizes mistakes, unseen questions, and weak categories
- ✅ Anti-repetition: Recent question tracking prevents immediate repeats
- ✅ Smart Study Reason Labels: Reason pills display correctly for all question types (mistake, unseen, weak, random)
- ✅ Points Display: Points bubble displays correctly on right side with proper styling

**Automated Testing:**
- Not implemented (future consideration)

---

## END OF CURRENT STATE SPECIFICATION

This document reflects the current implementation state as of January 23, 2026. 

**Recent Updates (v1.4.0):**
- Smart Study Reason Labels: "Why this question?" feature implemented
  - Visual pill labels explaining question selection rationale
  - Four reason types: mistake, unseen, weak (with category), random
  - Multi-language support for all reason labels
  - Points display moved to pill format on right side
  - Enhanced user trust and perceived intelligence of Smart Study
  - Clean UI: Reason pill on left, points bubble on right, both outside question card

**Previous Updates (v1.3.0):**
- Smart Practice Mode: Intelligent adaptive question selection system implemented
  - Priority-based algorithm: Mistakes → Unseen → Weak Categories → Random
  - Anti-repetition system: Tracks last 20 questions (in-memory) to prevent immediate repeats
  - Category-aware: Respects selected category filter at each priority level
  - Performance optimized: Uses cached indices, builds seen set once per session
  - Study Mode Enhancement: Replaced random selection with Smart Practice algorithm
  - User Experience: App feels intelligent and personalized, automatically guides users to weaknesses

**Previous Updates (v1.2.0):**
- Statistics Dashboard: Comprehensive statistics tracking system implemented
  - Study performance tracking (attempts, accuracy, daily trends)
  - Mock exam history and performance metrics
  - Engagement streak tracking
  - Question coverage tracking (questions seen vs total)
- Home Screen Enhancement: Progress preview card showing key metrics
- Statistics Screen: Full-featured dashboard with overview, trends, mock exams, and consistency metrics
- Per-Language Statistics: All statistics tracked separately per language
- Local Storage: Statistics stored in separate AsyncStorage key (`DRIVING_MVP_STATS`)

**Previous Updates (v1.1.0):**
- Enhanced Mock Exam Results: Wrong answers are now clickable, opening a detail modal
- Improved Visual Clarity: Study and Mistakes modes use color-coded answer backgrounds (green for correct, red/purple for wrong)
- Question Detail Modal: Interactive review of wrong answers with full context and clear visual indicators
- UI Improvements: Larger, more button-like question items in results list
- Modal Enhancements: Proper safe zone handling, full-width images, smooth scrolling

For the original build specification, see `docs/specs/spec.md`. For category feature details, see `docs/specs/categories.md`. For statistics feature specification, see `docs/specs/statistics.md`. For Smart Practice Mode specification, see `docs/specs/smart-practice.md`. For Smart Study Reason Labels specification, see `docs/specs/why-q-smart.md`.
