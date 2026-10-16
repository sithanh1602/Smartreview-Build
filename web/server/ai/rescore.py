"""Import-time scoring worker. Input/output paths are server-generated, never client commands.

Reads {frames: [{id, path, boxes: [{id, label, box: [x1, y1, x2, y2]}]}], labels: [...]} and
writes {rescore: {annotation id: score}, missing: {frame id: [{label, confidence, box}]}}, with
the scorer of ai-service/score_boxes.py: one model pass per image gives both. Prints one JSON
progress line per image. A model not on disk is downloaded first.
"""
import json
import sys
from pathlib import Path


def main():
    input_path, model_path, output_path, root = sys.argv[1:5]
    # Per-model scorer settings from the server (SCORE_MODELS); older callers pass none.
    imgsz = int(sys.argv[5]) if len(sys.argv) > 5 else 1280
    missing = float(sys.argv[6]) if len(sys.argv) > 6 else 0.4
    blind = set(json.loads(sys.argv[7])) if len(sys.argv) > 7 else set()
    sys.path.insert(0, str(Path(root) / 'ai-service'))
    from score_boxes import Scorer, drop_blind, wanted_classes

    job = json.loads(Path(input_path).read_text(encoding='utf-8'))
    if not Path(model_path).exists():
        # A release asset Ultralytics downloads into the path it is given; exit 3 tells the
        # server the download, not the scoring, failed.
        from ultralytics.utils.downloads import attempt_download_asset
        try:
            attempt_download_asset(model_path)
        except Exception as e:
            print(f'Download of {model_path} failed: {e}', file=sys.stderr)
            sys.exit(3)
        if not Path(model_path).exists():
            sys.exit(3)
    scorer = Scorer(model_path, imgsz=imgsz, missing=missing)
    if blind:
        # Labels the model is blind to stay unscored (a skip) instead of flagging on
        # blindness. A dropped box also covers nothing.
        job['labels'], _ = drop_blind(job['labels'], [], blind)
        for frame in job['frames']:
            _, frame['boxes'] = drop_blind([], frame['boxes'], blind)
    wanted = wanted_classes(scorer, job['labels'])
    rescores, hints = {}, {}
    for n, frame in enumerate(job['frames'], 1):
        boxes = frame['boxes']
        scores, found = scorer.score(frame['path'], [b['box'] for b in boxes], [b['label'] for b in boxes], wanted)
        rescores.update({b['id']: v for b, v in zip(boxes, scores) if v is not None})
        if found:
            hints[frame['id']] = [{'label': wanted[c], 'confidence': v, 'box': b} for c, v, b in found]
        print(json.dumps({'completed': n}), flush=True)
    Path(output_path).write_text(json.dumps({
        'rescore': rescores, 'missing': hints,
        'model': {'name': Path(model_path).name, 'missing_threshold': scorer.missing},
    }), encoding='utf-8')


if __name__ == '__main__':
    main()
