const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web build loads wa-sqlite as a .wasm asset from a Worker.
// Without this the web export fails to resolve the module.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// expo-sqlite on web needs a cross-origin isolated page (SharedArrayBuffer).
// Production gets these headers from vercel.json; this covers `expo start --web`.
const previousEnhance = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const wrapped = previousEnhance ? previousEnhance(middleware, server) : middleware;
    return (req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      return wrapped(req, res, next);
    };
  },
};

module.exports = withNativeWind(config, { input: './global.css' });
