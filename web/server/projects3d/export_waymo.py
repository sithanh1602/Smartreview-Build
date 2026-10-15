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
                              số điểm của point cloud đã xuất nằm trong cuboid đó, và độ khít
                              "outside", "slack", "moved", "lift" (xem count_points);
                              frame có đối tượng vắng mặt giữa hai lần có mặt thêm "ghosts":
                              cuboid nội suy ở đó, đo như cuboid thật (xem ghost_boxes)
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


# Độ khít của cuboid (docs/risk-3d.md, "Độ khít"). Chỉ xét điểm trong chiều cao của cuboid và
# cao hơn dải GROUND_M trên mặt đường (hay trên đáy cuboid, chỗ nào cao hơn); điểm nằm trong một
# cuboid khác (nới OTHER_GROW_M) là của vật khác. Vành quanh cuboid rộng RING_M theo hai phương ngang. Phép dò
# đặt cuboid lệch đi tới SEARCH_M theo từng bước SEARCH_STEP_M. Khoảng trống chỉ đo khi có từ
# SLACK_MIN_POINTS điểm.
RING_M = 0.5
GROUND_M = 0.3
OTHER_GROW_M = 0.2
SEARCH_M = 1.0
SEARCH_STEP_M = 0.25
SLACK_MIN_POINTS = 10
# Mặt đường quanh cuboid là một mặt phẳng, để trên dốc và sát mép đường vẫn đo đúng (xem
# ground_plane): điểm thấp nhất của mỗi ô GROUND_CELL_M trong chân cuboid nới GROUND_REACH_M,
# không thuộc cuboid khác; cần từ GROUND_MIN_POINTS điểm và GROUND_MIN_CELLS ô.
GROUND_REACH_M = 2.5
GROUND_CELL_M = 0.5
GROUND_MIN_POINTS = 20
GROUND_MIN_CELLS = 6
# Khởi đầu từ các ô thấp: ô cao hơn phân vị GROUND_START_PERCENTILE quá GROUND_START_M là thân xe,
# bụi cây, tường. Sau mỗi lần khớp bỏ ô cao hơn mặt phẳng quá GROUND_KEEP_M. Độ dốc tối đa
# GROUND_MAX_SLOPE theo mỗi phương.
GROUND_START_PERCENTILE = 25
GROUND_START_M = 0.3
GROUND_KEEP_M = 0.15
GROUND_MAX_SLOPE = 0.15
# Mặt đường nhựa phẳng: các ô giữ lại lệch khỏi mặt phẳng trung bình (có trọng số) không quá
# GROUND_MAX_RMS_M. Gồ ghề hơn là bụi cây, cỏ hay thân vật, không thấy mặt đường: không dùng.
GROUND_MAX_RMS_M = 0.08
# Mặt đường có bậc (vỉa hè): bậc được chọn theo các ô trong GROUND_STEP_NEAR_M ngoài chân cuboid.
GROUND_STEP_NEAR_M = 1.5
# Một bậc cần được ủng hộ ít nhất GROUND_STEP_SUPPORT lần bậc được ủng hộ nhiều nhất.
GROUND_STEP_SUPPORT = 0.25
GROUND_STEP_CONTACT_M = 0.3
_steps = np.arange(-SEARCH_M, SEARCH_M + 1e-9, SEARCH_STEP_M)
# Các vị trí dò, gần trước xa sau: khi hai vị trí ôm được số điểm bằng nhau thì lấy vị trí gần.
SEARCH_OFFSETS = sorted(((u, v) for u in _steps for v in _steps), key=lambda o: (np.hypot(*o), o))
SEARCH_OFFSETS = np.array(SEARCH_OFFSETS)


def to_box(points, box):
    """Điểm [N, 3] trong hệ toạ độ của cuboid: x theo hướng cuboid, y ngang, z đứng, gốc ở tâm."""
    cos, sin = np.cos(box["heading"]), np.sin(box["heading"])
    d = points - np.array(box["center"])
    return np.stack([d[:, 0] * cos + d[:, 1] * sin, d[:, 1] * cos - d[:, 0] * sin, d[:, 2]], -1)


