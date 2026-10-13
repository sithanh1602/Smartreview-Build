// A parsed request body: nothing about it is known until each field has been checked.
export type Untrusted = any;
export type ReviewMode = 'create' | 'update';
export interface ReviewInput {
  decision: string;
  error_type: string | null;
  corrected_value: string | null;
  note: string | null;
  version?: number;
}

export const DECISIONS: Record<string, string> = {
  CORRECT: 'Correct / False Alarm',
  ERROR: 'Annotation Error',
  UNSURE: 'Unsure',
};
export const ERROR_TYPES: Record<string, string> = {
  CLASS: 'Class',
  BBOX: 'BBox',
  TRACKING: 'Tracking',
  MISSING_OBJECT: 'Missing Object',
  EXTRA_OBJECT: 'Extra Object',
  OTHER: 'Other',
};
export class ReviewError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function validateReview(
  input: Untrusted,
  mode: ReviewMode,
  fingerprint: string,
): ReviewInput {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ReviewError(400, 'Expected a JSON object.');
  const allowed = new Set([
    'dataset_revision',
    'decision',
    'error_type',
    'corrected_value',
    'note',
    'version',
  ]);
  if (Object.keys(input).some((k) => !allowed.has(k)))
    throw new ReviewError(400, 'Unknown review field.');
  if (input.dataset_revision !== fingerprint)
    throw new ReviewError(409, 'Dataset đã thay đổi. Tải lại trang trước khi lưu.');
  if (!Object.hasOwn(DECISIONS, input.decision))
    throw new ReviewError(400, 'Chọn Correct, Error hoặc Unsure.');
  const nullable = (name: string, max: number): string | null => {
    const v = input[name];
    if (v == null || v === '') return null;
    if (typeof v !== 'string' || v.length > max)
      throw new ReviewError(400, `${name}: expected text up to ${max} characters.`);
    return v.trim() || null;
  };
  const error_type = nullable('error_type', 32),
    corrected_value = nullable('corrected_value', 1000),
    note = nullable('note', 4000);
  if (input.decision === 'ERROR') {
    if (error_type === null || !Object.hasOwn(ERROR_TYPES, error_type))
      throw new ReviewError(400, 'Chọn loại lỗi annotation.');
    if (error_type === 'CLASS' && !corrected_value)
      throw new ReviewError(400, 'Nhập Correct Label cho lỗi Class.');
  } else if (error_type !== null || corrected_value !== null)
    throw new ReviewError(400, 'Correction và error type chỉ dùng cho Annotation Error.');
  if (mode === 'update' && (!Number.isSafeInteger(input.version) || input.version < 1))
    throw new ReviewError(400, 'PUT requires the current review version.');
  if (mode === 'create' && input.version != null)
    throw new ReviewError(400, 'POST must not include version.');
  return {
    decision: input.decision,
    error_type,
    corrected_value,
    note,
    version: input.version,
  };
}
export function matchesReview(review: { decision: string } | null | undefined, status: string) {
  return (
    status === 'all' ||
    (status === 'unreviewed'
      ? !review
      : status === 'reviewed'
        ? !!review
        : review?.decision === status)
  );
}
