import { useEffect, useState } from 'react';
import { request } from '../../lib/api';
import type { Project3D } from '../../types.ts';

type State = { loading: boolean; data: Project3D | null; error: string };
// A 3D project, asked for again every second while its import is running.
export function useProject3D(id: string | undefined) {
  const [state, setState] = useState<State>({ loading: true, data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const data = await request<Project3D>(`/projects3d/${id}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setState({ loading: false, data, error: '' });
        if (!['READY', 'CREATED', 'FAILED'].includes(data.status)) timer = setTimeout(load, 1000);
      } catch (e) {
        if (!controller.signal.aborted)
          setState({ loading: false, data: null, error: (e as Error).message });
      }
    }
    setState({ loading: true, data: null, error: '' });
    load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, attempt]);
  return { ...state, retry: () => setAttempt((a) => a + 1) };
}
