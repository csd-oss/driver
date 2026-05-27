#!/usr/bin/env node
/**
 * RevenueCat dashboard automation for Driver SK.
 *
 * Talks to the RevenueCat v2 Developer API to:
 *   - Discover / create the iOS App Store app (bundle id com.smartie.driver)
 *   - Mirror the existing Test Store products as iOS App Store products
 *     using the real App Store Connect IAP identifiers
 *   - Attach those iOS products to the "Driver SK Pro" entitlement
 *   - Attach them to the existing offering packages
 *     ($rc_annual / $rc_weekly / $rc_lifetime)
 *
 * Idempotent — re-running is safe; anything already present is left alone.
 *
 * The paywall *visual design* still has to be done in the RC dashboard
 * (no API for the paywall editor). One-time, ~5 min.
 *
 * Usage:
 *   RC_SECRET_KEY=sk_... node scripts/rc/setup-rc.mjs
 *
 * Or with the inline default below (rotate the key after running).
 */

const API_BASE = 'https://api.revenuecat.com/v2';
const SECRET_KEY = process.env.RC_SECRET_KEY || 'sk_kxvIBSuVqyMdoIFfuSJfhVYyTJYxK';

const BUNDLE_ID = 'com.smartie.driver';
const IOS_APP_NAME = 'Driver SK iOS';
const ENTITLEMENT_LOOKUP = 'Driver SK Pro';

// iOS App Store products to mirror onto the iOS app.
// store_identifier = the App Store Connect IAP product id.
const IOS_PRODUCTS = [
  {
    display_name: 'Yearly',
    store_identifier: 'com.smartie.driver.pro.yearly',
    type: 'subscription',
    subscription: { duration: 'P1Y', trial_duration: 'P3D' },
    package_lookup: '$rc_annual',
  },
  {
    display_name: 'Weekly',
    store_identifier: 'com.smartie.driver.pro.weekly',
    type: 'subscription',
    subscription: { duration: 'P1W' },
    package_lookup: '$rc_weekly',
  },
  {
    display_name: 'Lifetime',
    store_identifier: 'com.smartie.driver.pro.lifetime',
    type: 'one_time',
    one_time: { is_consumable: false },
    package_lookup: '$rc_lifetime',
  },
];

async function rc(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    throw new Error(`RC ${opts.method || 'GET'} ${path} → ${res.status}\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`);
  }
  return body;
}

async function listAll(path) {
  const out = [];
  let next = path;
  while (next) {
    const page = await rc(next);
    out.push(...(page.items || []));
    next = page.next_page ? page.next_page.replace(API_BASE, '') : null;
  }
  return out;
}

async function main() {
  console.log('→ Driver SK RevenueCat setup');

  const projects = await listAll('/projects');
  const project = projects.find((p) => p.name === 'Driver SK') ?? projects[0];
  if (!project) throw new Error('No projects on this RC account.');
  console.log(`✓ Project ${project.id} "${project.name}"`);

  const apps = await listAll(`/projects/${project.id}/apps`);
  let iosApp = apps.find(
    (a) => a.type === 'app_store' && a.app_store?.bundle_id === BUNDLE_ID
  );
  if (!iosApp) {
    iosApp = await rc(`/projects/${project.id}/apps`, {
      method: 'POST',
      body: JSON.stringify({
        name: IOS_APP_NAME,
        type: 'app_store',
        app_store: { bundle_id: BUNDLE_ID },
      }),
    });
    console.log(`+ Created iOS App Store app ${iosApp.id}`);
  } else {
    console.log(`✓ iOS App Store app exists (${iosApp.id})`);
  }

  const keys = await listAll(`/projects/${project.id}/apps/${iosApp.id}/public_api_keys`);
  const productionKey = keys.find((k) => k.environment === 'production') ?? keys[0];
  if (productionKey) {
    console.log(`✓ iOS public SDK key: ${productionKey.key}`);
  }

  const entitlements = await listAll(`/projects/${project.id}/entitlements`);
  const entitlement = entitlements.find((e) => e.lookup_key === ENTITLEMENT_LOOKUP);
  if (!entitlement) {
    throw new Error(`Entitlement "${ENTITLEMENT_LOOKUP}" not found. Create it in the RC dashboard first.`);
  }
  console.log(`✓ Entitlement "${entitlement.lookup_key}" (${entitlement.id})`);

  const offerings = await listAll(`/projects/${project.id}/offerings`);
  const offering = offerings.find((o) => o.is_current) ?? offerings[0];
  if (!offering) throw new Error('No offering found.');
  console.log(`✓ Offering "${offering.lookup_key}" (${offering.id})`);

  const packages = await listAll(`/projects/${project.id}/offerings/${offering.id}/packages`);

  const allProducts = await listAll(`/projects/${project.id}/products`);

  const attachedProductIds = new Set(
    (await listAll(`/projects/${project.id}/entitlements/${entitlement.id}/products`))
      .map((p) => p.id)
  );

  for (const spec of IOS_PRODUCTS) {
    let product = allProducts.find(
      (p) => p.app_id === iosApp.id && p.store_identifier === spec.store_identifier
    );
    if (!product) {
      const body = {
        store_identifier: spec.store_identifier,
        app_id: iosApp.id,
        display_name: spec.display_name,
        type: spec.type,
      };
      if (spec.type === 'subscription') {
        body.subscription = {
          duration: spec.subscription.duration,
          ...(spec.subscription.trial_duration && { trial_duration: spec.subscription.trial_duration }),
        };
      } else {
        body.one_time = spec.one_time;
      }
      product = await rc(`/projects/${project.id}/products`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      console.log(`+ Created iOS product ${spec.store_identifier} (${product.id})`);
    } else {
      console.log(`✓ iOS product ${spec.store_identifier} exists (${product.id})`);
    }

    if (!attachedProductIds.has(product.id)) {
      await rc(
        `/projects/${project.id}/entitlements/${entitlement.id}/actions/attach_products`,
        {
          method: 'POST',
          body: JSON.stringify({ product_ids: [product.id] }),
        }
      );
      console.log(`  + attached to entitlement`);
    }

    const pkg = packages.find((p) => p.lookup_key === spec.package_lookup);
    if (!pkg) {
      console.warn(`  ! no package with lookup_key ${spec.package_lookup} — skipping package attach`);
      continue;
    }
    const pkgProducts = await listAll(
      `/projects/${project.id}/packages/${pkg.id}/products`
    );
    const alreadyOnPkg = pkgProducts.some((pp) => pp.product?.id === product.id);
    if (!alreadyOnPkg) {
      await rc(`/projects/${project.id}/packages/${pkg.id}/actions/attach_products`, {
        method: 'POST',
        body: JSON.stringify({
          products: [{ product_id: product.id, eligibility_criteria: 'all' }],
        }),
      });
      console.log(`  + attached to package ${spec.package_lookup}`);
    }
  }

  console.log('\nDone.');
  if (productionKey) {
    console.log(`\niOS SDK key for app.config.js: ${productionKey.key}`);
  }
  console.log(`\nRemaining manual step (RC dashboard, ~5 min):`);
  console.log(`  - Paywalls → New Paywall → pick template`);
  console.log(`  - Attach to offering "${offering.lookup_key}"`);
  console.log(`  - Disable the close button → Save → Publish`);
}

main().catch((err) => {
  console.error('\n✗ Failed:', err.message);
  process.exit(1);
});
