"""Give every box an annotator drew a YOLO score (a rescore), list the objects nobody drew, and
write the file back with both.

    python score_boxes.py annotations.xml --images images/ --out scored.xml [--model yolo11s.pt]

One model pass per image gives two things.

Rescore. The boxes are not changed and no box is added. For each box, the score is how sure
the model is that an object of that box's label sits exactly there: YOLO weighs thousands of
candidate boxes per image and normally keeps only its best few; here every candidate is kept,
and a box takes the highest score of its own label among the candidates that fit it (IoU >=
--fit). A box on empty space, around the wrong object or under the wrong label scores low.
It is written as an attribute named "rescore" (COCO: a "rescore" field). SmartReview reads it
apart from a confidence, so the boxes stay boxes drawn by a person, and the policy rule
any.rescore_low judges it on its own scale. Labels the model does not know get no score.

Missing objects. The model's own detections (after NMS, as in AI check) of a label the file
uses, at --missing or above, that no drawn box covers (IoU >= 0.3, or half of the detection
inside one box). They are hints for a reviewer, never labels: CVAT XML keeps them in
<meta><smartreview_missing>, COCO in a top-level "smartreview_missing" list. The frame rule
coverage.model_missing keeps a frame with a missed core object out of auto_accept.

Input formats: CVAT for images 1.1 and CVAT for video 1.1 (XML), and COCO detection (JSON).

Measured on BDD100K with yolo11s. Rescore, 400 images with 15% of the boxes broken on purpose
(wrong class, moved, extra box on empty road): at fit 0.5 broken boxes rank below correct ones
with AUROC 0.92 (yolo11m 0.92, yolo11n 0.90; fit 0.7 drops to 0.80). Scores of correct boxes
are low in absolute terms (median 0.27, 0.11 under 32 px), so they are not on the scale of a
pre-label's confidence: under 0.02 (the policy's threshold) catches 91% of broken boxes and
18% of correct ones; on boxes with a short side of 16 px or more, 73% and 11% (the policy only
warns below 16 px, where the model can hardly judge). Missing, 1500 images with 15% of the boxes deleted: at 0.4 the hints
find 39% of the deleted boxes and 79% of the hints are right (objects under 32 px: 17%). The
thresholds belong to this model; another model needs a new measure.
"""
import argparse
import json
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np

# Annotation label (lower case, "_" and "-" read as spaces) -> COCO class of the model.
ALIASES = {
    'bike': 'bicycle', 'motor': 'motorcycle', 'motorbike': 'motorcycle',
    'pedestrian': 'person', 'rider': 'person', 'stop_sign': 'stop sign',
    'traffic_light': 'traffic light', 'two_wheeler': None,
}
IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
FIELD = 'rescore'
MISSING = 'smartreview_missing'
# A detection is covered by a drawn box of any label (the numbers of AI check, ai-compare.ts).
COVER_IOU, COVER_SHARE, DUPLICATE_IOU = 0.3, 0.5, 0.5


def iou_matrix(a, b):
    x1 = np.maximum(a[:, None, 0], b[None, :, 0]); y1 = np.maximum(a[:, None, 1], b[None, :, 1])
    x2 = np.minimum(a[:, None, 2], b[None, :, 2]); y2 = np.minimum(a[:, None, 3], b[None, :, 3])
    inter = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    area = lambda q: (q[:, 2] - q[:, 0]) * (q[:, 3] - q[:, 1])
    return inter / (area(a)[:, None] + area(b)[None, :] - inter + 1e-9), inter / (area(a)[:, None] + 1e-9)


