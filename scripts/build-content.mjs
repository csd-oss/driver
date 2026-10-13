#!/usr/bin/env node
/**
 * Build the question-bank content pack the native app downloads on first
 * launch (src/lib/contentPack.ts). The iOS/Android binaries do not bundle
 * the official question bank or its images: App Review's automated checks
 * flag the identical official content that many apps ship.
 *
 *   node scripts/build-content.mjs [outDir]     # default dist/content/v1
 *
 * Writes:
 *   questions.json   data/data5.js `data`, i.e. [slovak[], english[], hungarian[]]
 *   images/<path>    every image of data/imageManifest.js, as stored in data/minv_images
 *   manifest.json    { version, questions: {path, bytes, sha256},
 *                      images: { <manifest key>: {path, bytes, width, height} } }
 *
 * `version` is a hash of everything in the pack, so the app re-downloads
 * only when the content actually changed. build-web.mjs runs this into the
 * PWA's dist/, and Vercel serves it at https://driver.smartie.team/content/v1/.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(REPO, process.argv[2] || 'dist/content/v1');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// data5.js is `export const data = [...]`; evaluate just the array.
const loadQuestions = () => {
  const src = fs.readFileSync(path.join(REPO, 'data/data5.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', src.replace(/^\s*export\s+const\s+data\s*=/m, 'module.exports.data ='))(m);
  return m.exports.data;
};

// "key": require("./minv_images/…") lines of data/imageManifest.js.
const loadImageList = () => {
  const src = fs.readFileSync(path.join(REPO, 'data/imageManifest.js'), 'utf8');
  return [...src.matchAll(/"([^"]+)":\s*require\("\.\/(minv_images\/[^"]+)"\)/g)].map(([, key, file]) => ({ key, file }));
};

// Pixel size of a PNG or JPEG, from its header (no image library needed).
const imageSize = (buf) => {
  if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const length = buf.readUInt16BE(i + 2);
      // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + length;
    }
  }
  throw new Error('Unknown image format');
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'images'), { recursive: true });

const questions = Buffer.from(JSON.stringify(loadQuestions()));
fs.writeFileSync(path.join(OUT, 'questions.json'), questions);

const images = {};
const hash = crypto.createHash('sha256').update(questions);
for (const { key, file } of loadImageList()) {
  const buf = fs.readFileSync(path.join(REPO, 'data', file));
  const rel = file.replace(/^minv_images\//, 'images/');
  fs.mkdirSync(path.join(OUT, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), buf);
  images[key] = { path: rel, bytes: buf.length, ...imageSize(buf) };
  hash.update(key).update(buf);
}

const manifest = {
  version: hash.digest('hex').slice(0, 16),
  questions: { path: 'questions.json', bytes: questions.length, sha256: sha256(questions) },
  images,
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));

const total = questions.length + Object.values(images).reduce((n, i) => n + i.bytes, 0);
console.log(`content ${manifest.version}: ${Object.keys(images).length} images, ${(total / 1e6).toFixed(1)} MB → ${path.relative(REPO, OUT)}`);
