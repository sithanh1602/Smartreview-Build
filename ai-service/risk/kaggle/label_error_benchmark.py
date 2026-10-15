# %% [markdown]
# # SmartReview — Confidence-based review of AI-assisted annotation (BDD100K)
#
# **The workflow being reviewed** — the one the web app already supports
# (`prelabel_tracking.py` → `export_greensm_cvat_tracks.py` → CVAT → import):
#
# 1. A pretrained detector **pre-labels** every image; boxes with confidence ≥ 0.25 go to CVAT.
# 2. An **annotator** fixes them: keeps, moves, re-classes or deletes AI boxes, and draws the
#    vehicles the AI missed.
# 3. A **reviewer** checks the annotator's final boxes and files issues.
#
# So almost every final box carries the **confidence** of the AI box it came from, plus an
# **edit history** (kept as-is / edited / deleted / drawn by hand). The question: which boxes and
# images should the reviewer open, and which can be accepted without a look?
#
# **How errors are measured.** BDD100K's labels are the truth. The pre-label is a real YOLO run.
# The annotator is simulated with documented behaviour from the literature: they confirm the AI's
# class more often than they should and under-inspect slightly misplaced boxes, especially when the
# AI looks confident (automation bias — arXiv 2609.21822, 2509.08514, 2605.12303), and they miss
# small or occluded vehicles the AI did not propose. Every rate is in `ANNOTATOR` below: these are
# assumptions to replace with your own review statistics once reviewers have filed issues.
#
# **Scorers** (higher = review first):
# | scorer | uses |
# |---|---|
# | random | nothing |
# | rules_only | box geometry only — like the web app's rule engine without confidence |
# | confidence_only | **the build-phase brief, literally**: low pre-label confidence, plus the hidden grey-zone boxes (0.05–0.25) the annotator never saw |
# | second_opinion | a second, stronger detector's agreement only (the "score baseline" of arXiv 2609.21822) |
# | objectlab_tuned | cleanlab ObjectLab (Tkachenko et al., 2023) on the second detector, thresholds tuned to it |
# | model_no_second | learned: pre-label confidence + edit history + geometry — **no extra model at review time** |
# | model_no_history | learned: everything except the edit history |
# | model | learned: everything |
# | oracle | sorted by the true error count — the ceiling |
#
# **To run on Kaggle:** add the `smartreview_bdd_bundle` dataset (`gt.json` + `images/`),
# Accelerator = GPU, Internet = On, *Run all*. Outputs land in `/kaggle/working`.
# Locally: set `SR_INPUT`, `SR_OUT`, `SR_PRELABEL_MODEL`, `SR_SECOND_MODEL`, `SR_MAX_IMAGES`.

# %%
import importlib.util
import subprocess
import sys

for package in ('ultralytics', 'cleanlab'):
    if importlib.util.find_spec(package) is None:
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', package], check=False)

# %%
import json
import math
import os
import random
import time
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import torch

INPUT = Path(os.environ.get('SR_INPUT', '/kaggle/input'))
OUT = Path(os.environ.get('SR_OUT', '/kaggle/working'))
OUT.mkdir(parents=True, exist_ok=True)
CACHE = Path(os.environ.get('SR_CACHE', OUT))   # detector outputs, reused across runs


def find(pattern):
    hits = sorted(INPUT.rglob(pattern))
    if not hits:
        raise FileNotFoundError(f'{pattern} not found under {INPUT} - add the bundle dataset')
    return hits[0]


GT_PATH = find('gt.json')
IMAGE_DIR = find('*.jpg').parent
PRELABEL_MODEL = os.environ.get('SR_PRELABEL_MODEL', 'yolo11n.pt')   # what annotators get
SECOND_MODEL = os.environ.get('SR_SECOND_MODEL', 'yolo11x.pt')       # the reviewer's second opinion
SHOW = 0.25             # pre-label threshold, as in prelabel_tracking.py
DEVICE = 0 if torch.cuda.is_available() else 'cpu'
BATCH = 16 if DEVICE == 0 else 1
IMGSZ = 1280
MAX_IMAGES = int(os.environ.get('SR_MAX_IMAGES', '0'))
SEED = 0

# Simulated annotator. Directions come from the literature; the numbers are assumptions.
ANNOTATOR = {
    # chance to notice a wrong AI box when the AI is least sure; falls for confident AI boxes
    'catch': {'fp': 0.85, 'cls': 0.60, 'loose': 0.45},
    'automation_bias': 0.5,     # catch chance drops by up to 50% for the most confident boxes
    'nudge': 0.15,              # correct AI box tightened anyway
    'wrong_delete': 0.04,       # correct but low-confidence AI box deleted
    'add_floor': 0.50,          # chance to draw a vehicle the AI missed, for a 10px vehicle
    'add_ceiling': 0.95,        # ... and for a vehicle >= 96px
    'occluded_penalty': 0.10,
    'manual_sloppy': 0.04,      # hand-drawn box off by enough to be an error
    'manual_wrong_class': 0.02,
}
# The project guideline decides which vehicles MUST be labelled. A vehicle outside it becomes an
# ignore region: missing it is not an error, and an AI box on it is not a false alarm. The profiles
# follow the spirit of KITTI's Easy / Moderate difficulty levels (min box height, occlusion,
# truncation); swap in the customer's own guideline here. BDD100K gives every box an `occluded`
# and a `truncated` flag, so these rules can be applied to its labels directly.
GUIDELINES = {
    'all':      {'min_height': 10, 'occluded': True,  'truncated': True},
    'moderate': {'min_height': 25, 'occluded': True,  'truncated': True},
    'clear':    {'min_height': 40, 'occluded': False, 'truncated': False},
}
GUIDELINE = os.environ.get('SR_GUIDELINE', 'all')
ALPHA = 0.02            # auto-accepted images allowed to hold an error on a vehicle >= 64px
ALPHA_MIN_SIDE = 64
COST = {'verify': 9.0, 'fix': 20.0, 'draw': 25.5}   # seconds; Su et al. medians
TIER3_SHARE = 0.15
CLASSES = ('car', 'truck', 'bus', 'motorcycle', 'bicycle')
print(f'gt={GT_PATH}\nimages={IMAGE_DIR}\nprelabel={PRELABEL_MODEL} second={SECOND_MODEL} device={DEVICE}')

# %% [markdown]
# ## 1. Ground truth and both detectors
# `conf=0.01` keeps weak detections: they are evidence too. Each model runs twice (original and
# horizontally flipped image): how far a box moves between the two passes is its localization
# uncertainty, which class confidence does not capture (arXiv 2605.12303).

# %%
bundle = json.loads(GT_PATH.read_text(encoding='utf-8'))
split_of = {name: split for split, names in bundle['splits'].items() for name in names}
frames = [f for f in bundle['frames'] if (IMAGE_DIR / f['name']).is_file()]
if MAX_IMAGES:
    frames = frames[:MAX_IMAGES]


def required(b, rule=GUIDELINES[GUIDELINE]):
    return (b['height'] >= rule['min_height']
            and (rule['occluded'] or not b.get('gt_occluded'))
            and (rule['truncated'] or not b.get('gt_truncated')))


total = sum(len(f['boxes']) for f in frames)
frames = [{**f, 'boxes': [b for b in f['boxes'] if required(b)],
           'ignore': f.get('ignore', []) + [b for b in f['boxes'] if not required(b)]} for f in frames]
kept = sum(len(f['boxes']) for f in frames)
print(f'{len(frames)} images; guideline "{GUIDELINE}" {GUIDELINES[GUIDELINE]}: '
      f'{kept}/{total} GT vehicles must be labelled ({kept / total:.0%}), the rest are ignore regions; '
      f'splits {pd.Series([split_of[f["name"]] for f in frames]).value_counts().to_dict()}')


def xyxy(b):
    return (b['x'], b['y'], b['x'] + b['width'], b['y'] + b['height'])


def intersection(a, b):
    ax1, ay1, ax2, ay2 = xyxy(a)
    bx1, by1, bx2, by2 = xyxy(b)
    return max(0.0, min(ax2, bx2) - max(ax1, bx1)) * max(0.0, min(ay2, by2) - max(ay1, by1))


