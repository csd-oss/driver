#!/usr/bin/env node
/**
 * App Store Connect IAP setup for Driver SK — sandbox-ready.
 *
 * Idempotent. Creates / brings up to spec everything needed for the
 * RevenueCat sandbox flow to actually return product info from StoreKit:
 *
 *   - Subscription group "Driver Pro"
 *   - com.smartie.driver.pro.yearly   ONE_YEAR  €29.99 (SVK base) + 3-day free trial
 *   - com.smartie.driver.pro.weekly   ONE_WEEK  €2.99  (SVK base)
 *   - com.smartie.driver.pro.lifetime NON_CONSUMABLE  €49.99 (SVK base)
 *   - en-US + sk localizations on everything
 *
 * Apple auto-converts the SVK base prices to every other territory's
 * App Store tier. No App Review submission — products land in
 * READY_TO_SUBMIT (or "Missing Metadata" if a screenshot is still
 * required by Apple for that product type — set manually in ASC if so).
 *
 * Run:   node scripts/asc/setup-iaps.mjs
 * Needs: ~/Downloads/AuthKey_ACR8UFQS22.p8 (App Manager role)
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createPrivateKey, createSign } from 'node:crypto';

const KEY_ID = 'ACR8UFQS22';
const ISSUER_ID = '3b63e4b9-df0c-4819-a711-108a347b896a';
const P8_PATH = `${homedir()}/Downloads/AuthKey_${KEY_ID}.p8`;
const BUNDLE_ID = 'com.smartie.driver';

const GROUP_REFERENCE_NAME = 'Driver Pro';
const BASE_TERRITORY = 'SVK'; // Slovakia (EUR). Apple converts to other territories.

const SUBSCRIPTIONS = [
  {
    productId: 'com.smartie.driver.pro.yearly',
    name: 'Driver SK Pro — Yearly',
    period: 'ONE_YEAR',
    basePrice: '29.99',
    trial: { duration: 'THREE_DAYS' },
    locales: [
      { locale: 'en-US', name: 'Driver SK Pro', description: 'Unlimited Driver SK access — yearly subscription.' },
      { locale: 'sk', name: 'Driver SK Pro', description: 'Neobmedzený prístup k Driver SK — ročne.' },
    ],
  },
  {
    productId: 'com.smartie.driver.pro.weekly',
    name: 'Driver SK Pro — Weekly',
    period: 'ONE_WEEK',
    basePrice: '2.99',
    trial: { duration: 'THREE_DAYS' },
    locales: [
      { locale: 'en-US', name: 'Driver SK Pro', description: 'Unlimited Driver SK access — weekly subscription.' },
      { locale: 'sk', name: 'Driver SK Pro', description: 'Neobmedzený prístup k Driver SK — týždenne.' },
    ],
  },
];

const LIFETIME = {
  productId: 'com.smartie.driver.pro.lifetime',
  name: 'Driver SK Pro — Lifetime',
  basePrice: '49.99',
  locales: [
    { locale: 'en-US', name: 'Driver SK Pro', description: 'Lifetime access to Driver SK.' },
    { locale: 'sk', name: 'Driver SK Pro', description: 'Doživotný prístup k Driver SK.' },
  ],
};

const API_BASE = 'https://api.appstoreconnect.apple.com';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function makeJwt() {
  const pem = await readFile(P8_PATH, 'utf8');
  const key = createPrivateKey({ key: pem, format: 'pem' });
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const payload = { iss: ISSUER_ID, iat: now, exp: now + 60 * 15, aud: 'appstoreconnect-v1' };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const derSig = signer.sign(key);
  let offset = 2;
  if (derSig[offset] !== 0x02) throw new Error('Bad DER signature');
  const rLen = derSig[offset + 1];
  let r = derSig.slice(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  if (derSig[offset] !== 0x02) throw new Error('Bad DER signature (s)');
  const sLen = derSig[offset + 1];
  let s = derSig.slice(offset + 2, offset + 2 + sLen);
  const pad = (buf) => {
    if (buf.length > 32) return buf.slice(buf.length - 32);
    if (buf.length < 32) return Buffer.concat([Buffer.alloc(32 - buf.length), buf]);
    return buf;
  };
  return `${signingInput}.${b64url(Buffer.concat([pad(r), pad(s)]))}`;
}

let token;
async function ascFetch(path, opts = {}) {
  if (!token) token = await makeJwt();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const errMsg = body?.errors ? JSON.stringify(body.errors, null, 2) : text;
    throw new Error(`ASC ${opts.method || 'GET'} ${path} → ${res.status}\n${errMsg}`);
  }
  return body;
}

async function findApp() {
  const res = await ascFetch(`/v1/apps?filter[bundleId]=${BUNDLE_ID}&limit=1`);
  if (!res.data?.length) throw new Error(`No app with bundleId ${BUNDLE_ID}`);
  return res.data[0];
}

async function ensureSubscriptionGroup(appId) {
  const list = await ascFetch(`/v1/apps/${appId}/subscriptionGroups?limit=200`);
  const existing = list.data.find((g) => g.attributes.referenceName === GROUP_REFERENCE_NAME);
  if (existing) {
    console.log(`✓ Subscription group "${GROUP_REFERENCE_NAME}" already exists (id ${existing.id})`);
    return existing.id;
  }
  const created = await ascFetch('/v1/subscriptionGroups', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'subscriptionGroups',
        attributes: { referenceName: GROUP_REFERENCE_NAME },
        relationships: { app: { data: { type: 'apps', id: appId } } },
      },
    }),
  });
  console.log(`+ Created subscription group "${GROUP_REFERENCE_NAME}" (id ${created.data.id})`);
  await ascFetch('/v1/subscriptionGroupLocalizations', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'subscriptionGroupLocalizations',
        attributes: { name: 'Driver SK Pro', locale: 'en-US' },
        relationships: { subscriptionGroup: { data: { type: 'subscriptionGroups', id: created.data.id } } },
      },
    }),
  });
  console.log(`  + en-US group localization`);
  return created.data.id;
}

async function ensureSubscription(groupId, product) {
  const list = await ascFetch(`/v1/subscriptionGroups/${groupId}/subscriptions?limit=200`);
  const existing = list.data.find((s) => s.attributes.productId === product.productId);
  let subId;
  if (existing) {
    console.log(`✓ Subscription ${product.productId} already exists (id ${existing.id}, state ${existing.attributes.state})`);
    subId = existing.id;
  } else {
    const created = await ascFetch('/v1/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'subscriptions',
          attributes: {
            name: product.name,
            productId: product.productId,
            familySharable: false,
            subscriptionPeriod: product.period,
          },
          relationships: { group: { data: { type: 'subscriptionGroups', id: groupId } } },
        },
      }),
    });
    subId = created.data.id;
    console.log(`+ Created subscription ${product.productId} (id ${subId})`);
  }
  const locs = await ascFetch(`/v1/subscriptions/${subId}/subscriptionLocalizations?limit=200`);
  const haveLocales = new Set(locs.data.map((l) => l.attributes.locale));
  for (const loc of product.locales) {
    if (haveLocales.has(loc.locale)) continue;
    await ascFetch('/v1/subscriptionLocalizations', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'subscriptionLocalizations',
          attributes: { name: loc.name, description: loc.description, locale: loc.locale },
          relationships: { subscription: { data: { type: 'subscriptions', id: subId } } },
        },
      }),
    });
    console.log(`  + ${loc.locale} localization`);
  }
  return subId;
}

/**
 * Page through a subscription's price points filtered by territory, return the
 * one whose customerPrice matches `targetPrice` (string, e.g. "29.99").
 */
