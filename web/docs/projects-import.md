# Projects + Dataset Import V1

## Workflow và phạm vi

Mở `/projects` → **+ New Project** → tên/mô tả/format → chọn annotation và ảnh → **Create & Import** → dashboard → **Start Review** → Save Review.

Các importer được hỗ trợ: COCO Detection JSON (bbox), **CVAT for images 1.1 XML** (box/polygon/polyline) và **SmartReview JSON schema 1.0.0**. Không chạy YOLO/ByteTrack khi upload. Confidence, track và model metadata vẫn optional. JSON cần đúng schema chuẩn, không phải một mảng bbox tùy ý.

Phase này upload ảnh PNG/JPEG/WebP/GIF tĩnh. Không nhận video gốc, ZIP, SVG hoặc CVAT video tracks. JSON có media type video được nhận nếu upload đủ các frame ảnh được tham chiếu. Demo video cũ vẫn dùng các ảnh đã trích như trước. Schema/engine và importer CLI cũ giữ nguyên; chỉ boundary upload web thêm validation media.

## Database và compatibility

Migration `server/db/migrations/002_projects.sql` thêm bảng `projects` bằng CREATE TABLE IF NOT EXISTS, không DROP hay sửa migration 001 đã áp dụng.

```text
projects.dataset_revision_id (unique FK)
  → dataset_revisions.id
    → risk_cases.dataset_revision_id
      → review_decisions.risk_case_id
```

Project lưu UUID, name, description, format, status, error_message, dataset_path, metadata JSON, created_at/updated_at. Annotation/media đầy đủ nằm trong dataset JSON và filesystem; MySQL lưu reference thay cho binary. Cấu trúc này tận dụng database hiện có.

Fingerprint project mới = SHA256(project UUID + normalized JSON + engine version), rút gọn 20 ký tự theo hợp đồng hiện tại. Vì vậy cùng annotation ID và cùng file ở hai project vẫn có revision/reviews riêng. API ảnh cũng kiểm tra fingerprint và scope project. Dataset đã READY không được ghi đè/reimport; muốn phiên bản mới thì tạo project mới.

Startup đăng ký dataset hiện tại thành project. Nếu chưa có file demo, API vẫn mở Projects để import dữ liệu riêng; không cần chuẩn bị output model. `traffic-demo` được đặt tên Traffic Demo. Demo dùng nguyên revision cũ nên quyết định trước phase này được giữ nguyên. Các URL `/review/2-422`, `/api/cases`, `/api/reviews` cũ vẫn hoạt động với dataset cấu hình lúc khởi động. UI Projects dùng endpoint có project ID.

## Storage

Mặc định `web/storage`, đổi bằng biến backend `SMARTREVIEW_STORAGE` (nên dùng đường dẫn tuyệt đối):

```text
storage/projects/<project-uuid>/<import-attempt-uuid>/
  annotations/source.xml hoặc source.json
  media/<relative-image-path>
  dataset.json                 # canonical normalized dataset
  risk/report.json             # kết quả engine và evidence
```

Dataset đặt cùng cấp `media/` để repository kiểm tra mọi asset nằm trong chính thư mục dataset. Tên thư mục được server sinh UUID. Tên annotation được server đặt; media path được kiểm tra nghiêm ngặt. File lỗi của một attempt được dọn; project FAILED và lý do vẫn ở DB để thử lại. Khi server khởi động lại, import bị gián đoạn chuyển FAILED, cho phép upload lại. Thư mục dở dang do process bị kill có thể còn trên disk; không được công bố làm dataset READY.

Backup phải bao gồm cả MySQL và `storage/`; dataset demo vẫn ở `datasets/demo`. Không chia sẻ `.env`, `.local` hoặc upload riêng tư. Storage đã được bỏ qua trong git/Prettier.

## Status và xử lý lỗi

`CREATED → UPLOADING → VALIDATING → NORMALIZING → ANALYZING → READY`; lỗi chuyển `FAILED`.

