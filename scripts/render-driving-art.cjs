/** Bake unchanged vector gardens into reusable textures: PLAYWRIGHT_MODULE=... node scripts/render-driving-art.cjs */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const babel = require('@babel/core');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const filename = path.resolve(__dirname, '../components/game/StreetArtwork.tsx');
const source = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
  filename, configFile: false, babelrc: false,
  plugins: [['@babel/plugin-transform-typescript', { isTSX: true }], ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'],
}).code;
const artwork = new Module(filename, module);
artwork.filename = filename;
artwork.paths = module.paths;
artwork.require = name => name === 'react-native-svg' ? { Circle: 'circle', G: 'g', Line: 'line', Path: 'path', Rect: 'rect' } : require(name);
artwork._compile(source, filename);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 310, height: 330 }, deviceScaleFactor: 1 });
    for (let variant = 0; variant < 12; variant++) {
      const body = renderToStaticMarkup(React.createElement(artwork.exports.Garden, { variant }));
      await page.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="310" height="330" viewBox="-1 -1 31 33">${body}</svg></body></html>`);
      await page.screenshot({ path: path.resolve(__dirname, `../assets/images/driving/lot-${variant}.png`), omitBackground: true });
    }
    await page.setViewportSize({ width: 1000, height: 1000 });
    for (const dark of [false, true]) {
      const body = renderToStaticMarkup(React.createElement(artwork.exports.JunctionLandscape, { dark }));
      await page.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 100 100">${body}</svg></body></html>`);
      await page.screenshot({ path: path.resolve(__dirname, `../assets/images/driving/junction-${dark ? 'dark' : 'light'}.png`) });
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