def iou(a, b):
    inter = intersection(a, b)
    union = a['width'] * a['height'] + b['width'] * b['height'] - inter
    return inter / union if union > 0 else 0.0


def side(b):
    return math.sqrt(max(0.0, b['width'] * b['height']))


def box(b):
    return {k: b[k] for k in ('x', 'y', 'width', 'height')}


from ultralytics import YOLO  # noqa: E402


def run_detector(weights, nms=0.7):
    suffix = '' if nms == 0.7 else f'_nms{nms:g}'
    cache = CACHE / f'predictions_{Path(weights).stem}{suffix}.json'
    out = json.loads(cache.read_text()) if cache.is_file() else {}
    if all(f['name'] in out for f in frames):
        return out
    model, names, started = YOLO(weights), [f['name'] for f in frames], time.time()
    for start in range(0, len(names), BATCH):
        batch = names[start:start + BATCH]
        images = [cv2.imread(str(IMAGE_DIR / n)) for n in batch]
        for flip in (False, True):
            source = [im[:, ::-1].copy() for im in images] if flip else images
            results = model.predict(source, device=DEVICE, conf=0.01, iou=nms, imgsz=IMGSZ,
                                    max_det=300, verbose=False)
            for name, im, r in zip(batch, images, results):
                width, boxes = im.shape[1], []
                for (x1, y1, x2, y2), conf, cls in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(),
                                                       r.boxes.cls.tolist()):
                    label = r.names[int(cls)]
                    if label not in CLASSES:
                        continue
                    if flip:
                        x1, x2 = width - x2, width - x1
                    boxes.append({'label': label, 'confidence': round(conf, 5),
                                  'x': x1, 'y': y1, 'width': x2 - x1, 'height': y2 - y1})
                out.setdefault(name, {})['flip' if flip else 'orig'] = boxes
        done = start + len(batch)
        if done % (BATCH * 25) < BATCH or done == len(names):
            rate = (time.time() - started) / done
            print(f'{Path(weights).stem}: {done}/{len(names)}  {rate:.2f}s/img  '
                  f'eta {rate * (len(names) - done) / 60:.1f} min')
    cache.write_text(json.dumps(out))
    return out


pre = run_detector(PRELABEL_MODEL)
so = run_detector(SECOND_MODEL)
# The annotator's pre-label keeps the default NMS (0.7), exactly as prelabel_tracking.py runs it.
# The REVIEW tool may look again with a looser NMS: default NMS deletes a box that overlaps a more
# confident one, and a car hidden behind another car is exactly such a box. Only missing-vehicle
# candidates use these extra passes; the annotation workflow itself is unchanged.
REVIEW_NMS = float(os.environ.get('SR_REVIEW_NMS', '0.7'))
pre_review = pre if REVIEW_NMS == 0.7 else run_detector(PRELABEL_MODEL, REVIEW_NMS)
so_review = so if REVIEW_NMS == 0.7 else run_detector(SECOND_MODEL, REVIEW_NMS)

# %% [markdown]
# ## 2. Pre-label, then the simulated annotator
# The pre-label is what CVAT shows: one box per location (highest confidence across classes),
# confidence ≥ 0.25. Each shown box is judged against GT (correct / slightly off / wrong class /
# nothing there), then the annotator acts on it. Vehicles the pre-label missed must be drawn by hand.

# %%
CONFUSABLE = {'car': ('truck', 'bus'), 'truck': ('car', 'bus'), 'bus': ('truck', 'car'),
              'motorcycle': ('bicycle',), 'bicycle': ('motorcycle',)}


def one_per_location(boxes, threshold=0.7):
    kept = []
    for p in sorted(boxes, key=lambda p: -p['confidence']):
        if all(iou(p, q) < threshold for q in kept):
            kept.append(p)
    return kept


def judge(shown, gts, ignore):
    """Greedy by confidence: same class first (IoU>=0.7 tp, 0.5-0.7 loose), then wrong class."""
    used, status, match = set(), [None] * len(shown), [None] * len(shown)
    order = sorted(range(len(shown)), key=lambda i: -shown[i]['confidence'])
    for same_class in (True, False):
        for i in order:
            if status[i]:
                continue
            best, best_iou = None, 0.5
            for j, g in enumerate(gts):
                if j in used or (same_class and g['label'] != shown[i]['label']):
                    continue
                o = iou(shown[i], g)
                if o >= best_iou:
                    best, best_iou = j, o
            if best is not None:
                used.add(best)
                match[i] = best
                status[i] = ('tp' if best_iou >= 0.7 else 'loose') if same_class else 'cls'
    for i in order:
        if status[i] is None:
            status[i] = 'ignored' if any(iou(shown[i], r) >= 0.5 for r in ignore) else 'fp'
    return status, match, used


def confidence_rank(conf):
    return min(1.0, max(0.0, (conf - SHOW) / (1 - SHOW)))


def redrawn(g, rng, spread=0.04):
    """A careful human box: close to the truth, not pixel-exact (IoU ~0.85-0.95)."""
    w = g['width'] * (1 + rng.uniform(-spread, spread))
    h = g['height'] * (1 + rng.uniform(-spread, spread))
    cx = g['x'] + g['width'] / 2 + rng.uniform(-spread, spread) * g['width'] / 2
    cy = g['y'] + g['height'] / 2 + rng.uniform(-spread, spread) * g['height'] / 2
    return {'x': cx - w / 2, 'y': cy - h / 2, 'width': w, 'height': h}


def sloppy(g, rng):
    """A careless box: on the object, IoU 0.35-0.65 with the truth."""
    for _ in range(100):
        s = rng.uniform(0.6, 1.5)
        w = g['width'] * s * rng.uniform(0.85, 1.15)
        h = g['height'] * s * rng.uniform(0.85, 1.15)
        cx = g['x'] + g['width'] / 2 + rng.uniform(-0.35, 0.35) * g['width']
        cy = g['y'] + g['height'] / 2 + rng.uniform(-0.35, 0.35) * g['height']
        b = {'x': cx - w / 2, 'y': cy - h / 2, 'width': w, 'height': h}
        if 0.35 <= iou(g, b) < 0.65:
            break
    return b


def annotate(frame, rng):
    gts, ignore = frame['boxes'], frame.get('ignore', [])
    shown = one_per_location([p for p in pre[frame['name']]['orig'] if p['confidence'] >= SHOW])
    status, match, used = judge(shown, gts, ignore)
    final, deleted, missed = [], [], []
    a = ANNOTATOR

    def keep(b, label, p, lineage, error, gt):
        final.append({**b, 'label': label, 'pre': p, 'lineage': lineage, 'error': error, 'gt': gt})

    for p, s, j in zip(shown, status, match):
        g = gts[j] if j is not None else None
        notice = a['catch'].get(s, 0) * (1 - a['automation_bias'] * confidence_rank(p['confidence']))
        if s == 'tp':
            if rng.random() < a['wrong_delete'] * (1 - confidence_rank(p['confidence'])):
                deleted.append({'pre': p, 'y': 1, 'gt': g})        # threw a real vehicle away
            elif rng.random() < a['nudge']:
                keep(redrawn(g, rng), p['label'], p, 'edited', 'none', g)
            else:
                keep(box(p), p['label'], p, 'accepted', 'none', g)
        elif s == 'loose':
            if rng.random() < notice:
                keep(redrawn(g, rng), p['label'], p, 'edited', 'none', g)
            else:
                keep(box(p), p['label'], p, 'accepted', 'shift', g)
        elif s == 'cls':
            if rng.random() < notice:
                keep(redrawn(g, rng), g['label'], p, 'edited', 'none', g)
            else:
                keep(box(p), p['label'], p, 'accepted', 'flip', g)
        elif s == 'fp':
            if rng.random() < notice:
                deleted.append({'pre': p, 'y': 0, 'gt': None})
            else:
                keep(box(p), p['label'], p, 'accepted', 'spawn', None)
        elif rng.random() < 0.5:                                    # ignore region: harmless
            deleted.append({'pre': p, 'y': -1, 'gt': None})
        else:
            keep(box(p), p['label'], p, 'accepted', 'ignore', None)

    for j, g in enumerate(gts):
        if j in used:
            continue
        chance = a['add_floor'] + (a['add_ceiling'] - a['add_floor']) * min(1.0, max(0.0, (side(g) - 10) / 86))
        if g.get('gt_occluded'):
            chance -= a['occluded_penalty']
        if rng.random() >= chance:
            missed.append(g)
            continue
        roll = rng.random()
        if roll < a['manual_sloppy']:
            keep(sloppy(g, rng), g['label'], None, 'manual', 'shift', g)
        elif roll < a['manual_sloppy'] + a['manual_wrong_class']:
            keep(redrawn(g, rng), rng.choice(CONFUSABLE[g['label']]), None, 'manual', 'flip', g)
        else:
            keep(redrawn(g, rng), g['label'], None, 'manual', 'none', g)
    rng.shuffle(final)
    return {'shown': shown, 'status': status, 'final': final, 'deleted': deleted, 'missed': missed}


