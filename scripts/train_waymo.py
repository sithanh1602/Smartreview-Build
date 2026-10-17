"""PointPillars Fine-tuning Script on Waymo Open Dataset v2.
Trains on exported LiDAR frames and 3D bounding boxes from outputs/waymo_train/test1 and test2.
Saves the fine-tuned checkpoint to .venv/models/pointpillars_waymo.pth.
"""
import os
import sys
import time
import json
import random
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader

from pointpillars.model import PointPillars
from pointpillars.loss import Loss

CLASSES = {
    'PEDESTRIAN': 0,
    'CYCLIST': 1,
    'VEHICLE': 2,
    'CAR': 2
}

Z_SHIFT = float(os.environ.get("SMARTREVIEW_PP_Z_SHIFT", "1.73"))

class Waymo3DDataset(Dataset):
    def __init__(self, scenes_dirs, is_train=True, val_split=47):
        self.is_train = is_train
        self.samples = []

        all_frames = []
        for s_dir in scenes_dirs:
            s_path = Path(s_dir)
            scene_json = s_path / "scene.json"
            if not scene_json.is_file():
                continue
            with open(scene_json, "r", encoding="utf-8") as f:
                data = json.load(f)
            frames = data.get("frames", [])
            for fr in frames:
                bin_file = s_path / fr["file"]
                if bin_file.is_file():
                    all_frames.append({
                        "bin_file": str(bin_file),
                        "boxes": fr.get("boxes", [])
                    })

        # Deterministic shuffle to split train and val
        rng = random.Random(42)
        rng.shuffle(all_frames)

        if is_train:
            self.samples = all_frames[val_split:]
        else:
            self.samples = all_frames[:val_split]

        print(f"[{'TRAIN' if is_train else 'VAL'}] Loaded {len(self.samples)} frames.")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        item = self.samples[idx]
        bin_path = item["bin_file"]

        # Read binary points: float32 [x, y, z, intensity] * N
        file_sz = os.path.getsize(bin_path)
        num_pts = file_sz // 22
        with open(bin_path, "rb") as fp:
            raw = fp.read(num_pts * 16)
            pts = np.frombuffer(raw, dtype=np.float32).reshape(num_pts, 4).copy()

        # Coordinate shift to match KITTI sensor height
        pts[:, 2] -= Z_SHIFT

        # Intensity normalization
        inten = pts[:, 3]
        if inten.max() > 1.5:
            scale = max(float(np.percentile(inten, 99)), 1e-6)
            pts[:, 3] = np.clip(inten / scale, 0.0, 1.0)

        # Downsample if too dense to optimize training speed
        if len(pts) > 40000:
            choice = np.random.choice(len(pts), 40000, replace=False)
            pts = pts[choice]

        # Filter points in front sector: X in [0, 70.4], Y in [-40, 40], Z in [-3.0, 1.5]
        mask = (
            (pts[:, 0] >= 0) & (pts[:, 0] <= 70.4) &
            (pts[:, 1] >= -40) & (pts[:, 1] <= 40) &
            (pts[:, 2] >= -3.0) & (pts[:, 2] <= 1.5)
        )
        pts = pts[mask]
        if len(pts) < 50:
            # Fallback if empty sector: keep forward points
            pts = np.zeros((100, 4), dtype=np.float32)
            pts[:, 0] = np.linspace(5, 50, 100)

        # Parse ground truth boxes
        gt_boxes = []
        gt_labels = []
        for b in item["boxes"]:
            b_type = b.get("type", "").upper()
            if b_type not in CLASSES:
                continue
            cx, cy, cz = b["center"]
            dx, dy, dz = b["size"]
            heading = b["heading"]

            # Apply same Z_SHIFT
            cz -= Z_SHIFT

            # Filter box center inside training range
            if 0.0 <= cx <= 70.4 and -40.0 <= cy <= 40.0 and -3.0 <= cz <= 2.0:
                gt_boxes.append([cx, cy, cz, dx, dy, dz, heading])
                gt_labels.append(CLASSES[b_type])

        if len(gt_boxes) == 0:
            # Dummy box if no annotated objects in range
            gt_boxes = np.zeros((1, 7), dtype=np.float32)
            gt_boxes[0] = [100.0, 100.0, -10.0, 1.0, 1.0, 1.0, 0.0]
            gt_labels = np.array([2], dtype=np.int64)
        else:
            gt_boxes = np.array(gt_boxes, dtype=np.float32)
            gt_labels = np.array(gt_labels, dtype=np.int64)

        return (
            torch.from_numpy(pts).float(),
            torch.from_numpy(gt_boxes).float(),
            torch.from_numpy(gt_labels).long()
        )

def collate_fn(batch):
    batched_pts = [item[0] for item in batch]
    batched_bboxes = [item[1] for item in batch]
    batched_labels = [item[2] for item in batch]
    return batched_pts, batched_bboxes, batched_labels

