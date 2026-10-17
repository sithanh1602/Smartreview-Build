# Hoàn thành review và gửi cho Annotator

Thay đổi ngày 2026-10-12.

## Luồng

1. Leader hoặc Reviewer bấm **Hoàn thành** (dưới form quyết định khi đang ở case cuối cùng của hàng đợi trang Review, hoặc cạnh các nút ở trang dự án).
2. Pop-up cho chọn Annotator của project (mặc định chọn hết), ghi chú, rồi **Gửi và khoá review**. Còn case rủi ro chưa kiểm tra thì pop-up báo số case đó nhưng vẫn cho gửi. Ô **Gửi kèm mục "Cần xem lại"** (mặc định tắt, chỉ hiện khi có case Chưa chắc hoặc chưa kiểm tra) cho file thêm các case đó; không chọn thì Annotator chỉ nhận lỗi đã xác nhận.
3. Backend chụp lại kết quả tại thời điểm gửi thành một file (report) và lưu cùng danh sách người nhận.
4. Từ lúc đó mọi thao tác ghi quyết định review và đánh giá ảnh của project bị từ chối (HTTP 423), với cả Leader lẫn Reviewer. Giao diện khoá form quyết định và form đánh giá ảnh, hiện thông báo ai gửi, cho ai, lúc nào.
5. Annotator được gửi làm mọi việc ngay ở trang dự án (mục dưới). Leader/Reviewer xem bản đã gửi ở **Xem file đã gửi →** (`/projects/:id/fixes`); Annotator mở link đó thì được chuyển về trang dự án.
6. Leader hoặc Reviewer bấm **Mở lại review** ở trang dự án (khi review đang chờ Annotator). Pop-up nêu tên các Annotator sẽ bị thu hồi file và nút **Thu hồi và mở lại**: bản gửi bị xoá, quyết định review mở khoá, sau đó có thể Hoàn thành lần nữa. Lỗi (ví dụ mất kết nối) hiện ngay trong pop-up.

## Trang dự án của Annotator được gửi

Annotator không thấy số liệu dataset, QA, review hay các nút review/AI Check ở trang dự án (chỉ ẩn trên giao diện; API vẫn theo `docs/project-roles.md`). Trang chỉ có tên project, thành viên và việc của họ (`AnnotatorWork` trong `src/features/handoff/AnnotatorSteps.tsx`; danh sách lỗi và form gửi lại dùng chung với trang fixes ở `src/features/handoff/fixes.tsx`):

- Chưa được gửi gì: "Chưa có lỗi nào được gửi cho bạn".
- Đang chờ (`SENT`) và có tên trong danh sách nhận: khung "Bạn có lỗi cần sửa" (ai gửi, lúc nào, ghi chú) rồi ba bước.
- Đã gửi lại (`RETURNED`): "Bạn đã gửi lại bản đã sửa" và kết quả từng lỗi (Đã sửa / Chưa đổi…).

Ba bước khi đang chờ:

