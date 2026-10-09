# Schema và Risk Engine

## Schema 1.0.0

`core/schema/annotation-v1.schema.json` là hợp đồng JSON Schema draft-07, validate bằng Ajv. Chỉ nhận chính xác `schema_version: "1.0.0"`; version chưa hỗ trợ phải có migration explicit, không tự đoán cấu trúc.

```json
{
  "schema_version": "1.0.0",
  "dataset": { "id": "human-example", "name": "Human annotations" },
  "media": [
    { "id": "image-1", "type": "image", "name": "street.png", "width": 800, "height": 480 }
  ],
  "frames": [
    { "id": "image-1:0", "media_id": "image-1", "index": 0, "image": "images/street.png" }
  ],
  "annotations": [
    {
      "id": "annotation-1",
      "frame_id": "image-1:0",
      "label": "car",
      "geometry": { "type": "bbox", "x": 600, "y": 250, "width": 240, "height": 120 },
      "source": { "kind": "human", "name": "annotation team" }
    }
  ]
}
```

BBox trong ví dụ vượt cạnh phải ảnh; vẫn normalize được để check chất lượng phát hiện lỗi.

- Tất cả ID là string. `annotation.id` unique trong dataset, `frame_id` tham chiếu frame, frame tham chiếu media. `object_id` tùy chọn cho định danh ngoài hệ thống. `track_id` chỉ dùng để liên kết temporal trong **cùng media**.
- Media có type image/video, dimensions pixel dương; FPS/frame_count tùy chọn. Image có frame index 0; video dùng frame index từ 0. Timestamp tùy chọn theo millisecond.
- Frame `image` là path local tương đối với dataset JSON. Không có path thì UI báo chưa có ảnh. Media có thể mô tả video, nhưng UI MVP sử dụng frame ảnh đã trích.
- `confidence` tùy chọn, miền [0,1], số 0 có nghĩa hợp lệ. Không thay missing bằng 0 hoặc 1. Null của optional confidence/track/object/source được bỏ khi normalize.
- Source tùy chọn tại dataset/media/annotation: kind human/model/import/unknown, name, model metadata và metadata mở rộng. Không có tên model bắt buộc.
- Bbox `x,y,width,height` theo pixel. Chấp nhận kích thước không dương/vượt ảnh để báo lỗi QA; không clamp hoặc sửa tự động. Non-finite numbers, thiếu label/geometry/reference, duplicate IDs hay hai observation cùng track/frame đều bị từ chối.
- Geometry là tagged union: bbox; polygon/polyline với points `[x,y]`; mask RLE với size `[height,width]` và counts; cuboid với center/size/rotation vector 3 phần tử, coordinate_system bắt buộc. Cuboid rotation theo Euler radians; size theo đơn vị coordinate_system đã khai báo.
- Schema giữ nguyên mask/cuboid. UI hiện render bbox/polygon/polyline; mask/cuboid hiển thị ảnh cùng thông báo chưa có overlay. Các check bbox skip geometry không hỗ trợ.

## Import boundary

**Importer** hiểu format nguồn và trả schema chuẩn; **normalizer** validate cấu trúc và liên kết; **risk engine** chỉ nhận schema. `server/repository.mjs` cũng chỉ đọc dataset chuẩn. Không có import YOLO, ByteTrack, cv2 trong lõi/server/frontend.

Adapter demo đọc tracks.json, giữ ID `<track>-<frame>` để URL case cũ tiếp tục dùng. Script chuẩn bị demo dùng OpenCV lấy metadata và trích ảnh theo danh sách frame engine yêu cầu. Risk Engine mới không đọc `risk_cases_v1.json`; file đó chỉ được đọc trong test compatibility.

