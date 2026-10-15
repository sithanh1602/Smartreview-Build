#!/usr/bin/env python3
"""So các cách đo mặt đường dưới cuboid (lift) trên nhãn đúng và khi nâng/hạ cuboid.

  ../.venv/bin/python -I scripts/risk3d/ground_compare.py <scene dir> <out.json>   (từ web/)

Mỗi dòng: frame, id, type, range, shift (m nâng cuboid), lift theo từng cách đo.
"""
import json, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server/projects3d"))
from export_waymo import to_box, OTHER_GROW_M  # noqa: E402

TYPES = {"VEHICLE", "PEDESTRIAN", "CYCLIST"}
SHIFTS = [0.0, 0.5, -0.5, 1.0, -1.0]
CELL = 0.5
REACH = 2.5


def load(scene_dir, frame):
    raw = (Path(scene_dir) / "frames" / f"{frame['timestamp']}.bin").read_bytes()
    n = len(raw) // 22
    return np.frombuffer(raw[: n * 16], "<f4").reshape(n, 4)[:, :3].astype(np.float64)


def ring_percentile(local, half, theirs):
    bottom = -half[2]
    beyond = np.maximum(np.abs(local[:, 0]) - half[0], np.abs(local[:, 1]) - half[1])
    road = (beyond >= 0.5) & (beyond <= 2.5) & (local[:, 2] <= bottom + 1.0) & ~theirs
    if road.sum() < 20:
        return None
    return bottom - np.percentile(local[road, 2], 10)


def plane(local, half, theirs, inner=True, max_slope=0.15):
    """Mặt đường quanh cuboid: thấp nhất mỗi ô CELL, khớp mặt phẳng có trọng số (ô gần chân cuboid
    nặng hơn), bỏ dần ô cao hơn mặt phẳng; trả (a, b, c) z = a x + b y + c trong hệ cuboid."""
    beyond = np.maximum(np.abs(local[:, 0]) - half[0], np.abs(local[:, 1]) - half[1])
    pick = (beyond <= REACH) & ~theirs
    if not inner:
        pick &= beyond >= 0.5
    p = local[pick]
    if len(p) < 20:
        return None
    ij = np.floor(p[:, :2] / CELL).astype(int)
    key = ij[:, 0] * 100003 + ij[:, 1]
    order = np.lexsort((p[:, 2], key))
    key, p = key[order], p[order]
    first = np.r_[True, key[1:] != key[:-1]]
    cells = p[first]  # điểm thấp nhất mỗi ô
    if len(cells) < 6:
        return None
    b_cells = np.maximum(np.abs(cells[:, 0]) - half[0], np.abs(cells[:, 1]) - half[1])
    w = 1.0 / (0.5 + np.maximum(b_cells, 0))
    # Bắt đầu từ mặt thấp: thân xe, bụi cây, tường là ô cao, bỏ từ đầu.
    keep = cells[:, 2] < np.percentile(cells[:, 2], 25) + 0.3
    coef = np.array([0.0, 0.0, np.median(cells[keep, 2])])
    for _ in range(4):
        x, y, z, ww = cells[keep, 0], cells[keep, 1], cells[keep, 2], w[keep]
        # Độ dốc theo một phương chỉ đo được khi có ô ở cả hai phía của cuboid theo phương đó.
        ax = x.min() < -half[0] * 0.5 and x.max() > half[0] * 0.5
        ay = y.min() < -half[1] * 0.5 and y.max() > half[1] * 0.5
        cols = [c for c, ok in ((x, ax), (y, ay)) if ok] + [np.ones_like(x)]
        A = np.column_stack(cols) * ww[:, None]
        sol, *_ = np.linalg.lstsq(A, z * ww, rcond=None)
        it = iter(sol)
        a = next(it) if ax else 0.0
        b = next(it) if ay else 0.0
        c = next(it)
        if abs(a) > max_slope or abs(b) > max_slope:
            a, b = np.clip(a, -max_slope, max_slope), np.clip(b, -max_slope, max_slope)
            c = np.average(z - a * x - b * y, weights=ww)
        coef = np.array([a, b, c])
        res = cells[:, 2] - (cells[:, 0] * a + cells[:, 1] * b + c)
        nxt = res < 0.15
        if nxt.sum() < 6 or (nxt == keep).all():
            break
        keep = nxt
    return coef


