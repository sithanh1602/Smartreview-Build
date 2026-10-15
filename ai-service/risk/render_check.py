"""Draw GT and matched predictions so the matcher can be checked by eye (plan C1:
20 images checked by hand must agree with the errors the code assigned).

  green  = GT matched (tp)          blue   = prediction tp
  red    = GT missed (FN)           orange = prediction FP
  yellow = badloc / class swap      grey   = grey-zone prediction (0.05-0.3)
"""
import argparse
import json
import math
from pathlib import Path

import cv2

COLORS = {'tp': (255, 120, 0), 'badloc': (0, 220, 255), 'cls': (0, 220, 255),
          'fp': (0, 140, 255), 'ignored': (160, 160, 160)}


def rect(img, b, color, width, text=None):
    p1 = (int(b['x']), int(b['y']))
    p2 = (int(b['x'] + b['width']), int(b['y'] + b['height']))
    cv2.rectangle(img, p1, p2, color, width)
    if text:
        cv2.putText(img, text, (p1[0], max(12, p1[1] - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                    color, 1, cv2.LINE_AA)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--names', nargs='+', required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    subset = {f['name']: f for f in json.loads((args.work / 'subset.json').read_text(encoding='utf-8'))['frames']}
    matches = json.loads((args.work / 'matches.json').read_text(encoding='utf-8'))
    preds = json.loads((args.work / 'predictions.json').read_text(encoding='utf-8'))['frames']
    args.out.mkdir(parents=True, exist_ok=True)
    for name in args.names:
        img = cv2.imread(str(args.work / 'images' / name))
        m, frame = matches[name], subset[name]
        missed = {id(g) for g in m['missed']}
        missed_keys = {(g['x'], g['y'], g['width']) for g in m['missed']}
        for p in preds.get(name, []):
            if 0.05 <= p['confidence'] < 0.3:
                rect(img, p, (150, 150, 150), 1)
        for g in frame['boxes']:
            is_missed = (g['x'], g['y'], g['width']) in missed_keys
            rect(img, g, (0, 0, 255) if is_missed else (0, 200, 0), 3 if is_missed else 1,
                 f"FN {g['label']} {int(math.sqrt(g['width'] * g['height']))}px"
                 + (' occ' if g['gt_occluded'] else '') if is_missed else None)
        for p in m['predictions']:
            rect(img, p, COLORS[p['outcome']], 2,
                 f"{p['outcome']} {p['label']} {p['confidence']:.2f}" if p['outcome'] != 'tp' else None)
        summary = (f"GT {m['n_gt']}  tp {m['n_tp']}  loc {m['n_loc_err']}  cls {m['n_cls_err']}  "
                   f"fp {m['n_fp']}  fn {m['n_fn']}  {frame['timeofday']}")
        cv2.rectangle(img, (0, 0), (img.shape[1], 26), (0, 0, 0), -1)
        cv2.putText(img, summary, (8, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
        cv2.imwrite(str(args.out / name), img)
    print(f'rendered {len(args.names)} -> {args.out}')


if __name__ == '__main__':
    main()
