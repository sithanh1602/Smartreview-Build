import { en, enRules } from './i18n.en.ts';

import { vi } from './i18n.vi.ts';
import { replaceTerms } from './englishHints.ts';
import { lang } from './lang.ts';

export { lang, setLang } from './lang.ts';
export type { Lang } from './lang.ts';

// Components are written in Vietnamese with English domain terms. Text is translated where it
// reaches an element (see ./jsx), so components rarely call a translate function:
// - 'en': Vietnamese strings are looked up in `en`; English terms stay as written.
// - 'vi': English strings are looked up in `vi`, and the app's own mixed strings (the keys of
//   `en`) have their English terms replaced. Other text, such as dataset values, is left alone.
const edges = (text: string) => text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;

function toEnglish(core: string) {
  const exact = en[core];
  if (exact !== undefined) return exact;
  for (const [pattern, replacement] of enRules)
    if (pattern.test(core)) return core.replace(pattern, replacement);
  return core;
}
export function translate(text: string): string {
  const [, lead, core, tail] = edges(text);
  if (!core) return text;
  if (lang === 'en') return lead + toEnglish(core) + tail;
  return lead + (vi[core] ?? (core in en ? replaceTerms(core) : core)) + tail;
}
// For text a component builds itself (a label with a count in it) and for tests: what the
// interface shows for `text`. Unlike `translate`, Vietnamese mode always replaces the terms.
export function ui(text: string): string {
  const [, lead, core, tail] = edges(text);
  if (!core) return text;
  return lead + (lang === 'en' ? toEnglish(core) : (vi[core] ?? replaceTerms(core))) + tail;
}

const TEXT_PROPS = ['aria-label', 'placeholder', 'title', 'alt', 'label'];
type Props = Record<string, unknown> | null;
// Returns the same object when nothing changed.
export function translateProps<P extends Props>(props: P): P {
  if (!props) return props;
  let next: Record<string, unknown> | null = null;
  const set = (name: string, value: unknown) => {
    next ??= { ...props };
    next[name] = value;
  };
  const { children } = props;
  if (typeof children === 'string') {
    const text = translate(children);
    if (text !== children) set('children', text);
  } else if (Array.isArray(children) && children.some((c) => typeof c === 'string'))
    set(
      'children',
      children.map((c) => (typeof c === 'string' ? translate(c) : c)),
    );
  for (const name of TEXT_PROPS) {
    const value = props[name];
    if (typeof value === 'string') {
      const text = translate(value);
      if (text !== value) set(name, text);
    }
  }
  return (next ?? props) as P;
}
