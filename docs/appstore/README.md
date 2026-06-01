# App Store screenshots

6.9" iPhone marketing screenshots (1320 × 2868) in English, Slovak, and Hungarian.

```
raw/<lang>/<screen>.png         clean simulator captures (hero + feature slots only)
framed/<lang>/NN-<screen>.png   marketing renders: SVG iPhone 17 Pro frame + caption + gradient
captions.json                   per-slot caption/sub/template/accent + per-badge free/pro tags
_tools/template-<variant>.html  hero / feature / trust / cta (trust + cta are pure compositions)
_tools/render.js                composes raws + templates into framed PNGs
```

7 slots per language: home (hero) → mock → study → mistakes → stats → trust (composition) → cta (composition).
Trust and CTA are pure HTML compositions and need no raw capture — they render from data in `captions.json`.

Upload the **framed** PNGs to App Store Connect (6.9" iPhone slot), in numeric order.

## Regenerate

Requires: the app installed on an iPhone 17 Pro Max simulator (6.9"), Java 17
(`/opt/homebrew/opt/openjdk@17`), and Google Chrome (for headless rendering).

```bash
SIM=BEDA91C2-1D31-42D4-B337-B90EC456FFC6   # iPhone 17 Pro Max
DB="$(xcrun simctl get_app_container $SIM com.smartie.driver data)/Documents/SQLite/driver.db"

# 1. Build + install (Release, for clean chrome)
npx expo run:ios --configuration Release --device "iPhone 17 Pro Max"
xcrun simctl launch $SIM com.smartie.driver && sleep 9   # let migrations create driver.db

# 2. Seed a good-looking demo state (81% "Ready", 14-day streak, 7 mistakes, 5 mocks)
xcrun simctl terminate $SIM com.smartie.driver
node docs/appstore/_tools/seed.js | sqlite3 "$DB"

export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"

# 3. Capture EN (settings seeded to lang=2), then SK, then HU
maestro --device $SIM test -e LANG_DIR=en docs/appstore/_tools/capture.yaml
sqlite3 "$DB" "UPDATE settings SET lang=1;"
maestro --device $SIM test -e LANG_DIR=sk docs/appstore/_tools/capture.yaml
sqlite3 "$DB" "UPDATE settings SET lang=3;"
maestro --device $SIM test -e LANG_DIR=hu docs/appstore/_tools/capture.yaml

# 4. Frame them
node docs/appstore/_tools/render.js
```

## Notes / gotchas

- The app keys settings on `id=1`; `seed.js` updates that row (a second row is
  ignored). If the app shows onboarding, the seed's settings row didn't take.
- Capture uses `driver://<route>` deep links to bypass the Home Pro-gate. Run on
  a freshly-booted sim — stray `simctl openurl` dialogs from prior runs stack up
  and hide the screen from Maestro. A `simctl shutdown/boot` flushes them.
- Edit copy in `captions.json` and re-run only step 4 to re-frame without recapturing.
- Trust slot badges live in `captions.json` per-language; `tag: "free"` or `tag: "pro"`
  picks the corner badge (green or amber). Keep counts symmetric across languages or
  the grid breaks.
- The SVG iPhone frame is inlined in `template-hero.html` and `template-feature.html`
  (titanium gradient bezel, real Dynamic Island, side buttons, home indicator). The
  captured screenshot is referenced as `<image href>` inside the SVG and clipped to
  the inner rounded-rect screen area.
