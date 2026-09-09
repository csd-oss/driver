# Driver SK as a PWA

The same Expo codebase ships as an installable, offline web app at
`https://driver.smartie.team`. This page covers how it is built, why the
hosting needs two specific response headers, and how to test and deploy it.

## Build

```bash
npm run build:web        # expo export -p web, then generate dist/sw.js
npm run serve:web        # serve dist/ on http://localhost:8788 with the right headers
```

`scripts/build-web.mjs` does three things:

1. Runs `expo export -p web --output-dir dist`. `app.json` sets `web.output`
   to `single`, so Expo produces a client-rendered SPA with one `index.html`.
   Expo uses `public/index.html` as the HTML template and copies the rest of
   `public/` (manifest, icons) into `dist/`.
2. Generates `dist/sw.js` from `scripts/sw.template.js` with a precache list of
   every exported file and a version hash of their contents. A new deploy
   therefore always produces a new worker version, and the old cache is dropped
   on activation.
3. Checks that `dist/index.html` still carries the manifest link, the Apple
   meta tags, `viewport-fit=cover`, and the service-worker registration.

`dist/` is gitignored. Vercel builds it on every push.

### Why single, not static

`app/_layout.tsx` renders nothing until SQLite migrations finish, so static
rendering would emit an empty document for every route. With `single` the
router runs entirely in the browser, and `vercel.json` rewrites every
non-file path to `/index.html`.

### Why the app is not code-split

The question bank (`data/data5.js`, about 4.8 MB) is imported statically and
lands in the main JS bundle, and the 250 question images are exported as
hashed assets. The product decision was full offline on first visit, so the
service worker precaches everything. Expect a first load in the tens of MB
uncompressed; Vercel serves Brotli, so the wire size is much smaller.

## The header requirement

expo-sqlite on web runs wa-sqlite inside a Worker and implements the
synchronous API (`openDatabaseSync`, `execSync`) with `SharedArrayBuffer` and
`Atomics.wait`. Browsers only expose `SharedArrayBuffer` on cross-origin
isolated pages, which means every HTML response must carry:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without them `window.crossOriginIsolated` is `false`, the database never
opens, and the app stays on a blank screen. `vercel.json` sets both on every
path (plus `Cross-Origin-Resource-Policy: same-origin` for the assets), and
`scripts/serve-web.mjs` mirrors that locally.

COEP `require-corp` blocks cross-origin subresources (images, scripts,
iframes) that do not opt in with CORP or CORS. It does not block `fetch()`
with CORS, so PostHog keeps working. Do not add third-party `<script>` or
`<img>` tags that lack CORS headers.

## Service worker behaviour

- Install: precache the whole manifest in chunks, then `skipWaiting`.
- Activate: delete caches from earlier versions, then `clients.claim`.
- Navigations: network first, cached `index.html` when offline.
- Everything else on the same origin: cache first, then network, and store
  what was fetched.

`/sw.js` and `/index.html` are served with `no-cache`; the hashed
`/_expo/static/*` and `/assets/*` files are immutable for a year.

## Install prompt

`src/lib/platform.ts` exposes `isStandalonePWA()`, `isIosSafari()`,
`canPromptInstall()`, and `promptInstall()`. `public/index.html` captures the
`beforeinstallprompt` event before React mounts. `components/InstallHint.tsx`
uses these to show a dismissible card: a real install button on Chrome, Edge,
and Android, and the "Share, then Add to Home Screen" steps on iOS Safari,
which never fires the event. The dismissal is stored in `localStorage`.

## Local testing

```bash
npm run build:web
npm run serve:web
```

Open `http://localhost:8788`. In DevTools:

- `crossOriginIsolated` must be `true`.
- Application, Service Workers: `sw.js` activated and running.
- Application, Manifest: no errors, install button available on Chrome.
- Toggle "Offline" in the Network tab and reload: the app must still open.

Service workers require HTTPS or `localhost`, so test on `localhost`, not a
LAN IP.

## Deploy on Vercel

1. Import the GitHub repo in Vercel. Framework preset: Other. The build
   command and output directory come from `vercel.json`.
2. Environment variables: `EXPO_PUBLIC_POSTHOG_KEY` and
   `EXPO_PUBLIC_POSTHOG_HOST` if analytics should run on web.
3. Domains: add `driver.smartie.team`. In the DNS zone for `smartie.team`,
   add a `CNAME` record `driver` pointing at `cname.vercel-dns.com`. Vercel
   provisions the certificate.
4. Push to `main`; Vercel builds and deploys. Because the worker version is a
   content hash, users pick up a new build on their next online visit.

Any other host works if it can set the two headers and rewrite unknown paths
to `/index.html`. nginx equivalent:

```nginx
add_header Cross-Origin-Opener-Policy same-origin always;
add_header Cross-Origin-Embedder-Policy require-corp always;
location / { try_files $uri /index.html; }
location = /sw.js { add_header Cache-Control "no-cache"; }
```

## Web-only behaviour in the app

- Purchases: `isPurchasesSupported()` is iOS-only, so every gated feature is
  free on web and `app/paywall.tsx` redirects to home.
- Notifications: `src/lib/notifications.ts` early-returns on web; the
  notification settings rows are hidden on web.
- Haptics: expo-haptics ships a web no-op.
- Layout: `components/ui/screen.tsx` centres the app at 480 px on wide
  viewports.

## Current deployment (2026-09-09)

- Vercel project `driver` in the `csd-oss-projects` team, linked from this repo (`.vercel/` is gitignored). `vercel --prod` from the repo root builds on Vercel with `npm run build:web` and deploys `dist/`.
- Domain `driver.smartie.team` is attached to the project. DNS for `smartie.team` lives on Cloudflare with a proxied wildcard pointing at Vercel, so no DNS record was needed. Cloudflare passes the COOP/COEP headers through and caches the hashed assets (`cf-cache-status: HIT`).
- `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` are set on the project for production and preview. RevenueCat is not configured on web; everything is free there.
- `.vercelignore` keeps native projects, archives, screenshots, keys, and docs out of the upload. Keep it in sync with `.gitignore` when adding local-only artifacts.

## Known limitations

- **One tab per origin.** A second tab shows "already open in another tab" until the first closes. A full-page navigation in the same tab (typing a URL, reload) can show the same overlay for a few seconds while the old document releases its OPFS handles; the page reloads itself once it gets the lock.
- **Cold start.** The SQLite worker needs about a second to fetch and compile the 600 KB wasm. `index.js` retries the warm-up up to four times; the static "Driver SK" wordmark in `public/index.html` covers the wait.
- **Background tabs.** A tab opened in the background gets no animation frames, so the intro skips its animation there (`app/index.tsx`).
- **Desktop layout.** `Screen` centres content at 480 px, but onboarding uses the full window width for its slides. Fine on phones, wide on desktop.
- **First visit downloads about 16 MB** (Brotli brings the bundle to 1.5 MB; the 250 question images dominate). The service worker precaches all of it so later visits and offline use are instant.
- **Private browsing.** Safari private tabs and other storage-restricted contexts cannot open the SQLite database. `index.js` gives up after three warm-up attempts and `public/index.html` shows a "cannot start here" message with a retry button (also after 45 s with nothing mounted). Private tabs have their own storage anyway, so nothing recorded there would survive.
- **Standalone viewport.** WebKit computes `100dvh` in a home-screen app as if Safari's toolbar were present. `public/index.html` overrides `#root` to `height: 100%` under `@media (display-mode: standalone)`.
