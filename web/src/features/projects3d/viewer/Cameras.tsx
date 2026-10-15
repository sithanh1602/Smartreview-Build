import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/Icon';
import { Spinner } from '../../../components/Spinner';
import { requestBytes } from '../../../lib/api';
import type { Scene3D } from './engine.ts';

// Images fetched through the API become object URLs, so an ended session is handled like for
// any other request. The most recent ones are kept; older ones are released.
function useImage(path: string | null, ahead: string[] = [], keep = 60) {
  const cache = useRef(new Map<string, Promise<string>>());
  const [shown, setShown] = useState<{ path: string; url: string } | null>(null),
    [failed, setFailed] = useState(false);
  const load = (target: string) => {
    const known = cache.current;
    let pending = known.get(target);
    if (pending) known.delete(target);
    else {
      pending = requestBytes(target).then((data) =>
        URL.createObjectURL(new Blob([data], { type: 'image/jpeg' })),
      );
      pending.catch(() => known.delete(target));
    }
    known.set(target, pending);
    for (const [oldest, url] of known) {
      if (known.size <= keep) break;
      known.delete(oldest);
      url.then(URL.revokeObjectURL, () => {});
    }
    return pending;
  };
  useEffect(() => {
    if (!path) return;
    let current = true;
    setFailed(false);
    load(path).then(
      (url) => current && setShown({ path, url }),
      () => current && setFailed(true),
    );
    for (const next of ahead) load(next).catch(() => {});
    return () => {
      current = false;
    };
    // `ahead` follows from `path`.
  }, [path]);
  // The URLs die with the component; the cache is emptied too, so a remount asks again.
  useEffect(
    () => () => {
      const urls = [...cache.current.values()];
      cache.current.clear();
      for (const url of urls) url.then(URL.revokeObjectURL, () => {});
    },
    [],
  );
  // The previous image stays up until the next one has arrived, so playback does not flicker.
  return { url: path ? (shown?.url ?? null) : null, loaded: shown?.path === path, failed };
}

// The cameras of the frame on screen in a row under the point cloud, left to right as they
// look out of the vehicle. The row is one small image holding every camera of the frame; a
// camera's full image is loaded only when its tile is opened.
export function CameraStrip({
  base,
  revision,
  scene,
  index,
  opened,
  onOpen,
  onHide,
}: {
  // The project's API path.
  base: string;
  revision: string;
  scene: Scene3D;
  index: number;
  opened: string | null;
  onOpen: (camera: string | null) => void;
  // Hides the whole row; the page's header brings it back.
  onHide: () => void;
}) {
  const cameras = scene.cameras ?? [];
  const sheet = (i: number) =>
    `${base}/sheets/${scene.frames[i].timestamp}.jpg?dataset=${revision}`;
  const has = (i: number) => (scene.frames[i]?.cameras?.length ?? 0) > 0;
  const { url } = useImage(
    has(index) ? sheet(index) : null,
    [index + 1, index + 2].filter(has).map(sheet),
  );
  if (!cameras.length) return null;
  const present = new Set(scene.frames[index].cameras ?? []);
  return (
    <div className="shrink-0 border-t border-line bg-panel" data-testid="camera-strip">
      <div className="flex items-center justify-between gap-2 px-2 py-1 text-xs">
        <span className="font-semibold">
          Ảnh camera
          <code className="ml-2 text-[11px] font-normal text-muted">camera_image</code>
        </span>
        <button
          type="button"
          className="sr-button min-h-7 gap-1.5 px-3 py-0.5 text-xs"
          onClick={onHide}
          data-testid="hide-cameras"
        >
          <Icon name="eyeOff" />
          Ẩn ảnh camera
        </button>
      </div>
      <ul className="flex justify-center gap-1 overflow-x-auto px-2 pb-1.5">
        {cameras.map((camera, i) => (
          <li key={camera} className="max-w-60 min-w-32 flex-1">
            <button
              type="button"
              aria-label={`Camera ${camera}`}
              aria-pressed={opened === camera}
              disabled={!present.has(camera)}
              className={`relative block aspect-[3/2] w-full overflow-hidden rounded-md border-2 bg-[#0d1117] ${opened === camera ? 'border-accent' : 'border-transparent hover:border-line'}`}
              style={
                url && present.has(camera)
                  ? {
                      backgroundImage: `url(${url})`,
                      backgroundSize: `${cameras.length * 100}% 100%`,
                      backgroundPosition: `${cameras.length > 1 ? (i / (cameras.length - 1)) * 100 : 0}% 0`,
                    }
                  : undefined
              }
              onClick={() => onOpen(opened === camera ? null : camera)}
            >
              <span className="absolute bottom-0 left-0 rounded-tr bg-[#0d1117]/75 px-1.5 py-0.5 text-[11px] text-[#d0d7de]">
                {camera}
              </span>
              {!present.has(camera) && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-[#8b949e]">
                  Không có ảnh
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// One camera's full image over the point cloud. It follows the frame on screen, so it can stay
// open while stepping or playing.
export function CameraView({
  base,
  revision,
  scene,
  index,
  camera,
  onOpen,
}: {
  base: string;
  revision: string;
  scene: Scene3D;
  index: number;
  camera: string;
  onOpen: (camera: string | null) => void;
}) {
  const cameras = scene.cameras ?? [],
    frame = scene.frames[index],
    present = frame.cameras?.includes(camera) ?? false;
  const { url, loaded, failed } = useImage(
    present ? `${base}/cameras/${camera}/${frame.timestamp}.jpg?dataset=${revision}` : null,
    [],
    8,
  );
  const step = (delta: number) =>
    onOpen(cameras[(cameras.indexOf(camera) + delta + cameras.length) % cameras.length]);
  const button = 'rounded-md border border-[#30363d] bg-[#21262d] px-2.5 py-1';
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col bg-[#0d1117]/92"
      role="dialog"
      aria-label={`Camera ${camera}`}
      data-testid="camera-view"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" className={button} aria-label="Camera trước" onClick={() => step(-1)}>
          ‹
        </button>
        <span className="min-w-28 text-center font-semibold">{camera}</span>
        <button type="button" className={button} aria-label="Camera sau" onClick={() => step(1)}>
          ›
        </button>
        {!loaded && present && !failed && (
          <span role="status" className="text-[#8b949e]">
            <Spinner />
            Đang tải ảnh…
          </span>
        )}
        <button
          type="button"
          className={`ml-auto ${button}`}
          aria-label="Đóng ảnh camera"
          onClick={() => onOpen(null)}
        >
          ✕
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-14">
        {failed ? (
          <p role="alert" className="text-rose-300">
            Không tải được ảnh camera này.
          </p>
        ) : !present ? (
          <p className="text-[#8b949e]">Frame này không có ảnh của camera {camera}.</p>
        ) : (
          url && (
            <img
              src={url}
              alt={`Camera ${camera}`}
              className={`max-h-full max-w-full object-contain ${loaded ? '' : 'opacity-60'}`}
            />
          )
        )}
      </div>
    </div>
  );
}
