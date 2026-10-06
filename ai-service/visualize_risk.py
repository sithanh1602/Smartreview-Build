import cv2
import json
import os

VIDEO_PATH = "../data/traffic_test.mp4"
RISK_PATH = "../outputs/risk_cases.json"
OUTPUT_DIR = "../outputs/risk_frames"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Đọc Risk cases
with open(RISK_PATH, "r", encoding="utf-8") as f:
    risk_cases = json.load(f)

# Chỉ lấy HIGH RISK trước
high_risk_cases = [
    case for case in risk_cases
    if case["risk_score"] >= 70
]

print(f"High Risk cần visualize: {len(high_risk_cases)}")

# Gom theo frame
cases_by_frame = {}

for case in high_risk_cases:
    frame_id = case["frame_id"]

    if frame_id not in cases_by_frame:
        cases_by_frame[frame_id] = []

    cases_by_frame[frame_id].append(case)


cap = cv2.VideoCapture(VIDEO_PATH)

if not cap.isOpened():
    raise RuntimeError("Không mở được video")

frame_id = 0
saved = 0

while True:

    success, frame = cap.read()

    if not success:
        break

    # Frame này có Risk?
    if frame_id in cases_by_frame:

        for case in cases_by_frame[frame_id]:

            bbox = case["bbox"]

            x1 = int(bbox["x1"])
            y1 = int(bbox["y1"])
            x2 = int(bbox["x2"])
            y2 = int(bbox["y2"])

            risk = case["risk_score"]
            track_id = case["track_id"]
            class_name = case["class_name"]

            # Vẽ bbox
            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                (0, 0, 255),
                4
            )

            label = (
                f"RISK {risk} | "
                f"{class_name} | "
                f"ID {track_id}"
            )

            # nền label
            cv2.rectangle(
                frame,
                (x1, max(0, y1 - 40)),
                (min(frame.shape[1], x1 + 430), y1),
                (0, 0, 255),
                -1
            )

            cv2.putText(
                frame,
                label,
                (x1 + 5, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (255, 255, 255),
                2
            )

        output_path = os.path.join(
            OUTPUT_DIR,
            f"risk_frame_{frame_id}.jpg"
        )

        cv2.imwrite(output_path, frame)

        print(f"Saved: {output_path}")

        saved += 1

    frame_id += 1


cap.release()

print("\n==========================")
print("VISUALIZATION HOÀN THÀNH")
print(f"Đã lưu: {saved} ảnh")
print(f"Folder: {OUTPUT_DIR}")
print("==========================")
