import { FieldHelp, HelpButton } from '../../components/FieldHelp';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { request } from '../../lib/api';
import { readZip } from '../../lib/zip';
import { Spinner } from '../../components/Spinner';
import { Icon } from '../../components/Icon';
import {
  WAYMO_COMPONENTS,
  WAYMO_INFO,
  WAYMO_LIMITS,
  cameraImage,
  orderCameras,
  waymoComponent,
  waymoSegment,
} from '../../../shared/waymo.ts';
import type { WaymoComponent } from '../../../shared/waymo.ts';
import type { Project3D } from '../../types.ts';

type Source = 'files' | 'zip';
const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + ' MB';
// A chosen file, wherever it comes from: picked directly or inside a ZIP.
interface Item {
  path: string;
  size: number;
  blob(): Promise<Blob>;
}
// One parquet file of the segment.
interface Part {
  component: WaymoComponent;
  name: string;
  size: number;
  blob(): Promise<Blob>;
}
// One camera image sent as a loose file; `name` is how the server is told what it is.
interface Shot {
  camera: string;
  name: string;
  size: number;
  blob(): Promise<Blob>;
}
interface Picked {
  parts: Part[];
  shots: Shot[];
  // JPEG files whose path does not say which camera and frame they belong to.
  unnamed: number;
  // Files that are neither a known component nor a camera image; left out of the upload.
  ignored: number;
  segments: string[];
}
function sort(items: Item[]): Picked {
  const parts: Part[] = [],
    shots: Shot[] = [],
    segments = new Set<string>();
  let ignored = 0,
    unnamed = 0;
  for (const item of items) {
    const component = waymoComponent(item.path),
      shot = component ? null : cameraImage(item.path);
    if (shot)
      shots.push({
        camera: shot.camera,
        name: `${shot.camera}/${shot.frame}.jpg`,
        size: item.size,
        blob: item.blob,
      });
    else if (/\.jpe?g$/i.test(item.path)) unnamed++;
    if (!component) {
      if (!shot && !/\.jpe?g$/i.test(item.path)) ignored++;
      continue;
    }
    const segment = waymoSegment(item.path);
    if (segment) segments.add(segment);
    parts.push({ component, name: item.path.split('/').pop()!, size: item.size, blob: item.blob });
  }
  return { parts, shots, unnamed, ignored, segments: [...segments] };
}
const bytesOf = (picked: Picked) =>
  [...picked.parts, ...picked.shots].reduce((n, file) => n + file.size, 0);
// What stops this selection from being uploaded, if anything.
function problemOf(picked: Picked) {
  const missing = WAYMO_COMPONENTS.filter(
    (c) => WAYMO_INFO[c].required && !picked.parts.some((p) => p.component === c),
  );
  if (missing.length) return `Thiếu tệp parquet của: ${missing.join(', ')}.`;
  if (picked.segments.length > 1)
    return 'Các tệp thuộc nhiều segment khác nhau. Mỗi project 3D là một segment.';
  for (const c of WAYMO_COMPONENTS)
    if (picked.parts.filter((p) => p.component === c).length > WAYMO_LIMITS.filesPerComponent)
      return `Quá nhiều tệp cho ${c} (tối đa ${WAYMO_LIMITS.filesPerComponent}).`;
  if (picked.shots.length && picked.parts.some((p) => p.component === 'camera_image'))
    return 'Có cả camera_image lẫn ảnh camera rời. Chỉ dùng một trong hai nguồn ảnh.';
  if (new Set(picked.shots.map((shot) => shot.name)).size !== picked.shots.length)
    return 'Có ảnh camera trùng tên (cùng camera, cùng frame).';
  if (picked.shots.length > WAYMO_LIMITS.images)
    return `Quá nhiều ảnh camera (tối đa ${WAYMO_LIMITS.images}).`;
  if (picked.shots.some((shot) => shot.size > WAYMO_LIMITS.image))
    return 'Mỗi ảnh camera tối đa 20 MB.';
  if (bytesOf(picked) > WAYMO_LIMITS.total) return 'Vượt giới hạn: tổng các tệp tối đa 2 GB.';
  return null;
}
const STAGES: Record<string, string> = {
  UPLOADING: 'Đang nhận files…',
  NORMALIZING: 'Đang chuyển range image thành point cloud…',
  ANALYZING: 'Đang đưa dữ liệu lên kho lưu trữ chung…',
};
// What the backend is doing with a project being imported, with how far it is when known.
export function stageText(project: Project3D) {
  const text = STAGES[project.status],
    progress = project.progress;
  if (!text || !progress) return text;
  const { step, done, total } = progress;
  return step === 'cameras'
    ? `Đang tách ảnh camera… ${done} ảnh`
    : step === 'sheets'
      ? `Đang tạo ảnh xem nhanh… ${done}/${total} frame`
      : step === 'publish'
        ? `${text} ${done}/${total} tệp`
        : `${text} ${done} frame`;
}

