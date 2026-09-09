#!/usr/bin/env node
/**
 * Serve dist/ locally the way Vercel will: cross-origin isolation headers
 * (required by expo-sqlite's SharedArrayBuffer worker) and SPA fallback.
 *
 *   npm run serve:web            # http://localhost:8788
 *   PORT=3000 npm run serve:web
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const port = Number(process.env.PORT || 8788);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

if (!existsSync(dist)) {
  console.error('dist/ not found. Run `npm run build:web` first.');
  process.exit(1);
}

createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  let file = normalize(join(dist, pathname));
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    // SPA fallback: any non-file path renders the shell.
    file = join(dist, 'index.html');
    pathname = '/index.html';
  }
  const ext = extname(file).toLowerCase();
  const noCache = pathname === '/index.html' || pathname === '/sw.js';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': noCache ? 'no-cache' : 'public, max-age=31536000, immutable',
    ...isolationHeaders,
  });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`Driver SK PWA on http://localhost:${port} (COOP/COEP on, SPA fallback on)`);
});
