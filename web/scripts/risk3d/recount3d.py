#!/usr/bin/env python3
"""Đo lại cuboid đã bị cài lỗi bằng đúng hàm count_points của exporter, để phép thử
(inject3d.ts) và lúc import luôn cùng một cách đo.

Vào (stdin, JSON): {"directory": <thư mục export>, "items": [{"timestamp", "boxes": [...cuboid của
frame...], "targets": [chỉ số cuboid cần đo]}]}. Ra (stdout): mỗi item một danh sách cuboid đã đo.
"""
import json, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server/projects3d"))
from export_waymo import count_points  # noqa: E402

FIELDS = ("counted", "outside", "slack", "moved", "lift")
request = json.load(sys.stdin)
directory = Path(request["directory"])
out = []
for item in request["items"]:
    raw = (directory / "frames" / f"{item['timestamp']}.bin").read_bytes()
    n = len(raw) // 22
    points = np.frombuffer(raw[: n * 16], "<f4").reshape(n, 4)[:, :3].astype(np.float64)
    boxes = item["boxes"]
    targets = [boxes[i] for i in item["targets"]]
    for box in targets:
        for field in FIELDS:
            box.pop(field, None)
    count_points(points, boxes, targets)
    out.append([{f: box[f] for f in FIELDS if f in box} for box in targets])
json.dump(out, sys.stdout)
