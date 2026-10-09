import React, { useId } from 'react';

// Khung bbox (4 góc) bao quanh dấu tích: "annotation đã được kiểm định".
export function LogoMark({ className = 'h-9 w-9' }) {
  const id = useId();
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className={`shrink-0 ${className}`}>
      <defs>
        <linearGradient id={id} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#12a594" />
          <stop offset="1" stopColor="#065f57" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <path
        d="M8 12.5V10a2 2 0 0 1 2-2h2.5M19.5 8H22a2 2 0 0 1 2 2v2.5M24 19.5V22a2 2 0 0 1-2 2h-2.5M12.5 24H10a2 2 0 0 1-2-2v-2.5"
        stroke="#fff"
        strokeOpacity=".72"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m11.6 16.4 3.1 3.1 5.9-6.6"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  className = '',
  markClassName,
  tone = 'dark',
}: {
  className?: string;
  markClassName?: string;
  tone?: 'dark' | 'light';
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <span
        className={`text-lg font-semibold tracking-tight ${tone === 'light' ? 'text-white' : 'text-slate-900'}`}
      >
        Smart<span className={tone === 'light' ? 'text-teal-300' : 'text-accent'}>Review</span>
      </span>
    </span>
  );
}
