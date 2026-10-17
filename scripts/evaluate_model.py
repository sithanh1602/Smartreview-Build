"""Comprehensive evaluation script comparing Pretrained KITTI vs Fine-tuned Waymo PointPillars model.
Evaluates on the 40 hold-out validation frames with Ground Truth 3D bounding boxes.
Calculates Precision, Recall, F1, 3D/BEV IoU, Center Error, and Size Error.
"""
import os
import sys
import json
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
import torch
from pointpillars.model import PointPillars
from pcd_utils import read_pcd_or_bin

CLASSES = {
    'PEDESTRIAN': 0,
    'CYCLIST': 1,
    'VEHICLE': 2,
    'CAR': 2
}
CLASS_NAMES = {0: 'Pedestrian', 1: 'Cyclist', 2: 'Vehicle'}
Z_SHIFT = float(os.environ.get("SMARTREVIEW_PP_Z_SHIFT", "1.73"))

def box_bev_iou(box1, box2):
    """Calculates 2D BEV IoU between two oriented/axis-aligned 3D boxes."""
    # box: [cx, cy, cz, dx, dy, dz, heading]
    x1_min = box1[0] - box1[3] / 2
    x1_max = box1[0] + box1[3] / 2
    y1_min = box1[1] - box1[4] / 2
    y1_max = box1[1] + box1[4] / 2

    x2_min = box2[0] - box2[3] / 2
    x2_max = box2[0] + box2[3] / 2
    y2_min = box2[1] - box2[4] / 2
    y2_max = box2[1] + box2[4] / 2

    inter_x = max(0.0, min(x1_max, x2_max) - max(x1_min, x2_min))
    inter_y = max(0.0, min(y1_max, y2_max) - max(y1_min, y2_min))
    inter_area = inter_x * inter_y

    area1 = box1[3] * box1[4]
    area2 = box2[3] * box2[4]
    union_area = area1 + area2 - inter_area
    if union_area <= 0:
        return 0.0
    return inter_area / union_area

def evaluate_checkpoint(model_path, val_samples, device, min_score=0.15, iou_thresh=0.35):
    print(f"\nEvaluating: {model_path.name}...")
    model = PointPillars(nclasses=3).to(device)
    state = torch.load(str(model_path), map_location=device)
    model.load_state_dict(state)
    model.eval()

    total_gt = 0
    total_det = 0
    total_tp = 0
    total_fp = 0
    matched_ious = []
    center_errors = []
    heading_errors = []

    per_class_stats = {c: {"gt": 0, "tp": 0, "det": 0} for c in [0, 1, 2]}

    t0 = time.time()
    with torch.no_grad():
        for s_idx, sample in enumerate(val_samples):
            bin_path = sample["bin_file"]
            raw_pts = read_pcd_or_bin(bin_path)
            raw_pts[:, 2] -= Z_SHIFT
            inten = raw_pts[:, 3]
            if inten.max() > 1.5:
                scale = max(float(np.percentile(inten, 99)), 1e-6)
                raw_pts[:, 3] = np.clip(inten / scale, 0.0, 1.0)

            # Filter points to front sector
            mask = (
                (raw_pts[:, 0] >= 0) & (raw_pts[:, 0] <= 70.4) &
                (raw_pts[:, 1] >= -40) & (raw_pts[:, 1] <= 40) &
                (raw_pts[:, 2] >= -3.0) & (raw_pts[:, 2] <= 1.5)
            )
            pts = raw_pts[mask]
            if len(pts) < 10:
                continue

            # Ground truth in range
            gt_boxes = []
            gt_labels = []
            for b in sample["boxes"]:
                b_type = b.get("type", "").upper()
                if b_type not in CLASSES:
                    continue
                cx, cy, cz = b["center"]
                dx, dy, dz = b["size"]
                h = b["heading"]
                cz -= Z_SHIFT
                if 0.0 <= cx <= 70.4 and -40.0 <= cy <= 40.0 and -3.0 <= cz <= 2.0:
                    gt_boxes.append([cx, cy, cz, dx, dy, dz, h])
                    cls_id = CLASSES[b_type]
                    gt_labels.append(cls_id)
                    per_class_stats[cls_id]["gt"] += 1
                    total_gt += 1

            pts_tensor = torch.from_numpy(pts).float().to(device)
            res = model([pts_tensor], mode="test")[0]
            pred_boxes = res.get("lidar_bboxes", [])
            pred_labels = res.get("labels", [])
            pred_scores = res.get("scores", [])

            # Filter predictions by confidence
            valid_preds = []
            for i in range(len(pred_boxes)):
                if pred_scores[i] >= min_score:
                    valid_preds.append((pred_boxes[i], pred_labels[i], pred_scores[i]))
                    cls_id = int(pred_labels[i])
                    if cls_id in per_class_stats:
                        per_class_stats[cls_id]["det"] += 1
                    total_det += 1

            # Match predictions with GT
            gt_matched = [False] * len(gt_boxes)
            for p_box, p_lbl, p_score in valid_preds:
                best_iou = 0.0
                best_gt_idx = -1
                for g_idx, (g_box, g_lbl) in enumerate(zip(gt_boxes, gt_labels)):
                    if gt_matched[g_idx]:
                        continue
                    if p_lbl != g_lbl:
                        continue
                    iou = box_bev_iou(p_box, g_box)
                    if iou > best_iou:
                        best_iou = iou
                        best_gt_idx = g_idx

                if best_iou >= iou_thresh and best_gt_idx >= 0:
                    gt_matched[best_gt_idx] = True
                    total_tp += 1
                    cls_id = int(p_lbl)
                    if cls_id in per_class_stats:
                        per_class_stats[cls_id]["tp"] += 1
                    matched_ious.append(best_iou)

                    # Center & heading errors
                    c_err = np.linalg.norm(np.array(p_box[:3]) - np.array(gt_boxes[best_gt_idx][:3]))
                    center_errors.append(c_err)
                    h_err = abs(float(p_box[6]) - float(gt_boxes[best_gt_idx][6]))
                    h_err = min(h_err, 2 * np.pi - h_err)
                    heading_errors.append(np.degrees(h_err))
                else:
                    total_fp += 1

    eval_time = time.time() - t0
    prec = total_tp / max(1, total_det)
    rec = total_tp / max(1, total_gt)
    f1 = 2 * prec * rec / max(1e-6, prec + rec)
    mean_iou = np.mean(matched_ious) if matched_ious else 0.0
    mean_c_err = np.mean(center_errors) if center_errors else 0.0
    mean_h_err = np.mean(heading_errors) if heading_errors else 0.0

    return {
        "model": model_path.name,
        "total_gt": total_gt,
        "total_det": total_det,
        "total_tp": total_tp,
        "total_fp": total_fp,
        "precision": prec,
        "recall": rec,
        "f1": f1,
        "mean_iou": mean_iou,
        "mean_c_err": mean_c_err,
        "mean_h_err": mean_h_err,
        "eval_time": eval_time,
        "per_class": per_class_stats
    }

