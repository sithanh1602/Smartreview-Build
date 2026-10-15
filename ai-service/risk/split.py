"""Pick the working subset and pull just those images out of the 6.3 GB archive.

Scope follows the team plan v1.4: the five vehicle classes only, GT boxes below
10x10 px dropped from error accounting, `train` and `rider` out of evaluation.
Sampling is stratified by timeofday x weather because the detector is weakest at
night, and a uniform draw would under-represent exactly the hard cases.

Usage:
  python split.py --labels <val.json> --zip <bdd100k.zip> --out <dir> [--size 1500]
"""
import argparse
import json
import random
import zipfile
from pathlib import Path

import bdd

VEHICLES = ('car', 'truck', 'bus', 'motorcycle', 'bicycle')
MIN_GT_SIDE = 10
ARCHIVE_VAL_PREFIX = 'bdd100k/images/100k/val/'
# 300 images freed by dropping the fine-tune stage go to calibration, as the
# plan's risk table prescribes when Model A is cut.
SPLIT_RATIO = {'calibration': 0.6, 'test': 0.4}


# Out of evaluation but still real objects: a prediction landing on one of these
# is neither a hit nor a false alarm (plan v1.4: rider/train excluded, GT under
# 10x10 px ignored). Dropping them outright would turn those predictions into FPs.
IGNORED_CLASSES = ('rider', 'train')


def vehicles_only(frames):
    """Split GT into scored vehicle boxes and ignore regions.

    Both filters change what counts as an error, so the counts are reported and
    belong in the write-up rather than happening silently.
    """
    counts = {'kept': 0, 'ignored_below_10px': 0, 'ignored_class': 0, 'dropped_other_class': 0}
    out = []
    for frame in frames:
        boxes, ignore = [], []
        for box in frame['boxes']:
            if box['label'] in IGNORED_CLASSES:
                ignore.append(box)
                counts['ignored_class'] += 1
            elif box['label'] not in VEHICLES:
                counts['dropped_other_class'] += 1
            elif box['width'] < MIN_GT_SIDE or box['height'] < MIN_GT_SIDE:
                ignore.append(box)
                counts['ignored_below_10px'] += 1
            else:
                boxes.append(box)
                counts['kept'] += 1
        out.append({**frame, 'boxes': boxes, 'ignore': ignore})
    return out, counts


def split(frames, seed=0):
    """Disjoint calibration / test sets, stratified, split by image."""
    rng = random.Random(seed)
    groups = {}
    for frame in frames:
        groups.setdefault((frame['timeofday'], frame['weather']), []).append(frame)
    out = {name: [] for name in SPLIT_RATIO}
    for key in sorted(groups):
        group = sorted(groups[key], key=lambda f: f['name'])
        rng.shuffle(group)
        cut = round(len(group) * SPLIT_RATIO['calibration'])
        out['calibration'].extend(group[:cut])
        out['test'].extend(group[cut:])
    for name in out:
        rng.shuffle(out[name])
    return out


def extract(archive, names, destination):
    destination.mkdir(parents=True, exist_ok=True)
    wanted = {f'{ARCHIVE_VAL_PREFIX}{name}' for name in names}
    written, missing = 0, []
    with zipfile.ZipFile(archive) as z:
        present = {i.filename for i in z.infolist() if not i.is_dir()}
        for member in sorted(wanted):
            if member not in present:
                missing.append(member.rsplit('/', 1)[-1])
                continue
            # Flatten to the bare basename: archive paths are untrusted input.
            with z.open(member) as fh, open(destination / Path(member).name, 'wb') as dst:
                dst.write(fh.read())
            written += 1
    return written, missing


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--labels', type=Path, required=True)
    parser.add_argument('--zip', dest='archive', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--size', type=int, default=1500)
    parser.add_argument('--seed', type=int, default=0)
    parser.add_argument('--skip-images', action='store_true')
    args = parser.parse_args()

    frames = bdd.load(args.labels)
    scoped, counts = vehicles_only(frames)
    print(f'val frames: {len(scoped)}   boxes: {counts}')

    subset = bdd.stratified_subset(scoped, args.size, seed=args.seed)
    parts = split(subset, seed=args.seed)
    args.out.mkdir(parents=True, exist_ok=True)

    manifest = {
        'source_labels': args.labels.name,
        'size': len(subset),
        'seed': args.seed,
        'scope': {'classes': list(VEHICLES), 'min_gt_side_px': MIN_GT_SIDE},
        'box_counts': counts,
        'splits': {name: [f['name'] for f in group] for name, group in parts.items()},
    }
    (args.out / 'subset.json').write_text(
        json.dumps({**manifest, 'frames': subset}, ensure_ascii=False), encoding='utf-8')
    (args.out / 'manifest.json').write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')

    for name, group in parts.items():
        print(f'  {name:12} {len(group):>5} images  '
              f'{sum(len(f["boxes"]) for f in group):>6} vehicle boxes  '
              f'night {sum(f["timeofday"] == "night" for f in group):>4}')

    if args.skip_images:
        print('images skipped (--skip-images)')
        return
    written, missing = extract(args.archive, [f['name'] for f in subset], args.out / 'images')
    print(f'extracted {written} images -> {args.out / "images"}')
    if missing:
        print(f'MISSING {len(missing)} images, e.g. {missing[:3]}')


if __name__ == '__main__':
    main()
