import { refreshSession } from './api';

// Frame images are served with `no-store`, so every <image> pointing at the same URL used to
// download it again. Each URL is fetched once here and shared as a blob URL.
type Entry = { promise: Promise<string>; url?: string; users: number };
const MAX_IDLE = 24;
const entries = new Map<string, Entry>();

async function load(href: string) {
  let response = await fetch(href, { credentials: 'same-origin' });
  if (response.status === 401) {
    await refreshSession();
    response = await fetch(href, { credentials: 'same-origin' });
  }
  if (!response.ok) throw new Error(`Image request failed (${response.status})`);
  return URL.createObjectURL(await response.blob());
}

// Only images nobody is showing are dropped, oldest first.
function evict() {
  for (const [href, entry] of entries) {
    if (entries.size <= MAX_IDLE) return;
    if (entry.users > 0) continue;
    if (entry.url) URL.revokeObjectURL(entry.url);
    entries.delete(href);
  }
}

export const cachedImage = (href: string) => entries.get(href)?.url;

export function acquireImage(href: string) {
  let entry = entries.get(href);
  if (entry) entries.delete(href);
  else {
    const created: Entry = { promise: load(href), users: 0 };
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
