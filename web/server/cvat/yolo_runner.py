"""YOLO inference runner for CVAT frames.
Takes a manifest JSON path with list of frame files and outputs predictions.
"""
import sys
import json
from pathlib import Path

def main():
    if len(sys.argv) < 4:
        print("Usage: yolo_runner.py <manifest.json> <model.pt> <output.json>", file=sys.stderr)
        sys.exit(1)

    manifest_path = Path(sys.argv[1])
    model_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    from ultralytics import YOLO

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    if not model_path.is_file():
        # Ultralytics can auto-download standard model names (yolo11n.pt, yolo11s.pt, etc.)
        print(f"Model file not found at {model_path}. Auto-downloading {model_path.name} via Ultralytics...", file=sys.stderr)
        model = YOLO(model_path.name)
        try:
            import shutil
            downloaded = Path(model_path.name)
            if downloaded.is_file() and str(model_path) != model_path.name:
                model_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(str(downloaded), str(model_path))
        except Exception as e:
            print(f"Notice: could not copy downloaded model to {model_path}: {e}", file=sys.stderr)
    else:
        model = YOLO(str(model_path))

    predictions = []
    frames = manifest.get("frames", [])

    for idx, item in enumerate(frames):
        print(f"[PROGRESS] {idx + 1}/{len(frames)}", file=sys.stderr, flush=True)
        frame_id = item["id"]
        frame_index = item.get("index", 0)
        img_path = item["path"]

        if not Path(img_path).is_file():
            continue

        results = model.predict(
            img_path,
            conf=0.25,
            imgsz=1280,
            verbose=False
        )

        for box in results[0].boxes:
            class_id = int(box.cls[0])
            conf = float(box.conf[0])
            label_name = model.names[class_id]
            x1, y1, x2, y2 = box.xyxy[0].tolist()

            predictions.append({
                "frame_id": frame_id,
                "frame_index": frame_index,
                "label": label_name,
                "confidence": round(conf, 4),
                "geometry": {
                    "type": "bbox",
                    "x": round(x1, 2),
                    "y": round(y1, 2),
                    "width": round(x2 - x1, 2),
                    "height": round(y2 - y1, 2)
                }
            })

    output_path.write_text(json.dumps({
        "predictions": predictions,
        "labels": list(model.names.values()),
        "model": model_path.name
    }, ensure_ascii=False), encoding="utf-8")

if __name__ == "__main__":
    main()
