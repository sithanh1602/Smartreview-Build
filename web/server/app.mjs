import { handleProjects } from './projects/http.mjs';
import { handleReview } from './reviews/http.mjs';
import { ReviewError, matchesReview } from '../shared/review.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cookie, checkOrigin, handleAuth } from './auth/http.mjs';
export function createHandler({
  dataset,
  reviews,
  distRoot,
  projects,
  auth,
  secureCookies = false,
}) {
  const json = (res, status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(data));
  };
  return async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (await handleAuth(req, res, url.pathname, { auth, json, secureCookies })) return;
      if (url.pathname === '/api/health' && req.method === 'GET')
        return json(res, 200, { ok: true });
      if (url.pathname.startsWith('/api/')) {
        if (!auth) throw new ReviewError(503, 'Dịch vụ đăng nhập chưa sẵn sàng.');
        req.user = await auth.authenticate(cookie(req, 'sr_access'));
        if (!['GET', 'HEAD'].includes(req.method)) checkOrigin(req);
        if (url.pathname === '/api/annotator/home') {
          if (req.user.role !== 'annotator') throw new ReviewError(403, 'Chỉ dành cho annotator.');
          if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
          return json(res, 200, {
            user: req.user,
            message: 'Khu vực annotation đang được phát triển.',
          });
        }
        if (req.user.role !== 'reviewer')
          throw new ReviewError(403, 'Bạn không có quyền truy cập chức năng reviewer.');
      }
      if (
        await handleProjects(req, res, url, {
          projects,
          json,
          dispatch: (context, request, response) =>
            createHandler({ ...context, distRoot, auth, secureCookies })(request, response),
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
      if (!dataset && p.startsWith('/api/'))
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
          annotations: dataset.allCases
            .filter((c) => c.media_id === mediaId && c.frame_ref === frame.id)
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
          (url.searchParams.get('scope') === 'all' ? dataset.allCases : dataset.cases).filter(
            (c) =>
              (level === 'all' || c.risk_level === level) && matchesReview(decisions[c.id], status),
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
        let key;
        try {
          key = decodeURIComponent(p.slice('/api/assets/'.length));
        } catch {
          return json(res, 400, { error: 'Invalid asset ID' });
        }
        const asset = dataset.assets.get(key);
        if (!asset) return json(res, 404, { error: 'Frame image unavailable' });
        const data = await fs.readFile(asset);
        const type = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
        }[path.extname(asset).toLowerCase()];
        res.writeHead(200, {
          'Content-Type': type,
          'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        });
        return res.end(req.method === 'HEAD' ? undefined : data);
      }
      if (p.startsWith('/api/')) return json(res, 404, { error: 'Unknown API route' });
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
      const type =
        {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
        }[path.extname(target)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (e) {
      if (e instanceof ReviewError) return json(res, e.status, { error: e.message });
      console.error('Request failed:', e.code || e.name);
      json(res, 503, { error: 'Không kết nối được dịch vụ dữ liệu. Kiểm tra MySQL rồi thử lại.' });
    }
  };
}

export function createApp(options) {
  if (process.env.NODE_ENV === 'production' && !options.secureCookies)
    throw new Error('Production requires HTTPS and AUTH_COOKIE_SECURE=true.');
  return http.createServer(createHandler(options));
}