rng = random.Random(SEED)
work = {f['name']: annotate(f, rng) for f in frames}
summary = pd.Series([s for w in work.values() for s in w['status']]).value_counts()
print('pre-label boxes shown, judged against GT:', summary.to_dict())
errors = pd.Series([b['error'] for w in work.values() for b in w['final'] if b['error'] not in ('none', 'ignore')]
                   + ['drop'] * sum(len(w['missed']) + sum(d['y'] == 1 for d in w['deleted']) for w in work.values()))
print('errors left after the annotator:', errors.value_counts().to_dict())
print('final boxes by origin:', pd.Series([b['lineage'] for w in work.values() for b in w['final']]).value_counts().to_dict())

# %% [markdown]
# ## 3. Features
# Three kinds of review unit:
# * **box** — a final box. Wrong (off, wrong class, on nothing)?
# * **deleted** — an AI box the annotator removed. Was it a real vehicle?
# * **candidate** — something either detector sees that no final box covers. A missed vehicle?

# %%
BAD_WEATHER = {'rainy', 'snowy', 'foggy'}
NAN = float('nan')


def context(frame, n_final):
    return {'night': float(frame['timeofday'] == 'night'),
            'dawn_dusk': float(frame['timeofday'] == 'dawn/dusk'),
            'bad_weather': float(frame['weather'] in BAD_WEATHER), 'n_final': float(n_final)}


def shape(frame, b):
    border = min(b['x'], b['y'], frame['width'] - b['x'] - b['width'], frame['height'] - b['y'] - b['height'])
    return {'log_side': math.log(max(1.0, side(b))),
            'aspect': math.log(b['width'] / b['height']) if b['width'] > 0 and b['height'] > 0 else 0.0,
            'border_rel': border / max(frame['width'], frame['height'])}


def best(boxes, target, label=None, lo=0.5, hi=1.01):
    return max((p['confidence'] for p in boxes
                if (label is None or p['label'] == label) and lo <= iou(target, p) < hi), default=0.0)


def flip_iou(p, flips):
    """How well the AI's own box survives a horizontal flip - 1 means perfectly stable."""
    return max((iou(p, q) for q in flips if q['label'] == p['label']), default=0.0)


def second_opinion(b, label):
    orig, flip = so[current]['orig'], so[current]['flip']
    same, rival = best(orig, b, label), 0.0
    rival_label = ''
    for p in orig:
        if p['label'] != label and iou(b, p) >= 0.5 and p['confidence'] > rival:
            rival, rival_label = p['confidence'], p['label']
    best_iou, best_conf = 0.0, 0.0
    for p in orig:
        if p['label'] == label and iou(b, p) > best_iou:
            best_iou, best_conf = iou(b, p), p['confidence']
    flip_same = best(flip, b, label)
    return {'so_same': same, 'so_rival': rival, 'so_margin': same - rival, 'so_rival_label': rival_label,
            'so_best_iou': best_iou, 'so_best_conf': best_conf, 'so_loose': best(orig, b, label, 0.1, 0.5),
            'so_flip_same': flip_same, 'so_tta_delta': abs(same - flip_same),
            'so_proposals': float(sum(iou(b, p) >= 0.3 for p in orig))}


def prelabel_view(b, p, label):
    """What the pre-label model said about this spot - also for hand-drawn boxes, where only
    hidden (below 0.25) boxes can exist."""
    orig, flip = pre[current]['orig'], pre[current]['flip']
    return {'pre_conf': p['confidence'] if p else NAN,
            'pre_hidden': best([q for q in orig if q['confidence'] < SHOW], b),
            'pre_rival': max((q['confidence'] for q in orig if q['label'] != label and iou(b, q) >= 0.5), default=0.0),
            'pre_flip_iou': flip_iou(p, flip) if p else NAN}



# ---- Candidates: places where a vehicle may be missing --------------------------------------
# v1: second model >= 0.05 plus hidden pre-label boxes >= 0.05, one box per location.
# v2: every detector pass (2 models x original/flipped) down to 0.01, grouped into locations,
#     with features describing how much the passes agree and where the spot sits among the
#     vehicles the annotator did label. Detectors see ~85% of missed vehicles at 0.01 but bury
#     them in noise, so v2 is about ranking, not about finding more boxes.
CANDIDATES = os.environ.get('SR_CANDIDATES', 'v2')
CAND_MIN = 0.01
PASSES = (('pre', 'orig'), ('pre', 'flip'), ('so', 'orig'), ('so', 'flip'))


def as_array(boxes):
    return np.array([xyxy(b) for b in boxes], dtype=float).reshape(-1, 4)


def overlap_matrices(A, B):
    """IoU and the share of each A box lying inside each B box."""
    if len(A) == 0 or len(B) == 0:
        return np.zeros((len(A), len(B))), np.zeros((len(A), len(B)))
    iw = np.clip(np.minimum(A[:, None, 2], B[None, :, 2]) - np.maximum(A[:, None, 0], B[None, :, 0]), 0, None)
    ih = np.clip(np.minimum(A[:, None, 3], B[None, :, 3]) - np.maximum(A[:, None, 1], B[None, :, 1]), 0, None)
    inter = iw * ih
    area_a = (A[:, 2] - A[:, 0]) * (A[:, 3] - A[:, 1])
    area_b = (B[:, 2] - B[:, 0]) * (B[:, 3] - B[:, 1])
    union = area_a[:, None] + area_b[None, :] - inter
    return (np.where(union > 0, inter / np.where(union > 0, union, 1), 0.0),
            inter / np.clip(area_a[:, None], 1e-9, None))


def candidate_label(f, w, final, c):
    """Ground truth for one candidate box - used only for scoring, never as a feature."""
    hit = max(((iou(c, g), g) for g in w['missed']), key=lambda t: t[0], default=(0.0, None))
    if hit[0] >= 0.5:
        return 'drop', 1, f"{f['name']}:{hit[1]['id']}"
    if any(iou(c, b['gt']) >= 0.5 for b in final if b['error'] == 'shift'):
        return 'shift', 1, None
    if any(iou(c, g) >= 0.5 for g in f.get('ignore', [])):
        return 'ignore', -1, None
    return 'none', 0, None


def one_positive_per_vehicle(rows):
    """A missed vehicle counts once. Its best-fitting candidate keeps y=1; the other candidates on
    it become duplicates (y=0), so the model learns to rank one box per vehicle, not three."""
    best = {}
    for r in rows:
        if r['gt_key'] and r['y'] == 1 and r['fit'] > best.get(r['gt_key'], (-1, None))[0]:
            best[r['gt_key']] = (r['fit'], id(r))
    for r in rows:
        if r['gt_key'] and r['y'] == 1 and best[r['gt_key']][1] != id(r):
            r.update(y=0, error='duplicate', gt_key=None)
    return rows