async function findSubscriptionPricePoint(subId, territory, targetPrice) {
  let cursor = '';
  for (let i = 0; i < 20; i++) {
    const path =
      `/v1/subscriptions/${subId}/pricePoints?filter[territory]=${territory}&limit=200` +
      (cursor ? `&cursor=${cursor}` : '');
    const res = await ascFetch(path);
    for (const p of res.data || []) {
      if (p.attributes.customerPrice === targetPrice) return p;
    }
    const next = res.links?.next;
    if (!next) break;
    cursor = new URL(next).searchParams.get('cursor');
  }
  return null;
}

async function ensureSubscriptionPrice(subId, productId) {
  const product = SUBSCRIPTIONS.find((s) => s.productId === productId);
  if (!product) return;

  // Apple auto-populates default prices across all 175 territories when a
  // subscription is created. We only override if the BASE_TERRITORY price
  // doesn't match our target. Other territories Apple keeps in sync.
  const existing = await ascFetch(
    `/v1/subscriptions/${subId}/prices?filter[territory]=${BASE_TERRITORY}&include=subscriptionPricePoint&limit=10`
  );
  const currentPP = existing.included?.find((i) => i.type === 'subscriptionPricePoints');
  if (currentPP?.attributes?.customerPrice === product.basePrice) {
    console.log(`✓ ${productId} already at €${product.basePrice} in ${BASE_TERRITORY}`);
    return;
  }
  if (currentPP) {
    console.log(`  ${productId} currently €${currentPP.attributes.customerPrice} in ${BASE_TERRITORY} (Apple default); target €${product.basePrice}`);
  }

  const pricePoint = await findSubscriptionPricePoint(subId, BASE_TERRITORY, product.basePrice);
  if (!pricePoint) {
    console.warn(`! No ${BASE_TERRITORY} price point matching €${product.basePrice} for ${productId} — skipping`);
    return;
  }

  // POSTing a new price for a territory replaces (rather than appends to)
  // the current price when startDate is null. Apple rejects DELETE for the
  // current/live price — only future scheduled prices can be deleted.
  await ascFetch('/v1/subscriptionPrices', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'subscriptionPrices',
        attributes: { startDate: null, preserveCurrentPrice: false },
        relationships: {
          subscription: { data: { type: 'subscriptions', id: subId } },
          territory: { data: { type: 'territories', id: BASE_TERRITORY } },
          subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: pricePoint.id } },
        },
      },
    }),
  });
  console.log(`+ ${productId} priced at €${product.basePrice} (${BASE_TERRITORY} base — Apple auto-syncs other territories)`);
}

