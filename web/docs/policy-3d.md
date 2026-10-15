# Policy 3D (cuboid LiDAR)

Trạng thái: **đề xuất, chưa chạy.** `policy3d/` viết Policy cho project 3D theo đúng khuôn dạng của Policy 2D ([Khuôn dạng Policy](policy-format.md)), nhưng chưa có engine nào đọc nó: project 3D hiện ghi `engine_version` `none` và người review tự đi qua từng frame ([Project 3D](projects-3d.md)). Mọi quy tắc có `status: "proposed"` (hoặc `manual`), đủ tham số để một engine 3D chạy được ngay khi có khuôn.

Ngưỡng là **giá trị khởi điểm** theo kích thước và tốc độ vật lý, chưa đo trên segment Waymo nào. Phải đo lại (mục 6) trước khi đổi quy tắc nào sang `active`.

`tests/policy3d.test.ts` giữ các file đúng cấu trúc: mỗi nhãn một file, id không trùng, khuôn có trong mục 4, quy tắc chạy được thì có tham số và điểm, quy tắc theo track thì cần `track_id`.

## 1. Bố cục

```
policy3d/
  _dataset.json            nhãn, ánh xạ type của Waymo, quy ước toạ độ, quy tắc chung any.*
  _frame.json              quy tắc mức frame: dữ liệu frame dùng được không, frame tự chấp nhận được không
  vehicle.json             core
  pedestrian.json          core
  cyclist.json             core: một cuboid cho cả người lái và xe
  sign.json                bonus
  pedestrian_cyclist.json  cặp nhãn: người lái bị gán thêm cuboid pedestrian
```

Thư mục tách khỏi `policy/` vì bộ nhãn khác hẳn và engine 2D nạp `policy/` theo tên file. Các trường của file nhãn, file cặp và quy tắc giữ nguyên nghĩa như mục 2, 2.1 và 3 của khuôn dạng 2D.

## 2. Dữ liệu và quy ước

Mỗi cuboid trong `scene.json` có: `id` (`laser_object_id`, giữ nguyên qua các frame nên dùng làm `track_id`), `type`, `center` [x, y, z], `size` [length, width, height], `heading`, `points` (số điểm lidar trong box). Mỗi frame có `pose` (hệ xe → hệ toàn cục) và `laserCounts`. Không có confidence: nhãn Waymo do người gán.

- Mét, radian, m/s. Ngưỡng `min` và `max` tính cả biên; khoảng ghi `[min, max]`.
- Hệ xe: x hướng đầu xe, y sang trái, z hướng lên. Quy tắc một box và hai box dùng hệ xe; quy tắc theo track đổi sang hệ toàn cục bằng `pose`, để chuyển động của chính xe ghi hình không bị tính vào vật.
- `distance`: khoảng cách trên mặt phẳng xy từ gốc hệ xe tới tâm cuboid.
- **BEV IoU**: IoU của hai hình chữ nhật xoay khi chiếu cuboid xuống mặt phẳng xy.
- **Mặt đường tại chỗ**: trung vị đáy (`center.z − height / 2`) của các cuboid vehicle, pedestrian, cyclist khác trong bán kính `radius_m`. Ít hơn `min_neighbours` cuboid thì quy tắc bỏ qua, không đoán mặt đường từ gốc hệ toạ độ.
- 10 frame mỗi giây, nên "một frame" là 0,1 s.

| `type` Waymo | Nhãn         | Nhãn 2D tương ứng (khi chiếu lên ảnh) |
| ------------ | ------------ | ------------------------------------- |
| `VEHICLE`    | `vehicle`    | `car`, `truck`, `bus`                 |
| `PEDESTRIAN` | `pedestrian` | `person`                              |
| `CYCLIST`    | `cyclist`    | `two_wheeler` và `person` (người lái) |
| `SIGN`       | `sign`       | `traffic_sign`                        |
| `UNKNOWN`    | không có     | bị gắn cờ bởi `any.unknown_type`      |

## 3. Điểm và mức

Giữ như 2D: điểm của một cuboid là tổng điểm các quy tắc bắt lỗi, tối đa 100; vào hàng đợi từ 30, mức cao từ 70. Nhóm `family: "weak"` (`few_points`, `low_confidence`) chỉ tính một lần. Quy tắc theo track chấm cuboid **ở frame xảy ra sự việc**; áp quyết định cho cả track là việc của người review (nút "Áp dụng cho cả N frame").

Thang điểm dùng trong các file:

