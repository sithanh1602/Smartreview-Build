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
export let lang: Lang = stored();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

const listeners = new Set<() => void>();
export function onLang(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
// Text is translated while rendering, so the app re-renders its pages (see main.tsx) instead of
// reloading: the session, the scripts and the images already downloaded all stay.
export function setLang(next: Lang) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // The choice still applies to this page.
  }
  lang = next;
  document.documentElement.lang = next;
  for (const listener of listeners) listener();
}
