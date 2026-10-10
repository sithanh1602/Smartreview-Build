// 'vi' is the default interface language; 'en' is chosen with the header toggle.
export type Lang = 'vi' | 'en';
const KEY = 'smartreview-lang';

function stored(): Lang {
  // Tests import this module in Node, where there is no browser storage to ask.
  if (typeof window === 'undefined') return 'vi';
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'vi';
  } catch {
    return 'vi';
  }
}
export const lang: Lang = stored();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

// Text is translated while rendering, so the page reloads to apply the other language.
export function setLang(next: Lang) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    return;
  }
  location.reload();
}
