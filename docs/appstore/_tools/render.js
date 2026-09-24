#!/usr/bin/env node
/**
 * Compose marketing screenshots from raw simulator captures.
 *
 *   node render.js            # all languages
 *   node render.js en         # one language
 *
 * Inputs:
 *   docs/appstore/captions.json        slots, copy, accent, callout rects
 *   docs/appstore/raw/<lang>/<id>.png  1320x2868 captures (hero + feature slots)
 *   _tools/design.js                   the stylesheet and page layouts
 *   _tools/compose.py                  pastes a capture into frame.png
 *   assets/images/icon.png             app icon for the closing slide
 *
 * Output:
 *   docs/appstore/framed/<lang>/<order>-<id>.png      1320x2868 (6.9")
 *   docs/appstore/framed-6.5/<lang>/<order>-<id>.png  1242x2688 (6.5")
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const design = require('./design');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '../..');
const CAPTIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'captions.json'), 'utf8'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP = path.join(__dirname, '.tmp');
const LANGS = process.argv[2] ? [process.argv[2]] : ['en', 'sk', 'hu'];
const ICON = 'file://' + path.join(REPO, 'assets/images/icon.png');

const crop = (src, rect, out) => execFileSync('python3', ['-c',
  'import sys; from PIL import Image; x,y,w,h=map(int,sys.argv[3:7]); Image.open(sys.argv[1]).convert("RGB").crop((x,y,x+w,y+h)).save(sys.argv[2])',
  src, out, rect.x, rect.y, rect.w, rect.h].map(String));

fs.mkdirSync(TMP, { recursive: true });
let rendered = 0, skipped = 0;
for (const lang of LANGS) {
  const outDir = path.join(ROOT, 'framed', lang);
  const outDir65 = path.join(ROOT, 'framed-6.5', lang);
  for (const dir of [outDir, outDir65]) {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.png')) fs.unlinkSync(path.join(dir, f));
  }

  CAPTIONS.screens.forEach((screen, i) => {
    const order = String(i + 1).padStart(2, '0');
    const variant = screen.template || 'feature';
    const copy = screen[lang] || {};
    // A language can override the callout rect when its layout differs.
    const callout = screen.callout && { ...screen.callout, ...(copy.callout || {}) };
    let html;
    if (variant === 'hero' || variant === 'feature') {
      const raw = path.join(ROOT, 'raw', lang, `${screen.id}.png`);
      if (!fs.existsSync(raw)) { console.log(`skip  ${lang}/${screen.id} (no raw capture)`); skipped++; return; }
      const deviceImg = path.join(TMP, `device-${lang}-${screen.id}.png`);
      execFileSync('python3', [path.join(__dirname, 'compose.py'), path.join(__dirname, 'frame.png'), raw, deviceImg]);
      let calloutUrl = null;
      if (callout) {
        const calloutImg = path.join(TMP, `callout-${lang}-${screen.id}.png`);
        crop(raw, callout, calloutImg);
        calloutUrl = 'file://' + calloutImg;
      }
      html = design.device(variant, {
        theme: screen.accent, copy, deviceUrl: 'file://' + deviceImg, calloutUrl, callout,
        hero: variant === 'hero', pill: CAPTIONS.trialPill?.[lang],
      });
    } else if (variant === 'trust') {
      html = design.trust({ theme: screen.accent, copy, tags: CAPTIONS.tags?.[lang] || {} });
    } else if (variant === 'cta') {
      html = design.cta({ theme: screen.accent, copy, iconUrl: ICON });
    } else {
      console.log(`skip  ${lang}/${screen.id} (unknown template ${variant})`); skipped++; return;
    }

    const htmlPath = path.join(TMP, `${lang}-${screen.id}.html`);
    fs.writeFileSync(htmlPath, html);
    const out = path.join(outDir, `${order}-${screen.id}.png`);
    execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${design.W},${design.H}`, `--screenshot=${out}`, 'file://' + htmlPath], { stdio: 'ignore' });
    execFileSync('sips', ['-z', '2688', '1242', out, '--out', path.join(outDir65, `${order}-${screen.id}.png`)], { stdio: 'ignore' });
    console.log(`ok    ${lang}/${order}-${screen.id}.png`);
    rendered++;
  });
}
console.log(`\n${rendered} rendered, ${skipped} skipped.`);