def candidates_v1(f, w, final):
    name, rows = f['name'], []
    pool = [q for q in so[name]['orig'] if q['confidence'] >= 0.05]
    pool += [q for q in pre[name]['orig'] if 0.05 <= q['confidence'] < SHOW]
    for k, c in enumerate(one_per_location(pool, 0.6)):
        if any(iou(c, b) >= 0.3 or intersection(c, b) / max(1e-9, c['width'] * c['height']) >= 0.5 for b in final):
            continue          # same rule as missingCoverage in web/core/risk/ai-compare.mjs
        if any(iou(c, d['pre']) >= 0.5 for d in w['deleted']):
            continue          # judged as a deleted unit
        error, y, key = candidate_label(f, w, final, c)
        fit = max((iou(c, g) for g in w['missed']), default=0.0)
        rows.append({
            'image': name, 'kind': 'candidate', 'unit': k, 'label': c['label'], 'lineage': 'candidate',
            'error': error, 'y': y, 'gt_key': key, 'fit': fit, 'error_side': side(c),
            'so_conf': best(so[name]['orig'], c), 'so_flip_conf': best(so[name]['flip'], c),
            'pre_hidden': best([q for q in pre[name]['orig'] if q['confidence'] < SHOW], c),
            'cover_iou': max((iou(c, b) for b in final), default=0.0),
            **shape(f, c), **context(f, len(final)), 'box': [round(v, 1) for v in xyxy(c)],
        })
    return one_positive_per_vehicle(rows)


SAME_OBJECT_IOU = float(os.environ.get('SR_SAME_OBJECT_IOU', '0.7'))
# Boxes at least this similar are one location. Must not be looser than the detector's own NMS
# (0.7), or two neighbouring cars - one partly hidden by the other - collapse into one candidate.
GROUP_IOU = float(os.environ.get('SR_GROUP_IOU', '0.7'))


def candidates_v2(f, w, final):
    name, H = f['name'], f['height']
    F = as_array(final)
    shown = as_array(w['shown'])
    boxes, source = [], []
    for index, (model, view) in enumerate(PASSES):
        for q in (pre_review if model == 'pre' else so_review)[name][view]:
            if q['confidence'] >= CAND_MIN:
                boxes.append(q)
                source.append(index)
    if not boxes:
        return []
    B = as_array(boxes)
    # Drop boxes that ARE something already handled, BEFORE grouping: a pre-label box the annotator
    # saw (IoU >= 0.9 with a shown box), or a labelled vehicle (IoU >= SAME_OBJECT_IOU with a final
    # box). Grouping first would merge a car hidden behind a labelled one into that car's group and
    # throw both away together.
    seen = overlap_matrices(B, shown)[0].max(1) >= 0.9 if len(shown) else np.zeros(len(B), bool)
    labelled = overlap_matrices(B, F)[0].max(1) >= SAME_OBJECT_IOU if len(F) else np.zeros(len(B), bool)
    keep = ~(seen | labelled)
    if not keep.any():
        return []
    boxes = [b for b, k in zip(boxes, keep) if k]
    B, source = B[keep], np.array(source)[keep]
    conf = np.array([q['confidence'] for q in boxes])
    labels = np.array([q['label'] for q in boxes])
    M, _ = overlap_matrices(B, B)
    taken, groups = np.zeros(len(boxes), bool), []
    for i in np.argsort(-conf):                      # one location = strongest box + boxes on it
        if not taken[i]:
            members = np.where((M[i] >= GROUP_IOU) & ~taken)[0]
            taken[members] = True
            groups.append((i, members))
    R = B[[i for i, _ in groups]]
    # Groups come out strongest first, so for group k every j < k is a stronger neighbour.
    # High overlap with a much stronger neighbour = a duplicate of it; moderate overlap with
    # evidence of its own = possibly a second, partly hidden vehicle.
    RR, _ = overlap_matrices(R, R)
    rep_conf = np.array([conf[i] for i, _ in groups])
    cover, inside = overlap_matrices(R, F)
    deleted_iou, _ = overlap_matrices(R, as_array([d['pre'] for d in w['deleted']]))
    final_bottom = F[:, 3] if len(F) else np.zeros(0)
    final_height = (F[:, 3] - F[:, 1]) if len(F) else np.zeros(0)
    rows = []
    for k, (i, members) in enumerate(groups):
        # Only drop spots that are clearly a labelled vehicle. A spot overlapping or mostly inside a
        # labelled box may be a car hidden behind it - the hardest misses - so it stays, and
        # cover_iou / inside_share / occluded_by let the model tell it from a fragment.
        if (len(F) and cover[k].max() >= SAME_OBJECT_IOU) or (deleted_iou.size and deleted_iou[k].max() >= 0.5):
            continue
        c = boxes[i]
        per_pass = [float(conf[members][source[members] == p].max()) if (source[members] == p).any() else 0.0
                    for p in range(len(PASSES))]
        others = members[members != i]
        x1, y1, x2, y2 = R[k]
        h, bottom = max(1.0, y2 - y1), y2
        if len(F):
            centre_gap = np.hypot((F[:, 0] + F[:, 2]) / 2 - (x1 + x2) / 2, (F[:, 1] + F[:, 3]) / 2 - (y1 + y2) / 2)
            in_row = (np.abs(final_bottom - bottom) < 0.5 * h) & (final_height > 0.5 * h) & (final_height < 2 * h)
            # a labelled vehicle in front (lower bottom edge) that covers part of this spot
            in_front = (final_bottom > bottom) & (inside[k] > 0.05)
            near = float(centre_gap.min() / math.hypot(x2 - x1, h))
            row = float(in_row.sum())
            occluded_by = float(inside[k][in_front].max()) if in_front.any() else 0.0
        else:
            near, row, occluded_by = 10.0, 0.0, 0.0
        error, y, key = candidate_label(f, w, final, c)
        fit = max((iou(c, g) for g in w['missed']), default=0.0)
        rows.append({
            'image': name, 'kind': 'candidate', 'unit': k, 'label': c['label'], 'lineage': 'candidate',
            'error': error, 'y': y, 'gt_key': key, 'fit': fit, 'error_side': side(c),
            # agreement between the four detector passes
            'c_pre_orig': per_pass[0], 'c_pre_flip': per_pass[1], 'c_so_orig': per_pass[2], 'c_so_flip': per_pass[3],
            'c_max': float(conf[members].max()), 'c_sum': float(conf[members].sum()),
            'n_passes': float(sum(v > 0 for v in per_pass)), 'n_members': float(len(members)),
            'loc_agree': float(M[i, others].mean()) if len(others) else 0.0,
            'label_agree': float((labels[members] == labels[i]).mean()),
            'dup_iou': float(RR[k, :k].max()) if k else 0.0,
            'dup_conf_ratio': float(conf[i] / rep_conf[:k][RR[k, :k].argmax()]) if k and RR[k, :k].max() > 0 else 1.0,
            # where the spot sits among the vehicles the annotator did label
            'cover_iou': float(cover[k].max()) if len(F) else 0.0,
            'inside_share': float(inside[k].max()) if len(F) else 0.0,
            'near_final': min(near, 10.0), 'same_row': row, 'occluded_by': occluded_by,
            'size_residual': math.log(h) - float(np.polyval(SIZE_PRIOR, bottom / H)),
            # kept under the v1 names so the baselines and reasons read the same columns
            'so_conf': per_pass[2], 'so_flip_conf': per_pass[3], 'pre_hidden': per_pass[0],
            **shape(f, c), **context(f, len(final)), 'box': [round(float(v), 1) for v in R[k]],
        })
    return one_positive_per_vehicle(rows)


# Expected box height for a given bottom edge, learned from the annotators' own boxes (no GT):
# far vehicles sit high in the frame and are small. A spot far off this curve is less plausible.
_bottom, _height = zip(*[((b['y'] + b['height']) / f['height'], math.log(max(1.0, b['height'])))
                         for f in frames for b in work[f['name']]['final']])
SIZE_PRIOR = np.polyfit(_bottom, _height, 2)

