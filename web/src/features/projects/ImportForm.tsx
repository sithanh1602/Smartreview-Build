import { hint } from '../../lib/englishHints';
import { FieldHelp, HelpButton } from '../../components/FieldHelp';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../../lib/api';
import { statusLabel } from './ProjectLayout';
import { Spinner } from '../../components/Spinner';
import { Icon } from '../../components/Icon';
import { ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { GuidelineAnalysis } from './GuidelineAnalysis';
import { ScanChoice } from '../verify/ScanChoice';
import type { ImportPick } from '../verify/ScanChoice';
import type { Reviewed } from './GuidelineAnalysis';
import { GUIDELINE_TYPES, guidelineText as readText } from './guidelineText';
import { FORMAT_INFO } from '../../../core/importers/catalog.ts';
import { IMAGE_TYPES, LIMITS, inspectSources, readPack } from './dataset';
import type { Candidate, Format, Inspection, Pack, Signal } from './dataset';
import type { Project } from '../../types.ts';

type Source = 'files' | 'zip';
const FORMAT_IDS = Object.keys(FORMAT_INFO) as Format[];
const FORMATS = Object.fromEntries(FORMAT_IDS.map((id) => [id, FORMAT_INFO[id].label])) as Record<
  Format,
  string
>;
// What each format's export looks like, shown as help next to the format menu.
const FORMAT_NOTES: Record<Format, string> = {
  'cvat-images': 'Một tệp annotations.xml; box, polygon và polyline.',
  'cvat-video':
    'Một tệp annotations.xml chứa các track; ảnh đặt tên frame_000000, frame_000001… theo số khung hình.',
  'coco-detection':
    'Một tệp JSON chứa images, categories, annotations và bbox [x, y, width, height]. Chỉ kiểm tra bbox; segmentation/keypoints được giữ trong metadata. Không nhận COCO prediction hoặc panoptic.',
  datumaro: 'Một tệp JSON (thường là annotations/default.json) chứa categories và items.',
  'pascal-voc': 'Mỗi ảnh một tệp XML trong thư mục Annotations; chọn tất cả các tệp đó.',
  yolo: 'Mỗi ảnh một tệp .txt cùng tên, kèm obj.names, classes.txt hoặc data.yaml để lấy tên lớp. Toạ độ là tỉ lệ nên cần đủ ảnh để đổi ra pixel.',
  labelme: 'Mỗi ảnh một tệp XML; polygon và bounding_box.',
  kitti: 'Mỗi ảnh một tệp .txt trong label_2, cùng tên với ảnh.',
  mot: 'gt.txt (và labels.txt nếu có); ảnh đặt tên theo số khung hình, ví dụ 000001.jpg.',
  'smartreview-json': 'Một tệp JSON theo Schema 1.0.0 của SmartReview.',
};
const SIGNALS: [Signal, string][] = [
  ['confidence', 'Độ tin cậy (confidence / score)'],
  ['top2_label', 'Lớp xếp thứ hai (top-2)'],
  ['top2_score', 'Điểm của lớp thứ hai'],
  ['env_risk', 'Rủi ro môi trường (env_risk)'],
  ['rescore', 'Điểm chấm lại box của người (rescore)'],
];
const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + ' MB';

// Shows where the optional signals were found, so a wrong or missing field is seen before upload.
function SignalReport({ inspection, table }: { inspection: Inspection; table: boolean }) {
  return (
    <FieldHelp
      className="rounded-lg border border-line bg-slate-50 p-4 text-sm"
      help={
        <>
          <p>Tìm ở mọi tầng của từng nhãn (tối đa 4 tầng); trường gần nhãn nhất được dùng.</p>
          {!inspection.signals.confidence && (
            <p>
              Không có độ tin cậy thì các kiểm tra dựa trên điểm số sẽ không chạy; các kiểm tra hình
              học và nhãn vẫn chạy.
            </p>
          )}
        </>
      }
    >
      <div data-testid="signals">
        <p className="eyebrow mb-3">
          Trường nhận diện được
          <HelpButton />
        </p>
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
          {SIGNALS.map(([kind, label]) => {
            const found = inspection.signals[kind];
            if (kind === 'env_risk' && !found && !table) return null;
            if (kind === 'rescore' && !found) return null;
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
      </div>
    </FieldHelp>
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
  const reviewed = useRef<Reviewed | null>(null);
  const [annotations, setAnnotations] = useState<File[]>([]),
    [metadata, setMetadata] = useState<File | null>(null),
    [media, setMedia] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // The form passed its checks: the person chooses how the labels are scanned, and nothing is
  // created or uploaded until they confirm.
  const [choosing, setChoosing] = useState(false);
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
  // What the picked annotation files hold, by format. A per-image format is many files and a
  // folder may hold more than one set, so the set matching the chosen format is the one
  // uploaded; with no such set the first one is shown so the mismatch can be pointed out.
  const [picked, setPicked] = useState<{ files: File[]; candidates: Candidate[] } | null>(null);
  async function chooseAnnotation(files: File[]) {
    setPicked(null);
    setError('');
    const turn = ++latest.current;
    if (!files.length) return;
    if (files.reduce((n, f) => n + f.size, 0) > LIMITS.annotation)
      return setError('Các tệp nhãn tối đa 10 MB tổng cộng.');
    const sources = await Promise.all(
      files.map(async (f) => ({ name: f.webkitRelativePath || f.name, text: await f.text() })),
    );
    if (!mounted.current || turn !== latest.current) return;
    const { candidates, problem } = inspectSources(sources);
    if (!candidates.length)
      return setError(problem ?? 'Không nhận ra định dạng của tệp nhãn đã chọn.');
    setPicked({ files, candidates });
  }
  useEffect(() => {
    const found = picked?.candidates.find((c) => c.format === format) ?? picked?.candidates[0];
    const kept = new Set(found?.files.map((f) => f.name));
    setInspection(found?.inspection ?? null);
    setAnnotations(picked?.files.filter((f) => kept.has(f.webkitRelativePath || f.name)) ?? []);
  }, [picked, format]);
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
  // With an archive the format is first read from the archive itself. Choosing another one
  // then looks for an annotation set of that format in the same archive, and the choice only
  // takes effect when the archive has one.
  async function changeFormat(next: Format) {
    if (!zipped || !archive) return setFormat(next);
    setError('');
    const turn = ++latest.current;
    setReading(true);
    try {
      const found = await readPack(archive, next);
      if (!mounted.current || turn !== latest.current) return;
      setPack(found);
      setFormat(next);
    } catch {
      if (mounted.current && turn === latest.current)
        setError(`Tệp nén này không có tệp nhãn dạng ${FORMATS[next]}.`);
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
  // Labels without any confidence are scored unless the person picks otherwise in the popup.
  const rescoreByDefault = !!shown && !shown.signals.confidence && !shown.signals.rescore;
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
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (zipped ? !pack : !annotations.length || !media.length) {
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
      chosen = zipped ? pack!.annotations : annotations,
      chosenBytes = chosen.reduce((n, f) => n + f.size, 0),
      table = zipped ? pack!.metadata : metadata;
    if (
      chosenBytes > LIMITS.annotation ||
      (table?.size ?? 0) > LIMITS.annotation ||
      sizes.length > LIMITS.images ||
      sizes.some((n) => n > LIMITS.image) ||
      chosenBytes + sizes.reduce((n, size) => n + size, 0) > LIMITS.total
    ) {
      setError('Vượt giới hạn: annotation 10 MB; mỗi ảnh 20 MB; tổng 200 MB; tối đa 100 ảnh.');
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
    setChoosing(true);
  }
  async function start(pick: ImportPick) {
    setChoosing(false);
    const chosen = zipped ? pack!.annotations : annotations,
      table = zipped ? pack!.metadata : metadata,
      pasted = guidelineText.trim();
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
      for (const f of chosen) form.append('annotation', f, f.webkitRelativePath || f.name);
      if (table) form.append('metadata', table);
      if (ownGuideline) {
        const inPack = zipped && !guidelineFile && !pasted ? pack!.guideline : null;
        if (guidelineFile) form.append('guideline', guidelineFile);
        else if (pasted) form.append('guideline', new File([pasted], 'guideline.md'));
        else if (inPack)
          form.append('guideline', await inPack.blob(), inPack.name.split('/').pop()!);
      }
      if (ownGuideline && reviewed.current) {
        const { result, choices, runs, captions } = reviewed.current;
        form.append(
          'guideline_rules',
          new File([JSON.stringify({ ...result, choices, runs, captions }, null, 2)], 'rules.json'),
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
            setMessage(
              p.progress?.step === 'score'
                ? `Đang chấm điểm box bằng model ${pick.rescore}: ${p.progress.done}/${p.progress.total} ảnh…`
                : statusLabel[p.status],
            );
          }
        } catch {
          /* Upload response reports authoritative failure. */
        }
      };
      timer = setInterval(poll, 800);
      const imported = await new Promise<Project>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open(
          'POST',
          `/api/projects/${id}/import${pick.rescore ? `?rescore=1&model=${encodeURIComponent(pick.rescore)}` : ''}`,
        );
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
      // The scan waits on the server until the import is finished.
      if (pick.scan) {
        setMessage('Đang gửi lựa chọn quét nhãn…');
        try {
          await request(`/projects/${imported.id}/label-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pick.scan),
          });
        } catch (e) {
          throw new Error(
            `Đã nhập dữ liệu nhưng chưa bắt đầu quét nhãn: ${(e as Error).message} Mở project để quét lại.`,
          );
        }
      }
      if (mounted.current) onImported ? onImported() : navigate(`/projects/${imported.id}`);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      clearInterval(timer);
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      aria-busy={busy}
      className="panel max-w-3xl overflow-visible p-6 lg:p-8"
    >
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
        <FieldHelp
          help={
            <p>
              {zipped
                ? 'Một tệp .zip chứa tệp nhãn, ảnh và (nếu có) CSV thông tin ảnh, guideline. Tệp được mở ngay trên trình duyệt; máy chủ chỉ nhận từng tệp bên trong.'
                : 'Chọn riêng tệp nhãn, ảnh và (nếu có) CSV thông tin ảnh.'}
            </p>
          }
        >
          <p className="mb-2 text-sm">
            Nguồn dữ liệu
            <HelpButton />
          </p>
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
        </FieldHelp>
        <FieldHelp
          help={
            <>
              <p>
                {hint(
                  'Dataset đã có annotation, không cần chạy model. Nhận các định dạng CVAT xuất ra có box, polygon hoặc polyline; ảnh PNG, JPEG, WebP, GIF. Chưa nhận mask, keypoint, cuboid và tệp video.',
                )}
              </p>
              <p>{FORMAT_NOTES[format]}</p>
              {zipped && (
                <p>
                  Khi chọn tệp nén, định dạng được tự nhận diện từ tệp nhãn bên trong. Đổi ở đây nếu
                  tệp nén có nhiều bộ nhãn và bạn muốn dùng bộ khác.
                </p>
              )}
            </>
          }
        >
          <label className="block text-sm">
            {hint('Annotation Format')}
            <HelpButton />
            <select
              aria-label={hint('Annotation Format')}
              className="field mt-2"
              disabled={!!idRef.current || reading}
              value={format}
              onChange={(e) => changeFormat(e.target.value as Format)}
            >
              {FORMAT_IDS.map((id) => (
                <option key={id} value={id}>
                  {hint(FORMATS[id])}
                </option>
              ))}
            </select>
          </label>
        </FieldHelp>
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
                        value={pack.chosen.key}
                        onChange={(e) => chooseArchive(archive, e.target.value)}
                      >
                        {pack.alternatives.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      pack.chosen.label
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
                multiple={FORMAT_INFO[format].multiple}
                accept={FORMAT_INFO[format].extensions.join(',')}
                onChange={(e) => chooseAnnotation([...(e.target.files ?? [])])}
              />
              {FORMAT_INFO[format].multiple && (
                <span className="mt-1 block text-xs text-muted" data-testid="annotation-count">
                  Đã chọn {annotations.length} tệp nhãn
                </span>
              )}
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
            <FieldHelp
              help={
                <p>File như images.csv: mỗi ảnh một dòng, có cột file_name và env_risk (0–1).</p>
              }
            >
              <label className="block text-sm">
                {hint('Image metadata CSV (optional)')}
                <HelpButton />
                <input
                  aria-label={hint('Image metadata CSV (optional)')}
                  className="field mt-2"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setMetadata(e.target.files?.[0] || null)}
                />
              </label>
            </FieldHelp>
            <FieldHelp help={<p>Tối đa 100 ảnh / 200 MB tổng; 20 MB mỗi ảnh; annotation 10 MB.</p>}>
              <label className="block text-sm">
                {hint('Media images')}
                <HelpButton />
                <input
                  aria-label={hint('Media images')}
                  className="field mt-2"
                  type="file"
                  multiple
                  accept={IMAGE_TYPES.join(',')}
                  onChange={(e) => setMedia([...(e.target.files ?? [])])}
                />
              </label>
            </FieldHelp>
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
            <p className="text-xs text-muted" data-testid="media-count">
              Đã chọn {media.length} ảnh
            </p>
          </>
        )}
        {shown && !reading && (
          <SignalReport inspection={shown} table={!!(zipped ? pack?.metadata : metadata)} />
        )}
        <div className="rounded-lg border border-line p-4">
          {/* The help belongs to the heading only: wrapped around the whole block it opened
              below everything and came up while the guideline text was being typed. */}
          <FieldHelp
            className="-mr-4 pr-4"
            help={
              <>
                <p>
                  Chỉ đánh dấu khi dataset này có quy định gán nhãn riêng. Guideline quyết định các
                  kiểm tra policy được hiểu thế nào, nên mặc định để trống và dùng policy có sẵn.
                </p>
                <p>Markdown, TXT, DOCX, PDF hoặc JSON · tối đa 10 MB.</p>
                <p>
                  Guideline được lưu kèm dự án. Chỉ lựa chọn "Theo guideline" ở quy tắc Nới hơn làm
                  đổi cách chấm: check tương ứng được tắt cho các lớp của quy tắc đó. Quy tắc Mới và
                  Chặt hơn mới được ghi lại, chưa chạy. Không chọn gì thì chấm theo policy có sẵn.
                </p>
              </>
            }
          >
            <div className="flex items-center text-sm">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="size-4 accent-teal-600"
                  checked={ownGuideline}
                  onChange={(e) => setOwnGuideline(e.target.checked)}
                />
                <span className="font-semibold">Thêm Guideline / Policy mới</span>
              </label>
              <HelpButton />
            </div>
          </FieldHelp>
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
                {zipped && pack?.guideline && !guidelineFile && !guidelineText.trim() && (
                  <span className="mt-1 block text-xs text-muted">
                    {`Để trống thì dùng ${pack.guideline.name} trong tệp nén.`}
                  </span>
                )}
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
            Giữ trang mở đến khi dữ liệu tải lên xong và được kiểm tra. Phần còn lại (đưa lên kho
            lưu trữ, lưu kết quả) chạy nền, bạn không cần chờ ở đây.
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
      {choosing && (
        <ScanChoice
          rescoreByDefault={rescoreByDefault}
          onConfirm={start}
          onCancel={() => setChoosing(false)}
        />
      )}
    </form>
  );
}