UI báo phần trăm truyền file, rồi poll trạng thái thật trong MySQL. Request import được xử lý trong API process, chưa có worker/queue nền. Giữ trang mở tới khi hoàn tất; nếu mất kết nối, vào project kiểm tra trạng thái trước khi thử lại. Project CREATED/FAILED có form upload trên dashboard. Hai request import đồng thời cùng project: chỉ một request được nhận; request còn lại trả 409.

## API

| Method       | Endpoint                                        | Kết quả                                                          |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------- |
| GET          | `/api/projects`                                 | Danh sách metadata, không lộ đường dẫn storage                   |
| POST         | `/api/projects`                                 | `{name, description?, format}` → 201 CREATED                     |
| GET          | `/api/projects/:id`                             | Metadata và status                                               |
| POST         | `/api/projects/:id/import`                      | Multipart `annotation` một file + `media` nhiều file → 201 READY |
| GET          | `/api/projects/:id/import-status`               | Status và error_message                                          |
| GET          | `/api/projects/:id/dashboard`                   | Project, dataset stats, MySQL review metrics                     |
| GET          | `/api/projects/:id/meta`                        | Metadata dataset                                                 |
| GET          | `/api/projects/:id/checks`                      | Check coverage                                                   |
| GET          | `/api/projects/:id/risk-cases`                  | Risk cases; cũng hỗ trợ `/cases`                                 |
| GET          | `/api/projects/:id/cases/:annotationId`         | Chi tiết case                                                    |
| GET          | `/api/projects/:id/assets/:frameId?dataset=...` | Ảnh trong project                                                |
| GET          | `/api/projects/:id/reviews`                     | Map quyết định đã lưu                                            |
| GET          | `/api/projects/:id/dashboard/metrics`           | Review metrics                                                   |
| GET/POST/PUT | `/api/projects/:id/cases/:annotationId/review`  | Đọc/tạo/cập nhật review như phase MySQL                          |

Case list giữ các filter `scope=all`, `level`, `review_status`. Review payload vẫn dùng `dataset_revision`, decision `CORRECT/ERROR/UNSURE`, error_type, corrected_value, note và version khi update.

HTTP: 400 malformed request/filename/file type, 403 origin không hợp lệ, 404 unknown project/case, 409 project chưa READY/đã import/conflict revision, 413 quá giới hạn upload, 415 content type, 422 annotation/media không hợp lệ, 503 lỗi storage/DB. Chi tiết lỗi nội bộ không trả về browser.

## Validation và giới hạn

- Tổng upload 200 MB; tối đa 1000 ảnh + một annotation; mỗi ảnh 20 MB; annotation 10 MB.
- Ảnh tĩnh tối đa 25 megapixels, kiểm tra signature, giải mã với Sharp, dimensions thực tế phải khớp metadata annotation.
- Không cho absolute path, `..`, backslash, empty segment, control characters, hidden segment, tên trùng hay extension không cho phép. Không extract archive, execute upload hoặc phục vụ nguyên annotation như HTML.
- Ảnh được ghép bằng relative path chính xác; nếu chọn file rời thì cho phép basename khi duy nhất. Chọn folder sẽ bỏ tên folder ngoài cùng. Ảnh thiếu, tên không rõ ràng hoặc ảnh thừa đều báo lỗi.
- CVAT từ chối DTD/entity, XML lỗi và phần tử chưa hỗ trợ. JSON qua normalizer/Ajv của schema 1.0.0: required fields, duplicate IDs, reference, frame index và geometry types.
- Upload web từ chối bbox width/height ≤ 0 và bbox sai kiểu/thiếu field. Bbox dương nhưng vượt mép ảnh vẫn được nhập để check geometry hiện có đánh dấu. Core schema vẫn giữ hành vi cũ cho CLI/demo.
- Tối đa 100000 annotations / 10000 frames mỗi import. Check thiếu confidence/track skip bình thường.
- Same-origin check trên create/import/review; Vite giữ Host qua proxy. Asset response có nosniff/CSP sandbox. Service chỉ bind localhost.

## Thử bằng dataset mẫu

