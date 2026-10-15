#!/usr/bin/env python3
"""Đo mặt đường quanh cuboid trên một scene đã export: lift hiện tại, độ cao mặt đường theo từng
phía, độ dốc mặt phẳng, để tìm chỗ lift đo sai ở mép đường và trên dốc.

  ../.venv/bin/python -I scripts/risk3d/ground_study.py <scene dir> [out.json]   (từ web/)
"""
import json, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server/projects3d"))
from export_waymo import to_box, OTHER_GROW_M  # noqa: E402

TYPES = {"VEHICLE", "PEDESTRIAN", "CYCLIST"}


def load(scene_dir, frame):
    raw = (Path(scene_dir) / "frames" / f"{frame['timestamp']}.bin").read_bytes()
    n = len(raw) // 22
    return np.frombuffer(raw[: n * 16], "<f4").reshape(n, 4)[:, :3].astype(np.float64)


def study(points, boxes):
    out = []
    for box in boxes:
        if box["type"] not in TYPES or "lift" not in box or np.hypot(*box["center"][:2]) > 50:
            continue
        c, half = np.array(box["center"]), np.array(box["size"]) / 2
        near = points[np.abs(points[:, :2] - c[:2]).max(1) < np.hypot(*half[:2]) + 3]
        local = to_box(near, box)
        bottom = -half[2]
        beyond = np.maximum(np.abs(local[:, 0]) - half[0], np.abs(local[:, 1]) - half[1])
        road = (beyond >= 0.5) & (beyond <= 2.5) & (local[:, 2] <= bottom + 1.0)
        for other in boxes:
            if other is box:
                continue
            oh = np.array(other["size"]) / 2 + OTHER_GROW_M
            o = to_box(near, other)
            road &= ~((np.abs(o[:, 0]) <= oh[0]) & (np.abs(o[:, 1]) <= oh[1]) & (np.abs(o[:, 2]) <= oh[2]))
        g = local[road]
        if len(g) < 20:
            continue
        # Phía: x>half dọc trước, x<-half sau, y>half trái, y<-half phải.
        sides = {}
        for name, m in {
            "front": g[:, 0] > half[0], "back": g[:, 0] < -half[0],
            "left": g[:, 1] > half[1], "right": g[:, 1] < -half[1],
        }.items():
            if m.sum() >= 8:
                sides[name] = round(float(bottom - np.percentile(g[m, 2], 10)), 3)
        # Mặt phẳng z = a x + b y + d, lặp bỏ điểm cao (vật, cỏ) ba lần.
        keep = np.ones(len(g), bool)
        for _ in range(3):
            A = np.column_stack([g[keep, 0], g[keep, 1], np.ones(keep.sum())])
            coef, *_ = np.linalg.lstsq(A, g[keep, 2], rcond=None)
            res = g[:, 2] - (g[:, 0] * coef[0] + g[:, 1] * coef[1] + coef[2])
            keep = res < max(0.05, np.percentile(res[keep], 60))
            if keep.sum() < 10:
                break
        # Điểm thấp nhất của chính vật (trong chân cuboid), so với đáy.
        inside = (np.abs(local[:, 0]) <= half[0]) & (np.abs(local[:, 1]) <= half[1]) & (np.abs(local[:, 2]) <= half[2] + 0.5)
        low = float(np.percentile(local[inside, 2], 2) - bottom) if inside.sum() >= 20 else None
        out.append({
            "id": box["id"], "type": box["type"], "lift": box["lift"], "sides": sides,
            "plane_lift": round(float(bottom - coef[2]), 3),
            "slope": round(float(np.hypot(coef[0], coef[1])), 3),
            "spread": round(max(sides.values()) - min(sides.values()), 3) if len(sides) >= 2 else None,
            "low": None if low is None else round(low, 3),
            "points": box.get("counted", box["points"]),
            "range": round(float(np.hypot(*c[:2])), 1),
        })
    return out


def main():
    scene_dir = Path(sys.argv[1])
    scene = json.loads((scene_dir / "scene.json").read_text())
    rows = []
    for i, frame in enumerate(scene["frames"]):
        for r in study(load(scene_dir, frame), frame["boxes"]):
            rows.append({"frame": i, **r})
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(json.dumps(rows))
    print(len(rows), "cuboid")


if __name__ == "__main__":
    main()