def _fit_plane(cells, weight, keep, half, two_sided):
    """Khớp mặt phẳng có trọng số vào các ô keep, rồi bỏ dần ô xa mặt phẳng (chỉ ô cao hơn, hay cả
    hai phía khi two_sided). Trả (a, b, c, rms) hoặc None."""
    result = None
    for _ in range(4):
        if keep.sum() < GROUND_MIN_CELLS:
            return result
        x, y, z, w = cells[keep, 0], cells[keep, 1], cells[keep, 2], weight[keep]
        along = x.min() < -half[0] / 2 and x.max() > half[0] / 2
        across = y.min() < -half[1] / 2 and y.max() > half[1] / 2
        columns = [c for c, seen in ((x, along), (y, across)) if seen] + [np.ones_like(x)]
        solution = list(np.linalg.lstsq(np.column_stack(columns) * w[:, None], z * w, rcond=None)[0])
        a = solution.pop(0) if along else 0.0
        b = solution.pop(0) if across else 0.0
        c = solution.pop(0)
        if max(abs(a), abs(b)) > GROUND_MAX_SLOPE:
            a, b = np.clip([a, b], -GROUND_MAX_SLOPE, GROUND_MAX_SLOPE)
            c = np.average(z - a * x - b * y, weights=w)
        rms = float(np.sqrt(np.average((z - (x * a + y * b + c)) ** 2, weights=w)))
        result = (float(a), float(b), float(c), rms)
        residual = cells[:, 2] - (cells[:, 0] * a + cells[:, 1] * b + c)
        nearer = (np.abs(residual) if two_sided else residual) < GROUND_KEEP_M
        if nearer.sum() < GROUND_MIN_CELLS or (nearer == keep).all():
            break
        keep = nearer
    return result


def ground_plane(local, half):
    """Mặt đường quanh một cuboid: (a, b, c) với z = a x + b y + c trong hệ toạ độ của cuboid, hoặc
    None khi quanh đó quá ít điểm hay không thấy mặt đường (GROUND_MAX_RMS_M). local: điểm [N, 3]
    trong hệ của cuboid, đã bỏ điểm của cuboid khác.

    Lấy điểm thấp nhất của mỗi ô, vì trong một ô có mặt đường thì không gì thấp hơn nó. Mặt phẳng
    chứ không phải một độ cao: trên dốc, phía dốc xuống thấp hơn tâm cuboid, phía dốc lên cao hơn.
    Ô gần chân cuboid nặng hơn ô xa. Độ dốc theo một phương chỉ đo khi có ô ở cả hai phía của
    cuboid theo phương đó; vật che mất một phía thì mặt đường coi như phẳng theo phương ấy.

    Sát mép đường, mặt đường và vỉa hè là hai bậc, không một mặt phẳng nào khớp cả hai. Khi đó tìm
    các bậc trong các ô sát chân cuboid (trong GROUND_STEP_NEAR_M) và chọn bậc vật đứng trên: bậc
    cao nhất không cao hơn điểm thấp nhất của vật (bánh xe, bàn chân) quá GROUND_KEEP_M, vì mặt
    đất dưới vật không thể cao hơn chính vật. Chỉ chọn khi điểm ấy chạm bậc (thấp hơn bậc cộng
    GROUND_STEP_CONTACT_M): ở xa chỉ thấy phần trên của vật thì không biết nó đứng trên bậc nào.
    Rồi khớp lại mặt phẳng chỉ trên bậc ấy.
    """
    if len(local) < GROUND_MIN_POINTS:
        return None
    cell = np.floor(local[:, :2] / GROUND_CELL_M).astype(np.int64)
    key = cell[:, 0] * 1_000_003 + cell[:, 1]
    order = np.lexsort((local[:, 2], key))
    key, sorted_points = key[order], local[order]
    cells = sorted_points[np.r_[True, key[1:] != key[:-1]]]
    if len(cells) < GROUND_MIN_CELLS:
        return None
    beyond = np.maximum(np.abs(cells[:, 0]) - half[0], np.abs(cells[:, 1]) - half[1])
    weight = 1.0 / (0.5 + np.maximum(beyond, 0))
    low = cells[:, 2] < np.percentile(cells[:, 2], GROUND_START_PERCENTILE) + GROUND_START_M
    fit = _fit_plane(cells, weight, low, half, two_sided=False)
    if fit is not None and fit[3] <= GROUND_MAX_RMS_M:
        return fit[:3]
    # Mặt đường có bậc: chân cuboid không tính (ở đó thường là thân vật che mất mặt đất).
    beside = (beyond >= 0) & (beyond <= GROUND_STEP_NEAR_M)
    if beside.sum() < GROUND_MIN_CELLS:
        return None
    inside = (np.abs(local[:, 0]) <= half[0]) & (np.abs(local[:, 1]) <= half[1])
    if inside.sum() < GROUND_MIN_CELLS:
        return None
    lowest = np.sort(local[inside, 2])[2]
    z, w = cells[beside, 2], weight[beside]
    support = ((np.abs(z[:, None] - z[None, :]) <= GROUND_KEEP_M) * w[None, :]).sum(1)
    # Các bậc: lần lượt ô được ủng hộ nhiều nhất, bỏ ô cùng bậc với một bậc đã có.
    levels = []
    for at in np.argsort(-support):
        if support[at] < GROUND_STEP_SUPPORT * support.max():
            break
        if all(abs(z[at] - level) > GROUND_KEEP_M for level in levels):
            levels.append(z[at])
    under = [level for level in levels if level <= lowest + GROUND_KEEP_M]
    if not under:
        return None
    level = max(under)
    if lowest > level + GROUND_STEP_CONTACT_M:
        return None
    fit = _fit_plane(cells, weight, np.abs(cells[:, 2] - level) <= GROUND_KEEP_M, half, two_sided=True)
    if fit is not None and fit[3] <= GROUND_MAX_RMS_M:
        return fit[:3]
    return None


