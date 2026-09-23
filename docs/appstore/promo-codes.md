# Promo codes

Three kinds of promo code, all built on Apple **offer codes**. Apple does the
redemption, so the codes need no server or special code in the app.

| Offer (ASC reference name) | Product | Type | What the user gets |
|---|---|---|---|
| Free year | Yearly (`com.smartie.driver.pro.yearly`) | Free, 1 year | One year of Pro, then renews at the normal yearly price unless cancelled |
| 50% off first year | Yearly | Discounted, 1 year | First year for €19.99 (Slovakia base; $19.99 in the US), then the normal price |
| Free lifetime | Lifetime (`com.smartie.driver.pro.lifetime`) | Free | Permanent Pro, no subscription |

All three offers exist in App Store Connect (app 6772699246 → the product →
*Offer Codes*).

## Generating codes

- **Custom codes** (one reusable code such as `DRIVERFREE`) and **one-time
  codes** (a CSV of single-use codes) can only be created once the subscription
  has been approved by App Review and the app is *Ready for Distribution*.
  Until then App Store Connect refuses with that message.
- **Sandbox codes** can be generated now for TestFlight/sandbox testing.
- Set an expiry and a redemption limit per batch so leaked codes run out.

## Where users enter a code

1. **Settings → Subscription → "Redeem a promo code"** (`app/settings.tsx`).
   Calls `presentRedeemCode()` in `src/lib/purchases.ts`, which opens Apple's
   own redemption sheet via `Purchases.presentCodeRedemptionSheet()`.
2. **Paywall footer → "Redeem code"** (RevenueCat hosted paywall "My paywall",
   button action *Navigate to → Offer code redemption*; SK "Uplatniť kód",
   HU "Kód beváltása").
3. **A link**, for codes sent by email or printed:
   `https://apps.apple.com/redeem?ctx=offercodes&id=6772699246&code=CODE`
   (opens the App Store, redeems, and offers to install the app).
4. The App Store app itself: account → *Redeem Gift Card or Code*.

The sheet returns as soon as it opens; the result arrives later as a
RevenueCat `CustomerInfo` update. `onEntitlementChange` in `purchases.ts`
pushes that to Settings, which flips to the Pro state.

iOS only. The PWA is free, and Android has no Apple offer codes (Google Play
promo codes would be a separate setup).

## Analytics (PostHog)

- `promo_code_sheet_opened`: Settings redeem button tapped (`language`, `subscribed`).
- `promo_code_redeemed`: Pro became active while a sheet opened from Settings
  was pending (`language`).

Redemptions from the paywall button or a link show up in RevenueCat
(transactions with an offer code) rather than as these events.
