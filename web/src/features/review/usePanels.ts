import { useEffect, useState } from 'react';

// The frames around the image in the review workspace. Each can be hidden to give the image
// more room; the choice is remembered per browser.
export type PanelName = 'queue' | 'info' | 'context';
export type Panels = Record<PanelName, boolean>;
export type PanelControls = {
  shown: Panels;
  toggle: (name: PanelName) => void;
  // Focus hides every panel; leaving it brings all of them back.
  focused: boolean;
  toggleFocus: () => void;
};

const KEY = 'smartreview-review-panels';
const ALL: Panels = { queue: true, info: true, context: true };
const KEYS: Record<string, PanelName> = { '[': 'queue', ']': 'info', '\\': 'context' };

function stored(): Panels {
  try {
    return { ...ALL, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return ALL;
  }
}

export function usePanels(): PanelControls {
  const [shown, setShown] = useState<Panels>(stored);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(shown));
    } catch {
      // The layout still applies to this page.
    }
  }, [shown]);
  const toggle = (name: PanelName) => setShown((s) => ({ ...s, [name]: !s[name] }));
  const toggleFocus = () =>
    setShown((s) =>
      s.queue || s.info || s.context ? { queue: false, info: false, context: false } : ALL,
    );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        /INPUT|SELECT|TEXTAREA/.test(target.tagName) ||
        target.isContentEditable
      )
        return;
      if (KEYS[e.key]) toggle(KEYS[e.key]);
      else if (e.key.toLowerCase() === 'f') toggleFocus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { shown, toggle, focused: !shown.queue && !shown.info && !shown.context, toggleFocus };
}
