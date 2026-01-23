import { loadSettings, saveSettings } from './storage.js';

const DEFAULT_SETTINGS = {
  lang: 1,
  hasOnboarded: false,
};

let cachedSettings = null;

export const getSettings = async () => {
  if (cachedSettings) {
    return cachedSettings;
  }
  
  const stored = await loadSettings();
  if (stored) {
    cachedSettings = { ...DEFAULT_SETTINGS, ...stored };
  } else {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  
  return cachedSettings;
};

export const updateSettings = async (updates) => {
  const current = await getSettings();
  const updated = { ...current, ...updates };
  cachedSettings = updated;
  await saveSettings(updated);
  return updated;
};

export const getLanguage = async () => {
  const settings = await getSettings();
  return settings.lang;
};

export const clearCache = () => {
  cachedSettings = null;
};