1. **Lấy dữ liệu để sửa**, hai cách cạnh nhau: **Đưa vào công cụ** (mục CVAT bên dưới) hoặc **Hoặc tải về (.zip)**: chọn định dạng rồi **Tải .zip**. Mọi định dạng ảnh mà phần import đọc được (`core/exporters/formats.ts`), mỗi định dạng theo bố cục mà công cụ của nó nhập vào:

   | Định dạng                | Tệp nhãn                                           | Ảnh             | Giữ                                                                      |
   | ------------------------ | -------------------------------------------------- | --------------- | ------------------------------------------------------------------------ |
   | CVAT for images 1.1      | `annotations.xml`                                  | `images/`       | box, polygon, polyline                                                   |
   | COCO Detection           | `annotations/instances_default.json`               | `images/`       | box; polygon/polyline thành khung bao (polygon thêm `segmentation`)      |
   | Datumaro 1.0             | `annotations/default.json`                         | `images/`       | box, polygon, polyline                                                   |
   | PASCAL VOC 1.1           | `Annotations/<ảnh>.xml`                            | `JPEGImages/`   | box; polygon/polyline thành khung bao                                    |
   | Ultralytics YOLO         | `data.yaml`, `train.txt`, `labels/train/<ảnh>.txt` | `images/train/` | box, polygon; polyline thành khung bao                                   |
   | LabelMe 3.0              | `default/<ảnh>.xml`                                | `default/`      | box, polygon; polyline nhiều điểm đọc lại thành polygon                  |
   | KITTI                    | `label_2/<ảnh>.txt`                                | `image_2/`      | box; polygon/polyline thành khung bao; dấu cách trong tên nhãn thành `_` |
   | SmartReview Schema 1.0.0 | `dataset.json`                                     | `images/`       | mọi thứ                                                                  |

   Mask và cuboid không có chỗ trong các định dạng ảnh nên bị bỏ. CVAT for video và MOT cần video nên không có ở đây. Mỗi định dạng đọc lại được bằng **Gửi lại cho Reviewer** (test `every export format reads back…` trong `tests/handoff.test.ts`).

   **Đưa vào công cụ**: hiện chỉ có **CVAT local**. **Đưa vào CVAT** cho backend tạo một task trong CVAT của server (`CVAT_BASE_URL`, `CVAT_TOKEN`): đủ ảnh theo thứ tự frame, nhãn hiện tại thành shape (box, polygon, polyline), rồi hiện **Mở task #n trong CVAT ↗** (`CVAT_UI_URL`, mặc định `CVAT_BASE_URL`). Mỗi lần gửi là một task, tên `SmartReview · <project> · <8 ký tự id> · <thời điểm gửi>`; bấm lại thì mở task đó, không tạo trùng. Task do tài khoản của token sở hữu, chưa gán cho ai. Lỗi giữa chừng thì task dở bị xoá.

   **Issue trong CVAT**: job có một issue cho mỗi mục của file gửi (`handoffIssues`, `server/cvat/tasks.ts`), vùng là khung bao của mục đó, nội dung là comment đầu tiên: `[Lỗi] <loại>: <nhãn> · sửa thành … · Ghi chú: … · Lý do cảnh báo: …`, `[Thiếu nhãn] Vẽ thêm <nhãn> tại vùng này`, `[Cần xem lại] <nhãn> · Reviewer chưa chắc / chưa ai kiểm tra · rủi ro n · …`. Annotator bấm vào vùng trên ảnh để đọc, dùng nút nhảy tới frame có issue, sửa xong bấm Resolve. Issue chỉ được tạo khi job chưa có issue nào; bấm lại không tạo trùng. Mục của frame không còn trong dataset (dataset đổi sau khi gửi) bị bỏ qua.

2. **Xem ảnh cần sửa**, ngay trên trang: danh sách bên trái (Nhãn sai, Thiếu nhãn, Cần xem lại; lọc được), ảnh có khung, loại lỗi, nhãn cần sửa thành, ghi chú của Reviewer, lý do cảnh báo.
3. **Gửi lại cho Reviewer**: chọn file nhãn đã xuất từ công cụ (mục dưới).

## Annotator sửa trong CVAT rồi gửi lại

