import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';

// How long the pointer has to rest on a field before its help opens by itself.
const REST_MS = 5000;
interface Help {
  id: string;
  open: boolean;
  pinned: boolean;
  toggle(): void;
  peek(on: boolean): void;
}
const Context = createContext<Help | null>(null);

// A form field with its explanation kept out of the way. The explanation appears beside the
// field, on the right where the page has room (below it on narrower screens), when the "!"
// button is pressed, focused or pointed at, or when the pointer rests on the field for five
// seconds. Put <HelpButton /> next to the field's label.
export function FieldHelp({
  help,
  children,
  className = '',
}: {
  help: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const [pinned, setPinned] = useState(false);
  const [rested, setRested] = useState(false);
  const [peeked, setPeeked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const open = pinned || rested || peeked;
  return (
    <Context.Provider
      value={{ id, open, pinned, toggle: () => setPinned((v) => !v), peek: setPeeked }}
    >
      <div
        className={`relative ${className}`}
        onPointerEnter={() => {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setRested(true), REST_MS);
        }}
        onPointerLeave={() => {
          clearTimeout(timer.current);
          setRested(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setPinned(false);
        }}
      >
        {children}
        {open && (
          <div
            id={id}
            role="note"
            data-testid="field-help"
            className="z-20 mt-2 space-y-2 rounded-lg border border-line bg-panel p-3 text-xs leading-5 text-muted shadow-lg xl:absolute xl:top-0 xl:left-full xl:mt-0 xl:ml-12 xl:w-72"
          >
            {help}
          </div>
        )}
      </div>
    </Context.Provider>
  );
}

export function HelpButton() {
  const help = useContext(Context);
  if (!help) return null;
  return (
    <button
      type="button"
      data-testid="info"
      className={`ml-2 inline-flex size-5 shrink-0 items-center justify-center rounded-full border align-middle text-[11px] leading-none font-bold transition ${help.pinned ? 'border-accent bg-accent text-white' : 'border-line text-muted hover:border-accent hover:text-accent'}`}
      aria-label="Xem giải thích"
      aria-expanded={help.open}
      aria-controls={help.id}
      aria-pressed={help.pinned}
      onClick={help.toggle}
      onPointerEnter={() => help.peek(true)}
      onPointerLeave={() => help.peek(false)}
      onFocus={() => help.peek(true)}
      onBlur={() => help.peek(false)}
    >
      !
    </button>
  );
}
