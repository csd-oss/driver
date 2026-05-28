export default ({ config }) => {
  return {
    ...config,
    extra: {
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
      // RevenueCat iOS public SDK key — only injected if EXPO_PUBLIC_REVENUECAT_IOS_KEY
      // is explicitly set. Default selection happens at *runtime* in
      // src/lib/purchases.ts via the __DEV__ flag, which is reliable across
      // xcodebuild archive + expo run:ios. Previously checked process.env.NODE_ENV
      // here, but that's not exported by Xcode's react-native-xcode.sh bundle phase,
      // so Release archives accidentally baked in the Test Store key and RevenueCat
      // crashed at launch via checkForSimulatedStoreAPIKeyInRelease.
      revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || undefined,
      // E2E test mode — when EXPO_PUBLIC_BYPASS_PAYWALL=true at build time
      // the paywall wrapper treats every check as if the user holds the
      // Pro entitlement. Used by the Maestro suite so it can navigate
      // through Smart Study / Mistakes without a sandbox purchase.
      bypassPaywall: process.env.EXPO_PUBLIC_BYPASS_PAYWALL === 'true',
    },
  };
};
