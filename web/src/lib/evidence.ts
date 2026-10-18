// Turns the evidence of a finding (2D or 3D engine) into rows a reviewer can read: a Vietnamese
// name and a value with its unit. A field without a name here is shown under its own key.
type Unit = '%' | 'm' | 'rad' | 'px' | 'px²' | 'x';
export interface EvidenceRow {
  key: string;
  label: string;
  value: string;
}

const LABELS: Record<string, string> = {
  // 2D
  visibility: 'Phần vật còn thấy',
  visibility_source: 'Số liệu lấy từ',
  in_frame: 'Phần box còn trong khung hình',
  covered: 'Phần box bị box gần camera hơn che',
  threshold: 'Ngưỡng gắn cờ',
  weak_signals: 'Dấu hiệu khó xác nhận',
  bbox: 'Box (x, y · rộng × cao)',
  annotation_id: 'Annotation',
  annotation_ids: 'Annotation liên quan',
  container: 'Nằm trọn trong box',
  confidence: 'Confidence',
  aspect_ratio: 'Tỉ lệ rộng / cao',
  ratio: 'Tỉ lệ đo được',
  areas: 'Diện tích box (trước · hiện tại · sau)',
  centers: 'Tâm box (trước · hiện tại · sau)',
  expected: 'Tâm dự kiến',
  image_width: 'Chiều rộng ảnh',
  image_height: 'Chiều cao ảnh',
  labels: 'Nhãn được so',
  values: 'Điểm của từng nhãn',
  margin: 'Chênh lệch điểm',
  height_ratio: 'Cao gấp (so với box cùng tầm xa)',
  below: 'Số xe có nóc cao hơn',
  objects: 'Số xe trong ảnh',
  missing: 'Attribute bị thiếu',
  invalid: 'Attribute sai giá trị',
  top_ratio: 'Mép trên (tính từ đỉnh ảnh)',
  bottom_ratio: 'Mép dưới (tính từ đỉnh ảnh)',
  center_ratio: 'Tâm (tính từ đỉnh ảnh)',
  width_ratio: 'Bề rộng so với ảnh',
  horizon_y: 'Đường chân trời (y)',
  env_risk: 'Mức ảnh xấu (env_risk)',
  iou: 'IoU (độ trùng khớp)',
  mean: 'Trung bình frame lân cận',
  value: 'Giá trị',
  label: 'Nhãn',
  score: 'Điểm',
  // 3D
  reference_frame_index: 'Frame tham chiếu',
  reference_timestamp: 'Timestamp tham chiếu',
  reference_heading_world: 'Hướng ở frame tham chiếu',
  heading_world: 'Hướng ở frame này',
  angle_rad: 'Lệch hướng',
  reference_verified: 'Frame tham chiếu đã review',
  frame_indexes: 'Đoạn frame',
  points: 'Số điểm LiDAR trong cuboid',
  share: 'Đo ở frame này',
  median: 'Trung vị cả đoạn',
  allowed: 'Mức cho phép',
  fit: 'Số liệu khớp điểm',
  depth_m: 'Phần chìm dưới mặt đường',
  lift_m: 'Đáy so với mặt đường',
  tolerance_m: 'Dung sai',
  submerged_height_ratio: 'Phần chiều cao bị chìm',
  reference: 'Mốc so sánh',
  horizontal_m: 'Dịch theo phương ngang',
  vertical_m: 'Dịch lên / xuống',
  turn_rad: 'Xoay',
  size_change: 'Đổi kích thước',
  against_frames: 'So với frame',
  size: 'Kích thước (dài × rộng × cao)',
  track_median: 'Trung vị kích thước của track',
  frames: 'Số frame',
  distance_m: 'Cách xe',
  counted: 'Số điểm được đếm',
  outside: 'Điểm ngay ngoài cuboid',
  slack: 'Khoảng trống (dọc, ngang)',
  moved: 'Dời cuboid (dọc, ngang, …)',
  lift: 'Đáy so với mặt đường',
};
const UNITS: Record<string, Unit> = {
  visibility: '%',
  in_frame: '%',
  covered: '%',
  top_ratio: '%',
  bottom_ratio: '%',
  center_ratio: '%',
  width_ratio: '%',
  submerged_height_ratio: '%',
  size_change: '%',
  height_ratio: 'x',
  bbox: 'px',
  centers: 'px',
  expected: 'px',
  image_width: 'px',
  image_height: 'px',
  horizon_y: 'px',
  areas: 'px²',
  size: 'm',
  track_median: 'm',
  lift: 'm',
  slack: 'm',
};
// Fields whose unit depends on the check: a share for some, metres for others.
const SHARE_CHECKS = ['fit.moved', 'fit.points_outside', 'fit.loose'];
const METRE_CHECKS = ['fit.empty_side', 'fit.floating', 'fit.sunk', 'fit.lowered', 'fit.raised'];
function unitOf(checkId: string, key: string): Unit | undefined {
  if (UNITS[key]) return UNITS[key];
  if (key.endsWith('_m')) return 'm';
  if (key.endsWith('_rad')) return 'rad';
  if (['share', 'median', 'allowed'].includes(key)) {
    if (SHARE_CHECKS.includes(checkId)) return '%';
    if (METRE_CHECKS.includes(checkId)) return 'm';
  }
  if (
    key === 'threshold' &&
    (checkId.startsWith('visibility.') || checkId.endsWith('_below_vehicles'))
  )
    return '%';
  if (key === 'ratio' && checkId === 'geometry.bbox_area') return '%';
  if (key === 'ratio' && checkId === 'geometry.bbox_position') return 'x';
}
const WORDS: Record<string, string> = {
  measured: 'thuộc tính che / cắt có sẵn trong dataset (đo)',
  estimated: 'ước tính từ vị trí các box (gần đúng, thường tính phần bị che lớn hơn thực tế)',
  low_confidence: 'mô hình kém tự tin',
  poor_image: 'ảnh tối, mưa hoặc mờ',
  small: 'box nhỏ (cạnh dài < 32 px)',
  second_label_close: 'phân vân với nhãn thứ hai',
  local_road: 'mặt đường quanh cuboid',
};

