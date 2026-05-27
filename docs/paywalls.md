# Paywall Strategy — Driver SK

Reference for every paywall placement in the app, what each one is for, the
intended UX, and pricing tuned to the Slovak (and SK/CZ/HU adjacent) market.
All paywalls share the same three packages from the RevenueCat **`default`**
offering — **Weekly**, **Yearly**, **Lifetime** — so a user always sees the
same tiers regardless of where the paywall is triggered. Anchoring on a
single offering keeps A/B testing meaningful and the dashboard tidy.

Implemented today: placements 1, 2, 3. Placements 4–7 are recommendations
for the next iteration once you have baseline conversion numbers.

---

## Packages and pricing (Slovakia / EUR)

App Store Connect product IDs and RevenueCat package keys are already wired.

| Package | RC lookup key | ASC product ID | Slovak price (incl. 23% VAT) | Effective / week |
|---|---|---|---|---|
| Weekly | `$rc_weekly` | `com.smartie.driver.pro.weekly` | **€2.99** | €2.99 |
| Yearly | `$rc_annual` | `com.smartie.driver.pro.yearly` | **€29.99** with **3-day free trial** | €0.58 |
| Lifetime | `$rc_lifetime` | `com.smartie.driver.pro.lifetime` | **€49.99** | — |

### Why these numbers

- **Slovak driving-school cost benchmark**: a full B-category course in
  Slovakia is **€700–900** plus state exam fees. A €30/year or €50 lifetime
  app reads as a rounding error against that baseline — it's psychologically
  free even to price-sensitive students.
- **Weekly €2.99**: an impulse-tier price. Aimed at students who want a
  short crash session before a real test (1–2 weeks). Highest churn but
  highest entry conversion. Roughly the cost of a coffee — designed so the
  decision is not "should I pay?" but "for which length?".
- **Yearly €29.99**: the sweet-spot anchor. Maps to roughly €2.50 / month
  perceived. The **3-day free trial** is critical here — for an exam-prep
  app where users have a clear time-to-value (one or two study sessions),
  a 3-day trial reliably exposes the core value before billing.
  Industry benchmarks from comparable EU study apps: 25–35 % trial-to-paid
  conversion when the product matches need.
