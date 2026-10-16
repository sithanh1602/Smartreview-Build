import { handleCvat } from './cvat/http.ts';
import { handleProjects } from './projects/http.ts';
import { handleProjects3D } from './projects3d/http.ts';
import { handleGuideline } from './guideline/http.ts';
import { handleReview } from './reviews/http.ts';
import { ReviewError, matchesReview } from '../shared/review.ts';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cookie, checkOrigin, handleAuth, SESSION_COOKIE } from './auth/http.ts';
import type { AuthService } from './auth/service.ts';
import type { ProjectService } from './projects/service.ts';
import type { Project3DService } from './projects3d/service.ts';
import type { ReviewStore } from './reviews/store.ts';
import type { Json, LoadedDataset, Req, Res } from './types.ts';

export interface AppOptions {
  dataset?: LoadedDataset | null;
  reviews?: ReviewStore | null;
  distRoot: string;
  projects?: ProjectService | null;
  projects3d?: Project3DService | null;
  auth?: AuthService | null;
  secureCookies?: boolean;
  // Set for requests a project route passed on: the caller's project role is already checked.
  projectScoped?: boolean;
}
const ASSET_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};
const STATIC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};

export function createHandler({
  dataset,
  reviews,
  distRoot,
  projects,
  projects3d,
  auth,
  secureCookies = false,
  projectScoped = false,
}: AppOptions) {
  const json: Json = (res, status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(data));
  };
  return async (req: Req, res: Res): Promise<void> => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (await handleAuth(req, res, url.pathname, { auth, json, secureCookies })) return;
      if (url.pathname === '/api/health' && req.method === 'GET')
        return json(res, 200, { ok: true });
      if (url.pathname.startsWith('/api/')) {
        if (!auth) throw new ReviewError(503, 'Dịch vụ đăng nhập chưa sẵn sàng.');
        req.user = await auth.authenticate(cookie(req, SESSION_COOKIE));
        if (!['GET', 'HEAD'].includes(req.method)) checkOrigin(req);
        // Project routes check the caller's role in that project; everything else (the
        // default dataset, guideline analysis) is the leader's.
        if (
          !projectScoped &&
          !/^\/api\/projects(3d)?(\/|$)/.test(url.pathname) &&
          !/^\/api\/cvat\/scans?(\/|$)/.test(url.pathname) &&
          req.user.role !== 'leader'
        )
          throw new ReviewError(403, 'Chức năng này chỉ dành cho Leader.');
      }
      if (!projectScoped && (await handleGuideline(req, res, url.pathname, { json }))) return;
      if (
        !projectScoped &&
        (await handleCvat(req, res, url.pathname, { json, pool: projects?.pool }))
      )
        return;
      if (!projectScoped && (await handleProjects3D(req, res, url, { projects: projects3d, json })))
        return;
      if (
        await handleProjects(req, res, url, {
          projects,
          json,
          dispatch: (context, request, response) =>
            createHandler({ ...context, distRoot, auth, secureCookies, projectScoped: true })(
              request,
              response,
            ),
        })
      )
        return;
      const p = url.pathname.replace(/^\/api\/risk-cases(?=\/|$)/, '/api/cases');
      if (await handleReview(req, res, p, { dataset, reviews, json })) return;
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        return json(res, 405, { error: 'Read-only API' });
      }
      if (p.startsWith('/api/')) {
        if (!dataset)
          return json(res, 409, {
            error: 'Chưa có dataset mặc định. Mở Projects để tạo và import dataset.',
          });
        if (p === '/api/checks') return json(res, 200, dataset.report.checks);
        if (p === '/api/meta') return json(res, 200, dataset.meta);
        if (p === '/api/annotations') {
          if (url.searchParams.get('dataset') !== dataset.meta.dataset_id)
            throw new ReviewError(409, 'Dataset đã thay đổi. Tải lại trang.');
          const mediaId = url.searchParams.get('media');
          const media = dataset.normalized.media.find((m) => m.id === mediaId);
          if (!media) throw new ReviewError(404, 'Không tìm thấy media.');
          const frameId = url.searchParams.get('frame');
          if (media.type === 'video' && !frameId)
            throw new ReviewError(400, 'Video cần frame cụ thể.');
          const frame = dataset.normalized.frames.find(
            (f) => f.media_id === mediaId && (!frameId || f.id === frameId),
          );
          if (!frame) throw new ReviewError(404, 'Không tìm thấy frame của media này.');
          return json(res, 200, {
            dataset_revision: dataset.meta.dataset_id,
            media_id: mediaId,
            frame_id: frame.id,
            // A suggested missing object is a case, not one of the image's annotations.
            annotations: dataset.allCases
              .filter(
                (c) => c.media_id === mediaId && c.frame_ref === frame.id && !c.missing_object,
              )
              .map((c) => c.context.current),
          });
        }
        if (p === '/api/cases') {
          const level = url.searchParams.get('level') || 'all';
          if (!['all', 'high', 'medium', 'low'].includes(level))
            return json(res, 400, { error: 'Invalid risk level' });
          const status = url.searchParams.get('review_status') || 'all';
          if (!['all', 'unreviewed', 'reviewed', 'ERROR', 'CORRECT', 'UNSURE'].includes(status))
            throw new ReviewError(400, 'Invalid review status.');
          const decisions = reviews ? await reviews.list() : {};
          return json(
            res,
            200,
            (url.searchParams.get('scope') === 'all'
              ? dataset.allCases
              : url.searchParams.get('scope') === 'warnings'
                ? dataset.warningCases
                : dataset.cases
            ).filter(
              (c) =>
                (level === 'all' || c.risk_level === level) &&
                matchesReview(decisions[c.id], status),
            ),
          );
        }
        if (p.startsWith('/api/cases/')) {
          const c = dataset.allCases.find((c) => c.id === decodeURIComponent(p.slice(11)));
          return json(res, c ? 200 : 404, c || { error: 'Case not found' });
        }
        if (p.startsWith('/api/assets/')) {
          if (url.searchParams.get('dataset') !== dataset.meta.dataset_id)
            return json(res, 409, { error: 'Dataset changed. Reload the page.' });
          let key: string;
          try {
            key = decodeURIComponent(p.slice('/api/assets/'.length));
          } catch {
            return json(res, 400, { error: 'Invalid asset ID' });
          }
          const asset = dataset.assets.get(key);
          const data = await dataset.readAsset(key);
          if (!asset || !data) return json(res, 404, { error: 'Frame image unavailable' });
          const type = ASSET_TYPES[path.extname(asset).toLowerCase()];
          res.writeHead(200, {
            'Content-Type': type,
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'; sandbox",
          });
          res.end(req.method === 'HEAD' ? undefined : data);
          return;
        }
        return json(res, 404, { error: 'Unknown API route' });
      }
      let target = path.resolve(distRoot, '.' + decodeURIComponent(p));
      if (!target.startsWith(distRoot + path.sep) && target !== distRoot)
        return json(res, 403, { error: 'Forbidden' });
      if (p === '/') target = path.join(distRoot, 'index.html');
      let data;
      try {
        data = await fs.readFile(target);
      } catch {
        if (path.extname(p)) return json(res, 404, { error: 'Asset not found' });
        try {
          target = path.join(distRoot, 'index.html');
          data = await fs.readFile(target);
        } catch {
          return json(res, 503, { error: 'UI not built. Run npm run build.' });
        }
      }
      const type = STATIC_TYPES[path.extname(target)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (e) {
      if (e instanceof ReviewError) return json(res, e.status, { error: e.message });
      const { code, name, stack } = e as NodeJS.ErrnoException;
      // A connection error names its code; anything else is a bug, so where it happened is shown.
      console.error('Request failed:', code || name, req.method, req.url, code ? '' : stack);
      json(res, 503, { error: 'Không kết nối được dịch vụ dữ liệu. Kiểm tra MySQL rồi thử lại.' });
    }
  };
}

export function createApp(options: AppOptions) {
  if (process.env.NODE_ENV === 'production' && !options.secureCookies)
    throw new Error('Production requires HTTPS and AUTH_COOKIE_SECURE=true.');
  const handler = createHandler(options);
  return http.createServer((req, res) => handler(req as Req, res));
}
