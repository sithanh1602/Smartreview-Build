import { Spinner } from '../components/Spinner';
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { request } from '../lib/api';
import { FrameViewer } from '../features/review/FrameViewer';
import type { AiReport } from '../types.ts';

export function AiCheckPage() {
  const { projectId } = useParams();
  return <AiWorkspace key={projectId} projectId={projectId} />;
}
function AiWorkspace({ projectId }: { projectId: string | undefined }) {
  const [report, setReport] = useState<AiReport | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState('all'),
    [showAi, setShowAi] = useState(true);
  const endpoint = `/projects/${projectId}/ai-check`;
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const data = await request<AiReport>(endpoint, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setReport(data);
        setError('');
        if (data.status === 'RUNNING') timer = setTimeout(load, 1500);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    }
    load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [endpoint, attempt]);
  async function start() {
    setBusy(true);
    setError('');
    try {
      setReport(await request<AiReport>(endpoint, { method: 'POST' }));
      setSelected(null);
      setAttempt((a) => a + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const findings = ((report?.status === 'READY' && report.findings) || []).filter(
    (f) => filter === 'all' || f.check_id === filter,
  );
  const current = findings.find((f) => f.id === selected) || findings[0];
  const index = findings.findIndex((f) => f.id === current?.id);
  const running = report?.status === 'RUNNING';
  return (
    <>
      <Link className="text-sm text-muted" to={`/projects/${projectId}`}>
        ← Về dự án
      </Link>
      <div className="my-6 flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">AI Check (Kiểm tra bằng AI)</h1>
          <p className="mt-3 text-sm text-muted">
            Đối chiếu nhãn và khung bao với model cục bộ. Gợi ý cần người kiểm tra xác nhận.
          </p>
        </div>
        <button
          className="sr-button border-accent text-accent"
          disabled={!report?.available || running || busy}
          onClick={start}
        >
          {(running || busy) && <Spinner />}
          {running
            ? 'Đang kiểm tra…'
            : busy
              ? 'Đang bắt đầu…'
              : report?.status === 'READY'
                ? 'Chạy lại AI Check'
                : 'Bắt đầu AI Check'}
        </button>
      </div>
      {error && (
        <div role="alert" className="panel mb-4 p-4 text-rose-700">
          {error}
          <button className="sr-button ml-3" onClick={() => setAttempt((a) => a + 1)}>
            Tải lại
          </button>
        </div>
      )}
      {!report && !error && (
        <p role="status">
          <Spinner />
          Đang tải trạng thái AI…
        </p>
      )}
      {report && !report.available && (
        <p className="panel p-5">
          Chưa tìm thấy Python hoặc model cục bộ. Xem hướng dẫn cấu hình trong docs/ai-check.md.
        </p>
      )}
      {report?.status === 'IDLE' && (
        <section className="panel p-6">
          <h2 className="font-semibold">Tìm bất đồng về loại đối tượng và vị trí khung bao</h2>
          <p className="mt-3 text-sm">
            Ảnh được xử lý trên máy này. Ngoài bất đồng nhãn/khung, AI chỉ ra đối tượng có thể chưa
            được gán nhãn (chỉ với các lớp đã xuất hiện trong dataset). Nhãn không thuộc bộ nhãn của
            model sẽ được bỏ qua. Nhãn gốc và kết quả kiểm tra bằng quy tắc được giữ nguyên.
          </p>
        </section>
      )}
      {running && (
        <section className="panel p-6" role="status">
          <p>
            <Spinner />
            Đã xử lý {report.completed}/{report.total} ảnh. Bạn có thể rời trang rồi quay lại.
          </p>
          <progress className="mt-4 w-full" value={report.completed} max={report.total} />
        </section>
      )}
      {report?.status === 'FAILED' && (
        <p role="alert" className="panel p-6 text-rose-700">
          {report.error}
        </p>
      )}
      {report?.status === 'READY' && (
        <>
          <section className="panel mb-5 p-5">
            <div className="flex flex-wrap gap-6">
              <strong>{report.findings.length} gợi ý cần kiểm tra</strong>
              <span>
                {report.completed}/{report.total} ảnh đã xử lý
              </span>
              <span>{report.matched_annotations} nhãn ghép được với AI</span>
            </div>
            <p className="mt-3 text-xs text-muted">
              Model: {report.model.name} · CPU · Confidence (Độ tin cậy) ≥{' '}
              {report.thresholds.confidence * 100}% · IoU (Độ trùng khớp khung) ≥{' '}
              {report.thresholds.classIou} để so nhãn; từ {report.thresholds.positionIou} đến dưới{' '}
              {report.thresholds.classIou} để gợi ý lệch khung cùng nhãn.
            </p>
            <p className="mt-2 text-xs text-muted">
              Bỏ qua: {report.skipped.unsupported_label} nhãn ngoài bộ nhãn model;{' '}
              {report.skipped.unsupported_geometry} hình học chưa hỗ trợ;{' '}
              {report.skipped.no_matching_prediction} nhãn không ghép được; {report.skipped_frames}{' '}
              frame (khung hình) không có ảnh phù hợp.
              {report.skipped.missing_unknown_geometry_frames > 0 &&
                ` ${report.skipped.missing_unknown_geometry_frames} ảnh có mask/3D nên không dò thiếu nhãn.`}
            </p>
          </section>
          <label className="mb-5 grid gap-2 text-sm">
            Lọc gợi ý{' '}
            <select
              className="field"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setSelected(null);
              }}
            >
              <option value="all">Tất cả</option>
              <option value="ai.class_disagreement">Bất đồng nhãn</option>
              <option value="ai.bbox_disagreement">Bất đồng khung bao</option>
              <option value="ai.missing_annotation">Có thể thiếu nhãn</option>
            </select>
          </label>
          {!findings.length ? (
            <section className="panel p-8">
              Không có gợi ý phù hợp. Điều này không xác nhận toàn bộ annotation đều đúng.
            </section>
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="panel max-h-[75vh] overflow-auto" aria-label="Danh sách gợi ý AI">
                {findings.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelected(f.id)}
                    aria-current={current.id === f.id ? 'true' : undefined}
                    className={`block w-full border-b border-line p-4 text-left ${current.id === f.id ? 'bg-teal-50' : ''}`}
                  >
                    <strong className={f.severity === 'high' ? 'text-rose-700' : 'text-amber-700'}>
                      Điểm ưu tiên {f.score}
                    </strong>
                    <p className="mt-2 break-all text-sm">{f.observation.media_name}</p>
                    <p className="mt-2 text-xs">
                      {f.annotation
                        ? `${f.annotation.label} → AI: ${f.prediction.label}`
                        : `Chưa có nhãn · AI: ${f.prediction.label}`}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {f.annotation_id
                        ? `Object (Đối tượng): ${f.annotation_id}`
                        : `Frame (Khung hình): ${f.observation.frame_id}`}
                    </p>
                  </button>
                ))}
              </aside>
              <section className="panel p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">
                    {index + 1}/{findings.length} · {current.observation.media_name}
                  </h2>
                  <div className="flex gap-2">
                    <button
                      className="sr-button"
                      disabled={index === 0}
                      onClick={() => setSelected(findings[index - 1].id)}
                    >
                      ← Trước
                    </button>
                    <button
                      className="sr-button"
                      disabled={index === findings.length - 1}
                      onClick={() => setSelected(findings[index + 1].id)}
                    >
                      Sau →
                    </button>
                  </div>
                </div>
                <p className="mb-3 text-sm">
                  <span className="text-emerald-700">
                    {current.annotation
                      ? 'Khung liền: annotation hiện tại'
                      : 'Khung xám: annotation đang có trong ảnh'}
                  </span>{' '}
                  · <span className="text-blue-700">Khung xanh nét đứt: AI đề xuất</span>
                </p>
                <label className="mb-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showAi}
                    onChange={(e) => setShowAi(e.target.checked)}
                  />
                  Hiện khung AI
                </label>
                <FrameViewer
                  key={current.id}
                  observation={current.observation}
                  maxHeight="65vh"
                  proposal={showAi ? current.prediction : undefined}
                  {...(current.annotation
                    ? {}
                    : {
                        annotations: current.frame_annotations || [],
                        activeAnnotationId: null,
                      })}
                />
                <h3 className="mt-5 font-semibold">Why Flagged (Lý do cảnh báo)</h3>
                <p className="mt-2">{current.reason}</p>
                <p className="mt-2 text-sm">
                  Confidence (Độ tin cậy AI): {(current.prediction.confidence * 100).toFixed(1)}%
                  {current.iou !== null && Number.isFinite(current.iou) && (
                    <> · IoU (Độ trùng khớp): {current.iou.toFixed(3)}</>
                  )}
                </p>
                <p className="mt-3 text-sm text-muted">
                  Điểm ưu tiên là quy tắc xếp hàng, không phải xác suất nhãn sai. Hãy đối chiếu ảnh
                  trước khi lưu quyết định.
                </p>
                {current.annotation_id ? (
                  <Link
                    className="sr-button mt-5"
                    to={`/projects/${projectId}/review/${encodeURIComponent(current.annotation_id)}?scope=all`}
                    state={{
                      aiFinding: current,
                      aiRevision: report.dataset_revision,
                    }}
                  >
                    Mở annotation để lưu đánh giá →
                  </Link>
                ) : (
                  <Link
                    className="sr-button mt-5"
                    to={`/projects/${projectId}/frames/${encodeURIComponent(current.frame_id)}`}
                  >
                    Mở ảnh để đánh dấu vùng thiếu →
                  </Link>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}
