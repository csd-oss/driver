# FULL BUILD SPEC — Expo React Native Driving Exam MVP (Official Data + Local Images + Language + Intro)

You are building an Expo React Native app “Driving MVP” for training/testing using the provided files:
- data5.js (official tests/questions/answers)
- lang.js (official UI strings arrays)
- test_mini.js (reference logic for correct answer + scoring rules)
- local images folder: data/minv_images (already downloaded)

Constraints:
- No backend
- Persist state with AsyncStorage
- Use React Navigation (native stack)
- Use NativeWind for styling (className)
- Create minimal “shadcn-like” UI components manually in components/ui
- Everything should work offline (images from local folder)

Deliverable:
- Provide full working code for all listed files.
- The app must run in Expo (Android/iOS).

============================================================
1) PROJECT SETUP (assume already created via create-expo-app)
============================================================

Dependencies:
- @react-navigation/native
- @react-navigation/native-stack
- react-native-screens
- react-native-safe-area-context
- @react-native-async-storage/async-storage
- nativewind
- tailwindcss
- i18n-js
- expo-localization

NativeWind configuration:
- babel plugin: "nativewind/babel"
- tailwind.config.js content paths include App, src, components

============================================================
2) FILES / FOLDER STRUCTURE
============================================================

/App.js
/data/data5.js                (converted to ES module export)
/data/lang.js                 (kept as reference OR minimally wrapped)
/data/minv_images/*           (local images)
/data/imageManifest.js        (generated static requires map)
/scripts/genImageManifest.mjs (generator script)
/src/lib/storage.js
/src/lib/settings.js
/src/lib/bank.js
/src/lib/engine.js
/src/i18n/i18n.js
/src/i18n/strings.js          (minimal translation keys)
/src/screens/IntroAnimationScreen.js
/src/screens/LanguageSelectScreen.js
/src/screens/HomeScreen.js
/src/screens/StudyScreen.js
/src/screens/MistakesScreen.js
/src/screens/MockScreen.js
/src/screens/SettingsScreen.js
/components/ui/screen.js
/components/ui/card.js
/components/ui/button.js
/components/ui/divider.js
/components/ui/text.js        (optional convenience wrapper)
/components/ui/aspect-image.tsx (image with dynamic aspect ratio sizing)

============================================================
3) DATA SOURCE (data5.js) — OFFICIAL STRUCTURE
============================================================

data5.js currently defines: var data = [[...],[...],[...]]
Convert it to:
  export const data = [[...],[...],[...]];

Semantics:
- data[langIndex] where langIndex = lang-1, lang in {1,2,3}
- data[langIndex] is an array of test objects (e.g., 100 tests)

Each test object contains:
- pocet (number of questions)
- cas (time limit in seconds)
- minbody (minimum points to pass)
- maxbody (maximum points)
- otazky: object keyed by question number "1".."pocet"
  - otazky[qNo] is an array with one object:
    { id, text, body, obrazok, platna }
- odpovede: object keyed by question number "1".."pocet"
  - odpovede[qNo] is array of 3 objects:
    { odpoved }
- okruhy: topic blocks (ignore for MVP, optional future)

Important: Answer indices are 1..3 in the official logic:
- platna is 1,2,3
- userChoice must be stored as 1,2,3 (NOT 0-based)

============================================================
4) CORRECTNESS + SCORING (from test_mini.js logic)
============================================================

Correctness:
- correct if userChoice === platna (both 1..3)

Points:
- Each question has "body" points.
- Exam score = sum(body for each correct answer)
- Pass if score >= test.minbody

============================================================
5) LOCAL IMAGES (data/minv_images) — MUST USE MANIFEST
============================================================

Expo/Metro cannot do require(dynamicPath). We must generate a static manifest:

Create:
- /data/imageManifest.js
Exports:
  export const IMAGE_MANIFEST = {
    "somefile.jpg": require("./minv_images/somefile.jpg"),
    ...
  };

Create generator script:
- /scripts/genImageManifest.mjs
Behavior:
- Scan ./data/minv_images
- Include files with extensions: .png, .jpg, .jpeg, .webp
- Output ./data/imageManifest.js with a static object map of filename -> require("./minv_images/filename")
- Sort filenames for stable output

Rendering rule:
- If question.obrazok is a non-empty string:
  - const imgSrc = IMAGE_MANIFEST[question.obrazok]
  - If imgSrc exists: render <AspectImage source={imgSrc} maxHeight={300} />
  - Else: render small placeholder text "Image missing: {filename}" (do not crash)
- Use AspectImage component (not raw Image) to ensure images only take the vertical space needed based on their aspect ratio

Assumption:
- obrazok string matches local filename exactly (including extension). If mismatch, show placeholder.

============================================================
6) SETTINGS + PERSISTENCE (AsyncStorage)
============================================================

We store two categories of state:
A) Settings:
- lang: number (1,2,3)
- hasOnboarded: boolean

B) Learning state (language-aware):
- mistakesByLang: { "1": string[], "2": string[], "3": string[] }   (store question IDs as strings)
- streaksByLang:  { "1": { [qid]: number }, "2": {...}, "3": {...} } (correct streak for mistaken questions)

Rules:
- Reset Progress must reset ONLY mistakesByLang and streaksByLang; must NOT reset language or hasOnboarded.

Storage keys:
- One root key is fine (e.g. DRIVING_MVP_V1), or separate keys (settings + progress). Either is OK but keep it clean.

============================================================
7) QUESTION BANK HELPERS (src/lib/bank.js)
============================================================

Implement helper functions to use official data cleanly:

Required functions:
- getTests(lang): returns data[lang-1]
- getRandomTest(lang): returns a random test object
- getQuestionFromTest(test, qNo):
    returns an object:
      {
        qid: string (question id),
        text: string,
        points: number,
        image: string (filename or ""),
        correct: number (1..3),
        answers: string[3],
        qNo: number
      }
- flattenRandomQuestion(lang):
    returns a random question across the entire question bank (across all tests):
    - choose random test index
    - choose random qNo between 1..test.pocet
    - return normalized question object above

Optional but useful:
- buildQuestionIndex(lang):
    Map qid -> { testIndex, qNo } for fast lookup in Mistakes
    Cache it in memory per language (module-level variable) to avoid rebuilding.

- findQuestionById(lang, qid):
    Use index if available or brute-force search through tests.

============================================================
8) LEARNING ENGINE (src/lib/engine.js)
============================================================

Implement applyAnswer for mistakes tracking (language-aware):

Inputs:
- state: { mistakesByLang, streaksByLang }
- lang (1..3)
- qid (string)
- isCorrect (boolean)

Rules:
- if wrong:
  - add qid to mistakesByLang[lang] (no duplicates)
  - set streaksByLang[lang][qid] = 0
- if correct and qid is currently in mistakes:
  - increment streaksByLang[lang][qid]
  - if streak >= 2:
    - remove qid from mistakesByLang[lang]
    - delete streaksByLang[lang][qid]

Return updated state.

============================================================
9) LOCALIZATION (MVP)
============================================================

Goal:
- Language changes UI AND selects question dataset (data[lang-1])
- Keep localization minimal; do NOT try to convert the entire lang.js system.

Approach:
- Use i18n-js + expo-localization OR a minimal custom t(key) function.
- Provide translations for EN + at least one additional language matching your dataset (since data includes 3 languages). Use:
  - lang=1,2,3 mapping to translations.
- Keys needed at minimum:
  - app.title
  - home.study, home.mistakes, home.mock, home.settings, home.reset
  - study.next, study.correct, study.wrong
  - mistakes.empty, mistakes.mastery, mistakes.next
  - mock.finish, mock.score, mock.pass, mock.fail, mock.addWrong, mock.new
  - language.selectTitle
  - settings.languageTitle

Implement:
- src/i18n/strings.js: translations keyed by lang number
- src/i18n/i18n.js: exports t(key, lang)

Example:
export const t = (key, lang) => STR[key]?.[lang] ?? STR[key]?.[1] ?? key;

============================================================
10) NAVIGATION FLOW (React Navigation)
============================================================

Stack screens:
- IntroAnimation
- LanguageSelect
- Home
- Study
- Mistakes
- Mock
- Settings

Startup logic:
- App loads settings from AsyncStorage
- If hasOnboarded is false/missing:
    initialRoute = IntroAnimation
  else:
    initialRoute = Home

IntroAnimation behavior:
- Display autoschool name centered (hardcode placeholder “AUTO SCHOOL”)
- Simple animation via React Native Animated:
  - fade in and scale from 0.95 -> 1.0 over ~800ms
- After ~1.6–2.0 seconds:
  - if hasOnboarded false => navigate replace to LanguageSelect
  - else => navigate replace to Home

LanguageSelect behavior:
- Show list of languages (3 buttons)
- On select:
  - save lang
  - set hasOnboarded=true
  - navigate replace to Home

Settings behavior:
- Show current language
- Allow changing language (buttons)
- Save lang and apply immediately
- When language changes, Home + other screens should show translated UI and pull data from the selected dataset.

============================================================
11) SCREEN REQUIREMENTS
============================================================

A) HomeScreen
- Show title
- Show mistake count for current language
- Buttons:
  - Study
  - Mistakes
  - Mock Exam
  - Settings
- Reset Progress button:
  - clears mistakesByLang + streaksByLang only

B) StudyScreen
- On mount:
  - load settings (lang)
  - load progress (mistakes/streaks)
- Pick a random question across the entire bank for that lang:
  - bank.flattenRandomQuestion(lang)
- Render:
  - question text
  - image if available via IMAGE_MANIFEST
  - 3 answer buttons
- On answer:
  - lock further selection
  - show “Correct”/“Wrong”
  - show explanation-like info:
    - points value
    - highlight correct answer
  - update progress via applyAnswer and persist
- Next button loads another random question (keep state loaded)

C) MistakesScreen
- Load lang + progress
- Get list of mistaken qids: mistakesByLang[lang]
- If empty: show “No mistakes” message
- Else:
  - show one question at a time (lookup via bank.findQuestionById)
  - show mastery streak: streaksByLang[lang][qid] / 2
  - answer + feedback + next
  - If a mistake is removed after correct twice, ensure navigation doesn’t break; choose next available item safely.

D) MockScreen (Official-like)
- On mount:
  - load lang + progress
  - pick random test = bank.getRandomTest(lang)
- Render questions 1..test.pocet
  - For MVP, can use ScrollView with cards
  - Store answers: { [qNo]: choice(1..3) }
- Finish:
  - compute:
    - score = sum(question.body where choice == platna)
    - max = test.maxbody
    - pass = score >= test.minbody
  - show summary + per-question correctness
- Button “Add wrong to mistakes”:
  - for each wrong question, add its qid to mistakesByLang[lang]
  - persist
- Button “New mock exam”:
  - pick new random test and reset answers

Timer:
- Optional for MVP. If implemented:
  - countdown from test.cas
  - auto-finish when reaches 0

E) SettingsScreen
- Language selection UI
- Apply immediately (persist and update global language state)
- Do not reset onboarding unless explicitly asked (not needed)

============================================================
12) UI COMPONENTS (manual “shadcn-like”)
============================================================

Use NativeWind for styling.
Implement minimal primitives:

components/ui/screen.js
- wraps SafeAreaView/View with padding and background

components/ui/card.js
- rounded border, padding, gap

components/ui/button.js
- variants: default, outline, secondary
- supports disabled
- uses Pressable and className styles

components/ui/divider.js
- thin line

components/ui/text.js (optional)
- convenience for typography variants (title, subtitle)

components/ui/aspect-image.tsx
- Image component that maintains aspect ratio without wasting vertical space
- Uses Image.resolveAssetSource() to get actual image dimensions
- Calculates display height based on container width and image aspect ratio
- Props:
  - source: ImageSourcePropType (required)
  - maxHeight: number (optional, default 300) - maximum height constraint
  - maxWidth: number (optional) - maximum width constraint
- Behavior:
  - Measures container width on layout
  - Scales image proportionally to fit width while respecting maxHeight/maxWidth
  - Only takes the vertical space needed for the image (no empty space below)
- Use this component instead of raw Image when displaying question images

============================================================
13) QUALITY + SAFETY REQUIREMENTS
============================================================

- Never crash if:
  - an image filename is not found in IMAGE_MANIFEST
  - a question id cannot be found (show placeholder “Question not found” and allow Next)
- Keep performance acceptable:
  - do not rebuild a full index on every render
  - if building qid index, cache in module scope per language
- Use 1-based answer indexing consistently.

============================================================
14) OUTPUT REQUIREMENT
============================================================

Provide:
- Full code for every listed file.
- Ensure data5.js is converted to an ES module export.
- Provide scripts/genImageManifest.mjs.
- Show how to call the generator (node scripts/genImageManifest.mjs).
- Do not include backend or network calls.

END SPEC
