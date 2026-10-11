import { DropboxStorage } from './dropbox.ts';

// Keys are relative POSIX paths such as projects/<id>/<uuid>/media/street.png.
export interface RemoteStorage {
  name: 'dropbox';
  write(key: string, data: Uint8Array<ArrayBuffer>): Promise<void>;
  // Commits many local files together. Keys must not differ only by letter case.
  uploadFiles(files: { key: string; file: string }[]): Promise<void>;
  // Resolves null when the key does not exist.
  read(key: string): Promise<Buffer | null>;
  // Removes a file or a whole folder; a missing key is not an error.
  remove(key: string): Promise<void>;
}

export function remoteStorageFromEnv(env = process.env): RemoteStorage | null {
  const kind = env.SMARTREVIEW_REMOTE_STORAGE;
  if (!kind) return null;
  if (kind !== 'dropbox') throw new Error('SMARTREVIEW_REMOTE_STORAGE supports only "dropbox".');
  const appKey = env.DROPBOX_APP_KEY,
    appSecret = env.DROPBOX_APP_SECRET,
    refreshToken = env.DROPBOX_REFRESH_TOKEN;
  if (!appKey || !appSecret || !refreshToken)
    throw new Error('Missing DROPBOX_APP_KEY, DROPBOX_APP_SECRET or DROPBOX_REFRESH_TOKEN.');
  return new DropboxStorage({ appKey, appSecret, refreshToken });
}