def count_points(points, frame_boxes, targets=None):
    """Ghi vào từng cuboid số điểm và độ khít của nó. points: [N, 3], hệ toạ độ xe.

    targets: các cuboid cần đo (mặc định mọi cuboid của frame); cuboid của frame vẫn là "vật khác"
    khi đo chúng, như khi đo cuboid nội suy ở chỗ đối tượng vắng mặt (ghosts).

    counted  số điểm nằm trong cuboid
    outside  số điểm của vật nằm trong vành RING_M ngay ngoài cuboid
    slack    [dọc, ngang] m: khoảng trống giữa mép cuboid và điểm xa nhất của vật, đo ở mặt quay
             về phía xe (mặt mà lidar nhìn thấy); không có khi cuboid có ít điểm
    moved    [dọc, ngang, số điểm tại chỗ, số điểm ở chỗ tốt nhất]: dời cuboid (giữ hướng, cỡ) tới
             đâu trong ±SEARCH_M thì ôm được nhiều điểm của vật nhất; dọc/ngang tính theo cuboid
    lift     m: đáy cuboid cao hơn mặt đường dưới tâm nó bao nhiêu (âm là chìm xuống đường), theo
             ground_plane; không có khi quanh cuboid quá ít điểm

    "Điểm của vật" là điểm trong chiều cao cuboid, cao hơn mặt đường (hay đáy cuboid, chỗ nào cao
    hơn) quá GROUND_M, không thuộc cuboid khác. So với mặt đường chứ không chỉ với đáy, nên vỉa hè,
    dốc lên hay mặt đường phủ lên một cuboid bị hạ thấp không bị tính là vật.
    Đếm ở đây vì point cloud đang có sẵn trong bộ nhớ: phần chấm rủi ro về sau chỉ đọc
    scene.json, không phải tải lại file .bin nào.
    """
    order = np.argsort(points[:, 0])
    points = points[order]
    xs = points[:, 0]
    sensor_at = np.zeros((1, 3))
    for box in frame_boxes if targets is None else targets:
        center, half = np.array(box["center"]), np.array(box["size"]) / 2
        # Chỉ xét các điểm trong ô vuông mà cuboid, vành và phép dò có thể chạm tới.
        reach = float(np.hypot(half[0], half[1])) + max(RING_M, SEARCH_M, GROUND_REACH_M)
        near = points[np.searchsorted(xs, center[0] - reach):np.searchsorted(xs, center[0] + reach, "right")]
        near = near[np.abs(near[:, 1] - center[1]) <= reach]
        local = to_box(near, box)
        tall = np.abs(local[:, 2]) <= half[2]
        within = (np.abs(local[:, 0]) <= half[0]) & (np.abs(local[:, 1]) <= half[1])
        box["counted"] = int((tall & within).sum())

        theirs = np.zeros(len(near), bool)
        for other in frame_boxes:
            if other is box:
                continue
            o_half = np.array(other["size"]) / 2 + OTHER_GROW_M
            if np.hypot(*(np.array(other["center"][:2]) - center[:2])) > reach + np.hypot(o_half[0], o_half[1]):
                continue
            o = to_box(near, other)
            theirs |= (np.abs(o[:, 0]) <= o_half[0]) & (np.abs(o[:, 1]) <= o_half[1]) & (np.abs(o[:, 2]) <= o_half[2])
        bottom = -half[2]
        beyond = np.maximum(np.abs(local[:, 0]) - half[0], np.abs(local[:, 1]) - half[1])
        ground = ground_plane(local[(beyond <= GROUND_REACH_M) & ~theirs], half)
        floor = bottom
        if ground is not None:
            floor = np.maximum(bottom, local[:, 0] * ground[0] + local[:, 1] * ground[1] + ground[2])
            box["lift"] = round(bottom - ground[2], 3)
        body = tall & (local[:, 2] >= floor + GROUND_M) & (within | ~theirs)
        ring = body & ~within & (np.abs(local[:, 0]) <= half[0] + RING_M) & (np.abs(local[:, 1]) <= half[1] + RING_M)
        box["outside"] = int(ring.sum())

        held = local[body & within]
        if len(held) >= SLACK_MIN_POINTS:
            # Xe ở gốc toạ độ; trong hệ của cuboid nó ở -center đã quay.
            sensor = to_box(sensor_at, box)[0]
            box["slack"] = rounded([
                half[axis] - (held[:, axis].max() if sensor[axis] > 0 else -held[:, axis].min())
                for axis in (0, 1)
            ], 3)

        mine = local[body]
        if len(mine):
            counts = (
                (np.abs(mine[None, :, 0] - SEARCH_OFFSETS[:, None, 0]) <= half[0])
                & (np.abs(mine[None, :, 1] - SEARCH_OFFSETS[:, None, 1]) <= half[1])
            ).sum(1)
            best = int(np.argmax(counts))
            if counts[best]:
                box["moved"] = [*rounded(SEARCH_OFFSETS[best], 2), int(counts[0]), int(counts[best])]


