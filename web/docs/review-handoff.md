# Hoàn thành review và gửi cho Annotator

Thay đổi ngày 2026-10-12.

## Luồng

1. Leader hoặc Reviewer bấm **Hoàn thành** (dưới form quyết định khi đang ở case cuối cùng của hàng đợi trang Review, hoặc cạnh các nút ở trang dự án).
2. Pop-up cho chọn Annotator của project (mặc định chọn hết), ghi chú, rồi **Gửi và khoá review**. Còn case rủi ro chưa kiểm tra thì pop-up cảnh báo nhưng vẫn cho gửi.
3. Backend chụp lại kết quả tại thời điểm gửi thành một file (report) và lưu cùng danh sách người nhận.
4. Từ lúc đó mọi thao tác ghi quyết định review và đánh giá ảnh của project bị từ chối (HTTP 423), với cả Leader lẫn Reviewer. Giao diện khoá form quyết định và form đánh giá ảnh, hiện thông báo ai gửi, cho ai, lúc nào.
5. Annotator được gửi mở **Xem lỗi cần sửa →** ở trang dự án (`/projects/:id/fixes`): danh sách lỗi, ảnh có khung, loại lỗi, nhãn cần sửa thành, ghi chú của Reviewer, lý do cảnh báo; tải được file `.json`.
6. Leader bấm **Mở lại review** ở trang dự án để thu hồi: bản gửi bị xoá, Reviewer sửa lại được, sau đó có thể Hoàn thành lần nữa.

## Annotator sửa trong CVAT rồi gửi lại

1. Ở trang `/projects/:id/fixes`, Annotator bấm **Tải dataset cho CVAT (.zip)**: file gồm `annotations.xml` (CVAT for images 1.1, đủ mọi nhãn) và `images/` (đủ mọi ảnh). Nhập vào CVAT bằng Import dataset của project, hoặc tạo task từ `images/` rồi Upload annotations với `annotations.xml`.
2. Sửa trong CVAT, rồi xuất nhãn (không cần kèm ảnh).
3. Ở cùng trang, chọn **một** file vừa xuất (`.zip`, `.xml`, `.json`) và bấm **Gửi lại cho Reviewer**. Trình duyệt chỉ gửi các tệp nhãn trong file; ảnh không được gửi lại.
4. Backend tự nhận định dạng (mọi định dạng mà phần import đọc được), chuyển về dạng SmartReview, ghép với ảnh sẵn có của project và chạy lại Risk Engine. Project chuyển sang bản dataset mới; bản đã gửi được giữ bên cạnh dưới tên `dataset.sent-<thời điểm>.json`.
5. Review **chỉ mở khoá ở bước này**. Trang dự án báo "Annotator đã gửi lại bản đã sửa"; Leader/Reviewer mở **Kiểm tra lại các lỗi đã gửi →** để xem từng lỗi: Đã sửa / Đã xoá nhãn / Đã thêm nhãn / Chưa đổi / Chưa thêm nhãn, khung lúc gửi và khung hiện tại, kèm liên kết mở nhãn hiện tại trong Review.
6. Còn lỗi thì Reviewer lưu quyết định rồi bấm **Hoàn thành** lần nữa để bắt đầu vòng mới.

Quy tắc khi nhận file:

- File phải có đúng các ảnh của project: thiếu ảnh, thừa ảnh, ảnh lặp hoặc sai kích thước đều bị từ chối (422) và project giữ nguyên.
- Nhãn không đổi (cùng ảnh, cùng tên, cùng hình trong sai số 0,5 px) giữ nguyên quyết định review cũ. Nhãn đã sửa hoặc mới thì chưa có quyết định.
- Vùng thiếu đã được vẽ nhãn (IoU ≥ 0,3) thì bỏ khỏi đánh giá ảnh; vùng chưa có nhãn vẫn còn.
- Chỉ dataset ảnh rời; dataset video chưa xuất/nhận theo cách này.

## File gửi đi

- `errors`: mọi annotation có quyết định `ERROR` (cả case rủi ro lẫn nhãn được review trong "Tất cả nhãn"), kèm vị trí, loại lỗi, giá trị sửa, ghi chú, lý do cảnh báo.
- `missing`: mọi vùng thiếu đã lưu ở trang Kiểm tra theo ảnh.
- Quyết định `CORRECT`, `UNSURE` và case chưa kiểm tra không có trong file.
- File là ảnh chụp tại lúc gửi; nếu dataset được import lại sau đó, trang báo "file là của bản dataset trước".

## Database (migration 007, chưa chạy trên DB thật)

`server/db/migrations/007_review_handoff.sql` tạo `project_handoffs`: mỗi project tối đa một dòng (`project_id` là khoá chính), gồm `status` (`SENT`/`RETURNED`), `returned_by_name`, `returned_at`, `result` (JSON so sánh), `dataset_fingerprint`, `sent_by`, `sent_by_name`, `recipients` (JSON `[{id, username}]`), `note`, `report` (JSON), `sent_at`. Xoá project thì dòng này bị xoá theo.

Khi DB chưa có bảng này: project vẫn chạy bình thường như chưa gửi; bấm gửi nhận 503 "Chạy npm run db:migrate".

## API

| Route                                                                 | Ai                                   | Kết quả                                                                  |
| --------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `GET /api/projects/:id`, `/dashboard`                                 | Thành viên, Leader                   | Thêm `handoff` (`null` nếu chưa gửi): người gửi, người nhận, `for_me`    |
| `POST /api/projects/:id/handoff` `{ annotator_ids[], note? }`         | Leader, Reviewer                     | 201. Đã gửi rồi: 409. Người nhận không phải Annotator của project: 400   |
| `GET /api/projects/:id/handoff`                                       | Leader, Reviewer, Annotator được gửi | `{ handoff, report }`. Chưa gửi: 404. Annotator không được gửi: 403      |
| `DELETE /api/projects/:id/handoff`                                    | Leader                               | Mở lại review                                                            |
| `GET /api/projects/:id/handoff/dataset.zip`                           | Như `GET …/handoff`                  | `.zip` cho CVAT: `annotations.xml` + `images/`                           |
| `POST /api/projects/:id/handoff/return` `{ files: [{ name, text }] }` | Annotator được gửi, Leader           | Nhận bản đã sửa, trả kết quả so sánh. Không đang chờ: 409. File sai: 422 |
| `POST/PUT …/cases/:id/review`, `PUT …/frames/:id/review`              | —                                    | 423 khi đang chờ Annotator (SENT)                                        |

Code: `server/projects/handoff.ts` (`buildReport`, `ProjectHandoffs`), route trong `server/projects/http.ts`; giao diện `src/features/handoff/CompleteReviewButton.tsx`, `src/pages/FixesPage.tsx`. Test không cần DB: `tests/handoff.test.ts`.

## Chưa làm

- Gọi API CVAT trực tiếp: hiện đi qua file .zip tải về và một file gửi lại.
- Annotator chưa đánh dấu được "đã sửa" từng lỗi; chưa có thông báo (email/chuông) khi được gửi.
- `returnFixed` (đổi dataset, chép quyết định) chưa được chạy trên MySQL thật; phần đọc file và so sánh có test trong `tests/handoff.test.ts`.
- File .zip chưa được thử nhập vào một CVAT thật.
