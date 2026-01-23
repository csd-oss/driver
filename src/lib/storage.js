import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'DRIVING_MVP_SETTINGS';
const PROGRESS_KEY = 'DRIVING_MVP_PROGRESS';

// Settings storage
export const loadSettings = async () => {
  try {
    const json = await AsyncStorage.getItem(SETTINGS_KEY);
    if (json) {
      return JSON.parse(json);
    }
    return null;
  } catch (error) {
    console.error('Error loading settings:', error);
    return null;
  }
};

export const saveSettings = async (settings) => {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
};

// Progress storage
export const loadProgress = async () => {
  try {
    const json = await AsyncStorage.getItem(PROGRESS_KEY);
    if (json) {
      return JSON.parse(json);
    }
    return null;
  } catch (error) {
    console.error('Error loading progress:', error);
    return null;
  }
};

export const saveProgress = async (progress) => {
  try {
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    return true;
  } catch (error) {
    console.error('Error saving progress:', error);
    return false;
  }
};

export const resetProgress = async () => {
  try {
    await AsyncStorage.removeItem(PROGRESS_KEY);
    return true;
  } catch (error) {
    console.error('Error resetting progress:', error);
    return false;
  }
};
