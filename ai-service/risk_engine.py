import json
from collections import defaultdict

INPUT_PATH = "../outputs/tracks.json"
OUTPUT_PATH = "../outputs/risk_cases.json"


# =========================
# CẤU HÌNH RISK
# =========================

CLASS_CHANGE_SCORE = 40
CONFIDENCE_DROP_SCORE = 30
BBOX_SIZE_JUMP_SCORE = 30

CONFIDENCE_DROP_THRESHOLD = 0.25
BBOX_SIZE_CHANGE_THRESHOLD = 0.50

# Chỉ lưu case có Risk >= 30
MIN_RISK_SCORE = 30


# =========================
# ĐỌC TRACKING DATA
# =========================

print("Đang đọc tracks.json...")

with open(INPUT_PATH, "r", encoding="utf-8") as f:
    frames = json.load(f)


# Gom dữ liệu theo track_id
tracks = defaultdict(list)

for frame in frames:

    frame_id = frame["frame_id"]

    for obj in frame["objects"]:

        tracks[obj["track_id"]].append({
            "frame_id": frame_id,
            **obj
        })


print(f"Tổng số Track ID: {len(tracks)}")


# =========================
# TÍNH RISK
# =========================

risk_cases = []


for track_id, history in tracks.items():

    # Sắp xếp theo frame
    history.sort(key=lambda x: x["frame_id"])

    for i in range(1, len(history)):

        previous = history[i - 1]
        current = history[i]

        risk_score = 0
        reasons = []


        # ---------------------------------
        # 1. CLASS CHANGE
        # loại vật thể thay đổi
        # ---------------------------------

        if previous["class_name"] != current["class_name"]:

            risk_score += CLASS_CHANGE_SCORE

            reasons.append(
                f"Class thay đổi: "
                f"{previous['class_name']} -> "
                f"{current['class_name']}"
            )


        # ---------------------------------
        # 2. CONFIDENCE DROP
        # confidence giảm mạnh
        # ---------------------------------

        confidence_drop = (
            previous["confidence"]
            - current["confidence"]
        )

        if confidence_drop >= CONFIDENCE_DROP_THRESHOLD:

            risk_score += CONFIDENCE_DROP_SCORE

            reasons.append(
                f"Confidence giảm: "
                f"{previous['confidence']:.2f} -> "
                f"{current['confidence']:.2f}"
            )


        # ---------------------------------
        # 3. BBOX SIZE JUMP
        # diện tích bbox thay đổi bất thường
        # ---------------------------------

        prev_width = previous["bbox"]["width"]
        prev_height = previous["bbox"]["height"]

        curr_width = current["bbox"]["width"]
        curr_height = current["bbox"]["height"]

        previous_area = prev_width * prev_height
        current_area = curr_width * curr_height

        if previous_area > 0:

            size_change = abs(
                current_area - previous_area
            ) / previous_area

            if size_change >= BBOX_SIZE_CHANGE_THRESHOLD:

                risk_score += BBOX_SIZE_JUMP_SCORE

                reasons.append(
                    f"BBox thay đổi "
                    f"{size_change * 100:.1f}%"
                )


        # ---------------------------------
        # LƯU CASE ĐÁNG NGHI
        # ---------------------------------

        if risk_score >= MIN_RISK_SCORE:

            risk_cases.append({
                "frame_id": current["frame_id"],
                "track_id": track_id,

                "class_name": current["class_name"],
                "confidence": current["confidence"],

                "risk_score": min(risk_score, 100),

                "reasons": reasons,

                "bbox": current["bbox"]
            })


# Risk cao nhất lên đầu
risk_cases.sort(
    key=lambda x: x["risk_score"],
    reverse=True
)


# =========================
# LƯU JSON
# =========================

with open(
    OUTPUT_PATH,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        risk_cases,
        f,
        indent=2,
        ensure_ascii=False
    )


# =========================
# THỐNG KÊ
# =========================

high = sum(
    1 for x in risk_cases
    if x["risk_score"] >= 70
)

medium = sum(
    1 for x in risk_cases
    if 40 <= x["risk_score"] < 70
)

low = sum(
    1 for x in risk_cases
    if x["risk_score"] < 40
)


print("\n==============================")
print("SMARTREVIEW RISK ENGINE V0")
print("==============================")

print(f"Tổng tracks: {len(tracks)}")
print(f"Cases đáng nghi: {len(risk_cases)}")

print()
print(f"🔴 HIGH RISK:   {high}")
print(f"🟠 MEDIUM RISK: {medium}")
print(f"🟡 LOW RISK:    {low}")

print()
print(f"Output: {OUTPUT_PATH}")

print("==============================")