rows = []
for f in frames:
    current, w = f['name'], work[f['name']]
    final = w['final']
    for k, b in enumerate(final):
        p = b['pre']
        rows.append({
            'image': current, 'kind': 'box', 'unit': k, 'label': b['label'], 'lineage': b['lineage'],
            'error': b['error'], 'y': -1 if b['error'] == 'ignore' else int(b['error'] != 'none'),
            'error_side': side(b['gt'] if b['gt'] is not None else b),
            'is_accepted': float(b['lineage'] == 'accepted'), 'is_edited': float(b['lineage'] == 'edited'),
            'is_manual': float(b['lineage'] == 'manual'),
            'edit_iou': iou(b, p) if p else NAN,
            'class_changed': float(b['label'] != p['label']) if p else NAN,
            **prelabel_view(b, p, b['label']), **second_opinion(b, b['label']), **shape(f, b),
            'max_iou_final': max((iou(b, o) for j, o in enumerate(final) if j != k), default=0.0),
            **context(f, len(final)),
        })
    for k, d in enumerate(w['deleted']):
        p = d['pre']
        rows.append({
            'image': current, 'kind': 'deleted', 'unit': k, 'label': p['label'], 'lineage': 'deleted',
            'error': 'drop' if d['y'] == 1 else ('ignore' if d['y'] < 0 else 'none'), 'y': d['y'],
            'error_side': side(d['gt'] if d['gt'] is not None else p),
            'gt_key': f"{current}:{d['gt']['id']}" if d['y'] == 1 else None,
            **prelabel_view(p, p, p['label']), **second_opinion(p, p['label']),
            'so_any': best(so[current]['orig'], p), **shape(f, p), **context(f, len(final)),
            'box': [round(v, 1) for v in xyxy(p)],
        })
    rows += (candidates_v2 if CANDIDATES == 'v2' else candidates_v1)(f, w, final)
units = pd.DataFrame(rows)
units['split'] = units['image'].map(split_of)
for cls in CLASSES:
    units[f'is_{cls}'] = (units['label'] == cls).astype(float)
print(units.groupby(['kind', 'error']).size().to_string())

# %% [markdown]
# ## 4. Scorers

# %%
from sklearn.ensemble import HistGradientBoostingClassifier  # noqa: E402
from sklearn.metrics import average_precision_score  # noqa: E402

LABELS = [f'is_{c}' for c in CLASSES]
GEOMETRY = ['log_side', 'aspect', 'border_rel', 'n_final', 'night', 'dawn_dusk', 'bad_weather']
PRELABEL = ['pre_conf', 'pre_hidden', 'pre_rival', 'pre_flip_iou']
HISTORY = ['is_accepted', 'is_edited', 'is_manual', 'edit_iou', 'class_changed']
SECOND = ['so_same', 'so_rival', 'so_margin', 'so_best_iou', 'so_best_conf', 'so_loose',
          'so_flip_same', 'so_tta_delta', 'so_proposals']
if CANDIDATES == 'v2':
    CAND_FEATS = ['c_pre_orig', 'c_pre_flip', 'c_so_orig', 'c_so_flip', 'c_max', 'c_sum', 'n_passes', 'n_members',
                  'loc_agree', 'label_agree', 'dup_iou', 'dup_conf_ratio', 'cover_iou', 'inside_share', 'near_final', 'same_row',
                  'occluded_by', 'size_residual']
    CAND_FEATS_NO_SECOND = ['c_pre_orig', 'c_pre_flip', 'cover_iou', 'inside_share', 'near_final', 'same_row',
                            'occluded_by', 'size_residual']
else:
    CAND_FEATS = ['so_conf', 'so_flip_conf', 'pre_hidden', 'cover_iou']
    CAND_FEATS_NO_SECOND = ['pre_hidden', 'cover_iou']
FEATURES = {
    'box': {'model': PRELABEL + HISTORY + SECOND + GEOMETRY + ['max_iou_final'] + LABELS,
            'model_no_second': PRELABEL + HISTORY + GEOMETRY + ['max_iou_final'] + LABELS,
            'model_no_history': PRELABEL + SECOND + GEOMETRY + ['max_iou_final'] + LABELS},
    'deleted': {'model': PRELABEL + SECOND + ['so_any'] + GEOMETRY + LABELS,
                'model_no_second': PRELABEL + GEOMETRY + LABELS,
                'model_no_history': None},      # without the history there is no "deleted" unit
    'candidate': {'model': CAND_FEATS + GEOMETRY + LABELS,
                  'model_no_second': CAND_FEATS_NO_SECOND + GEOMETRY + LABELS,
                  'model_no_history': CAND_FEATS + GEOMETRY + LABELS},
}


def fit_predict(df, feats):
    train = df[(df.split == 'calibration') & (df.y >= 0)]
    if train.y.nunique() < 2:              # too few examples of one class: fall back to the base rate
        return np.full(len(df), train.y.mean() if len(train) else 0.0)
    model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
                                           min_samples_leaf=20, random_state=SEED)
    return model.fit(train[feats], train.y).predict_proba(df[feats])[:, 1]


parts = []
for kind, variants in FEATURES.items():
    part = units[units.kind == kind].copy()
    for name, feats in variants.items():
        part[f'p_{name}'] = 0.0 if feats is None or part.empty else fit_predict(part, feats)
    parts.append(part)
units = pd.concat(parts)

is_box, is_del, is_cand = units.kind == 'box', units.kind == 'deleted', units.kind == 'candidate'
# The brief, literally: review AI boxes in inverse order of their pre-label confidence, and show
# the grey-zone boxes the annotator never saw. Hand-drawn boxes have no confidence to look at.
units['p_confidence'] = np.where(is_box, (1 - units['pre_conf']).fillna(0.0),
                                 np.where(is_cand, units['pre_hidden'], 0.0))
units['p_second_opinion'] = np.where(is_box, 1 - units['so_same'],
                                     np.where(is_del, units['so_any'].fillna(0), units['so_conf'].fillna(0)))


def rules(df):
    """Geometry checks in the spirit of the web app's rule engine (no confidence)."""
    stats = df.groupby('label')['log_side'].agg(['median', lambda s: (s - s.median()).abs().median()])
    stats.columns = ['median', 'mad']
    z = (df['log_side'] - df['label'].map(stats['median'])).abs() / (
        1.4826 * df['label'].map(stats['mad'])).clip(lower=0.35)
    return (50 * (df['max_iou_final'] >= 0.85) + 35 * (df['log_side'] < math.log(4))
            + 25 * (df['aspect'].abs() >= math.log(20)) + 30 * (z >= 4)
            + 40 * (df['border_rel'] < -0.0001)) / 100


units['p_rules'] = 0.0
units.loc[is_box, 'p_rules'] = rules(units[is_box])

# Missing vehicles: how many does the tool point at (coverage), and how many does a reviewer
# find by checking only the top-K suggestions (recall@K, precision@K)? Counted per vehicle.
SIZE_BINS = [(10, 32, '10-32px'), (32, 64, '32-64px'), (64, 128, '64-128px'), (128, 1e9, '>=128px')]
lost, test_gt_boxes = {}, {}
for f in frames:
    if split_of[f['name']] != 'test':
        continue
    w = work[f['name']]
    test_gt_boxes[f['name']] = f['boxes']
    for g in w['missed'] + [d['gt'] for d in w['deleted'] if d['y'] == 1]:
        lost[f"{f['name']}:{g['id']}"] = next(n for lo, hi, n in SIZE_BINS if lo <= side(g) < hi)
suggestions = units[(units.split == 'test') & units.kind.isin(['candidate', 'deleted']) & (units.y >= 0)]
found = set(suggestions.loc[suggestions.y == 1, 'gt_key'].dropna())
# Evidence: some review pass box (>= 0.01) sits on the vehicle at IoU >= 0.5. The gap between
# evidence and coverage is lost inside this pipeline (grouping, filtering), not in the detector.
evidence = {}
for key in lost:
    image, gid = key.rsplit(':', 1)
    g = next(b for b in test_gt_boxes[image] if str(b['id']) == gid)
    evidence[key] = any(q['confidence'] >= CAND_MIN and iou(g, q) >= 0.5
                        for src in (pre_review, so_review) for view in ('orig', 'flip') for q in src[image][view])
print(f"missed vehicles with detector evidence: {np.mean(list(evidence.values())):.1%}  "
      f"pointed at by a suggestion: {len(found & set(lost)) / len(lost):.1%}")
