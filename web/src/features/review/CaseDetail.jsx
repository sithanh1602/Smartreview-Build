import { hint } from '../../lib/englishHints';
import React, { useEffect, useState } from 'react';
import { FrameViewer } from './FrameViewer';
import { RiskBadge } from '../../components/RiskBadge';
import { Icon } from '../../components/Icon';
import { ReviewDecisionForm } from './ReviewDecisionForm';
import { confidenceText, objectText } from '../../lib/format';
import { useDataset } from '../../app/DatasetProvider';
import { request } from '../../lib/api';
const positions = [
  ['previous', 'Trước'],
  ['current', 'Hiện tại'],
  ['next', 'Sau'],
];
export function CaseDetail({ item, index, count, onNavigate, aiFinding }) {
  const {
    projectId,
    data: { meta },
  } = useDataset();
  const [allAnnotations, setAllAnnotations] = useState(true);
  const [scene, setScene] = useState(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [sceneAttempt, setSceneAttempt] = useState(0);
  const [position, setPosition] = useState('current'),
    [zoom, setZoom] = useState(false),
    [showBox, setShowBox] = useState(true),
    [copyMessage, setCopyMessage] = useState('');
  const observation = item.context[position],
    temporal = Object.keys(item.context).length > 1;
  const sceneKey = JSON.stringify([
    projectId,
    meta.dataset_id,
    observation.media_id,
    observation.frame_ref,
  ]);
  useEffect(() => {
    const controller = new AbortController();
    setSelectedAnnotation(null);
    const query = new URLSearchParams({ media: observation.media_id, dataset: meta.dataset_id });
    if (observation.frame_ref) query.set('frame', observation.frame_ref);
    request(`${projectId ? `/projects/${projectId}` : ''}/annotations?${query}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (
          result.dataset_revision !== meta.dataset_id ||
          result.media_id !== observation.media_id ||
          (observation.frame_ref && result.frame_id !== observation.frame_ref)
        )
          throw new Error('Dataset hoặc frame đã thay đổi. Tải lại trang.');
        setScene({ key: sceneKey, annotations: result.annotations });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setScene({ key: sceneKey, error: error.message });
      });
    return () => controller.abort();
  }, [sceneKey, sceneAttempt]);
  const currentScene = scene?.key === sceneKey ? scene : null;
  const loadedAnnotations = currentScene?.annotations;
  const missingFocus =
    loadedAnnotations &&
    !loadedAnnotations.some((a) => a.annotation_id === observation.annotation_id);
  const annotations = loadedAnnotations
    ? missingFocus
      ? [...loadedAnnotations, observation]
      : loadedAnnotations
    : [observation];
  const inspected = annotations.find((a) => a.annotation_id === selectedAnnotation) || observation;
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName) ||
        e.target.isContentEditable
      )
        return;
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        onNavigate(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNavigate]);
  async function copyReference() {
    try {
      await navigator.clipboard.writeText(
        `${item.media_name} | Frame ${item.frame_id} (zero-based) | ${objectText(item)} | Annotation ${item.annotation_id} | Risk ${item.score} | ${item.reasons.join('; ')}`,
      );
      setCopyMessage('Đã sao chép thông tin.');
    } catch {
      setCopyMessage('Không sao chép được. Dùng thông tin annotation hiển thị bên dưới.');
    }
  }
  return (
    <article className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-5">
        {aiFinding && (
          <section className="panel border-blue-300 p-5">
            <h3 className="font-semibold">
              AI Check (Kiểm tra bằng AI) · Điểm ưu tiên {aiFinding.score}
            </h3>
            <p className="mt-2">{aiFinding.reason}</p>
            <p className="mt-2 text-sm">
              AI: {aiFinding.prediction.label} · Độ tin cậy{' '}
              {(aiFinding.prediction.confidence * 100).toFixed(1)}% · IoU (Độ trùng khớp){' '}
              {aiFinding.iou.toFixed(3)}
            </p>
            <p className="mt-2 text-xs text-muted">
              Khung xanh nét đứt là đề xuất AI. Risk bên dưới là điểm kiểm tra bằng quy tắc riêng.
              Hãy đối chiếu ảnh rồi lưu đánh giá.
            </p>
          </section>
        )}

        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
            <div className="min-w-0">
              <p className="eyebrow mb-1">{hint('ANNOTATION INSPECTOR')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">
                  {hint('Frame ')}
                  {observation.frame_id}
                </h2>
                <span className="text-xs text-muted">{objectText(item)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="button px-2"
                aria-label={hint('Case trước')}
                disabled={index <= 0}
                onClick={() => onNavigate(-1)}
              >
                <Icon name="chevron" className="rotate-180" />
              </button>
              <span className="min-w-12 text-center text-xs tabular-nums text-muted">
                {index + 1} / {count}
              </span>
              <button
                className="button px-2"
                aria-label={hint('Case tiếp theo')}
                disabled={index >= count - 1}
                onClick={() => onNavigate(1)}
              >
                <Icon name="chevron" />
              </button>
            </div>
          </div>
          <FrameViewer
            key={observation.annotation_id}
            observation={observation}
            trackId={item.track_id}
            risk={position === 'current' ? item.score : undefined}
            zoom={zoom}
            showBox={showBox}
            proposal={position === 'current' && showBox ? aiFinding?.prediction : undefined}
            maxHeight={aiFinding ? '65vh' : undefined}
            annotations={allAnnotations ? annotations : [observation]}
            activeAnnotationId={item.annotation_id}
            selectedAnnotationId={inspected.annotation_id}
            onSelectAnnotation={setSelectedAnnotation}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
              <span>
                {observation.width} × {observation.height}
              </span>
              {Number.isFinite(observation.fps) && (
                <span className="font-mono text-accent">
                  {(observation.frame_id / observation.fps).toFixed(3)}s
                </span>
              )}
              <span className="max-w-50 truncate">{observation.media_name}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={`button min-h-8 py-1 text-xs ${allAnnotations ? 'border-accent text-accent' : ''}`}
                aria-pressed={allAnnotations}
                onClick={() => setAllAnnotations(true)}
              >
                All annotations
              </button>
              <button
                className={`button min-h-8 py-1 text-xs ${!allAnnotations ? 'border-accent text-accent' : ''}`}
                aria-pressed={!allAnnotations}
                onClick={() => setAllAnnotations(false)}
              >
                Risk only
              </button>
              <button
                className={`button min-h-8 py-1 text-xs ${showBox ? 'text-accent' : ''}`}
                aria-pressed={showBox}
                onClick={() => setShowBox((v) => !v)}
              >
                <Icon name="eye" />
                {observation.geometry.type === 'bbox' ? hint('BBox') : hint('Geometry')}
              </button>
              <button
                className="button min-h-8 py-1 text-xs"
                aria-pressed={zoom}
                disabled={
                  observation.geometry.type !== 'bbox' ||
                  observation.geometry.width <= 0 ||
                  observation.geometry.height <= 0
                }
                onClick={() => setZoom((v) => !v)}
              >
                {zoom ? 'Toàn cảnh' : 'Phóng to vật thể'}
              </button>
            </div>
          </div>
          <div className="border-t border-line p-4">
            {!currentScene && (
              <p role="status" className="text-xs text-muted">
                Đang tải annotation của frame…
              </p>
            )}
            {currentScene?.error && (
              <p role="alert" className="text-xs text-rose-700">
                Không tải được toàn bộ annotation: {currentScene.error} Đang hiển thị annotation
                đang xem.{' '}
                <button className="button" onClick={() => setSceneAttempt((v) => v + 1)}>
                  Tải lại annotations
                </button>
              </p>
            )}
            {missingFocus && (
              <p role="alert" className="text-xs text-rose-700">
                Không tìm thấy annotation đang xem trong danh sách frame; đang dùng dữ liệu từ Risk
                Case.
              </p>
            )}
            <h3 className="mb-2 text-sm font-semibold">Annotations ({annotations.length})</h3>
            <div className="max-h-48 overflow-auto" aria-label="Annotations in frame">
              {annotations.map((a) => (
                <button
                  key={a.annotation_id}
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 border-b border-line px-2 py-2 text-left text-xs ${a.annotation_id === item.annotation_id ? 'bg-accent/10 font-semibold text-accent' : 'text-muted'}`}
                  aria-pressed={a.annotation_id === inspected.annotation_id}
                  onClick={() => setSelectedAnnotation(a.annotation_id)}
                >
                  <span>
                    {a.class_name} · {a.annotation_id}
                  </span>
                  {a.annotation_id === item.annotation_id && (
                    <span>Risk {item.score} · Đang review</span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Chọn annotation để xem chi tiết. Quyết định review luôn lưu cho {item.annotation_id}.
            </p>
          </div>
        </section>
        {temporal ? (
          <section aria-label={hint('Temporal context')}>
            <div className="mb-3 flex flex-wrap justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {hint('Temporal context')}{' '}
                <span className="ml-2 text-xs font-normal text-muted">{objectText(item)}</span>
              </h3>
              <span className="text-[11px] text-muted">{hint('Previous → Current → Next')}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {positions.map(([key, label]) => {
                const o = item.context[key];
                return o ? (
                  <button
                    key={key}
                    aria-label={hint(`${label}: frame ${o.frame_id}`)}
                    aria-pressed={position === key}
                    onClick={() => setPosition(key)}
                    className={`min-w-0 rounded-none border p-2 text-left ${position === key ? 'border-accent/60 bg-accent/7' : 'border-line bg-panel hover:border-slate-500'}`}
                  >
                    <div className="mb-2 flex flex-wrap justify-between gap-1 text-[11px] text-muted">
                      <span>{label}</span>
                      <span>F{o.frame_id}</span>
                    </div>
                    <FrameViewer
                      observation={o}
                      trackId={item.track_id}
                      compact
                      risk={key === 'current' ? item.score : undefined}
                    />
                    <div className="flex flex-wrap justify-between gap-1 pt-2 text-xs">
                      <span>{o.class_name}</span>
                      <span className="text-muted">{confidenceText(o.confidence)}</span>
                    </div>
                  </button>
                ) : (
                  <div key={key} className="panel p-4 text-xs text-muted">
                    {label}: không có observation.
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="panel p-4 text-xs leading-6 text-muted">
            <span className="font-medium text-slate-700">{hint('Annotation đơn lẻ.')}</span>{' '}
            {item.track_id === undefined
              ? 'Không có track ID; các kiểm tra temporal được bỏ qua.'
              : 'Chưa có observation lân cận cho track này.'}
          </section>
        )}
        <section className="panel p-5">
          <p className="eyebrow mb-4">{hint('ANNOTATION DETAILS')}</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-xs sm:grid-cols-4">
            {[
              [hint('Label'), inspected.class_name],
              [hint('Confidence'), confidenceText(inspected.confidence)],
              [hint('Geometry'), inspected.geometry.type],
              [hint('Source'), inspected.source?.name || inspected.source?.kind || hint('N/A')],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="mb-1.5 text-muted">{label}</dt>
                <dd className="break-words font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 break-all border-t border-line pt-3 font-mono text-[10px] text-muted">
            {hint('annotation: ')}
            {inspected.annotation_id}
            {hint(' · media:')}
            {inspected.media_id}
          </p>
        </section>
      </div>
      <aside className="min-w-0 space-y-4" aria-label={hint('Bằng chứng và quyết định review')}>
        <section className="panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{hint('Why flagged')}</h3>
            <RiskBadge level={item.severity} score={item.score} />
          </div>
          <p className="mb-5 text-xs leading-5 text-muted">
            {item.findings.length} tín hiệu bất thường · điểm cộng dồn, tối đa 100
          </p>
          <div className="space-y-3">
            {item.findings.map((f) => (
              <section key={f.check_id} className="rounded-none border border-line bg-ink/40 p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="break-all font-mono text-[10px] text-muted">{f.check_id}</p>
                  <span className="text-xs font-semibold text-amber-800">+{f.score}</span>
                </div>
                <p className="text-xs leading-6 text-slate-800">{hint(f.reason)}</p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] text-accent">
                    {hint('Evidence · số liệu')}
                  </summary>
                  <pre className="mt-2 max-h-52 overflow-auto rounded-none bg-ink p-2 text-[10px] leading-5 text-muted">
                    {JSON.stringify(f.evidence, null, 2)}
                  </pre>
                </details>
              </section>
            ))}
            {!item.findings.length && (
              <p className="text-sm text-accent">
                Chưa phát hiện bất thường trong các check hiện có.
              </p>
            )}
          </div>
          <details className="mt-4 border-t border-line pt-4">
            <summary className="cursor-pointer text-xs text-muted">
              {hint('Check coverage · đã chạy / bỏ qua')}
            </summary>
            <ul className="mt-3 space-y-3">
              {item.evaluations.map((e) => (
                <li key={e.check_id} className="text-[10px] leading-5">
                  <p className="break-all text-slate-700">{e.check_id}</p>
                  <p className="text-muted">
                    {hint(e.status)}
                    {e.status === 'skipped' ? ` · ${e.reason}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        </section>
        <ReviewDecisionForm key={item.id} item={item} />
        <section className="panel p-5">
          <button className="button mt-4 w-full text-xs" onClick={copyReference}>
            <Icon name="copy" />
            Sao chép thông tin
          </button>
          {copyMessage && (
            <p role="status" className="mt-3 text-xs text-accent">
              {copyMessage}
            </p>
          )}
        </section>
        <p className="px-2 text-[11px] leading-5 text-muted">
          {hint(
            'Đối chiếu hình ảnh trước khi kết luận. Khi cần sửa, tìm annotation tương ứng trong công cụ gán nhãn.',
          )}
        </p>
      </aside>
    </article>
  );
}