def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"=== Running Comprehensive 3D Evaluation on {device} ===")

    # Load 40 validation frames
    scenes = [
        str(PROJECT_ROOT / "outputs/waymo_train/test1"),
        str(PROJECT_ROOT / "outputs/waymo_train/test2")
    ]
    all_frames = []
    for s_dir in scenes:
        scene_json = Path(s_dir) / "scene.json"
        if scene_json.is_file():
            with open(scene_json, "r") as f:
                d = json.load(f)
            for fr in d.get("frames", []):
                bf = Path(s_dir) / fr["file"]
                if bf.is_file():
                    all_frames.append({"bin_file": str(bf), "boxes": fr.get("boxes", [])})

    import random
    rng = random.Random(42)
    rng.shuffle(all_frames)
    val_frames = all_frames[:40]
    print(f"Evaluation benchmark: 40 validation frames with ground truth.")

    kitti_model = PROJECT_ROOT / ".venv/models/pointpillars_kitti.pth"
    waymo_model = PROJECT_ROOT / ".venv/models/pointpillars_waymo.pth"

    res_kitti = evaluate_checkpoint(kitti_model, val_frames, device, min_score=0.15)
    res_waymo = evaluate_checkpoint(waymo_model, val_frames, device, min_score=0.15)

    print("\n" + "=" * 70)
    print(f"{'METRIC':<25} | {'PRETRAINED KITTI':<20} | {'FINE-TUNED WAYMO':<20}")
    print("-" * 70)
    print(f"{'Total GT Boxes':<25} | {res_kitti['total_gt']:<20} | {res_waymo['total_gt']:<20}")
    print(f"{'Total Detections':<25} | {res_kitti['total_det']:<20} | {res_waymo['total_det']:<20}")
    print(f"{'True Positives (TP)':<25} | {res_kitti['total_tp']:<20} | {res_waymo['total_tp']:<20}")
    print(f"{'False Positives (FP)':<25} | {res_kitti['total_fp']:<20} | {res_waymo['total_fp']:<20}")
    print(f"{'Precision':<25} | {res_kitti['precision']*100:.2f}%{'':<14} | {res_waymo['precision']*100:.2f}%{'':<14}")
    print(f"{'Recall':<25} | {res_kitti['recall']*100:.2f}%{'':<14} | {res_waymo['recall']*100:.2f}%{'':<14}")
    print(f"{'F1-Score':<25} | {res_kitti['f1']*100:.2f}%{'':<14} | {res_waymo['f1']*100:.2f}%{'':<14}")
    print(f"{'Mean BEV IoU':<25} | {res_kitti['mean_iou']*100:.2f}%{'':<14} | {res_waymo['mean_iou']*100:.2f}%{'':<14}")
    print(f"{'Mean Center Error':<25} | {res_kitti['mean_c_err']:.3f} m{'':<13} | {res_waymo['mean_c_err']:.3f} m{'':<13}")
    print(f"{'Mean Heading Error':<25} | {res_kitti['mean_h_err']:.2f} deg{'':<12} | {res_waymo['mean_h_err']:.2f} deg{'':<12}")
    print("=" * 70)

    # Class details
    print("\n--- PER-CLASS DETAILS (FINE-TUNED MODEL) ---")
    for cid in [2, 0, 1]:
        cname = CLASS_NAMES[cid]
        gt = res_waymo["per_class"][cid]["gt"]
        tp = res_waymo["per_class"][cid]["tp"]
        det = res_waymo["per_class"][cid]["det"]
        c_p = tp / max(1, det) * 100
        c_r = tp / max(1, gt) * 100
        print(f"[{cname:<10}] GT: {gt:<4} | TP: {tp:<4} | Det: {det:<4} | Precision: {c_p:.1f}% | Recall: {c_r:.1f}%")

if __name__ == "__main__":
    main()