1. Lấy dữ liệu vào CVAT ở bước 1 của trang dự án: **Đưa vào CVAT**, hoặc tải `.zip` CVAT for images 1.1 rồi nhập vào CVAT bằng Import dataset của project, hoặc tạo task từ `images/` rồi Upload annotations với `annotations.xml`.
2. Sửa trong CVAT, rồi xuất nhãn (không cần kèm ảnh).
3. Ở bước 3 của trang dự án, chọn **một** file vừa xuất (`.zip`, `.xml`, `.json`, `.txt`, định dạng nào SmartReview import được) và bấm **Gửi lại cho Reviewer**. Leader cũng gửi lại được thay Annotator ở `/projects/:id/fixes`. Trình duyệt chỉ gửi các tệp nhãn trong file; ảnh không được gửi lại.
4. Backend tự nhận định dạng (mọi định dạng mà phần import đọc được), chuyển về dạng SmartReview, ghép với ảnh sẵn có của project và chạy lại Risk Engine. Project chuyển sang bản dataset mới; bản đã gửi được giữ bên cạnh dưới tên `dataset.sent-<thời điểm>.json`.
5. Review **chỉ mở khoá ở bước này**. Trang dự án báo "Annotator đã gửi lại bản đã sửa" và một nút **Kiểm tra bản sửa · đã kiểm tra/tổng →** (`RecheckButton`, `src/features/handoff/fixes.tsx`) mở `/projects/:id/fixes`. Ở đó Leader/Reviewer đi qua từng mục (Nhãn sai, Thiếu nhãn, Cần xem lại; kết quả Đã sửa / Đã xoá nhãn / Đã thêm nhãn / Chưa đổi / Chưa thêm nhãn; khung lúc gửi và khung hiện tại) và chọn **Đồng ý** hoặc **Từ chối**, kèm ghi chú nếu muốn (`POST …/handoff/verdict`, `ProjectService.judge`):
   - **Đồng ý**: nhãn ở chỗ đó bây giờ được lưu quyết định Đúng. Mục không còn nhãn (đã xoá, chưa thêm) thì chỉ ghi nhận.
   - **Từ chối**: mục được đánh lỗi lại. Còn nhãn ở chỗ đó thì nhãn đó thành Lỗi với loại lỗi và giá trị sửa như lúc gửi (mục Thiếu nhãn / Cần xem lại: loại Other), ghi chú là ghi chú mới hoặc ghi chú cũ. Không còn nhãn thì vùng đó được đánh dấu thiếu nhãn trên ảnh (id `recheck-…`, nhãn là giá trị sửa hoặc nhãn lúc gửi).
   - Trả lời lại một mục thì thay câu trả lời cũ (Đồng ý sau Từ chối gỡ vùng đã đánh dấu). Câu trả lời lưu trong `result` của `project_handoffs` (`verdict: { value, note, by, at }`), không cần migration.
   - Sau khi chọn, trang tự sang mục kế tiếp chưa kiểm tra; bộ lọc có "Chờ kiểm tra"; đầu trang đếm đã kiểm tra / đồng ý / từ chối. Kiểm tra hết thì về trang dự án bấm **Hoàn thành**: mục bị từ chối nằm trong file mới và thành issue CVAT.
6. Còn lỗi thì Reviewer lưu quyết định rồi bấm **Hoàn thành** lần nữa để bắt đầu vòng mới.

Quy tắc khi nhận file:

- File phải có đúng các ảnh của project: thiếu ảnh, thừa ảnh, ảnh lặp hoặc sai kích thước đều bị từ chối (422) và project giữ nguyên.
- Nhãn không đổi (cùng ảnh, cùng tên, cùng hình trong sai số 0,5 px) giữ nguyên quyết định review cũ. Nhãn đã sửa hoặc mới thì chưa có quyết định.
- Vùng thiếu đã được vẽ nhãn (IoU ≥ 0,3) thì bỏ khỏi đánh giá ảnh; vùng chưa có nhãn vẫn còn.
- Chỉ dataset ảnh rời; dataset video chưa xuất/nhận theo cách này.

## File gửi đi

- `errors`: mọi annotation có quyết định `ERROR` (cả case rủi ro lẫn nhãn được review trong "Tất cả nhãn"), kèm vị trí, loại lỗi, giá trị sửa, ghi chú, lý do cảnh báo.
- `missing`: mọi vùng thiếu đã lưu ở trang Kiểm tra theo ảnh.
- `review` ("Cần xem lại", chỉ khi Reviewer chọn ô trong pop-up; không chọn thì rỗng): annotation có quyết định `UNSURE` (ở bất kỳ nhãn nào) và mọi case trong hàng đợi rủi ro chưa có quyết định, `status` là `UNSURE` hoặc `UNREVIEWED`, kèm điểm rủi ro, lý do cảnh báo, ghi chú. Gợi ý thiếu nhãn của model chưa kiểm tra có `annotation_id: null`. Đây không phải lỗi đã xác nhận: Annotator kiểm tra rồi sửa nếu sai. Khi gửi lại, mỗi mục cũng có kết quả (Đã sửa / Chưa đổi…), nhưng tóm tắt "x mục đã được sửa" chỉ đếm `errors` và `missing`. File gửi trước khi có `review` không có trường này.
- Quyết định `CORRECT` không có trong file.
- File là ảnh chụp tại lúc gửi; nếu dataset được import lại sau đó, trang báo "file là của bản dataset trước".

## Database (migration 007, chưa chạy trên DB thật)

