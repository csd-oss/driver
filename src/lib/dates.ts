// Small date helpers shared by the exam-date UI and the readiness forecast.
// All of them work in local time: the exam date is a calendar day, not an
// instant, so we never want UTC shifting it by one.

const pad = (n: number) => String(n).padStart(2, '0');

export const toISODate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseISODate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
};

// Noon avoids DST edge cases when the date is stored as a timestamp.
export const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);

export const today = (): Date => startOfDay(new Date());

// Whole calendar days from `from` to `to` (negative when `to` is earlier).
export const daysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);

export const localeForLang = (lang: number): string => (lang === 1 ? 'sk' : lang === 3 ? 'hu' : 'en');

export const formatDate = (date: Date, lang: number): string =>
  date.toLocaleDateString(localeForLang(lang), { day: 'numeric', month: 'long', year: 'numeric' });