def sides(local, half, theirs, band=(0.3, 2.0), q=20, min_cells=3):
    """Mặt đường ở bốn phía (trước, sau, trái, phải): phân vị q của điểm thấp nhất mỗi ô trong dải
    band ngoài chân cuboid. Trung bình hai phía đối diện là mặt đường dưới tâm, kể cả trên dốc;
    lấy trung vị của các cặp có được, không có cặp nào thì trung vị các phía."""
    beyond = np.maximum(np.abs(local[:, 0]) - half[0], np.abs(local[:, 1]) - half[1])
    p = local[(beyond >= band[0]) & (beyond <= band[1]) & ~theirs]
    if len(p) < 10:
        return None
    ij = np.floor(p[:, :2] / CELL).astype(int)
    key = ij[:, 0] * 100003 + ij[:, 1]
    order = np.lexsort((p[:, 2], key))
    key, p = key[order], p[order]
    cells = p[np.r_[True, key[1:] != key[:-1]]]
    over_x = np.abs(cells[:, 0]) - half[0]
    over_y = np.abs(cells[:, 1]) - half[1]
    side = {}
    for name, m in (
        ("front", (cells[:, 0] > 0) & (over_x >= over_y)), ("back", (cells[:, 0] < 0) & (over_x >= over_y)),
        ("left", (cells[:, 1] > 0) & (over_y > over_x)), ("right", (cells[:, 1] < 0) & (over_y > over_x)),
    ):
        if m.sum() >= min_cells:
            side[name] = float(np.percentile(cells[m, 2], q))
    if not side:
        return None
    pairs = [(side[a] + side[b]) / 2 for a, b in (("front", "back"), ("left", "right")) if a in side and b in side]
    return float(np.median(pairs)) if pairs else float(np.median(list(side.values())))


def main():
    scene_dir = Path(sys.argv[1])
    scene = json.loads((scene_dir / "scene.json").read_text())
    rows = []
    for fi, frame in enumerate(scene["frames"]):
        points = load(scene_dir, frame)
        boxes = frame["boxes"]
        for box in boxes:
            if box["type"] not in TYPES or np.hypot(*box["center"][:2]) > 50:
                continue
            c, half = np.array(box["center"]), np.array(box["size"]) / 2
            near = points[np.abs(points[:, :2] - c[:2]).max(1) < np.hypot(*half[:2]) + REACH + 0.5]
            for shift in SHIFTS:
                b = dict(box, center=[c[0], c[1], c[2] + shift])
                local = to_box(near, b)
                theirs = np.zeros(len(near), bool)
                for other in boxes:
                    if other is box:
                        continue
                    oh = np.array(other["size"]) / 2 + OTHER_GROW_M
                    if np.hypot(*(np.array(other["center"][:2]) - c[:2])) > np.hypot(*half[:2]) + REACH + np.hypot(*oh[:2]):
                        continue
                    o = to_box(near, other)
                    theirs |= (np.abs(o[:, 0]) <= oh[0]) & (np.abs(o[:, 1]) <= oh[1]) & (np.abs(o[:, 2]) <= oh[2])
                row = {"frame": fi, "id": box["id"], "type": box["type"], "range": float(np.hypot(*c[:2])),
                       "shift": shift, "points": box.get("counted", box["points"])}
                r = ring_percentile(local, half, theirs)
                row["ring"] = None if r is None else round(float(r), 3)
                for band in ((0.3, 1.5), (0.3, 2.0)):
                    for q in (10, 25):
                        for mc in (3, 5):
                            g = sides(local, half, theirs, q=q, band=band, min_cells=mc)
                            row[f"s{band[1]}_{q}_{mc}"] = None if g is None else round(float(-half[2] - g), 3)
                for name, kw in (("plane", {}),):
                    coef = plane(local, half, theirs, **kw)
                    row[name] = None if coef is None else round(float(-half[2] - coef[2]), 3)
                    if name == "plane" and coef is not None:
                        row["slope"] = round(float(np.hypot(coef[0], coef[1])), 3)
                rows.append(row)
        print(f"\r{fi + 1}", end="", flush=True)
    Path(sys.argv[2]).write_text(json.dumps(rows))
    print()


if __name__ == "__main__":
    main()
