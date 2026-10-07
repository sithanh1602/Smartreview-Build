import { Spinner } from '../components/Spinner';
import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { request } from '../lib/api';
import { WholeFrameViewer } from '../features/frames/WholeFrameViewer';
export function FrameReviewPage() {
  const { projectId } = useParams();
  return <Workspace key={projectId} projectId={projectId} />;
}
function Workspace({ projectId }) {
  const { frameId } = useParams(),
    navigate = useNavigate();
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [filter, setFilter] = useState('all'),
    [query, setQuery] = useState('');
  const base = `/projects/${projectId}`;
  useEffect(() => {
    const c = new AbortController();
    request(base + '/frames', { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) {
          setData(d);
          setError('');
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [base, attempt]);
  if (!data)
    return (
      <div role={error ? 'alert' : 'status'}>
        {!error && <Spinner />}
        {error || 'Đang tải danh sách ảnh…'}
        {error && (
          <button className="button ml-3" onClick={() => setAttempt((a) => a + 1)}>
            Thử lại
          </button>
        )}
      </div>
    );
  const filtered = data.frames.filter(
    (f) =>
      (filter === 'all' ||
        (filter === 'unreviewed' && f.review?.status !== 'REVIEWED') ||
        (filter === 'reviewed' && f.review?.status === 'REVIEWED') ||
        (filter === 'empty' && f.annotation_count === 0) ||
        (filter === 'missing' && f.review?.missing_count > 0)) &&
      `${f.media_name} ${f.index}`.toLowerCase().includes(query.toLowerCase()),
  );
  const mediaCounts = new Map();
  for (const f of data.frames) mediaCounts.set(f.media_id, (mediaCounts.get(f.media_id) || 0) + 1);
  const current = data.frames.find((f) => f.id === frameId),
    position = filtered.findIndex((f) => f.id === frameId);
  if (!frameId && filtered.length)
    return <Navigate replace to={`${base}/frames/${encodeURIComponent(filtered[0].id)}`} />;
  function saved(id, review) {
    setData((old) => {
      const frames = old.frames.map((f) =>
        f.id === id
          ? {
              ...f,
              review: {
                status: review.status,
                version: review.version,
                missing_count: review.missing_regions.length,
              },
            }
          : f,
      );
      return {
        ...old,
        frames,
        summary: {
          ...old.summary,
          reviewed: frames.filter((f) => f.review?.status === 'REVIEWED').length,
          in_progress: frames.filter((f) => f.review?.status === 'IN_PROGRESS').length,
          missing_regions: frames.reduce((n, f) => n + (f.review?.missing_count || 0), 0),
        },
      };
    });
  }
  const go = (id) => navigate(`${base}/frames/${encodeURIComponent(id)}`);
  return (
    <>
      <Link to={base} className="text-sm text-muted">
        ← Về dự án
      </Link>
      <h1 className="mt-5 text-2xl font-semibold">Kiểm tra theo ảnh · {data.name}</h1>
      <p className="mt-2 text-sm text-muted">
        Xem đủ đối tượng trong từng ảnh, đánh dấu vùng thiếu và lưu kết quả kiểm tra.
      </p>
      <div className="my-5 grid gap-3 sm:grid-cols-4">
        {[
          ['Tổng ảnh / frame', data.summary.total],
          ['Đã kiểm tra', data.summary.reviewed],
          ['Chưa hoàn tất', data.summary.total - data.summary.reviewed],
          ['Vùng thiếu đã lưu', data.summary.missing_regions],
        ].map(([label, value]) => (
          <div key={label} className="panel p-4">
            <p className="text-xs text-muted">{label}</p>
            <strong className="mt-2 block text-2xl">{value}</strong>
          </div>
        ))}
      </div>
      <p className="mb-5 text-xs text-muted">
        Đã kiểm tra nghĩa là bạn đã xem xong ảnh, không có nghĩa ảnh không có lỗi. Có ảnh để xem:{' '}
        {data.summary.available_images}/{data.summary.total}.
      </p>
      {error && (
        <p role="alert" className="mb-4 text-rose-700">
          {error}
        </p>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="panel p-4">
          <label className="block text-sm">
            Tìm ảnh
            <input
              className="field mt-2"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="mt-3 block text-sm">
            Lọc ảnh
            <select
              className="field mt-2"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Tất cả ảnh</option>
              <option value="unreviewed">Chưa hoàn tất</option>
              <option value="reviewed">Đã kiểm tra</option>
              <option value="empty">Chưa có annotation</option>
              <option value="missing">Có vùng thiếu đã lưu</option>
            </select>
          </label>
          <p className="my-3 text-xs text-muted">{filtered.length} ảnh phù hợp</p>
          <div className="max-h-[60vh] overflow-auto">
            {filtered.map((f) => (
              <Link
                key={f.id}
                to={`${base}/frames/${encodeURIComponent(f.id)}`}
                aria-current={f.id === frameId ? 'page' : undefined}
                className={`mb-2 block border p-3 text-sm ${f.id === frameId ? 'border-accent bg-teal-50' : 'border-line'}`}
              >
                <span className="block break-all">
                  {f.media_name}
                  {mediaCounts.get(f.media_id) > 1 ? ` · Frame ${f.index}` : ''}
                </span>
                <span className="mt-2 block text-xs text-muted">
                  {f.annotation_count} nhãn ·{' '}
                  {f.review?.status === 'REVIEWED'
                    ? 'Đã kiểm tra'
                    : f.review
                      ? 'Đang kiểm tra'
                      : 'Chưa kiểm tra'}
                  {!f.image_url ? ' · Chưa có ảnh' : ''}
                </span>
              </Link>
            ))}
          </div>
        </aside>
        {current ? (
          <FrameEditor
            key={current.id}
            projectId={projectId}
            frameId={current.id}
            onSaved={saved}
            previous={position > 0 ? () => go(filtered[position - 1].id) : null}
            next={
              position >= 0 && position < filtered.length - 1
                ? () => go(filtered[position + 1].id)
                : null
            }
          />
        ) : (
          <section className="panel p-8">
            {frameId ? 'Không tìm thấy ảnh này.' : 'Không có ảnh phù hợp.'}
          </section>
        )}
      </div>
    </>
  );
}
function FrameEditor({ projectId, frameId, onSaved, previous, next }) {
  const endpoint = `/projects/${projectId}/frames/${encodeURIComponent(frameId)}`;
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [regions, setRegions] = useState([]),
    [note, setNote] = useState(''),
    [status, setStatus] = useState('IN_PROGRESS'),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [drawing, setDrawing] = useState(false),
    [ready, setReady] = useState(false),
    [selected, setSelected] = useState(null),
    [attempt, setAttempt] = useState(0);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const blocker = useBlocker(() => dirtyRef.current);
  useEffect(() => {
    const handler = (e) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    request(endpoint, { signal: c.signal })
      .then((result) => {
        if (c.signal.aborted) return;
        setData(result);
        setRegions(result.review?.missing_regions || []);
        setNote(result.review?.note || '');
        setStatus(result.review?.status || 'IN_PROGRESS');
        setDirty(false);
        dirtyRef.current = false;
        setError('');
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [endpoint, attempt]);
  const changed = () => {
    setDirty(true);
    setMessage('');
  };
  function add(geometry) {
    if (regions.length >= 50) {
      setError('Tối đa 50 vùng mỗi ảnh.');
      return;
    }
    setRegions((r) => [...r, { id: crypto.randomUUID(), label: '', note: '', geometry }]);
    setDrawing(false);
    changed();
  }
  function update(id, patch) {
    setRegions((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    changed();
  }
  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await request(endpoint + '/review', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_revision: data.dataset_revision,
          version: data.review?.version || 0,
          status,
          missing_regions: regions,
          note,
        }),
      });
      setData((d) => ({ ...d, review: result.review }));
      setRegions(result.review.missing_regions);
      setNote(result.review.note);
      setDirty(false);
      dirtyRef.current = false;
      onSaved(frameId, result.review);
      setMessage('Đã lưu đánh giá ảnh.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  if (!data)
    return (
      <section className="panel p-6" role={error ? 'alert' : 'status'}>
        {!error && <Spinner />}
        {error || 'Đang tải ảnh và annotation…'}
        {error && (
          <button className="button ml-3" onClick={() => setAttempt((a) => a + 1)}>
            Thử lại
          </button>
        )}
      </section>
    );
  const selectedAnnotation = data.annotations.find((a) => a.id === selected);
  return (
    <section className="panel min-w-0 p-5">
      {blocker.state === 'blocked' && (
        <div
          role="alertdialog"
          aria-label="Thay đổi chưa lưu"
          className="mb-5 border border-amber-500 bg-amber-50 p-4"
        >
          <p>Có thay đổi chưa lưu. Rời ảnh sẽ bỏ các thay đổi này.</p>
          <div className="mt-3 flex gap-3">
            <button className="button" onClick={() => blocker.reset()}>
              Ở lại để lưu
            </button>
            <button
              className="button"
              onClick={() => {
                dirtyRef.current = false;
                blocker.proceed();
              }}
            >
              Bỏ thay đổi và rời ảnh
            </button>
          </div>
        </div>
      )}
      <div className="mb-4 flex flex-wrap justify-between gap-3">
        <h2 className="break-all font-semibold">
          {data.frame.media_name} · Frame {data.frame.index}
        </h2>
        <div className="flex gap-2">
          <button className="button" disabled={!previous || saving} onClick={previous}>
            ← Ảnh trước
          </button>
          <button className="button" disabled={!next || saving} onClick={next}>
            Ảnh sau →
          </button>
        </div>
      </div>
      <WholeFrameViewer
        frame={data.frame}
        annotations={data.annotations}
        regions={regions}
        drawing={drawing && !saving}
        onAdd={add}
        selected={selected}
        onSelect={setSelected}
        onReady={setReady}
      />
      {!data.annotations.length && (
        <p className="mt-3 text-sm">
          Ảnh chưa có annotation. Nếu có đối tượng cần gán nhãn, hãy đánh dấu vùng thiếu.
        </p>
      )}
      {data.annotations.some((a) => !['bbox', 'polygon', 'polyline'].includes(a.geometry.type)) && (
        <p className="mt-3 text-sm text-amber-800">
          Có hình học chưa hỗ trợ hiển thị (mask/cuboid). Chỉ xác nhận phần bạn đã kiểm tra được.
        </p>
      )}
      <label className="mt-4 block text-sm">
        Annotation (Nhãn hiện có)
        <select
          className="field mt-2"
          value={selected || ''}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Chọn khung trên ảnh hoặc trong danh sách</option>
          {data.annotations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} · {a.id}
            </option>
          ))}
        </select>
      </label>
      {selectedAnnotation && (
        <Link
          className="button mt-3"
          to={`/projects/${projectId}/review/${encodeURIComponent(selectedAnnotation.id)}?scope=all`}
        >
          Đánh giá nhãn / khung đã có →
        </Link>
      )}
      <fieldset disabled={saving} className="mt-6 border-t border-line pt-5">
        <h3 className="font-semibold">Missing Object (Thiếu đối tượng)</h3>
        <p className="mt-2 text-sm text-muted">
          Kéo chuột bao quanh đối tượng chưa có box, hoặc thêm vùng rồi nhập tọa độ. Đây là ghi chú
          kiểm tra, không sửa annotation gốc.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            className="button"
            disabled={!ready || regions.length >= 50}
            aria-pressed={drawing}
            onClick={() => setDrawing((v) => !v)}
          >
            {drawing ? 'Dừng vẽ vùng thiếu' : 'Vẽ vùng thiếu'}
          </button>
          <button
            className="button"
            disabled={!ready || regions.length >= 50}
            onClick={() =>
              add({
                type: 'bbox',
                x: data.frame.width / 4,
                y: data.frame.height / 4,
                width: data.frame.width / 2,
                height: data.frame.height / 2,
              })
            }
          >
            Thêm vùng bằng tọa độ
          </button>
        </div>
        {drawing && (
          <p role="status" className="mt-3 text-sm text-rose-700">
            Kéo chuột từ một góc đến góc đối diện của đối tượng trên ảnh.
          </p>
        )}
        <div className="mt-4 space-y-4">
          {regions.map((r, i) => (
            <div key={r.id} className="border border-rose-200 p-4">
              <div className="flex justify-between gap-3">
                <strong className="text-sm">Vùng thiếu {i + 1}</strong>
                <button
                  className="text-sm text-rose-700"
                  onClick={() => {
                    setRegions((all) => all.filter((x) => x.id !== r.id));
                    changed();
                  }}
                >
                  Xóa vùng {i + 1}
                </button>
              </div>
              <label className="mt-3 block text-sm">
                Tên đối tượng (không bắt buộc)
                <input
                  className="field mt-2"
                  value={r.label}
                  maxLength={100}
                  onChange={(e) => update(r.id, { label: e.target.value })}
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {['x', 'y', 'width', 'height'].map((k) => (
                  <label key={k} className="text-xs">
                    {{ x: 'X', y: 'Y', width: 'Rộng', height: 'Cao' }[k]} (px)
                    <input
                      type="number"
                      className="field mt-1"
                      step="any"
                      value={r.geometry[k]}
                      onChange={(e) =>
                        update(r.id, {
                          geometry: {
                            ...r.geometry,
                            [k]: e.target.value === '' ? '' : Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="mt-3 block text-sm">
                Ghi chú vùng
                <input
                  className="field mt-2"
                  value={r.note}
                  maxLength={500}
                  onChange={(e) => update(r.id, { note: e.target.value })}
                />
              </label>
            </div>
          ))}
        </div>
        <label className="mt-5 block text-sm">
          Ghi chú ảnh
          <textarea
            className="field mt-2"
            value={note}
            maxLength={2000}
            onChange={(e) => {
              setNote(e.target.value);
              changed();
            }}
          />
        </label>
        <label className="mt-4 block text-sm">
          Trạng thái kiểm tra
          <select
            className="field mt-2"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              changed();
            }}
          >
            <option value="IN_PROGRESS">Đang kiểm tra / chưa chắc</option>
            <option value="REVIEWED">Đã kiểm tra xong ảnh</option>
          </select>
        </label>
        <button
          className="button mt-4 border-accent text-accent"
          disabled={!ready || saving}
          onClick={save}
        >
          {saving && <Spinner />}
          {saving ? 'Đang lưu…' : 'Lưu đánh giá ảnh'}
        </button>
        {dirty && <span className="ml-3 text-xs text-amber-800">Có thay đổi chưa lưu</span>}
      </fieldset>
      {message && (
        <p role="status" className="mt-3 text-accent">
          {message}
        </p>
      )}
      {error && (
        <div role="alert" className="mt-3 text-rose-700">
          {error}
          <button
            className="button mt-3"
            disabled={saving}
            onClick={() => {
              if (!dirty || window.confirm('Bỏ thay đổi chưa lưu và tải lại bản đã lưu?'))
                setAttempt((a) => a + 1);
            }}
          >
            Tải lại bản đã lưu
          </button>
        </div>
      )}
    </section>
  );
}