async function ensureIntroOffer(subId, productId) {
  const product = SUBSCRIPTIONS.find((s) => s.productId === productId && s.trial);
  if (!product) return;

  // Free-trial offers are per-territory. Apply to the sandbox-relevant
  // ones (USA, SVK, the base) — that's enough for the test flow. For
  // production, repeat across all desired territories or do it in ASC UI.
  const territories = ['USA', BASE_TERRITORY];
  const existing = await ascFetch(`/v1/subscriptions/${subId}/introductoryOffers?include=territory&limit=200`);
  const existingTerritories = new Set(
    (existing.included || [])
      .filter((i) => i.type === 'territories')
      .map((t) => t.id)
  );

  for (const territory of territories) {
    if (existingTerritories.has(territory)) {
      console.log(`✓ ${productId} ${territory} free trial already set`);
      continue;
    }
    try {
      await ascFetch('/v1/subscriptionIntroductoryOffers', {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'subscriptionIntroductoryOffers',
            attributes: {
              duration: product.trial.duration,
              offerMode: 'FREE_TRIAL',
              numberOfPeriods: 1,
              startDate: null,
              endDate: null,
            },
            relationships: {
              subscription: { data: { type: 'subscriptions', id: subId } },
              territory: { data: { type: 'territories', id: territory } },
            },
          },
        }),
      });
      console.log(`+ ${productId} ${product.trial.duration} free trial added for ${territory}`);
    } catch (err) {
      console.warn(`! Trial for ${productId} / ${territory} failed: ${err.message.slice(0, 200)}`);
    }
  }
}

