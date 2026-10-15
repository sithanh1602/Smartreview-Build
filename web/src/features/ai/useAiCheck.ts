import { useEffect, useState } from 'react';
import { request } from '../../lib/api';
import type { AiReport } from '../../types.ts';

// The project's latest AI Check: its state, polled while a run is in progress, and how to start one.
export function useAiCheck(projectId: string | undefined) {
  const [report, setReport] = useState<AiReport | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const endpoint = `/projects/${projectId}/ai-check`;
  useEffect(() => {
    if (!projectId) return;
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
  }, [projectId, endpoint, attempt]);
  // Resolves to whether the run started; the failure is left in `error`.
  async function start() {
    setBusy(true);
    setError('');
    try {
      setReport(await request<AiReport>(endpoint, { method: 'POST' }));
      setAttempt((a) => a + 1);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { report, error, busy, start, reload: () => setAttempt((a) => a + 1) };
}
export type AiCheck = ReturnType<typeof useAiCheck>;