export function Import3DForm({
  project,
  onImported,
}: {
  // An existing project still waiting for its data; without one the form creates it first.
  project?: Project3D;
  onImported?: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [source, setSource] = useState<Source>('files'),
    // Files chosen as the segment, and in loose-file mode a folder of camera images beside them.
    [items, setItems] = useState<Item[]>([]),
    [cameraItems, setCameraItems] = useState<Item[]>([]),
    [reading, setReading] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [uploadProgress, setUploadProgress] = useState<number | null>(null),
    [error, setError] = useState('');
  const idRef = useRef<string | undefined>(project?.id),
    mounted = useRef(true),
    latest = useRef(0);
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
  const picked = useMemo(
    () => (items.length || cameraItems.length ? sort([...items, ...cameraItems]) : null),
    [items, cameraItems],
  );
  const fromFiles = (files: File[]): Item[] =>
    files.map((f) => ({ path: f.webkitRelativePath || f.name, size: f.size, blob: async () => f }));
  function chooseFiles(files: File[]) {
    latest.current++;
    setError('');
    setItems(fromFiles(files));
  }
  function chooseCameraFolder(files: File[]) {
    setError('');
    setCameraItems(fromFiles(files).filter((item) => /\.jpe?g$/i.test(item.path)));
  }
  // One archive, or several: the camera images often come in an archive of their own.
  async function chooseArchives(files: File[]) {
    const turn = ++latest.current;
    setError('');
    setItems([]);
    if (!files.length) return;
    setReading(true);
    try {
      const entries = (await Promise.all(files.map((file) => readZip(file)))).flat();
      if (!mounted.current || turn !== latest.current) return;
      setItems(entries.map((e) => ({ path: e.name, size: e.size, blob: () => e.blob() })));
    } catch (e) {
      if (mounted.current && turn === latest.current) setError((e as Error).message);
    } finally {
      if (mounted.current && turn === latest.current) setReading(false);
    }
  }
  function changeSource(next: Source) {
    latest.current++;
    setSource(next);
    setItems([]);
    setCameraItems([]);
    setReading(false);
    setError('');
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!picked?.parts.length) {
      setError(
        source === 'zip'
          ? 'Chọn tệp nén chứa các tệp parquet của segment.'
          : 'Chọn các tệp parquet của segment.',
      );
      return;
    }
    const problem = problemOf(picked);
    if (problem) return setError(problem);
    setBusy(true);
    setUploadProgress(null);
    setMessage('Đang tạo project…');
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      let id = idRef.current;
      if (!id) {
        const created = await request<Project3D>('/projects3d', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description }),
        });
        id = created.id;
        idRef.current = id;
      }
      // Refreshes the session first: the upload itself cannot be replayed after a 401.
      await request('/auth/me');
      const form = new FormData();
      if (source === 'zip') setMessage('Đang giải nén tệp parquet…');
      for (const part of picked.parts) form.append(part.component, await part.blob(), part.name);
      for (const shot of picked.shots) form.append('camera', await shot.blob(), shot.name);
      let sent = false;
      timer = setInterval(async () => {
        try {
          const project = await request<Project3D>(`/projects3d/${id}/import-status`);
          const text = stageText(project);
          if (mounted.current && sent && text && project.status !== 'UPLOADING') setMessage(text);
        } catch {
          /* The upload response reports the authoritative failure. */
        }
      }, 1000);
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/projects3d/${id}/import`);
        setMessage('Đang tải dữ liệu lên…');
        xhr.upload.onprogress = (event) => {
          if (!mounted.current || !event.lengthComputable) return;
          const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
          setUploadProgress(percent);
        };
        // From here the server is working; the status it reports replaces this message.
        xhr.upload.onload = () => {
          sent = true;
          if (mounted.current) setMessage('Đã tải lên. Đang xử lý point cloud…');
        };
        xhr.onerror = () =>
          reject(
            new Error(
              'Kết nối bị ngắt. Xem trạng thái project 3D ở trang Dự án trước khi thử lại.',
            ),
          );
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
        else navigate(`/projects3d/${id}`);
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      clearInterval(timer);
      if (mounted.current) setBusy(false);
    }
  }
  const zipped = source === 'zip',
    problem = picked?.parts.length ? problemOf(picked) : null,
    total = picked ? bytesOf(picked) : 0,
    shotCameras = picked ? orderCameras(picked.shots.map((shot) => shot.camera)) : [];
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
              Tên project
              <input
                aria-label="Tên project"
                className="field mt-2"
                required
                maxLength={160}
                value={name}
                disabled={!!idRef.current}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Mô tả, không bắt buộc
              <textarea
                aria-label="Mô tả"
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
            <>
              <p>
                Một segment của Waymo Open Dataset v2: mỗi component một tệp .parquet. Cuboid 3D
                trong lidar_box là nhãn sẽ được review.
              </p>
              <p>
                Ảnh camera không bắt buộc, chỉ để đối chiếu khi review: dùng component camera_image,
                hoặc ảnh JPEG rời đặt tên &lt;camera&gt;/&lt;frame&gt;.jpg, với frame là timestamp
                hoặc số thứ tự frame tính từ 0.
              </p>
              <p>
                {zipped
                  ? 'Tệp .zip được mở ngay trên trình duyệt; máy chủ chỉ nhận các tệp parquet và ảnh camera bên trong. Chọn được nhiều tệp .zip cùng lúc, ví dụ một tệp lidar và một tệp ảnh camera.'
                  : 'Chọn các tệp parquet cùng lúc, hoặc chọn thư mục chứa chúng. Tệp được nhận diện theo thư mục (lidar_box/…) hoặc theo tên Waymo đặt (validation_lidar_box_….parquet).'}
              </p>
              <p>Tổng tối đa 2 GB. Tệp parquet gốc không được lưu lại sau khi chuyển đổi.</p>
            </>
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
        {zipped ? (
          <label className="block text-sm">
            Tệp nén segment (.zip)
            <input
              key="zip"
              aria-label="Tệp nén segment (.zip)"
              className="field mt-2"
              type="file"
              accept=".zip,application/zip"
              multiple
              onChange={(e) => chooseArchives([...(e.target.files ?? [])])}
            />
          </label>
        ) : (
          <>
            <label className="block text-sm">
              Tệp parquet
              <input
                key="files"
                aria-label="Tệp parquet"
                className="field mt-2"
                type="file"
                multiple
                accept=".parquet"
                onChange={(e) => chooseFiles([...(e.target.files ?? [])])}
              />
            </label>
            <details className="text-sm text-muted">
              <summary className="cursor-pointer">Các tệp nằm trong thư mục con?</summary>
              <p className="my-3">
                Chọn thư mục chứa lidar/, lidar_box/, lidar_calibration/, vehicle_pose/ (và
                lidar_pose/, camera_image/ nếu có) thay cho lựa chọn trên.
              </p>
              <input
                aria-label="Thư mục segment"
                type="file"
                {...{ webkitdirectory: '' }}
                multiple
                onChange={(e) => chooseFiles([...(e.target.files ?? [])])}
              />
            </details>
            <label className="block text-sm">
              Thư mục ảnh camera rời, không bắt buộc
              <input
                aria-label="Thư mục ảnh camera rời"
                className="field mt-2"
                type="file"
                {...{ webkitdirectory: '' }}
                multiple
                onChange={(e) => chooseCameraFolder([...(e.target.files ?? [])])}
              />
              <span className="mt-1 block text-xs text-muted">
                Mỗi camera một thư mục con, ví dụ FRONT/1522688014970187.jpg. Bỏ qua nếu đã có
                camera_image.
              </span>
            </label>
          </>
        )}
        {reading && (
          <p role="status" className="text-sm text-accent">
            <Spinner />
            Đang đọc tệp nén…
          </p>
        )}
        {picked && !reading && (
          <div
            className="rounded-lg border border-line bg-slate-50 p-4 text-sm"
            data-testid="segment"
          >
            <p className="eyebrow mb-3">Component nhận diện được</p>
            <ul className="space-y-3">
              {WAYMO_COMPONENTS.map((component) => {
                const parts = picked.parts.filter((p) => p.component === component),
                  { required, holds } = WAYMO_INFO[component];
                return (
                  <li
                    key={component}
                    className="grid gap-x-4 gap-y-1 sm:grid-cols-[14rem_1fr]"
                    data-testid={`component-${component}`}
                    data-found={parts.length > 0}
                  >
                    <div>
                      <code className="rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
                        {component}
                      </code>
                      <span className="ml-2 text-xs whitespace-nowrap text-muted">
                        {required ? 'Bắt buộc' : 'Tùy chọn'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      {parts.length ? (
                        parts.map((p) => (
                          <p key={p.name} className="break-all">
                            {p.name}
                            <span className="ml-2 text-xs whitespace-nowrap text-muted">
                              {megabytes(p.size)}
                            </span>
                          </p>
                        ))
                      ) : (
                        <p className={required ? 'text-rose-700' : 'text-amber-700'}>
                          {required
                            ? 'Chưa có tệp'
                            : `Chưa có tệp: ${WAYMO_INFO[component].without}`}
                        </p>
                      )}
                      <p className="text-xs text-muted">{holds}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {(picked.shots.length > 0 || picked.unnamed > 0) && (
              <div
                className="mt-3 grid gap-x-4 gap-y-1 border-t border-line pt-3 sm:grid-cols-[14rem_1fr]"
                data-testid="camera-shots"
              >
                <div>
                  <span className="font-semibold">Ảnh camera rời</span>
                  <span className="ml-2 text-xs whitespace-nowrap text-muted">Tùy chọn</span>
                </div>
                <div className="min-w-0">
                  {picked.shots.length > 0 && (
                    <>
                      <p>
                        {`${shotCameras.length} camera · ${picked.shots.length} ảnh`}
                        <span className="ml-2 text-xs whitespace-nowrap text-muted">
                          {megabytes(picked.shots.reduce((n, shot) => n + shot.size, 0))}
                        </span>
                      </p>
                      <p className="text-xs break-words text-muted">
                        {shotCameras
                          .map(
                            (camera) =>
                              `${camera} ${picked.shots.filter((s) => s.camera === camera).length}`,
                          )
                          .join(' · ')}
                      </p>
                    </>
                  )}
                  {picked.unnamed > 0 && (
                    <p className="text-amber-700">
                      {`${picked.unnamed} ảnh JPEG không theo tên <camera>/<frame>.jpg sẽ bị bỏ qua.`}
                    </p>
                  )}
                </div>
              </div>
            )}
            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
              {picked.segments.length === 1 && (
                <span className="mr-3 break-all">Segment: {picked.segments[0]}</span>
              )}
              <span className="mr-3">Tổng: {megabytes(total)}</span>
              {picked.ignored > 0 && (
                <span>{`${picked.ignored} tệp khác không phải component hay ảnh camera sẽ bị bỏ qua.`}</span>
              )}
            </p>
            {problem && (
              <p role="alert" className="mt-3 flex items-start gap-2 text-rose-700">
                <Icon name="alert" className="mt-0.5 shrink-0" />
                <span>{problem}</span>
              </p>
            )}
          </div>
        )}
        <button className="sr-button border-accent/40 text-accent" type="submit">
          {busy && <Spinner />}
          {busy ? 'Đang xử lý…' : project ? 'Nhập segment' : 'Tạo project 3D'}
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
            Giữ trang mở đến khi hoàn tất. Chuyển đổi và lưu point cloud của một segment có thể mất
            vài phút.
          </p>
        </div>
      )}
      {error && (
        <div role="alert" className="mt-5 text-sm text-rose-700">
          {error}
          {idRef.current && (
            <p className="mt-2">Project đã được giữ lại. Bạn có thể chọn lại tệp và thử import.</p>
          )}
        </div>
      )}
    </form>
  );
}
