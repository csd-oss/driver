#!/usr/bin/env node
/**
 * Bumps the Android versionCode for the next Play Store upload.
 *
 * Updates BOTH app.json `expo.android.versionCode` (source of truth for
 * `expo prebuild`) and android/app/build.gradle (built locally; /android is
 * gitignored). Play rejects a bundle whose versionCode is not higher than
 * every one uploaded before, on any track.
 *
 * Usage: npm run bump:android
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const APP_JSON = path.join(REPO, 'app.json');
const GRADLE = path.join(REPO, 'android', 'app', 'build.gradle');

const appJson = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
const fromApp = Number(appJson.expo.android?.versionCode || 0);
let fromGradle = 0;
if (fs.existsSync(GRADLE)) {
  const m = fs.readFileSync(GRADLE, 'utf8').match(/versionCode (\d+)/);
  if (m) fromGradle = Number(m[1]);
}
const next = Math.max(fromApp, fromGradle) + 1;

appJson.expo.android = { ...appJson.expo.android, versionCode: next };
fs.writeFileSync(APP_JSON, JSON.stringify(appJson, null, 2) + '\n');
console.log(`✓ app.json: android.versionCode → ${next}`);
if (fs.existsSync(GRADLE)) {
  fs.writeFileSync(GRADLE, fs.readFileSync(GRADLE, 'utf8').replace(/versionCode \d+/, `versionCode ${next}`));
  console.log(`✓ build.gradle: versionCode → ${next}`);
}
