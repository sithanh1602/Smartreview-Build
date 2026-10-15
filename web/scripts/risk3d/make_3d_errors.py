#!/usr/bin/env python3
"""Cài lỗi vào nhãn của một bản Waymo v2 (thư mục component/*.parquet) để thử Risk Engine 3D.

Chỉ sửa lidar_box; các component khác được chép nguyên. Mỗi lỗi ghi rõ quy tắc nào phải bắt.
Đầu ra là một thư mục cùng bố cục với đầu vào, kèm file zip để import, và LOI-DA-CAI.md.

Ví dụ:
  ../.venv/bin/python -I scripts/risk3d/make_3d_errors.py \
      /path/waymo-test-10frames /path/waymo-3d-loi        (từ web/)
"""
import json
import math
import shutil
import sys
import zipfile
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

P = "[LiDARBoxComponent]."
TYPES = {"VEHICLE": 1, "PEDESTRIAN": 2, "SIGN": 3, "CYCLIST": 4}

# (object id, frames: None = mọi frame, lỗi, tham số, quy tắc phải bắt, mô tả)
ERRORS = [
    ("-KpKb_7UDmsdQCf8FS3g9w", None, "shift", {"along": 0, "across": 1.0}, "fit.empty_side",
     "Xe con (5 m, ~23 m) lệch ngang 1 m về phía xe suốt cả 10 frame"),
    ("L5o3al44f2H4cCGURYZ4Qw", range(2, 9), "shift", {"along": 0, "across": 1.0}, "fit.moved / fit.points_outside",
     "Xe tải (9,6 m, ~39 m) lệch ngang 1 m từ frame 2 tới 8"),
    ("uN2BSAs7hwfJeynQNtth_A", None, "shift", {"along": 0, "across": 0.5}, "fit.moved",
     "Biển báo (~11 m) lệch 0,5 m theo bề ngang suốt cả 10 frame"),
    ("SmRKTuq2kJtqR8OuvDkW0A", None, "scale", {"by": 0.8}, "không bắt (giới hạn)",
     "Xe tải (9,8 m, ~30 m) thu nhỏ còn 0,8 lần suốt cả 10 frame. Xe dài nên vẫn ôm 81–86% điểm"),
    ("3EJCiJ8U4g4vbOqIcPAXMw", [5], "shift", {"along": 1.5, "across": 0}, "track.position_jump",
     "Xe con nhảy 1,5 m về phía trước ở riêng frame 5"),
    ("RsJCVCUrLSrSYdpP2fE-pg", [4], "type", {"to": "PEDESTRIAN"}, "track.type_change (+ box.size_out_of_range)",
     "Xe con bị gán PEDESTRIAN ở riêng frame 4"),
    ("aHxc7DYBHJ6IcuCgGNEKaA", [6], "turn", {"rad": math.pi}, "track.heading_jump",
     "Xe con (~53 m) quay ngược đầu ở riêng frame 6"),
    ("83EloKWTYclrRJDFVF20bw", [3], "scale", {"by": 1.3}, "track.size_change",
     "Xe (7,2 m) phóng to 1,3 lần ở riêng frame 3"),
    ("wIlEAS6steze2jmDHtNb4w", None, "lower", {"by": 0.6}, "fit.sunk",
     "Xe dài 11,8 m (~34 m) bị hạ 0,6 m, chìm xuống đường suốt cả 10 frame"),
    ("h9_g1VTPhRIu8IlhlsQY1A", [5], "delete", {}, "gaps (không phải case)",
     "Biển báo sát xe bị xoá cuboid ở frame 5"),
    ("GHOST-cuboid-khong-co-vat", [4], "ghost", {"center": [-8.0, 0.0, 0.8], "size": [4.5, 1.9, 1.6], "heading": 0.0},
     "points.empty_near + track.single_frame",
     "Cuboid VEHICLE gán thừa trên mặt đường trống ngay sau xe (~8 m), chỉ ở frame 4"),
]


