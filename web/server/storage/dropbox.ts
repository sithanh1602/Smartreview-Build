import fs from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import type { RemoteStorage } from './remote.ts';

const API = 'https://api.dropboxapi.com',
  CONTENT = 'https://content.dropboxapi.com';
// finish_batch_v2 accepts at most 1000 entries per call.
const BATCH = 1000;
const PARALLEL = 4;
// A call with no answer after this long is given up and made again.
const TIMEOUT_MS = 5 * 60 * 1000;

interface DropboxOptions {
  appKey: string;
  appSecret: string;
  refreshToken: string;
}
// Content endpoints take their arguments in a header; RPC endpoints take a JSON body.
interface Call {
  arg?: unknown;
  json?: unknown;
  body?: Uint8Array<ArrayBuffer>;
}
// HTTP headers are ASCII, so non-ASCII file names are escaped inside the JSON argument.
const headerJson = (value: unknown) =>
  JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
async function failure(res: Response, action: string) {
  return new Error(`Dropbox ${action} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
}
async function notFound(res: Response) {
  return res.status === 409 && (await res.clone().text()).includes('not_found');
}
export class DropboxStorage implements RemoteStorage {
  name = 'dropbox' as const;
  options: DropboxOptions;
  token: { value: string; expires: number } | null;
  constructor(options: DropboxOptions) {
    this.options = options;
    this.token = null;
  }
  // Access tokens last about four hours; the refresh token in .env mints new ones.
  async accessToken() {
    if (this.token && this.token.expires > Date.now()) return this.token.value;
    const { appKey, appSecret, refreshToken } = this.options;
    const res = await fetch(`${API}/oauth2/token`, {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from(`${appKey}:${appSecret}`).toString('base64'),
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    if (!res.ok) throw await failure(res, 'token refresh');
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
    return this.token.value;
  }
  async request(url: string, call: Call) {
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = {
        authorization: `Bearer ${await this.accessToken()}`,
      };
      let body: string | Uint8Array<ArrayBuffer> | undefined;
      if (call.json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(call.json);
      } else {
        headers['dropbox-api-arg'] = headerJson(call.arg);
        if (call.body) {
          headers['content-type'] = 'application/octet-stream';
          body = call.body;
        }
      }
      let res: Response;
      try {
        res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (e) {
        // The connection dropped or stalled: nothing was answered, so the call is made again.
        if (attempt >= 4) throw e;
        await sleep(2 ** attempt * 1000);
        continue;
      }
      const retry =
        res.status === 401 ? attempt === 0 : (res.status === 429 || res.status >= 500) && attempt < 4;
      if (!retry) return res;
      if (res.status === 401) this.token = null;
      else await sleep((Number(res.headers.get('retry-after')) || 2 ** attempt) * 1000);
      await res.body?.cancel();
    }
  }
  async write(key: string, data: Uint8Array<ArrayBuffer>) {
    const res = await this.request(`${CONTENT}/2/files/upload`, {
      arg: { path: '/' + key, mode: 'overwrite', mute: true },
      body: data,
    });
    if (!res.ok) throw await failure(res, 'upload');
    await res.body?.cancel();
  }
  // Parallel single-file uploads fight over one namespace lock. Sessions upload the bytes in parallel
  // and a batch finish commits them under a single lock.
  async uploadFiles(files: { key: string; file: string }[]) {
    const entries: unknown[] = [];
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const { key, file } = files[next++];
        const data = await fs.readFile(file);
        const res = await this.request(`${CONTENT}/2/files/upload_session/start`, {
          arg: { close: true },
          body: data,
        });
        if (!res.ok) throw await failure(res, 'upload');
        const { session_id } = (await res.json()) as { session_id: string };
        entries.push({
          cursor: { session_id, offset: data.length },
          commit: { path: '/' + key, mode: 'overwrite', mute: true },
        });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    for (let i = 0; i < entries.length; i += BATCH) {
      const res = await this.request(`${API}/2/files/upload_session/finish_batch_v2`, {
        json: { entries: entries.slice(i, i + BATCH) },
      });
      if (!res.ok) throw await failure(res, 'upload commit');
      const result = (await res.json()) as { entries: { '.tag': string }[] };
      const failed = result.entries.find((e) => e['.tag'] !== 'success');
      if (failed)
        throw new Error('Dropbox upload commit failed: ' + JSON.stringify(failed).slice(0, 300));
    }
  }
  async read(key: string) {
    const res = await this.request(`${CONTENT}/2/files/download`, { arg: { path: '/' + key } });
    if (await notFound(res)) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok) throw await failure(res, 'download');
    return Buffer.from(await res.arrayBuffer());
  }
  async remove(key: string) {
    const res = await this.request(`${API}/2/files/delete_v2`, { json: { path: '/' + key } });
    if (!res.ok && !(await notFound(res))) throw await failure(res, 'delete');
    await res.body?.cancel();
  }
}
