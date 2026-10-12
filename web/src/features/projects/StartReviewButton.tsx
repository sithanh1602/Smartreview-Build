import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Spinner } from '../../components/Spinner';
import { hint } from '../../lib/englishHints';
import { getDataset, reuseAnswers } from '../../lib/api';
import { preloadImages } from '../../lib/imageCache';
import type { ProjectLayoutContext } from './ProjectLayout';

// The server brings each image back from shared storage the first time it is asked for, which
// is slow. So the wait happens once, here on the button with the rest of the page locked:
// the images of the cases flagged as risky, which are what Review opens, are downloaded into
// the tab's image cache and Review then shows each of them at once. Images without a risky
// case are left for when they are opened.
export function StartReviewButton({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const setLocked = useOutletContext<ProjectLayoutContext | null>()?.setLocked;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  // Leaving the page (signing out, the browser's back button) drops the wait and the lock.
  useEffect(
    () => () => {
      controller.current?.abort();
      setLocked?.(false);
    },
    [setLocked],
  );
  async function start() {
    const prefix = `/projects/${projectId}`;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    setProgress(null);
    setLocked?.(true);
    try {
      const { cases } = await getDataset(abort.signal, 'suspicious', prefix);
      // In Review's own order (highest score on top), so what is needed soonest arrives
      // soonest. A case shows its own frame and, in a track, the frames before and after.
      const images = [...cases]
        .sort((a, b) => b.score - a.score)
        .flatMap((c) => Object.values(c.context).map((o) => o?.image_url))
        .filter((url): url is string => Boolean(url));
      // An image that fails here is reported by Review itself, next to the frame.
      await preloadImages(images, {
        signal: abort.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (abort.signal.aborted) return;
      // Review asks for the same dataset right away: give it the answers just received.
      reuseAnswers();
      navigate(`${prefix}/review`);
    } catch (e) {
      if (abort.signal.aborted) return;
      setError((e as Error).message);
      setBusy(false);
      setLocked?.(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="sr-button mt-7 border-accent/40 text-accent"
        data-busy={busy || undefined}
        disabled={busy}
        onClick={start}
      >
        {busy && <Spinner />}
        {busy ? 'Đang lấy ảnh…' : hint('Start Review →')}
        {busy && progress && (
          <span data-testid="image-progress">
            {progress.done}/{progress.total}
          </span>
        )}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      )}
    </>
  );
}
