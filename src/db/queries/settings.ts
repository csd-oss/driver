import { db } from '../index';
import { settings } from '../schema/settings';
import { eq } from 'drizzle-orm';
import * as Localization from 'expo-localization';

const SETTINGS_ID = 1; // Single row, always ID 1

export interface SettingsData {
  lang: number;
  hasOnboarded: boolean;
  hasChosenLanguage: boolean;
  useConservativeReadiness: boolean;
}

/**
 * Detect language from device locale
 * Returns: 1 (Slovak), 2 (English), or 3 (Hungarian)
 */
function detectLanguageFromDevice(): number {
  const locales =
    typeof Localization.getLocales === 'function'
      ? Localization.getLocales()
      : [];
  const primaryLocale = locales[0]?.languageCode || Localization.locale || '';
  const normalized = String(primaryLocale).toLowerCase().split('-')[0];
  if (normalized === 'sk') return 1; // Slovak
  if (normalized === 'hu') return 3; // Hungarian
  return 2; // English (default for any other language)
}

/**
 * Get current settings, creating defaults if none exist
 */
export async function getSettings(): Promise<SettingsData> {
  const result = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1);
  
  if (result.length === 0) {
    // Create default settings with language detected from device
    const detectedLang = detectLanguageFromDevice();
    await db.insert(settings).values({
      id: SETTINGS_ID,
      lang: detectedLang,
      hasOnboarded: false,
      hasChosenLanguage: false,
      useConservativeReadiness: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    return {
      lang: detectedLang,
      hasOnboarded: false,
      hasChosenLanguage: false,
      useConservativeReadiness: false,
    };
  }
  
  const s = result[0];
  return {
    lang: s.lang,
    hasOnboarded: s.hasOnboarded,
    hasChosenLanguage: s.hasChosenLanguage,
    useConservativeReadiness: s.useConservativeReadiness,
  };
}

/**
 * Update settings
 */
export async function updateSettings(updates: Partial<SettingsData>): Promise<void> {
  await db.update(settings)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(settings.id, SETTINGS_ID));
}

/**
 * Get current language
 */
export async function getLanguage(): Promise<number> {
  const s = await getSettings();
  return s.lang;
}

/**
 * Set language
 */
export async function setLanguage(lang: number): Promise<void> {
  await updateSettings({ lang });
}

/**
 * Get readiness mode
 */
export async function getReadinessMode(): Promise<boolean> {
  const s = await getSettings();
  return s.useConservativeReadiness;
}

/**
 * Set readiness mode
 */
export async function setReadinessMode(useConservative: boolean): Promise<void> {
  await updateSettings({ useConservativeReadiness: useConservative });
}
