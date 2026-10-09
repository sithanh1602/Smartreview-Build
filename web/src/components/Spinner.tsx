import React from 'react';

// Decorative: the adjacent status/button text supplies the accessible name.
export function Spinner({ className = '' }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-testid="loading-spinner"
      viewBox="0 0 24 24"
      className={`mr-2 inline-block h-4 w-4 shrink-0 align-middle motion-safe:animate-spin ${className}`}
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
