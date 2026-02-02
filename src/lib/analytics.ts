import { usePostHog } from 'posthog-react-native';
import { getDeviceId } from '@/src/db/device';

/**
 * Identify the current user with their device ID.
 * This should be called once at app startup after PostHog is initialized.
 * 
 * @param posthog - PostHog client instance from usePostHog() hook
 */
export async function identifyUser(posthog: ReturnType<typeof usePostHog>) {
  try {
    const deviceId = await getDeviceId();
    posthog.identify(deviceId, {
      anonymous: true,
      source: 'device',
    });
  } catch (error) {
    console.error('Failed to identify user with PostHog:', error);
  }
}