class Scorer:
    def __init__(self, weights, imgsz=1280, fit=0.5, flip=False, device='cpu', missing=0.4):
        from ultralytics import YOLO
        from ultralytics.models.yolo.detect.predict import DetectionPredictor
        from ultralytics.utils import nms, ops

        class Candidates(DetectionPredictor):
            # Every candidate box of the image with its per-class scores, before NMS drops them,
            # and the detections NMS keeps (the settings of a plain predict, as AI check runs it).
            def postprocess(self, preds, img, orig_imgs, **kwargs):
                pred = preds[0] if isinstance(preds, (list, tuple)) else preds
                raw = pred[0]  # (4 + nc, n)
                shape = (orig_imgs[0] if isinstance(orig_imgs, list) else orig_imgs[0].permute(1, 2, 0)).shape
                boxes = ops.scale_boxes(img.shape[2:], ops.xywh2xyxy(raw[:4].T), shape)
                dets = nms.non_max_suppression(pred, 0.25, 0.7, max_det=300)[0]
                dets[:, :4] = ops.scale_boxes(img.shape[2:], dets[:, :4], shape)
                out = type('Candidates', (), {})()  # the predictor sets .speed on what it gets back
                out.boxes, out.probs = boxes.cpu().numpy(), raw[4:].T.cpu().numpy()
                out.dets = dets.cpu().numpy()
                return [out]

        self.model = YOLO(str(weights))
        self.weights = Path(str(weights)).name
        self.names = {v: k for k, v in self.model.names.items()}
        self.args = dict(device=device, imgsz=imgsz, conf=0.0, verbose=False, predictor=Candidates)
        self.fit, self.flip, self.missing = fit, flip, missing

    def cls(self, label):
        key = ' '.join(str(label).lower().replace('_', ' ').replace('-', ' ').split())
        key = ALIASES.get(key.replace(' ', '_'), key)
        return self.names.get(key) if key else None

    def _pass(self, image, boxes, classes):
        r = self.model.predict(image, **self.args)[0]
        if not len(boxes):
            return np.zeros(0), r
        iou, _ = iou_matrix(boxes, r.boxes)
        own = r.probs[:, classes].T  # (boxes, candidates): score of each box's own label
        return np.where(iou >= self.fit, own, 0.0).max(axis=1), r

    def _uncovered(self, dets, drawn, wanted):
        """Detections of a wanted class at the threshold that no drawn box covers, best first."""
        dets = dets[(dets[:, 4] >= self.missing) & np.isin(dets[:, 5].astype(int), list(wanted))]
        dets = dets[np.argsort(-dets[:, 4])]
        if len(drawn) and len(dets):
            iou, share = iou_matrix(dets[:, :4], drawn)
            dets = dets[~((iou >= COVER_IOU) | (share >= COVER_SHARE)).any(axis=1)]
        kept = []
        for d in dets:  # one object found under two classes: keep the surer one
            if not kept or iou_matrix(d[None, :4], np.array([k[:4] for k in kept]))[0].max() < DUPLICATE_IOU:
                kept.append(d)
        return kept

    def score(self, image_path, boxes, labels, wanted=()):
        """boxes: [[x1, y1, x2, y2], ...] in pixels. wanted: model classes to look for missing
        objects of. Returns one score (or None) per box, and the missing objects as
        (class, score, [x1, y1, x2, y2])."""
        classes = [self.cls(l) for l in labels]
        known = [i for i, c in enumerate(classes) if c is not None]
        out = [None] * len(boxes)
        if not known and not wanted:
            return out, []
        import cv2
        img = cv2.imread(str(image_path))
        if img is None:
            raise SystemExit(f'Không đọc được ảnh {image_path}')
        b = np.asarray([boxes[i] for i in known], dtype=np.float64).reshape(-1, 4)
        c = [classes[i] for i in known]
        s, r = self._pass(img, b, c)
        if self.flip and known:
            w = img.shape[1]
            fb = b.copy(); fb[:, [0, 2]] = w - b[:, [2, 0]]
            s = (s + self._pass(img[:, ::-1].copy(), fb, c)[0]) / 2
        for i, v in zip(known, s):
            out[i] = round(float(v), 4)
        drawn = np.asarray(boxes, dtype=np.float64).reshape(-1, 4)
        missing = [(int(d[5]), round(float(d[4]), 4), [round(float(x), 2) for x in d[:4]])
                   for d in self._uncovered(r.dets, drawn, set(wanted))] if wanted else []
        return out, missing


