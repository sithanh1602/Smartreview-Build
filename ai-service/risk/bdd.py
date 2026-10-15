"""BDD100K detection labels -> flat frame/box records.

Handles both the 2018 release (bdd100k_labels_images_val.json) and the
det_20 release (det_val.json): both are a list of frames with `name`,
`attributes` and `labels[].box2d`. Drivable-area / lane entries carry
`poly2d` instead and are dropped.
"""
import json
from pathlib import Path

# BDD100K frames are a fixed size; kept as a fallback only.
IMAGE_WIDTH, IMAGE_HEIGHT = 1280, 720

DET_CLASSES = (
    'pedestrian', 'rider', 'car', 'truck', 'bus', 'train',
    'motorcycle', 'bicycle', 'traffic light', 'traffic sign',
)
# The 2018 release uses different names for three of the ten classes.
CLASS_ALIASES = {'person': 'pedestrian', 'motor': 'motorcycle', 'bike': 'bicycle'}
IMAGE_ATTRIBUTES = ('weather', 'scene', 'timeofday')


def canonical_class(name):
    key = str(name).strip().lower()
    return CLASS_ALIASES.get(key, key)


def load(path):
    """Return [{name, width, height, weather, scene, timeofday, boxes: [...]}]."""
    raw = json.loads(Path(path).read_text(encoding='utf-8'))
    frames = raw['frames'] if isinstance(raw, dict) else raw
    if not isinstance(frames, list):
        raise ValueError(f'Unexpected label structure in {path}: {type(raw)}')
    out = []
    for frame in frames:
        attributes = frame.get('attributes') or {}
        record = {
            'name': frame['name'],
            'width': frame.get('width') or IMAGE_WIDTH,
            'height': frame.get('height') or IMAGE_HEIGHT,
            **{key: attributes.get(key, 'undefined') for key in IMAGE_ATTRIBUTES},
            'boxes': [],
        }
        for label in frame.get('labels') or []:
            box = label.get('box2d')
            if not box:
                continue  # poly2d: drivable area / lane marking
            cls = canonical_class(label['category'])
            if cls not in DET_CLASSES:
                continue
            own = label.get('attributes') or {}
            x1, y1, x2, y2 = (float(box[k]) for k in ('x1', 'y1', 'x2', 'y2'))
            record['boxes'].append({
                'id': str(label.get('id', len(record['boxes']))),
                'label': cls,
                'x': x1, 'y': y1, 'width': x2 - x1, 'height': y2 - y1,
                'gt_occluded': bool(own.get('occluded', False)),
                'gt_truncated': bool(own.get('truncated', False)),
            })
        out.append(record)
    return out


def stratified_subset(frames, size, seed=0):
    """Pick `size` frames keeping the timeofday x weather mix of the full split.

    A uniform sample would under-represent night/rainy frames, which is where
    the interesting errors live, so strata are sampled proportionally.
    """
    import random
    rng = random.Random(seed)
    groups = {}
    for frame in frames:
        groups.setdefault((frame['timeofday'], frame['weather']), []).append(frame)
    picked, total = [], len(frames)
    for key in sorted(groups):
        group = sorted(groups[key], key=lambda f: f['name'])
        rng.shuffle(group)
        picked.extend(group[:max(1, round(size * len(group) / total))])
    # Per-stratum rounding leaves the total a few short; top up from what is left
    # so the subset size is exactly what the caller asked for.
    if len(picked) < size:
        chosen = {f['name'] for f in picked}
        spare = [f for f in sorted(frames, key=lambda f: f['name']) if f['name'] not in chosen]
        rng.shuffle(spare)
        picked.extend(spare[:size - len(picked)])
    rng.shuffle(picked)
    return picked[:size]


def summarize(frames):
    from collections import Counter
    boxes = [b for f in frames for b in f['boxes']]
    return {
        'frames': len(frames),
        'boxes': len(boxes),
        'boxes_per_frame': round(len(boxes) / max(1, len(frames)), 2),
        'classes': dict(Counter(b['label'] for b in boxes).most_common()),
        'timeofday': dict(Counter(f['timeofday'] for f in frames).most_common()),
        'weather': dict(Counter(f['weather'] for f in frames).most_common()),
        'occluded_rate': round(sum(b['gt_occluded'] for b in boxes) / max(1, len(boxes)), 3),
        'truncated_rate': round(sum(b['gt_truncated'] for b in boxes) / max(1, len(boxes)), 3),
    }


if __name__ == '__main__':
    import sys
    print(json.dumps(summarize(load(sys.argv[1])), indent=2, ensure_ascii=False))