| Điểm  | Khi nào                                                                   | Ví dụ                                                          |
| ----- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 100   | Cuboid hỏng về dữ liệu                                                    | `valid_cuboid`                                                 |
| 70    | Gần như chắc chắn sai                                                     | `any.ego_vehicle`                                              |
| 50    | Sai về vật lý, ít ngoại lệ                                                | `axis_order`, `max_speed`, `no_points`, hai xe lồng nhau       |
| 30    | Đáng xem, có ngoại lệ hợp lý                                              | `size_range`, `ground_contact`, `rigid_size`, `low_confidence` |
| 10–20 | Dấu hiệu yếu hoặc cảnh báo (`level: "warning"`, không vào hàng đợi chính) | `few_points`, `beyond_range`, `track_gap`, `sign.mounted`      |

`low_confidence` lấy 30 điểm theo policy 2D 5.0.0: confidence thấp một mình đủ vào hàng đợi. Nó chỉ chạy khi dự án nhập cuboid của một mô hình 3D.

## 4. Các khuôn 3D

### 4.1. Mức một cuboid

| Khuôn            | Bắt lỗi khi                                                                        | Tham số                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `valid_cuboid`   | Tâm, kích thước, hướng không hữu hạn, hoặc một cạnh không dương                    | `require`: `finite`, `positive_size`                                                                                                                 |
| `size_range`     | Một cạnh ngoài khoảng                                                              | `length_m`, `width_m`, `height_m` (mỗi cái `[min, max]`); hoặc `max_side_m`, `min_side_m`, `thinnest_side_max_m` khi không biết trục nào là trục nào |
| `axis_order`     | Cạnh theo heading không dài hơn cạnh ngang đủ lần (heading lệch 90°)               | `longer`, `shorter`, `min_ratio`                                                                                                                     |
| `lidar_points`   | Số điểm lidar trong cuboid dưới ngưỡng                                             | `below`; `within_distance_m` (tuỳ chọn: chỉ chấm cuboid gần hơn)                                                                                     |
| `ground_contact` | Đáy lơ lửng hoặc chìm so với mặt đường tại chỗ; hoặc quá thấp với vật gắn trên cột | `max_float_m`, `max_sink_m` hoặc `min_clearance_m`; `ground_from`, `radius_m`, `min_neighbours`                                                      |
| `range_limit`    | Cuboid xa hơn vùng gán nhãn                                                        | `max_distance_m`                                                                                                                                     |
| `ego_overlap`    | Tâm cuboid nằm trong thân xe ghi hình                                              | `footprint_m` (`x`, `y` theo hệ xe), `point`                                                                                                         |
| `allowed_labels` | Loại không nằm trong danh sách                                                     | `labels`                                                                                                                                             |
| `low_confidence` | Như 2D                                                                             | `below`                                                                                                                                              |

### 4.2. Mức hai cuboid cùng frame

