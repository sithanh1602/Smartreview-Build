"""PointPillars 3D LiDAR inference runner for CVAT frames.
Takes a manifest JSON path with list of frame point cloud files (.pcd / .bin) and outputs 3D cuboid predictions.
"""
import sys
import os
import json
from pathlib import Path

root_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(root_dir))

import numpy as np
import torch
try:
    from pointpillars.model import PointPillars
    from pcd_utils import read_pcd_or_bin
except ImportError:
    model_pkg_dir = root_dir / "pointpillars_model"
    sys.path.insert(0, str(model_pkg_dir))
    from pointpillars.model import PointPillars
    from pcd_utils import read_pcd_or_bin

Z_SHIFT = float(os.environ.get("SMARTREVIEW_PP_Z_SHIFT", "1.73"))
MIN_CONF = float(os.environ.get("SMARTREVIEW_PP_MIN_CONF", "0.35"))

CLASSES = {
    0: 'Pedestrian',
    1: 'Cyclist',
    2: 'Car'
}

def main():
    if len(sys.argv) < 4:
        print("Usage: pointpillars_runner.py <manifest.json> <model.pth> <output.json>", file=sys.stderr)
        sys.exit(1)

    manifest_path = Path(sys.argv[1])
    model_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    if not model_path.is_file():
        raise RuntimeError(f"Model checkpoint not found: {model_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    frames = manifest.get("frames", [])

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = PointPillars(nclasses=len(CLASSES)).to(device)
    state_dict = torch.load(str(model_path), map_location=device)
    model.load_state_dict(state_dict)
    model.eval()

    predictions = []

    for idx, item in enumerate(frames):
        print(f"[PROGRESS] {idx + 1}/{len(frames)}", file=sys.stderr, flush=True)
        frame_id = item["id"]
        frame_index = item.get("index", 0)
        pc_path = item["path"]

        if not Path(pc_path).is_file():
            continue

        try:
            pts = read_pcd_or_bin(pc_path)
            if pts.size == 0:
                continue
            pts = pts[np.isfinite(pts).all(axis=1)]
            if pts.shape[0] < 10:
                continue

            # KITTI expects the sensor ~1.73 m above ground (ground at z~-1.73) and intensity in 0..1.
            # CVAT/Waymo clouds are in the vehicle frame (ground at z~0) with raw intensity.
            pts = pts.copy()
            pts[:, 2] -= Z_SHIFT
            inten = pts[:, 3]
            if inten.max() > 1.5:
                scale = max(float(np.percentile(inten, 99)), 1e-6)
                pts[:, 3] = np.clip(inten / scale, 0.0, 1.0)

            frame_dets = []
            # The model only looks forward (x 0..70, y -40..40): rotate the cloud 4x to cover 360 deg.
            for k in range(4):
                ang = k * np.pi / 2
                c, s = np.cos(ang), np.sin(ang)
                rot = pts.copy()
                rot[:, 0] = c * pts[:, 0] + s * pts[:, 1]
                rot[:, 1] = -s * pts[:, 0] + c * pts[:, 1]
                mask = (
                    (rot[:, 0] >= 0) & (rot[:, 0] <= 70.4) &
                    (rot[:, 1] >= -40) & (rot[:, 1] <= 40) &
                    (rot[:, 2] >= -3.0) & (rot[:, 2] <= 1.5)
                )
                filtered_pts = rot[mask]
                if filtered_pts.shape[0] < 10:
                    continue
                pts_tensor = torch.from_numpy(filtered_pts).to(device)
                with torch.no_grad():
                    res = model(batched_pts=[pts_tensor], mode='test')[0]
                lidar_bboxes = res.get('lidar_bboxes', [])
                labels = res.get('labels', [])
                scores = res.get('scores', [])
                for i in range(len(lidar_bboxes)):
                    conf = float(scores[i])
                    if conf < MIN_CONF:
                        continue
                    box = lidar_bboxes[i]
                    bx, by, bz = float(box[0]), float(box[1]), float(box[2])
                    # rotate back into the original frame
                    cx = c * bx - s * by
                    cy = s * bx + c * by
                    frame_dets.append({
                        "label": CLASSES.get(int(labels[i]), f"class_{int(labels[i])}"),
                        "conf": conf,
                        "c": (cx, cy, bz + Z_SHIFT),
                        "d": (float(box[3]), float(box[4]), float(box[5])),
                        "h": float(box[6]) + ang,
                    })

            # De-duplicate detections of the same object seen from overlapping sectors.
            frame_dets.sort(key=lambda d: -d["conf"])
            kept = []
            for d in frame_dets:
                if any(np.hypot(d["c"][0] - o["c"][0], d["c"][1] - o["c"][1]) < 1.5 for o in kept):
                    continue
                kept.append(d)

            for d in kept:
                cx, cy, cz = d["c"]
                dx, dy, dz = d["d"]
                predictions.append({
                    "frame_id": frame_id,
                    "frame_index": frame_index,
                    "label": d["label"],
                    "confidence": round(d["conf"], 4),
                    "cuboid": {
                        "center": [round(cx, 3), round(cy, 3), round(cz + dz / 2, 3)],
                        "size": [round(dx, 3), round(dy, 3), round(dz, 3)],
                        "heading": round(float((d["h"] + np.pi) % (2 * np.pi) - np.pi), 4)
                    }
                })

        except Exception as e:
            print(f"Error processing frame {frame_index} ({pc_path}): {e}", file=sys.stderr)

    output_path.write_text(json.dumps({
        "predictions": predictions,
        "labels": list(CLASSES.values()),
        "model": "PointPillars"
    }, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
