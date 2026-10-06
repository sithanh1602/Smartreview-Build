import { useEffect, useState } from 'react';
import { request } from '../../lib/api';
export function useProject(id) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function load() {
      try {
        const data = await request(`/projects/${id}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setState({ loading: false, data, error: '' });
        if (!['READY', 'CREATED', 'FAILED'].includes(data.status)) timer = setTimeout(load, 700);
      } catch (e) {
        if (!controller.signal.aborted) setState({ loading: false, data: null, error: e.message });
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
