import { Spinner } from '../../components/Spinner';
import { hint } from '../../lib/englishHints';
import { ui } from '../../lib/i18n';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Card, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { FrameViewer } from './FrameViewer';
import type { View } from './FrameViewer';
import { RiskBadge } from '../../components/RiskBadge';
import { Icon } from '../../components/Icon';
import { ReviewDecisionForm } from './ReviewDecisionForm';
import { confidenceText, objectText } from '../../lib/format';
import { useLoadedDataset } from '../../app/DatasetProvider';
import { request } from '../../lib/api';
import type { PanelControls } from './usePanels';
import { ImageCaseList } from './ImageCaseList';
import { levelColor } from './grouping';
import type { AiFindingView, Case, ContextPosition, Observation } from '../../types.ts';

type Tab = 'why' | 'objects' | 'details';
// Which annotations are drawn: all of them, only the flagged one, or all but the flagged one.
type Mode = 'all' | 'risk' | 'others';
type Scene = { key: string; annotations?: Observation[]; error?: string };
const caption =
  'pointer-events-none absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white';
// Controls that float over the image.
const glass = 'border border-line bg-panel/90 shadow-lg backdrop-blur';
const positions: [ContextPosition, string][] = [
  ['previous', 'Trước'],
  ['current', 'Hiện tại'],
  ['next', 'Sau'],
];
export function CaseDetail({
  item,
  index,
  count,
  onNavigate,
  aiFinding,
  panels,
  siblings,
  imageIndex,
  imageCount,
  onNavigateImage,
  onOpenCase,
  wholeImage,
  onWholeImage,
}: {
  item: Case;
  index: number;
  count: number;
  onNavigate: (delta: number) => void;
  aiFinding?: AiFindingView | null;
  panels: PanelControls;
  // The flagged cases on this image, in queue order (this case included).
  siblings: Case[];
  imageIndex: number;
  imageCount: number;
  onNavigateImage: (delta: number) => void;
  onOpenCase: (id: string) => void;
  // Shows every case of the image at once instead of dimming all but this one.
  wholeImage: boolean;
  onWholeImage: (on: boolean) => void;
}) {
  const {
    projectId,
    data: { meta, reviews },
  } = useLoadedDataset();
  const [mode, setMode] = useState<Mode>('all');
  const [compare, setCompare] = useState(false);
  const [view, setView] = useState<View>();
  const [scene, setScene] = useState<Scene | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [sceneAttempt, setSceneAttempt] = useState(0);
  const [position, setPosition] = useState<ContextPosition>('current'),
    [zoom, setZoom] = useState(false),
    [showBox, setShowBox] = useState(true),
    [copyMessage, setCopyMessage] = useState('');
  const [tab, setTab] = useState<Tab>('why');
  const [zoomSlot, setZoomSlot] = useState<HTMLElement | null>(null);
  const { shown } = panels;
  const [flagsOpen, setFlagsOpen] = useState(false);
  // The decision form is one instance, so a draft survives hiding the info panel: its DOM node
  // is moved between the panel and the dock over the image.
  const [formHost] = useState(() => {
    const host = document.createElement('div');
    host.className = 'contents';
    return host;
  });
  const panelSlot = useRef<HTMLDivElement>(null);
  const dockSlot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    (shown.info ? panelSlot : dockSlot).current?.appendChild(formHost);
  }, [shown.info, formHost]);
  // The selected position always exists: the strip only offers positions the case has.
  const observation = item.context[position]!,
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
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        /INPUT|SELECT|TEXTAREA|BUTTON/.test(target.tagName) ||
        target.isContentEditable
      )
        return;
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        onNavigate(e.key === 'ArrowLeft' ? -1 : 1);
      } else if (
        ['ArrowUp', 'ArrowDown'].includes(e.key) &&
        // Below laptop width the page scrolls, and the arrows belong to that.
        window.matchMedia('(min-width: 1024px)').matches
      ) {
        e.preventDefault();
        onNavigateImage(e.key === 'ArrowUp' ? -1 : 1);
      } else if (e.key.toLowerCase() === 'a' && siblings.length > 1) onWholeImage(!wholeImage);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNavigate, onNavigateImage, onWholeImage, wholeImage, siblings.length]);
  const multi = siblings.length > 1;
  const showList = multi && wholeImage;
  // Sibling cases are numbered on the image only where their own annotation is drawn.
  const marks =
    multi && position === 'current'
      ? Object.fromEntries(
          siblings.map((c, i) => [
            c.annotation_id,
            { n: i + 1, color: levelColor[c.risk_level], dim: !wholeImage, done: !!reviews[c.id] },
          ]),
        )
      : undefined;
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
  const tabs: [Tab, string][] = [
    ['why', `${ui('Flags')} · ${item.findings.length}`],
    ['objects', `${ui('Objects')} · ${annotations.length}`],
    ['details', 'Chi tiết'],
  ];
  return (
    <article
      className={`grid min-w-0 lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] ${shown.info ? 'lg:grid-cols-[minmax(0,1fr)_332px] xl:grid-cols-[minmax(0,1fr)_396px]' : 'lg:grid-cols-[minmax(0,1fr)]'}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-panel px-3 py-1.5 lg:col-span-full">
        <ToggleButton
          isIconOnly
          size="sm"
          aria-label="Ẩn hoặc hiện hàng đợi"
          isSelected={shown.queue}
          onChange={() => panels.toggle('queue')}
        >
          <Icon name="panelLeft" />
        </ToggleButton>
        <div className="flex items-center gap-1">
          <Button
            isIconOnly
            size="sm"
            variant="tertiary"
            aria-label={hint('Case trước')}
            isDisabled={index <= 0}
            onPress={() => onNavigate(-1)}
          >
            <Icon name="chevron" className="rotate-180" />
          </Button>
          <span className="min-w-12 text-center text-xs tabular-nums text-muted">
            {index + 1} / {count}
          </span>
          <Button
            isIconOnly
            size="sm"
            variant="tertiary"
            aria-label={hint('Case tiếp theo')}
            isDisabled={index >= count - 1}
            onPress={() => onNavigate(1)}
          >
            <Icon name="chevron" />
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
          <h2 className="text-sm font-semibold">
            {hint('Frame ')}
            {observation.frame_id}
          </h2>
          {multi && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="rounded-full bg-slate-900 px-2 py-0.5 font-bold text-panel">
                {siblings.findIndex((c) => c.id === item.id) + 1}/{siblings.length}
              </span>
              trong ảnh {imageIndex + 1}/{imageCount}
            </span>
          )}
          <span className="truncate text-[11px] text-muted">
            {objectText(item)} · {observation.media_name} · {observation.width} ×{' '}
            {observation.height}
            {typeof observation.fps === 'number' && Number.isFinite(observation.fps) && (
              <span className="ml-1 font-mono text-accent">
                · {(observation.frame_id / observation.fps).toFixed(3)}s
              </span>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Multiple-selection mode keeps these as pressed buttons; one stays selected. */}
          <ToggleButtonGroup
            size="sm"
            selectionMode="multiple"
            aria-label="Annotation hiển thị"
            selectedKeys={new Set([mode])}
            onSelectionChange={(keys) => {
              const next = [...keys].find((k) => k !== mode);
              if (next) setMode(next as Mode);
            }}
          >
            <ToggleButton id="all">All annotations</ToggleButton>
            <ToggleButton id="risk">Risk only</ToggleButton>
            <ToggleButton id="others">Without risk</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButton size="sm" isSelected={showBox} onChange={setShowBox}>
            <Icon name={showBox ? 'eye' : 'eyeOff'} />
            {observation.geometry.type === 'bbox' ? hint('BBox') : hint('Geometry')}
          </ToggleButton>
          <ToggleButton
            size="sm"
            isSelected={zoom}
            onChange={setZoom}
            isDisabled={
              observation.geometry.type !== 'bbox' ||
              observation.geometry.width <= 0 ||
              observation.geometry.height <= 0
            }
          >
            {zoom ? 'Toàn cảnh' : 'Phóng to vật thể'}
          </ToggleButton>
          {multi && (
            <ToggleButton size="sm" isSelected={wholeImage} onChange={onWholeImage}>
              <Icon name="grid" />
              Xem cả ảnh
            </ToggleButton>
          )}
          <ToggleButton size="sm" isSelected={compare} onChange={setCompare}>
            <Icon name="layers" />
            So sánh ảnh gốc
          </ToggleButton>
          <div ref={setZoomSlot} />
          <Button
            isIconOnly
            size="sm"
            variant="tertiary"
            aria-label="Sao chép thông tin"
            onPress={copyReference}
          >
            <Icon name={copyMessage.startsWith('Đã') ? 'check' : 'copy'} />
          </Button>
          <span role="status" className="sr-only">
            {copyMessage}
          </span>
          <ToggleButton
            isIconOnly
            size="sm"
            aria-label="Ẩn hoặc hiện ngữ cảnh"
            isSelected={shown.context}
            onChange={() => panels.toggle('context')}
          >
            <Icon name="panelBottom" />
          </ToggleButton>
          <ToggleButton
            isIconOnly
            size="sm"
            aria-label="Ẩn hoặc hiện bảng thông tin"
            isSelected={shown.info}
            onChange={() => panels.toggle('info')}
          >
            <Icon name="panelRight" />
          </ToggleButton>
          <ToggleButton
            isIconOnly
            size="sm"
            aria-label="Tập trung"
            isSelected={panels.focused}
            onChange={panels.toggleFocus}
          >
            <Icon name="focus" />
          </ToggleButton>
        </div>
      </div>

      <div className="grid min-w-0 bg-canvas lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto]">
        <div className="relative min-w-0 lg:min-h-0">
          <div
            className={`lg:h-full lg:p-3 ${compare ? 'grid gap-2 sm:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]' : ''}`}
          >
            {compare && (
              <figure className="relative min-w-0 lg:min-h-0">
                <FrameViewer
                  key={observation.annotation_id}
                  observation={observation}
                  trackId={item.track_id}
                  zoom={zoom}
                  tone="canvas"
                  fill
                  showBox={false}
                  follow={view}
                />
                <figcaption className={caption}>Ảnh gốc</figcaption>
              </figure>
            )}
            <figure className="relative min-w-0 lg:h-full lg:min-h-0">
              <FrameViewer
                key={observation.annotation_id}
                observation={observation}
                trackId={item.track_id}
                risk={position === 'current' ? item.score : undefined}
                zoom={zoom}
                interactive
                tone="canvas"
                fill
                controlsSlot={zoomSlot}
                onViewChange={setView}
                showBox={showBox}
                proposal={position === 'current' && showBox ? aiFinding?.prediction : undefined}
                annotations={
                  mode === 'all'
                    ? annotations
                    : mode === 'risk'
                      ? annotations.filter(
                          (a) =>
                            a.annotation_id === observation.annotation_id ||
                            (marks && a.annotation_id! in marks),
                        )
                      : annotations.filter((a) => a.annotation_id !== observation.annotation_id)
                }
                marks={marks}
                onOpenMark={(id) =>
                  onOpenCase(siblings.find((c) => c.annotation_id === id)?.id ?? item.id)
                }
                activeAnnotationId={item.annotation_id}
                selectedAnnotationId={inspected.annotation_id}
                onSelectAnnotation={setSelectedAnnotation}
              />
              {compare && <figcaption className={caption}>Có nhãn</figcaption>}
            </figure>
          </div>
          {!shown.queue && (
            <button
              className={`${glass} absolute top-1/2 left-0 flex h-16 w-5 -translate-y-1/2 items-center justify-center rounded-r-xl border-l-0`}
              aria-label="Hiện hàng đợi"
              onClick={() => panels.toggle('queue')}
            >
              <Icon name="chevron" className="h-3 w-3" />
            </button>
          )}
          {!shown.info && (
            <>
              <button
                className={`${glass} absolute top-1/2 right-0 flex h-16 w-5 -translate-y-1/2 items-center justify-center rounded-l-xl border-r-0`}
                aria-label="Hiện bảng thông tin"
                onClick={() => panels.toggle('info')}
              >
                <Icon name="chevron" className="h-3 w-3 rotate-180" />
              </button>
              <div className={`${glass} absolute top-3 right-8 max-w-80 rounded-xl text-xs`}>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2"
                  aria-expanded={flagsOpen}
                  onClick={() => setFlagsOpen((v) => !v)}
                >
                  <RiskBadge level={item.severity} score={item.score} />
                  <span className="font-semibold">{item.class_name}</span>
                  <span className="ml-auto text-muted">{item.findings.length} tín hiệu</span>
                  <Icon
                    name="chevron"
                    className={`h-3 w-3 ${flagsOpen ? '-rotate-90' : 'rotate-90'}`}
                  />
                </button>
                {flagsOpen && (
                  <ul className="space-y-1.5 border-t border-line px-3 py-2 leading-5">
                    {item.findings.map((f) => (
                      <li key={f.check_id}>
                        <span className="font-semibold text-amber-800">+{f.score}</span> ·{' '}
                        {hint(f.reason)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div
                ref={dockSlot}
                className={`absolute left-1/2 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 ${shown.context ? 'bottom-3' : 'bottom-8'}`}
              />
            </>
          )}
          {!shown.context && (
            <button
              className={`${glass} absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-xl border-b-0 px-4 py-0.5 text-[10px]`}
              aria-label="Hiện ngữ cảnh"
              onClick={() => panels.toggle('context')}
            >
              {hint('Temporal context')}
            </button>
          )}
        </div>
        {temporal ? (
          <section
            aria-label={hint('Temporal context')}
            className={`items-center gap-3 overflow-x-auto border-t border-line bg-film px-3 py-2 ${shown.context ? 'flex' : 'hidden'}`}
          >
            <div className="w-24 shrink-0 text-[11px] leading-4 max-sm:hidden">
              <h3 className="font-semibold">{hint('Temporal context')}</h3>
              <span className="text-muted">{objectText(item)}</span>
            </div>
            <h3 className="sr-only sm:hidden">{hint('Temporal context')}</h3>
            {positions.map(([key, label]) => {
              const o = item.context[key];
              return o ? (
                <button
                  key={key}
                  aria-label={hint(`${label}: frame ${o.frame_id}`)}
                  aria-pressed={position === key}
                  onClick={() => setPosition(key)}
                  className={`shrink-0 rounded-lg border p-1 text-left text-[10px] ${position === key ? 'border-accent bg-accent/10' : 'border-line hover:border-slate-400'}`}
                >
                  <div className="mb-1 flex justify-between gap-3">
                    <span>
                      {label} · F{o.frame_id}
                    </span>
                    <span>{o.class_name}</span>
                  </div>
                  <div className="h-16" style={{ aspectRatio: `${o.width}/${o.height}` }}>
                    <FrameViewer
                      observation={o}
                      trackId={item.track_id}
                      compact
                      tone="canvas"
                      risk={key === 'current' ? item.score : undefined}
                    />
                  </div>
                  <div className="mt-1 text-right text-muted">
                    <span>{confidenceText(o.confidence)}</span>
                  </div>
                </button>
              ) : (
                <div key={key} className="shrink-0 rounded-lg border border-line p-3 text-[10px]">
                  {label}: không có observation.
                </div>
              );
            })}
            <p className="ml-auto shrink-0 text-right text-[10px] leading-5 text-muted max-xl:hidden">
              [ ] \ ẩn hiện khung · F tập trung
              <br />
              ← → chuyển case · ↑ ↓ chuyển ảnh · A xem cả ảnh
              <br />
              1 2 3 chọn quyết định
              <br />
              Ctrl + Enter lưu và sang case tiếp
            </p>
          </section>
        ) : (
          <section
            className={`border-t border-line bg-film px-3 py-2 text-[11px] text-muted ${shown.context ? '' : 'hidden'}`}
          >
            <span className="font-medium text-slate-900">{hint('Annotation đơn lẻ.')}</span>{' '}
            {item.track_id === undefined
              ? 'Không có track ID; các kiểm tra temporal được bỏ qua.'
              : 'Chưa có observation lân cận cho track này.'}
          </section>
        )}
      </div>

      <aside
        className={`min-w-0 flex-col border-line bg-panel lg:min-h-0 lg:border-l ${shown.info ? 'flex' : 'hidden'}`}
        aria-label={hint('Bằng chứng và quyết định review')}
      >
        {currentScene?.error && (
          <p role="alert" className="border-b border-line p-3 text-xs text-rose-700">
            Không tải được toàn bộ annotation: {currentScene.error} Đang hiển thị annotation đang
            xem.{' '}
            <button
              className="sr-button min-h-8 py-1 text-xs"
              onClick={() => setSceneAttempt((v) => v + 1)}
            >
              Tải lại annotations
            </button>
          </p>
        )}
        {missingFocus && (
          <p role="alert" className="border-b border-line p-3 text-xs text-rose-700">
            Không tìm thấy annotation đang xem trong danh sách frame; đang dùng dữ liệu từ Risk
            Case.
          </p>
        )}
        {showList && (
          <ImageCaseList
            cases={siblings}
            currentId={item.id}
            onOpen={onOpenCase}
            onDetail={(id) => {
              onWholeImage(false);
              onOpenCase(id);
            }}
            onNextImage={imageIndex < imageCount - 1 ? () => onNavigateImage(1) : undefined}
          />
        )}
        <div
          role="tablist"
          aria-label="Thông tin case"
          className={`border-b border-line ${showList ? 'hidden' : 'flex'}`}
        >
          {tabs.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              id={`case-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`case-panel-${key}`}
              className={`-mb-px flex-1 border-b-2 px-1 py-2.5 text-xs font-semibold ${tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-slate-900'}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={`p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto ${showList ? 'hidden' : ''}`}>
          <div
            role="tabpanel"
            id="case-panel-why"
            aria-labelledby="case-tab-why"
            hidden={tab !== 'why'}
          >
            {aiFinding && (
              <section className="mb-3 rounded-xl border border-blue-300 p-3 text-xs">
                <h3 className="font-semibold">
                  AI Check (Kiểm tra bằng AI) · Điểm ưu tiên {aiFinding.score}
                </h3>
                <p className="mt-1.5">{aiFinding.reason}</p>
                <p className="mt-1.5">
                  AI: {aiFinding.prediction.label} · Độ tin cậy{' '}
                  {(aiFinding.prediction.confidence * 100).toFixed(1)}% · IoU (Độ trùng khớp){' '}
                  {aiFinding.iou?.toFixed(3)}
                </p>
                <p className="mt-1.5 text-muted">
                  Khung xanh nét đứt là đề xuất AI. Risk bên dưới là điểm kiểm tra bằng quy tắc
                  riêng.
                </p>
              </section>
            )}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{hint('Why flagged')}</h3>
                <RiskBadge level={item.severity} score={item.score} />
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {item.findings.length} tín hiệu · điểm cộng dồn, tối đa 100
              </p>
              <div className="mt-2 space-y-2">
                {item.findings.map((f) => (
                  <Card key={f.check_id} variant="secondary" className="gap-0 rounded-xl p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="break-all font-mono text-[10px] text-muted">{f.check_id}</p>
                      <span className="text-xs font-semibold text-amber-800">+{f.score}</span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-5 text-slate-800">{hint(f.reason)}</p>
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[11px] text-accent">
                        {hint('Evidence · số liệu')}
                      </summary>
                      <pre className="mt-2 max-h-52 overflow-auto bg-ink p-2 text-[10px] leading-5 text-muted">
                        {JSON.stringify(f.evidence, null, 2)}
                      </pre>
                    </details>
                  </Card>
                ))}
                {!item.findings.length && (
                  <p className="text-sm text-accent">
                    Chưa phát hiện bất thường trong các check hiện có.
                  </p>
                )}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] text-muted">
                  {hint('Check coverage · đã chạy / bỏ qua')}
                </summary>
                <ul className="mt-2 space-y-2">
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
          </div>
          <div
            role="tabpanel"
            id="case-panel-objects"
            aria-labelledby="case-tab-objects"
            hidden={tab !== 'objects'}
          >
            <h3 className="mb-2 text-sm font-semibold">Annotations ({annotations.length})</h3>
            {!currentScene && (
              <p role="status" className="mb-2 text-xs text-muted">
                <Spinner />
                Đang tải annotation của frame…
              </p>
            )}
            <div aria-label="Annotations in frame">
              {annotations.map((a) => (
                <button
                  key={a.annotation_id}
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 border-b border-line px-2 py-1.5 text-left text-xs ${a.annotation_id === item.annotation_id ? 'font-semibold text-accent' : 'text-muted'} ${a.annotation_id === inspected.annotation_id ? 'bg-accent/10' : 'hover:bg-slate-50'}`}
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
          </div>
          <div
            role="tabpanel"
            id="case-panel-details"
            aria-labelledby="case-tab-details"
            hidden={tab !== 'details'}
          >
            <h3 className="mb-3 text-sm font-semibold">
              {inspected.class_name}
              {inspected.annotation_id !== item.annotation_id && (
                <span className="ml-2 text-[11px] font-normal text-muted">
                  đang xem, không phải annotation đang review
                </span>
              )}
            </h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
              {[
                [hint('Label'), inspected.class_name],
                [hint('Confidence'), confidenceText(inspected.confidence)],
                [hint('Geometry'), inspected.geometry.type],
                [hint('Source'), inspected.source?.name || inspected.source?.kind || hint('N/A')],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="mb-1 text-muted">{label}</dt>
                  <dd className="break-words font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 break-all font-mono text-[10px] text-muted">
              {inspected.annotation_id} · {inspected.media_id}
            </p>
          </div>
        </div>
        <div ref={panelSlot} className={showList ? 'hidden' : 'contents'} />
      </aside>
      {createPortal(
        <ReviewDecisionForm
          key={item.id}
          item={item}
          compact={!shown.info}
          onNext={index < count - 1 ? () => onNavigate(1) : undefined}
        />,
        formHost,
      )}
    </article>
  );
}
