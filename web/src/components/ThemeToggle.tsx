import React from 'react';
import { Icon } from './Icon';
import { useTheme } from '../lib/theme';

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const label = theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  return (
    <button
      type="button"
      className="sr-button min-h-8 px-2 py-1"
      aria-label={label}
      title={label}
      aria-pressed={theme === 'dark'}
      onClick={toggle}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