Importer CVAT giới hạn có chủ đích: CVAT for images 1.1, box/polygon/polyline. Đối chiếu [đặc tả CVAT chính thức](https://docs.cvat.ai/docs/dataset_management/formats/format-cvat/). Nó không biến object ID thành track ID và không suy đoán confidence. ID ổn định theo image ID, loại shape và thứ tự trong file XML; thay thứ tự shape có thể đổi ID. Trạng thái review dùng fingerprint dataset nên không gán nhầm trạng thái của bản import cũ.

Registry hiện có `smartreview-json`, `cvat-images`; adapter demo được script riêng gọi. COCO, YOLO text, MOT là hướng mở rộng, chưa có importer thực thi.

## Checks và scoring

Engine tạo lịch sử theo `(media_id, track_id)` và sort frame index. Temporal chỉ chạy khi có previous/current/next và gap mỗi bên ≤ 3 frame. Không suy đoán tracking từ object ID, vị trí hay label.

| Check ID                       | Tín hiệu cần               | Điều kiện flag                                                        | Điểm    |
| ------------------------------ | -------------------------- | --------------------------------------------------------------------- | ------- |
| `temporal.class_inconsistency` | Track và 3 observations    | previous.label = next.label ≠ current.label                           | 50      |
| `confidence.neighbor_drop`     | Temporal + đủ 3 confidence | confidence trung bình hai bên − hiện tại ≥ 0.20                       | 20      |
| `geometry.bbox_validity`       | Bbox + dimensions ảnh      | width/height ≤ 0; hoặc vượt ảnh > 0.1 px                              | 70 / 40 |
| `geometry.bbox_area`           | Temporal + 3 bbox dương    | sai lệch diện tích với trung bình hai bên ≥ 50%                       | 15      |
| `geometry.bbox_position`       | Temporal + 3 bbox dương    | khoảng cách tâm so với trung bình hai bên / đường chéo hiện tại ≥ 0.5 | 15      |
| `geometry.bbox_duplicate`      | Ảnh đơn (profile 2.1.0+)   | Bbox trùng lặp cao (IoU ≥ 0.85); phân biệt cùng nhãn vs khác nhãn     | 50 / 45 |
| `geometry.bbox_tiny`           | Ảnh đơn (profile 2.1.0+)   | Kích thước cạnh < 4px hoặc diện tích < 0.001% ảnh                     | 35      |
| `geometry.bbox_aspect`         | Ảnh đơn (profile 2.1.0+)   | Tỷ lệ cạnh bất thường (tỷ lệ dài/rộng ≥ 20:1)                         | 25      |
| `geometry.bbox_size_outlier`   | Ảnh đơn (profile 2.1.0+)   | Diện tích lệch bất thường theo phân phối lớp (z ≥ 4, n ≥ 20 mẫu)      | 30      |

Mỗi check có `id`, `version`, `run(context)` và trả `passed`, `flagged`, hoặc `skipped` kèm reason. Không catch rồi giấu lỗi lập trình; thiếu tín hiệu được xử lý explicit trong check. Tổng điểm = min(100, tổng điểm flag). Suspicious queue mặc định score ≥ 30; High ≥ 70, Medium 40–69, Low < 40. Chế độ All có cả score 0; score 0 không chứng minh annotation đúng vì có thể nhiều check đã skip. Profile 2.0.0 (mặc định cho các dự án cũ) giữ nguyên 5 check gốc; profile 2.1.0 bổ sung 4 check ảnh đơn cho project mới.

Risk output version 1.0.0, engine version 2.0.0 / 2.1.0:

```text
reference: dataset_id + annotation_id + media_id + frame_id + frame_index
score, severity, reasons, check_ids
findings: check_id, check_version, score, reason, evidence
context: previous/current/next → annotation IDs (chỉ những observation tồn tại)
evaluations: cả check passed/flagged/skipped cho từng annotation
checks: thống kê số lần passed/flagged/skipped + skip_reasons cho dataset
```

Engine trả `results` cho toàn bộ annotations và `cases` cho suspicious queue. Evidence giữ số liệu, threshold hoặc annotation IDs; không chỉ lưu thông báo văn bản. Repository thêm URL ảnh và một số alias (`risk_score`, `risk_level`, `class_name`, numeric `frame_id`) để giữ component/API demo dễ chuyển đổi; reference chuẩn vẫn ở `reference`.

## State và phạm vi MVP

Dataset JSON được nạp lúc startup. Fingerprint = hash JSON + engine version; ảnh phục vụ no-cache và URL kèm fingerprint. Thay dataset/engine version → trạng thái review cục bộ được tách. Sửa nội dung ảnh mà giữ nguyên JSON không đổi fingerprint; cần version/update dataset khi dữ liệu ảnh thay đổi có ý nghĩa.

Human decisions hiện lưu MySQL, tách riêng khỏi risk output theo dataset revision + annotation reference. Chi tiết: [human-review.md](human-review.md). LocalStorage cũ không được đọc/ghi và không tự chuyển thành quyết định đúng/sai. Schema và risk algorithms trong tài liệu này giữ nguyên.

## Projects và web upload

Xem [Projects + Import](projects-import.md). Schema và checks giữ nguyên; project scope nằm ở repository/API/storage. Web upload thêm validation ảnh và từ chối bbox không dương trước khi gọi engine; CLI/schema cũ vẫn giữ các annotation đó để QA.
