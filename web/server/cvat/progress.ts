export interface ScanProgress {
  jobId: number;
  active: boolean;
  percent: number;
  message: string;
  stage: 'init' | 'loading' | 'ai' | 'policy' | 'done' | 'error';
  updatedAt: number;
}

const activeScans = new Map<number, ScanProgress>();

export function setScanProgress(
  jobId: number,
  percent: number,
  message: string,
  stage: ScanProgress['stage'] = 'policy',
) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const progress: ScanProgress = {
    jobId,
    active: stage !== 'done' && stage !== 'error',
    percent: p,
    message,
    stage,
    updatedAt: Date.now(),
  };
  activeScans.set(jobId, progress);

  // If done or error, keep it briefly so in-flight polling receives the final status
  if (stage === 'done' || stage === 'error') {
    setTimeout(() => {
      const current = activeScans.get(jobId);
      if (current && current.updatedAt === progress.updatedAt) {
        activeScans.delete(jobId);
      }
    }, 8000);
  }
}

export function getScanProgress(jobId: number): ScanProgress | null {
  return activeScans.get(jobId) || null;
}

export function clearScanProgress(jobId: number) {
  activeScans.delete(jobId);
}
