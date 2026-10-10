import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ReadableStream } from 'node:stream/web';
import type { RemoteStorage } from './remote.ts';

const API = 'https://api.dropboxapi.com',
  CONTENT = 'https://content.dropboxapi.com';
const CHUNK = 8 * 1024 * 1024;
const EMPTY = new Uint8Array(0);

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
async function failure(res: Response, action: string) {
  return new Error(`Dropbox ${action} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
}
async function notFound(res: Response) {
  if (res.status !== 409) return false;
  const text = await res.clone().text();
  return text.includes('not_found');
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
        headers['dropbox-api-arg'] = JSON.stringify(call.arg);
        if (call.body) {
          headers['content-type'] = 'application/octet-stream';
          body = call.body;
        }
      }
      const res = await fetch(url, { method: 'POST', headers, body });
      const retry =
        res.status === 401 ? attempt === 0 : (res.status === 429 || res.status >= 500) && attempt < 4;
      if (!retry) return res;
      if (res.status === 401) this.token = null;
      else await sleep((Number(res.headers.get('retry-after')) || 2 ** attempt) * 1000);
      await res.body?.cancel();
    }
  }
  // Upload sessions have no 150 MB cap, so every file takes the same path.
  async upload(key: string, file: string) {
    const handle = await fs.open(file);
    try {
      const session = `${CONTENT}/2/files/upload_session`;
      const start = await this.request(`${session}/start`, { arg: { close: false }, body: EMPTY });
      if (!start.ok) throw await failure(start, 'upload');
      const { session_id } = (await start.json()) as { session_id: string };
      const buffer = new Uint8Array(CHUNK);
      let offset = 0;
      for (;;) {
        const { bytesRead } = await handle.read(buffer, 0, CHUNK, offset);
        if (!bytesRead) break;
        const res = await this.request(`${session}/append_v2`, {
          arg: { cursor: { session_id, offset }, close: false },
          body: buffer.subarray(0, bytesRead),
        });
        if (!res.ok) throw await failure(res, 'upload');
        await res.body?.cancel();
        offset += bytesRead;
      }
      const finish = await this.request(`${session}/finish`, {
        arg: {
          cursor: { session_id, offset },
          commit: { path: '/' + key, mode: 'overwrite', mute: true },
        },
        body: EMPTY,
      });
      if (!finish.ok) throw await failure(finish, 'upload');
      await finish.body?.cancel();
    } finally {
      await handle.close();
    }
  }
  async download(key: string, file: string) {
    const res = await this.request(`${CONTENT}/2/files/download`, { arg: { path: '/' + key } });
    if (await notFound(res)) {
      await res.body?.cancel();
      return false;
    }
    if (!res.ok || !res.body) throw await failure(res, 'download');
    await pipeline(Readable.fromWeb(res.body as ReadableStream), createWriteStream(file));
    return true;
  }
  async remove(key: string) {
    const res = await this.request(`${API}/2/files/delete_v2`, { json: { path: '/' + key } });
    if (!res.ok && !(await notFound(res))) throw await failure(res, 'delete');
    await res.body?.cancel();
  }
}
