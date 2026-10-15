"""Signal table -> risk scorer -> benchmark on the held-out test split.

Every scorer ranks images "review first" to "review last"; the simulated perfect
reviewer fixes every error in an image it opens (plan v1.4, E1). Scorers:
    random              no prioritisation
    confidence_only     1 - lowest box score (the plan's hardest baseline)
    engine_2.1.0        the web app's rule engine without confidence checks
    engine_2.2.0        the same engine with the new confidence checks
    engine_6.0.0        the policy engine, a low confidence alone below the queue (optional)
    engine_7.0.0        the same policy with low_confidence at 30, what new uploads run (optional)
    risk_model          Poisson regression on the signal table, fit on calibration
    risk_model_no_conf  same, with every confidence-derived signal removed
    risk_model_per_hour predicted errors / predicted review seconds
    oracle              sorted by the true error count - the ceiling, not a method
    oracle_per_hour     sorted by true errors per true review second

Two budgets, two views: share of IMAGES reviewed (the plan's axis) and share of
reviewer HOURS. They disagree when the scorer prefers crowded images, which hold
more errors but also cost more to fix - report both.

has_error is ~97% positive with YOLO11n on BDD100K, so it cannot separate images;
the target is the error count, and the scorer is a Poisson regression on it.
"""
import argparse
import csv
import json
import math
import random
from pathlib import Path

import numpy as np

WORKING_CONF = 0.3
GREY = (0.05, 0.3)
LOW = 0.5
SMALL_SIDE = 32
BAD_WEATHER = {'rainy', 'snowy', 'foggy'}
# Su et al. medians from the plan (appendix 2); fixing is an internal estimate.
COST_VERIFY, COST_FIX, COST_DRAW = 9.0, 20.0, 25.5
ALPHA = 0.02
ALPHA_SIZES = (10, 32, 64)
BUDGETS = (0.1, 0.2, 0.3, 0.5)

SIGNALS = ('log_n_pred', 'log_n_grey', 'log_n_low', 'min_score', 'mean_score', 'no_pred',
           'log_n_small_pred', 'log_n_grey_small', 'max_overlap', 'night', 'dawn_dusk',
           'bad_weather')
CONFIDENCE_SIGNALS = {'log_n_grey', 'log_n_low', 'min_score', 'mean_score', 'log_n_grey_small'}


def iou(a, b):
    ix = max(0.0, min(a['x'] + a['width'], b['x'] + b['width']) - max(a['x'], b['x']))
    iy = max(0.0, min(a['y'] + a['height'], b['y'] + b['height']) - max(a['y'], b['y']))
    union = a['width'] * a['height'] + b['width'] * b['height'] - ix * iy
    return ix * iy / union if union > 0 else 0.0


def side(p):
    return math.sqrt(max(0.0, p['width'] * p['height']))


def signals(frame, preds):
    """Image-level signals from detector output and image metadata only - no GT.

    The plan's n_small counted small GT boxes; that is the answer key and does not
    exist at deployment, so it is counted on predictions here.
    """
    working = [p for p in preds if p['confidence'] >= WORKING_CONF]
    grey = [p for p in preds if GREY[0] <= p['confidence'] < GREY[1]]
    scores = [p['confidence'] for p in working]
    overlap = max((iou(a, b) for i, a in enumerate(working) for b in working[i + 1:]),
                  default=0.0)
    return {
        'log_n_pred': math.log1p(len(working)),
        'log_n_grey': math.log1p(len(grey)),
        'log_n_low': math.log1p(sum(s < LOW for s in scores)),
        # No confident box at all: treat as the working floor, the least sure case.
        'min_score': min(scores, default=WORKING_CONF),
        'mean_score': sum(scores) / len(scores) if scores else WORKING_CONF,
        'no_pred': float(not working),
        'log_n_small_pred': math.log1p(sum(side(p) < SMALL_SIDE for p in working)),
        'log_n_grey_small': math.log1p(sum(side(p) < SMALL_SIDE for p in grey)),
        'max_overlap': overlap,
        'night': float(frame['timeofday'] == 'night'),
        'dawn_dusk': float(frame['timeofday'] == 'dawn/dusk'),
        'bad_weather': float(frame['weather'] in BAD_WEATHER),
    }


def review_cost(m):
    """Seconds a reviewer spends to bring this image to GT."""
    shown = m['n_tp'] + m['n_loc_err'] + m['n_cls_err'] + m['n_fp']
    return (COST_VERIFY * shown + COST_FIX * (m['n_loc_err'] + m['n_cls_err'])
            + COST_DRAW * m['n_fn'])


def wilson_upper(k, n, z=1.96):
    if n == 0:
        return 1.0
    p = k / n
    centre = p + z * z / (2 * n)
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (centre + margin) / (1 + z * z / n)


def order(scores, seed=0):
    rng = random.Random(seed)
    jitter = [rng.random() for _ in scores]
    return sorted(range(len(scores)), key=lambda i: (-scores[i], jitter[i]))