async function ensureLifetimeIAP(appId) {
  const list = await ascFetch(`/v1/apps/${appId}/inAppPurchasesV2?limit=200`);
  let iap = list.data?.find((i) => i.attributes.productId === LIFETIME.productId);
  if (iap) {
    console.log(`✓ Lifetime IAP ${LIFETIME.productId} already exists (id ${iap.id}, state ${iap.attributes.state})`);
  } else {
    const created = await ascFetch('/v2/inAppPurchases', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'inAppPurchases',
          attributes: {
            name: LIFETIME.name,
            productId: LIFETIME.productId,
            inAppPurchaseType: 'NON_CONSUMABLE',
            familySharable: false,
          },
          relationships: { app: { data: { type: 'apps', id: appId } } },
        },
      }),
    });
    iap = created.data;
    console.log(`+ Created Lifetime IAP ${LIFETIME.productId} (id ${iap.id})`);
  }

  const locs = await ascFetch(`/v2/inAppPurchases/${iap.id}/inAppPurchaseLocalizations?limit=200`);
  const haveLocales = new Set(locs.data.map((l) => l.attributes.locale));
  for (const loc of LIFETIME.locales) {
    if (haveLocales.has(loc.locale)) continue;
    await ascFetch('/v1/inAppPurchaseLocalizations', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'inAppPurchaseLocalizations',
          attributes: { name: loc.name, description: loc.description, locale: loc.locale },
          relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: iap.id } } },
        },
      }),
    });
    console.log(`  + ${loc.locale} localization`);
  }

  // Price the IAP. Non-consumable IAPs use a different price-point shape:
  // POST /v1/inAppPurchasePriceSchedules with manualPrices.
  const sched = await ascFetch(`/v2/inAppPurchases/${iap.id}/iapPriceSchedule`).catch(() => null);
  if (sched?.data) {
    console.log(`✓ Lifetime price schedule already set`);
    return iap.id;
  }

  // Find IAP price point matching €49.99 in SVK
  let cursor = '';
  let pricePoint = null;
  for (let i = 0; i < 20; i++) {
    const path =
      `/v2/inAppPurchases/${iap.id}/pricePoints?filter[territory]=${BASE_TERRITORY}&limit=200` +
      (cursor ? `&cursor=${cursor}` : '');
    const res = await ascFetch(path);
    for (const p of res.data || []) {
      if (p.attributes.customerPrice === LIFETIME.basePrice) { pricePoint = p; break; }
    }
    if (pricePoint) break;
    const next = res.links?.next;
    if (!next) break;
    cursor = new URL(next).searchParams.get('cursor');
  }
  if (!pricePoint) {
    console.warn(`! No ${BASE_TERRITORY} price point matching €${LIFETIME.basePrice} for Lifetime`);
    return iap.id;
  }

  await ascFetch('/v1/inAppPurchasePriceSchedules', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'inAppPurchasePriceSchedules',
        relationships: {
          inAppPurchase: { data: { type: 'inAppPurchases', id: iap.id } },
          baseTerritory: { data: { type: 'territories', id: BASE_TERRITORY } },
          manualPrices: {
            data: [
              {
                type: 'inAppPurchasePrices',
                id: '${new-price-1}',
              },
            ],
          },
        },
      },
      included: [
        {
          type: 'inAppPurchasePrices',
          id: '${new-price-1}',
          attributes: { startDate: null },
          relationships: {
            inAppPurchaseV2: { data: { type: 'inAppPurchases', id: iap.id } },
            inAppPurchasePricePoint: {
              data: { type: 'inAppPurchasePricePoints', id: pricePoint.id },
            },
          },
        },
      ],
    }),
  });
  console.log(`+ Lifetime priced at €${LIFETIME.basePrice} (${BASE_TERRITORY} base)`);
  return iap.id;
}

async function main() {
  console.log(`→ ASC IAP setup for ${BUNDLE_ID} — sandbox-ready`);
  console.log(`  Key ${KEY_ID} · base territory ${BASE_TERRITORY}`);

  const app = await findApp();
  console.log(`✓ App "${app.attributes.name}" (id ${app.id})`);

  const groupId = await ensureSubscriptionGroup(app.id);

  for (const product of SUBSCRIPTIONS) {
    const subId = await ensureSubscription(groupId, product);
    try { await ensureSubscriptionPrice(subId, product.productId); }
    catch (err) { console.warn(`! price step failed for ${product.productId}: ${err.message.slice(0, 200)}`); }
    try { await ensureIntroOffer(subId, product.productId); }
    catch (err) { console.warn(`! trial step failed for ${product.productId}: ${err.message.slice(0, 200)}`); }
  }

  try { await ensureLifetimeIAP(app.id); }
  catch (err) { console.warn(`! Lifetime step failed: ${err.message.slice(0, 200)}`); }

  console.log(`\nDone. Sandbox flow next steps:`);
  console.log(`  1. ASC → Users and Access → Sandbox → Testers → add a sandbox tester`);
  console.log(`  2. Sign into that sandbox tester on a real iPhone (Settings → App Store → Sandbox Account)`);
  console.log(`  3. Install Release build of Driver SK on that device`);
  console.log(`  4. RC's paywall presents real prices; complete a test purchase`);
  console.log(``);
  console.log(`If any IAP still shows "Missing Metadata" in ASC, it likely needs a`);
  console.log(`review screenshot (the one thing this API can't easily upload).`);
}

main().catch((err) => {
  console.error('\n✗ Failed:', err.message);
  process.exit(1);
});