const round = (n: number, digits = 3) => String(Number(n.toFixed(digits)));
const percent = (share: number) =>
  share > 0 && share < 0.005 ? 'dưới 1%' : `${Number((share * 100).toFixed(1))}%`;
function number(n: number, unit?: Unit) {
  if (unit === '%') return percent(n);
  if (unit === 'rad') return `${round(n)} rad (${Math.round((n * 180) / Math.PI)}°)`;
  if (unit === 'x') return `${round(n, 2)} lần`;
  if (unit === 'px' || unit === 'px²') return `${Math.round(n)} ${unit}`;
  if (unit === 'm') return `${round(n, 2)} m`;
  return round(n);
}
function format(checkId: string, key: string, value: unknown): string {
  const unit = unitOf(checkId, key);
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'number')
    return Number.isFinite(value) ? number(value, unit) : String(value);
  if (typeof value === 'string') return WORDS[value] ?? value;
  if (Array.isArray(value)) {
    if (!value.length) return 'không có';
    if (key === 'frame_indexes' || key === 'against_frames')
      return value.length === 2 ? `frame ${value[0]} → ${value[1]}` : value.join(', ');
    if (value.every((v) => typeof v === 'number')) {
      const parts = value.map((v) => (unit === '%' ? percent(v) : round(v, unit ? 2 : 3)));
      const sep = key === 'size' || key === 'track_median' ? ' × ' : ' · ';
      return parts.join(sep) + (unit && unit !== '%' && unit !== 'x' ? ` ${unit}` : '');
    }
    if (value.every((v) => typeof v === 'string'))
      return value.map((v) => WORDS[v] ?? v).join(', ');
    // Pairs such as box centres: one point per item.
    return value.map((v) => format(checkId, key, v)).join(' · ');
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (['x', 'y', 'width', 'height'].every((k) => typeof o[k] === 'number'))
      return `x ${Math.round(o.x as number)}, y ${Math.round(o.y as number)} · ${Math.round(o.width as number)} × ${Math.round(o.height as number)} px`;
    return Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${LABELS[k] ?? k}: ${format(checkId, k, v)}`)
      .join('; ');
  }
  return String(value);
}

export function evidenceRows(checkId: string, evidence: Record<string, unknown> | undefined) {
  return Object.entries(evidence ?? {})
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]): EvidenceRow => ({
        key,
        label: LABELS[key] ?? key.replace(/_/g, ' '),
        value: format(checkId, key, value),
      }),
    );
}
