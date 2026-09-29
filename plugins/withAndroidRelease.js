/**
 * Android release setup that must survive `expo prebuild` (the /android dir
 * is gitignored and regenerated from app.json):
 *
 * 1. Upload-key signing for Play Store bundles. The release build signs with
 *    the upload key named in ~/.gradle/gradle.properties:
 *      DRIVER_UPLOAD_STORE_FILE=/absolute/path/driver-upload.jks
 *      DRIVER_UPLOAD_STORE_PASSWORD=…
 *      DRIVER_UPLOAD_KEY_ALIAS=driver-upload
 *      DRIVER_UPLOAD_KEY_PASSWORD=…
 *    Without those properties it falls back to the debug key, so local
 *    release builds for the emulator keep working. Google re-signs the app
 *    for the Store (Play App Signing); the upload key only proves uploads.
 *
 * 2. The splash drawable. The splash plugin has no `image`, but styles.xml
 *    still references @drawable/splashscreen_logo, which is never generated;
 *    the build then fails. Copy the app icon in, as the README used to ask.
 *
 * See docs/android.md.
 */
const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RELEASE_SIGNING = `
        release {
            if (project.hasProperty('DRIVER_UPLOAD_STORE_FILE')) {
                storeFile file(DRIVER_UPLOAD_STORE_FILE)
                storePassword DRIVER_UPLOAD_STORE_PASSWORD
                keyAlias DRIVER_UPLOAD_KEY_ALIAS
                keyPassword DRIVER_UPLOAD_KEY_PASSWORD
            }
        }`;

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes('DRIVER_UPLOAD_STORE_FILE')) {
      // Add a release signing config next to the debug one…
      gradle = gradle.replace(
        /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/,
        `$1${RELEASE_SIGNING}`
      );
      // …and use it for release builds when the upload key is configured.
      gradle = gradle.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        `$1signingConfig project.hasProperty('DRIVER_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`
      );
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });

const withSplashDrawable = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const drawable = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/drawable');
      fs.mkdirSync(drawable, { recursive: true });
      fs.copyFileSync(
        path.join(cfg.modRequest.projectRoot, 'assets/images/icon.png'),
        path.join(drawable, 'splashscreen_logo.png')
      );
      return cfg;
    },
  ]);

module.exports = function withAndroidRelease(config) {
  return withSplashDrawable(withReleaseSigning(config));
};
