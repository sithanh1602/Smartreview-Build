"""Optional video preparation. The schema, risk engine and image datasets do not need OpenCV."""
import json
import sys
from pathlib import Path
import cv2

mode, video = sys.argv[1:3]
cap = cv2.VideoCapture(video)
if not cap.isOpened():
    raise RuntimeError(f"Cannot open video: {video}")
if mode == "probe":
    print(json.dumps({
        "name": Path(video).name,
        "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
        "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        "fps": cap.get(cv2.CAP_PROP_FPS),
        "frame_count": int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
    }))
elif mode == "extract":
    destination, request = map(Path, sys.argv[3:5])
    needed = set(json.loads(request.read_text()))
    destination.mkdir(parents=True, exist_ok=True)
    for index in range(max(needed, default=-1) + 1):
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError(f"Decode failed at frame {index}")
        if index in needed:
            temp = destination / f"{index}.tmp.jpg"
            if not cv2.imwrite(str(temp), frame, [cv2.IMWRITE_JPEG_QUALITY, 94]):
                raise RuntimeError(f"Cannot save frame {index}")
            temp.replace(destination / f"{index}.jpg")
else:
    raise ValueError(f"Unknown operation: {mode}")
cap.release()
