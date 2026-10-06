from ultralytics import YOLO
import cv2
import json
import os

VIDEO_PATH = "../data/traffic_test.mp4"
OUTPUT_PATH = "../outputs/predictions.json"
MODEL_PATH = "yolo11n.pt"

os.makedirs("../outputs", exist_ok=True)

print("Đang load YOLO...")
model = YOLO(MODEL_PATH)

cap = cv2.VideoCapture(VIDEO_PATH)

if not cap.isOpened():
    raise RuntimeError(f"Không mở được video: {VIDEO_PATH}")

fps = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

print(f"FPS: {fps:.2f}")
print(f"Tổng frame: {total_frames}")
print("Bắt đầu detection...\n")

predictions = []
frame_id = 0

while True:
    success, frame = cap.read()

    if not success:
        break

    results = model.predict(
        frame,
        conf=0.25,
        verbose=False
    )

    detections = []

    for box in results[0].boxes:
        class_id = int(box.cls[0])
        confidence = float(box.conf[0])

        x1, y1, x2, y2 = box.xyxy[0].tolist()

        detections.append({
            "class_id": class_id,
            "class_name": model.names[class_id],
            "confidence": round(confidence, 4),
            "bbox": {
                "x1": round(x1, 2),
                "y1": round(y1, 2),
                "x2": round(x2, 2),
                "y2": round(y2, 2)
            }
        })

    predictions.append({
        "frame_id": frame_id,
        "detections": detections
    })

    if frame_id % 30 == 0:
        print(
            f"Frame {frame_id}/{total_frames} "
            f"| {len(detections)} vật thể"
        )

    frame_id += 1

cap.release()

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(predictions, f, indent=2, ensure_ascii=False)

print("\n============================")
print("HOÀN THÀNH")
print(f"Frames xử lý: {frame_id}")
print(f"JSON: {OUTPUT_PATH}")
print("============================")
