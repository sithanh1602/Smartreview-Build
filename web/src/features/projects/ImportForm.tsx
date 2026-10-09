import { hint } from '../../lib/englishHints';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../../lib/api';
import { statusLabel } from './ProjectLayout';
import { Spinner } from '../../components/Spinner';
import type { Project } from '../../types.ts';

export function ImportForm({
  project,
  onImported,
}: {
  project?: Project | null;
  onImported?: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(project?.name || ''),
    [description, setDescription] = useState(project?.description || ''),
    [format, setFormat] = useState(project?.format || 'cvat-images');
  const [annotation, setAnnotation] = useState<File | null>(null),
    [metadata, setMetadata] = useState<File | null>(null),
    [media, setMedia] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const idRef = useRef(project?.id),
    mounted = useRef(true),
    xhrRef = useRef<XMLHttpRequest | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!annotation || !media.length) {
      setError('Chọn annotation file và các ảnh tương ứng.');
      return;
    }
    if (
      annotation.size > 10 * 1024 * 1024 ||
      (metadata?.size ?? 0) > 10 * 1024 * 1024 ||
      media.length > 1000 ||
      media.some((f) => f.size > 20 * 1024 * 1024) ||
      annotation.size + media.reduce((n, f) => n + f.size, 0) > 200 * 1024 * 1024
    ) {
      setError('Vượt giới hạn: annotation 10 MB; mỗi ảnh 20 MB; tổng 200 MB; tối đa 1000 ảnh.');
      return;
    }
    setBusy(true);
    setUploadProgress(null);
    setMessage('Đang tạo project…');
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      let id = idRef.current;
      if (!id) {
        const p = await request('/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            description,
            format,
          }),
        });
        id = p.id;
        idRef.current = id;
      }
      const form = new FormData();
      await request('/auth/me');
      form.append('annotation', annotation);
      if (metadata) form.append('metadata', metadata);
      for (const f of media)
        form.append(
          'media',
          f,
          f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(1).join('/') : f.name,
        );
      const poll = async () => {
        try {
          const p = await request(`/projects/${id}/import-status`);
          if (mounted.current && ['VALIDATING', 'NORMALIZING', 'ANALYZING'].includes(p.status)) {
            setUploadProgress(100);
            setMessage(statusLabel[p.status]);
          }
        } catch {
          /* Upload response reports authoritative failure. */
        }
      };
      timer = setInterval(poll, 800);
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open('POST', `/api/projects/${id}/import`);
        setMessage('Đang tải dữ liệu lên…');
        xhr.upload.onprogress = (e) => {
          if (mounted.current) {
            const percent = e.lengthComputable
              ? Math.min(100, Math.round((e.loaded / e.total) * 100))
              : null;
            setUploadProgress(percent);
            setMessage(
              percent === 100
                ? 'Đã tải lên. Đang kiểm tra và phân tích dataset…'
                : 'Đang tải dữ liệu lên…',
            );
          }
        };
        xhr.onerror = () =>
          reject(new Error('Kết nối bị ngắt. Mở project để xem trạng thái trước khi thử lại.'));
        xhr.onload = () => {
          let body;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            return reject(new Error('Phản hồi import không hợp lệ.'));
          }
          xhr.status >= 200 && xhr.status < 300
            ? resolve(body)
            : reject(new Error(body.error || 'Import failed.'));
        };
        xhr.send(form);
      });
      if (mounted.current) {
        if (onImported) onImported();
        else navigate(`/projects/${id}`);
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      clearInterval(timer);
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} aria-busy={busy} className="panel max-w-3xl p-6 lg:p-8">
      <fieldset disabled={busy} className="space-y-6">
        {!project && (
          <>
            <label className="block text-sm">
              {hint('Project Name')}
              <input
                aria-label={hint('Project Name')}
                className="field mt-2"
                required
                maxLength={160}
                value={name}
                disabled={!!idRef.current}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              {hint('Description (optional)')}
              <textarea
                aria-label={hint('Description')}
                className="field mt-2"
                maxLength={2000}
                value={description}
                disabled={!!idRef.current}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </>
        )}
        <label className="block text-sm">
          {hint('Annotation Format')}
          <select
            aria-label={hint('Annotation Format')}
            className="field mt-2"
            disabled={!!idRef.current}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="cvat-images">CVAT for images 1.1 · XML</option>
            <option value="coco-detection">COCO Detection · JSON (bbox)</option>
            <option value="smartreview-json">{hint('SmartReview Schema 1.0.0 · JSON')}</option>
          </select>
        </label>
        {format === 'coco-detection' && (
          <p className="text-sm text-muted">
            Chọn COCO JSON chứa images, categories, annotations và bbox [x, y, width, height], cùng
            tất cả ảnh được khai báo. Chỉ kiểm tra bbox; segmentation/keypoints được giữ trong
            metadata, không dùng để kiểm tra. Không nhận COCO prediction hoặc panoptic.
          </p>
        )}
        <p className="text-sm leading-6 text-muted">
          {hint(
            'Dataset đã có annotation, không cần chạy model. Hỗ trợ ảnh PNG, JPEG, WebP, GIF; box, polygon và polyline từ CVAT images. Video/ZIP/SVG và CVAT tracks chưa được hỗ trợ qua upload.',
          )}
        </p>
        <label className="block text-sm">
          {hint('Annotation File')}
          <input
            aria-label={hint('Annotation File')}
            className="field mt-2"
            type="file"
            accept={format === 'cvat-images' ? '.xml' : '.json'}
            onChange={(e) => setAnnotation(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="block text-sm">
          {hint('Image metadata CSV (optional)')}
          <input
            aria-label={hint('Image metadata CSV (optional)')}
            className="field mt-2"
            type="file"
            accept=".csv"
            onChange={(e) => setMetadata(e.target.files?.[0] || null)}
          />
          <span className="mt-1 block text-xs text-muted">
            File như images.csv: mỗi ảnh một dòng, có cột file_name và env_risk (0–1).
          </span>
        </label>
        <label className="block text-sm">
          {hint('Media images')}
          <input
            aria-label={hint('Media images')}
            className="field mt-2"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.gif"
            onChange={(e) => setMedia([...(e.target.files ?? [])])}
          />
        </label>
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">{hint('Dataset có thư mục ảnh con?')}</summary>
          <p className="my-3">
            {hint(
              'Chọn thư mục chứa ảnh thay cho lựa chọn trên. Đường dẫn cần khớp annotation; tên file đơn chỉ được ghép khi duy nhất.',
            )}
          </p>
          <input
            aria-label={hint('Media folder')}
            type="file"
            {...{ webkitdirectory: '' }}
            multiple
            onChange={(e) => setMedia([...(e.target.files ?? [])])}
          />
        </details>
        <p className="text-xs text-muted">
          Đã chọn {media.length}
          {hint(' ảnh · tối đa 1000 ảnh / 200 MB tổng; 20 MB mỗi ảnh; annotation 10 MB.')}
        </p>
        <button className="sr-button border-accent/40 text-accent" type="submit">
          {busy && <Spinner />}
          {busy ? 'Đang xử lý…' : project ? hint('Import Dataset') : hint('Create & Import')}
        </button>
      </fieldset>
      {busy && (
        <div className="mt-5 space-y-3 text-sm text-accent">
          <p role="status">
            <Spinner />
            {message}
          </p>
          {uploadProgress !== null && (
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span>Dữ liệu đã tải lên</span>
                <span>{uploadProgress}%</span>
              </div>
              <progress
                aria-label="Tiến độ tải dữ liệu lên"
                className="h-2 w-full accent-teal-600"
                value={uploadProgress}
                max={100}
              />
            </div>
          )}
          <p className="text-xs text-muted">
            Giữ trang mở đến khi hoàn tất. Sau khi tải lên, hệ thống cần thêm thời gian để kiểm tra
            và phân tích.
          </p>
        </div>
      )}
      {error && (
        <div role="alert" className="mt-5 text-sm text-rose-700">
          {error}
          {idRef.current && (
            <p className="mt-2">
              {hint('Project đã được giữ lại. Bạn có thể chọn lại file và thử import.')}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
