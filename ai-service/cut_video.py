import cv2
import os

INPUT_VIDEO = "../data/traffic.mp4"
OUTPUT_VIDEO = "../data/traffic_test.mp4"

# Muốn lấy bao nhiêu giây
DURATION_SECONDS = 30

cap = cv2.VideoCapture(INPUT_VIDEO)

if not cap.isOpened():
    raise RuntimeError(f"Không mở được video: {INPUT_VIDEO}")

fps = cap.get(cv2.CAP_PROP_FPS)
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

max_frames = int(fps * DURATION_SECONDS)

print(f"FPS: {fps}")
print(f"Độ phân giải: {width}x{height}")
print(f"Video gốc: {total_frames / fps:.1f} giây")
print(f"Sẽ cắt: {DURATION_SECONDS} giây")

fourcc = cv2.VideoWriter_fourcc(*"mp4v")

writer = cv2.VideoWriter(
    OUTPUT_VIDEO,
    fourcc,
    fps,
    (width, height)
)

frame_count = 0

while frame_count < max_frames:
    success, frame = cap.read()

    if not success:
        break

    writer.write(frame)
    frame_count += 1

cap.release()
writer.release()

print("\nHOÀN THÀNH")
print(f"Đã ghi {frame_count} frames")
print(f"Video mới: {OUTPUT_VIDEO}")

