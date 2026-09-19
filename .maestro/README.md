# Maestro E2E tests — Driver SK

End-to-end UI tests for the app, runnable on **iOS simulators** and **Android emulators**.
App id (both platforms): `com.smartie.driver`.

## Flows

| File | Covers |
|------|--------|
| `01_smoke.yaml` | App launches from a clean state and reaches onboarding |
| `02_onboarding.yaml` | Onboarding carousel → skip → language pick → Home |
| `03_navigation.yaml` | Home → Study / Mistakes / Mock / Stats / Settings and back |
| `04_study.yaml` | Open Study, answer a question, advance to the next |
| `05_settings.yaml` | Toggle readiness mode, then turn the morning reminder **off** |
| `06_exam.yaml` | Settings → record a real exam result (96 points) → the "passed" card on Home |
| `07_game.yaml` | Home → game hub → exam-picture quiz: answer one item, advance |
| `08_crossing.yaml` | Home → game hub → crossings runner: start, swipe down then up |
| `09_guide.yaml` | Home → game hub → crossing guide: brief, first lesson, verdict, next lesson |
| `subflows/complete_onboarding.yaml` | Reusable: cleared app → Home (used via `runFlow`) |

`config.yaml` selects `[0-9]*.yaml`, so `maestro test .maestro` runs only the numbered
flows (subflows are pulled in via `runFlow`, not run standalone). It also declares an
`APP_ID` env var that no flow currently reads — every flow spells out
`appId: com.smartie.driver` itself.

The subflow has no `launchApp` of its own; each numbered flow does its own
`launchApp: { clearState: true }` first.

## Recorded runs

Screen recordings in [`recordings/`](recordings/): `ios.mp4` and `android.mp4`. They were
captured in May 2026 and show the **01–05** suite only — flows 06–09 were added later and
are not in the videos.

## Selector convention

Elements are matched by **`testID`**. Screens carry a `screen.<name>` id (`screen.home`,
`screen.study`, `screen.crossingGuide`, …) for "are we here" assertions regardless of
locale, and interactive elements reuse the **i18n key** of their label wherever they have
one (`home.smartStudyCta`, `language.lang2`, `settings.notificationsMorning`,
`exam.recordResult`) — so selectors stay language-independent and map to
`src/i18n/strings.js`. Indexed, container and state-dependent elements use synthetic ids
with no i18n counterpart (`study.answer.1`, `crossing.scene`, `guide.brief`,
`home.examPassed`, `game.playCrossing` / `game.startGuide`). testIDs are threaded through
the shared UI primitives in `components/ui/` (Button, Card, Screen, Header, PressableScale)
and `UIText` (which already spreads props).

Two gaps in the convention worth knowing about:

- `app/index.tsx` (the intro) has no `screen.*` id, so there is no way to assert "we are on
  the splash"; flows wait for `screen.onboarding` or `screen.home` instead.
- `03_navigation.yaml` taps the literal string `"Finish exam"` to confirm the mock-exam
  early-finish dialog. `confirmDialog` renders an OS alert whose buttons carry no testID, so
  this one selector is locale-dependent and only works because the subflow picks English.

## Prerequisites

- **Maestro CLI**: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- **Java 17+** (Maestro requires it). With Homebrew's JDK:
  ```bash
  export JAVA_HOME="/opt/homebrew/opt/openjdk"
  export PATH="$JAVA_HOME/bin:$PATH:$HOME/.maestro/bin"
  ```
- A **Release** build of the app installed on the target simulator/emulator (Release so the
  JS is bundled and the app runs without the Metro dev server).
- **`EXPO_PUBLIC_BYPASS_PAYWALL=true` at build time.** Smart Study and Mistakes are gated
  behind the RevenueCat entitlement on iOS, so `03_navigation.yaml` and `04_study.yaml`
  would hit the paywall instead of the screen they assert. `app.config.js` turns that
  variable into `extra.bypassPaywall`, and `src/lib/purchases.ts` then reports every check
  as entitled. It is a build-time flag, not a Maestro `env:` var — nothing in the flows
  reads environment variables. Android is unaffected (`isPurchasesSupported()` is iOS-only)
  but the flag is harmless there.

## Run on iOS (simulator)

