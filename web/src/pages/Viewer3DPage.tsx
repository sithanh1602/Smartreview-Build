import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { Spinner } from '../components/Spinner';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageToggle } from '../components/LanguageToggle';
import { AccountMenu } from '../features/auth/AuthGate';
import { request, requestBytes } from '../lib/api';
import { useProject3D } from '../features/projects3d/useProject3D';
import { useHandoff3D } from '../features/handoff/Handoff3D';
import { PointCloudEngine } from '../features/projects3d/viewer/engine';
import { BACKGROUND, BOX_COLORS, cssColor } from '../features/projects3d/viewer/colors';
import { Swatch } from '../features/projects3d/viewer/controls';
import { CameraStrip, CameraView } from '../features/projects3d/viewer/Cameras';
import { DisplayPanel } from '../features/projects3d/viewer/DisplayPanel';
import { ObjectPanel } from '../features/projects3d/viewer/ObjectPanel';
import { nextIssue } from '../features/projects3d/viewer/RiskQueue';
import { HandControl } from '../features/projects3d/viewer/HandControl';
import { Pin } from '../features/projects3d/viewer/Pin';
import {
  FLAG_NAMES,
  ISSUE_NAMES,
  PIN_COLORS,
  SEVERITY_NAMES,
  boxKey,
  flagsOf,
  issuesOf,
  sunkBoxes,
} from '../features/projects3d/viewer/flags';
import type { Risk } from '../features/projects3d/viewer/flags';
import type { Action, Reading } from '../features/projects3d/viewer/gestures';
import type {
  FrameInfo,
  Scene3D,
  ViewPreset,
  ViewSettings,
} from '../features/projects3d/viewer/engine';
import type { Review } from '../types.ts';
import type { Risk3DReport } from '../../core/risk3d/engine.ts';

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
// A coordinate with its sign: + ahead or to the left of the vehicle, − behind or to the right.
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
const dark = 'rounded-md border border-[#30363d] bg-[#21262d] px-2.5 py-1';

