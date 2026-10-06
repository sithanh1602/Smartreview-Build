import { ReviewError } from './review.mjs';
export function validateFrameReview(input, revision, media) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (k) => !['dataset_revision', 'version', 'status', 'missing_regions', 'note'].includes(k),
    )
  )
    throw new ReviewError(400, 'Dữ liệu đánh giá ảnh không hợp lệ.');
  if (input.dataset_revision !== revision)
    throw new ReviewError(409, 'Dataset đã thay đổi. Tải lại trang.');
  if (!Number.isSafeInteger(input.version) || input.version < 0)
    throw new ReviewError(400, 'Thiếu phiên bản đánh giá hợp lệ.');
  if (!['IN_PROGRESS', 'REVIEWED'].includes(input.status))
    throw new ReviewError(400, 'Trạng thái đánh giá không hợp lệ.');
  if (typeof input.note !== 'string' || input.note.length > 2000)
    throw new ReviewError(400, 'Ghi chú tối đa 2000 ký tự.');
  if (!Array.isArray(input.missing_regions) || input.missing_regions.length > 50)
    throw new ReviewError(400, 'Tối đa 50 vùng thiếu đối tượng mỗi ảnh.');
  const ids = new Set();
  const regions = input.missing_regions.map((r) => {
    if (
      !r ||
      typeof r !== 'object' ||
      Object.keys(r).some((k) => !['id', 'label', 'note', 'geometry'].includes(k)) ||
      typeof r.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(r.id) ||
      ids.has(r.id)
    )
      throw new ReviewError(400, 'Mã vùng đánh dấu không hợp lệ hoặc bị trùng.');
    ids.add(r.id);
    if (
      typeof r.label !== 'string' ||
      r.label.length > 100 ||
      typeof r.note !== 'string' ||
      r.note.length > 500
    )
      throw new ReviewError(400, 'Tên đối tượng tối đa 100 ký tự; ghi chú vùng tối đa 500 ký tự.');
    const g = r.geometry;
    if (
      !g ||
      Object.keys(g).some((k) => !['type', 'x', 'y', 'width', 'height'].includes(k)) ||
      g.type !== 'bbox' ||
      ![g.x, g.y, g.width, g.height].every(Number.isFinite) ||
      g.x < 0 ||
      g.y < 0 ||
      g.width < 1 ||
      g.height < 1 ||
      g.x + g.width > media.width + 0.01 ||
      g.y + g.height > media.height + 0.01
    )
      throw new ReviewError(400, 'Vùng thiếu phải nằm trong ảnh, rộng và cao ít nhất 1 pixel.');
    return { id: r.id, label: r.label.trim(), note: r.note.trim(), geometry: g };
  });
  return {
    version: input.version,
    status: input.status,
    missing_regions: regions,
    note: input.note.trim(),
  };
}
