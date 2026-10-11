import { hint } from '../../lib/englishHints';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../../lib/api';
import { statusLabel } from './ProjectLayout';
import { Spinner } from '../../components/Spinner';
import { Icon } from '../../components/Icon';
import { ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { GuidelineAnalysis } from './GuidelineAnalysis';
import type { Choices } from './GuidelineAnalysis';
import type { GuidelineExtraction } from '../../../server/guideline/model-call.ts';
import { GUIDELINE_TYPES, guidelineText as readText } from './guidelineText';
import { IMAGE_TYPES, LIMITS, inspectAnnotation, readPack } from './dataset';
import type { Format, Inspection, Pack, Signal } from './dataset';
import type { Project } from '../../types.ts';

type Source = 'files' | 'zip';
const FORMATS: Record<Format, string> = {
  'cvat-images': 'CVAT for images 1.1 · XML',
  'coco-detection': 'COCO Detection · JSON (bbox)',
  'smartreview-json': 'SmartReview Schema 1.0.0 · JSON',
};
const SIGNALS: [Signal, string][] = [
  ['confidence', 'Độ tin cậy (confidence / score)'],
  ['top2_label', 'Lớp xếp thứ hai (top-2)'],
  ['top2_score', 'Điểm của lớp thứ hai'],
  ['env_risk', 'Rủi ro môi trường (env_risk)'],
];
const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + ' MB';

// Shows where the optional signals were found, so a wrong or missing field is seen before upload.
function SignalReport({ inspection, table }: { inspection: Inspection; table: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-slate-50 p-4 text-sm" data-testid="signals">
      <p className="eyebrow mb-1">Trường nhận diện được</p>
      <p className="mb-3 text-xs text-muted">
        Tìm ở mọi tầng của từng nhãn (tối đa 4 tầng); trường gần nhãn nhất được dùng.
      </p>
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
        {SIGNALS.map(([kind, label]) => {
          const found = inspection.signals[kind];
          if (kind === 'env_risk' && !found && !table) return null;
          return (
            <React.Fragment key={kind}>
              <dt className="text-muted">{label}</dt>
              <dd className="min-w-0 break-words">
                {found ? (
                  <>
                    <code className="rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
                      {found.path}
                    </code>
                    <span className="ml-2 text-xs text-muted">
                      {found.count}/{found.of}
                    </span>
                  </>
                ) : kind === 'env_risk' ? (
                  <span className="text-muted">Lấy từ CSV thông tin ảnh</span>
                ) : (
                  <span className="text-muted">Không tìm thấy</span>
                )}
              </dd>
            </React.Fragment>
          );
        })}
      </dl>
      {!inspection.signals.confidence && (
        <p className="mt-3 text-xs text-muted">
          Không có độ tin cậy thì các kiểm tra dựa trên điểm số sẽ không chạy; các kiểm tra hình học
          và nhãn vẫn chạy.
        </p>
      )}
    </div>
  );
}

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
    [format, setFormat] = useState<Format>((project?.format as Format) || 'cvat-images');
  const [source, setSource] = useState<Source>('files'),
    [pack, setPack] = useState<Pack | null>(null),
    [archive, setArchive] = useState<File | null>(null),
    [reading, setReading] = useState(false),
    [inspection, setInspection] = useState<Inspection | null>(null);
  // A project's own guideline changes what the policy checks should enforce, so it is opt-in.
  const [ownGuideline, setOwnGuideline] = useState(false),
    [guidelineFile, setGuidelineFile] = useState<File | null>(null),
    [guidelineText, setGuidelineText] = useState('');
  const reviewed = useRef<{ result: GuidelineExtraction; choices: Choices } | null>(null);
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
  const latest = useRef(0);
  async function chooseAnnotation(file: File | null) {
    setAnnotation(file);
    setInspection(null);
    const turn = ++latest.current;
    if (!file || file.size > LIMITS.annotation) return;
    const found = inspectAnnotation(file.name, await file.text());
    if (mounted.current && turn === latest.current) setInspection(found);
  }
  async function chooseArchive(file: File | null, choice?: string) {
    setArchive(file);
    setError('');
    const turn = ++latest.current;
    if (!file) return setPack(null);
    setReading(true);
    try {
      const next = await readPack(file, idRef.current ? format : undefined, choice);
      if (!mounted.current || turn !== latest.current) return;
      setPack(next);
      setFormat(next.inspection.format);
    } catch (e) {
      if (!mounted.current || turn !== latest.current) return;
      setPack(null);
      setError((e as Error).message);
    } finally {
      if (mounted.current && turn === latest.current) setReading(false);
    }
  }
  function changeSource(next: Source) {
    latest.current++;
    setSource(next);
    setError('');
  }
  const zipped = source === 'zip',
    shown = zipped ? (pack?.inspection ?? null) : inspection,
    packBytes = pack?.images.reduce((n, i) => n + i.entry.size, 0) ?? 0;
  // The text the analysis reads: the chosen file, else the pasted text, else the archive's file.
  const packed = zipped ? (pack?.guideline ?? null) : null,
    guidelineName = guidelineFile?.name ?? (guidelineText.trim() ? '' : (packed?.name ?? null)),
    readGuideline =
      guidelineName === null
        ? null
        : async () =>
            guidelineFile
              ? readText(guidelineFile.name, guidelineFile)
              : guidelineText.trim() || readText(packed!.name, await packed!.blob());
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (zipped ? !pack : !annotation || !media.length) {
      setError(
        zipped
          ? 'Chọn tệp nén chứa tệp nhãn và ảnh.'
          : 'Chọn annotation file và các ảnh tương ứng.',
      );
      return;
    }
    if (zipped && pack!.missing.length) {
      setError('Tệp nén thiếu ảnh mà tệp nhãn tham chiếu. Bổ sung ảnh rồi chọn lại tệp nén.');
      return;
    }
    const sizes = zipped ? pack!.images.map((i) => i.entry.size) : media.map((f) => f.size),
      chosen = zipped ? pack!.annotation : annotation!,
      table = zipped ? pack!.metadata : metadata;
    if (
      chosen.size > LIMITS.annotation ||
      (table?.size ?? 0) > LIMITS.annotation ||
      sizes.length > LIMITS.images ||
      sizes.some((n) => n > LIMITS.image) ||
      chosen.size + sizes.reduce((n, size) => n + size, 0) > LIMITS.total
    ) {
      setError('Vượt giới hạn: annotation 10 MB; mỗi ảnh 20 MB; tổng 200 MB; tối đa 1000 ảnh.');
      return;
    }
    const pasted = guidelineText.trim();
    if (ownGuideline && !guidelineFile && !pasted && !(zipped && pack!.guideline)) {
      setError('Chọn tệp hoặc nhập nội dung guideline/policy, hoặc bỏ đánh dấu mục này.');
      return;
    }
    if (ownGuideline && (guidelineFile?.size ?? pasted.length) > LIMITS.annotation) {
      setError('Guideline/policy tối đa 10 MB.');
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
      form.append('annotation', chosen);
      if (table) form.append('metadata', table);
      if (ownGuideline) {
        const inPack = zipped && !guidelineFile && !pasted ? pack!.guideline : null;
        if (guidelineFile) form.append('guideline', guidelineFile);
        else if (pasted) form.append('guideline', new File([pasted], 'guideline.md'));
        else if (inPack)
          form.append('guideline', await inPack.blob(), inPack.name.split('/').pop()!);
      }
      if (ownGuideline && reviewed.current) {
        const { result, choices } = reviewed.current;
        form.append(
          'guideline_rules',
          new File([JSON.stringify({ ...result, choices }, null, 2)], 'rules.json'),
        );
      }
      if (zipped) {
        setMessage('Đang giải nén ảnh…');
        for (const image of pack!.images)
          form.append('media', await image.entry.blob(), image.name);
      } else
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
        <div>
          <p className="mb-2 text-sm">Nguồn dữ liệu</p>
          {/* Multiple-selection mode keeps these as pressed buttons; one stays selected. */}
          <ToggleButtonGroup
            selectionMode="multiple"
            aria-label="Nguồn dữ liệu"
            isDisabled={busy}
            selectedKeys={new Set([source])}
            onSelectionChange={(keys) => {
              const next = [...keys].find((k) => k !== source);
              if (next) changeSource(next as Source);
            }}
          >
            <ToggleButton id="files">Tệp rời</ToggleButton>
            <ToggleButton id="zip">Tệp nén (.zip)</ToggleButton>
          </ToggleButtonGroup>
          <p className="mt-2 text-xs text-muted">
            {zipped
              ? 'Một tệp .zip chứa tệp nhãn, ảnh và (nếu có) CSV thông tin ảnh, guideline. Tệp được mở ngay trên trình duyệt; máy chủ chỉ nhận từng tệp bên trong.'
              : 'Chọn riêng tệp nhãn, ảnh và (nếu có) CSV thông tin ảnh.'}
          </p>
        </div>
        <label className="block text-sm">
          {hint('Annotation Format')}
          <select
            aria-label={hint('Annotation Format')}
            className="field mt-2"
            disabled={!!idRef.current || zipped}
            value={format}
            onChange={(e) => setFormat(e.target.value as Format)}
          >
            <option value="cvat-images">{FORMATS['cvat-images']}</option>
            <option value="coco-detection">{FORMATS['coco-detection']}</option>
            <option value="smartreview-json">{hint(FORMATS['smartreview-json'])}</option>
          </select>
          {zipped && (
            <span className="mt-1 block text-xs text-muted">
              Tự nhận diện từ tệp nhãn trong tệp nén.
            </span>
          )}
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
            'Dataset đã có annotation, không cần chạy model. Hỗ trợ ảnh PNG, JPEG, WebP, GIF; box, polygon và polyline từ CVAT images. Video/SVG và CVAT tracks chưa được hỗ trợ qua upload.',
          )}
        </p>
        {zipped ? (
          <>
            <label className="block text-sm">
              Tệp nén dataset (.zip)
              <input
                aria-label="Tệp nén dataset (.zip)"
                className="field mt-2"
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => chooseArchive(e.target.files?.[0] ?? null)}
              />
            </label>
            {reading && (
              <p role="status" className="text-sm text-accent">
                <Spinner />
                Đang đọc tệp nén…
              </p>
            )}
            {pack && !reading && (
              <div
                className="rounded-lg border border-line bg-slate-50 p-4 text-sm"
                data-testid="pack"
              >
                <p className="eyebrow mb-3">Tìm thấy trong tệp nén</p>
                <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted">{hint('Annotation File')}</dt>
                  <dd className="min-w-0 break-words">
                    {pack.alternatives.length > 1 ? (
                      <select
                        aria-label="Tệp nhãn trong tệp nén"
                        className="field"
                        value={
                          pack.alternatives.find((n) => n === pack.chosen) ?? pack.alternatives[0]
                        }
                        onChange={(e) => chooseArchive(archive, e.target.value)}
                      >
                        {pack.alternatives.map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    ) : (
                      pack.chosen
                    )}
                    <span className="mt-1 block text-xs text-muted">
                      {FORMATS[pack.inspection.format]} · {pack.inspection.annotations} nhãn
                    </span>
                  </dd>
                  <dt className="text-muted">{hint('Media images')}</dt>
                  <dd>
                    {pack.images.length}/{pack.inspection.images.length} ảnh khớp tệp nhãn ·{' '}
                    {megabytes(packBytes)}
                    {pack.unused > 0 && (
                      <span className="mt-1 block text-xs text-muted">
                        {pack.unused} ảnh không được tệp nhãn nhắc tới sẽ bị bỏ qua.
                      </span>
                    )}
                  </dd>
                  <dt className="text-muted">CSV thông tin ảnh</dt>
                  <dd>{pack.metadata ? 'Có (file_name, env_risk)' : 'Không có'}</dd>
                  <dt className="text-muted">Guideline / Policy</dt>
                  <dd className="min-w-0 break-words">
                    {pack.guideline ? pack.guideline.name : 'Không có'}
                    {pack.guideline && !ownGuideline && (
                      <span className="mt-1 block text-xs text-muted">
                        Chưa dùng. Đánh dấu mục Guideline/Policy bên dưới nếu muốn áp dụng.
                      </span>
                    )}
                  </dd>
                </dl>
                {pack.missing.length > 0 && (
                  <div role="alert" className="mt-3 text-rose-700">
                    <p>
                      <Icon name="alert" /> Thiếu {pack.missing.length} ảnh (không có trong tệp nén
                      hoặc trùng tên ở nhiều thư mục):
                    </p>
                    <p className="mt-1 break-words text-xs">
                      {pack.missing.slice(0, 5).join(', ')}
                      {pack.missing.length > 5 && ' …'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <label className="block text-sm">
              {hint('Annotation File')}
              <input
                aria-label={hint('Annotation File')}
                className="field mt-2"
                type="file"
                accept={format === 'cvat-images' ? '.xml' : '.json'}
                onChange={(e) => chooseAnnotation(e.target.files?.[0] ?? null)}
              />
            </label>
            {inspection && inspection.format !== format && !idRef.current && (
              <p className="text-sm text-amber-700">
                Tệp này có dạng {FORMATS[inspection.format]}, khác định dạng đang chọn.{' '}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => setFormat(inspection.format)}
                >
                  Đổi định dạng
                </button>
              </p>
            )}
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
                accept={IMAGE_TYPES.join(',')}
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
          </>
        )}
        {shown && !reading && (
          <SignalReport inspection={shown} table={!!(zipped ? pack?.metadata : metadata)} />
        )}
        <div className="rounded-lg border border-line p-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-teal-600"
              checked={ownGuideline}
              onChange={(e) => setOwnGuideline(e.target.checked)}
            />
            <span>
              <span className="font-semibold">Thêm Guideline / Policy mới</span>
              <span className="mt-1 block text-xs text-muted">
                Chỉ đánh dấu khi dataset này có quy định gán nhãn riêng. Guideline quyết định các
                kiểm tra policy được hiểu thế nào, nên mặc định để trống và dùng policy có sẵn.
              </span>
            </span>
          </label>
          {ownGuideline && (
            <div className="mt-4 space-y-4 border-t border-line pt-4">
              <label className="block text-sm">
                Tệp guideline / policy
                <input
                  aria-label="Tệp guideline / policy"
                  className="field mt-2"
                  type="file"
                  accept={GUIDELINE_TYPES.join(',')}
                  onChange={(e) => setGuidelineFile(e.target.files?.[0] ?? null)}
                />
                <span className="mt-1 block text-xs text-muted">
                  Markdown, TXT, DOCX, PDF hoặc JSON · tối đa 10 MB.
                  {zipped && pack?.guideline && !guidelineFile && !guidelineText.trim()
                    ? ` Để trống thì dùng ${pack.guideline.name} trong tệp nén.`
                    : ''}
                </span>
              </label>
              <label className="block text-sm">
                Hoặc dán nội dung
                <textarea
                  aria-label="Nội dung guideline / policy"
                  className="field mt-2 min-h-28"
                  placeholder="Ví dụ: xe bị che trên 50% không gán nhãn; người đi xe máy gán là person…"
                  value={guidelineText}
                  disabled={!!guidelineFile}
                  onChange={(e) => setGuidelineText(e.target.value)}
                />
              </label>
              <GuidelineAnalysis
                name={(guidelineName ?? '').split('/').pop()}
                onReviewed={(value) => {
                  reviewed.current = value;
                }}
                read={readGuideline}
                stamp={[
                  guidelineFile?.name,
                  guidelineFile?.size,
                  guidelineFile?.lastModified,
                  guidelineText,
                  packed?.name,
                ].join('|')}
                unavailable={
                  guidelineName === null
                    ? 'Chọn tệp hoặc dán nội dung guideline để phân tích.'
                    : undefined
                }
              />
              <p className="flex gap-2 rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-amber-800">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                <span>
                  Guideline được lưu kèm dự án. Chỉ lựa chọn "Theo guideline" ở quy tắc Nới hơn làm
                  đổi cách chấm: check tương ứng được tắt cho các lớp của quy tắc đó. Quy tắc Mới và
                  Chặt hơn mới được ghi lại, chưa chạy. Không chọn gì thì chấm theo policy có sẵn.
                </span>
              </p>
            </div>
          )}
        </div>
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
