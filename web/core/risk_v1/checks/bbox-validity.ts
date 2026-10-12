import { skip, pass, flag } from './shared.ts';
import type { LegacyCheck } from '../types.ts';

const check: LegacyCheck = {
  id: 'geometry.bbox_validity',
  version: '1.0.0',
  run({ current, media }) {
    const g = current.geometry;
    if (g.type !== 'bbox') return skip('unsupported_geometry');
    const evidence = { bbox: g, image_width: media.width, image_height: media.height };
    if (g.width <= 0 || g.height <= 0)
      return flag(70, 'BBox có chiều rộng hoặc chiều cao không dương.', evidence);
    if (
      g.x < -0.1 ||
      g.y < -0.1 ||
      g.x + g.width > media.width + 0.1 ||
      g.y + g.height > media.height + 0.1
    )
      return flag(40, 'BBox nằm ngoài giới hạn ảnh.', evidence);
    return pass();
  },
};
export default check;
