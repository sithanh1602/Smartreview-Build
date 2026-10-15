"""Review queue: every image ranked by predicted error count, with a tier and a
reason a reviewer can read (plan v1.4, step 14-15).

Tiers
  3 re-annotate   top REANNOTATE_SHARE by predicted errors: redraw from scratch
  2 verify        everything else: skim, fix what is wrong
  1 auto-accept   only below the tau chosen by run_benchmark's alpha analysis;
                  empty while no tau meets alpha - the queue says so instead of
                  silently skipping images
Hard rules (plan D2) force tier >= 2 regardless of score: a bus in the image, or
a night image with many grey-zone boxes.
"""
import argparse
import csv
import json
import math
from pathlib import Path

import run_benchmark as rb

REANNOTATE_SHARE = 0.15
HARD_RULE_NIGHT_GREY = 5


def reasons(row, preds):
    out = []
    n_grey = round(math.expm1(row['log_n_grey']))
    n_low = round(math.expm1(row['log_n_low']))
    n_small = round(math.expm1(row['log_n_small_pred']))
    if row['no_pred']:
        out.append('không có box nào confidence ≥ 0.3')
    if n_grey:
        out.append(f'{n_grey} box vùng xám (nghi sót xe)')
    if n_low:
        out.append(f'{n_low} box confidence < 0.5')
    if n_small:
        out.append(f'{n_small} xe nhỏ < 32px')
    if row['max_overlap'] >= 0.5:
        out.append('box chồng lấn mạnh')
    if row['night']:
        out.append('ảnh đêm')
    if row['bad_weather']:
        out.append('thời tiết xấu')
    if any(p['label'] == 'bus' and p['confidence'] >= rb.WORKING_CONF for p in preds):
        out.append('có bus (lớp hiếm)')
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--split', default='test')
    parser.add_argument('--tau', type=float, default=None,
                        help='auto-accept threshold on predicted errors; omit while alpha is unmet')
    args = parser.parse_args()
    w = args.work
    rows = list(csv.DictReader(open(w / 'signal_table.csv', encoding='utf-8')))
    for r in rows:
        for k in rb.SIGNALS:
            r[k] = float(r[k])
        r['n_errors'] = int(r['n_errors'])
    preds = json.loads((w / 'predictions.json').read_text(encoding='utf-8'))['frames']
    cal = [r for r in rows if r['split'] == 'calibration']
    pool = [r for r in rows if r['split'] == args.split]
    model = rb.fit_poisson(rb.matrix(cal, rb.SIGNALS), [r['n_errors'] for r in cal])
    for r, risk in zip(pool, model.predict(rb.matrix(pool, rb.SIGNALS))):
        r['risk'] = float(risk)
    pool.sort(key=lambda r: -r['risk'])

    cut = int(len(pool) * REANNOTATE_SHARE)
    queue = []
    for rank, r in enumerate(pool, start=1):
        image_preds = preds.get(r['image_id'], [])
        why = reasons(r, image_preds)
        hard = ('có bus (lớp hiếm)' in why
                or (r['night'] and math.expm1(r['log_n_grey']) >= HARD_RULE_NIGHT_GREY))
        if rank <= cut:
            tier = 3
        elif args.tau is not None and r['risk'] <= args.tau and not hard:
            tier = 1
        else:
            tier = 2
        queue.append({'rank': rank, 'image_id': r['image_id'], 'tier': tier,
                      'tier_name': {1: 'tự động nhận', 2: 'xác minh', 3: 'gán lại'}[tier],
                      'predicted_errors': round(r['risk'], 2),
                      'hard_rule': int(hard), 'reasons': '; '.join(why),
                      'timeofday': r['timeofday'], 'weather': r['weather'],
                      # Ground truth, for the demo only - a live queue has no such column.
                      'actual_errors_gt': r['n_errors']})
    out = w / f'review_queue_{args.split}.csv'
    with open(out, 'w', newline='', encoding='utf-8-sig') as fh:
        writer = csv.DictWriter(fh, fieldnames=list(queue[0]))
        writer.writeheader()
        writer.writerows(queue)
    counts = {t: sum(q['tier'] == t for q in queue) for t in (1, 2, 3)}
    print(f'{len(queue)} images -> {out}')
    print(f'tier 1 tự động nhận {counts[1]}   tier 2 xác minh {counts[2]}   tier 3 gán lại {counts[3]}'
          + ('' if args.tau is not None else '   (tier 1 rỗng: chưa có tau đạt alpha)'))
    for q in queue[:5]:
        print(f"  #{q['rank']:<3} {q['tier_name']:9} dự đoán {q['predicted_errors']:5.1f} lỗi "
              f"(thật {q['actual_errors_gt']:>2})  {q['reasons']}")


if __name__ == '__main__':
    main()
