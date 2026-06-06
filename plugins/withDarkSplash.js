/**
 * expo-splash-screen generates the iOS SplashScreen.storyboard with the root
 * view's backgroundColor hardcoded to `systemBackgroundColor` (white) when no
 * splash image is configured — even though `backgroundColor` is set in app.json.
 * That produces a white flash on cold launch before the dark JS intro.
 *
 * This config plugin patches the generated storyboard during prebuild so the
 * splash background is the app's dark slate (#0f172a), matching the intro and
 * the rest of the app. Keeps the fix reproducible (the /ios dir is gitignored).
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const WHITE = '<color key="backgroundColor" systemColor="systemBackgroundColor"/>';
const DARK =
  '<color key="backgroundColor" red="0.05882353" green="0.09019608" blue="0.16470588" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>';

module.exports = function withDarkSplash(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const storyboard = path.join(
        cfg.modRequest.platformProjectRoot,
        cfg.modRequest.projectName,
        'SplashScreen.storyboard'
      );
      if (fs.existsSync(storyboard)) {
        const contents = fs.readFileSync(storyboard, 'utf8');
        if (contents.includes(WHITE)) {
          fs.writeFileSync(storyboard, contents.replace(WHITE, DARK));
        }
      }
      return cfg;
    },
  ]);
};
