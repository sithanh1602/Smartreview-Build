"""Match detector output to BDD100K GT and label every error (plan v1.4, step C1).

Pass 1 - same class, greedy by descending confidence (COCOeval style): each
         prediction takes the best still-free GT with IoU >= 0.5.
         IoU >= 0.7 -> correct, 0.5-0.7 -> badloc (n_loc_err).
Pass 2 - leftovers only: an unmatched prediction overlapping an unmatched GT of a
         different class at IoU >= 0.5 is a class swap (n_cls_err). It counts
         once, not as one FP plus one FN.
Then   - an unmatched prediction overlapping an ignore region at IoU >= 0.5 is
         dropped; any other unmatched prediction is a FP; unmatched GT is a FN.

Only predictions with confidence >= WORKING_CONF are matched. Lower ones are
kept only as the grey-zone signal.
"""
import json

WORKING_CONF = 0.3
MATCH_IOU = 0.5
CORRECT_IOU = 0.7


def iou(a, b):
    ix = max(0.0, min(a['x'] + a['width'], b['x'] + b['width']) - max(a['x'], b['x']))
    iy = max(0.0, min(a['y'] + a['height'], b['y'] + b['height']) - max(a['y'], b['y']))
    inter = ix * iy
    union = a['width'] * a['height'] + b['width'] * b['height'] - inter
    return inter / union if union > 0 else 0.0


def match_frame(gt, ignore, predictions):
    preds = sorted((p for p in predictions if p['confidence'] >= WORKING_CONF),
                   key=lambda p: -p['confidence'])
    gt_used = [False] * len(gt)
    outcome = [None] * len(preds)       # per prediction: tp / badloc / cls / fp / ignored
    pairs = []

    # Pass 1: same class.
    for i, p in enumerate(preds):
        best, best_iou = None, MATCH_IOU
        for j, g in enumerate(gt):
            if gt_used[j] or g['label'] != p['label']:
                continue
            overlap = iou(p, g)
            if overlap >= best_iou:
                best, best_iou = j, overlap
        if best is not None:
            gt_used[best] = True
            outcome[i] = 'tp' if best_iou >= CORRECT_IOU else 'badloc'
            pairs.append((i, best, best_iou))

    # Pass 2: class swaps among the leftovers.
    for i, p in enumerate(preds):
        if outcome[i] is not None:
            continue
        best, best_iou = None, MATCH_IOU
        for j, g in enumerate(gt):
            if gt_used[j]:
                continue
            overlap = iou(p, g)
            if overlap >= best_iou:
                best, best_iou = j, overlap
        if best is not None:
            gt_used[best] = True
            outcome[i] = 'cls'
            pairs.append((i, best, best_iou))

    # Ignore regions, then false positives.
    for i, p in enumerate(preds):
        if outcome[i] is None:
            outcome[i] = ('ignored' if any(iou(p, r) >= MATCH_IOU for r in ignore)
                          else 'fp')

    missed = [g for g, used in zip(gt, gt_used) if not used]
    return {
        'n_gt': len(gt),
        'n_tp': outcome.count('tp'),
        'n_loc_err': outcome.count('badloc'),
        'n_cls_err': outcome.count('cls'),
        'n_fp': outcome.count('fp'),
        'n_ignored': outcome.count('ignored'),
        'n_fn': len(missed),
        'predictions': [{**p, 'outcome': o} for p, o in zip(preds, outcome)],
        'missed': missed,
    }


def label_errors(frame_result):
    r = frame_result
    r['n_errors'] = r['n_fn'] + r['n_fp'] + r['n_cls_err'] + r['n_loc_err']
    r['n_missed_10px'] = r['n_fn']    # GT under 10x10 is already an ignore region
    r['has_error'] = int(r['n_errors'] > 0)
    return r


def run(subset, predictions):
    out = {}
    for frame in subset['frames']:
        result = match_frame(frame['boxes'], frame.get('ignore', []),
                             predictions['frames'].get(frame['name'], []))
        out[frame['name']] = label_errors(result)
    return out


def main():
    import argparse
    from pathlib import Path
    parser = argparse.ArgumentParser()
    parser.add_argument('--subset', type=Path, required=True)
    parser.add_argument('--predictions', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    subset = json.loads(args.subset.read_text(encoding='utf-8'))
    predictions = json.loads(args.predictions.read_text(encoding='utf-8'))
    results = run(subset, predictions)
    args.out.write_text(json.dumps(results, ensure_ascii=False), encoding='utf-8')

    totals = {k: sum(r[k] for r in results.values())
              for k in ('n_gt', 'n_tp', 'n_loc_err', 'n_cls_err', 'n_fp', 'n_fn', 'n_ignored')}
    n = len(results)
    with_error = sum(r['has_error'] for r in results.values())
    with_miss = sum(r['n_fn'] > 0 for r in results.values())
    print(f'images {n}   with any error {with_error} ({with_error / n:.1%})   '
          f'with >=1 missed vehicle {with_miss} ({with_miss / n:.1%})')
    print('totals', totals)
    tp = totals['n_tp'] + totals['n_loc_err']
    print(f'precision@IoU0.5 {tp / max(1, tp + totals["n_fp"] + totals["n_cls_err"]):.3f}   '
          f'recall@IoU0.5 {tp / max(1, totals["n_gt"]):.3f}')


if __name__ == '__main__':
    main()
