import { getDeviceId } from '@/src/db/device';
import { usePostHog } from 'posthog-react-native';
import * as Device from 'expo-device';

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
    
    // Register properties attached to ALL future events
    // Note: PostHog already captures $app_version, $app_build, $os_name, $os_version, $device_type automatically
    posthog.register({
      device_brand: Device.brand,
      device_model: Device.modelName,
    });
  } catch (error) {
    // Can't use trackError here since identifyUser is called during initialization
    console.error('Failed to identify user with PostHog:', error);
  }
}

/**
 * Track a screen view event.
 * Call this when a screen is focused/displayed.
 * 
 * @param posthog - PostHog client instance
 * @param screenName - Name of the screen being viewed
 * @param properties - Additional properties to include
 */
export function trackScreenView(
  posthog: ReturnType<typeof usePostHog> | null,
  screenName: string,
  properties?: Record<string, any>
) {
  if (!posthog) return;
  
  try {
    posthog.screen(screenName, properties);
  } catch (error) {
    console.error('Failed to track screen view:', error);
  }
}

/**
 * Track a custom event.
 * 
 * @param posthog - PostHog client instance
 * @param eventName - Name of the event
 * @param properties - Event properties
 */
export function trackEvent(
  posthog: ReturnType<typeof usePostHog> | null,
  eventName: string,
  properties?: Record<string, any>
) {
  if (!posthog) return;
  
  try {
    posthog.capture(eventName, properties);
  } catch (error) {
    console.error('Failed to track event:', error);
  }
}

/**
 * Track an error event to PostHog.
 * 
 * @param posthog - PostHog client instance
 * @param errorType - Type/category of the error
 * @param error - The error object or value
 * @param context - Additional context properties
 */
export function trackError(
  posthog: ReturnType<typeof usePostHog> | null,
  errorType: string,
  error: Error | unknown,
  context?: Record<string, any>
) {
  if (!posthog) return;
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  try {
    posthog.capture('app_error', {
      error_type: errorType,
      error_message: errorMessage,
      ...context,
    });
  } catch (err) {
    // Fallback to console if PostHog tracking fails
    console.error('Failed to track error to PostHog:', err);
  }
}