Trong `web/fixtures/upload/` có:

- `street.png`: ảnh minh họa 160×100.
- `annotations.xml`: CVAT image 1.1, một box vượt mép phải.
- `dataset.json`: dữ liệu tương đương theo schema chuẩn.

Tạo project **Human Road A**, chọn CVAT, chọn `annotations.xml` và `street.png`. Kết quả: 1 media, 1 frame, 1 annotation, Tracks N/A, 1 Medium case (Risk 40). Confidence không được bịa ra.

Vào Start Review → Annotation Error → BBox → ghi chú → Save Review. Reload để xác nhận. Tạo **Human Road B**, chọn SmartReview JSON với `dataset.json` và cùng ảnh. Project B phải có Reviewed 0 dù A đã review.

Không upload cả XML và JSON cùng lúc. Với dữ liệu của bạn, export **CVAT for images 1.1** và chọn đúng các ảnh được XML tham chiếu.

## Tests và phần để sau

`npm run build && npm test`: core/schema/importer, demo regression, reviews và Projects API với MySQL test riêng. `npm run test:ui`: browser create/import/review/reload, hai project độc lập, retry, legacy UI và mobile. Browser teardown dùng manifest UUID để dọn đúng rows/storage của lượt test, không dùng DB ứng dụng.

Chưa làm auth/team/permission, project edit/reimport UI, video extraction khi upload, ZIP, MOT/YOLO importer mới, cloud storage, worker queue, CVAT API, auto-correction, thuật toán risk mới, 3D hay deployment. Dataset lớn hơn giới hạn cần phase xử lý nền/pagination. Các cảnh báo dependency Vite/React Router hiện có được ghi trong bàn giao, không tự nâng toàn bộ frontend trong phase này.

## Xóa project

Nút **Xóa project** nằm ở danh sách và trang chi tiết, yêu cầu xác nhận trước khi xóa.
`DELETE /api/projects/:id` kiểm tra same-origin, xóa project, revision, risk cases,
review annotation, review ảnh và thư mục upload/AI riêng của project.
Demo mặc định được bảo vệ; chờ import và AI Check hoàn tất trước khi xóa.
Database dùng transaction. File chuyển tạm vào `storage/.trash`, được khôi phục
nếu transaction thất bại, rồi dọn sau commit. Nếu dọn thất bại, giao diện thông
báo file còn chờ dọn trong `.trash`.

## COCO Detection

Chọn **COCO Detection · JSON (bbox)** khi tạo project. Upload một JSON có
`images`, `categories`, `annotations` và tất cả ảnh trong `images`, kể cả ảnh
không có annotation. `category_id` được ánh xạ bằng `categories[].name`;
không dùng danh sách class COCO cố định. ID phải là số nguyên không âm an toàn.
BBox dùng `[x, y, width, height]` theo pixel gốc, không clamp hoặc chuẩn hóa tọa độ.

Hỗ trợ đường dẫn ảnh tương đối và thư mục con. Từ chối ID/file_name trùng,
reference thiếu, bbox sai cấu trúc, kích thước ảnh sai và đường dẫn không an toàn.
Không tạo confidence/track_id. `iscrowd`, `area`, segmentation/keypoints và các
thuộc tính annotation được giữ trong `attributes.coco`; chỉ bbox được kiểm tra
và hiển thị. JSON nguồn vẫn được lưu nguyên trong thư mục upload.
Không hỗ trợ COCO prediction arrays hoặc panoptic; annotation phải có bbox.

Web giữ giới hạn 1000 ảnh / 200 MB, annotation 10 MB, 100000 annotations;
bbox có width/height không dương bị từ chối theo validation upload hiện có.
CLI giữ các box này để core QA đánh dấu. Không cần migration database.

Thử với `fixtures/upload/coco.json` và `fixtures/upload/street.png`.

```bash
npm run import -- --format coco-detection \
  --input /path/to/instances.json --images /path/to/images \
  --out datasets/my-coco --id my-coco
```

Đặc tả tham khảo: https://cocodataset.org/#format-data
