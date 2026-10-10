import React from 'react';
import { lang, setLang } from '../lib/lang';

export function LanguageToggle({ className = 'sr-button min-h-8 px-2.5 py-1 text-xs' }) {
  const next = lang === 'en' ? 'vi' : 'en';
  return (
    <button
      type="button"
      className={className}
      lang={next}
      aria-label={next === 'en' ? 'Switch to English' : 'Chuyển sang tiếng Việt'}
      onClick={() => setLang(next)}
    >
      {lang.toUpperCase()}
    </button>
  );
}
