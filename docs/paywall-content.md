# Paywall Content Spec — for the RevenueCat editor

Build sheet for every paywall in Driver SK. Each spec is component-by-component
and ready to type into the RC v2 paywall editor. Localizations for `sk_SK`,
`en_US`, `hu_HU` are included inline — paste them into the "Localizations"
panel of each text component.

Three paywalls total. **Build the Onboarding paywall first and copy-duplicate
it from the dashboard for the two feature gates** — most of the design,
benefits, packages, and footer are shared. Only the hero badge and the title
change per variant.

---

## Shared design system

These values apply to every paywall.

### Colour palette

Mirrors the existing app (slate background, indigo primary, emerald success).
Hex values for the RC editor's colour picker:

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg.canvas` | `#F8FAFC` | `#020617` | Paywall background |
| `bg.surface` | `#FFFFFF` | `#0F172A` | Card surfaces |
| `text.primary` | `#0F172A` | `#F8FAFC` | Headlines, body |
| `text.muted` | `#475569` | `#CBD5E1` | Subheads, fine print |
| `accent.primary` | `#4F46E5` | `#6366F1` | CTA, highlighted package |
| `accent.success` | `#10B981` | `#34D399` | Benefit checkmarks |
| `accent.trial` | `#4338CA` | `#818CF8` | Trial badge background |
| `border.muted` | `#E2E8F0` | `#1E293B` | Card borders |

### Typography

| Role | Size | Weight | Notes |
|---|---|---|---|
| Title | 32 | 800 (Extra Bold) | Tight tracking |
| Subhead | 16 | 400 | `text.muted` colour |
| Benefit line | 16 | 600 (Semibold) | `text.primary` |
| Package label | 18 | 700 (Bold) | |
| Package price | 14 | 500 | `text.muted` |
| Trial badge | 12 | 700 | All caps, letter-spacing +1 |
| CTA | 16 | 700 | White on accent.primary |
| Fine print | 12 | 400 | `text.muted`, line-height 18 |
| Footer link | 13 | 600 | `accent.primary` |

### Hero image

A single asset reused across all three paywalls — upload once, reference
from each paywall's Image component.

- **Format**: PNG with transparent background, **1206 × 800** (RC's V2 hero
  aspect 3:2)
- **Subject suggestion**: a stylised Slovak driving licence card (matches
  the `🪪` emoji used in onboarding) on a soft indigo→sky gradient
  (`#818CF8 → #38BDF8`). No photo of people — keep it abstract / icon-led
  to stay locale-neutral across SK / EN / HU and avoid Apple Review issues
  around stock-photo licensing.
- **Alternative**: the dark navy background with the multicoloured "Driver
  SK" wordmark (matches the existing intro animation in `app/index.tsx`)

### Footer (shared across all three paywalls)

```
Restore Purchases     Terms     Privacy
```

Component links:

| Label | Action type | Target |
|---|---|---|
| Restore Purchases | `restore_purchases` | (built-in) |
| Terms | `navigate_to` → `terms` → URL | `https://www.smartie.team/terms` |
| Privacy | `navigate_to` → `privacy_policy` → URL | `https://www.smartie.team/privacy` |

The Privacy button you already pasted earlier (component JSON, `VBPJOj-Wkx`
URL = `https://www.smartie.team/privacy`) is the exact template — duplicate
that two more times and swap the URLs + labels.

### Package selector — used in all paywalls

Single component, three rows, vertical stack, gap 8. Map each row to the
package by **lookup key**:

| Row | Package lookup | Display | Sub-label | Badge |
|---|---|---|---|---|
| 1 (highlighted) | `$rc_annual` | `{{ product.price_per_period }}` | `{{ product.price_per_week }} / week` | `Most popular` |
| 2 | `$rc_lifetime` | `{{ product.price }}` | `One-time payment` | `Best value` |
| 3 | `$rc_weekly` | `{{ product.price_per_period }}` | `Short-term access` | _none_ |

Use RC's `{{ }}` variables — they resolve to the localised price at runtime
based on the user's storefront. Slovak users see `€29.99 / rok`, Hungarian
users see `12 000 Ft / év`, etc.

Highlighted row styling: 2 px `accent.primary` border, `accent.primary` at
8 % opacity background, package label in `accent.primary` colour.

---

## Paywall 1 — **Onboarding**

**Trigger placement**: `onboarding_complete` (already wired)
**Tone**: welcoming, outcome-led. Close button **on**.
**Goal**: convert high-intent users right after the value pitch.

### Layout

