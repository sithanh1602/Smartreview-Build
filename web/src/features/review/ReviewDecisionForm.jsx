import { hint } from '../../lib/englishHints';
import React, { useState } from 'react';
import { useDataset } from '../../app/DatasetProvider';
import { DECISIONS, ERROR_TYPES } from '../../../shared/review.mjs';
import { request } from '../../lib/api';
// A form keeps the version it loaded: concurrent edits produce a visible 409 rather than overwrite.
export function ReviewDecisionForm({ item }) {
  const { data, saveDecision, refreshReviews, projectId } = useDataset();
  const [existing, setExisting] = useState(data.reviews[item.id] || null);
  const [decision, setDecision] = useState(existing?.decision || '');
  const [type, setType] = useState(existing?.error_type || 'CLASS');
  const [correction, setCorrection] = useState(existing?.corrected_value || '');
  const [note, setNote] = useState(existing?.note || '');
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
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
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function reload() {
    setSaving(true);
    setError('');
    try {
      await refreshReviews();
      const body = await request(
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
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel p-5" aria-label={hint('Review decision')}>
      <p className="eyebrow mb-3">{hint('REVIEW DECISION')}</p>
      {existing && (
        <p className="mb-4 rounded-none bg-accent/10 p-2 text-xs leading-5 text-accent">
          {hint('✓ Reviewed · ')}
          {hint(DECISIONS[existing.decision])}
          <br />
          <span className="text-[10px]">
            {new Date(existing.reviewed_at).toLocaleString('vi-VN')}
          </span>
        </p>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={saving} className="space-y-4">
          <legend className="sr-only">{hint('Quyết định review')}</legend>
          <div className="space-y-2">
            {Object.entries(DECISIONS).map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="decision"
                  value={value}
                  checked={decision === value}
                  required
                  onChange={() => setDecision(value)}
                />
                {hint(label)}
              </label>
            ))}
          </div>
          {decision === 'ERROR' && (
            <>
              <label className="block text-xs text-muted">
                {hint('Error Type')}
                <select
                  aria-label={hint('Error Type')}
                  className="field mt-2"
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
              {type === 'CLASS' && (
                <p className="text-xs text-muted">
                  {hint('Current Label: ')}
                  <strong className="text-slate-900">{item.class_name}</strong>
                </p>
              )}
              <label className="block text-xs text-muted">
                {type === 'CLASS' ? hint('Correct Label') : hint('Correction (optional)')}
                <input
                  aria-label={
                    type === 'CLASS' ? hint('Correct Label') : hint('Correction (optional)')
                  }
                  className="field mt-2"
                  maxLength={1000}
                  required={type === 'CLASS'}
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                />
              </label>
            </>
          )}
          <label className="block text-xs text-muted">
            {hint('Note (optional)')}
            <textarea
              aria-label={hint('Note (optional)')}
              className="field mt-2 min-h-24 resize-y"
              maxLength={4000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            className="button w-full border-accent/40 text-accent"
            type="submit"
            disabled={!decision || saving}
          >
            {saving ? 'Đang lưu…' : existing ? hint('Update Review') : hint('Save Review')}
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-xs leading-5 text-rose-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-xs leading-5 text-accent">
          {message}
        </p>
      )}
      <button className="mt-3 text-[11px] text-muted underline" disabled={saving} onClick={reload}>
        Tải lại quyết định
      </button>
      <p className="mt-3 text-[10px] leading-5 text-muted">
        {hint(
          'Lưu quyết định đánh giá; annotation gốc giữ nguyên. Các thay đổi chưa Save sẽ mất khi chuyển case.',
        )}
      </p>
    </section>
  );
}
