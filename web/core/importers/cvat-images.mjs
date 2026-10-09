import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { normalizeDataset, SCHEMA_VERSION } from '../schema/normalize.mjs';
import { applySignals } from './signals.mjs';

const list = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

// Explicitly supports CVAT for images 1.1: box, polygon and polyline.
// Video tracks, masks, skeletons, rotated boxes and interpolation need separate adapters.
export function importCvatImages(
  xml,
  { id = 'cvat-images', name = 'CVAT image annotations' } = {},
) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD/entity declarations are not supported');
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`Invalid CVAT XML: ${valid.err.msg}`);
  const root = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: false,
    processEntities: true,
  }).parse(xml).annotations;
  if (!root || String(root.version) !== '1.1') throw new Error('Expected CVAT XML version 1.1');
  if (root.track)
    throw new Error(
      'CVAT video tracks are not supported by cvat-images; export CVAT for images 1.1',
    );
  const data = {
    schema_version: SCHEMA_VERSION,
    dataset: { id, name, source: { kind: 'import', name: 'CVAT for images 1.1' } },
    media: [],
    frames: [],
    annotations: [],
  };
  for (const image of list(root.image)) {
    if (image.id == null || !image.name) throw new Error('CVAT image requires id and name');
    const mediaId = `image-${image.id}`,
      frameId = `${mediaId}:0`;
    data.media.push({
      id: mediaId,
      name: image.name,
      type: 'image',
      width: Number(image.width),
      height: Number(image.height),
    });
    data.frames.push({ id: frameId, media_id: mediaId, index: 0, image: `images/${image.name}` });
    const allowed = new Set([
      'id',
      'name',
      'width',
      'height',
      'subset',
      'box',
      'polygon',
      'polyline',
    ]);
    for (const key of Object.keys(image))
      if (!allowed.has(key)) throw new Error(`Unsupported CVAT image element/attribute: ${key}`);
    for (const type of ['box', 'polygon', 'polyline']) {
      for (const [index, shape] of list(image[type]).entries()) {
        if (shape.rotation != null && Number(shape.rotation) !== 0)
          throw new Error('Rotated boxes are not supported');
        const geometry =
          type === 'box'
            ? {
                type: 'bbox',
                x: Number(shape.xtl),
                y: Number(shape.ytl),
                width: Number(shape.xbr) - Number(shape.xtl),
                height: Number(shape.ybr) - Number(shape.ytl),
              }
            : {
                type,
                points: String(shape.points)
                  .split(';')
                  .map((pair) => pair.split(',').map(Number)),
              };
        const a = {
          id: `${mediaId}-${type}-${index}`,
          frame_id: frameId,
          label: shape.label,
          geometry,
          source: {
            kind:
              shape.source === 'manual' ? 'human' : shape.source === 'auto' ? 'model' : 'unknown',
            name: 'CVAT',
          },
          attributes: Object.fromEntries(
            list(shape.attribute).map((v) => [v.name, v['#text'] ?? '']),
          ),
        };
        data.annotations.push(applySignals(a));
      }
    }
  }
  return normalizeDataset(data);
}
