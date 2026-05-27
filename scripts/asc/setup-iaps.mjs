#!/usr/bin/env node
/**
 * One-shot setup script for App Store Connect In-App Purchases.
 *
 * Creates a subscription group + the two Driver SK Pro subscriptions
 * (yearly and weekly) tied to bundle id com.smartie.driver. Idempotent:
 * skips anything that already exists by productId / referenceName.
 *
 * IAPs are left in "Missing Metadata" / draft state — this script does
 * NOT submit anything for App Review. You can finish prices, review
 * screenshots, and submission inside App Store Connect later.
 *
 * Usage:
 *   node scripts/asc/setup-iaps.mjs
 *
 * Requires:
 *   - Node 18+ (uses built-in fetch + crypto)
 *   - ~/Downloads/AuthKey_ACR8UFQS22.p8  (App Store Connect API key, App Manager role)
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createPrivateKey, createSign } from 'node:crypto';

const KEY_ID = 'ACR8UFQS22';
const ISSUER_ID = '3b63e4b9-df0c-4819-a711-108a347b896a';
const P8_PATH = `${homedir()}/Downloads/AuthKey_${KEY_ID}.p8`;
const BUNDLE_ID = 'com.smartie.driver';

const GROUP_REFERENCE_NAME = 'Driver Pro';
const PRODUCTS = [
  {
    productId: 'com.smartie.driver.pro.yearly',
    name: 'Driver SK Pro — Yearly',
    period: 'ONE_YEAR',
    locales: [
      { locale: 'en-US', name: 'Driver SK Pro', description: 'Unlimited Driver SK access — yearly subscription.' },
      { locale: 'sk', name: 'Driver SK Pro', description: 'Neobmedzený prístup k Driver SK — ročne.' },
    ],
  },
  {
    productId: 'com.smartie.driver.pro.weekly',
    name: 'Driver SK Pro — Weekly',
    period: 'ONE_WEEK',
    locales: [
      { locale: 'en-US', name: 'Driver SK Pro', description: 'Unlimited Driver SK access — weekly subscription.' },
      { locale: 'sk', name: 'Driver SK Pro', description: 'Neobmedzený prístup k Driver SK — týždenne.' },
    ],
  },
];

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
  // Convert DER ECDSA signature to JOSE (r||s, 32 bytes each)
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
  const jose = Buffer.concat([pad(r), pad(s)]);
  return `${signingInput}.${b64url(jose)}`;
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

  // Required: at least one group localization. Use en-US.
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

  // Ensure localizations
  const locs = await ascFetch(`/v1/subscriptions/${subId}/subscriptionLocalizations?limit=200`);
  const haveLocales = new Set(locs.data.map((l) => l.attributes.locale));
  for (const loc of product.locales) {
    if (haveLocales.has(loc.locale)) {
      continue;
    }
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

async function main() {
  console.log(`→ App Store Connect IAP setup for ${BUNDLE_ID}`);
  console.log(`  Using key ${KEY_ID} from ${P8_PATH}`);

  const app = await findApp();
  console.log(`✓ Found app "${app.attributes.name}" (id ${app.id})`);

  const groupId = await ensureSubscriptionGroup(app.id);

  for (const product of PRODUCTS) {
    await ensureSubscription(groupId, product);
  }

  console.log(`\nDone. Subscriptions are in dev/draft state — not submitted for review.`);
  console.log(`Open https://appstoreconnect.apple.com → Driver SK → In-App Purchases to add prices`);
  console.log(`(Apple's price chart UI is much easier than the API for this).`);
}

main().catch((err) => {
  console.error('\n✗ Failed:', err.message);
  process.exit(1);
});