```bash
# 1. Boot a simulator and install a Release build
xcrun simctl boot "iPhone 17"
EXPO_PUBLIC_BYPASS_PAYWALL=true npx expo run:ios --configuration Release --device "iPhone 17"

# 2. Run all flows
export JAVA_HOME="/opt/homebrew/opt/openjdk"
export PATH="$JAVA_HOME/bin:$PATH:$HOME/.maestro/bin"
maestro test .maestro            # or a single flow: maestro test .maestro/04_study.yaml
```

## Run on Android (emulator)

The Android toolchain on this machine is set up via Homebrew command-line tools (no Android
Studio needed). One-time setup:

```bash
brew install openjdk@17 android-commandlinetools

export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export ANDROID_SDK_ROOT=$ANDROID_HOME
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH

yes | sdkmanager --licenses
sdkmanager "platform-tools" "emulator" "platforms;android-36" "build-tools;36.0.0" \
           "system-images;android-36;google_apis;arm64-v8a"

echo no | avdmanager create avd -n maestro_test \
  -k "system-images;android-36;google_apis;arm64-v8a" --device pixel
```

Each run:

```bash
# Boot the emulator headless (use JAVA_HOME for openjdk, NOT openjdk@17, here — Maestro needs >=17)
export JAVA_HOME=/opt/homebrew/opt/openjdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$HOME/.maestro/bin:$PATH

emulator -avd maestro_test -no-window -no-audio -no-snapshot -no-boot-anim -gpu swiftshader_indirect &
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done

# Build + install a Release APK (Gradle needs JDK 17)
JAVA_HOME=/opt/homebrew/opt/openjdk@17 EXPO_PUBLIC_BYPASS_PAYWALL=true npx expo run:android --variant release

# Run flows
maestro test .maestro
```

`android.package` is set to `com.smartie.driver` in `app.json`. The `/android` project is
generated by `expo prebuild -p android` (gitignored, like `/ios`).

### Caveats fixed during initial Android setup

- **Asset id collisions**: RN's Android resource id function strips `-` (it doesn't replace
  it). Six images in `data/minv_images/obr3/dz/` (`1-11.png`, `1-14.png`, `1-15.png`,
  `1-16.png`, `2-23.png`, `2-31.png`) collided with sibling `.jpg` files (`111.jpg`, etc.).
  They've been renamed `-` → `_` (`1_11.png`, …) and `data/imageManifest.js` was updated to
  point at the new filenames. The lookup keys in the manifest are unchanged, so callers
  using those keys continue to work.
- **Missing `splashscreen_logo`**: the expo-splash-screen plugin in `app.json` has no
  `image`, so a fresh `expo prebuild -p android` generates `styles.xml` referencing
  `@drawable/splashscreen_logo` but never produces the drawable. If you re-prebuild Android,
  copy a placeholder first:
  `cp assets/images/icon.png android/app/src/main/res/drawable/splashscreen_logo.png`
  (or add `"image": "./assets/images/icon.png"` to the splash plugin config).

## Notes

- Flows start with `launchApp: { clearState: true }` for a deterministic fresh install.
- The onboarding subflow uses the **Skip** path so it never triggers the OS
  notification-permission dialog. `02_onboarding.yaml` shows the carousel path.
  `05_settings.yaml` toggles the morning reminder **off** for the same reason.
- The intro animation is now ~0.8s (`app/index.tsx`, ~0.5s under Reduce Motion), but the
  first assert after launch still uses a 20s `extendedWaitUntil` to cover migrations, the
  native splash, and a cold Release start. Several flow comments still say "~4.5s intro" —
  that is the old letter-by-letter animation and is stale.
- Language selection is two steps: `language.lang2` picks, `language.continue` commits.
  Only the subflow does both.
- No flow exercises `screen.paywall` or `screen.crossingLog`, both of which exist in code.

### Known-stale flows

Two flows encode UI that has since changed, and will fail as written:

- `02_onboarding.yaml` taps `language.lang2` and then waits for `screen.home`, but
  `app/language.tsx` only *selects* on that tap — `language.continue` is needed to leave the
  screen. The subflow was updated for the Continue button; this flow was not.
- `08_crossing.yaml` taps `game.playCrossing`, but `app/game.tsx` renders that id only once
  the crossing guide has been finished (`settings.has_finished_guide`). From a cleared state
  the button is `game.startGuide`, which is what `09_guide.yaml` asserts. The runner flow
  needs to complete or skip the guide first.
