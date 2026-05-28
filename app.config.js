export default ({ config }) => {
  return {
    ...config,
    extra: {
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
      // RevenueCat iOS public SDK key.
      // - Debug builds default to the Test Store key — works in iOS simulator
      //   without sandbox accounts or StoreKit configuration files.
      // - Release builds default to the App Store SDK key — required for real
      //   sandbox/production purchases.
      // Override either via EXPO_PUBLIC_REVENUECAT_IOS_KEY in .env.
      revenueCatIosKey:
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ||
        (process.env.NODE_ENV === 'production'
          ? 'appl_svNneUZQGGxDtuPbXLcOAriHqEh'
          : 'test_sTWtiZkHRlSHrBAZEPpqgnuufJh'),
      // E2E test mode — when EXPO_PUBLIC_BYPASS_PAYWALL=true at build time
      // the paywall wrapper treats every check as if the user holds the
      // Pro entitlement. Used by the Maestro suite so it can navigate
      // through Smart Study / Mistakes without a sandbox purchase.
      bypassPaywall: process.env.EXPO_PUBLIC_BYPASS_PAYWALL === 'true',
    },
  };
};
