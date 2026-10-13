const fs = require('fs');
const path = require('path');

/**
 * The iOS/Android binaries must not contain the official question bank or its
 * images: App Review's automated checks flag that identical content (4.3(a)).
 * The apps download it instead (src/lib/contentPack.ts). Only web-only files
 * (*.web.*) may import data/data5.js or data/imageManifest.js.
 */
const ROOT = path.resolve(__dirname, '..');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
  return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [full] : [];
});

test('no native code imports the bundled question bank or official images', () => {
  const offenders = ['app', 'components', 'src', 'contexts', 'hooks']
    .filter((dir) => fs.existsSync(path.join(ROOT, dir)))
    .flatMap((dir) => walk(path.join(ROOT, dir)))
    .filter((file) => !/\.web\.(js|ts|tsx)$/.test(file))
    .filter((file) => /(import|require)[^;\n]*data\/(data5|imageManifest)/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(ROOT, file));
  expect(offenders).toEqual([]);
});

test('the app entry does not import them either', () => {
  expect(fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8')).not.toMatch(/data5|imageManifest/);
});
