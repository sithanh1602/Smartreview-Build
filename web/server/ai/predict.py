"""Local optional prediction adapter. Input/output paths are server-generated, never client commands."""
import hashlib
import json
import sys
import os
from pathlib import Path


def image_size():
    try:
        value = int(os.environ.get('SMARTREVIEW_AI_IMGSZ', '1280'))
    except ValueError:
        return 1280
    return value if 320 <= value <= 1920 and value % 32 == 0 else 1280


def main():
    manifest_path, model_path, output_path = map(Path, sys.argv[1:4])
    if not model_path.is_file():
        raise RuntimeError('Local model weights unavailable')
    import ultralytics
    from ultralytics import YOLO
    manifest = json.loads(manifest_path.read_text())
    model = YOLO(str(model_path))
    imgsz = image_size()
    predictions = []
    for index, frame in enumerate(manifest['frames']):
        result = model.predict(frame['path'], device='cpu', conf=0.65, imgsz=imgsz, max_det=300, verbose=False)[0]
        for box in result.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            predictions.append({'frame_id': frame['id'], 'label': result.names[int(box.cls[0])], 'confidence': float(box.conf[0]), 'geometry': {'type': 'bbox', 'x': x1, 'y': y1, 'width': x2-x1, 'height': y2-y1}})
        print(json.dumps({'completed': index+1, 'total': len(manifest['frames'])}), flush=True)
    output_path.write_text(json.dumps({'predictions': predictions, 'labels': list(model.names.values()), 'model': {'name': model_path.name, 'sha256': hashlib.sha256(model_path.read_bytes()).hexdigest(), 'runtime': 'ultralytics', 'runtime_version': ultralytics.__version__, 'device': 'cpu', 'image_size': imgsz}}))


if __name__ == '__main__':
    main()