def curve(scores, errors, costs, seed=0):
    idx = order(scores, seed)
    total_err, total_cost = sum(errors), sum(costs)
    xs, ys, hs = [0.0], [0.0], [0.0]
    caught = spent = 0.0
    for rank, i in enumerate(idx, start=1):
        caught += errors[i]
        spent += costs[i]
        xs.append(rank / len(idx))
        ys.append(caught / total_err)
        hs.append(spent / total_cost)
    return xs, ys, hs


def at_budget(xs, ys, budget):
    return next(y for x, y in zip(xs, ys) if x >= budget - 1e-12)


def missed_at_least(m, size):
    return any(side(g) >= size for g in m['missed'])


def alpha_policy(cal_scores, cal_m, test_scores, test_m, size):
    """Largest auto-accept share whose Wilson upper bound on 'image still misses a
    vehicle >= size' stays <= ALPHA. Chosen on calibration, reported on test."""
    idx = order(cal_scores)[::-1]                     # lowest risk first
    best, bad = None, 0
    for k, i in enumerate(idx, start=1):
        bad += missed_at_least(cal_m[i], size)
        if k >= 30 and wilson_upper(bad, k) <= ALPHA:
            best = k
    if best is None:
        return {'size_px': size, 'auto_accept_share_test': 0.0, 'auto_accepted_images_test': 0,
                'note': 'no threshold meets alpha on calibration'}
    # One notch safer than the threshold that just passed (selection-bias margin).
    best = max(1, int(best * 0.9))
    tau = sorted(cal_scores)[best - 1]
    accepted = [m for s, m in zip(test_scores, test_m) if s <= tau]
    bad = sum(missed_at_least(m, size) for m in accepted)
    upper = wilson_upper(bad, len(accepted))
    return {
        'size_px': size,
        'tau': round(float(tau), 5),
        'auto_accept_share_test': round(len(accepted) / len(test_m), 4),
        'auto_accepted_images_test': len(accepted),
        'observed_rate': round(bad / max(1, len(accepted)), 4),
        'wilson_upper': round(upper, 4),
        'meets_alpha': upper <= ALPHA,
        'enough_for_rule_of_three': len(accepted) >= 150,
    }


def fit_poisson(X, y):
    from sklearn.linear_model import PoissonRegressor
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    return make_pipeline(StandardScaler(), PoissonRegressor(alpha=1e-3, max_iter=1000)).fit(X, y)