- **Lifetime €49.99**: priced so that yearly converters at the end of year 1
  see lifetime as an obvious upgrade ("I already paid 30, just 20 more for
  forever"). Also captures committed students who'd otherwise grind through
  the test once and uninstall.

### Trial offer details

Configure on **Yearly only**:

- Type: **Introductory Offer → Free Trial**
- Duration: **3 days**
- Eligibility: New subscribers only (Apple default)
- App Store Connect: under each subscription → *Subscription Prices* →
  *Introductory Offers* → Add → Pay as you go: No, Free Trial: 3 days.

### Pricing variants worth A/B testing

| Variant | Hypothesis |
|---|---|
| Yearly €24.99, no trial | Lower friction, may beat trial for price-sensitive SK users |
| Yearly €34.99, 7-day trial | Longer trial may lift conversion more than the price hit hurts |
| Lifetime €39.99 | Test if lifetime should be cheaper than yearly × 1.5 |
| Weekly removed | Test paywall-readability without 3 tiers (some apps convert better with two) |

### Localising prices for non-Slovak users

Apple's price tier system **auto-converts** across territories — set the
"base territory" to Slovakia (EUR) and let Apple's tier handle Hungary
(HUF) and the rest of the EU. Manual override only for a country if you
have specific market data.

For reference, equivalent tier targets:

- Hungary: ~12 000 HUF / year (Hungarian users see HUF natively)
- Czech Republic: ~750 CZK / year
- Germany / Austria: €29.99 (same as Slovakia, fine)

---

## Paywall placements

### 1. Onboarding paywall — *skippable* ✅ implemented

**File**: `app/paywall.tsx`
**Trigger**: After the user completes onboarding + language selection,
just before the first `/home` render.
**Behaviour**: `RevenueCatUI.presentPaywallIfNeeded({…})` with a
close-button in the design (V2 paywalls control this in the editor, not
via SDK param). On any result the user lands on `/home` — they're free
to explore.
**Intent**: Capture high-intent users while the onboarding promise is
still fresh. Don't punish people who want to look around first.

**Copy direction**: lead with **outcome** ("Pass the test on your first
try"), not features. The onboarding slides already taught the user what
the app does — the paywall is about getting them to commit.

**Hero copy options**:
- *Driver SK Pro — every question, every category. Pass once, never repeat.*
- *3-day free trial — pass before billing day.*
- *Less than the cost of a parking ticket.*

**Recommended package order in the editor**:
Yearly (recommended highlight) → Lifetime → Weekly.
Decoy effect: lifetime makes yearly look like the safe middle.

---

### 2. Smart Study gate — *required* ✅ implemented

**File**: `app/home.tsx` → `openGated('/study', …)`
**Trigger**: User taps the **Start now** button on the home Smart Study card.
**Behaviour**: `ensureProAccess()` — if entitled, navigate. Otherwise
present the same paywall; navigate only on PURCHASED/RESTORED/NOT_PRESENTED.

**Intent**: Smart Study is the *headline* feature — adaptive practice that
fixes mistakes first. Anyone who actively taps this button is high intent.
Paywall here has the best conversion in the funnel.

**Copy direction**: the paywall here can be the same design as onboarding
(single offering, one set of tiers). If you A/B test paywall design, do
the variants under a separate offering and audience rule in the RC
dashboard rather than building a second paywall in code.

---

### 3. Mistakes mode gate — *required* ✅ implemented

**File**: `app/home.tsx` → `openGated('/mistakes', …)`
**Trigger**: User taps the **Mistakes** button on home.
**Behaviour**: identical to Smart Study.

**Intent**: Mistakes review is the second-order high-value feature. A
user who has practiced enough to have mistakes is invested.

---

### 4. Mock Exam gate — *consider gating* ⏳ not yet implemented

**File**: would be `app/home.tsx` (currently the Mock Exam button is
unrestricted).
**Current behaviour**: free for everyone.

**Argument for gating**: full 28-question mock exams are the most "ready
to ship" experience — closest to the real Slovak licence test. People
who reach the mock are people who are close to taking the real one.
Highest willingness to pay.

**Argument against**: Mock Exam is also the best demo of the app's
quality. Letting free users try one full exam (or one per week) gives
them a real reason to convert.

**Recommendation**: **gate after the first free attempt per week**. Use a
SQLite `mock_exams` row count + `created_at`; if `count(where created_at
> now - 7d) >= 1` and `!isSubscribed()`, present paywall. This converts
mid-funnel users without scaring off the first-look browsers.

---

### 5. Settings → Upgrade entry — *passive*

**File**: `app/settings.tsx`
**Current state**: Settings shows a "Manage Subscription" card that opens
RevenueCat's Customer Center (which handles cancel, refund request,
restore). For **non-subscribers**, the card should show "Upgrade to Pro"
instead and open the paywall.

**Implementation**: branch on `isSubscribed()`. If true → Customer Center.
If false → `presentPaywall()`. One-liner change in the existing handler.

**Intent**: Catch users who passed the onboarding paywall by accident
or want to upgrade after weeks of free use.

---

### 6. Re-engagement notification → paywall ⏳ not yet implemented

**File**: would be `src/lib/notifications.ts`
**Trigger**: A scheduled notification ("Don't forget your daily quiz")
opens the app. Deep link straight to `/study`, which triggers the
Smart Study gate (placement #2).

**Intent**: notifications fire at 08:30 / 12:30 / 19:00 already. Each one
is an opportunity to convert a returning lapsed user.

**Status**: nothing extra to build — placement #2 already covers this
because the deep link lands on Smart Study and hits `openGated`.

---

### 7. Streak milestone / readiness celebration paywall ⏳ optional

**File**: would be a new modal triggered from `app/home.tsx`
**Trigger**: When `readinessScore` crosses **80 %** for the first time
(currently the "Ready" status), OR when `streak >= 7` for the first time.

**Intent**: emotional high-water moment. The user just had a win — show
them the paywall framed as "lock in your progress" or "celebrate with Pro".

**Status**: nice-to-have. Defer until placements 1–3 have a baseline
conversion rate. Adding more paywall placements before measuring the
core funnel just adds noise.

---

## Hard pass: do not put paywalls on

- The **Stats** screen — letting users see their own progress is part of
  the free-to-paid hook. Lock the *features* (Smart Study, Mistakes), not
  the *insights* into how they're doing.
- The **Settings** screen body — language, notifications, analytics
  opt-out should always be free. Settings is the trust surface; paywalls
  here read as manipulative.
- The **Reset Progress** flow — never gate destructive actions.

---

## Configuration checklist (RevenueCat dashboard)

### Per-paywall (design once, reuse across placements)

- [ ] Pick a template that matches the slate/indigo aesthetic (Mojo, Roi,
  or Multi Page templates work well for study apps)
- [ ] Replace the template hero image with a Driver SK / Slovak driving
  related visual
- [ ] Add Slovak (`sk`), English (`en_US`), Hungarian (`hu`) localizations
  in the editor (translation panel)
- [ ] Package selector ordered: Yearly (highlighted) → Lifetime → Weekly
- [ ] Trust elements: "Cancel anytime", "Recurring billing", small fine
  print referencing Apple ID subscription management
- [ ] Footer links: Restore Purchases, Terms, **Privacy
  (https://www.smartie.team/privacy)** — the button JSON you pasted is
  already this
- [ ] Close button visibility: **enabled** (skippable model — users can
  dismiss and still use Mock/Stats/Settings)
- [ ] Attach to offering `default`
- [ ] **Publish** (top-right)

### Per-offering

- [ ] `default` offering marked as Current — already done
- [ ] Three packages attached: `$rc_weekly`, `$rc_annual`, `$rc_lifetime`
  — already done
- [ ] Each package has both Test Store + iOS App Store products —
  already done

### App Store Connect

- [ ] Yearly subscription: add **3-day free trial** introductory offer
  for new subscribers
- [ ] All three products: set price tier per the table above for
  territory **Slovakia (SVK)** as base; let Apple auto-convert for
  Hungary, Czech Republic, etc.
- [ ] Add review screenshot per product (required before App Review)
- [ ] Tax category: "App Store software" (default)

---

## Future considerations

### Family Sharing

Lifetime products especially benefit from enabling **Family Sharing** in
ASC. Driving-license study apps are often shared across siblings or
parents teaching teens. Enabling it can lift Lifetime conversion 10–20 %
without hurting revenue per family.

### Promo codes

Generate 5–10 promo codes in ASC for content reviewers / Slovak driving
school partners. RC reads these via StoreKit transparently.

### Win-back offers

Once you have churned subscribers (3+ months of data), enable a
**Win-back Offer** in ASC: a 50 % discount on yearly for users who
cancelled. Configure the offer in ASC, then add a Win-back targeted
paywall in RC. Industry win-back claim rate: 8–15 %.

### Conversion benchmarks to aim for

| Funnel step | Target | Industry typical |
|---|---|---|
| Onboarding → see paywall | 100 % | 100 % |
| Onboarding paywall → start trial / buy | **8–12 %** | 5–15 % |
| Trial → paid (3-day, no reminder) | **25–35 %** | 20–40 % |
| Smart Study tap → buy (return visit) | **15–25 %** | 10–30 % |
| Lifetime share of revenue | **20–30 %** | varies |

Anything significantly below these warrants paywall design A/B testing
before assuming the product needs more features.