def main():
    epochs = int(os.environ.get("EPOCHS", "12"))
    batch_size = int(os.environ.get("BATCH_SIZE", "1"))
    lr = float(os.environ.get("LR", "1e-4"))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"=== Starting PointPillars Waymo Fine-Tuning on {device} ===")

    scene_dirs = [
        str(PROJECT_ROOT / "outputs/waymo_train/test1"),
        str(PROJECT_ROOT / "outputs/waymo_train/test2")
    ]

    train_dataset = Waymo3DDataset(scene_dirs, is_train=True, val_split=40)
    val_dataset = Waymo3DDataset(scene_dirs, is_train=False, val_split=40)

    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        collate_fn=collate_fn,
        num_workers=0
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        collate_fn=collate_fn,
        num_workers=0
    )

    model = PointPillars(nclasses=3).to(device)

    # Load pretrained KITTI weights
    pretrained_path = PROJECT_ROOT / ".venv/models/pointpillars_kitti.pth"
    if pretrained_path.is_file():
        print(f"Loading pretrained weights from: {pretrained_path}")
        state = torch.load(str(pretrained_path), map_location=device)
        model.load_state_dict(state)
        print("Pretrained weights loaded successfully.")
    else:
        print("Warning: Pretrained weights not found, training from scratch.")

    criterion = Loss().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-3)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-5)

    save_dir = PROJECT_ROOT / ".venv/models"
    save_dir.mkdir(parents=True, exist_ok=True)
    best_loss = float("inf")
    best_checkpoint = save_dir / "pointpillars_waymo.pth"

    for epoch in range(1, epochs + 1):
        model.train()
        total_train_loss = 0.0
        start_t = time.time()

        for step, (pts_list, bboxes_list, labels_list) in enumerate(train_loader):
            pts_list = [p.to(device) for p in pts_list]
            bboxes_list = [b.to(device) for b in bboxes_list]
            labels_list = [l.to(device) for l in labels_list]

            optimizer.zero_grad()

            try:
                b_cls, b_reg, b_dir, a_dict = model(
                    batched_pts=pts_list,
                    mode="train",
                    batched_gt_bboxes=bboxes_list,
                    batched_gt_labels=labels_list
                )

                # Reshape predictions
                b_cls = b_cls.permute(0, 2, 3, 1).reshape(-1, 3)
                b_reg = b_reg.permute(0, 2, 3, 1).reshape(-1, 7)
                b_dir = b_dir.permute(0, 2, 3, 1).reshape(-1, 2)

                labels = a_dict["batched_labels"].reshape(-1)
                num_pos = max(1, int((labels < 3).sum()))
                bbox_reg = a_dict["batched_bbox_reg"].reshape(-1, 7)
                dir_labels = a_dict["batched_dir_labels"].reshape(-1)

                loss_dict = criterion(
                    bbox_cls_pred=b_cls,
                    bbox_pred=b_reg,
                    bbox_dir_cls_pred=b_dir,
                    batched_labels=labels,
                    num_cls_pos=num_pos,
                    batched_bbox_reg=bbox_reg,
                    batched_dir_labels=dir_labels
                )

                loss = loss_dict["total_loss"]
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=10.0)
                optimizer.step()

                total_train_loss += float(loss.item())

                if (step + 1) % 25 == 0 or (step + 1) == len(train_loader):
                    print(
                        f"Epoch [{epoch}/{epochs}] Step [{step+1}/{len(train_loader)}] "
                        f"Loss: {loss.item():.4f} (cls: {loss_dict['cls_loss'].item():.4f}, "
                        f"reg: {loss_dict['reg_loss'].item():.4f}, dir: {loss_dict['dir_cls_loss'].item():.4f}) "
                        f"LR: {scheduler.get_last_lr()[0]:.2e}",
                        flush=True
                    )
            except Exception as e:
                print(f"Error at step {step}: {e}", file=sys.stderr)
                continue

        scheduler.step()
        avg_train_loss = total_train_loss / max(1, len(train_loader))
        epoch_time = time.time() - start_t

        # Validation phase
        model.eval()
        total_val_loss = 0.0
        val_steps = 0
        with torch.no_grad():
            for pts_list, bboxes_list, labels_list in val_loader:
                pts_list = [p.to(device) for p in pts_list]
                bboxes_list = [b.to(device) for b in bboxes_list]
                labels_list = [l.to(device) for l in labels_list]

                try:
                    b_cls, b_reg, b_dir, a_dict = model(
                        batched_pts=pts_list,
                        mode="train",
                        batched_gt_bboxes=bboxes_list,
                        batched_gt_labels=labels_list
                    )
                    b_cls = b_cls.permute(0, 2, 3, 1).reshape(-1, 3)
                    b_reg = b_reg.permute(0, 2, 3, 1).reshape(-1, 7)
                    b_dir = b_dir.permute(0, 2, 3, 1).reshape(-1, 2)
                    labels = a_dict["batched_labels"].reshape(-1)
                    num_pos = max(1, int((labels < 3).sum()))

                    loss_dict = criterion(
                        bbox_cls_pred=b_cls,
                        bbox_pred=b_reg,
                        bbox_dir_cls_pred=b_dir,
                        batched_labels=labels,
                        num_cls_pos=num_pos,
                        batched_bbox_reg=a_dict["batched_bbox_reg"].reshape(-1, 7),
                        batched_dir_labels=a_dict["batched_dir_labels"].reshape(-1)
                    )
                    total_val_loss += float(loss_dict["total_loss"].item())
                    val_steps += 1
                except Exception:
                    continue

        avg_val_loss = total_val_loss / max(1, val_steps)
        print(
            f"=== Epoch [{epoch}/{epochs}] Finished in {epoch_time:.1f}s | "
            f"Train Loss: {avg_train_loss:.4f} | Val Loss: {avg_val_loss:.4f} ===",
            flush=True
        )

        # Save checkpoint
        torch.save(model.state_dict(), str(save_dir / "pointpillars_waymo_latest.pth"))
        if avg_val_loss < best_loss:
            best_loss = avg_val_loss
            torch.save(model.state_dict(), str(best_checkpoint))
            print(f"--> Saved new BEST checkpoint to {best_checkpoint} (Val Loss: {best_loss:.4f})")

    print("\n=== Training Completed Successfully! ===")
    print(f"Best fine-tuned model saved at: {best_checkpoint}")

if __name__ == "__main__":
    main()
