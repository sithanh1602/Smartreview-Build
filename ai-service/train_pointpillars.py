"""PointPillars 3D LiDAR Fine-tuning & Training Script for SmartReview.
Trains / fine-tunes PointPillars on the 3 CVAT/Waymo datasets:
  - dataset_01 (199 frames)
  - dataset_02 (198 frames)
  - dataset_03 (193 frames)
Located in outputs/dataset-0-cvat/scenes/
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path

# Add project root and ai-service to sys.path
ai_service_dir = Path(__file__).resolve().parent
project_root = ai_service_dir.parent
sys.path.insert(0, str(ai_service_dir))

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

from pointpillars.model import PointPillars
from pointpillars.loss import Loss
from pcd_utils import read_pcd_or_bin

CLASS_MAP = {
    'PEDESTRIAN': 0,
    'CYCLIST': 1,
    'VEHICLE': 2,
    'CAR': 2,
    'TRUCK': 2,
    'BUS': 2,
}

CLASS_NAMES = {
    0: 'Pedestrian',
    1: 'Cyclist',
    2: 'Car'
}

Z_SHIFT = 1.73
PC_RANGE = [0, -39.68, -3.0, 69.12, 39.68, 1.5]


class SmartReview3DDataset(Dataset):
    """Loads 3D LiDAR frames (.bin) and ground-truth 3D cuboids from scene.json."""

    def __init__(self, scene_dirs, augment=True, step=1, max_frames=None):
        self.samples = []
        self.augment = augment

        for s_dir in scene_dirs:
            s_path = Path(s_dir)
            scene_json = s_path / 'scene.json'
            if not scene_json.is_file():
                continue

            with open(scene_json, 'r', encoding='utf-8') as f:
                scene_data = json.load(f)

            frames = scene_data.get('frames', [])
            for idx, frame in enumerate(frames):
                if idx % step != 0:
                    continue
                bin_file = s_path / frame['file']
                if not bin_file.is_file():
                    continue

                raw_boxes = frame.get('boxes', [])
                valid_boxes = []
                for b in raw_boxes:
                    t = str(b.get('type', '')).upper()
                    cls_id = CLASS_MAP.get(t)
                    if cls_id is None:
                        continue
                    valid_boxes.append({
                        'center': b['center'],
                        'size': b['size'],
                        'heading': float(b.get('heading', 0.0)),
                        'class_id': cls_id
                    })

                self.samples.append({
                    'bin_path': str(bin_file),
                    'timestamp': frame.get('timestamp', idx),
                    'boxes': valid_boxes
                })

                if max_frames and len(self.samples) >= max_frames:
                    break

        print(f"[Dataset] Loaded {len(self.samples)} valid frames from {len(scene_dirs)} scenes.")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        item = self.samples[idx]
        pts = read_pcd_or_bin(item['bin_path'])
        if pts.size == 0:
            pts = np.zeros((10, 4), dtype=np.float32)

        pts = pts[np.isfinite(pts).all(axis=1)]
        pts = pts.copy()

        # Shift ground to match KITTI convention
        pts[:, 2] -= Z_SHIFT

        # Intensity normalization
        inten = pts[:, 3]
        if inten.max() > 1.5:
            scale = max(float(np.percentile(inten, 99)), 1e-6)
            pts[:, 3] = np.clip(inten / scale, 0.0, 1.0)

        boxes = item['boxes']

        # Random 4-quadrant rotation or random small jitter in augment mode
        rot_k = np.random.randint(0, 4) if self.augment else 0
        ang = rot_k * (np.pi / 2.0)
        c, s = np.cos(ang), np.sin(ang)

        # Rotate point cloud
        rot_pts = pts.copy()
        rot_pts[:, 0] = c * pts[:, 0] + s * pts[:, 1]
        rot_pts[:, 1] = -s * pts[:, 0] + c * pts[:, 1]

        # Filter points in range
        mask = (
            (rot_pts[:, 0] >= PC_RANGE[0]) & (rot_pts[:, 0] <= PC_RANGE[3]) &
            (rot_pts[:, 1] >= PC_RANGE[1]) & (rot_pts[:, 1] <= PC_RANGE[4]) &
            (rot_pts[:, 2] >= PC_RANGE[2]) & (rot_pts[:, 2] <= PC_RANGE[5])
        )
        filtered_pts = rot_pts[mask]
        if filtered_pts.shape[0] < 10:
            filtered_pts = rot_pts[:100]

        # Rotate & format ground-truth boxes: [x, y, z_bottom, dx, dy, dz, heading]
        gt_boxes = []
        gt_labels = []

        for b in boxes:
            cx, cy, cz = b['center']
            dx, dy, dz = b['size']
            h = b['heading']

            # Rotate box center
            rcx = c * cx + s * cy
            rcy = -s * cx + c * cy
            rh = (h - ang + np.pi) % (2 * np.pi) - np.pi

            # z_bottom in KITTI convention
            rbz = cz - (dz / 2.0) - Z_SHIFT

            # Filter boxes in range
            if (PC_RANGE[0] <= rcx <= PC_RANGE[3] and
                PC_RANGE[1] <= rcy <= PC_RANGE[4] and
                PC_RANGE[2] <= rbz <= PC_RANGE[5]):
                gt_boxes.append([rcx, rcy, rbz, dx, dy, dz, rh])
                gt_labels.append(b['class_id'])

        if not gt_boxes:
            gt_boxes_t = torch.zeros((0, 7), dtype=torch.float32)
            gt_labels_t = torch.zeros((0,), dtype=torch.long)
        else:
            gt_boxes_t = torch.tensor(gt_boxes, dtype=torch.float32)
            gt_labels_t = torch.tensor(gt_labels, dtype=torch.long)

        pts_t = torch.tensor(filtered_pts, dtype=torch.float32)

        return {
            'pts': pts_t,
            'gt_boxes': gt_boxes_t,
            'gt_labels': gt_labels_t,
            'timestamp': item['timestamp']
        }


def collate_fn(batch):
    return {
        'batched_pts': [item['pts'] for item in batch],
        'batched_gt_bboxes': [item['gt_boxes'] for item in batch],
        'batched_gt_labels': [item['gt_labels'] for item in batch],
        'timestamps': [item['timestamp'] for item in batch]
    }


def train_epoch(model, dataloader, optimizer, criterion, device, epoch, grad_accum=1):
    model.train()
    total_loss = 0.0
    total_cls = 0.0
    total_reg = 0.0
    total_dir = 0.0
    step_count = 0

    optimizer.zero_grad()

    t_start = time.time()
    for step, batch in enumerate(dataloader):
        batched_pts = [p.to(device) for p in batch['batched_pts']]
        batched_gt_bboxes = [b.to(device) for b in batch['batched_gt_bboxes']]
        batched_gt_labels = [l.to(device) for l in batch['batched_gt_labels']]

        # Skip frames that have zero ground truth boxes during training
        if all(len(b) == 0 for b in batched_gt_bboxes):
            continue

        try:
            bbox_cls_pred, bbox_pred, bbox_dir_cls_pred, anchor_target_dict = model(
                batched_pts=batched_pts,
                mode='train',
                batched_gt_bboxes=batched_gt_bboxes,
                batched_gt_labels=batched_gt_labels
            )

            # Reshape predictions to match anchor targets
            bbox_cls_pred = bbox_cls_pred.permute(0, 2, 3, 1).reshape(-1, 3)
            bbox_pred = bbox_pred.permute(0, 2, 3, 1).reshape(-1, 7)
            bbox_dir_cls_pred = bbox_dir_cls_pred.permute(0, 2, 3, 1).reshape(-1, 2)

            batched_labels = anchor_target_dict['batched_labels'].reshape(-1)
            batched_bbox_reg = anchor_target_dict['batched_bbox_reg'].reshape(-1, 7)
            batched_dir_labels = anchor_target_dict['batched_dir_labels'].reshape(-1)

            num_cls_pos = max(1, ((batched_labels >= 0) & (batched_labels < 3)).sum().item())

            loss_dict = criterion(
                bbox_cls_pred=bbox_cls_pred,
                bbox_pred=bbox_pred,
                bbox_dir_cls_pred=bbox_dir_cls_pred,
                batched_labels=batched_labels,
                num_cls_pos=num_cls_pos,
                batched_bbox_reg=batched_bbox_reg,
                batched_dir_labels=batched_dir_labels
            )

            loss = loss_dict['total_loss'] / grad_accum
            loss.backward()

            if (step + 1) % grad_accum == 0 or (step + 1) == len(dataloader):
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=10.0)
                optimizer.step()
                optimizer.zero_grad()

            total_loss += loss_dict['total_loss'].item()
            total_cls += loss_dict['cls_loss'].item()
            total_reg += loss_dict['reg_loss'].item()
            total_dir += loss_dict['dir_cls_loss'].item()
            step_count += 1

            if step_count % 10 == 0 or step == len(dataloader) - 1:
                elapsed = time.time() - t_start
                fps = step_count / max(1e-4, elapsed)
                print(
                    f"  [Epoch {epoch}] Step {step+1}/{len(dataloader)} | "
                    f"Loss: {total_loss/step_count:.4f} "
                    f"(cls: {total_cls/step_count:.3f}, reg: {total_reg/step_count:.3f}, dir: {total_dir/step_count:.3f}) | "
                    f"{fps:.1f} frames/s",
                    flush=True
                )

        except Exception as e:
            print(f"  [Warning] Error at step {step}: {e}", file=sys.stderr)
            continue

    avg_loss = total_loss / max(1, step_count)
    return avg_loss


def validate(model, dataloader, criterion, device):
    model.eval()
    total_loss = 0.0
    step_count = 0

    with torch.no_grad():
        for batch in dataloader:
            batched_pts = [p.to(device) for p in batch['batched_pts']]
            batched_gt_bboxes = [b.to(device) for b in batch['batched_gt_bboxes']]
            batched_gt_labels = [l.to(device) for l in batch['batched_gt_labels']]

            if all(len(b) == 0 for b in batched_gt_bboxes):
                continue

            try:
                bbox_cls_pred, bbox_pred, bbox_dir_cls_pred, anchor_target_dict = model(
                    batched_pts=batched_pts,
                    mode='train',
                    batched_gt_bboxes=batched_gt_bboxes,
                    batched_gt_labels=batched_gt_labels
                )

                bbox_cls_pred = bbox_cls_pred.permute(0, 2, 3, 1).reshape(-1, 3)
                bbox_pred = bbox_pred.permute(0, 2, 3, 1).reshape(-1, 7)
                bbox_dir_cls_pred = bbox_dir_cls_pred.permute(0, 2, 3, 1).reshape(-1, 2)

                batched_labels = anchor_target_dict['batched_labels'].reshape(-1)
                batched_bbox_reg = anchor_target_dict['batched_bbox_reg'].reshape(-1, 7)
                batched_dir_labels = anchor_target_dict['batched_dir_labels'].reshape(-1)

                num_cls_pos = max(1, ((batched_labels >= 0) & (batched_labels < 3)).sum().item())

                loss_dict = criterion(
                    bbox_cls_pred=bbox_cls_pred,
                    bbox_pred=bbox_pred,
                    bbox_dir_cls_pred=bbox_dir_cls_pred,
                    batched_labels=batched_labels,
                    num_cls_pos=num_cls_pos,
                    batched_bbox_reg=batched_bbox_reg,
                    batched_dir_labels=batched_dir_labels
                )
                total_loss += loss_dict['total_loss'].item()
                step_count += 1
            except Exception:
                continue

    return total_loss / max(1, step_count)


def main():
    parser = argparse.ArgumentParser(description="Fine-tune PointPillars on SmartReview CVAT Datasets")
    parser.add_argument('--epochs', type=int, default=5, help='Number of epochs to train')
    parser.add_argument('--lr', type=float, default=1e-4, help='Learning rate')
    parser.add_argument('--batch-size', type=int, default=1, help='Batch size per step')
    parser.add_argument('--step', type=int, default=1, help='Subsample frames (e.g. 2 = every 2nd frame)')
    parser.add_argument('--device', type=str, default='cuda' if torch.cuda.is_available() else 'cpu', help='cpu or cuda')
    parser.add_argument('--base-model', type=str, default=str(ai_service_dir / 'models' / 'pointpillars_waymo.pth'), help='Initial weights')
    parser.add_argument('--output-model', type=str, default=str(ai_service_dir / 'models' / 'pointpillars_waymo_latest.pth'), help='Output model path')
    parser.add_argument('--sync-gcp', action='store_true', help='Sync trained checkpoint to GCP server after training')
    args = parser.parse_args()

    scenes_root = project_root / 'outputs' / 'dataset-0-cvat' / 'scenes'
    train_dirs = [
        scenes_root / 'dataset_01',
        scenes_root / 'dataset_02',
    ]
    val_dirs = [
        scenes_root / 'dataset_03',
    ]

    print("=" * 60)
    print("🚀 SMARTRIVIEW POINTPILLARS 3D FINE-TUNING")
    print("=" * 60)
    print(f"Device: {args.device}")
    print(f"Epochs: {args.epochs} | Learning Rate: {args.lr}")
    print(f"Train scenes: {[d.name for d in train_dirs]}")
    print(f"Val scenes:   {[d.name for d in val_dirs]}")
    print(f"Base weights: {args.base_model}")
    print(f"Target save:  {args.output_model}")
    print("=" * 60)

    train_ds = SmartReview3DDataset(train_dirs, augment=True, step=args.step)
    val_ds = SmartReview3DDataset(val_dirs, augment=False, step=args.step * 2)

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, collate_fn=collate_fn, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, collate_fn=collate_fn, num_workers=0)

    device = torch.device(args.device)
    model = PointPillars(nclasses=3).to(device)

    # Load initial weights
    if os.path.isfile(args.base_model):
        print(f"Loading base checkpoint: {args.base_model}")
        ckpt = torch.load(args.base_model, map_location=device)
        model.load_state_dict(ckpt, strict=False)
        print("Checkpoint loaded successfully!")
    else:
        print(f"[Warning] Base model not found at {args.base_model}. Training from scratch initialization.")

    criterion = Loss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-3)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=args.lr * 0.1)

    best_val_loss = float('inf')
    out_path = Path(args.output_model)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print("\n🏁 Starting Training...")
    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        train_loss = train_epoch(model, train_loader, optimizer, criterion, device, epoch)
        val_loss = validate(model, val_loader, criterion, device)
        scheduler.step()

        elapsed = time.time() - t0
        print(f"👉 Epoch {epoch}/{args.epochs} | Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f} | Time: {elapsed:.1f}s")

        # Save latest
        torch.save(model.state_dict(), str(out_path))

        # Save best
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_path = out_path.parent / "pointpillars_waymo_best.pth"
            torch.save(model.state_dict(), str(best_path))
            print(f"  ⭐ New best model saved to {best_path} (Val Loss: {val_loss:.4f})")

    # Overwrite main model if improved
    main_model_path = ai_service_dir / 'models' / 'pointpillars_waymo.pth'
    torch.save(model.state_dict(), str(main_model_path))
    print(f"\n✅ Training complete! Model saved to:\n  - {out_path}\n  - {main_model_path}")

    # Copy to .venv/models/pointpillars_waymo.pth as well
    venv_model = project_root / '.venv' / 'models' / 'pointpillars_waymo.pth'
    if venv_model.parent.is_dir():
        torch.save(model.state_dict(), str(venv_model))
        print(f"  - {venv_model}")

    if args.sync_gcp:
        print("\n☁️ Syncing new checkpoint to GCP VM...")
        cmd = f"scp {main_model_path} accessnameit@34.143.208.131:/opt/smartreview/ai-service/models/pointpillars_waymo.pth"
        ret = os.system(cmd)
        if ret == 0:
            print("🎉 Checkpoint synced successfully to GCP VM (/opt/smartreview/ai-service/models/pointpillars_waymo.pth)!")
        else:
            print("[Warning] Failed to sync to GCP VM. Please run scp manually.")


if __name__ == '__main__':
    main()