`server/db/migrations/007_review_handoff.sql` tạo `project_handoffs`: mỗi project tối đa một dòng (`project_id` là khoá chính), gồm `status` (`SENT`/`RETURNED`), `returned_by_name`, `returned_at`, `result` (JSON so sánh), `dataset_fingerprint`, `sent_by`, `sent_by_name`, `recipients` (JSON `[{id, username}]`), `note`, `report` (JSON), `sent_at`. Xoá project thì dòng này bị xoá theo.

Khi DB chưa có bảng này: project vẫn chạy bình thường như chưa gửi; bấm gửi nhận 503 "Chạy npm run db:migrate".

Migration 012 (`012_handoff_sent_at_utc.sql`, chưa chạy trên DB thật): `sent_at` từng lấy mặc định `CURRENT_TIMESTAMP(3)` là giờ của MySQL (VPS đang ở `+07`) nhưng được đọc như UTC giống `returned_at` (`UTC_TIMESTAMP`), nên giờ gửi lệch 7 tiếng và có thể "gửi lại trước lúc gửi". Code giờ ghi `sent_at = UTC_TIMESTAMP(3)`; migration đổi các dòng cũ của `project_handoffs` và `project_handoffs_3d` sang UTC bằng `CONVERT_TZ(sent_at, 'SYSTEM', '+00:00')`. Chạy migration cùng lúc với bản code này: dòng gửi bằng code mới trước khi chạy migration sẽ bị trừ giờ thêm một lần.

## API

| Route                                                                          | Ai                                   | Kết quả                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `GET /api/projects/:id`, `/dashboard`                                          | Thành viên, Leader                   | Thêm `handoff` (`null` nếu chưa gửi): người gửi, người nhận, `for_me`                      |
| `POST /api/projects/:id/handoff` `{ annotator_ids[], note?, include_review? }` | Leader, Reviewer                     | 201. Đã gửi rồi: 409. Người nhận không phải Annotator của project: 400                     |
| `GET /api/projects/:id/handoff`                                                | Leader, Reviewer, Annotator được gửi | `{ handoff, report }`. Chưa gửi: 404. Annotator không được gửi: 403                        |
| `DELETE /api/projects/:id/handoff`                                             | Leader, Reviewer                     | Mở lại review. Annotator: 403                                                              |
| `GET /api/projects/:id/handoff/dataset.zip?format=`                            | Như `GET …/handoff`                  | `.zip` theo định dạng (mặc định `cvat-images`). Định dạng lạ: 400                          |
| `POST /api/projects/:id/handoff/cvat`                                          | Như `GET …/handoff`                  | `{ task_id, job_id, url, created, issues }`. Không ở `SENT`: 409. Thiếu cấu hình CVAT: 503 |
| `POST /api/projects/:id/handoff/return` `{ files: [{ name, text }] }`          | Annotator được gửi, Leader           | Nhận bản đã sửa, trả kết quả so sánh. Không đang chờ: 409. File sai: 422                   |
| `POST/PUT …/cases/:id/review`, `PUT …/frames/:id/review`                       | —                                    | 423 khi đang chờ Annotator (SENT)                                                          |

Code: `server/projects/handoff.ts` (`buildReport`, `ProjectHandoffs`), route trong `server/projects/http.ts`, exporter `core/exporters/formats.ts`, task CVAT `server/cvat/tasks.ts`; giao diện `src/features/handoff/CompleteReviewButton.tsx`, `src/features/handoff/ReopenReviewButton.tsx`, `src/pages/FixesPage.tsx`. Test không cần DB: `tests/handoff.test.ts`.

## Chưa làm

- Lấy bản đã sửa thẳng từ task CVAT: hiện vẫn xuất từ CVAT rồi gửi lại một file.
- Gán task CVAT cho đúng người: task chưa có assignee.
- Video (CVAT for video, MOT) chưa xuất được.
- Annotator chưa đánh dấu được "đã sửa" từng lỗi; chưa có thông báo (email/chuông) khi được gửi.
- `returnFixed` (đổi dataset, chép quyết định) chưa được chạy trên MySQL thật; phần đọc file và so sánh có test trong `tests/handoff.test.ts`.
- File .zip chưa được thử nhập vào một CVAT thật.
