import React, { useEffect, useRef, useState } from 'react';
import { Spinner } from '../../../components/Spinner';
import { GestureInterpreter } from './gestures.ts';
import type { Action, Reading, RecordedFrame, Recording } from './gestures.ts';

// The hand model: a copy placed in public/models is used when there is one, otherwise it is
// fetched from where MediaPipe publishes it.
const LOCAL_MODEL = '/models/hand_landmarker.task';
const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
async function modelPath() {
  try {
    const found = await fetch(LOCAL_MODEL, { method: 'HEAD' });
    // The dev server answers unknown paths with the app's HTML page.
    if (found.ok && !found.headers.get('content-type')?.includes('text/html')) return LOCAL_MODEL;
  } catch {
    /* No local copy. */
  }
  return REMOTE_MODEL;
}
// Lines of the hand's skeleton, as pairs of landmark numbers.
const BONES = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [5, 9, 10, 11, 12],
  [9, 13, 14, 15, 16],
  [13, 17, 18, 19, 20],
  [0, 17],
];
const MODES: Record<Reading['mode'], string> = {
  none: 'Chưa thấy cử chỉ',
  pan: 'Kéo khung',
  zoom: 'Thu phóng',
  count: 'Gọi lỗi',
  step: 'Chuyển lỗi',
};
const ZOOMS: Record<NonNullable<Reading['zoom']>, string> = {
  in: 'Phóng to',
  out: 'Thu nhỏ',
  still: 'Giữ yên 1 giây để ngắt lệnh',
  released: 'Đã ngắt lệnh thu phóng',
};
// What a recording can be labelled as having been.
const LABELS: [string, string][] = [
  ['zoom_in', 'Phóng to'],
  ['zoom_out', 'Thu nhỏ'],
  ['pan', 'Kéo khung'],
  ['step_right', 'Ngón cái sang phải'],
  ['step_left', 'Ngón cái sang trái'],
  ['thumb_up', 'Ngón cái chỉ lên (số 1)'],
  ['fist', 'Nắm tay'],
  ['count_1_5', 'Đếm 1 tới 5 ngón'],
  ['number_23', 'Nhập số 23 (2 rồi 3)'],
  ['number_20', 'Nhập số 20 (2 rồi nắm tay)'],
  ['none', 'Không làm gì'],
];
// A recording is cut off after this long.
const RECORD_MS = 60_000;
const round = (value: number) => Math.round(value * 1e4) / 1e4;
function download(recording: Recording) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(
    new Blob([JSON.stringify(recording)], { type: 'application/json' }),
  );
  link.download = `hands-${recording.label}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Controls the viewer with hand gestures seen by the webcam. MediaPipe runs in the browser:
// the camera picture is never sent anywhere. The library and its model are loaded only when
// this is switched on. The small picture shows what the camera sees, mirrored, with the hands
// it found and what it reads from them.
export function HandControl({
  onAction,
  onClose,
  largest,
  describe,
  onReading,
}: {
  onAction: (action: Action) => void;
  onClose: () => void;
  // The highest issue number, so a count knows whether a second digit may follow.
  largest: number;
  // A line about the issue with that number, or null when there is none.
  describe: (number: number) => string | null;
  // What the hands are doing, whenever it changes, so the viewer can point at the issue called.
  onReading?: (reading: Reading) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    overlay = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'running' | 'failed'>('loading'),
    [problem, setProblem] = useState(''),
    [reading, setReading] = useState<Reading>({ mode: 'none', count: 0, hold: 0 }),
    [label, setLabel] = useState('zoom_in'),
    [recording, setRecording] = useState(false);
  // The pictures being recorded; null while not recording.
  const tape = useRef<RecordedFrame[] | null>(null);
  function toggleRecording() {
    if (tape.current) {
      if (tape.current.length) download({ label, frames: tape.current });
      tape.current = null;
    } else tape.current = [];
    setRecording(!!tape.current);
  }
  const act = useRef(onAction);
  act.current = onAction;
  const report = useRef(onReading);
  report.current = onReading;
  const interpreter = useRef<GestureInterpreter | null>(null);
  const highest = useRef(largest);
  highest.current = largest;
  useEffect(() => interpreter.current?.setLargest(largest), [largest]);
  const stopTape = useRef(() => {});
  stopTape.current = () => {
    if (tape.current) toggleRecording();
  };
  useEffect(() => {
    let stopped = false,
      frame = 0,
      stream: MediaStream | undefined,
      close: (() => void) | undefined;
    const fail = (text: string) => {
      if (stopped) return;
      setProblem(text);
      setState('failed');
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia)
        return fail('Trình duyệt không cho mở webcam ở địa chỉ này (cần localhost hoặc HTTPS).');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        });
      } catch (e) {
        return fail(
          (e as DOMException).name === 'NotAllowedError'
            ? 'Chưa được cấp quyền dùng webcam. Cho phép trong trình duyệt rồi bật lại.'
            : 'Không mở được webcam. Kiểm tra máy có camera và chưa bị ứng dụng khác giữ.',
        );
      }
      if (stopped) return stream.getTracks().forEach((track) => track.stop());
      const element = video.current!;
      element.srcObject = stream;
      await element.play().catch(() => {});
      let landmarker;
      try {
        const [vision, loader, binary, model] = await Promise.all([
          import('@mediapipe/tasks-vision'),
          import('@mediapipe/tasks-vision/vision_wasm_internal.js?url'),
          import('@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'),
          modelPath(),
        ]);
        const files = { wasmLoaderPath: loader.default, wasmBinaryPath: binary.default };
        const options = (delegate: 'GPU' | 'CPU') => ({
          baseOptions: { modelAssetPath: model, delegate },
          runningMode: 'VIDEO' as const,
          numHands: 2,
        });
        landmarker = await vision.HandLandmarker.createFromOptions(files, options('GPU')).catch(
          () => vision.HandLandmarker.createFromOptions(files, options('CPU')),
        );
      } catch {
        return fail('Không tải được MediaPipe hoặc model bàn tay. Kiểm tra kết nối mạng.');
      }
      close = () => landmarker.close();
      if (stopped) return close();
      setState('running');
      const gestures = new GestureInterpreter();
      gestures.setLargest(highest.current);
      interpreter.current = gestures;
      const context = overlay.current!.getContext('2d')!;
      let last = -1,
        shown = '';
      const tick = () => {
        if (stopped) return;
        frame = requestAnimationFrame(tick);
        // The same camera picture is not analysed twice.
        if (element.readyState < 2 || element.currentTime === last) return;
        last = element.currentTime;
        const now = performance.now();
        const hands = landmarker.detectForVideo(element, now).landmarks;
        const { width, height } = overlay.current!;
        context.clearRect(0, 0, width, height);
        context.lineWidth = 2;
        context.strokeStyle = '#3fc4b4';
        context.fillStyle = '#ffffff';
        for (const hand of hands) {
          for (const bone of BONES) {
            context.beginPath();
            for (const i of bone) context.lineTo(hand[i].x * width, hand[i].y * height);
            context.stroke();
          }
          for (const point of hand)
            context.fillRect(point.x * width - 1.5, point.y * height - 1.5, 3, 3);
        }
        const taping = tape.current;
        if (taping) {
          taping.push({
            t: Math.round(now),
            hands: hands.map((hand) => hand.map((p) => ({ x: round(p.x), y: round(p.y) }))),
          });
          if (now - taping[0].t > RECORD_MS) stopTape.current();
        }
        const result = gestures.update(hands, now);
        for (const action of result.actions) act.current(action);
        // The hold bar moves every picture; the rest is redrawn only when it changes.
        const r = result.reading;
        const key = `${r.mode}:${r.zoom}:${r.count}:${Math.round(r.hold * 20)}:${r.typed?.join('')}:${r.number}:${Math.round((r.wait ?? 0) * 20)}:${r.step}`;
        if (key !== shown) {
          shown = key;
          setReading(r);
          report.current?.(r);
        }
      };
      tick();
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      close?.();
    };
  }, []);
  // The bar fills while a finger count, the thumb, or a still hand letting go of the zoom is
  // being held, and empties while a longer number waits for its next digit.
  const waitingDigit = reading.wait !== undefined;
  const holding = reading.mode === 'count' || reading.mode === 'step' || reading.zoom === 'still';
  const bar = waitingDigit ? 1 - reading.wait! : holding ? reading.hold : 0;
  // What a count calls up: the digits so far and the one held, with a blank for one more.
  const more =
    reading.number !== undefined &&
    reading.number * 10 <= largest &&
    (reading.typed?.length ?? 0) < 2;
  const entered =
    reading.mode === 'count'
      ? `${reading.typed?.join('') ?? ''}${waitingDigit ? '' : reading.count}${more || waitingDigit ? '_' : ''}`
      : '';
  const target = reading.mode === 'count' && reading.number !== undefined ? reading.number : null;
  const line = target === null ? null : describe(target);
  return (
    <div
      className="absolute bottom-14 left-2.5 z-20 w-52 overflow-hidden rounded-md border border-[#30363d] bg-[#161b22]/95 text-xs"
      data-testid="hand-control"
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <span className="font-semibold">Webcam</span>
        <button
          type="button"
          className="rounded px-1.5 hover:bg-[#30363d]"
          aria-label="Tắt webcam"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="relative aspect-[4/3] bg-black">
        {/* Mirrored, so that moving a hand to the right moves it right in the picture. */}
        <video ref={video} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        <canvas
          ref={overlay}
          width={320}
          height={240}
          className="absolute inset-0 h-full w-full -scale-x-100"
        />
        {state !== 'running' && (
          <p
            role={state === 'failed' ? 'alert' : 'status'}
            className={`absolute inset-0 flex items-center justify-center bg-black/70 p-3 text-center ${state === 'failed' ? 'text-rose-300' : 'text-[#8b949e]'}`}
          >
            {state === 'failed' ? (
              problem
            ) : (
              <span>
                <Spinner />
                Đang mở webcam và tải MediaPipe…
              </span>
            )}
          </p>
        )}
      </div>
      {state === 'running' && (
        <div className="px-2 py-1.5" data-testid="hand-reading">
          <p className="flex justify-between gap-2">
            <span data-testid="hand-mode">
              {reading.mode === 'zoom' && reading.zoom ? ZOOMS[reading.zoom] : MODES[reading.mode]}
            </span>
            {reading.mode === 'count' && (
              <span className="font-semibold tabular-nums" data-testid="hand-number">
                #{entered}
              </span>
            )}
            {reading.mode === 'step' && (
              <span className="font-semibold">
                {reading.step === 1 ? 'Lỗi tiếp theo →' : '← Lỗi trước'}
              </span>
            )}
          </p>
          {target !== null && (
            <p
              className={`mt-0.5 truncate ${line ? 'text-[#f0b72f]' : 'text-[#8b949e]'}`}
              data-testid="hand-target"
              title={line ?? undefined}
            >
              {line ?? `Không có lỗi #${target}`}
            </p>
          )}
          {waitingDigit && (
            <p className="mt-0.5 text-[11px] text-[#8b949e]">
              Giơ chữ số tiếp (nắm tay là 0), hoặc giữ nguyên để mở #{reading.number}. Hạ tay để
              huỷ.
            </p>
          )}
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#30363d]">
            <div
              className={`h-full ${waitingDigit ? 'bg-[#8b949e]' : 'bg-[#3fc4b4]'}`}
              style={{ width: `${bar * 100}%` }}
            />
          </div>
        </div>
      )}
      {state === 'running' && (
        <div className="flex items-center gap-1.5 border-t border-[#30363d] px-2 py-1.5">
          <select
            className="min-w-0 flex-1 rounded border border-[#30363d] bg-[#21262d] px-1 py-0.5"
            aria-label="Cử chỉ sẽ ghi"
            value={label}
            disabled={recording}
            onChange={(e) => setLabel(e.target.value)}
          >
            {LABELS.map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`rounded border px-2 py-0.5 font-semibold ${recording ? 'border-rose-400 text-rose-300' : 'border-[#30363d] bg-[#21262d]'}`}
            aria-pressed={recording}
            title="Ghi lại các điểm bàn tay thành tệp JSON để chỉnh và kiểm tra luật cử chỉ"
            onClick={toggleRecording}
            data-testid="hand-record"
          >
            {recording ? '■ Dừng & lưu' : '● Ghi'}
          </button>
        </div>
      )}
      <details className="border-t border-[#30363d] px-2 py-1 text-[11px] text-[#8b949e]">
        <summary className="cursor-pointer">Cử chỉ</summary>
        <ul className="mt-1 space-y-0.5">
          <li>Giơ ngón trỏ, đưa sang trái / phải: kéo khung sang trái / phải</li>
          <li>Giơ ngón trỏ, đưa lên / xuống: kéo khung lên / xuống</li>
          <li>Chụm các ngón rồi bung ra: phóng to</li>
          <li>Từ bàn tay mở, chụm các ngón lại: thu nhỏ</li>
          <li>Thu phóng xong, giữ yên tay 1 giây: ngắt lệnh</li>
          <li>Giơ ngón tay, giữ yên: mở lỗi có mã đó (thấy trước lỗi nào trước khi mở)</li>
          <li>
            Mã từ 10: giơ từng chữ số rồi giữ, ví dụ #23 là 2 ngón rồi 3 ngón; nắm tay là chữ số 0
          </li>
          <li>
            Ngón cái chỉ sang phải / trái, các ngón khác nắm: lỗi chưa review tiếp theo / lỗi trước
          </li>
        </ul>
      </details>
    </div>
  );
}
