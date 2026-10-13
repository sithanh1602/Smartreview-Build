import React from 'react';
import { cssColor } from './colors.ts';

export function Swatch({ color }: { color: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 shrink-0 rounded-sm"
      style={{ background: cssColor(color) }}
    />
  );
}
export function Check({
  label,
  checked,
  onChange,
  disabled,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 text-sm ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        className="size-4 accent-teal-600"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );
}
// One group of controls, headed by the Waymo component the data behind it comes from.
export function Group({
  title,
  source,
  children,
}: {
  title: string;
  source?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line py-4 first:pt-0 last:border-0">
      <h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-x-2 text-sm font-semibold">
        {title}
        {source && <code className="text-[11px] font-normal text-muted">{source}</code>}
      </h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}
