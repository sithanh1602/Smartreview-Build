import { expired } from './api';

// Frame images are served with `no-store`, so every <image> pointing at the same URL used to
// download it again. Each URL is fetched once here and shared as a blob URL.
type Entry = { promise: Promise<string>; url?: string; bytes: number; users: number };
// Images are kept after their viewer closes so that a whole project, fetched ahead by
// preloadImages(), stays ready. The budget bounds what the tab holds on to.
const MAX_BYTES = 512 * 1024 * 1024;
const entries = new Map<string, Entry>();
let heldBytes = 0;

async function load(href: string, entry: Entry) {
  const response = await fetch(href, { credentials: 'same-origin' });
  if (response.status === 401) expired();
  if (!response.ok) throw new Error(`Image request failed (${response.status})`);
  const blob = await response.blob();
  entry.bytes = blob.size;
  heldBytes += blob.size;
  return URL.createObjectURL(blob);
}

// Only images nobody is showing are dropped, oldest first.
function evict() {
  for (const [href, entry] of entries) {
    if (heldBytes <= MAX_BYTES) return;
    if (entry.users > 0 || !entry.url) continue;
    URL.revokeObjectURL(entry.url);
    heldBytes -= entry.bytes;
    entries.delete(href);
  }
}

export const cachedImage = (href: string) => entries.get(href)?.url;

export function acquireImage(href: string) {
  let entry = entries.get(href);
  if (entry) entries.delete(href);
  else {
    const created: Entry = { promise: Promise.resolve(''), bytes: 0, users: 0 };
    created.promise = load(href, created);
    created.promise.then(
      (url) => {
        created.url = url;
      },
      () => {
        if (entries.get(href) === created) entries.delete(href);
      },
    );
    entry = created;
  }
  entries.set(href, entry);
  entry.users += 1;
  return entry.promise;
}

export function releaseImage(href: string) {
  const entry = entries.get(href);
  if (!entry) return;
  entry.users -= 1;
  evict();
}

// Downloads `hrefs` in order, a few at a time, and leaves them in the cache. It stops early
// when the cache budget is nearly used, because fetching more would only push out the images
// fetched first. Failed images are counted, not retried: their viewer reports them.
export async function preloadImages(
  hrefs: string[],
  {
    signal,
    onProgress,
    concurrency = 4,
  }: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    concurrency?: number;
  },
) {
  const queue = [...new Set(hrefs)];
  const total = queue.length;
  const result = { loaded: 0, failed: 0, skipped: 0 };
  let next = 0;
  async function worker() {
    while (next < total && !signal?.aborted) {
      if (heldBytes > MAX_BYTES * 0.9) return;
      const href = queue[next++];
      try {
        await acquireImage(href);
        result.loaded++;
      } catch {
        result.failed++;
      }
      releaseImage(href);
      if (!signal?.aborted) onProgress?.(result.loaded + result.failed, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  result.skipped = total - result.loaded - result.failed;
  return result;
}
