"""Run the detector over the subset and save portable predictions.

conf=0.05 on purpose: the 0.05-0.3 band is the grey zone the signal table counts
(`n_grey`), and those boxes are the main hint that a vehicle was missed. The
output JSON carries no images, so it can be moved to Kaggle or anywhere else.
"""
import argparse
import hashlib
import json
import os
import time
from pathlib import Path

os.environ.setdefault('YOLO_AUTOINSTALL', 'false')

COCO_TO_BDD = {'car': 'car', 'truck': 'truck', 'bus': 'bus',
               'motorcycle': 'motorcycle', 'bicycle': 'bicycle'}
INFERENCE_CONF = 0.05


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--images', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--model', default='yolo11n.pt')
    parser.add_argument('--imgsz', type=int, default=1280)
    parser.add_argument('--device', default='cpu', help="'cpu', or 0 for the first GPU")
    args = parser.parse_args()

    import torch
    torch.set_num_threads(min(8, os.cpu_count() or 1))
    import ultralytics
    from ultralytics import YOLO

    paths = sorted(args.images.glob('*.jpg'))
    if not paths:
        raise SystemExit(f'no images in {args.images}')
    model = YOLO(args.model)
    started = time.perf_counter()
    frames, kept, total = {}, 0, 0
    for index, path in enumerate(paths, start=1):
        result = model.predict(str(path), device=args.device, conf=INFERENCE_CONF,
                               imgsz=args.imgsz, max_det=300, verbose=False)[0]
        boxes = []
        for box in result.boxes:
            total += 1
            label = COCO_TO_BDD.get(result.names[int(box.cls[0])])
            if label is None:
                continue  # person/traffic light/... are outside the vehicle scope
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            boxes.append({'label': label, 'confidence': round(float(box.conf[0]), 5),
                          'x': round(x1, 2), 'y': round(y1, 2),
                          'width': round(x2 - x1, 2), 'height': round(y2 - y1, 2)})
            kept += 1
        frames[path.name] = boxes
        if index % 250 == 0 or index == len(paths):
            rate = (time.perf_counter() - started) / index
            print(f'{index}/{len(paths)}  {rate:.2f}s/img  eta '
                  f'{rate * (len(paths) - index) / 60:.1f} min', flush=True)

    weights = Path(model.ckpt_path or args.model)
    args.out.write_text(json.dumps({
        'model': {
            'weights': weights.name,
            'sha256': hashlib.sha256(weights.read_bytes()).hexdigest() if weights.is_file() else None,
            'ultralytics': ultralytics.__version__,
            'device': str(args.device), 'imgsz': args.imgsz, 'conf': INFERENCE_CONF,
            'class_map': COCO_TO_BDD,
        },
        'images': len(paths), 'predictions_kept': kept, 'predictions_total': total,
        'seconds': round(time.perf_counter() - started, 1),
        'frames': frames,
    }, ensure_ascii=False), encoding='utf-8')
    print(f'saved {kept} vehicle predictions ({total} raw) -> {args.out}')


if __name__ == '__main__':
    main()
