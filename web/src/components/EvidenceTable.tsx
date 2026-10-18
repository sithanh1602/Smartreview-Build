import React from 'react';
import { evidenceRows } from '../lib/evidence';

// A value up to this long ("0.81 rad (46°)", "12.4 m") stays on one line beside its name; a
// longer one gets the full width under it, so a narrow panel never breaks a number apart.
const SHORT = 24;

// The figures behind one finding, named and with units; the raw JSON stays one click away.
export function EvidenceTable({
  checkId,
  evidence,
}: {
  checkId: string;
  evidence: Record<string, unknown> | undefined;
}) {
  const rows = evidenceRows(checkId, evidence);
  if (!rows.length) return null;
  return (
    <div className="mt-2.5 rounded-lg border border-line bg-panel/70 p-2.5">
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
        Bằng chứng số liệu
      </p>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[13px] leading-5">
        {rows.map((row) => {
          const short = row.value.length <= SHORT;
          return (
            <React.Fragment key={row.key}>
              <dt className={`text-muted ${short ? '' : 'col-span-2'}`}>{row.label}</dt>
              <dd
                className={`font-medium tabular-nums ${short ? 'text-right whitespace-nowrap' : 'col-span-2 -mt-1 break-words'}`}
              >
                {row.value}
              </dd>
            </React.Fragment>
          );
        })}
      </dl>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted">JSON gốc</summary>
        <pre className="mt-1.5 max-h-52 overflow-auto rounded bg-ink p-2 text-[11px] leading-5 text-muted">
          {JSON.stringify(evidence, null, 2)}
        </pre>
      </details>
    </div>
  );
}