def find_images(root):
    return {p.name: p for p in Path(root).rglob('*') if p.suffix.lower() in IMAGE_EXT}


def wanted_classes(scorer, labels):
    """Model class -> the file's own name for it, for every label of the file the model knows."""
    named = {}
    for label in labels:
        c = scorer.cls(label)
        if c is not None:
            named.setdefault(c, label)
    return named


def set_score(shape, value):
    for a in shape.findall('attribute'):
        if a.get('name') == FIELD:
            shape.remove(a)
    if value is not None:
        a = ET.SubElement(shape, 'attribute', name=FIELD)
        a.text = f'{value:.4f}'


def declare_score(root):
    # CVAT only re-imports an attribute its label declares.
    for label in root.iter('label'):
        attrs = label.find('attributes')
        if attrs is None:
            attrs = ET.SubElement(label, 'attributes')
        if any(a.findtext('name') == FIELD for a in attrs.findall('attribute')):
            continue
        a = ET.SubElement(attrs, 'attribute')
        for k, v in ((('name', FIELD), ('mutable', 'True'), ('input_type', 'number'),
                      ('default_value', '0'), ('values', '0;1;0.0001'))):
            ET.SubElement(a, k).text = v


def box_xyxy(s):
    return [float(s.get('xtl')), float(s.get('ytl')), float(s.get('xbr')), float(s.get('ybr'))]


def run_cvat(scorer, src, images, out, log):
    tree = ET.parse(src)
    root = tree.getroot()
    files = find_images(images)
    meta = root.find('meta')
    labels = [l.findtext('name') for l in meta.iter('label')] if meta is not None else []
    jobs = []  # (frame key, image path, [(shape element, label)])
    if root.find('image') is not None:  # CVAT for images
        key = 'image_id'
        for im in root.iter('image'):
            name = Path(im.get('name')).name
            if name not in files:
                raise SystemExit(f'Thiếu ảnh {name} trong {images}')
            jobs.append((im.get('id'), files[name], [(b, b.get('label')) for b in im.findall('box')]))
        labels += [b.get('label') for im in root.iter('image') for b in im.findall('box')]
    else:  # CVAT for video: frames are the images in name order
        key = 'frame'
        order = [files[n] for n in sorted(files)]
        by_frame = {}
        for tr in root.iter('track'):
            labels.append(tr.get('label'))
            for b in tr.findall('box'):
                if b.get('outside') != '1':
                    by_frame.setdefault(int(b.get('frame')), []).append((b, tr.get('label')))
        frames = range(len(order)) if scorer.missing is not None else sorted(by_frame)
        for frame in frames:
            if frame >= len(order):
                raise SystemExit(f'Frame {frame} không có ảnh: thư mục chỉ có {len(order)} ảnh.')
            jobs.append((str(frame), order[frame], by_frame.get(frame, [])))
    wanted = wanted_classes(scorer, labels) if scorer.missing is not None else {}
    unscored, found = {}, []
    start = time.time()
    for n, (frame, path, shapes) in enumerate(jobs, 1):
        scores, missing = scorer.score(path, [box_xyxy(s) for s, _ in shapes], [l for _, l in shapes], wanted)
        for (s, label), v in zip(shapes, scores):
            set_score(s, v)
            if v is None:
                unscored[label] = unscored.get(label, 0) + 1
        found += [(frame, c, v, b) for c, v, b in missing]
        log(n, len(jobs), start)
    declare_score(root)
    if meta is None:
        meta = ET.Element('meta'); root.insert(1, meta)
    for old in meta.findall(MISSING):
        meta.remove(old)
    if scorer.missing is not None:
        block = ET.SubElement(meta, MISSING, model=scorer.weights,
                              threshold=str(scorer.missing))
        for frame, c, v, (x1, y1, x2, y2) in found:
            ET.SubElement(block, 'object', {key: frame, 'label': wanted[c], 'score': f'{v:.4f}',
                                            'xtl': f'{x1:.2f}', 'ytl': f'{y1:.2f}', 'xbr': f'{x2:.2f}', 'ybr': f'{y2:.2f}'})
    tree.write(out, encoding='utf-8', xml_declaration=True)
    return sum(len(s) for _, _, s in jobs), unscored, len(found)


