#!/usr/bin/env node
/**
 * Build the PWA.
 *
 *   npm run build:web
 *
 * 1. `expo export -p web` into dist/ (SPA output, uses public/index.html as
 *    the HTML template and copies public/ into dist/).
 * 2. Generate dist/sw.js from scripts/sw.template.js with a precache list of
 *    every exported file and a version derived from their content.
 * 3. Sanity-check that index.html still carries the PWA head tags.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const templatePath = join(root, 'scripts', 'sw.template.js');

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
};

const toUrl = (file) => '/' + relative(dist, file).split('\\').join('/');

// 1. Export
if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
execSync('npx expo export -p web --output-dir dist', { cwd: root, stdio: 'inherit' });

// 2. Service worker
const files = walk(dist).filter((file) => {
  const url = toUrl(file);
  if (url === '/sw.js') return false;
  if (url.endsWith('.map')) return false;
  if (url.endsWith('.DS_Store')) return false;
  return true;
});

const precache = files.map(toUrl).sort();
// Precache index.html under its canonical path only; navigations resolve to it.
if (!precache.includes('/index.html')) {
  throw new Error('dist/index.html not found; export did not produce an SPA shell');
}

const hash = createHash('sha256');
for (const file of files) hash.update(readFileSync(file));
const version = hash.digest('hex').slice(0, 12);

const template = readFileSync(templatePath, 'utf8');
const sw = template
  .replace('__VERSION__', version)
  .replace('__PRECACHE__', JSON.stringify(precache, null, 2));
writeFileSync(join(dist, 'sw.js'), sw);

// 3. Sanity checks
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const required = ['rel="manifest"', 'apple-mobile-web-app-capable', 'viewport-fit=cover', "register('/sw.js')"];
const missing = required.filter((needle) => !html.includes(needle));
if (missing.length) {
  throw new Error(`dist/index.html is missing PWA tags: ${missing.join(', ')}. Is public/index.html in place?`);
}

const totalBytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
console.log(`\nPWA ready: dist/ (${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB precached, sw version ${version})`);
