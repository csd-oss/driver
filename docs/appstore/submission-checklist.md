# App Store submission checklist — Driver SK

Everything that can be done in code is done (see "Done in code" at the bottom).
This file is the **UI-only** work: things you set in App Store Connect, the
RevenueCat dashboard, or a hosting provider. Items are ordered by blocking-ness.

---

## 1. Legal + support URLs — DONE

All three pages are hosted and verified live (HTTP 200, no redirects). Privacy + Terms
are wired into the app (`src/lib/links.ts`); support email is `hello-driver@smartie.team`.

- Privacy: `https://www.smartie.team/driver-sk/privacy`  → ASC App Information **Privacy Policy URL**
- Terms: `https://www.smartie.team/driver-sk/terms`
- Support: `https://www.smartie.team/driver-sk/support`  → ASC App Information **Support URL**

> Source content also lives in `docs/legal/*.{md,html}` if you want to keep the
> hosted pages in sync from the repo.

## 2. App Store Connect → App Privacy (the "nutrition label")

This must match the privacy manifest already shipped in the binary. Answer exactly:

**Do you collect data? → Yes.** Then declare these three types, all **Not linked to
the user** and **Not used for tracking**:

| Data type | Category | Purpose | Linked? | Tracking? |
|---|---|---|---|---|
| Product Interaction | Usage Data | Analytics | No | No |
| Crash Data | Diagnostics | App Functionality | No | No |
| Device ID | Identifiers | Analytics | No | No |

Everything else → **Not collected** (no name, email, location, contacts, photos,
health, browsing, financial info). Do **not** declare "Purchases" as collected —
Apple's own IAP layer handles that and you don't read payment data.

When asked *"Do you or your partners use data for tracking?"* → **No** (no IDFA,
no AdSupport — verified in the binary).

## 3. App Store Connect → App Information / Pricing

- **Privacy Policy URL** (App Information) → your hosted privacy URL. **Required** for
  subscription apps.
- **Support URL** (Version → App Review Information or App Information) → your hosted
  `support.html`. Apple requires a working webpage here, not a `mailto:`.
- **Marketing URL** → optional.
- **Age Rating** → complete the questionnaire. This app: no objectionable content →
  expected **4+**. (Driving content is not "simulated gambling" or "mature".)
- **Primary category** → Education (suggested secondary: Reference).

## 4. In-app purchases (subscription apps reject without this)

In App Store Connect → your app → **Subscriptions** and **In-App Purchases**:

1. Create the auto-renewable subscription group and the three products with these
   exact product IDs (already referenced by RevenueCat):
   - `com.smartie.driver.pro.weekly`
   - `com.smartie.driver.pro.yearly`
   - `com.smartie.driver.pro.lifetime` (non-consumable / one-time, not in the sub group)
2. **Yearly → Introductory Offer → Free trial → 3 days**, new subscribers only.
3. Fill each product's **localized display name + description** (SK, EN, HU) and a
   **review screenshot** (a screenshot of the paywall).
4. **Attach all three products to this app version** so they're reviewed together —
   status must read **"Ready to Submit"**. A missing attachment is the #1
   subscription-app rejection.
5. Set the **base territory to Slovakia (EUR)** and let Apple auto-convert tiers.

## 5. iPad decision (do this before the first screenshot upload)

`app.json` has `supportsTablet: true`, so App Review **will test on iPad** and you
**must upload 13" iPad screenshots**. Two options:

- **Ship iPad:** test on an iPad simulator, capture 13" screenshots, upload them.
- **iPhone only (faster):** tell me and I'll set `supportsTablet: false`, then you only
  need iPhone 6.9" + 6.5" screenshots.

## 6. Screenshots & metadata (App Store Connect → Version)

- Required iPhone sizes: **6.9"** (iPhone 16 Pro Max / 17 Pro Max) and **6.5"**.
  Framed captures exist under `docs/appstore/framed/{en,sk,hu}/`.
- App name, subtitle, keywords, description, promotional text — per locale (you have
  EN/SK/HU captions in `docs/appstore/captions.json`).
- **Privacy Policy URL** and **Support URL** as above.

## 7. RevenueCat dashboard (conversion-critical, not code)

1. Confirm the **`Driver SK Pro` entitlement** is attached to all three products and
   the **`default` offering** contains Weekly / Yearly / Lifetime packages.
2. **Paywall localizations:** the hosted paywall renders in the *device* locale —
   add **SK, EN, and HU** localizations so a user whose phone language differs from
   their in-app choice still sees a translated paywall.
3. **Paywall footer:** ensure it has **Privacy Policy + Terms of Use links and a close
   button** (Apple Guideline 3.1.2 expects them on the paywall itself; V2 paywalls
   control this in the editor, not via SDK).
4. Turn on the **RevenueCat → PostHog integration** so revenue lands next to the new
   `paywall_shown` / `paywall_result` funnel events (placements: `smart_study`,
   `mistakes`, `settings`).
5. Recommended package order in the editor: **Yearly (highlighted) → Lifetime → Weekly**.

## 8. Build, upload, and submit

1. Ensure analytics keys are present at archive time (`.env` with
   `EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST`) — without them analytics is
   silently off in the production build.
2. If you changed `app.json` privacy/iPad config, regenerate native config:
   `npx expo prebuild -p ios` (plain, **not** `--clean` — see CLAUDE.md). The privacy
   manifest is also already written into `ios/DriverSK/PrivacyInfo.xcprivacy` so an
   archive without a prebuild still includes it.
3. `npm run bump:ios` to bump the build number.
4. Archive + upload via your usual flow (see the `ios-deploy-workflow` memory note —
   archive **without** API-key signing flags, upload via `xcrun altool` with the API key).
5. **Export compliance:** already answered in code (`usesNonExemptEncryption: false`),
   so App Store Connect won't ask at upload time.
6. Do one **sandbox purchase pass on a real device**: gated tap → paywall → purchase →
   relaunch (entitlement persists) → restore on a second device; plus Settings →
   "Upgrade to Pro" for a free account.
7. **App Review notes:** state that all features are reachable, the app has no account,
   and (if you want reviewers to see Pro) consider temporarily noting that gated
   features require subscription — Apple's reviewers purchase in sandbox automatically.

---

## Done in code (no action needed)

- **Privacy manifest** (`ios.privacyManifests` in `app.json` + `ios/DriverSK/PrivacyInfo.xcprivacy`):
  required-reason APIs (UserDefaults, FileTimestamp, SystemBootTime, DiskSpace),
  `NSPrivacyTracking=false`, and the three collected data types above — because
  PostHog/RevenueCat ship no manifest of their own in these versions.
- **Export compliance:** `usesNonExemptEncryption: false`.
- **App icon:** 1024×1024, no alpha channel (verified).
- **No tracking / IDFA:** verified absent in the binary, so no `NSUserTrackingUsageDescription`.
- **In-app legal/support:** Settings → About card with Privacy Policy and Terms of Use
  (both live, wired in `src/lib/links.ts`), Contact support, and app version.
- **Hostable legal pages:** `docs/legal/*.html`.
- **Privacy policy + terms source:** `docs/legal/*.md`.
