# Project 3D (LiDAR + cuboid)

Thay đổi ngày 2026-10-12. Bước đầu của phần 3D: **tạo project 3D** từ một segment Waymo Open
Dataset v2, chuyển thành point cloud và lưu vào kho chung; rồi **trang project 3D** và **viewer
point cloud** để xem từng frame cùng cuboid; rồi **chọn cuboid và review 3D**. Chấm rủi ro 3D
chưa có; xem mục [Chưa làm](#chưa-làm).

Project 3D nằm cạnh project 2D nhưng tách hẳn: bảng riêng (`*_3d`), route riêng
(`/api/projects3d`), thư mục lưu trữ riêng (`Project3D/`). Chỉ bảng `users` dùng chung.

## Luồng

1. Leader mở **Dự án → + Project 3D mới** (`/projects/new-3d`).
2. Nhập tên, mô tả, rồi chọn dữ liệu của **một segment**:
   - **Tệp rời**: chọn các tệp `.parquet` cùng lúc, hoặc chọn thư mục chứa chúng.
   - **Tệp nén (.zip)**: trình duyệt mở tệp nén và chỉ gửi các tệp parquet bên trong.
3. Form xếp từng tệp vào component của nó và cho thấy còn thiếu gì trước khi gửi.
4. Bấm **Tạo project 3D**: tạo dòng trong `projects_3d`, tải tệp lên, backend chuyển đổi rồi lưu.
5. Xong thì mở trang project 3D (`/projects3d/:id`). Project cũng hiện ở mục **Project 3D** của
   trang Dự án với số frame, cuboid, đối tượng.

| Component           | Bắt buộc | Chứa gì                                                             |
| ------------------- | -------- | ------------------------------------------------------------------- |
| `lidar`             | Có       | Range image của 5 lidar                                             |
| `lidar_calibration` | Có       | Vị trí gắn và góc nghiêng các tia của từng lidar                    |
| `vehicle_pose`      | Có       | Vị trí của xe ở từng frame                                          |
| `lidar_box`         | Có       | Cuboid 3D đã gán nhãn                                               |
| `lidar_pose`        | Không    | Pose từng điểm của lidar TOP; thiếu thì không bù được chuyển động   |
| `camera_image`      | Không    | Ảnh JPEG của các camera ở từng frame; xem [Ảnh camera](#ảnh-camera) |

Một tệp được nhận diện theo thư mục chứa nó (`lidar_box/x.parquet`), nếu không thì theo tên Waymo
đặt (`validation_lidar_box_<segment>.parquet`). Tệp parquet của component khác (camera,
segmentation…) bị bỏ qua. Các tệp mang tên của nhiều segment khác nhau thì form từ chối.

Giới hạn: tổng 2 GB, mỗi component tối đa 4 tệp. Segment mẫu (198 frame) là 151 MB parquet lidar
và 329 MB `camera_image`. Ở nguồn Tệp nén chọn được nhiều tệp `.zip` cùng lúc (ví dụ một tệp
lidar, một tệp ảnh camera).

## Ảnh camera

Ảnh camera là phần phụ trợ, không bắt buộc: reviewer nhìn ảnh để đối chiếu với cuboid. Ảnh được
giữ nguyên là tệp JPEG từ lúc tải lên tới lúc hiển thị, không giải mã hay nén lại ở khâu nào.

Hai cách đưa ảnh lên (chỉ dùng một trong hai, gửi cả hai thì bị từ chối):

- **Component `camera_image`** của Waymo. Exporter chép khối byte JPEG của từng dòng ra tệp;
  khớp frame theo `key.frame_timestamp_micros`.
- **Ảnh JPEG rời** đặt tên `<camera>/<frame>.jpg`, chọn bằng ô "Thư mục ảnh camera rời" hoặc để
  trong tệp `.zip`. `<frame>` là timestamp của frame, hoặc số thứ tự frame tính từ 0. Ảnh có số
  không khớp frame nào bị bỏ qua và được đếm trong `metadata.unmatched_images`; không ảnh nào
  khớp thì import bị từ chối. Tối đa 4000 ảnh, mỗi ảnh 20 MB.

Lưu trữ:

```
/Project3D/<project_id>/<uuid>/cameras/<CAMERA>/<timestamp>.jpg   ảnh gốc
/Project3D/<project_id>/<uuid>/sheets/<timestamp>.jpg             ảnh ghép nhỏ của frame
```

**Ảnh ghép** là thứ làm việc tải nhanh: mỗi frame một JPEG chứa mọi camera của frame đó, mỗi
camera một ô 240×160 xếp cạnh nhau theo thứ tự trái sang phải (SIDE_LEFT, FRONT_LEFT, FRONT,
FRONT_RIGHT, SIDE_RIGHT, rồi camera tên khác). Viewer chỉ tải một ảnh ghép cho mỗi frame; ảnh gốc
chỉ được tải khi mở một camera. `scene.json` thêm `cameras` (tên, theo thứ tự hiển thị) và
`frames[].cameras` (camera có ảnh ở frame đó).

Trong viewer: dải **Ảnh camera** nằm dưới vùng point cloud, các ô chia đều bề ngang (tối đa
240×160, cỡ gốc của ảnh ghép), đổi theo frame và tải trước ảnh ghép
của hai frame kế tiếp. Bấm một ô để mở ảnh gốc phủ lên point cloud; ‹ › đổi camera, ✕ hoặc Esc để
đóng. Ảnh đang mở đổi theo frame khi bước hoặc phát. Nút "Ẩn ảnh camera" cất cả dải đi.

Đo trên segment mẫu (990 ảnh, 5 camera, ảnh 1920×1280 và 1920×886): tách ảnh từ parquet thêm
khoảng 1,3 giây vào bước chuyển đổi; tạo 198 ảnh ghép mất 3,1 giây; ảnh gốc 316 MB, ảnh ghép
tổng 5,1 MB (khoảng 26 KB mỗi frame). Thời gian đẩy lên Dropbox chưa đo.

Chưa có: chiếu cuboid 3D lên ảnh (cần `camera_calibration`), review box 2D (`camera_box`), link
tạm để trình duyệt tải thẳng từ Dropbox.

## Trang project 3D

`/projects3d/:id` (`src/pages/Project3DPage.tsx`), mở từ tên project ở trang Dự án.

- `READY`: nút **Mở viewer point cloud →**, bốn ô số liệu (frame và thời lượng, cuboid và số đối
  tượng được theo dõi, số điểm, các lidar), số cuboid theo loại, và thông tin dữ liệu (segment,
  có bù chuyển động không, dung lượng lưu, người tạo, vai trò của người xem).
- Đang import: dòng trạng thái, tự hỏi lại backend mỗi giây.
- `CREATED` / `FAILED`: lý do lỗi và form chọn lại tệp của segment (chỉ Leader).
- Khối **thành viên** như project 2D (`ProjectPeople`): Leader thêm Reviewer / Annotator bằng tên đăng nhập hoặc mã mời, đổi vai trò, xoá; Reviewer thêm được Annotator. Quy tắc giống `docs/project-roles.md`, dữ liệu nằm ở `project_members_3d` và `project_invites_3d`.
- Nút **Mở review 3D** hiện vòng xoay và "Đang mở review 3D…" trong lúc mã của viewer được tải về.
- Leader tạo project có nút xoá project; leader khác xem và quản lý được nhưng không xoá được.

## Viewer point cloud

`/projects3d/:id/viewer` (`src/pages/Viewer3DPage.tsx`), chiếm trọn màn hình. Phần vẽ là
`src/features/projects3d/viewer/engine.ts`, chuyển từ `src/main.js` của repo `waymo-viewer` sang
một lớp TypeScript không phụ thuộc React; bảng điều khiển `lil-gui` được thay bằng bảng bên phải
viết bằng React. three.js chỉ được tải khi mở trang này.

| Nhóm điều khiển | Dữ liệu             | Làm gì                                                                              |
| --------------- | ------------------- | ----------------------------------------------------------------------------------- |
| Hệ toạ độ       | `vehicle_pose`      | Xe đứng yên hoặc Toàn cục; camera bám theo xe; quỹ đạo xe; đặt lại góc nhìn         |
| Point cloud     | `lidar`             | Màu theo độ cao, cường độ, khoảng cách hoặc theo lidar; cỡ điểm; bật/tắt từng lidar |
| Bù chuyển động  | `lidar_pose`        | Bật/tắt bù chuyển động của lidar TOP; khoá khi segment không có `lidar_pose`        |
| Cuboid          | `lidar_box`         | Hiện/ẩn cuboid; bật/tắt từng loại, kèm số cuboid loại đó trong frame                |
| Cảm biến        | `lidar_calibration` | Hiện vị trí và tên từng lidar trên xe                                               |

- Thanh dưới: phát / dừng, lùi và tới một frame, thanh kéo, `frame/tổng · giây`, tốc độ
  0,25×–2× (1× là 10 frame mỗi giây). Phím cách phát / dừng; ← → từng frame.
- Góc trên trái: số điểm đang vẽ, số cuboid đang hiện, tốc độ xe, số cuboid theo loại.
- Phát chỉ xin frame kế tiếp sau khi frame trước đã lên hình, nên mạng chậm thì phát chậm lại chứ
  không bỏ frame. Hai frame kế tiếp được tải trước; 40 frame gần nhất giữ trong tab.
- Hệ toạ độ giữ z hướng lên (`camera.up`), không xoay dữ liệu. Đổi hệ toạ độ chỉ đặt lại ma trận
  của hai nhóm (điểm và cuboid theo hệ xe, quỹ đạo theo hệ toàn cục), không tính lại điểm.
- Màu cuboid: VEHICLE xanh dương, PEDESTRIAN đỏ, CYCLIST xanh lục, SIGN vàng
  (`viewer/colors.ts`).

## Chọn cuboid và review 3D

Trang viewer là chỗ làm việc review:

- **Header mỏng** (khoảng 29px): logo, nút **← tên project** để ra khỏi chỗ làm việc và về trang
  project, tên segment, `Frame 0003 / 0198`, tài khoản, đổi ngôn ngữ và giao diện.
- **Trái, point cloud** (chiếm phần còn lại của chiều cao): bấm vào một cuboid để chọn, bấm chỗ
  trống hoặc Esc để bỏ chọn. Cuboid đang chọn được vẽ trắng, tô mờ, kèm tên. Bốn nút góc nhìn
  Trên / Mặt trước / Mặt bên / Phối cảnh nhìn vào cuboid đang chọn, hoặc vào xe khi chưa chọn gì.
  Chuyển frame bằng thanh phát ở đáy vùng vẽ hoặc phím ← →.
- **Phải**, hai thẻ **Review** và **Hiển thị** (các điều khiển ở mục trên, thêm "Tên cuboid" và
  "Màu cuboid: Theo loại / Theo kết quả review").

Dải ảnh camera và bảng bên phải ẩn/hiện được bằng hai nút **Ảnh camera** và **Bảng review**
trên header (mỗi thanh cũng có nút Ẩn của riêng nó). Bấm một cuboid khi bảng đang ẩn thì bảng
hiện lại.

Không có danh sách frame: tiến độ review chỉ thấy cho frame đang xem ("3/24 đã review" ở thẻ
Review) và tổng của cả project ở trang project.

Thẻ Review:

- **Cuboid trong frame**: danh sách bấm được (loại, 5 ký tự đầu của ID, số điểm, dấu ✓ / ! / ?).
- **Chi tiết cuboid**: Track ID, loại, kích thước, vị trí, khoảng cách tới xe, hướng, số điểm
  trong box (dưới 5 điểm thì tô vàng), tốc độ, và số frame đối tượng xuất hiện.
- **Quyết định**: Correct / Annotation Error / Unsure như phần 2D (phím 1, 2, 3; Ctrl+Enter là
  Lưu & tiếp). Lỗi thì chọn loại: Class (chọn nhãn đúng), Cuboid, Tracking, Extra Object, Other.
  Ghi chú tối đa 500 ký tự. **Lưu & tiếp** chuyển sang cuboid chưa review kế tiếp của frame.
- **Áp dụng cho cả N frame của đối tượng này**: lưu cùng quyết định cho cuboid của đối tượng đó
  ở mọi frame, ghi đè quyết định đã có.

Đối tượng được chọn theo ID, nên khi chuyển frame hoặc phát, cuboid của nó ở frame mới vẫn được
chọn; frame không có nó thì bảng báo vậy.

Một quyết định gắn với **một cuboid trong một frame**, tên là `<timestamp>:<object id>`. Tốc độ
của đối tượng được tính trong trình duyệt từ vị trí cuboid ở hai frame kề, đổi sang hệ toàn cục
bằng pose của xe. Chưa có điểm rủi ro: bảng không hiện gì về rủi ro.

Lưu trong DB theo đúng cấu trúc 2D: `risk_cases_3d` giữ tên cuboid (`annotation_reference`,
`frame_reference` là timestamp, `media_reference` là segment, `score` 0, `is_suspicious` 0),
`review_decisions_3d` giữ quyết định. Dòng `risk_cases_3d` được tạo khi cuboid được review lần
đầu. Lưu cho cả đối tượng là ba câu lệnh trong một transaction, dù đối tượng có bao nhiêu frame.

## Cờ lỗi và điều khiển bằng cử chỉ

**Cờ lỗi.** Mỗi cuboid có quyết định `ERROR` ở frame đang xem mang một lá cờ `⚑ n` ngay trên nó
trong point cloud (`viewer/flags.ts`).

- **Màu là loại lỗi**: Class cam, Cuboid đỏ, Tracking tím, Extra Object hồng, Other xanh dương.
- **Số** đánh từ 1 trong từng frame, theo thứ tự ID của đối tượng, nên cùng một nhóm đối tượng bị
  gắn cờ thì giữ nguyên số khi sang frame khác. Lưu hay sửa một quyết định thì cờ cập nhật ngay.
- Danh sách "Cuboid trong frame" hiện cùng lá cờ đó ở từng dòng, kèm chú thích màu.
- Chọn một cuboid có cờ (bấm, hoặc gọi bằng cử chỉ) thì giữa trên vùng vẽ hiện **thẻ thông tin
  cờ**: số cờ, loại cuboid, ID, loại lỗi, nhãn đúng đề xuất và ghi chú của reviewer.

**Webcam.** Nút **Webcam** trên header bật điều khiển bằng cử chỉ tay (`viewer/HandControl.tsx`),
dùng `@mediapipe/tasks-vision` (HandLandmarker, tối đa hai bàn tay). MediaPipe chạy trong trình
duyệt: hình webcam không rời máy. Thư viện, tệp wasm (13 MB, đóng gói cùng app) và model chỉ được
tải khi bật. Ô nhỏ góc dưới trái hiện hình webcam (lật gương), khung xương bàn tay, cử chỉ đang
đọc được và thanh "giữ" chạy tới khi cử chỉ có hiệu lực.

| Cử chỉ (một bàn tay)                 | Việc                                          |
| ------------------------------------ | --------------------------------------------- |
| Giơ ngón trỏ, đưa sang trái / phải   | Kéo khung sang trái / phải                    |
| Giơ ngón trỏ, đưa lên / xuống        | Kéo khung lên / xuống                         |
| Chụm các đầu ngón rồi bung ra        | Phóng to                                      |
| Từ bàn tay mở, chụm các đầu ngón lại | Thu nhỏ                                       |
| Giơ 1–9 ngón, giữ yên 0,9 giây       | Chọn cuboid mang cờ số đó, hiện thẻ thông tin |

- Kéo khung và thu phóng cần đúng một bàn tay trong hình; có hai bàn tay thì chỉ đếm ngón (cộng
  cả hai, để gọi cờ 6–9).
- **Thu phóng** đọc độ xoè của bàn tay: khoảng cách trung bình từ đầu ngón cái tới bốn đầu ngón
  kia, tính theo cỡ bàn tay (chụm khoảng 0,2; xoè khoảng 1). Bàn tay chỉ thu phóng trong 1,2 giây
  sau khi vừa ở thế chụm hoặc xoè đủ năm ngón, nên giơ vài ngón từ nắm tay để gọi cờ không làm
  thu phóng. **Nắm tay không tính là chụm**: phóng to phải bắt đầu từ thế chụm đầu ngón.
- **Ngắt lệnh**: thu phóng xong, giữ yên bàn tay 1 giây (`GESTURE.breakMs`) thì lệnh thu phóng
  được ngắt; ô webcam hiện thanh chạy "Giữ yên 1 giây để ngắt lệnh" rồi "Đã ngắt lệnh thu
  phóng". Sau đó nắm tay lại, đổi sang chỉ ngón hay hạ tay đều không thu phóng ngược. Lệnh chỉ
  được nhận lại khi bàn tay **mới** vào thế chụm hoặc xoè năm ngón, và động tác đưa tay về thế đó
  không tính là thu phóng. Dừng ngắn hơn 1 giây thì chưa ngắt: nắm lại ngay vẫn thu nhỏ.
- **Ngón trỏ đứng yên** không kéo khung; đứng yên đủ lâu (hết 1,2 giây nghỉ rồi giữ 0,9 giây) thì
  là số 1 và gọi cờ 1. Tương tự, bàn tay để xoè sau khi phóng to chỉ thành "số 5" sau khoảng
  2 giây đứng yên.
- **Chống rung và chập chờn** (mọi ngưỡng ở `GESTURE` trong `viewer/gestures.ts`): toạ độ đầu
  ngón và độ xoè đi qua bộ lọc One Euro; chuyển động chậm hơn vùng chết thì bỏ qua; thế chụm vào
  ở 0,42 và thoát ở 0,55; thế chỉ ngón phải giữ 0,1 giây mới bắt đầu và được mất tối đa 0,2 giây.
- Giơ số không có cờ thì hiện "Frame này không có cờ số n".
- Không có cử chỉ nào lưu quyết định review, và không còn cử chỉ xoay, chuyển frame hay phát:
  các việc đó làm bằng chuột và phím.
- **Ghi bàn tay**: trong ô webcam, chọn nhãn (Phóng to / Thu nhỏ / Kéo khung / Không làm gì), bấm
  **● Ghi**, làm cử chỉ, bấm **■ Dừng & lưu**: trình duyệt tải về `hands-<nhãn>-<thời điểm>.json`
  chứa 21 điểm của từng bàn tay ở từng khung hình (tối đa 60 giây). Chép tệp vào
  `web/tests/fixtures/gestures/` thì `tests/gestures.test.ts` phát lại nó và kiểm tra kết quả
  khớp nhãn: đó là cách chỉnh ngưỡng trên bàn tay thật mà không phải thử lại bằng tay.
- Trình duyệt chỉ cho mở webcam ở `localhost` / `127.0.0.1` hoặc HTTPS.
- Model bàn tay (7,8 MB): dùng `public/models/hand_landmarker.task` nếu có, không thì tải từ
  `storage.googleapis.com/mediapipe-models/…`, tức cần mạng lần đầu bật.

Chưa thử với bàn tay thật: máy kiểm tra chỉ có webcam giả, nên độ nhạy và các ngưỡng cần chỉnh
theo thực tế.

## Backend làm gì khi import

| Trạng thái    | Việc                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `UPLOADING`   | Nhận tệp vào `storage/.tmp/<uuid>/<component>/`, kiểm tra đầu và cuối tệp là `PAR1`             |
| `NORMALIZING` | Chạy `server/projects3d/export_waymo.py`, xếp ảnh camera rời, tạo ảnh ghép, đếm frame và cuboid |
| `ANALYZING`   | Đẩy `scene.json` và các tệp `frames/*.bin` lên kho chung (chỉ khi bật Dropbox)                  |
| `READY`       | Ghi `dataset_revisions_3d`, cập nhật `projects_3d`; xoá tệp parquet và bản trên đĩa             |
| `FAILED`      | Ghi lý do vào `error_message`; project được giữ lại để chọn tệp và thử lại                      |

Tệp parquet gốc chỉ là đầu vào của bước chuyển đổi và **không được lưu lại**.
`GET …/import-status` trả thêm `progress` (`{ step, done, total }`, với `step` là `export`,
`cameras`, `sheets` hoặc `publish`) khi
chính backend đó đang import; backend khác chỉ thấy trạng thái.

Đo trên segment mẫu: chuyển đổi 12 giây, ra 534 MB (198 tệp `.bin`, mỗi tệp khoảng 2,7 MB).
Thời gian đẩy 534 MB lên Dropbox **chưa đo**.

## Lưu trữ

Thư mục chính của mọi project 3D là `Project3D`, cả trên Dropbox (trong App folder) lẫn trong
`storage/` khi không bật Dropbox:

```
/Project3D/<project_id>/<uuid>/scene.json               lidar, pose và cuboid của từng frame
/Project3D/<project_id>/<uuid>/risk.json                báo cáo của Risk Engine 3D
/Project3D/<project_id>/<uuid>/frames/<timestamp>.bin   point cloud của một frame
```

`projects_3d.storage_key` giữ `Project3D/<project_id>/<uuid>`. Khi bật Dropbox thì
`dataset_path = NULL` và backend không giữ gì trên đĩa; không bật thì `dataset_path` trỏ tới
`scene.json` trên máy đã import. Xoá project thì xoá cả `Project3D/<project_id>`.

Khuôn dạng `scene.json` và `.bin` là hợp đồng với viewer three.js (repo `waymo-viewer`): ma trận
4x4 là 16 số row-major; mỗi điểm 22 byte little-endian (`float32 [x, y, z, intensity]` cho N điểm,
rồi `int16 [dx, dy, dz]` cho N điểm, tính bằng mm); toạ độ theo hệ xe, z hướng lên.

## Database (migration 008, chưa chạy trên DB thật)

`server/db/migrations/008_projects_3d.sql`, viết lại từ file `db 3D update`: tạo 8 bảng bằng
`CREATE TABLE … LIKE` rồi thêm khoá ngoại trỏ vào các bảng 3D.

`dataset_revisions_3d`, `projects_3d`, `risk_cases_3d`, `review_decisions_3d`,
`frame_reviews_3d`, `project_members_3d`, `project_invites_3d`, `project_handoffs_3d`.

- Không chép, sửa hay xoá dòng nào của bảng 2D.
- `projects_3d.storage_provider` mặc định `dropbox`. Project vừa tạo, chưa import, được ghi
  `local` cho tới khi có tệp trên kho chung.
- Cần migration 007 chạy trước (`project_handoffs` phải tồn tại); `npm run db:migrate` chạy theo
  thứ tự.
- Các câu `ALTER TABLE` không chạy lại được. Nếu migration bị ngắt giữa chừng, chạy tay phần còn
  lại rồi thêm dòng `008_projects_3d.sql` vào `schema_migrations`.
- So với file gốc: bỏ `SHOW TABLES` và câu `SELECT` kiểm tra cuối file (câu đó thiếu một dấu phẩy
  giữa hai dòng tên bảng), thêm `IF NOT EXISTS`.

Bước này mới ghi `projects_3d` và `dataset_revisions_3d` (`schema_version` `3d-1.0.0`,
`engine_version` `none` vì chưa có engine chấm 3D). `projects_3d.metadata` giữ: `segment`,
`total_frames`, `total_boxes`, `total_points`, `boxes_by_type`, `tracked_objects`, `lasers`,
`duration_seconds`, `motion_compensated`, `stored_bytes`. Review ghi thêm `risk_cases_3d` và
`review_decisions_3d`; bốn bảng còn lại chưa có code ghi.

Khi DB chưa có các bảng này: phần 2D chạy bình thường, mục Project 3D báo "Chạy npm run
db:migrate" (503).

## Cấu hình

Bước chuyển đổi cần một Python có `numpy` và `pyarrow` (`server/projects3d/requirements.txt`).
Mặc định là `<smartreview>/.venv/bin/python`: `./setup.sh` tạo venv đó và cài hai gói, nên máy mới
không phải cấu hình gì. Máy muốn dùng Python khác thì đặt trong `web/.env`; `./setup.sh` vẫn cài
hai gói vào `.venv` và nhắc rằng `web/.env` đang trỏ ra ngoài repo:

```
SMARTREVIEW_3D_PYTHON=/absolute/path/to/python
```

Thiếu Python hoặc thiếu hai gói đó thì import trả 503 kèm hướng dẫn, project chuyển `FAILED`.

## API

| Route                                            | Ai                 | Kết quả                                                      |
| ------------------------------------------------ | ------------------ | ------------------------------------------------------------ |
| `GET /api/projects3d`                            | Mọi tài khoản      | Leader: mọi project 3D. Member: project đã được thêm vào     |
| `POST /api/projects3d` `{ name, description? }`  | Leader             | 201, trạng thái `CREATED`, `format` `waymo-v2`               |
| `GET /api/projects3d/:id`, `/import-status`      | Thành viên, Leader | Project, `my_role`, `progress`                               |
| `POST /api/projects3d/:id/import`                | Leader             | Multipart, mỗi field mang tên component của tệp. 201 `READY` |
| `DELETE /api/projects3d/:id`                     | Leader tạo project | Xoá dòng DB và thư mục `Project3D/<id>`; leader khác: 403    |
| `GET/POST /api/projects3d/:id/members`           | Như 2D             | Danh sách thành viên; thêm thẳng bằng tên đăng nhập          |
| `GET …/members/candidates`                       | Leader, Reviewer   | Tài khoản thành viên chưa ở trong project                    |
| `PATCH/DELETE …/members/:userId`                 | Leader             | Đổi vai trò, xoá khỏi project                                |
| `GET/POST /api/projects3d/:id/invites`           | Leader             | Hai mã mời (reviewer, annotator); POST tạo mã mới            |
| `POST /api/projects3d/join` `{ code }`           | Member             | Vào project 3D bằng mã mời                                   |
| `GET /api/projects3d/:id/scene`                  | Thành viên, Leader | `scene.json` của project `READY`                             |
| `GET /api/projects3d/:id/risk`                   | Thành viên, Leader | Báo cáo của Risk Engine 3D ([risk-3d.md](risk-3d.md))        |
| `GET /api/projects3d/:id/frames/<timestamp>.bin` | Thành viên, Leader | Point cloud của một frame; không có thì 404                  |
| `GET …/sheets/<timestamp>.jpg`                   | Thành viên, Leader | Ảnh ghép các camera của frame                                |
| `GET …/cameras/<CAMERA>/<timestamp>.jpg`         | Thành viên, Leader | Ảnh gốc của một camera ở một frame                           |

| `GET /api/projects3d/:id/reviews` | Thành viên, Leader | `{ dataset_revision, reviews }`, khoá là `<timestamp>:<object id>` |
| `POST/PUT …/boxes/<timestamp>/<object id>/review` | Thành viên, Leader | Tạo (201) hoặc sửa một quyết định; PUT cần `version` đang có |
| `PUT …/tracks/<object id>/review` | Thành viên, Leader | Lưu cùng quyết định cho mọi frame của đối tượng, ghi đè |

Body review giống 2D: `{ dataset_revision, decision, error_type, corrected_value, note,
version? }`. Sai revision hoặc sai version: 409; cuboid không có trong scene: 404;
`MISSING_OBJECT`: 400. `GET /api/projects3d/:id` trả thêm `review_summary` (`reviewed`,
`correct`, `errors`, `unsure`) khi project `READY`.

Hai route đọc lấy tệp từ Dropbox (hoặc từ đĩa của máy đã import). Tệp của project `READY` không
đổi, nên khi địa chỉ có `?dataset=<dataset_id>` thì trình duyệt được giữ lại
(`Cache-Control: private, immutable`). Backend giữ tối đa 128 MB tệp vừa đọc trong RAM.

Lỗi: 400 thiếu component, field lạ hoặc tệp không phải `.parquet`; 409 project đang import hoặc
đã `READY`; 413 quá 1 GB; 422 tệp không phải parquet hoặc exporter không đọc được; 503 thiếu
Python hoặc chưa migrate.

## Mã nguồn

- `shared/waymo.ts`: danh sách component, nhận diện tệp (`waymoComponent`, `waymoSegment`), tóm
  tắt scene (`summarizeScene`). Form và server dùng chung.
- `server/projects3d/upload.ts`: nhận multipart (`receiveSegment`).
- `server/projects3d/service.ts`: `Project3DService` (`create`, `import`, `export`, `publish`,
  `remove`, `role`).
- `server/projects3d/http.ts`: route; nối vào `server/app.ts` và `server/index.ts`.
- `server/projects3d/export_waymo.py`: bản sao exporter của `waymo-viewer`.
- `src/features/projects3d/Import3DForm.tsx`, `Projects3DList.tsx`, `useProject3D.ts`,
  `src/pages/NewProject3DPage.tsx`, `Project3DPage.tsx`, `Viewer3DPage.tsx`.
- `src/features/projects3d/viewer/engine.ts` (three.js: vẽ, chọn cuboid, góc nhìn), `colors.ts`,
  `ObjectPanel.tsx` (chi tiết và form review), `DisplayPanel.tsx`,
  `controls.tsx`, `flags.ts`, `gestures.ts`, `HandControl.tsx`. Thêm phụ thuộc `three` và
  `@mediapipe/tasks-vision`.
- `server/projects3d/reviews.ts`: `Review3DStore`.
- `server/projects3d/cameras.ts`: xếp ảnh rời (`placeShots`), tạo ảnh ghép (`buildSheets`);
  `src/features/projects3d/viewer/Cameras.tsx`: dải ảnh và ảnh gốc.
- `tests/projects3d.test.ts`: không cần MySQL hay Python (pool trong bộ nhớ, exporter giả).

## Chưa làm

- Hàng đợi "case đáng nghi" trong viewer: Risk Engine 3D đã chấm lúc import và lưu báo cáo
  ([risk-3d.md](risk-3d.md)), nhưng viewer chưa dùng nó; người review vẫn tự đi qua từng frame.
- Đánh dấu đối tượng thiếu cuboid (`frame_reviews_3d`), hoàn thành và gửi cho Annotator
  (`project_handoffs_3d`), sửa cuboid ngay trong viewer, ảnh camera.
- Loại lỗi dùng lại ENUM của 2D, nên lỗi cuboid được lưu trong DB là `BBOX`.
- Viewer mới được xem bằng Chromium vẽ phần mềm với 12 frame và API giả lập; chưa đo tốc độ phát
  khi mỗi frame (khoảng 2,7 MB) được đọc qua Dropbox.
- Chưa chạy trên MySQL và Dropbox thật: migration 008, các câu lệnh của `Project3DService`, hai
  route đọc và
  việc đẩy 534 MB lên Dropbox mới được kiểm bằng test với pool giả và kho giả.
- Import chạy trong chính request tải lên; segment lớn hoặc mạng chậm có thể làm trình duyệt mất
  kết nối trước khi xong (backend vẫn chạy tiếp, xem trạng thái ở trang Dự án).
- Chỉ nhận Waymo Open Dataset v2. Chưa nhận KITTI, nuScenes hay tệp `.pcd` rời.
- Docker: image chưa có Python với `numpy`, `pyarrow`.
