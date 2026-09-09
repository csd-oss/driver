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

/**
 * Translate and substitute `{name}` placeholders.
 * @param {string} key
 * @param {number} lang
 * @param {Record<string, string | number>} vars
 */
export const tf = (key, lang, vars = {}) => {
  let out = t(key, lang);
  for (const name of Object.keys(vars)) {
    out = out.split(`{${name}}`).join(String(vars[name]));
  }
  return out;
};

/**
 * Plural category for a count. Slovak distinguishes 1 / 2-4 / other,
 * English 1 / other, Hungarian has no plural agreement for counted nouns.
 * @param {number} lang
 * @param {number} n
 * @returns {'one' | 'few' | 'many'}
 */
export const pluralCategory = (lang, n) => {
  const abs = Math.abs(Math.round(n));
  if (lang === 3) return 'many';
  if (abs === 1) return 'one';
  if (lang === 1 && abs >= 2 && abs <= 4) return 'few';
  return 'many';
};

/**
 * Translate a pluralised key: looks up `${keyBase}.one|few|many` for the
 * count and substitutes placeholders. Falls back to `.many`, then the base key.
 * @param {string} keyBase
 * @param {number} lang
 * @param {number} n
 * @param {Record<string, string | number>} vars
 */
export const tp = (keyBase, lang, n, vars = {}) => {
  const category = pluralCategory(lang, n);
  const candidates = [`${keyBase}.${category}`, `${keyBase}.many`, keyBase];
  const key = candidates.find((k) => STR[k]) || keyBase;
  return tf(key, lang, vars);
};