def main():
    source, out = Path(sys.argv[1]), Path(sys.argv[2])
    name = source.name + "-loi"
    target = out / name
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)
    box_file = next((target / "lidar_box").glob("*.parquet"))
    table = pq.read_table(box_file)
    rows = table.to_pylist()
    timestamps = sorted({r["key.frame_timestamp_micros"] for r in rows})
    known = {r["key.laser_object_id"] for r in rows}
    done = []
    for oid, frames, kind, args, rule, text in ERRORS:
        wanted = {timestamps[i] for i in (frames if frames is not None else range(len(timestamps)))}
        if kind == "ghost":
            template = next(r for r in rows if r["key.frame_timestamp_micros"] in wanted)
            for ts in sorted(wanted):
                ghost = dict(template)
                ghost.update({
                    "key.frame_timestamp_micros": ts,
                    "key.laser_object_id": oid,
                    P + "type": TYPES["VEHICLE"],
                    P + "num_lidar_points_in_box": 0,
                    P + "num_top_lidar_points_in_box": 0,
                })
                for axis, value in zip("xyz", args["center"]):
                    ghost[P + f"box.center.{axis}"] = value
                for axis, value in zip("xyz", args["size"]):
                    ghost[P + f"box.size.{axis}"] = value
                ghost[P + "box.heading"] = args["heading"]
                if "index" in ghost:
                    ghost["index"] = f"{ghost['key.segment_context_name']};{ts};{oid}"
                rows.append(ghost)
            done.append((oid, frames, rule, text))
            continue
        if oid not in known:
            raise SystemExit(f"Không có đối tượng {oid}")
        keep = []
        for r in rows:
            if r["key.laser_object_id"] != oid or r["key.frame_timestamp_micros"] not in wanted:
                keep.append(r)
                continue
            if kind == "delete":
                continue
            h = r[P + "box.heading"]
            if kind == "shift":
                dx = args["along"] * math.cos(h) - args["across"] * math.sin(h)
                dy = args["along"] * math.sin(h) + args["across"] * math.cos(h)
                r[P + "box.center.x"] += dx
                r[P + "box.center.y"] += dy
            elif kind == "lower":
                r[P + "box.center.z"] -= args["by"]
            elif kind == "scale":
                for axis in "xyz":
                    r[P + f"box.size.{axis}"] *= args["by"]
            elif kind == "turn":
                r[P + "box.heading"] = (h + args["rad"] + math.pi) % (2 * math.pi) - math.pi
            elif kind == "type":
                r[P + "type"] = TYPES[args["to"]]
            keep.append(r)
        rows = keep
        done.append((oid, frames, rule, text))
    pq.write_table(pa.Table.from_pylist(rows, schema=table.schema), box_file)

    lines = [
        f"# Lỗi đã cài vào {name}",
        "",
        f"Nguồn: `{source.name}` (nhãn Waymo gốc, coi là đúng). Chỉ `lidar_box` bị sửa. "
        "Frame đánh số từ 0 như trong viewer. Dòng \"không bắt\" là lỗi thật mà engine hiện chưa thấy, "
        "để lại để biết giới hạn.",
        "",
        "| # | Đối tượng | Frame | Lỗi | Quy tắc phải bắt |",
        "| - | --------- | ----- | --- | ---------------- |",
    ]
    for i, (oid, frames, rule, text) in enumerate(done, 1):
        span = "0–9" if frames is None else (f"{frames[0]}" if len(frames) == 1 else f"{frames[0]}–{frames[-1]}")
        lines.append(f"| {i} | `{oid[:8]}` | {span} | {text} | `{rule}` |")
    (out / "LOI-DA-CAI.md").write_text("\n".join(lines) + "\n")
    (out / "errors.json").write_text(json.dumps(
        [{"object_id": o, "frames": list(f) if f is not None else None, "rule": r, "text": t} for o, f, r, t in done],
        ensure_ascii=False, indent=1))

    archive = out / f"{name}.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_STORED) as z:
        for path in sorted(target.rglob("*")):
            if path.is_file():
                z.write(path, path.relative_to(out))
    print(f"Đã cài {len(done)} lỗi, {len(rows)} cuboid -> {archive}")


if __name__ == "__main__":
    main()
