import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = 'DEVICE_ID';

export async function getDeviceId(): Promise<string> {
  // Try to get existing device ID
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  
  if (!deviceId) {
    // Generate new device ID (installation-specific)
    try {
      deviceId = await Application.getInstallationIdAsync();
    } catch {
      // Fallback to UUID if getInstallationIdAsync fails
      deviceId = Crypto.randomUUID();
    }
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  
  return deviceId;
}
