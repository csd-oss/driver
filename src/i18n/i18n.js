import { STR } from './strings.js';

/**
 * Translation function
 * @param {string} key - Translation key
 * @param {number} lang - Language index (1, 2, or 3)
 * @returns {string} Translated string or key if not found
 */
export const t = (key, lang) => {
  if (!lang || lang < 1 || lang > 3) {
    lang = 1;
  }
  
  const translations = STR[key];
  if (!translations) {
    return key;
  }
  
  return translations[lang] || translations[1] || key;
};