// The 3D review workspace: the point cloud with its cuboids, under it the frames of the segment
// as a row of small pictures, and on the right the selected cuboid with its review, or what
// the viewer draws.
export function Viewer3DPage() {
  const { projectId } = useParams();
  const { data: project, error: projectError, loading } = useProject3D(projectId);
  const [scene, setScene] = useState<Scene3D | null>(null),
    [reviews, setReviews] = useState<Record<string, Review>>({}),
    // The 3D Risk Engine's cases and warnings by box key; none for a project imported before
    // the engine.
    [risks, setRisks] = useState<Record<string, Risk>>({}),
    [report, setReport] = useState<Risk3DReport | null>(null),
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
    // The issue a held finger count is calling up, before it opens.
    [calling, setCalling] = useState<number | null>(null),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<PointCloudEngine | null>(null);
  const ready = project?.status === 'READY',
    revision = project?.metadata?.dataset_id;
  // Decisions are the reviewers', and are locked while a round is with the annotators.
  const { sent } = useHandoff3D(projectId!, ready);
  const locked =
    project?.my_role === 'annotator'
      ? 'Bạn là Annotator: trình xem chỉ để xem cuboid cần sửa và quyết định của Reviewer.'
      : sent?.handoff?.status === 'SENT'
        ? 'Review đã gửi cho Annotator nên quyết định đang bị khoá. Mở lại review ở trang project để sửa.'
        : undefined;
  // A link from the list of fixes names the frame and the object to open.
  const [params] = useSearchParams();
  const asked = useRef(false);
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
      // Without the report the viewer still works, only without the engine's flags.
      request<Risk3DReport>(`/projects3d/${projectId}/risk`, { signal: c.signal }).catch(
        () => null,
      ),
    ])
      .then(([loaded, saved, report]) => {
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
          distance: true,
          orientation: true,
          sensors: true,
          lasers: Object.fromEntries(loaded.lasers.map((l) => [l.name, true])),
          types: {},
        });
        setReviews(saved.reviews);
        setReport(report);
        setRisks(
          Object.fromEntries([
            ...(report?.warnings.map((r) => [r.id, { ...r, warning: true }]) ?? []),
            ...(report?.cases.map((r) => [r.id, r]) ?? []),
          ]),
        );
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
  useEffect(() => {
    engine.current?.setRisks(risks);
  }, [risks, scene]);
  // Every issue of the segment with its number; the pins in the point cloud carry the same.
  const issues = useMemo(
    () => (scene ? issuesOf(scene.frames, report, reviews) : []),
    [scene, report, reviews],
  );
  const numbers = useMemo(() => new Map(issues.map((i) => [i.key, i.number])), [issues]);
  const sunk = useMemo(
    () => (scene ? sunkBoxes(scene.frames, report) : new Set<string>()),
    [scene, report],
  );
  useEffect(() => {
    engine.current?.setSunk(sunk);
  }, [sunk, scene]);
  useEffect(() => {
    engine.current?.setNumbers(numbers);
  }, [numbers, scene]);
  // Where the issues are along the segment, for the marks over the frame slider.
  const marks = useMemo(() => {
    const byFrame = new Map<number, typeof issues>();
    for (const issue of issues)
      byFrame.set(issue.frame, [...(byFrame.get(issue.frame) ?? []), issue]);
    return [...byFrame].map(([frame, list]) => ({
      frame,
      list,
      level: list.some((i) => i.kind === 'review' || reviews[i.key]?.decision === 'ERROR')
        ? ('error' as const)
        : list.some((i) => i.case?.severity === 'high')
          ? ('high' as const)
          : ('low' as const),
    }));
  }, [issues, reviews]);
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
  // The selected cuboid in the frame on screen, whose distance the view shows in its corner.
  const measured =
    scene && info && selected
      ? (scene.frames[info.index]?.boxes.find((b) => b.id === selected) ?? null)
      : null;
  // The cuboids of the frame on screen that were reviewed as wrong or the engine doubts, numbered.
  const flags = useMemo(
    () => (scene && info ? flagsOf(scene.frames[info.index], reviews, risks, numbers) : []),
    [scene, info, reviews, risks, numbers],
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
  // Opens a frame with an object selected, from the list of issues or a gesture, and turns
  // the camera to it.
  const open = (frame: number, objectId: string) => {
    setPlaying(false);
    setSelected(objectId);
    setTab('review');
    setShowPanel(true);
    engine.current?.focus(frame, objectId);
    if (frame !== engine.current?.current) show(frame);
  };
  useEffect(() => {
    if (asked.current || !info || !scene || !engine.current) return;
    const frame = Number(params.get('frame')),
      object = params.get('object');
    if (!object || !Number.isInteger(frame) || frame < 0 || frame >= scene.frames.length) return;
    asked.current = true;
    open(frame, object);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, scene, params]);
  // What a gesture seen by the webcam does. Raising fingers calls up the issue with that number,
  // in whichever frame it is.
  const onGesture = (action: Action) => {
    const view = engine.current;
    if (!view) return;
    if (action.type === 'zoom') view.zoom(action.factor);
    else if (action.type === 'pan') view.pan(action.right, action.up);
    else if (action.type === 'flag') {
      const issue = issues.find((i) => i.number === action.number);
      setNotice(issue ? '' : `Không có lỗi số ${action.number}.`);
      if (issue) open(issue.frame, issue.objectId);
    } else {
      // The thumb: to the right the next issue not yet reviewed, to the left the one before.
      if (!issues.length || !scene || !info) return setNotice('Không có lỗi nào để chuyển.');
      const here = selected ? boxKey(scene.frames[info.index].timestamp, selected) : null;
      const at = issues.findIndex((i) => i.key === here);
      const target =
        action.delta === 1
          ? (nextIssue(issues, reviews, here) ?? issues[(at + 1) % issues.length])
          : issues[at <= 0 ? issues.length - 1 : at - 1];
      setNotice('');
      open(target.frame, target.objectId);
    }
  };
  const onReading = (reading: Reading) =>
    setCalling(reading.mode === 'count' && reading.number !== undefined ? reading.number : null);
  const describeIssue = (number: number) => {
    const issue = issues.find((i) => i.number === number);
    return issue
      ? `#${issue.number} · Frame ${pad(issue.frame)} · ${ISSUE_NAMES[issue.errorType] ?? issue.errorType} · ${issue.type}`
      : null;
  };
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  // The flag of the selected cuboid, with what its review or the engine says, shown over the
  // point cloud.
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
    <div className="relative flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
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
              Frame {info ? pad(info.index) : '––––'} / {pad(Math.max(0, total - 1))}
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
                className="pointer-events-none absolute top-2.5 left-2.5 flex flex-col items-start gap-2"
                data-testid="viewer-hud"
              >
                <div className="rounded-md bg-[#161b22]/85 px-3 py-2 leading-relaxed tabular-nums">
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
                {settings?.boxes && settings.distance && measured && (
                  <div
                    className="rounded-md border border-white/40 bg-[#161b22]/90 px-3 py-2 tabular-nums"
                    data-testid="viewer-distance"
                  >
                    <p className="text-[11px] text-[#8b949e]">
                      Khoảng cách tới {measured.type} · {measured.id.slice(0, 5)}
                    </p>
                    <p className="text-lg leading-7 font-semibold text-white">
                      {Math.hypot(measured.center[0], measured.center[1]).toFixed(1)} m
                    </p>
                    <p className="text-xs text-[#d0d7de]">
                      dọc {signed(measured.center[0])} · ngang {signed(measured.center[1])} m
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#8b949e]">
                      Theo mặt đất, từ giữa trục sau xe tới tâm cuboid
                    </p>
                  </div>
                )}
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
                {flagged ? (
                  <div className="max-w-md rounded-md bg-[#161b22]/95 px-3 py-2 shadow-lg">
                    <p className="flex flex-wrap items-center gap-2">
                      <Pin level={flagged.level} number={flagged.number} size={20} />
                      {flagged.number !== undefined && (
                        <span className="font-semibold">Lỗi #{flagged.number}</span>
                      )}
                      <span className="text-[#8b949e] tabular-nums">
                        Frame {info ? pad(info.index) : ''}
                      </span>
                      <span className="font-semibold">{flagged.type}</span>
                      <span className="text-[#8b949e]">{flagged.objectId.slice(0, 8)}</span>
                    </p>
                    {flagged.source === 'review' && verdict ? (
                      <>
                        <p className="mt-1">
                          {`Lỗi ${FLAG_NAMES[flagged.errorType] ?? flagged.errorType}`}
                          {verdict.corrected_value && ` → ${verdict.corrected_value}`}
                        </p>
                        {verdict.note && <p className="mt-0.5 text-[#8b949e]">{verdict.note}</p>}
                      </>
                    ) : (
                      flagged.risk && (
                        <>
                          <p className="mt-1">
                            {flagged.risk.warning
                              ? 'Cảnh báo (không phải lỗi)'
                              : `${ISSUE_NAMES[flagged.errorType] ?? flagged.errorType} · rủi ro ${SEVERITY_NAMES[flagged.risk.severity] ?? flagged.risk.severity} (${flagged.risk.score} điểm)`}
                            {verdict?.decision === 'UNSURE' && ' · đã review: chưa chắc'}
                          </p>
                          <ul className="mt-0.5 list-disc pl-4 text-[#8b949e]">
                            {flagged.risk.reasons.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        </>
                      )
                    )}
                  </div>
                ) : (
                  <p className="rounded-md bg-[#161b22]/95 px-3 py-2 text-amber-300">{notice}</p>
                )}
              </div>
            )}
            {webcam && info && (
              <HandControl
                onAction={onGesture}
                onClose={() => {
                  setWebcam(false);
                  setCalling(null);
                }}
                largest={issues.length}
                describe={describeIssue}
                onReading={onReading}
              />
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
                <div className="relative min-w-0 flex-1">
                  {/* A mark over each frame that has issues, in the colour of the worst one. */}
                  <div
                    className="pointer-events-none absolute inset-x-[7px] -top-3 h-3"
                    data-testid="issue-marks"
                  >
                    {marks.map((mark) => (
                      <button
                        key={mark.frame}
                        type="button"
                        className={`pointer-events-auto absolute w-1.5 -translate-x-1/2 rounded-sm ${mark.list.some((i) => i.number === calling) ? '-top-1.5 h-[18px] animate-pulse ring-2 ring-white' : 'h-3'}`}
                        style={{
                          left: `${total > 1 ? (mark.frame / (total - 1)) * 100 : 0}%`,
                          background: cssColor(PIN_COLORS[mark.level]),
                        }}
                        title={`Frame ${pad(mark.frame)}: lỗi ${mark.list.map((i) => `#${i.number}`).join(', ')}`}
                        aria-label={`Frame ${pad(mark.frame)}: lỗi ${mark.list.map((i) => `#${i.number}`).join(', ')}`}
                        onClick={() => open(mark.frame, mark.list[0].objectId)}
                      />
                    ))}
                  </div>
                  <input
                    type="range"
                    className="w-full accent-teal-500"
                    aria-label="Frame"
                    min={0}
                    max={total - 1}
                    value={info?.index ?? 0}
                    onChange={(e) => {
                      setPlaying(false);
                      show(Number(e.target.value));
                    }}
                  />
                </div>
                <span
                  className="min-w-28 text-right tabular-nums text-[#8b949e]"
                  data-testid="viewer-clock"
                >
                  {info ? `Frame ${pad(info.index)} · ${info.seconds.toFixed(1)} s` : `–/${total}`}
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
            className="flex shrink-0 flex-col border-t border-line bg-panel lg:w-96 lg:border-t-0 lg:border-l 2xl:w-[26rem]"
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
            {/* relative: the panel's sr-only inputs (absolute) stay inside the scrolling box;
                otherwise they sit at their place in the long list and stretch the page. */}
            <div className="relative min-h-0 flex-1 p-4 lg:overflow-y-auto" role="tabpanel">
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
                  report={report}
                  issues={issues}
                  calling={calling}
                  risks={risks}
                  onSaved={(saved) => setReviews((current) => ({ ...current, ...saved }))}
                  locked={locked}
                  onFocus={() => engine.current?.view('perspective')}
                  onOpen={open}
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