| Khuôn        | Bắt lỗi khi                                         | Tham số                                                                                                                                                                                 |
| ------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overlap_3d` | Hai cuboid lồng vào nhau (vật rắn không xuyên nhau) | `with` (`same` hoặc danh sách nhãn) hoặc `between` (file cặp); `bev_iou`; `min_z_overlap_m`; `duplicate_iou` (từ mức này là gán trùng, `EXTRA_OBJECT`); `flag`: `smaller` hoặc tên nhãn |
| `inside_3d`  | Một điểm của cuboid nằm trong cuboid nhãn khác      | `container`, `point` (`center`), `shrink_m` (thu nhỏ cuboid chứa mỗi phía)                                                                                                              |

`min_z_overlap_m` loại trường hợp hai cuboid chồng nhau khi nhìn từ trên nhưng ở hai độ cao khác nhau (xe chở trên xe, cầu vượt).

### 4.3. Mức track

Cần `track_id`; quy tắc có `frame: "global"` cần thêm `pose`.

| Khuôn               | Bắt lỗi khi                                                                  | Tham số                                                                         |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `rigid_size`        | Một cạnh lệch khỏi trung vị của track quá tỉ lệ cho phép                     | `axes`, `max_relative_change`, `compare_to: "track_median"`, `min_track_frames` |
| `max_speed`         | Vị trí giữa hai frame kề ứng với tốc độ quá ngưỡng (ID bị gán sang vật khác) | `m_per_s`, `frame`, `max_frame_gap`                                             |
| `heading_jump`      | Hướng quay quá ngưỡng trong một frame; lệch gần π ghi riêng là đảo đầu đuôi  | `max_rad_per_frame`, `flip_within_rad`, `frame`, `max_frame_gap`                |
| `heading_vs_motion` | Vật đang chạy mà hướng cuboid lệch hướng chuyển động                         | `min_speed_m_per_s`, `max_angle_rad`, `frame`, `window_frames`                  |
| `static_object`     | Vật đứng yên (biển báo) trôi trong hệ toàn cục                               | `max_speed_m_per_s`, `frame`, `min_track_frames`                                |
| `min_track_length`  | Track quá ngắn khi vật ở gần và không ở đầu hay cuối segment                 | `frames`, `within_distance_m`, `not_at_segment_edge_frames`                     |
| `constant_in_track` | Như 2D; `field: "type"`, `mode: "any_change"`                                |                                                                                 |
| `max_gap`           | Như 2D; thêm `within_distance_m`                                             |                                                                                 |

### 4.4. Mức frame (`_frame.json`)

Không cộng điểm cho cuboid. `blocking: true` là frame không được tự chấp nhận.

| Khuôn         | Kích hoạt khi                                                             | Tham số                                           |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| `lidar_count` | Một lidar không có điểm ở frame này                                       | `lasers` (`all` hoặc danh sách tên), `min_points` |
| `pose_jump`   | Vị trí xe ghi hình giữa hai frame kề nhảy quá ngưỡng                      | `max_m_per_frame`                                 |
| `frame_count` | Như 2D; thêm `points_below`, `within_distance_m` để đếm cuboid rỗng ở gần | `labels`, `op`, `value`                           |

`lidar_count` và `pose_jump` kiểm **dữ liệu** chứ không kiểm nhãn: frame thiếu lidar hay pose hỏng thì các quy tắc khác của frame đó không đáng tin.

## 5. Những gì Policy 3D bắt và không bắt

| Lỗi                                        | Quy tắc                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| Cuboid trên khoảng trống                   | `*.no_points`, `frame.many_empty_boxes`                                 |
| Sai kích thước, sai trục, heading lệch 90° | `*.size_range`, `*.axis_order`                                          |
| Lơ lửng hoặc chìm                          | `*.ground_contact`                                                      |
| Đảo đầu đuôi, heading sai hướng chạy       | `*.heading_jump`, `*.heading_vs_motion`                                 |
| Kích thước nhảy giữa các frame             | `*.rigid_size`                                                          |
| ID gán nhầm sang vật khác                  | `*.max_speed`, `any.short_track`, `any.track_gap`                       |
| Đổi loại giữa chừng                        | `*.class_change_in_track`                                               |
| Gán trùng, lồng nhau                       | `*.overlap_*`, `pedestrian_cyclist.rider_twice`                         |
| Gán chính xe ghi hình, người trong xe      | `any.ego_vehicle`, `pedestrian.inside_vehicle`                          |
| **Vật bị sót cuboid**                      | Chưa: `any.missing_object` cần khuôn mới (gom cụm điểm không có cuboid) |
| Sai loại giữa vehicle và cyclist           | Chưa: cần mô hình thứ hai, như AI Check của 2D                          |

## 6. Đo lại ngưỡng trước khi bật

Mỗi quy tắc chỉ nên đổi sang `active` sau khi đo trên ít nhất một segment đã review:

1. Lấy `scene.json` của một project 3D đã có quyết định review (`review_decisions_3d`).
2. Với mỗi nhãn: phân bố `length`, `width`, `height`; `points` theo khoảng cách; tốc độ lớn nhất theo track; mức đổi kích thước trong track. Ghi vào `statistics` của file nhãn.
3. Đặt ngưỡng ở chỗ phân bố của cuboid **đúng** kết thúc. Với cuboid bị review là sai, đo xem quy tắc bắt được bao nhiêu, ghi vào `measured` (`flagged_share`, `error_rate`) như các file 2D.
4. Quy tắc nào bắt nhiều cuboid đúng hơn cuboid sai thì hạ điểm xuống `warning` hoặc giữ `proposed`.

## 7. Còn mở

- Mọi ngưỡng chưa đo (mục 6).
- `export_waymo.py` chưa xuất `speed`, `acceleration`, `difficulty_level` của Waymo. Xuất thêm thì `max_speed` và `heading_vs_motion` không phải suy tốc độ từ vị trí hai frame kề.
- Gốc hệ xe Waymo nằm ở đâu theo trục z, và khung thân xe chính xác: quyết định `any.ego_vehicle` và có dùng z = 0 làm mặt đường dự phòng được không.
- Các điểm lấy từ đặc tả Waymo (tầm gán nhãn, cyclist gồm cả người lái, rơ-moóc tách hay gộp, LEVEL_2 là không quá 5 điểm) cần đối chiếu lại với bản đặc tả.
- Review 3D lưu loại lỗi theo ENUM của 2D; lỗi cuboid được lưu là `BBOX`, và `error_type: "TRACK"` của Policy ứng với `TRACKING` trong DB.
- Engine 3D: một module mới (ví dụ `core/risk3d`) đọc `policy3d/`, chạy các khuôn ở mục 4 trên `scene.json`, ghi điểm vào `risk_cases_3d` (hiện luôn là 0).
