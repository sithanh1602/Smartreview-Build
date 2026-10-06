

import json
import math
from collections import defaultdict, Counter

INPUT_PATH = "../outputs/tracks.json"
OUTPUT_PATH = "../outputs/risk_cases_v1.json"

# Chỉ tập trung object giao thông
RELEVANT_CLASSES = {
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "bus",
    "truck"
}

MIN_RISK = 30


# ==========================================
# ĐỌC DATA
# ==========================================

print("Đang đọc tracks.json...")

with open(INPUT_PATH, "r", encoding="utf-8") as f:
    frames = json.load(f)

tracks = defaultdict(list)

for frame in frames:
    frame_id = frame["frame_id"]

    for obj in frame["objects"]:

        if obj["class_name"] not in RELEVANT_CLASSES:
            continue

        tracks[obj["track_id"]].append({
            "frame_id": frame_id,
            **obj
        })

print(f"Tổng Track ID: {len(tracks)}")


# ==========================================
# RISK ENGINE V1
# ==========================================

risk_cases = []

for track_id, history in tracks.items():

    history.sort(key=lambda x: x["frame_id"])

    # Cần ít nhất 3 observation
    if len(history) < 3:
        continue

    for i in range(1, len(history) - 1):

        prev = history[i - 1]
        curr = history[i]
        nxt = history[i + 1]

        risk = 0
        reasons = []

        # ----------------------------------
        # Kiểm tra các frame có gần nhau không
        # ----------------------------------

        prev_gap = curr["frame_id"] - prev["frame_id"]
        next_gap = nxt["frame_id"] - curr["frame_id"]

        # Nếu track bị mất quá lâu thì không so trực tiếp
        if prev_gap > 3 or next_gap > 3:
            continue


        # ==================================
        # 1. TEMPORAL CLASS INCONSISTENCY
        #
        # car -> truck -> car
        # ==================================

        if (
            prev["class_name"] == nxt["class_name"]
            and curr["class_name"] != prev["class_name"]
        ):

            risk += 50

            reasons.append(
                "Temporal class anomaly: "
                f"{prev['class_name']} -> "
                f"{curr['class_name']} -> "
                f"{nxt['class_name']}"
            )


        # ==================================
        # 2. CONFIDENCE DROP
        # ==================================

        neighbor_conf = (
            prev["confidence"] +
            nxt["confidence"]
        ) / 2

        conf_drop = neighbor_conf - curr["confidence"]

        if conf_drop >= 0.20:

            risk += 20

            reasons.append(
                "Confidence thấp hơn frame xung quanh: "
                f"{neighbor_conf:.2f} -> "
                f"{curr['confidence']:.2f}"
            )


        # ==================================
        # 3. BBOX AREA ANOMALY
        # ==================================

        prev_area = (
            prev["bbox"]["width"]
            * prev["bbox"]["height"]
        )

        curr_area = (
            curr["bbox"]["width"]
            * curr["bbox"]["height"]
        )

        next_area = (
            nxt["bbox"]["width"]
            * nxt["bbox"]["height"]
        )

        neighbor_area = (
            prev_area + next_area
        ) / 2

        if neighbor_area > 0:

            area_change = abs(
                curr_area - neighbor_area
            ) / neighbor_area

            if area_change >= 0.50:

                risk += 15

                reasons.append(
                    f"BBox area bất thường: "
                    f"{area_change * 100:.1f}%"
                )


        # ==================================
        # 4. POSITION JUMP
        #
        # tâm bbox nhảy bất thường
        # ==================================

        expected_x = (
            prev["bbox"]["center_x"]
            + nxt["bbox"]["center_x"]
        ) / 2

        expected_y = (
            prev["bbox"]["center_y"]
            + nxt["bbox"]["center_y"]
        ) / 2

        dx = curr["bbox"]["center_x"] - expected_x
        dy = curr["bbox"]["center_y"] - expected_y

        position_error = math.sqrt(
            dx * dx + dy * dy
        )

        bbox_diagonal = math.sqrt(
            curr["bbox"]["width"] ** 2
            + curr["bbox"]["height"] ** 2
        )

        if bbox_diagonal > 0:

            position_ratio = (
                position_error / bbox_diagonal
            )

            if position_ratio >= 0.50:

                risk += 15

                reasons.append(
                    "BBox position bất thường: "
                    f"{position_ratio:.2f}x bbox diagonal"
                )


        # ==================================
        # LƯU CASE
        # ==================================

        if risk >= MIN_RISK:

            risk_cases.append({

                "frame_id": curr["frame_id"],

                "track_id": track_id,

                "class_name": curr["class_name"],

                "confidence": curr["confidence"],

                "risk_score": min(risk, 100),

                "reasons": reasons,

                "bbox": curr["bbox"],

                # Context để UI dùng sau này
                "context": {

                    "previous": {
                        "frame_id": prev["frame_id"],
                        "class_name": prev["class_name"],
                        "confidence": prev["confidence"]
                    },

                    "current": {
                        "frame_id": curr["frame_id"],
                        "class_name": curr["class_name"],
                        "confidence": curr["confidence"]
                    },

                    "next": {
                        "frame_id": nxt["frame_id"],
                        "class_name": nxt["class_name"],
                        "confidence": nxt["confidence"]
                    }
                }
            })


# ==========================================
# SORT RISK CAO → THẤP
# ==========================================

risk_cases.sort(
    key=lambda x: x["risk_score"],
    reverse=True
)


# ==========================================
# LƯU JSON
# ==========================================

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


# ==========================================
# THỐNG KÊ
# ==========================================

high = sum(
    1 for case in risk_cases
    if case["risk_score"] >= 70
)

medium = sum(
    1 for case in risk_cases
    if 40 <= case["risk_score"] < 70
)

low = sum(
    1 for case in risk_cases
    if case["risk_score"] < 40
)


print("\n================================")
print("SMARTREVIEW - RISK ENGINE V1")
print("================================")

print(f"Tracks analyzed: {len(tracks)}")
print(f"Risk cases:      {len(risk_cases)}")

print()
print(f"🔴 HIGH:   {high}")
print(f"🟠 MEDIUM: {medium}")
print(f"🟡 LOW:    {low}")

print()
print(f"Output: {OUTPUT_PATH}")

print("================================")