```
┌─────────────────────────────────┐
│         [hero image 3:2]        │  ← shared hero
├─────────────────────────────────┤  ← spacer 24
│  🇸🇰 Slovensko                  │  ← hero badge
│                                 │  ← spacer 12
│  Driver SK Pro                  │  ← title
│                                 │  ← spacer 4
│  Všetky otázky. Tvoje tempo.    │  ← subhead
│                                 │  ← spacer 24
│  ✓ Všetky otázky, všetky        │  ← benefits
│    kategórie                    │
│  ✓ Adaptívne učenie zamerané    │
│    na chyby                     │
│  ✓ Plné skúšobné testy s        │
│    vyhodnotením                 │
│  ✓ Slovenčina, angličtina,      │
│    maďarčina                    │
│                                 │  ← spacer 24
│  ┌───────────────────────────┐  │
│  │ 3 DNI ZADARMO             │  │  ← trial badge
│  │ €29.99/rok           ★   │  │  ← annual (highlight)
│  ├───────────────────────────┤  │
│  │ €49.99 jednorazovo        │  │  ← lifetime
│  ├───────────────────────────┤  │
│  │ €2.99/týždeň              │  │  ← weekly
│  └───────────────────────────┘  │
│                                 │  ← spacer 16
│  [ Začať 3-dňovú skúšku ]       │  ← CTA
│                                 │  ← spacer 12
│  Predplatné sa automaticky      │  ← fine print
│  obnovuje. Zruš kedykoľvek      │
│  v Apple ID.                    │
│                                 │  ← spacer 8
│  Obnoviť · Podmienky · Súkromie │  ← footer
└─────────────────────────────────┘
                ✕                    ← close button (top-right overlay)
```

### Components (top → bottom)

1. **Image** — hero image, full-bleed, fit-aspect
2. **Stack** (vertical, padding 24, gap 24)
   1. **Stack** (vertical, gap 4) — header
      - **Badge** — country chip
      - **Text** — title
      - **Text** — subhead
   2. **Stack** (vertical, gap 12) — benefits
      - 4 × `Icon + Text` rows
   3. **Package Selector** — three packages (see shared spec)
3. **Button** — CTA (full width)
4. **Text** — fine print
5. **Stack** (horizontal, distribute space-evenly) — footer links

### Strings — copy and translate

| Component | `sk_SK` | `en_US` | `hu_HU` |
|---|---|---|---|
| Badge | 🇸🇰 Slovensko | 🇸🇰 Slovakia | 🇸🇰 Szlovákia |
| Title | Driver SK Pro | Driver SK Pro | Driver SK Pro |
| Subhead | Všetky otázky. Tvoje tempo. | Every question. At your pace. | Minden kérdés. A te tempódban. |
| Benefit 1 | Všetky otázky, všetky kategórie | Every question, every category | Minden kérdés, minden kategória |
| Benefit 2 | Adaptívne učenie zamerané na chyby | Adaptive practice that targets mistakes | Adaptív gyakorlás a hibákra fókuszálva |
| Benefit 3 | Plné skúšobné testy s vyhodnotením | Full mock exams with grading | Teljes próbavizsgák értékeléssel |
| Benefit 4 | Slovenčina, angličtina, maďarčina | Slovak, English, Hungarian | Szlovák, angol, magyar |
| Trial badge | 3 DNI ZADARMO | 3 DAYS FREE | 3 NAP INGYEN |
| Annual sub-label | potom €29.99/rok | then €29.99/year | utána €29.99/év |
| Lifetime sub-label | Jednorazovo, navždy | One-time, forever | Egyszeri, örökre |
| Weekly sub-label | Krátkodobý prístup | Short-term access | Rövid távú hozzáférés |
| `Most popular` badge | Najobľúbenejšie | Most popular | Legnépszerűbb |
| `Best value` badge | Najvýhodnejšie | Best value | Legjobb ajánlat |
| CTA | Začať 3-dňovú skúšku | Start 3-day free trial | 3 napos próba indítása |
| Fine print | Predplatné sa automaticky obnovuje. Zruš ho kedykoľvek v Nastaveniach → Apple ID pred koncom obdobia. | Subscription auto-renews. Cancel anytime in Settings → Apple ID before the period ends. | Az előfizetés automatikusan megújul. Bármikor lemondhatod a Beállítások → Apple ID alatt. |
| Footer: Restore | Obnoviť nákup | Restore purchase | Vásárlás visszaállítása |
| Footer: Terms | Podmienky | Terms | Feltételek |
| Footer: Privacy | Súkromie | Privacy | Adatvédelem |

### Close button

- Position: top-right, overlaid on the hero image
- Style: 32 × 32 circular, `bg.surface` at 80 % opacity, `text.primary` ×
  icon
- Action: dismiss (default RC behaviour)

---

## Paywall 2 — **Smart Study gate**

**Trigger placement**: presented programmatically via
`ensureProAccess()` when user taps Smart Study (already wired).
**Tone**: focused, contextual — "you tapped this for a reason".
**Goal**: convert mid-funnel users at the moment of feature intent.

### Differences from Onboarding paywall

Everything below is shared with Paywall 1 **except**:

