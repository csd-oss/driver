import { STR } from '../src/i18n/strings';
import { pluralCategory, t, tf, tp } from '../src/i18n/i18n';

describe('i18n strings', () => {
  it('every key has Slovak, English and Hungarian text', () => {
    const missing = Object.keys(STR).filter(
      (key) => ![1, 2, 3].every((lang) => typeof STR[key][lang] === 'string' && STR[key][lang].length > 0)
    );
    expect(missing).toEqual([]);
  });

  it('every plural key has one/few/many siblings', () => {
    const bases = new Set(
      Object.keys(STR)
        .filter((key) => /\.(one|few|many)$/.test(key))
        .map((key) => key.replace(/\.(one|few|many)$/, ''))
    );
    for (const base of bases) {
      expect(STR[`${base}.one`]).toBeDefined();
      expect(STR[`${base}.few`]).toBeDefined();
      expect(STR[`${base}.many`]).toBeDefined();
    }
  });
});

describe('i18n helpers', () => {
  it('t falls back to Slovak then key', () => {
    expect(t('does.not.exist', 2)).toBe('does.not.exist');
    expect(t('common.cancel', 2)).toBe('Cancel');
    expect(t('common.cancel', 99)).toBe('Zrušiť');
  });

  it('tf substitutes placeholders', () => {
    expect(tf('forecast.moreThan', 2, { days: 90 })).toBe('more than 90 days at your pace');
  });

  it('pluralCategory follows Slovak 1 / 2-4 / other', () => {
    expect(pluralCategory(1, 1)).toBe('one');
    expect(pluralCategory(1, 3)).toBe('few');
    expect(pluralCategory(1, 5)).toBe('many');
    expect(pluralCategory(2, 1)).toBe('one');
    expect(pluralCategory(2, 2)).toBe('many');
    expect(pluralCategory(3, 1)).toBe('many');
  });

  it('tp picks the plural form and substitutes', () => {
    expect(tp('forecast.days', 1, 1, { days: 1 })).toBe('približne 1 deň pri tvojom tempe');
    expect(tp('forecast.days', 1, 3, { days: 3 })).toBe('približne 3 dni pri tvojom tempe');
    expect(tp('forecast.days', 1, 14, { days: 14 })).toBe('približne 14 dní pri tvojom tempe');
    expect(tp('forecast.days', 2, 1, { days: 1 })).toBe('about 1 day at your pace');
    expect(tp('forecast.days', 3, 7, { days: 7 })).toBe('körülbelül 7 nap a tempóddal');
  });
});