def run_coco(scorer, src, images, out, log):
    data = json.loads(Path(src).read_text(encoding='utf-8'))
    files = find_images(images)
    cats = {c['id']: c['name'] for c in data['categories']}
    wanted = wanted_classes(scorer, cats.values()) if scorer.missing is not None else {}
    cat_of = {name: i for i, name in cats.items()}
    by_image = {}
    for a in data['annotations']:
        by_image.setdefault(a['image_id'], []).append(a)
    unscored, found, start, imgs = {}, [], time.time(), data['images']
    for n, im in enumerate(imgs, 1):
        anns = by_image.get(im['id'], [])
        name = Path(im['file_name']).name
        if (anns or wanted) and name not in files:
            raise SystemExit(f'Thiếu ảnh {name} trong {images}')
        boxes = [[a['bbox'][0], a['bbox'][1], a['bbox'][0] + a['bbox'][2], a['bbox'][1] + a['bbox'][3]] for a in anns]
        scores, missing = scorer.score(files[name], boxes, [cats[a['category_id']] for a in anns], wanted) \
            if anns or wanted else ([], [])
        for a, v in zip(anns, scores):
            a.pop(FIELD, None)
            if v is None:
                unscored[cats[a['category_id']]] = unscored.get(cats[a['category_id']], 0) + 1
            else:
                a[FIELD] = v
        found += [{'image_id': im['id'], 'category_id': cat_of[wanted[c]], 'score': v,
                   'bbox': [b[0], b[1], round(b[2] - b[0], 2), round(b[3] - b[1], 2)]} for c, v, b in missing]
        log(n, len(imgs), start)
    data.pop(MISSING, None)
    if scorer.missing is not None:
        data[MISSING] = found
    Path(out).write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    return len(data['annotations']), unscored, len(found)


def main():
    for stream in (sys.stdout, sys.stderr):  # Windows consoles default to a code page without Vietnamese
        stream.reconfigure(encoding='utf-8', errors='replace')
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('annotations', type=Path, help='CVAT XML (images hoặc video) hoặc COCO JSON')
    p.add_argument('--images', type=Path, required=True, help='thư mục chứa ảnh (tìm theo tên file, cả thư mục con)')
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--model', default='yolo11s.pt')
    p.add_argument('--imgsz', type=int, default=1280)
    p.add_argument('--fit', type=float, default=0.5, help='IoU tối thiểu giữa box và ứng viên của model')
    p.add_argument('--missing', type=float, default=0.4, help='điểm tối thiểu của một vật nghi bị sót')
    p.add_argument('--no-missing', action='store_true', help='chỉ chấm box, không tìm vật bị sót')
    p.add_argument('--flip', action='store_true', help='chấm thêm trên ảnh lật ngang rồi lấy trung bình (chậm gấp đôi)')
    p.add_argument('--device', default='cpu')
    a = p.parse_args()
    scorer = Scorer(a.model, a.imgsz, a.fit, a.flip, a.device, None if a.no_missing else a.missing)

    def log(n, total, start):
        if n % 50 == 0 or n == total:
            print(f'\r{n}/{total} ảnh  {(time.time() - start) / n:.2f} s/ảnh', end='', file=sys.stderr, flush=True)

    run = run_coco if a.annotations.suffix.lower() == '.json' else run_cvat
    total, unscored, missing = run(scorer, a.annotations, a.images, a.out, log)
    print(file=sys.stderr)
    print(f'Đã chấm {total - sum(unscored.values())}/{total} box -> {a.out}')
    if unscored:
        print('Không chấm được (model không có lớp này):', ', '.join(f'{k} ({v})' for k, v in sorted(unscored.items())))
    if not a.no_missing:
        print(f'Vật nghi bị sót: {missing}')


if __name__ == '__main__':
    main()
