#!/usr/bin/env node
/**
 * Compose marketing screenshots from raw simulator captures + per-slot templates.
 *
 *   node render.js
 *
 * Inputs:
 *   docs/appstore/captions.json                 7 slots; per-slot template + accent
 *   docs/appstore/raw/<lang>/<id>.png           1320x2868 simulator captures
 *                                               (only needed for hero + feature)
 *   docs/appstore/_tools/template-<type>.html   one per template variant
 *
 * Output: docs/appstore/framed/<lang>/<order>-<id>.png  (1320x2868 framed)
 *
 * Templates:
 *   feature  caption above phone (slots 2-5)
 *   hero     bigger caption + trial pill + phone (slot 1)
 *   trust    caption + 2x3 grid of feature badges, no phone
 *   cta      giant headline + ribbon, no phone
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CAPTIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'captions.json'), 'utf8'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP = path.join(__dirname, '.tmp');
const LANGS = ['en', 'sk', 'hu'];

const TEMPLATES = {
  feature: fs.readFileSync(path.join(__dirname, 'template-feature.html'), 'utf8'),
  hero:    fs.readFileSync(path.join(__dirname, 'template-hero.html'),    'utf8'),
  trust:   fs.readFileSync(path.join(__dirname, 'template-trust.html'),   'utf8'),
  cta:     fs.readFileSync(path.join(__dirname, 'template-cta.html'),     'utf8'),
};

// Deep base -> vibrant accent gradients, matching the app's color system.
const THEMES = {
  indigo:  { BG_A: '#1e1b4b', BG_B: '#312e81', BG_C: '#4338ca', GLOW: 'rgba(99,102,241,0.40)' },
  sky:     { BG_A: '#082f49', BG_B: '#0c4a6e', BG_C: '#0369a1', GLOW: 'rgba(56,189,248,0.38)' },
  rose:    { BG_A: '#4c0519', BG_B: '#881337', BG_C: '#be123c', GLOW: 'rgba(251,113,133,0.38)' },
  amber:   { BG_A: '#451a03', BG_B: '#78350f', BG_C: '#b45309', GLOW: 'rgba(251,191,36,0.36)' },
  emerald: { BG_A: '#022c22', BG_B: '#064e3b', BG_C: '#047857', GLOW: 'rgba(52,211,153,0.38)' },
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TAG_LABELS = {
  en: { free: 'Free', pro: '3-day trial' },
  sk: { free: 'Zadarmo', pro: 'Skúška 3 dni' },
  hu: { free: 'Ingyenes', pro: '3 napos próba' },
};

const renderBadges = (badges, lang) =>
  badges.map(b => {
    const tag = b.tag ? `<div class="tag ${esc(b.tag)}">${esc(TAG_LABELS[lang]?.[b.tag] || b.tag)}</div>` : '';
    return `<div class="badge">${tag}<div class="icon">${esc(b.icon)}</div>` +
      `<div class="title">${esc(b.title)}</div>` +
      `<div class="sub">${esc(b.sub)}</div></div>`;
  }).join('\n      ');

fs.mkdirSync(TMP, { recursive: true });

let rendered = 0, skipped = 0;
for (const lang of LANGS) {
  const outDir = path.join(ROOT, 'framed', lang);
  fs.mkdirSync(outDir, { recursive: true });

  CAPTIONS.screens.forEach((screen, i) => {
    const order = String(i + 1).padStart(2, '0');
    const variant = screen.template || 'feature';
    const tpl = TEMPLATES[variant];
    if (!tpl) {
      console.log(`skip  ${lang}/${screen.id} (unknown template ${variant})`);
      skipped++;
      return;
    }

    // Hero + feature need a raw capture; trust + cta are pure compositions.
    const needsImage = variant === 'feature' || variant === 'hero';
    const raw = path.join(ROOT, 'raw', lang, `${screen.id}.png`);
    if (needsImage && !fs.existsSync(raw)) {
      console.log(`skip  ${lang}/${screen.id} (no raw at ${path.relative(ROOT, raw)})`);
      skipped++;
      return;
    }

    const theme = THEMES[screen.accent] || THEMES.indigo;
    const copy = screen[lang] || {};
    const trialPill = (CAPTIONS.trialPill && CAPTIONS.trialPill[lang]) || '';

    let html = tpl
      .replace(/{{BG_A}}/g, theme.BG_A)
      .replace(/{{BG_B}}/g, theme.BG_B)
      .replace(/{{BG_C}}/g, theme.BG_C)
      .replace(/{{GLOW}}/g, theme.GLOW)
      .replace(/{{CAPTION}}/g, esc(copy.caption))
      .replace(/{{SUB}}/g, esc(copy.sub))
      .replace(/{{TRIAL_PILL}}/g, esc(trialPill));

    if (needsImage) html = html.replace(/{{IMG}}/g, 'file://' + raw);
    if (variant === 'trust') html = html.replace(/{{BADGES}}/g, renderBadges(copy.badges || [], lang));

    const htmlPath = path.join(TMP, `${lang}-${screen.id}.html`);
    fs.writeFileSync(htmlPath, html);

    const out = path.join(outDir, `${order}-${screen.id}.png`);
    execFileSync(CHROME, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1320,2868',
      `--screenshot=${out}`,
      'file://' + htmlPath,
    ], { stdio: 'ignore' });

    console.log(`ok    ${lang}/${order}-${screen.id}.png`);
    rendered++;
  });
}

console.log(`\n${rendered} rendered, ${skipped} skipped.`);
