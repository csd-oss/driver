import * as Localization from 'expo-localization';
import * as CategoryDB from '../db/queries/categorySelections';
import * as SettingsDB from '../db/queries/settings';

// Cache for settings (maintains backward compatibility)
let cachedSettings = null;

/**
 * Detect language from device locale
 * Returns: 1 (Slovak), 2 (English), or 3 (Hungarian)
 */
const detectLanguageFromDevice = () => {
  const locales =
    typeof Localization.getLocales === 'function'
      ? Localization.getLocales()
      : [];
  const primaryLocale = locales[0]?.languageCode || Localization.locale || '';
  const normalized = String(primaryLocale).toLowerCase().split('-')[0];
  if (normalized === 'sk') return 1; // Slovak
  if (normalized === 'hu') return 3; // Hungarian
  return 2; // English (default for any other language)
};

/**
 * Get settings (with caching for backward compatibility)
 */
export const getSettings = async () => {
  if (cachedSettings) {
    return cachedSettings;
  }
  
  const dbSettings = await SettingsDB.getSettings();
  
  // If user hasn't chosen a language, detect from device
  // Otherwise, use the stored language
  let resolvedLang;
  if (!dbSettings.hasChosenLanguage) {
    resolvedLang = detectLanguageFromDevice();
    // Update DB with detected language
    if (dbSettings.lang !== resolvedLang) {
      await SettingsDB.setLanguage(resolvedLang);
    }
  } else {
    // User has chosen language, use stored value
    resolvedLang = dbSettings.lang;
  }
  
  // Build settings object matching old format
  const settings = {
    lang: resolvedLang,
    hasOnboarded: dbSettings.hasOnboarded,
    hasChosenLanguage: dbSettings.hasChosenLanguage,
    selectedCategoryByLang: {
      "1": await CategoryDB.getCategorySelection(1),
      "2": await CategoryDB.getCategorySelection(2),
      "3": await CategoryDB.getCategorySelection(3),
    },
    useConservativeReadiness: dbSettings.useConservativeReadiness,
    analyticsOptOut: dbSettings.analyticsOptOut ?? false,
    notificationMorningEnabled: dbSettings.notificationMorningEnabled ?? true,
    notificationLunchEnabled: dbSettings.notificationLunchEnabled ?? true,
    notificationEveningEnabled: dbSettings.notificationEveningEnabled ?? true,
  };
  
  cachedSettings = settings;
  return settings;
};

/**
 * Update settings
 */
export const updateSettings = async (updates) => {
  const current = await getSettings();
  const updated = { ...current, ...updates };
  
  // Update database
  if (updates.lang !== undefined) {
    await SettingsDB.setLanguage(updates.lang);
  }
  if (updates.hasOnboarded !== undefined) {
    await SettingsDB.updateSettings({ hasOnboarded: updates.hasOnboarded });
  }
  if (updates.hasChosenLanguage !== undefined) {
    await SettingsDB.updateSettings({ hasChosenLanguage: updates.hasChosenLanguage });
  }
  if (updates.useConservativeReadiness !== undefined) {
    await SettingsDB.setReadinessMode(updates.useConservativeReadiness);
  }
  if (updates.analyticsOptOut !== undefined) {
    await SettingsDB.setAnalyticsOptOut(updates.analyticsOptOut);
  }
  if (updates.notificationMorningEnabled !== undefined) {
    await SettingsDB.setNotificationSlot('morning', updates.notificationMorningEnabled);
  }
  if (updates.notificationLunchEnabled !== undefined) {
    await SettingsDB.setNotificationSlot('lunch', updates.notificationLunchEnabled);
  }
  if (updates.notificationEveningEnabled !== undefined) {
    await SettingsDB.setNotificationSlot('evening', updates.notificationEveningEnabled);
  }
  if (updates.selectedCategoryByLang) {
    for (const [langStr, categoryText] of Object.entries(updates.selectedCategoryByLang)) {
      await CategoryDB.setCategorySelection(Number(langStr), categoryText);
    }
  }
  
  cachedSettings = updated;
  return updated;
};

/**
 * Get current language
 */
export const getLanguage = async () => {
  const settings = await getSettings();
  return settings.lang;
};

/**
 * Clear cache
 */
export const clearCache = () => {
  cachedSettings = null;
};

/**
 * Get selected category for a language
 */
export const getSelectedCategory = async (lang) => {
  return await CategoryDB.getCategorySelection(lang);
};

/**
 * Set selected category for a language
 */
export const setSelectedCategory = async (lang, categoryTxt) => {
  await CategoryDB.setCategorySelection(lang, categoryTxt || 'all');
  // Invalidate cache
  if (cachedSettings) {
    cachedSettings.selectedCategoryByLang[String(lang)] = categoryTxt || 'all';
  }
  return await getSettings();
};

/**
 * Get readiness calculation mode
 */
export const getReadinessMode = async () => {
  return await SettingsDB.getReadinessMode();
};