coverage = pd.Series({size: sum(k in found for k, s_ in lost.items() if s_ == size) /
                      max(1, sum(s_ == size for s_ in lost.values())) for _, _, size in SIZE_BINS})
print(f'missed vehicles on test: {len(lost)}; the tool points at {len(found & set(lost)) / len(lost):.1%} '
      f'of them (candidates={CANDIDATES})\n', coverage.round(3).to_string())
missing_report = {'missed_vehicles': len(lost), 'coverage': round(len(found & set(lost)) / len(lost), 3),
                  'coverage_by_size': coverage.round(3).to_dict(), 'suggestions': len(suggestions), 'at': {}}
for col in ('p_confidence', 'p_second_opinion', 'p_model'):
    ranked_s = suggestions.sort_values(col, ascending=False)
    missing_report['at'][col[2:]] = {}
    n_images = sum(split_of[f['name']] == 'test' for f in frames)
    for per_image in (1, 2, 3, 5):                   # suggestions a reviewer checks per image, on average
        top = ranked_s.head(per_image * n_images)
        missing_report['at'][col[2:]][f'{per_image}/img'] = {
            'precision': round(float(top.y.mean()), 3),
            'recall': round(len(set(top.gt_key.dropna()) & set(lost)) / len(lost), 3)}
print('top-K missing-vehicle suggestions (test): precision / recall')
print(pd.DataFrame({c: {k: f"{v['precision']:.2f} / {v['recall']:.2f}" for k, v in d.items()}
                    for c, d in missing_report['at'].items()}).T.to_string())

# Recall first: the goal is to let no annotation error slip. Every error on the test images is
# listed once, with the highest score any review unit gives it (a missed vehicle may be pointed at
# by several candidates). An error no unit points at can never be caught: its score is -inf.
test_frames = {f['name']: f for f in frames if split_of[f['name']] == 'test'}
missed_info = {}
for name, f in test_frames.items():
    w = work[name]
    for g in w['missed'] + [d['gt'] for d in w['deleted'] if d['y'] == 1]:
        missed_info[f"{name}:{g['id']}"] = {'size_px': side(g), 'occluded': bool(g.get('gt_occluded')),
                                            'night': f['timeofday'] == 'night', 'image': name}
suggest = units[(units.split == 'test') & units.kind.isin(['candidate', 'deleted']) & (units.y == 1)]
boxes_bad = units[(units.split == 'test') & (units.kind == 'box') & (units.y == 1)]
all_flags = units[units.split == 'test']
n_test_images = len(test_frames)


def error_table(col):
    rows_ = [{'type': u.error, 'score': getattr(u, col), 'size_px': u.error_side, 'night': bool(u.night),
              'lineage': u.lineage, 'pre_conf': u.pre_conf} for u in boxes_bad.itertuples()]
    best_by_key = suggest.groupby('gt_key')[col].max()
    for key, info in missed_info.items():
        rows_.append({'type': 'drop', 'score': best_by_key.get(key, -np.inf), 'size_px': info['size_px'],
                      'night': info['night'], 'lineage': 'missed', 'pre_conf': np.nan,
                      'occluded': info['occluded']})
    return pd.DataFrame(rows_)


recall_first = {}
for col in ('p_confidence', 'p_model'):
    errs = error_table(col)
    reachable = np.isfinite(errs.score)
    entry = {'errors': len(errs), 'ceiling': round(float(reachable.mean()), 3),
             'ceiling_by_type': errs.groupby('type').apply(lambda g: round(float(np.isfinite(g.score).mean()), 3)).to_dict(),
             'targets': {}}
    for target in (0.8, 0.9, 0.95, 0.99):
        if target > reachable.mean():
            entry['targets'][f'{int(target * 100)}%'] = 'above ceiling'
            continue
        threshold = float(np.sort(errs.score[reachable])[::-1][int(np.ceil(target * len(errs))) - 1])
        flagged = all_flags[all_flags[col] >= threshold]
        entry['targets'][f'{int(target * 100)}%'] = {
            'threshold': round(threshold, 4), 'flags_per_image': round(len(flagged) / n_test_images, 1),
            'flags_that_are_errors': round(float((flagged.y == 1).mean()), 3)}
    # The other way round: a reviewer checks the N highest flags per image - what share is caught?
    ranked_flags = np.sort(all_flags[col].to_numpy())[::-1]
    entry['recall_at_flags'] = {}
    for per_image in (3, 5, 10, 20):
        k = min(len(ranked_flags), per_image * n_test_images)
        threshold = ranked_flags[k - 1]
        entry['recall_at_flags'][f'{per_image}/img'] = round(float((errs.score >= threshold).mean()), 3)
    recall_first[col[2:]] = entry
print('recall first - to catch X% of all errors, how many flags per image must a reviewer check?')
for name, entry in recall_first.items():
    print(f"  {name:11} ceiling {entry['ceiling']:.1%} {entry['ceiling_by_type']}")
    for target, value in entry['targets'].items():
        print(f'      {target:>4}: {value}')
    print(f"      errors caught when checking N flags per image: {entry['recall_at_flags']}")

# Who slips through: errors the model scores below the 90%-recall threshold, or never points at.
errs = error_table('p_model')
reachable = np.isfinite(errs.score)
cut = np.sort(errs.score[reachable])[::-1][min(reachable.sum(), int(np.ceil(0.9 * reachable.sum()))) - 1]
errs['slips'] = errs.score < cut
errs['size'] = pd.cut(errs.size_px, [0, 32, 64, 128, 1e9], labels=['10-32px', '32-64px', '64-128px', '>=128px'])
print(f'\nerrors that slip (unreachable, or below the threshold catching 90% of reachable ones): '
      f'{errs.slips.mean():.1%}')
print(errs.groupby('type')['slips'].agg(['size', 'mean']).round(3).to_string())
print('\nslip rate by size and type:\n', errs.pivot_table(index='size', columns='type', values='slips',
                                                       aggfunc='mean', observed=False).round(2).to_string())
print('\nbox errors - slip rate by origin:\n', errs[errs.type != 'drop'].groupby('lineage')['slips']
      .agg(['size', 'mean']).round(3).to_string())
slip_box = errs[(errs.type != 'drop')]
print('\nbox errors - median pre-label confidence: slipped',
      round(float(slip_box[slip_box.slips].pre_conf.median()), 3), 'caught',
      round(float(slip_box[~slip_box.slips].pre_conf.median()), 3))
drops = errs[errs.type == 'drop']
print('missed vehicles - slip rate by occluded / night:\n',
      drops.groupby(['occluded', 'night'])['slips'].agg(['size', 'mean']).round(3).to_string())
units.drop(columns=['box']).to_csv(OUT / 'units.csv.gz', index=False)

test_units = units[(units.split == 'test') & (units.y >= 0)]
box_ap = {}
for kind in ('box', 'deleted', 'candidate'):
    part = test_units[test_units.kind == kind]
    if part.y.nunique() < 2:
        continue
    box_ap[kind] = {n: round(float(average_precision_score(part.y, part[f'p_{n}'])), 3)
                    for n in ('confidence', 'second_opinion', 'rules', 'model_no_second',
                              'model_no_history', 'model')}
    box_ap[kind].update(base_rate=round(float(part.y.mean()), 3), units=len(part))
print('unit-level average precision (test):\n', pd.DataFrame(box_ap).T.to_string())

# %% [markdown]
# ## 5. Image level: errors, review cost, image scores

# %%
image_rows = []
for f in frames:
    w = work[f['name']]
    errs = [(b['error'], side(b['gt'] if b['gt'] is not None else b))
            for b in w['final'] if b['error'] not in ('none', 'ignore')]
    errs += [('drop', side(g)) for g in w['missed']]
    errs += [('drop', side(d['gt'])) for d in w['deleted'] if d['y'] == 1]
    kinds = [e for e, _ in errs]
    image_rows.append({
        'image': f['name'], 'split': split_of[f['name']], 'timeofday': f['timeofday'],
        'n_final': len(w['final']), 'n_errors': len(errs),
        'big_error': int(any(s >= ALPHA_MIN_SIDE for _, s in errs)),
        **{f'n_{k}': kinds.count(k) for k in ('drop', 'shift', 'flip', 'spawn')},
        'review_seconds': COST['verify'] * len(w['final'])
                          + COST['fix'] * (kinds.count('shift') + kinds.count('flip'))
                          + COST['draw'] * kinds.count('drop'),
    })
