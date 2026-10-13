import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { Spinner } from '../components/Spinner';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageToggle } from '../components/LanguageToggle';
import { AccountMenu } from '../features/auth/AuthGate';
import { request, requestBytes } from '../lib/api';
import { useProject3D } from '../features/projects3d/useProject3D';
import { PointCloudEngine } from '../features/projects3d/viewer/engine';
import { BACKGROUND, BOX_COLORS, cssColor } from '../features/projects3d/viewer/colors';
import { Swatch } from '../features/projects3d/viewer/controls';
import { CameraStrip, CameraView } from '../features/projects3d/viewer/Cameras';
import { DisplayPanel } from '../features/projects3d/viewer/DisplayPanel';
import { ObjectPanel } from '../features/projects3d/viewer/ObjectPanel';
import { HandControl } from '../features/projects3d/viewer/HandControl';
import { FLAG_NAMES, boxKey, flagsOf } from '../features/projects3d/viewer/flags';
import type { Action } from '../features/projects3d/viewer/gestures';
import type {
  FrameInfo,
  Scene3D,
  ViewPreset,
  ViewSettings,
} from '../features/projects3d/viewer/engine';
import type { Review } from '../types.ts';

// The lidar turns ten times a second, so that is the pace of playback at 1×.
const FRAME_MS = 100;
const SPEEDS = [0.25, 0.5, 1, 2];
const VIEWS: [ViewPreset, string][] = [
  ['top', 'Trên'],
  ['front', 'Mặt trước'],
  ['side', 'Mặt bên'],
  ['perspective', 'Phối cảnh'],
];
type Tab = 'review' | 'display';
const pad = (n: number) => String(n).padStart(4, '0');
const dark = 'rounded-md border border-[#30363d] bg-[#21262d] px-2.5 py-1';

