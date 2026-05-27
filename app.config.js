export default ({ config }) => {
  return {
    ...config,
    extra: {
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
      revenueCatIosKey:
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || 'test_sTWtiZkHRlSHrBAZEPpqgnuufJh',
    },
  };
};
