export default ({ config }) => {
  return {
    ...config,
    extra: {
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
      superwallIosKey:
        process.env.EXPO_PUBLIC_SUPERWALL_IOS_KEY || 'pk_m0UT47lVI0Yc4cPby_ZXi',
    },
  };
};
