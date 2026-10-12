import { Button } from '@heroui/react';
import { Spinner } from '../../components/Spinner';
import { hint } from '../../lib/englishHints';
import React, { useEffect, useRef, useState } from 'react';
import { useLoadedDataset } from '../../app/DatasetProvider';
import { DECISIONS, ERROR_TYPES } from '../../../shared/review.ts';
import { request } from '../../lib/api';
import type { Case, Review } from '../../types.ts';

// A form keeps the version it loaded: concurrent edits produce a visible 409 rather than overwrite.
const decisionKeys = Object.keys(DECISIONS);
// "English (Vietnamese)" hint labels are shown on two lines; the full text stays the name.
const split = (label: string) => label.match(/^(.*?) \((.*)\)$/)?.slice(1) ?? [label];

export function ReviewDecisionForm({
  item,
  onNext,
  compact = false,
}: {
  item: Case;
  onNext?: () => void;
  // The dock over the image: decisions and save on one row, the note kept but not shown.
  compact?: boolean;
}) {
  const { data, saveDecision, refreshReviews, projectId } = useLoadedDataset();
  const [existing, setExisting] = useState<Review | null>(data.reviews[item.id] || null);
  const [decision, setDecision] = useState(existing?.decision || '');
  const [type, setType] = useState(existing?.error_type || 'CLASS');
  const [correction, setCorrection] = useState(existing?.corrected_value || '');
  const [note, setNote] = useState(existing?.note || '');
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  // Returns whether the decision was saved.
  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await saveDecision(
        item.id,
        {
          decision,
          error_type: decision === 'ERROR' ? type : null,
          corrected_value: decision === 'ERROR' ? correction : null,
          note,
        },
        existing,
      );
      setExisting(result.review);
      setMessage(
        result.metricsPending
          ? 'Đã lưu vào MySQL. Metrics chưa tải được; bấm Tải lại quyết định để cập nhật.'
          : 'Đã lưu vào MySQL.',
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function saveAndNext() {
    if (saving || !form.current?.reportValidity()) return;
    if ((await save()) && onNext) onNext();
  }
  const shortcut = useRef(saveAndNext);
  shortcut.current = saveAndNext;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        shortcut.current();
        return;
      }
      const target = e.target as HTMLElement;
      const typing =
        /SELECT|TEXTAREA/.test(target.tagName) ||
        (target instanceof HTMLInputElement && target.type !== 'radio') ||
        target.isContentEditable;
      const key = decisionKeys[Number(e.key) - 1];
      if (key && !typing && !e.altKey && !e.ctrlKey && !e.metaKey) setDecision(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  async function reload() {
    setSaving(true);
    setError('');
    try {
      await refreshReviews();
      const body = await request<{ review: Review | null }>(
        `${projectId ? `/projects/${projectId}` : ''}/cases/${encodeURIComponent(item.id)}/review`,
      );
      const r = body.review;
      setExisting(r);
      setDecision(r?.decision || '');
      setType(r?.error_type || 'CLASS');
      setCorrection(r?.corrected_value || '');
      setNote(r?.note || '');
      setMessage('Đã tải lại quyết định từ MySQL.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className={
        compact
          ? 'rounded-2xl border border-line bg-panel/95 p-1.5 shadow-lg backdrop-blur'
          : 'shrink-0 border-t border-line p-3 lg:max-h-[62%] lg:overflow-y-auto'
      }
      aria-label={hint('Review decision')}
    >
      <div
        className={`mb-2 flex-wrap items-baseline justify-between gap-x-2 ${compact ? 'hidden' : 'flex'}`}
      >
        <h3 className="text-sm font-semibold">Quyết định</h3>
        {existing ? (
          <p className="text-[11px] text-accent">
            {hint('✓ Reviewed · ')}
            {hint(DECISIONS[existing.decision])} ·{' '}
            {new Date(existing.reviewed_at).toLocaleString('vi-VN')}
          </p>
        ) : (
          <p className="text-[11px] text-muted">chưa review</p>
        )}
      </div>
      <form
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <fieldset
          disabled={saving}
          className={
            compact
              ? 'flex min-w-0 flex-wrap items-end justify-center gap-1.5'
              : 'min-w-0 space-y-2'
          }
        >
          <legend className="sr-only">{hint('Quyết định review')}</legend>
          <div className={compact ? 'flex gap-1.5' : 'grid grid-cols-3 gap-1.5'}>
            {Object.entries(DECISIONS).map(([value, label], i) => {
              const [main, sub] = split(hint(label));
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center justify-center border py-1 ${compact ? 'min-h-8 gap-1.5 rounded-full px-3' : 'min-h-12 flex-col rounded-lg px-1'} text-center text-[11px] leading-4 font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${decision === value ? 'border-accent bg-accent/10 text-accent' : 'border-line hover:border-accent'}`}
                >
                  <input
                    type="radio"
                    name="decision"
                    className="sr-only"
                    aria-label={hint(label)}
                    value={value}
                    checked={decision === value}
                    required
                    onChange={() => setDecision(value)}
                  />
                  {main}
                  <span className="text-[10px] font-normal text-muted" aria-hidden="true">
                    {sub ? `${sub} · ` : ''}
                    {i + 1}
                  </span>
                </label>
              );
            })}
          </div>
          {decision === 'ERROR' && (
            <div className={compact ? 'flex w-72 gap-1.5' : 'grid grid-cols-2 gap-1.5'}>
              <label className="flex flex-col justify-end text-[11px] text-muted">
                {hint('Error Type')}
                <select
                  aria-label={hint('Error Type')}
                  className="field mt-1 min-h-9 rounded-lg px-2 py-1 text-xs"
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value);
                    setCorrection('');
                  }}
                >
                  {Object.entries(ERROR_TYPES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {hint(l)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col justify-end text-[11px] text-muted">
                {type === 'CLASS' ? hint('Correct Label') : hint('Correction (optional)')}
                <input
                  aria-label={
                    type === 'CLASS' ? hint('Correct Label') : hint('Correction (optional)')
                  }
                  className="field mt-1 min-h-9 rounded-lg px-2 py-1 text-xs"
                  placeholder={type === 'CLASS' ? `hiện tại: ${item.class_name}` : undefined}
                  maxLength={1000}
                  required={type === 'CLASS'}
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                />
              </label>
            </div>
          )}
          <textarea
            aria-label={hint('Note (optional)')}
            placeholder={hint('Note (optional)')}
            className={`field min-h-12 resize-y rounded-lg px-2 py-1.5 text-xs ${compact ? 'hidden' : ''}`}
            rows={2}
            maxLength={4000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-1.5">
            <Button
              className={compact && onNext ? 'hidden' : 'flex-1'}
              size="sm"
              variant="outline"
              type="submit"
              isDisabled={!decision || saving}
            >
              {saving && <Spinner />}
              {saving ? 'Đang lưu…' : existing ? hint('Update Review') : hint('Save Review')}
            </Button>
            {onNext && (
              <Button
                size="sm"
                variant="primary"
                isDisabled={!decision || saving}
                onPress={saveAndNext}
              >
                Lưu &amp; tiếp →
              </Button>
            )}
          </div>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-xs leading-5 text-rose-700">
          {error}
        </p>
      )}
      <p
        className={`mt-2 items-center justify-between gap-2 text-[11px] text-muted ${compact && !message ? 'hidden' : 'flex'}`}
      >
        <span role="status" className="text-accent">
          {message}
        </span>
        <button
          className={`shrink-0 underline ${compact ? 'hidden' : ''}`}
          disabled={saving}
          onClick={reload}
        >
          Tải lại quyết định
        </button>
      </p>
    </section>
  );
}