1. **Hero badge** changes from country chip → feature chip
2. **Title** changes
3. **Subhead** changes
4. **Benefit 1** changes to emphasise the *feature* not the *catalogue*
5. **Close button** still on, but smaller/secondary visual weight

### Strings (only the changed rows)

| Component | `sk_SK` | `en_US` | `hu_HU` |
|---|---|---|---|
| Badge | 🎯 Smart Study | 🎯 Smart Study | 🎯 Smart Study |
| Title | Odomkni Smart Study | Unlock Smart Study | Smart Study feloldása |
| Subhead | Plán učenia, ktorý sa prispôsobí tvojim chybám | A study plan that adapts to your mistakes | Tanulási terv, ami a hibáidhoz igazodik |
| Benefit 1 | Otázky vybrané podľa tvojich slabín | Questions hand-picked from your weak spots | A gyenge pontjaidra szabott kérdések |

Benefits 2–4, packages, CTA, fine print, footer — **identical to Paywall 1**.

---

## Paywall 3 — **Mistakes mode gate**

**Trigger placement**: presented programmatically via
`ensureProAccess()` when user taps Mistakes (already wired).
**Tone**: encouraging — turning weakness into mastery.
**Goal**: same as Paywall 2 but framed for the "review mistakes" flow.

### Differences from Onboarding paywall

Same as Paywall 2 — only badge, title, subhead, benefit 1 change.

### Strings (only the changed rows)

| Component | `sk_SK` | `en_US` | `hu_HU` |
|---|---|---|---|
| Badge | 💪 Chyby | 💪 Mistakes | 💪 Hibák |
| Title | Zvládni svoje chyby | Master your mistakes | Győzd le a hibáidat |
| Subhead | Opakovanie otázok, v ktorých robíš chyby | Drill the questions you got wrong | Gyakorold a hibásan megválaszolt kérdéseket |
| Benefit 1 | Opakovanie s rastúcim intervalom | Spaced repetition that sticks | Térközös ismétlés ami megmarad |

Benefits 2–4, packages, CTA, fine print, footer — **identical to Paywall 1**.

---

## Build order in the dashboard

1. **Paywall 1 (Onboarding)** — build first, end-to-end. This is the
   reference design.
2. In the paywall list, click **Duplicate** on Paywall 1 → name it
   `Smart Study Gate` → swap the 4 changed strings above → publish.
3. Duplicate again → name `Mistakes Gate` → swap the 4 strings → publish.

All three paywalls attach to the same offering (`default`), but to
different placements / audience rules so the right one shows at the
right time. The placement-to-paywall routing is the only thing that
changes between them.

### Placement → paywall mapping in the RC dashboard

| Placement key in code | Paywall to attach | Trigger |
|---|---|---|
| `onboarding_complete` | **Paywall 1** | After onboarding (in code: `presentPaywall()` from `/paywall` screen) |
| _no placement — direct call_ | **Paywall 2** | `ensureProAccess()` triggered from Smart Study tap |
| _no placement — direct call_ | **Paywall 3** | `ensureProAccess()` triggered from Mistakes tap |

Note: paywalls 2 and 3 don't strictly need their own placement keys —
`RevenueCatUI.presentPaywallIfNeeded()` will resolve the **current
offering's paywall** by default. If you want different paywalls for the
two feature gates, the cleanest way is:

- Create two extra **offerings** in RC (e.g. `smart_study_gate` and
  `mistakes_gate`), each with the same three packages, each attached to
  their respective paywall.
- In code, pass `offering` to `presentPaywallIfNeeded` per call site:

```ts
// src/lib/purchases.ts (extend ensureProAccess)
export const ensureProAccess = async (offeringId?: string): Promise<boolean> => {
  // ...
  const result = await RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: PRO_ENTITLEMENT,
    displayCloseButton: true,
    offering: offeringId ? await Purchases.getOfferings().then(o => o.all[offeringId]) : undefined,
  });
  // ...
};
```

If you'd rather not maintain three paywalls, **just point all three
placements at Paywall 1** — same conversion model, less to maintain.
Most apps run a single shared paywall in production and only branch out
when they have data showing it matters.

---

## Asset checklist before publishing

- [ ] Hero image PNG uploaded (1206 × 800, transparent if gradient is in
      the editor; otherwise baked-in)
- [ ] All three language localizations filled in for **every** text
      component (sk_SK, en_US, hu_HU)
- [ ] Package selector references `{{ product.price_per_period }}` not
      hard-coded prices
- [ ] CTA button action set to `purchase_package` (default)
- [ ] Close button action set to `dismiss`
- [ ] Footer URLs verified: `https://www.smartie.team/terms` and
      `https://www.smartie.team/privacy` return 200
- [ ] Preview paywall in editor at: iPhone 17, iPhone SE, iPad
      (RC editor's responsive preview)
- [ ] **Publish** each paywall
- [ ] Attach to correct offering(s) per the table above
- [ ] Verify `default` offering is marked as **Current**
