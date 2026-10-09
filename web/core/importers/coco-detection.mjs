import { normalizeDataset, SCHEMA_VERSION } from '../schema/normalize.mjs';
import { applySignals, readEnvRisk } from './signals.mjs';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function index(items, field) {
  if (!Array.isArray(items)) throw new Error(`COCO: ${field} phải là một mảng.`);
  const result = new Map();
  for (const item of items) {
    if (!object(item) || !Number.isSafeInteger(item.id) || item.id < 0)
      throw new Error(`COCO ${field}: id phải là số nguyên không âm an toàn.`);
    if (result.has(item.id)) throw new Error(`COCO ${field}: trùng id ${item.id}.`);
    result.set(item.id, item);
  }
  return result;
}

export function importCocoDetection(text, { id = 'coco-detection', name = 'COCO Detection' } = {}) {
  const input = JSON.parse(text);
  if (!object(input))
    throw new Error(
      'COCO Detection cần object chứa images, categories, annotations; không nhận mảng prediction.',
    );
  const images = index(input.images, 'images');
  const categories = index(input.categories, 'categories');
  const annotations = index(input.annotations, 'annotations');
  if (!images.size) throw new Error('COCO: images không được rỗng.');
  for (const category of categories.values())
    if (typeof category.name !== 'string' || !category.name.trim())
      throw new Error(`COCO category ${category.id}: thiếu name.`);
  const data = {
    schema_version: SCHEMA_VERSION,
    dataset: {
      id,
      name,
      source: { kind: 'import', name: 'COCO Detection' },
      metadata: {
        coco: {
          categories: input.categories,
          info: input.info ?? null,
          licenses: input.licenses ?? [],
        },
      },
    },
    media: [],
    frames: [],
    annotations: [],
  };
  const paths = new Set();
  for (const image of images.values()) {
    const file = image.file_name;
    if (
      typeof file !== 'string' ||
      !file ||
      file.includes('\\') ||
      file.includes(':') ||
      file.split('/').some((p) => !p || p === '.' || p === '..' || p.startsWith('.')) ||
      /[\x00-\x1f\x7f]/.test(file)
    )
      throw new Error(`COCO image ${image.id}: file_name phải là đường dẫn ảnh tương đối hợp lệ.`);
    if (paths.has(file)) throw new Error(`COCO: trùng file_name ${file}.`);
    paths.add(file);
    if (![image.width, image.height].every((n) => Number.isSafeInteger(n) && n > 0))
      throw new Error(`COCO image ${image.id}: width/height phải là số nguyên dương.`);
    const mediaId = `image-${image.id}`;
    data.media.push({
      id: mediaId,
      type: 'image',
      name: file,
      width: image.width,
      height: image.height,
    });
    data.frames.push({ id: `${mediaId}:0`, media_id: mediaId, index: 0, image: `images/${file}` });
    const risk = readEnvRisk(image, image.attributes);
    if (risk !== undefined) (data.dataset.metadata.env_risk ||= {})[`${mediaId}:0`] = risk;
  }
  for (const a of annotations.values()) {
    if (!images.has(a.image_id))
      throw new Error(`COCO annotation ${a.id}: image_id ${a.image_id} không tồn tại.`);
    if (!categories.has(a.category_id))
      throw new Error(`COCO annotation ${a.id}: category_id ${a.category_id} không tồn tại.`);
    if (!Array.isArray(a.bbox) || a.bbox.length !== 4 || !a.bbox.every(Number.isFinite))
      throw new Error(`COCO annotation ${a.id}: bbox cần [x, y, width, height] với 4 số hữu hạn.`);
    const [x, y, width, height] = a.bbox;
    const { bbox, ...original } = a;
    data.annotations.push(
      applySignals(
        {
          id: `coco-${a.id}`,
          frame_id: `image-${a.image_id}:0`,
          label: categories.get(a.category_id).name,
          geometry: { type: 'bbox', x, y, width, height },
          source: { kind: 'import', name: 'COCO Detection' },
          attributes: { coco: original },
        },
        a,
        a.attributes,
      ),
    );
  }
  return normalizeDataset(data);
}