images = pd.DataFrame(image_rows).set_index('image')
UNIT_SCORES = ['p_rules', 'p_confidence', 'p_second_opinion', 'p_model_no_second', 'p_model_no_history', 'p_model']
for col in UNIT_SCORES:
    images[col] = units.groupby('image')[col].sum().reindex(images.index).fillna(0.0)

# ObjectLab only uses AI boxes scoring >= 0.95 to find missed and swapped boxes (>= 0.5 for badly
# located ones). YOLO rarely reaches 0.95, which silently disables two of its three sub-scores, so
# its thresholds are set from the second detector's own score distribution.
try:
    import cleanlab.object_detection.rank as cl_rank

    labels_cl, preds_cl = [], []
    for name in images.index:
        final = work[name]['final']
        labels_cl.append({'bboxes': np.array([xyxy(b) for b in final], dtype=float).reshape(-1, 4),
                          'labels': np.array([CLASSES.index(b['label']) for b in final], dtype=int)})
        per_class = np.empty(len(CLASSES), dtype=object)
        for i, c in enumerate(CLASSES):
            per_class[i] = np.array([list(xyxy(p)) + [p['confidence']] for p in so[name]['orig']
                                     if p['label'] == c], dtype=float).reshape(-1, 5)
        preds_cl.append(per_class)
    confident = [p['confidence'] for v in so.values() for p in v['orig'] if p['confidence'] >= 0.3]
    saved = cl_rank.HIGH_PROBABILITY_THRESHOLD, cl_rank.LOW_PROBABILITY_THRESHOLD
    cl_rank.HIGH_PROBABILITY_THRESHOLD = float(np.quantile(confident, 0.9))
    cl_rank.LOW_PROBABILITY_THRESHOLD = 0.3
    try:
        images['p_objectlab_tuned'] = 1 - np.asarray(cl_rank.get_label_quality_scores(labels_cl, preds_cl, verbose=False))
    finally:
        cl_rank.HIGH_PROBABILITY_THRESHOLD, cl_rank.LOW_PROBABILITY_THRESHOLD = saved
except Exception as exc:                       # keep the notebook running without the baseline
    print('ObjectLab baseline skipped:', repr(exc))
images['p_random'] = np.random.default_rng(SEED).random(len(images))
images['p_oracle'] = images['n_errors']
SCORERS = [c for c in ('p_random', 'p_rules', 'p_confidence', 'p_second_opinion', 'p_objectlab_tuned',
                       'p_model_no_second', 'p_model_no_history', 'p_model', 'p_oracle') if c in images]
print(images[['n_errors', 'big_error', 'review_seconds']].describe().loc[['mean', 'max']].round(2))
print(f"images with no error: {(images.n_errors == 0).mean():.1%}   "
      f"with no error on a vehicle >= {ALPHA_MIN_SIDE}px: {(images.big_error == 0).mean():.1%}")

# %% [markdown]
# ## 6. Benchmark on the held-out test images

# %%
BUDGETS = (0.1, 0.2, 0.3, 0.5)


def ranked(df, col):
    jitter = np.random.default_rng(SEED).random(len(df))
    return df.assign(_j=jitter).sort_values([col, '_j'], ascending=[False, True])


def recall_curve(df, col, x='images'):
    r = ranked(df, col)
    caught = r['n_errors'].cumsum() / max(1, r['n_errors'].sum())
    spent = (np.arange(1, len(r) + 1) / len(r)) if x == 'images' else (
        r['review_seconds'].cumsum() / r['review_seconds'].sum())
    return np.concatenate([[0], np.asarray(spent)]), np.concatenate([[0], np.asarray(caught)])


def at(xs, ys, budget):
    return float(ys[min(len(ys) - 1, np.searchsorted(xs, budget - 1e-12))])


def wilson_upper(k, n, z=1.96):
    if n == 0:
        return 1.0
    p = k / n
    return (p + z * z / (2 * n) + z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n)


cal_img, test_img = images[images.split == 'calibration'], images[images.split == 'test']
report = {'images_test': len(test_img), 'errors_test': int(test_img.n_errors.sum()),
          'review_all_hours': round(test_img.review_seconds.sum() / 3600, 2),
          'guideline': {'name': GUIDELINE, **GUIDELINES[GUIDELINE]}, 'annotator': ANNOTATOR, 'prelabel_model': PRELABEL_MODEL, 'second_model': SECOND_MODEL,
          'unit_ap': box_ap, 'candidates': CANDIDATES, 'missing': missing_report,
          'recall_first': recall_first, 'scorers': {}}
for col in SCORERS:
    xi, yi = recall_curve(test_img, col, 'images')
    xh, yh = recall_curve(test_img, col, 'hours')
    top = ranked(test_img, col).head(int(len(test_img) * 0.2))
    report['scorers'][col[2:]] = {
        'error_recall_at_images': {f'{int(b * 100)}%': round(at(xi, yi, b), 3) for b in BUDGETS},
        'error_recall_at_hours': {f'{int(b * 100)}%': round(at(xh, yh, b), 3) for b in BUDGETS},
        'recall_by_type_at_20pct_images': {
            k: round(float(top[f'n_{k}'].sum() / max(1, test_img[f'n_{k}'].sum())), 3)
            for k in ('drop', 'shift', 'flip', 'spawn')},
        'curve_images': [xi[::5].round(4).tolist(), yi[::5].round(4).tolist()],
        'curve_hours': [xh[::5].round(4).tolist(), yh[::5].round(4).tolist()],
    }
for key, title in (('error_recall_at_images', '% errors caught vs % IMAGES reviewed'),
                   ('error_recall_at_hours', '% errors caught vs % reviewer HOURS')):
    print(f'\n{title}\n', pd.DataFrame({k: v[key] for k, v in report['scorers'].items()}).T.to_string())
print('\nrecall by error type at 20% images\n',
      pd.DataFrame({k: v['recall_by_type_at_20pct_images'] for k, v in report['scorers'].items()}).T.to_string())

# %% [markdown]
# ## 7. Three tiers and alpha
# * **Tier 1 — auto-accept:** lowest risk, nobody opens it. Allowed only while the Wilson 95% upper
#   bound on "image still holds an error on a vehicle >= 64px" stays <= 2%. Chosen on calibration,
#   reported on test.
# * **Tier 3 — return to the annotator:** the top 15% by risk.
# * **Tier 2 — reviewer checks the flagged boxes:** everything else.

# %%
def choose_tau(df, col):
    order = df.sort_values(col)
    bad, best_k = 0, None
    for k, big in enumerate(order['big_error'], start=1):
        bad += big
        if k >= 30 and wilson_upper(bad, k) <= ALPHA:
            best_k = k
    if best_k is None:
        return None
    return float(order[col].iloc[max(0, int(best_k * 0.9) - 1)])   # one notch safer


tiers = {}
for col in ('p_confidence', 'p_second_opinion', 'p_model_no_second', 'p_model'):
    tau = choose_tau(cal_img, col)
    accepted = test_img[test_img[col] <= tau] if tau is not None else test_img.iloc[:0]
    bad = int(accepted.big_error.sum())
    tiers[col[2:]] = {
        'tau': tau, 'auto_accept_share': round(len(accepted) / len(test_img), 3),
        'auto_accepted_images': len(accepted), 'with_big_error': bad,
        'observed_rate': round(bad / len(accepted), 4) if len(accepted) else None,
        'wilson_upper': round(wilson_upper(bad, len(accepted)), 4) if len(accepted) else None,
        'meets_alpha': bool(len(accepted) and wilson_upper(bad, len(accepted)) <= ALPHA),
        'enough_for_rule_of_three': len(accepted) >= 150,
        'hours_saved': round(accepted.review_seconds.sum() / 3600, 2),
        'hours_saved_share': round(accepted.review_seconds.sum() / test_img.review_seconds.sum(), 3),
    }