// The 3D review workspace: the point cloud with its cuboids, under it the frames of the segment
// as a row of small pictures, and on the right the selected cuboid with its review, or what
// the viewer draws.
export function Viewer3DPage() {
  const { projectId } = useParams();
  const { data: project, error: projectError, loading } = useProject3D(projectId);
  const [scene, setScene] = useState<Scene3D | null>(null),
    [reviews, setReviews] = useState<Record<string, Review>>({}),
    [failure, setFailure] = useState(''),
    [settings, setSettings] = useState<ViewSettings | null>(null),
    [info, setInfo] = useState<FrameInfo | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    // The camera whose full image is open over the point cloud.
    [camera, setCamera] = useState<string | null>(null),
    [tab, setTab] = useState<Tab>('review'),
    // The two bars around the point cloud can be put away to give it the room.
    [showPanel, setShowPanel] = useState(true),
    [showCameras, setShowCameras] = useState(true),
    // Hand gestures seen by the webcam; off until asked for.
    [webcam, setWebcam] = useState(false),
    [notice, setNotice] = useState(''),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<PointCloudEngine | null>(null);
  const ready = project?.status === 'READY',
    revision = project?.metadata?.dataset_id;
  useEffect(() => {
    if (!ready) return;
    const c = new AbortController();
    setScene(null);
    setFailure('');
    Promise.all([
      request<Scene3D>(`/projects3d/${projectId}/scene?dataset=${revision}`, { signal: c.signal }),
      request<{ reviews: Record<string, Review> }>(`/projects3d/${projectId}/reviews`, {
        signal: c.signal,
      }),
    ])
      .then(([loaded, saved]) => {
        setSettings({
          frame: 'vehicle',
          follow: true,
          trajectory: true,
          motionCompensation: true,
          color: 'height',
          pointSize: 1.5,
          boxes: true,
          boxColor: 'type',
          labels: true,
          sensors: true,
          lasers: Object.fromEntries(loaded.lasers.map((l) => [l.name, true])),
          types: {},
        });
        setReviews(saved.reviews);
        setSelected(null);
        setCamera(null);
        setScene(loaded);
      })
      .catch((e) => {
        if (!c.signal.aborted) setFailure(e.message);
      });
    return () => c.abort();
  }, [projectId, ready, revision]);
  // The engine lives as long as the scene; later changes are handed to it by the effects below.
  const initial = useRef(settings);
  initial.current = settings;
  useEffect(() => {
    if (!scene || !host.current || !initial.current) return;
    let created: PointCloudEngine;
    try {
      created = new PointCloudEngine(
        host.current,
        scene,
        initial.current,
        (file) => requestBytes(`/projects3d/${projectId}/${file}?dataset=${revision}`),
        setInfo,
        (objectId) => {
          setSelected(objectId);
          // A cuboid was clicked to be looked at: bring its details back if they were hidden.
          if (objectId) {
            setTab('review');
            setShowPanel(true);
          }
        },
      );
    } catch {
      setFailure('Trình duyệt không mở được WebGL nên không vẽ được point cloud.');
      return;
    }
    engine.current = created;
    created.show(0).catch((e) => setFailure((e as Error).message));
    return () => {
      engine.current = null;
      created.dispose();
      setInfo(null);
      setPlaying(false);
    };
  }, [scene, projectId, revision]);
  useEffect(() => {
    if (settings) engine.current?.update(settings);
  }, [settings]);
  useEffect(() => {
    engine.current?.select(selected);
  }, [selected, scene]);
  useEffect(() => {
    engine.current?.setReviews(reviews);
  }, [reviews, scene]);
  const tracks = useMemo(() => {
    const byObject = new Map<string, number[]>();
    scene?.frames.forEach((frame, index) => {
      for (const box of frame.boxes) {
        const frames = byObject.get(box.id);
        if (frames) frames.push(index);
        else byObject.set(box.id, [index]);
      }
    });
    return byObject;
  }, [scene]);
  const types = useMemo(
    () =>
      scene
        ? [...new Set(scene.frames.flatMap((f) => f.boxes.map((b) => b.type)))].sort(
            (a, b) => Object.keys(BOX_COLORS).indexOf(a) - Object.keys(BOX_COLORS).indexOf(b),
          )
        : [],
    [scene],
  );
  // The cuboids of the frame on screen that were reviewed as wrong, numbered.
  const flags = useMemo(
    () => (scene && info ? flagsOf(scene.frames[info.index], reviews) : []),
    [scene, info, reviews],
  );
  const total = scene?.frames.length ?? 0;
  const show = (index: number) =>
    engine.current
      ?.show((index + total) % total)
      .then(() => setFailure(''))
      .catch((e) => {
        setPlaying(false);
        setFailure((e as Error).message);
      });
  // Playback asks for the next frame only after the previous one is on screen, so a slow
  // connection slows the playback down instead of skipping frames.
  useEffect(() => {
    if (!playing || !scene) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const started = performance.now(),
        current = engine.current;
      if (!current) return;
      try {
        await current.show((current.current + 1) % scene.frames.length);
      } catch (e) {
        setFailure((e as Error).message);
        return setPlaying(false);
      }
      if (!stopped)
        timer = setTimeout(tick, Math.max(0, FRAME_MS / speed - (performance.now() - started)));
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [playing, speed, scene]);
  const step = (delta: number) => {
    setPlaying(false);
    if (engine.current) show(engine.current.current + delta);
  };
  const keys = useRef({ step, toggle: () => setPlaying((v) => !v), camera });
  keys.current = { step, toggle: () => setPlaying((v) => !v), camera };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName,
        input = event.target as HTMLInputElement,
        choice = tag === 'INPUT' && ['checkbox', 'radio'].includes(input.type);
      if (!engine.current || tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && !choice))
        return;
      // Escape closes the camera image first, then clears the selection.
      if (event.code === 'Escape') {
        if (keys.current.camera) setCamera(null);
        else setSelected(null);
      }
      // On a button, link, checkbox or radio the space bar and arrows already have a meaning.
      else if (event.code === 'Space') {
        if (choice || tag === 'BUTTON' || tag === 'A') return;
        event.preventDefault();
        keys.current.toggle();
      } else if (input.type === 'radio') return;
      else if (event.code === 'ArrowRight') keys.current.step(1);
      else if (event.code === 'ArrowLeft') keys.current.step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // What a gesture seen by the webcam does. Raising fingers calls up the flag with that number.
  const onGesture = (action: Action) => {
    const view = engine.current;
    if (!view) return;
    if (action.type === 'zoom') view.zoom(action.factor);
    else if (action.type === 'pan') view.pan(action.right, action.up);
    else {
      const flag = flags.find((f) => f.number === action.number);
      setNotice(flag ? '' : `Frame này không có cờ số ${action.number}.`);
      if (flag) setSelected(flag.objectId);
    }
  };
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  // The flag of the selected cuboid, with what its review says, shown over the point cloud.
  const flagged = flags.find((f) => f.objectId === selected),
    verdict =
      flagged && scene && info
        ? reviews[boxKey(scene.frames[info.index].timestamp, flagged.objectId)]
        : null;
  const set = (change: Partial<ViewSettings>) =>
    setSettings((current) => current && { ...current, ...change });
  const message = projectError
    ? projectError
    : project && !ready
      ? 'Project chưa sẵn sàng. Quay lại trang project để xem trạng thái.'
      : failure;
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      {/* A slim header: the point cloud gets the height. The first link leaves the project. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-panel px-3 py-0.5 text-xs">
        <Link to="/projects" aria-label="SmartReview">
          <LogoMark className="h-5 w-5" />
        </Link>
        <Link
          to={`/projects3d/${projectId}`}
          className="sr-button min-h-6 gap-1 px-2.5 py-0 text-[11px]"
          data-testid="viewer-exit"
        >
          <span aria-hidden="true">←</span>
          <span className="max-w-48 truncate">{project?.name ?? 'Project 3D'}</span>
        </Link>
        {scene && (
          <p className="flex min-w-0 items-center gap-2 text-muted">
            <span className="hidden max-w-72 truncate xl:inline" title={scene.segment}>
              Segment {scene.segment}
            </span>
            <span aria-hidden="true" className="hidden xl:inline">
              ›
            </span>
            <span className="tabular-nums">
              Frame {info ? pad(info.index) : '––––'} / {pad(total)}
            </span>
          </p>
        )}
        <span className="ml-auto" />
        {scene && (
          <div
            className="flex items-center gap-1.5"
            role="group"
            aria-label="Ẩn hiện thanh công cụ"
          >
            {(scene.cameras?.length ?? 0) > 0 && (
              <button
                type="button"
                className="sr-button min-h-7 gap-1.5 px-3 py-0.5 text-xs"
                aria-pressed={showCameras}
                title={showCameras ? 'Ẩn ảnh camera' : 'Hiện ảnh camera'}
                onClick={() => setShowCameras((v) => !v)}
                data-testid="toggle-cameras"
              >
                <Icon name="panelBottom" />
                Ảnh camera
              </button>
            )}
            <button
              type="button"
              className="sr-button min-h-7 gap-1.5 px-3 py-0.5 text-xs"
              aria-pressed={webcam}
              title={
                webcam ? 'Tắt điều khiển bằng cử chỉ' : 'Điều khiển bằng cử chỉ tay qua webcam'
              }
              onClick={() => setWebcam((v) => !v)}
              data-testid="toggle-webcam"
            >
              <Icon name="scan" />
              Webcam
            </button>
            <button
              type="button"
              className="sr-button min-h-7 gap-1.5 px-3 py-0.5 text-xs"
              aria-pressed={showPanel}
              title={showPanel ? 'Ẩn bảng bên phải' : 'Hiện bảng bên phải'}
              onClick={() => setShowPanel((v) => !v)}
              data-testid="toggle-panel"
            >
              <Icon name="panelRight" />
              Bảng review
            </button>
          </div>
        )}
        <div className="viewer3d-header flex items-center gap-2">
          <AccountMenu />
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="relative min-h-[62vh] flex-1 overflow-hidden text-[13px] text-[#d0d7de] lg:min-h-0"
            style={{ background: cssColor(BACKGROUND) }}
          >
            {/* Isolated: the cuboid name tags carry their own z-index and must stay under what is
                laid over the point cloud. */}
            <div ref={host} className="absolute inset-0 isolate" data-testid="viewer-canvas" />
            {scene && info && revision && camera && (
              <CameraView
                base={`/projects3d/${projectId}`}
                revision={revision}
                scene={scene}
                index={info.index}
                camera={camera}
                onOpen={setCamera}
              />
            )}
            {info && (
              <div
                className="pointer-events-none absolute top-2.5 left-2.5 rounded-md bg-[#161b22]/85 px-3 py-2 leading-relaxed tabular-nums"
                data-testid="viewer-hud"
              >
                <p>
                  {info.points.toLocaleString('en-US')} điểm · {info.boxes} cuboid · xe{' '}
                  {info.speedKmh.toFixed(0)} km/h
                </p>
                <p className="flex flex-wrap gap-x-3">
                  {types
                    .filter((type) => info.byType[type])
                    .map((type) => (
                      <span key={type} className="inline-flex items-center gap-1.5">
                        <Swatch color={BOX_COLORS[type] ?? BOX_COLORS.UNKNOWN} />
                        {type} {info.byType[type]}
                      </span>
                    ))}
                </p>
              </div>
            )}
            {info && (
              <div
                className="absolute top-2.5 right-2.5 flex overflow-hidden rounded-md border border-[#30363d] bg-[#161b22]/90 max-sm:top-auto max-sm:bottom-14"
                role="group"
                aria-label="Góc nhìn"
              >
                {VIEWS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className="px-2.5 py-1 hover:bg-[#30363d]"
                    onClick={() => engine.current?.view(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {(flagged || notice) && (
              <div
                className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center px-3"
                role="status"
                data-testid="flag-card"
              >
                {flagged && verdict ? (
                  <div className="max-w-md rounded-md bg-[#161b22]/95 px-3 py-2 shadow-lg">
                    <p className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-md px-1.5 py-px text-xs font-bold text-white"
                        style={{ background: cssColor(flagged.color) }}
                      >
                        {`⚑ ${flagged.number}`}
                      </span>
                      <span className="font-semibold">{flagged.type}</span>
                      <span className="text-[#8b949e]">{flagged.objectId.slice(0, 8)}</span>
                    </p>
                    <p className="mt-1">
                      {`Lỗi ${FLAG_NAMES[flagged.errorType] ?? flagged.errorType}`}
                      {verdict.corrected_value && ` → ${verdict.corrected_value}`}
                    </p>
                    {verdict.note && <p className="mt-0.5 text-[#8b949e]">{verdict.note}</p>}
                  </div>
                ) : (
                  <p className="rounded-md bg-[#161b22]/95 px-3 py-2 text-amber-300">{notice}</p>
                )}
              </div>
            )}
            {webcam && info && (
              <HandControl onAction={onGesture} onClose={() => setWebcam(false)} />
            )}
            {(message || !info) && (
              <div
                role={message ? 'alert' : 'status'}
                className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-[#8b949e]"
              >
                {message ? (
                  <p className="rounded-md bg-[#161b22]/90 px-4 py-3 text-rose-300">{message}</p>
                ) : (
                  <p>
                    <Spinner />
                    {loading || !scene ? 'Đang tải scene…' : 'Đang tải point cloud…'}
                  </p>
                )}
              </div>
            )}
            {scene && (
              <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-2.5 bg-[#161b22]/90 px-3 py-2">
                <button
                  type="button"
                  className={`min-w-10 ${dark}`}
                  aria-label={playing ? 'Tạm dừng' : 'Phát'}
                  onClick={() => setPlaying((v) => !v)}
                  data-testid="viewer-play"
                >
                  {playing ? '⏸' : '▶'}
                </button>
                <button
                  type="button"
                  className={dark}
                  aria-label="Frame trước"
                  onClick={() => step(-1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={dark}
                  aria-label="Frame sau"
                  onClick={() => step(1)}
                  data-testid="viewer-next"
                >
                  ›
                </button>
                <input
                  type="range"
                  className="min-w-0 flex-1 accent-teal-500"
                  aria-label="Frame"
                  min={0}
                  max={total - 1}
                  value={info?.index ?? 0}
                  onChange={(e) => {
                    setPlaying(false);
                    show(Number(e.target.value));
                  }}
                />
                <span
                  className="min-w-28 text-right tabular-nums text-[#8b949e]"
                  data-testid="viewer-clock"
                >
                  {info
                    ? `${info.index + 1}/${total} · ${info.seconds.toFixed(1)} s`
                    : `–/${total}`}
                </span>
                <select
                  className={dark}
                  aria-label="Tốc độ phát"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  {SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      {s}×
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {scene && info && revision && showCameras && (
            <CameraStrip
              base={`/projects3d/${projectId}`}
              revision={revision}
              scene={scene}
              index={info.index}
              opened={camera}
              onOpen={setCamera}
              onHide={() => setShowCameras(false)}
            />
          )}
        </div>
        {settings && scene && info && revision && showPanel && (
          <aside
            className="flex shrink-0 flex-col border-t border-line bg-panel lg:w-80 lg:border-t-0 lg:border-l"
            data-testid="viewer-panel"
          >
            <div className="flex gap-2 border-b border-line p-2" role="tablist">
              {(
                [
                  ['review', 'Review'],
                  ['display', 'Hiển thị'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  aria-pressed={tab === id}
                  className="sr-button min-h-8 flex-1 py-1 text-xs"
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="sr-button min-h-8 gap-1.5 px-3 py-1 text-xs"
                title="Ẩn bảng bên phải"
                onClick={() => setShowPanel(false)}
                data-testid="hide-panel"
              >
                <Icon name="eyeOff" />
                Ẩn
              </button>
            </div>
            <div className="min-h-0 flex-1 p-4 lg:overflow-y-auto" role="tabpanel">
              {tab === 'review' ? (
                <ObjectPanel
                  projectId={projectId!}
                  revision={revision}
                  scene={scene}
                  frameIndex={info.index}
                  tracks={tracks}
                  selected={selected}
                  onSelect={setSelected}
                  reviews={reviews}
                  flags={flags}
                  onSaved={(saved) => setReviews((current) => ({ ...current, ...saved }))}
                  onFocus={() => engine.current?.view('perspective')}
                />
              ) : (
                <DisplayPanel
                  scene={scene}
                  settings={settings}
                  info={info}
                  types={types}
                  compensated={project?.metadata?.motion_compensated ?? false}
                  set={set}
                  onResetCamera={() => engine.current?.resetCamera()}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