def matrix(rows, cols):
    return np.array([[r[c] for c in cols] for r in rows])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work', type=Path, required=True)
    args = parser.parse_args()
    w = args.work
    subset = json.loads((w / 'subset.json').read_text(encoding='utf-8'))
    preds = json.loads((w / 'predictions.json').read_text(encoding='utf-8'))['frames']
    matches = json.loads((w / 'matches.json').read_text(encoding='utf-8'))
    # 2.1.0 and 2.2.0 are required; the policy engines join when their file exists.
    OPTIONAL = ('6.0.0', '7.0.0')
    engines = {v: json.loads((w / f'engine_{v}.json').read_text(encoding='utf-8'))['perImage']
               for v in ('2.1.0', '2.2.0') + OPTIONAL
               if v not in OPTIONAL or (w / f'engine_{v}.json').exists()}
    frames = {f['name']: f for f in subset['frames']}

    rows = []
    for split_name, names in subset['splits'].items():
        for name in names:
            m = matches[name]
            row = {'image_id': name, 'split': split_name,
                   'timeofday': frames[name]['timeofday'], 'weather': frames[name]['weather'],
                   **signals(frames[name], preds.get(name, []))}
            row.update({k: m[k] for k in ('n_gt', 'n_fn', 'n_fp', 'n_cls_err', 'n_loc_err',
                                           'n_errors', 'has_error')})
            row['review_seconds'] = review_cost(m)
            for v, table in engines.items():
                e = table.get(name, {'max': 0, 'sum': 0})
                row[f'engine_{v}'] = e['max'] + e['sum'] / 1e4   # max first, sum breaks ties
            rows.append(row)
    with open(w / 'signal_table.csv', 'w', newline='', encoding='utf-8') as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    cal = [r for r in rows if r['split'] == 'calibration']
    test = [r for r in rows if r['split'] == 'test']
    target = lambda rs: np.array([r['n_errors'] for r in rs])
    no_conf = [c for c in SIGNALS if c not in CONFIDENCE_SIGNALS]

    # 5-fold CV on calibration, for the record: does the rank order hold?
    from scipy.stats import spearmanr
    from sklearn.model_selection import KFold
    cv = []
    for tr, va in KFold(5, shuffle=True, random_state=0).split(cal):
        model = fit_poisson(matrix([cal[i] for i in tr], SIGNALS), target([cal[i] for i in tr]))
        held = [cal[i] for i in va]
        cv.append(spearmanr(model.predict(matrix(held, SIGNALS)), target(held)).statistic)

    full = fit_poisson(matrix(cal, SIGNALS), target(cal))
    lean = fit_poisson(matrix(cal, no_conf), target(cal))
    timing = fit_poisson(matrix(cal, SIGNALS), np.array([r['review_seconds'] for r in cal]))
    rng = random.Random(0)
    scorers = {
        'random': lambda rs: [rng.random() for _ in rs],
        'confidence_only': lambda rs: [1 - r['min_score'] for r in rs],
        'engine_2.1.0': lambda rs: [r['engine_2.1.0'] for r in rs],
        'engine_2.2.0': lambda rs: [r['engine_2.2.0'] for r in rs],
        **{f'engine_{v}': (lambda v: lambda rs: [r[f'engine_{v}'] for r in rs])(v)
           for v in OPTIONAL if v in engines},
        'risk_model': lambda rs: list(full.predict(matrix(rs, SIGNALS))),
        'risk_model_no_conf': lambda rs: list(lean.predict(matrix(rs, no_conf))),
        'risk_model_per_hour': lambda rs: list(full.predict(matrix(rs, SIGNALS))
                                               / timing.predict(matrix(rs, SIGNALS))),
        'oracle': lambda rs: [r['n_errors'] for r in rs],
        'oracle_per_hour': lambda rs: [r['n_errors'] / max(1.0, r['review_seconds']) for r in rs],
    }

    errors = [r['n_errors'] for r in test]
    costs = [r['review_seconds'] for r in test]
    report = {
        'test_images': len(test), 'test_errors': sum(errors),
        'review_all_hours': round(sum(costs) / 3600, 2),
        'cv_spearman_calibration': [round(float(s), 3) for s in cv],
        'coefficients': dict(zip(SIGNALS, [round(float(c), 3) for c in full[-1].coef_])),
        'scorers': {}, 'curves': {}, 'alpha': {},
    }
    for name, score in scorers.items():
        test_scores = score(test)
        xs, ys, hs = curve(test_scores, errors, costs)
        report['scorers'][name] = {
            'spearman': round(float(spearmanr(test_scores, errors).statistic), 3),
            'error_recall_at': {f'{int(b * 100)}%': round(at_budget(xs, ys, b), 3)
                                for b in BUDGETS},
            'hours_at': {f'{int(b * 100)}%': round(at_budget(xs, hs, b) * sum(costs) / 3600, 2)
                         for b in BUDGETS},
            'error_recall_at_hours': {f'{int(b * 100)}%': round(at_budget(hs, ys, b), 3)
                                      for b in BUDGETS},
        }
        step = max(1, len(xs) // 200)
        report['curves'][name] = {'x': xs[::step], 'y': ys[::step]}
        report.setdefault('curves_hours', {})[name] = {'x': hs[::step], 'y': ys[::step]}
        if name in ('confidence_only', 'engine_2.2.0', 'risk_model'):
            cal_scores = score(cal)
            report['alpha'][name] = [
                alpha_policy(cal_scores, [matches[r['image_id']] for r in cal],
                             test_scores, [matches[r['image_id']] for r in test], s)
                for s in ALPHA_SIZES]

    # Slices: does the policy hold up at night?
    model_scores = scorers['risk_model'](test)
    report['slices'] = {}
    for slice_name in ('daytime', 'night', 'dawn/dusk'):
        keep = [i for i, r in enumerate(test) if r['timeofday'] == slice_name]
        if len(keep) < 30:
            continue
        xs, ys, _ = curve([model_scores[i] for i in keep], [errors[i] for i in keep],
                          [costs[i] for i in keep])
        report['slices'][slice_name] = {'images': len(keep),
                                        'error_recall_at_20%': round(at_budget(xs, ys, 0.2), 3)}

    (w / 'benchmark.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f"test: {report['test_images']} images, {report['test_errors']} errors, "
          f"review-all {report['review_all_hours']} h   CV spearman {report['cv_spearman_calibration']}")
    print(f"{'scorer':20}{'spearman':>9}  "
          + '  '.join(f'recall@{int(b * 100)}%' for b in BUDGETS))
    for name, s in report['scorers'].items():
        print(f'{name:20}{s["spearman"]:>9}  '
              + '  '.join(f'{v:>10}' for v in s['error_recall_at'].values()))
    print(f"{'per reviewer-hour':20}{'':>9}  "
          + '  '.join(f'hours@{int(b * 100)}%' for b in BUDGETS))
    for name, s_ in report['scorers'].items():
        print(f'{name:20}{"":>9}  '
              + '  '.join(f'{v:>9}' for v in s_['error_recall_at_hours'].values()))
    print('alpha (auto-accept, alpha=2%, Wilson upper bound, test):')
    for name, entries in report['alpha'].items():
        for a in entries:
            print(f"  {name:16} >= {a['size_px']:>2}px  auto-accept "
                  f"{a.get('auto_accept_share_test', 0):6.1%} "
                  f"({a.get('auto_accepted_images_test', 0)} imgs)  "
                  f"observed {a.get('observed_rate', '-')}  wilson_ub {a.get('wilson_upper', '-')}  "
                  f"ok={a.get('meets_alpha', False)}")
    print('slices', report['slices'])
    print('coefficients', report['coefficients'])


if __name__ == '__main__':
    main()
