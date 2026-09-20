/** Bake the installed iOS system font once; requires Xcode and a booted simulator. */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'driver-stop-labels-'));
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr);
  return result.stdout;
}
try {
  const sdk = run('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path']).trim();
  const binary = path.join(temp, 'outline');
  run('swiftc', ['-sdk', sdk, '-target', `${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}-apple-ios18.0-simulator`, path.join(__dirname, 'generate-stop-labels.swift'), '-o', binary]);
  const output = run('xcrun', ['simctl', 'spawn', process.env.SIMULATOR_UDID || 'booted', binary]);
  fs.writeFileSync(path.join(root, 'components/game/stopLabelPaths.ts'), output);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
