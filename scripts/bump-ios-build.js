#!/usr/bin/env node
/**
 * Bumps the iOS build number for the next TestFlight upload.
 *
 * Updates BOTH:
 *   - app.json `expo.ios.buildNumber` (source of truth used by `expo prebuild`)
 *   - ios/DriverSK.xcodeproj/project.pbxproj `CURRENT_PROJECT_VERSION` (used by
 *     `xcodebuild archive` directly, since /ios is gitignored and built locally)
 *
 * App Store Connect rejects uploads whose build number isn't strictly higher than
 * the previous one for the same `CFBundleShortVersionString`.
 *
 * Usage: npm run bump:ios
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const APP_JSON = path.join(REPO, 'app.json');
const PBX = path.join(REPO, 'ios', 'DriverSK.xcodeproj', 'project.pbxproj');

const appJson = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
appJson.expo = appJson.expo || {};
appJson.expo.ios = appJson.expo.ios || {};
const fromApp = parseInt(appJson.expo.ios.buildNumber || '0', 10);

let fromPbx = 0;
if (fs.existsSync(PBX)) {
  const m = fs.readFileSync(PBX, 'utf8').match(/CURRENT_PROJECT_VERSION = (\d+);/);
  if (m) fromPbx = parseInt(m[1], 10);
}

const next = Math.max(fromApp, fromPbx) + 1;

appJson.expo.ios.buildNumber = String(next);
fs.writeFileSync(APP_JSON, JSON.stringify(appJson, null, 2) + '\n');
console.log(`✓ app.json: ios.buildNumber → ${next}`);

if (fs.existsSync(PBX)) {
  const updated = fs
    .readFileSync(PBX, 'utf8')
    .replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${next};`);
  fs.writeFileSync(PBX, updated);
  console.log(`✓ pbxproj: CURRENT_PROJECT_VERSION → ${next}`);
} else {
  console.log('• pbxproj not found (run `expo prebuild -p ios` first); app.json only.');
}
