import React, { useEffect, useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { Spinner } from '../../components/Spinner';
import { request } from '../../lib/api';
import type { Handoff, Metrics, Person, Project, ProjectPeople } from '../../types.ts';

// Ends the review: the reviewer picks the project's annotators, the confirmed errors are
// sent to them as a file, and the decisions are locked from then on.
export function CompleteReviewButton({
  project,
  metrics,
  onSent,
  className = 'sr-button border-accent text-accent',
}: {
  project: Project;
  metrics: Pick<Metrics, 'unreviewed' | 'unsure' | 'confirmed_errors'>;
  onSent: (handoff: Handoff) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (project.my_role === 'annotator' || project.handoff?.status === 'SENT') return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Hoàn thành
      </button>
      {open && (
        <SendDialog
          project={project}
          metrics={metrics}
          onClose={() => setOpen(false)}
          onSent={onSent}
        />
      )}
    </>
  );
}

function SendDialog({
  project,
  metrics,
  onClose,
  onSent,
}: {
  project: Project;
  metrics: Pick<Metrics, 'unreviewed' | 'unsure' | 'confirmed_errors'>;
  onClose: () => void;
  onSent: (handoff: Handoff) => void;
}) {
  const [annotators, setAnnotators] = useState<Person[] | null>(null),
    [chosen, setChosen] = useState(() => new Set<string>()),
    [note, setNote] = useState(''),
    [withReview, setWithReview] = useState(false),
    [error, setError] = useState(''),
    [sending, setSending] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    request<ProjectPeople>(`/projects/${project.id}/members`, { signal: c.signal })
      .then((people) => {
        if (c.signal.aborted) return;
        setAnnotators(people.annotators);
        setChosen(new Set(people.annotators.map((a) => a.id)));
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [project.id]);
  async function send() {
    setSending(true);
    setError('');
    try {
      onSent(
        await request<Handoff>(`/projects/${project.id}/handoff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ annotator_ids: [...chosen], note, include_review: withReview }),
        }),
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  return (
    <Modal isOpen onOpenChange={(open) => !open && !sending && onClose()}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog aria-label="Hoàn thành review">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Hoàn thành review</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm">
                Gửi file kết quả review cho Annotator để sửa nhãn. Sau khi gửi, các quyết định
                review bị khoá; chỉ Leader hoặc Reviewer mở lại được.
              </p>
              <p className="mt-3 text-sm" data-testid="handoff-summary">
                <strong>{metrics.confirmed_errors}</strong> lỗi đã xác nhận trong các case rủi ro
              </p>
              {metrics.unreviewed > 0 && (
                <p className="mt-2 rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
                  Còn <strong>{metrics.unreviewed}</strong> case rủi ro chưa kiểm tra.
                </p>
              )}
              {metrics.unreviewed + metrics.unsure > 0 && (
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={withReview}
                    disabled={sending}
                    onChange={(e) => setWithReview(e.target.checked)}
                  />
                  <span>
                    Gửi kèm mục “Cần xem lại”: <strong>{metrics.unsure}</strong> case Chưa chắc và{' '}
                    <strong>{metrics.unreviewed}</strong> case chưa kiểm tra, tách khỏi lỗi đã xác
                    nhận. Không chọn thì Annotator chỉ nhận lỗi đã xác nhận.
                  </span>
                </label>
              )}
              <fieldset className="mt-4" disabled={sending}>
                <legend className="text-sm font-semibold">Gửi cho Annotator</legend>
                {!annotators && !error && (
                  <p role="status" className="mt-2 text-sm text-muted">
                    <Spinner />
                    Đang tải danh sách Annotator…
                  </p>
                )}
                {annotators?.length === 0 && (
                  <p className="mt-2 text-sm text-muted">
                    Project chưa có Annotator. Thêm Annotator ở trang dự án rồi quay lại.
                  </p>
                )}
                <div className="mt-2 space-y-2">
                  {annotators?.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={chosen.has(a.id)}
                        onChange={(e) => {
                          const next = new Set(chosen);
                          if (e.target.checked) next.add(a.id);
                          else next.delete(a.id);
                          setChosen(next);
                        }}
                      />
                      {a.username}
                    </label>
                  ))}
                </div>
                <label className="mt-4 block text-sm">
                  Ghi chú cho Annotator (không bắt buộc)
                  <textarea
                    className="field mt-2"
                    value={note}
                    maxLength={1000}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </fieldset>
              {error && (
                <p role="alert" className="mt-3 text-sm text-rose-700">
                  {error}
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" isDisabled={sending} onPress={onClose}>
                Hủy
              </Button>
              <Button variant="primary" isDisabled={sending || !chosen.size} onPress={send}>
                {sending && <Spinner />}
                {sending ? 'Đang gửi…' : 'Gửi và khoá review'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

// Shown wherever decisions are edited once the review has been sent.
export function HandoffNotice({
  handoff,
  className = '',
}: {
  handoff: Handoff;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={`rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 ${className}`}
    >
      Review đã hoàn thành: {handoff.sent_by_name} đã gửi cho{' '}
      {handoff.recipients.map((r) => r.username).join(', ')} lúc{' '}
      {new Date(handoff.sent_at).toLocaleString('vi-VN')}. Quyết định đang bị khoá.
    </p>
  );
}
