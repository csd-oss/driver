import { loadSettings, saveSettings } from './storage.js';
import * as Localization from 'expo-localization';

const DEFAULT_SETTINGS = {
  lang: 2,
  hasOnboarded: false,
  hasChosenLanguage: false,
  selectedCategoryByLang: {
    "1": "all",
    "2": "all",
    "3": "all",
  },
  useConservativeReadiness: false, // If true, uses conservative partial scores for insufficient data; if false, uses 0%
};

let cachedSettings = null;

export const getSettings = async () => {
  if (cachedSettings) {
    return cachedSettings;
  }
  
  const stored = await loadSettings();
  const resolveLanguage = (langValue) => {
    if (langValue === 1 || langValue === 2 || langValue === 3) {
      return langValue;
    }
    const locales =
      typeof Localization.getLocales === 'function'
        ? Localization.getLocales()
        : [];
    const primaryLocale = locales[0]?.languageCode || Localization.locale || '';
    const normalized = String(primaryLocale).toLowerCase().split('-')[0];
    if (normalized === 'sk') return 1;
    if (normalized === 'hu') return 3;
    return 2;
  };

  if (stored) {
    const resolvedLang = resolveLanguage(stored.lang);
    cachedSettings = { ...DEFAULT_SETTINGS, ...stored, lang: resolvedLang };
    if (stored.lang !== resolvedLang) {
      await saveSettings(cachedSettings);
    }
  } else {
    const resolvedLang = resolveLanguage(undefined);
    cachedSettings = { ...DEFAULT_SETTINGS, lang: resolvedLang };
    await saveSettings(cachedSettings);
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

/**
 * Get selected category for a language
 * @param {number} lang - Language index (1, 2, or 3)
 * @returns {Promise<string>} Selected category ("all" or category text)
 */
export const getSelectedCategory = async (lang) => {
  const settings = await getSettings();
  const langStr = String(lang);
  
  // Ensure selectedCategoryByLang exists
  if (!settings.selectedCategoryByLang) {
    settings.selectedCategoryByLang = {
      "1": "all",
      "2": "all",
      "3": "all",
    };
  }
  
  return settings.selectedCategoryByLang[langStr] || "all";
};

/**
 * Set selected category for a language
 * @param {number} lang - Language index (1, 2, or 3)
 * @param {string} categoryTxt - Category text or "all"
 * @returns {Promise<Object>} Updated settings
 */
export const setSelectedCategory = async (lang, categoryTxt) => {
  const current = await getSettings();
  const langStr = String(lang);
  
  // Ensure selectedCategoryByLang exists
  if (!current.selectedCategoryByLang) {
    current.selectedCategoryByLang = {
      "1": "all",
      "2": "all",
      "3": "all",
    };
  }
  
  const updated = {
    ...current,
    selectedCategoryByLang: {
      ...current.selectedCategoryByLang,
      [langStr]: categoryTxt || "all",
    },
  };
  
  cachedSettings = updated;
  await saveSettings(updated);
  return updated;
};

/**
 * Get readiness calculation mode
 * @returns {Promise<boolean>} true if using conservative mode, false if using strict (0%) mode
 */
export const getReadinessMode = async () => {
  const settings = await getSettings();
  return settings.useConservativeReadiness || false;
};
