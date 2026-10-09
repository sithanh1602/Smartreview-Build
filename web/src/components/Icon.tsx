import React from 'react';

const paths = {
  scan: 'M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5M8 8h8v8H8z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  layers: 'm12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5',
  chevron: 'm9 5 7 7-7 7',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  info: 'M12 11v6m0-10v1m9 4a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  copy: 'M9 9h12v12H9zM15 5V3H3v12h2',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  eyeOff:
    'M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6 0 10 7 10 7a17.6 17.6 0 0 1-3.2 3.9M6.5 6.6C3.7 8.5 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  alert:
    'M12 8v5m0 3.5v.1M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
};

export type IconName = keyof typeof paths;

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 ${className}`}
    >
      <path d={paths[name] || paths.scan} />
    </svg>
  );
}