# Đối tượng vắng mặt từ 1 tới GHOST_MAX_FRAMES frame giữa hai lần có mặt được nội suy một cuboid
# ở mỗi frame vắng (khớp với gaps.max_frames của policy3d/_scene.json).
GHOST_MAX_FRAMES = 5


def ghost_boxes(order, boxes, poses):
    """{timestamp: [cuboid nội suy]} cho chỗ đối tượng vắng mặt giữa hai lần có mặt.

    Nội suy trong hệ toạ độ cố định (bằng pose của xe) rồi đổi về hệ toạ độ xe của frame vắng:
    tâm và hướng tuyến tính giữa hai frame có mặt, kích thước của frame trước.
    """
    seen = {}
    for index, timestamp in enumerate(order):
        for box in boxes.get(timestamp, []):
            seen.setdefault(box["id"], []).append((index, box))
    ghosts = {}
    for object_id, track in seen.items():
        for (a, before), (b, after) in zip(track, track[1:]):
            if not 1 < b - a <= GHOST_MAX_FRAMES + 1:
                continue
            pa, pb = poses[order[a]], poses[order[b]]
            wa = pa[:3, :3] @ before["center"] + pa[:3, 3]
            wb = pb[:3, :3] @ after["center"] + pb[:3, 3]
            ya = np.arctan2(pa[1, 0], pa[0, 0]) + before["heading"]
            yb = np.arctan2(pb[1, 0], pb[0, 0]) + after["heading"]
            turn = (yb - ya + np.pi) % (2 * np.pi) - np.pi
            for k in range(a + 1, b):
                t = (k - a) / (b - a)
                pk = poses[order[k]]
                local = pk[:3, :3].T @ (wa + (wb - wa) * t - pk[:3, 3])
                heading = ya + turn * t - np.arctan2(pk[1, 0], pk[0, 0])
                ghosts.setdefault(order[k], []).append({
                    "id": object_id,
                    "type": before["type"],
                    "center": rounded(local),
                    "size": before["size"],
                    "heading": round(float((heading + np.pi) % (2 * np.pi) - np.pi), 5),
                })
    return ghosts


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

    # Cuboid nội suy ở chỗ đối tượng vắng mặt, để đếm xem ở đó còn điểm của vật không.
    ghosts = ghost_boxes(sorted(frame_poses), boxes, frame_poses)
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
        if timestamp in ghosts:
            count_points(corrected, boxes.get(timestamp, []), ghosts[timestamp])
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
            **({"ghosts": ghosts[timestamp]} if timestamp in ghosts else {}),
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