report['tiers'] = tiers
print(pd.DataFrame(tiers).T.to_string())

# When tau does not exist, the trade-off is the useful number: accept the X% lowest-risk images
# and see how many of them still hide an error on a vehicle >= 64px.
tradeoff = {}
for col in ('p_confidence', 'p_model'):
    order = test_img.sort_values(col)
    tradeoff[col[2:]] = {
        f'{int(share * 100)}%': round(float(order.head(max(1, int(len(order) * share))).big_error.mean()), 3)
        for share in (0.05, 0.1, 0.2, 0.3, 0.5)}
tradeoff['random'] = {'any share': round(float(test_img.big_error.mean()), 3)}
report['auto_accept_tradeoff'] = tradeoff
print(f'\nshare of auto-accepted images still hiding an error on a vehicle >= {ALPHA_MIN_SIDE}px')
print(pd.DataFrame({k: v for k, v in tradeoff.items() if k != 'random'}).T.to_string(),
      f"\n(random pick: {tradeoff['random']['any share']:.1%} at any share)")

# %% [markdown]
# ## 8. Review queue with readable reasons

# %%
def reason(u):
    if u.kind == 'candidate':
        src = f'model thứ hai {u.so_conf:.0%}' if u.so_conf >= u.pre_hidden else f'pre-label ẩn {u.pre_hidden:.0%}'
        return f'AI thấy {u.label} ({src}) nhưng không có box → nghi sót xe'
    if u.kind == 'deleted':
        return f'annotator xoá box AI {u.label} ({u.pre_conf:.0%}), model thứ hai vẫn thấy xe ({u.so_any:.0%})'
    if u.lineage == 'accepted' and u.pre_conf < 0.5:
        return f'box #{u.unit} {u.label}: AI chỉ {u.pre_conf:.0%}, annotator giữ nguyên không chỉnh'
    if u.so_rival >= 0.5 and u.so_rival > u.so_same:
        return f'box #{u.unit} gán "{u.label}", model thứ hai nghĩ là "{u.so_rival_label}" ({u.so_rival:.0%})'
    if u.so_best_conf >= 0.5 and 0.1 <= u.so_best_iou < 0.7:
        return f'box #{u.unit} {u.label} lệch so với model thứ hai (IoU {u.so_best_iou:.2f})'
    if u.lineage == 'manual':
        return f'box #{u.unit} {u.label} do người tự vẽ, AI không đề xuất'
    return f'box #{u.unit} {u.label}: rủi ro {u.p_model:.0%}'


tau = tiers['model']['tau']
queue = ranked(test_img, 'p_model').reset_index()
cut = int(len(queue) * TIER3_SHARE)
top_units = units[units.split == 'test'].sort_values('p_model', ascending=False).groupby('image').head(3)
reasons = {img: ' | '.join(reason(u) for u in g.itertuples()) for img, g in top_units.groupby('image')}
queue['tier'] = [3 if i < cut else (1 if tau is not None and s <= tau else 2) for i, s in enumerate(queue['p_model'])]
queue['tier_name'] = queue['tier'].map({1: 'tự động nhận', 2: 'reviewer kiểm tra', 3: 'trả annotator làm lại'})
queue['reasons'] = queue['image'].map(reasons).fillna('')
queue = queue[['image', 'tier', 'tier_name', 'p_model', 'reasons', 'timeofday', 'n_final',
               'n_errors', 'n_drop', 'n_shift', 'n_flip', 'n_spawn']].rename(
    columns={'p_model': 'predicted_errors', 'n_errors': 'simulated_errors_gt'})
queue.to_csv(OUT / 'review_queue.csv', index=False, encoding='utf-8-sig')
print(queue.tier_name.value_counts().to_dict())
print(queue.head(5)[['tier_name', 'predicted_errors', 'simulated_errors_gt', 'reasons']].to_string())

# %% [markdown]
# ## 9. Chart

# %%
import matplotlib  # noqa: E402

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

SURFACE, INK, INK_2, INK_3, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#8a8984', '#e7e6e2'
# dataviz reference palette, categorical slots 1-4 in fixed order (validated for adjacent lines)
LINES = [('model', 'Model (confidence + lịch sử chỉnh + model thứ hai)', '#2a78d6'),
         ('confidence', 'Chỉ confidence pre-label (đúng đề bài)', '#eb6834'),
         ('model_no_second', 'Model không cần model thứ hai', '#1baf7a'),
         ('second_opinion', 'Chỉ model thứ hai', '#eda100')]
REFS = [('oracle', 'Trần (biết đáp án)', (0, (1, 2))), ('random', 'Ngẫu nhiên', (0, (5, 3)))]
fig, axes = plt.subplots(1, 2, figsize=(14, 6.2), dpi=150, sharey=True)
fig.patch.set_facecolor(SURFACE)
for ax, key, xlabel, title in ((axes[0], 'curve_images', '% ảnh reviewer mở', 'Theo số ảnh'),
                               (axes[1], 'curve_hours', '% giờ công review', 'Theo giờ công')):
    ax.set_facecolor(SURFACE)
    for name, label, style in REFS:
        x, y = report['scorers'][name][key]
        ax.plot(np.array(x) * 100, np.array(y) * 100, color=INK_3, lw=1.5, ls=style, label=label)
    for name, label, colour in reversed(LINES):
        x, y = report['scorers'][name][key]
        ax.plot(np.array(x) * 100, np.array(y) * 100, color=colour, lw=2.4 if name == 'model' else 2, label=label)
    ax.axvline(20, color=GRID, lw=1.5, zorder=0)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.set_xlabel(xlabel, color=INK_2)
    ax.set_title(title, loc='left', color=INK, fontweight='bold')
    ax.grid(axis='y', color=GRID)
    ax.tick_params(colors=INK_2, length=0)
    for s in ax.spines.values():
        s.set_visible(False)
axes[0].set_ylabel('% lỗi annotation được bắt', color=INK_2)
axes[0].legend(loc='lower right', frameon=False, fontsize=9)
m = report['scorers']['model']['error_recall_at_images']['20%'] * 100
c_ = report['scorers']['confidence']['error_recall_at_images']['20%'] * 100
r_ = report['scorers']['random']['error_recall_at_images']['20%'] * 100
fig.suptitle(f'Mở 20% ảnh rủi ro nhất: model bắt {m:.0f}% lỗi, chỉ confidence {c_:.0f}%, ngẫu nhiên {r_:.0f}%',
             x=0.06, ha='left', color=INK, fontsize=14, fontweight='bold')
fig.subplots_adjust(left=0.06, right=0.98, top=0.86, bottom=0.11, wspace=0.07)
fig.savefig(OUT / 'benchmark_chart.png', facecolor=SURFACE)
plt.close(fig)

# %% [markdown]
# ## 10. Possible **real** BDD100K label errors
# Confident detections that no final box covers and that the simulation did *not* create: either the
# AI is wrong, or BDD100K itself missed a vehicle. Look at them by eye before using them.

# %%
gallery = OUT / 'possible_real_bdd_errors'
gallery.mkdir(exist_ok=True)
suspects = units[(units.kind == 'candidate') & (units.split == 'test') & (units.error == 'none')]
suspects = suspects.sort_values('p_model', ascending=False).head(12)
gt_of = {f['name']: f for f in frames}
for i, u in enumerate(suspects.itertuples(), start=1):
    img = cv2.imread(str(IMAGE_DIR / u.image))
    for g in gt_of[u.image]['boxes']:
        x1, y1, x2, y2 = map(int, xyxy(g))
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 200, 0), 1)
    x1, y1, x2, y2 = map(int, u.box)
    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), 3)
    cv2.putText(img, f'AI {u.label} {u.so_conf:.2f} - BDD has no box', (x1, max(15, y1 - 6)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
    cv2.imwrite(str(gallery / f'{i:02d}_{u.image}'), img)

report['generated'] = time.strftime('%Y-%m-%d %H:%M')
(OUT / 'benchmark.json').write_text(json.dumps(report, indent=1), encoding='utf-8')
print('outputs:', sorted(p.name for p in OUT.iterdir()))
