#!/usr/bin/env python3
"""Chuyển một segment Waymo Open Dataset v2 (parquet) thành dữ liệu cho viewer 3D.

Server gọi script này khi import một project 3D (server/projects3d/service.ts). Khuôn dạng đầu
ra là hợp đồng với viewer: sửa ở đây thì phải sửa bên đọc.

Đầu vào (mỗi component một thư mục con chứa file .parquet):
  lidar              range image của 5 lidar
  lidar_calibration  vị trí/hướng gắn của từng lidar trên xe + góc nghiêng các tia
  lidar_pose         pose của xe tại từng pixel của lidar TOP (bù chuyển động khi lidar quay)
  vehicle_pose       pose của xe trong hệ toạ độ toàn cục tại từng frame
  lidar_box          cuboid 3D đã gán nhãn
  camera_image       (tuỳ chọn) ảnh JPEG của từng camera ở từng frame

Đầu ra:
  <out>/scene.json            lidar, pose từng frame, cuboid từng frame; mỗi cuboid có "counted":
                              số điểm của point cloud đã xuất nằm trong cuboid đó
  <out>/frames/<ts>.bin       float32 [x, y, z, intensity] * N  (hệ toạ độ xe, đã bù chuyển động)
                              int16   [dx, dy, dz] * N          (mm, điểm chưa bù = điểm đã bù + d)
  <out>/cameras/<CAMERA>/<ts>.jpg   ảnh camera, ghi nguyên byte JPEG có trong parquet

Ví dụ:
  python export_waymo.py ../waymo-test -o out
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq

LASER_NAMES = {1: "TOP", 2: "FRONT", 3: "SIDE_LEFT", 4: "SIDE_RIGHT", 5: "REAR"}
BOX_TYPES = {0: "UNKNOWN", 1: "VEHICLE", 2: "PEDESTRIAN", 3: "SIGN", 4: "CYCLIST"}
CAMERA_NAMES = {1: "FRONT", 2: "FRONT_LEFT", 3: "FRONT_RIGHT", 4: "SIDE_LEFT", 5: "SIDE_RIGHT"}

SEGMENT = "key.segment_context_name"
TIMESTAMP = "key.frame_timestamp_micros"
LASER = "key.laser_name"


def component_files(root: Path, component: str) -> list[Path]:
    files = sorted((root / component).glob("*.parquet"))
    if not files:
        raise SystemExit(f"Không tìm thấy file parquet trong {root / component}")
    return files


def read_rows(root: Path, component: str, segment: str | None = None) -> list[dict]:
    """Đọc một component nhỏ thành list các dict (không dùng cho lidar / lidar_pose)."""
    rows = []
    for path in component_files(root, component):
        rows += pq.read_table(path).to_pylist()
    return [r for r in rows if segment is None or r[SEGMENT] == segment]


def rotation_from_rpy(roll, pitch, yaw):
    """Ma trận quay Rz(yaw) @ Ry(pitch) @ Rx(roll), shape [..., 3, 3]."""
    cr, sr = np.cos(roll), np.sin(roll)
    cp, sp = np.cos(pitch), np.sin(pitch)
    cy, sy = np.cos(yaw), np.sin(yaw)
    return np.stack([
        np.stack([cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr], -1),
        np.stack([sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr], -1),
        np.stack([-sp, cp * sr, cp * cr], -1),
    ], -2)


def range_image_to_points(range_image, extrinsic, inclination, pixel_pose=None, frame_pose=None):
    """Range image [H, W, C] -> (xyz đã bù chuyển động, xyz chưa bù, intensity), hệ toạ độ xe.

    Kênh 0 là khoảng cách, kênh 1 là cường độ; pixel có range <= 0 bị loại.
    Chỉ lidar TOP có pixel_pose, các lidar còn lại hai bộ xyz giống nhau.
    """
    height, width = range_image.shape[:2]
    if isinstance(inclination, tuple):
        lo, hi = inclination
        inclination = (np.arange(height) + 0.5) / height * (hi - lo) + lo
    inclination = inclination[::-1]  # hàng 0 của range image là tia cao nhất

    az_correction = np.arctan2(extrinsic[1, 0], extrinsic[0, 0])
    ratios = (np.arange(width, 0, -1) - 0.5) / width
    azimuth = (ratios * 2.0 - 1.0) * np.pi - az_correction

    rng = range_image[..., 0].astype(np.float64)
    cos_incl = np.cos(inclination)[:, None]
    sin_incl = np.sin(inclination)[:, None]
    xyz = np.stack([
        rng * np.cos(azimuth)[None, :] * cos_incl,
        rng * np.sin(azimuth)[None, :] * cos_incl,
        rng * sin_incl,
    ], -1)

    mask = rng > 0
    raw = xyz[mask] @ extrinsic[:3, :3].T + extrinsic[:3, 3]

    corrected = raw
    if pixel_pose is not None and frame_pose is not None:
        pose = pixel_pose[mask]
        rotation = rotation_from_rpy(pose[:, 0], pose[:, 1], pose[:, 2])
        world = np.einsum("nij,nj->ni", rotation, raw) + pose[:, 3:]
        corrected = (world - frame_pose[:3, 3]) @ frame_pose[:3, :3]

    return corrected, raw, range_image[..., 1][mask]


def load_calibrations(root: Path, segment: str) -> dict:
    """{laser: (extrinsic 4x4, beam inclinations hoặc (min, max))}"""
    prefix = "[LiDARCalibrationComponent]."
    calibrations = {}
    for row in read_rows(root, "lidar_calibration", segment):
        extrinsic = np.array(row[prefix + "extrinsic.transform"], dtype=np.float64).reshape(4, 4)
        values = row[prefix + "beam_inclination.values"]
        if values is None:
            inclination = (row[prefix + "beam_inclination.min"], row[prefix + "beam_inclination.max"])
        else:
            inclination = np.array(values, dtype=np.float64)
        calibrations[row[LASER]] = (extrinsic, inclination)
    return calibrations


class PixelPoses:
    """Pose từng pixel [H, W, 6] = roll, pitch, yaw, x, y, z, tra theo (timestamp, laser)."""

    def __init__(self, root: Path, segment: str):
        self.rows = {}
        if not (root / "lidar_pose").is_dir():
            return
        prefix = "[LiDARPoseComponent].range_image_return1."
        for path in component_files(root, "lidar_pose"):
            table = pq.read_table(path, columns=[SEGMENT, TIMESTAMP, LASER, prefix + "values", prefix + "shape"])
            values = table.column(prefix + "values").combine_chunks()
            keys = zip(*(table.column(c).to_pylist() for c in (SEGMENT, TIMESTAMP, LASER, prefix + "shape")))
            for i, (seg, timestamp, laser, shape) in enumerate(keys):
                if seg == segment:
                    self.rows[(timestamp, laser)] = (values, i, shape)

    def get(self, timestamp, laser):
        if (timestamp, laser) not in self.rows:
            return None
        values, i, shape = self.rows[(timestamp, laser)]
        return values[i].values.to_numpy().astype(np.float64).reshape(shape)


def export_cameras(root: Path, output: Path, segment: str, timestamps: set) -> int:
    """Ghi ảnh của các frame đã xuất ra <output>/cameras/<CAMERA>/<timestamp>.jpg.

    Ảnh trong parquet đã là JPEG nên chỉ chép byte, không giải mã hay nén lại.
    """
    prefix = "[CameraImageComponent]."
    columns = [SEGMENT, TIMESTAMP, "key.camera_name", prefix + "image"]
    written = 0
    for path in component_files(root, "camera_image"):
        for batch in pq.ParquetFile(path).iter_batches(batch_size=8, columns=columns):
            rows = batch.to_pydict()
            for seg, timestamp, camera, image in zip(*(rows[c] for c in columns)):
                if seg != segment or timestamp not in timestamps or not image:
                    continue
                folder = output / "cameras" / CAMERA_NAMES.get(camera, f"CAMERA_{camera}")
                folder.mkdir(parents=True, exist_ok=True)
                (folder / f"{timestamp}.jpg").write_bytes(image)
                written += 1
                print(f"\r{written} image", end="", flush=True)
    if written:
        print()
    return written


def count_points(points, frame_boxes):
    """Ghi vào từng cuboid số điểm nằm trong nó ("counted"). points: [N, 3], hệ toạ độ xe.

    Đếm ở đây vì point cloud đang có sẵn trong bộ nhớ: phần chấm rủi ro về sau chỉ đọc
    scene.json, không phải tải lại file .bin nào.
    """
    order = np.argsort(points[:, 0])
    points = points[order]
    xs = points[:, 0]
    for box in frame_boxes:
        center, half = np.array(box["center"]), np.array(box["size"]) / 2
        # Chỉ xét các điểm trong dải x mà cuboid có thể chạm tới.
        reach = float(np.hypot(half[0], half[1]))
        near = points[np.searchsorted(xs, center[0] - reach):np.searchsorted(xs, center[0] + reach, "right")]
        cos, sin = np.cos(box["heading"]), np.sin(box["heading"])
        dx, dy = near[:, 0] - center[0], near[:, 1] - center[1]
        inside = (
            (np.abs(dx * cos + dy * sin) <= half[0])
            & (np.abs(dy * cos - dx * sin) <= half[1])
            & (np.abs(near[:, 2] - center[2]) <= half[2])
        )
        box["counted"] = int(inside.sum())


def rounded(values, digits=4):
    return [round(float(v), digits) for v in values]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("root", type=Path, help="thư mục chứa lidar/, lidar_box/, ...")
    parser.add_argument("-o", "--output", type=Path, required=True)
    parser.add_argument("--segment", help="tên segment (mặc định: segment đầu tiên tìm thấy)")
    parser.add_argument("--frames", type=int, default=0, help="số frame cần xuất (0 = tất cả)")
    args = parser.parse_args()

    vehicle_rows = read_rows(args.root, "vehicle_pose")
    segment = args.segment or vehicle_rows[0][SEGMENT]
    frame_poses = {
        r[TIMESTAMP]: np.array(r["[VehiclePoseComponent].world_from_vehicle.transform"]).reshape(4, 4)
        for r in vehicle_rows if r[SEGMENT] == segment
    }
    if not frame_poses:
        raise SystemExit(f"Không có segment {segment} trong vehicle_pose")
    calibrations = load_calibrations(args.root, segment)
    pixel_poses = PixelPoses(args.root, segment)
    lasers = sorted(calibrations)

    boxes = {}
    prefix = "[LiDARBoxComponent]."
    for r in read_rows(args.root, "lidar_box", segment):
        boxes.setdefault(r[TIMESTAMP], []).append({
            "id": r["key.laser_object_id"],
            "type": BOX_TYPES[r[prefix + "type"]],
            "center": rounded(r[prefix + f"box.center.{a}"] for a in "xyz"),
            "size": rounded(r[prefix + f"box.size.{a}"] for a in "xyz"),
            "heading": round(r[prefix + "box.heading"], 5),
            "points": r[prefix + "num_lidar_points_in_box"],
        })

    frames_dir = args.output / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    laser_counts = {}

    def flush(timestamp, clouds):
        counts, corrected, raw, intensity = [], [], [], []
        for laser in lasers:
            c, r, i = clouds.get(laser, (np.zeros((0, 3)), np.zeros((0, 3)), np.zeros(0)))
            counts.append(len(c)); corrected.append(c); raw.append(r); intensity.append(i)
        corrected, raw = np.concatenate(corrected), np.concatenate(raw)
        count_points(corrected, boxes.get(timestamp, []))
        xyzi = np.column_stack([corrected, np.concatenate(intensity)]).astype("<f4")
        delta = np.clip(np.round((raw - corrected) * 1000), -32767, 32767).astype("<i2")
        with open(frames_dir / f"{timestamp}.bin", "wb") as f:
            f.write(xyzi.tobytes())
            f.write(delta.tobytes())
        laser_counts[timestamp] = counts
        print(f"\r{len(laser_counts)} frame", end="", flush=True)

    # File lidar lớn nên đọc từng batch nhỏ; các dòng của cùng một frame nằm liền nhau.
    prefix = "[LiDARComponent].range_image_return1."
    columns = [SEGMENT, TIMESTAMP, LASER, prefix + "values", prefix + "shape"]
    current, clouds = None, {}

    def export_lidar():
        nonlocal current, clouds
        for path in component_files(args.root, "lidar"):
            for batch in pq.ParquetFile(path).iter_batches(batch_size=5, columns=columns):
                keys = batch.select([SEGMENT, TIMESTAMP, LASER, prefix + "shape"]).to_pydict()
                for i in range(batch.num_rows):
                    timestamp, laser = keys[TIMESTAMP][i], keys[LASER][i]
                    if keys[SEGMENT][i] != segment or timestamp not in frame_poses:
                        continue
                    if timestamp != current:
                        if clouds:
                            flush(current, clouds)
                            if args.frames and len(laser_counts) >= args.frames:
                                clouds = {}
                                return
                        if timestamp in laser_counts:
                            raise SystemExit(f"Các dòng của frame {timestamp} không nằm liền nhau")
                        current, clouds = timestamp, {}
                    values = batch.column(prefix + "values")[i].values.to_numpy()
                    extrinsic, inclination = calibrations[laser]
                    clouds[laser] = range_image_to_points(
                        values.reshape(keys[prefix + "shape"][i]), extrinsic, inclination,
                        pixel_poses.get(timestamp, laser), frame_poses[timestamp],
                    )

    export_lidar()
    if clouds:
        flush(current, clouds)
    print()

    timestamps = sorted(laser_counts)
    images = 0
    if (args.root / "camera_image").is_dir():
        images = export_cameras(args.root, args.output, segment, set(timestamps))
    # Toạ độ toàn cục rất lớn nên trừ đi vị trí xe ở frame đầu để giữ độ chính xác float32.
    origin = frame_poses[timestamps[0]][:3, 3].copy()
    frames = []
    for timestamp in timestamps:
        pose = frame_poses[timestamp].copy()
        pose[:3, 3] -= origin
        frames.append({
            "timestamp": timestamp,
            "file": f"frames/{timestamp}.bin",
            "pose": rounded(pose.ravel(), 6),
            "laserCounts": laser_counts[timestamp],
            "boxes": boxes.get(timestamp, []),
        })
    scene = {
        "segment": segment,
        "origin": rounded(origin, 3),
        "lasers": [
            {"id": laser, "name": LASER_NAMES[laser], "extrinsic": rounded(calibrations[laser][0].ravel(), 6)}
            for laser in lasers
        ],
        "frames": frames,
    }
    (args.output / "scene.json").write_text(json.dumps(scene, separators=(",", ":")))
    print(f"Đã ghi {len(frames)} frame, {sum(len(f['boxes']) for f in frames)} cuboid, {images} ảnh camera vào {args.output}")


if __name__ == "__main__":
    main()
