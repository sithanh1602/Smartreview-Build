from ultralytics import YOLO
import cv2
import json
import os

VIDEO_PATH = "../data/traffic_test.mp4"
OUTPUT_PATH = "../outputs/tracks.json"
MODEL_PATH = "yolo11n.pt"

os.makedirs("../outputs", exist_ok=True)

print("Đang load YOLO + ByteTrack...")
model = YOLO(MODEL_PATH)

cap = cv2.VideoCapture(VIDEO_PATH)

if not cap.isOpened():
    raise RuntimeError(f"Không mở được video: {VIDEO_PATH}")

fps = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

print(f"FPS: {fps:.2f}")
print(f"Tổng frame: {total_frames}")
print("Bắt đầu Tracking...\n")

all_frames = []
frame_id = 0

while True:
    success, frame = cap.read()

    if not success:
        break

    # track() thay vì predict()
    # persist=True: nhớ object từ frame trước
    results = model.track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        conf=0.25,
        verbose=False
    )

    objects = []

    boxes = results[0].boxes

    if boxes is not None and boxes.id is not None:

        for box in boxes:

            track_id = int(box.id[0])
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])

            x1, y1, x2, y2 = box.xyxy[0].tolist()

            width = x2 - x1
            height = y2 - y1

            center_x = (x1 + x2) / 2
            center_y = (y1 + y2) / 2

            objects.append({
                "track_id": track_id,

                "class_id": class_id,
                "class_name": model.names[class_id],

                "confidence": round(confidence, 4),

                "bbox": {
                    "x1": round(x1, 2),
                    "y1": round(y1, 2),
                    "x2": round(x2, 2),
                    "y2": round(y2, 2),

                    "width": round(width, 2),
                    "height": round(height, 2),

                    "center_x": round(center_x, 2),
                    "center_y": round(center_y, 2)
                }
            })

    all_frames.append({
        "frame_id": frame_id,
        "objects": objects
    })

    if frame_id % 30 == 0:
        print(
            f"Frame {frame_id}/{total_frames}"
            f" | Tracking: {len(objects)} objects"
        )

    frame_id += 1

cap.release()

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(all_frames, f, indent=2, ensure_ascii=False)

print("\n==============================")
print("TRACKING HOÀN THÀNH")
print(f"Frames: {frame_id}")
print(f"Output: {OUTPUT_PATH}")
print("==============================")

