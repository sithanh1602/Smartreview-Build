# CVAT panel 3D

POST /api/cvat/scan tự phân luồng theo job.dimension. 2D giữ luồng hiện có; 3D gọi mapper3d → đo PCD → core/risk3d/engine.ts. Không chạy YOLO ảnh cho point cloud. Kết quả lưu bảng cvat_scans hiện có, có dimension, policy_version, capability và skipped trong result JSON, không cần migration mới.

## Sử dụng
Save annotation CVAT → mở panel SmartReview qua proxy :8081 → Scan QA. Kết quả có frame, server object ID, label, rule, reason và evidence. Click vào ca risk sẽ tự động chuyển frame, di chuyển camera 3D (perspective + top/side/front views) đến vị trí cuboid lỗi và chớp sáng cảnh báo đỏ (nhấp nháy Three.js cuboid wireframe/mesh và viền đỏ trong Objects sidebar) giống như 2D.

## Điều kiện
- Point cloud và cuboid cùng hệ tọa độ, mét, Z hướng lên (gói Waymo đã chuyển đổi đáp ứng).
- Layout CVAT cuboid points: center XYZ, rotation XYZ radian, dimensions XYZ. Core yaw-only nên bỏ qua cuboid có roll/pitch thay vì chấm sai.
- Chỉ chấm shape hoặc keyframe track đã lưu; không đoán geometry nội suy CVAT. Không gộp các shape độc lập thành cùng track.
- PCD binary hoặc ASCII, XYZ float hữu hạn; Python numpy + pyarrow trong SMARTREVIEW_AI_PYTHON hoặc .venv/bin/python.
- Tối đa 30 frame có cuboid được đo LiDAR/lượt. Những frame còn lại chỉ kiểm tra geometry và có thông báo bỏ qua. Thư mục tạm riêng mỗi scan, tự dọn.
- Không có pose ego trong CVAT: chấm từng frame độc lập, bỏ rule temporal, frame-1 và rule fit theo chuỗi. Không dùng identity pose để giả vờ đã bù chuyển động.
- Rule chìm dưới mặt đất dùng lift đo từ mặt đường cục bộ, không dùng z=0. Rule trục LiDAR chạy khi đủ bằng chứng. Thiếu cloud/Python/ground thì bỏ qua các rule phụ thuộc, không coi không có risk là nhãn đúng.

## Kiểm thử
node --test tests/cvat3d.test.ts tests/risk3d.test.ts
npm run typecheck

Đã kiểm tra Job 2 với cuboid SIGN thật, đo PCD thành công và trả box.size_out_of_range. Thử box VEHICLE hạ 1.1 m trong bộ nhớ (không sửa CVAT), trả box.below_ground với lift khoảng -1.14 m.
