import cv2
import json
import os

VIDEO_PATH = "../data/traffic_test.mp4"
RISK_PATH = "../outputs/risk_cases_v1.json"
OUTPUT_DIR = "../outputs/context_frames"

os.makedirs(OUTPUT_DIR, exist_ok=True)

with open(RISK_PATH, "r", encoding="utf-8") as f:
    risk_cases = json.load(f)

# Lấy case Risk cao nhất
case = risk_cases[0]

track_id = case["track_id"]
risk = case["risk_score"]
context = case["context"]

target_frames = {
    context["previous"]["frame_id"]: ("PREVIOUS", context["previous"]),
    context["current"]["frame_id"]: ("CURRENT", context["current"]),
    context["next"]["frame_id"]: ("NEXT", context["next"])
}

print(f"Track ID: {track_id}")
print(f"Risk: {risk}")
print(f"Frames: {list(target_frames.keys())}")

cap = cv2.VideoCapture(VIDEO_PATH)

frame_id = 0

while True:
    success, frame = cap.read()

    if not success:
        break

    if frame_id in target_frames:

        position, info = target_frames[frame_id]

        # CURRENT frame có bbox Risk chính xác
        if position == "CURRENT":

            bbox = case["bbox"]

            x1 = int(bbox["x1"])
            y1 = int(bbox["y1"])
            x2 = int(bbox["x2"])
            y2 = int(bbox["y2"])

            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                (0, 0, 255),
                4
            )

            cv2.putText(
                frame,
                f"RISK {risk} | {info['class_name']} | ID {track_id}",
                (x1, max(30, y1 - 15)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 0, 255),
                2
            )

        # Header
        cv2.rectangle(
            frame,
            (0, 0),
            (650, 70),
            (0, 0, 0),
            -1
        )

        cv2.putText(
            frame,
            f"{position} | Frame {frame_id} | "
            f"{info['class_name']} | conf {info['confidence']:.2f}",
            (15, 45),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (255, 255, 255),
            2
        )

        output = os.path.join(
            OUTPUT_DIR,
            f"{frame_id}_{position.lower()}.jpg"
        )

        cv2.imwrite(output, frame)

        print(f"Saved: {output}")

    frame_id += 1

cap.release()

print("\nContext:")
print(
    f"{context['previous']['class_name']} "
    f"-> {context['current']['class_name']} "
    f"-> {context['next']['class_name']}"
)

print("\nHoàn thành.")
