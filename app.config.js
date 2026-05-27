export default ({ config }) => {
  return {
    ...config,
    extra: {
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
      // RevenueCat iOS public SDK key. Default = the App Store SDK key for
      // production / real-device sandbox testing. Override with the test_
      // key from .env to drive RevenueCat's synthetic Test Store (useful for
      // simulator / quick iteration without Apple sandbox accounts).
      revenueCatIosKey:
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || 'appl_svNneUZQGGxDtuPbXLcOAriHqEh',
    },
  };
};
