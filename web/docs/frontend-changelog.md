# Lịch sử thay đổi frontend

Ghi lại mỗi lần sửa xong một chức năng hoặc thay đổi lớn ở frontend. Mục mới nhất ở trên cùng.

## 2026-10-13 · Quét nhãn bằng ảnh: popup sau khi upload, kết quả vào trang Review

- **Popup "Chọn cách quét nhãn"** (`src/features/verify/ScanChoice.tsx`) mở trong luồng tạo project mới, ngay khi upload xong, thay cho việc chuyển thẳng sang project và thay popup "Đã nhận dữ liệu" cũ. Bấm nút trong popup mới sang trang project. Project đã có sẵn không có popup này.
- **Ba ô**: Risk Engine (luôn bật, khoá: nó chạy lúc import như trước giờ), SigLIP 2 (tích sẵn), Qwen2.5-VL (không tích; khoá khi SigLIP 2 bỏ tích). Nút là "Quét và vào project", hoặc "Vào project" khi không chọn mô hình ảnh nào.
- **Quét một lần**: không có nút hay trang kết quả riêng. Nút "Kết quả quét nhãn →" và trang `/projects/:id/label-verify` làm trước đó trong ngày đã gỡ.
- **Kết quả nằm ở trang Review**: box bị phát hiện sai vào hàng đợi mà nút "Bắt đầu kiểm tra" mở; trong khung "Why flagged" có thêm tín hiệu `verifier.wrong_label` với số điểm của nó. Các số Risk Cases, Remaining ở trang project tính cả các case này.
- **Dòng trạng thái ở trang project** (`ScanStatus.tsx`): đang chờ, đang quét kèm tiến độ, đã quét (số khung vào hàng đợi), hoặc lỗi kèm nút "Thử lại" cho Leader. Quét xong thì các số trên trang tự tải lại.
- Kiểm tra: dựng luồng tạo project với API giả, upload `fixtures/upload`, thấy popup hiện trước khi rời trang và yêu cầu quét gửi đúng lựa chọn. `tests/browser/projects.spec.ts` đã sửa để bấm qua popup; chưa chạy được vì database test không vào được.
- File: `src/features/verify/{ScanChoice,ScanStatus}.tsx`, `src/features/verify/useLabelVerify.ts`, `src/features/projects/ImportForm.tsx`, `src/pages/ProjectDashboardPage.tsx`, `src/types.ts`, `src/lib/i18n.en.ts`; backend `server/verify/{service,queue}.ts`, `server/reviews/store.ts`, `server/projects/{http,service}.ts`. Chi tiết: `docs/label-verifier.md`.

## 2026-10-13 · Import 2D: giới hạn 100 ảnh mỗi project

- **Giới hạn mới**: tối đa 100 ảnh mỗi lần import (trước là 1000); tổng upload vẫn 200 MB, mỗi ảnh 20 MB, annotation 10 MB. Định dạng nhiều tệp nhãn (VOC, YOLO…) nhận tối đa 110 tệp nhãn (trước là 1010).
- **Kiểm tra ở hai nơi**: form báo "Vượt giới hạn…" trước khi gửi; server từ chối ảnh thứ 101 với 413 "Tối đa 100 ảnh mỗi project."
- Project đã import trước đó không bị ảnh hưởng. Project 3D và AI Check giữ giới hạn riêng.
- File: `server/projects/upload.ts`, `src/features/projects/{dataset.ts,ImportForm.tsx}`, `src/lib/i18n.{vi,en}.ts`, `README.md`, `docs/projects-import.md`.

## 2026-10-13 · Import 2D: tải lên chạy nền, thử lại từ chỗ dở

- **Vấn đề**: import dataset nặng chạy gần 5 phút rồi báo "Không thể xử lý import". Log backend: `Request failed: TypeError`, tức một lệnh gọi Dropbox bị đứt mạng; code không gọi lại nên cả import bị hủy và phải chọn lại file.
- **Dropbox**: lệnh gọi bị đứt hoặc treo được gọi lại tối đa 4 lần.
- **MySQL**: risk case ghi theo lô 500 dòng một câu lệnh, thay cho hai câu lệnh mỗi case.
- **Chạy nền**: request import trả lời ngay khi file đã nhận và kiểm tra xong. Trang tạo project hiện hộp thoại "Đã nhận dữ liệu" (Về trang Projects / Xem project). Trang project hiện tiến độ "Đang đưa lên kho lưu trữ: n/N file", rồi "Đang lưu risk case", và tự sang dashboard khi Ready.
- **Thử lại**: lỗi ở nửa chạy nền thì trang project có nút Thử lại, làm tiếp mà không chọn lại file và không gửi lại file đã lên kho. Form chọn file vẫn ở bên dưới nếu muốn import lại từ đầu.
- File: `server/projects/{service,http}.ts`, `server/reviews/store.ts`, `server/storage/dropbox.ts`, `server/index.ts`, `src/features/projects/ImportForm.tsx`, `src/pages/ProjectDashboardPage.tsx`. Chi tiết: `docs/projects-import.md`.
- Kiểm tra: typecheck và build qua; script thử `../verifier-test/scripts/import-background.test.ts` với DB và kho giả 5/5 qua; test không cần MySQL 24/24 qua. Chưa chạy với MySQL và Dropbox thật, chưa thử trên trình duyệt. Project 3D chưa có phần chạy nền này (chỉ hưởng phần gọi lại Dropbox).

## 2026-10-13 · Project 3D: chia sẻ cho Reviewer / Annotator, vòng xoay khi mở review

- **Chia sẻ như 2D**: trang project 3D có khối thành viên của project 2D. Leader thêm Reviewer / Annotator bằng tên đăng nhập hoặc mã mời, đổi vai trò, xoá; Reviewer thêm được Annotator. Ô nhập mã mời ở trang Projects nhận cả mã của project 3D (thử 2D trước, không có thì thử 3D).
- **Backend**: `ProjectMembers` nhận tên bảng, project 3D dùng `project_members_3d` / `project_invites_3d` (đã có từ migration 008, không cần migration mới). Route mới dưới `/api/projects3d/:id/members`, `/invites` và `/api/projects3d/join`.
- **Nút Mở review 3D**: hiện vòng xoay và "Đang mở review 3D…" từ lúc bấm đến khi viewer hiện ra. Trong viewer, scene, point cloud và ảnh camera vẫn được backend đọc từ Dropbox như trước, có vòng xoay riêng khi đang tải.
- Kiểm tra: typecheck qua; test không cần MySQL (`projects3d`, `handoff`) 13/13 qua; chạy thử `ProjectMembers` với DB giả, bản 3D chỉ đụng các bảng `_3d`. Chưa chạy trên MySQL thật và chưa thử trên trình duyệt bằng tài khoản Reviewer / Annotator.

## 2026-10-13 · Leader thấy project của nhau, chia hai nhóm

- **Thay đổi**: tài khoản leader thấy mọi project 2D và 3D, không chỉ project mình tạo. Trang Projects chia hai nhóm: **Project của tôi** ở trên, **Project của Leader khác** ở dưới (kèm số lượng); phần Project 3D chia tương tự. Nhóm dưới chỉ hiện khi có project. Member không đổi.
- **Quyền**: leader khác mở, review, import, chạy AI Check và quản lý thành viên được như người tạo. Nút xóa chỉ hiện với leader tạo project (và project 2D không có người tạo); backend trả 403 nếu leader khác gọi xóa.
- Project 2D không có người tạo (demo, project cũ) nằm ở nhóm dưới.
- File: `server/projects/{members,service,http}.ts`, `server/projects3d/{service,http}.ts`, `src/pages/{ProjectsPage,ProjectDashboardPage,Project3DPage}.tsx`, `src/features/projects3d/Projects3DList.tsx`.
- Kiểm tra: typecheck qua, `tests/projects3d.test.ts` 5/5 qua. Chưa chạy test dùng MySQL và chưa thử trên trình duyệt với hai tài khoản leader.

## 2026-10-12 · Webcam: giữ yên 1 giây để ngắt lệnh thu phóng

- **Vấn đề**: đang phóng to mà muốn đổi sang cử chỉ khác thì phải nắm tay hoặc co ngón lại, và động tác đó bị đọc thành thu nhỏ.
- **Sửa**: thu phóng xong, giữ yên bàn tay 1 giây thì lệnh được ngắt. Ô webcam hiện "Giữ yên 1 giây để ngắt lệnh" kèm thanh chạy, rồi "Đã ngắt lệnh thu phóng". Sau khi ngắt, nắm tay, chỉ ngón hay hạ tay đều không thu phóng; muốn thu phóng tiếp thì chụm lại hoặc xoè năm ngón lại từ đầu.
- Dừng ngắn hơn 1 giây thì chưa ngắt, nên phóng to rồi thu nhỏ liền tay vẫn như cũ.
- Kiểm tra: thêm một test với bàn tay dựng sẵn (11/11 qua): phóng to, giữ 1,2 giây, nắm lại rồi chỉ ngón thì mức thu phóng giữ nguyên trong 2%; không giữ hoặc giữ 0,5 giây thì nắm lại vẫn thu nhỏ; xoè tay lại từ đầu rồi chụm thì thu nhỏ được. Chưa thử với bàn tay thật và chưa mở lại trình duyệt sau thay đổi này.

## 2026-10-12 · Webcam: bộ cử chỉ mới, chống rung, ghi lại bàn tay

- **Bộ cử chỉ thay hẳn** theo yêu cầu: giơ ngón trỏ rồi đưa trái / phải / lên / xuống để kéo khung; chụm các đầu ngón rồi bung ra để phóng to; từ bàn tay mở chụm lại để thu nhỏ. Giữ lại: giơ 1–9 ngón đứng yên để gọi cờ. Bỏ: chụm ngón để xoay, vuốt để chuyển frame, nắm tay để phát / dừng, và cách thu phóng bằng hai tay.
- **Chống rung**: toạ độ đi qua bộ lọc One Euro, có vùng chết cho chuyển động nhỏ, và các thế tay vào / ra ở hai ngưỡng khác nhau để không chập chờn. Ngón trỏ hay bàn tay xoè vừa dùng để kéo hoặc thu phóng không bị đọc ngay thành số 1 hay số 5.
- **Ghi bàn tay**: ô webcam có ô chọn nhãn và nút **● Ghi / ■ Dừng & lưu**, tải về tệp JSON các điểm bàn tay. Đặt tệp vào `tests/fixtures/gestures/` thì test phát lại và so với nhãn.
- Ô webcam hiện đang đọc gì: "Kéo khung", "Phóng to", "Thu nhỏ", "Gọi cờ ⚑ n".
- Kiểm tra: `tests/gestures.test.ts` 10/10 với bàn tay dựng sẵn (kéo bốn hướng, đứng yên có rung, chỉ lại chỗ khác không giật, phóng to / thu nhỏ, giữ nguyên thế tay, giơ ngón từ nắm tay không thu phóng, gọi cờ, ngón trỏ nghỉ thành số 1). Trong Chromium với webcam giả: ô webcam chạy, ghi và tải được tệp JSON. **Chưa thử với bàn tay thật.**

## 2026-10-12 · Review 3D: cờ lỗi và điều khiển bằng cử chỉ qua webcam (MediaPipe)

- **Cờ lỗi**: cuboid có quyết định Lỗi ở frame đang xem mang cờ `⚑ n` trong point cloud; màu theo loại lỗi (Class cam, Cuboid đỏ, Tracking tím, Extra Object hồng, Other xanh dương), số đánh từ 1 theo ID đối tượng. Danh sách "Cuboid trong frame" hiện cùng lá cờ thay cho dấu "!", kèm chú thích màu.
- **Thẻ thông tin cờ**: chọn cuboid có cờ thì giữa trên vùng vẽ hiện số cờ, loại, ID, loại lỗi, nhãn đúng đề xuất và ghi chú.
- **Webcam**: nút mới trên header bật ô webcam ở góc dưới trái vùng vẽ (`viewer/HandControl.tsx`): hình lật gương, khung xương bàn tay, cử chỉ đang đọc được, thanh "giữ", và danh sách cử chỉ. Giơ 1–10 ngón giữ yên để gọi cờ số đó; chụm ngón để xoay / dời / thu phóng; vuốt bàn tay mở để sang frame; nắm tay để phát / dừng. Không cử chỉ nào lưu quyết định review.
- Thêm phụ thuộc `@mediapipe/tasks-vision`; nó và model chỉ tải khi bật webcam.
- Kiểm tra bằng Chromium với webcam giả ở 1440px: ba cuboid lỗi ra ba cờ đúng màu; bấm cờ 2 thì thẻ hiện "Lỗi Cuboid" kèm ghi chú; bật Webcam thì MediaPipe chạy sau khoảng 6 giây, báo "Chưa thấy cử chỉ"; tắt thì ô biến mất; sang frame không có lỗi thì không còn cờ. **Chưa thử với bàn tay thật**; luật cử chỉ mới được kiểm bằng test với bàn tay dựng sẵn.
- Chi tiết: [projects-3d.md](projects-3d.md#cờ-lỗi-và-điều-khiển-bằng-cử-chỉ).

## 2026-10-12 · Review 3D: nút ẩn/hiện dải ảnh camera và bảng bên phải

- Header của trang review 3D có hai nút, có biểu tượng và chữ, sáng màu khi thanh tương ứng đang hiện: **Ảnh camera** (dải ảnh dưới point cloud; chỉ có khi project có ảnh) và **Bảng review** (bảng Review / Hiển thị bên phải). Bấm để ẩn hoặc hiện.
- Ngay trên từng thanh cũng có nút ẩn: **Ẩn ảnh camera** ở đầu dải ảnh (thay dòng chữ nhỏ trước đây) và **Ẩn** cạnh hai thẻ Review / Hiển thị. Hiện lại bằng nút trên header.
- Ẩn cả hai thì point cloud chiếm trọn màn hình dưới header. Bấm vào một cuboid khi bảng đang ẩn thì bảng tự hiện lại để xem chi tiết và review.
- Kiểm tra bằng Chromium với ảnh thật ở 1440×860: vùng point cloud 1120×639 khi hiện cả hai, 1440×827 khi ẩn cả hai; nút trên header đổi trạng thái theo; bấm cuboid lúc bảng ẩn thì bảng và chi tiết cuboid hiện lại; không tràn ngang ở 390px.

## 2026-10-12 · Review 3D: ảnh camera ở dải dưới to hơn

- Các ô trong dải "Ảnh camera" không còn cố định 120×80: chúng chia đều bề ngang dải, tối đa 240×160 (đúng cỡ gốc của ảnh ghép, nên không bị phóng vỡ) và giữ tỉ lệ 3:2 (`viewer/Cameras.tsx`).
- Ở 1440×860 mỗi ô là 218×145 (trước là 120×80); dải cao 173px và vùng point cloud còn 658px (trước 724px). Màn hẹp thì các ô nhỏ lại tới 128px rồi cuộn ngang; không tràn ngang ở 390px.

## 2026-10-12 · Ảnh camera cho project 3D

- **Form tạo project 3D** (`Import3DForm.tsx`): thêm component tuỳ chọn `camera_image`; ô mới "Thư mục ảnh camera rời" cho ảnh JPEG đặt tên `<camera>/<frame>.jpg`; ở nguồn Tệp nén chọn được nhiều tệp `.zip` cùng lúc. Khối "Component nhận diện được" hiện thêm dòng `camera_image` và dòng "Ảnh camera rời" (số camera, số ảnh, dung lượng, số ảnh mỗi camera), cảnh báo ảnh sai tên, và từ chối khi có cả hai nguồn ảnh. Giới hạn tổng lên 2 GB.
- **Viewer**: dải **Ảnh camera** dưới vùng point cloud (`viewer/Cameras.tsx`), năm ô theo thứ tự trái sang phải, đổi theo frame; cả dải chỉ tải một ảnh ghép nhỏ cho mỗi frame. Bấm một ô để mở ảnh gốc phủ lên point cloud, có ‹ › đổi camera, ✕ hoặc Esc để đóng; ảnh đang mở đổi theo frame. Nút "Ẩn ảnh camera" thu dải còn một dòng. Project không có ảnh thì không có dải.
- **Trang project 3D**: mục Dữ liệu thêm dòng "Ảnh camera" (số ảnh và tên các camera).
- Tên cuboid trong point cloud không còn nổi lên trên lớp phủ (vùng vẽ được cô lập thứ tự xếp lớp).
- Kiểm tra bằng Chromium với dữ liệu thật (198 frame, 990 ảnh) ở 1440px và 390px, API giả lập trả đúng các tệp đã xuất: chọn `waymo-test.zip` cùng tệp zip ảnh thì đủ 6 component; chọn thư mục ảnh rời thì báo "5 camera · 990 ảnh"; dải ảnh cao 108px, vùng point cloud 724px; mở FRONT ra ảnh 1920×1280; đổi camera và sang frame sau thì ảnh đổi theo; Esc đóng; không tràn ngang ở 390px. Chưa xem chế độ EN và giao diện tối.
- Backend và lưu trữ: [projects-3d.md](projects-3d.md#ảnh-camera).

## 2026-10-12 · Review 3D: bỏ danh sách frame, header mỏng

- Bỏ hẳn danh sách frame của trang `/projects3d/:id/viewer` (cột bên trái, rồi dải ảnh nhỏ thử ở dưới và ở trên vùng vẽ đều đã gỡ; `FrameList.tsx` / `FrameStrip.tsx` không còn). Chuyển frame bằng thanh phát và phím ← →. Hệ quả: không còn chỗ xem tiến độ review của từng frame hay lọc frame có lỗi.
- Header được giữ nhưng mỏng lại, từ 48px còn 29px: chỉ còn biểu tượng logo, nút **← tên project** (ra khỏi chỗ làm việc, về trang project), tên segment, số frame, tài khoản, đổi ngôn ngữ và giao diện. Các nút dùng chung được vẽ nhỏ hơn riêng trong header này (`.viewer3d-header` trong `styles.css`).
- Vùng point cloud chiếm hết phần bên trái: 831px trên màn cao 860px.
- Kiểm tra bằng Chromium với 12 frame thật ở 1440px và 390px: header cao 29px (57px ở 390px vì xuống hai hàng); số frame trong header đổi theo khi sang frame sau; nút ← về đúng `/projects3d/:id`; không tràn ngang.

## 2026-10-12 · Thẻ project 3D bấm được cả thẻ

- Ở trang Dự án, thẻ của project 3D trước chỉ mở project khi bấm đúng vào tên. Giờ cả thẻ là liên kết tới `/projects3d/:id`, giống thẻ project 2D; nút "Xóa dự án" vẫn nằm ngoài liên kết (`Projects3DList.tsx`).

## 2026-10-12 · Chọn cuboid và review 3D

- Trang `/projects3d/:id/viewer` thành chỗ làm việc review (theo ảnh mẫu): point cloud bên trái, bảng bên phải có hai thẻ **Review** và **Hiển thị**. Danh sách frame bên trái của bản đầu đã được gỡ ở mục phía trên.
- Chọn cuboid: bấm vào cuboid trong point cloud hoặc trong danh sách "Cuboid trong frame"; Esc hoặc bấm chỗ trống để bỏ chọn. Cuboid đang chọn vẽ trắng, tô mờ. Đối tượng vẫn được chọn khi chuyển frame.
- Bốn nút góc nhìn ở góc trên phải vùng vẽ: Trên, Mặt trước, Mặt bên, Phối cảnh.
- Thẻ Review (`viewer/ObjectPanel.tsx`): chi tiết cuboid (Track ID, loại, kích thước, vị trí, hướng, số điểm, tốc độ, số frame xuất hiện) và form quyết định như 2D, thêm lựa chọn **Áp dụng cho cả N frame của đối tượng này** và nút **Lưu & tiếp**.
- Thẻ Hiển thị thêm "Tên cuboid" và "Màu cuboid: Theo loại / Theo kết quả review" (xám chưa review, lục đúng, đỏ lỗi, vàng chưa chắc).
- Trang project 3D hiện "Đã review x/y cuboid · n lỗi…"; nút đổi thành **Mở review 3D →**.
- Ảnh mẫu có ảnh camera, điểm rủi ro và confidence; dữ liệu hiện có không có ba thứ đó nên giao diện không hiện.
- Kiểm tra bằng Chromium (WebGL vẽ phần mềm) với API giả lập có trạng thái, 12 frame thật, 1440px: bấm vào giữa một cuboid thì đúng cuboid đó được chọn; lưu lỗi Class gửi `POST …/boxes/…`; đánh dấu áp dụng cả đối tượng gửi `PUT …/tracks/…` và báo "Đã lưu cho 12 frame"; sang frame sau đối tượng vẫn được chọn; Lưu & tiếp chuyển sang cuboid chưa review; danh sách frame và bộ lọc "Có cuboid lỗi" cập nhật theo. Chưa xem ở màn hẹp, chế độ EN và giao diện tối sau thay đổi này.
- Chi tiết: [projects-3d.md](projects-3d.md#chọn-cuboid-và-review-3d).

## 2026-10-12 · Trang project 3D và viewer point cloud

- Tên project ở mục **Project 3D** của trang Dự án giờ mở trang `/projects3d/:id` (`src/pages/Project3DPage.tsx`): trạng thái, số frame, cuboid, điểm, lidar, số cuboid theo loại, thông tin dữ liệu, nút xoá, và nút **Mở viewer point cloud →**. Project `CREATED` / `FAILED` có form chọn lại tệp ngay trên trang; tạo project xong thì vào thẳng trang này.
- Viewer `/projects3d/:id/viewer` (`src/pages/Viewer3DPage.tsx`) chiếm trọn màn hình: vùng vẽ nền tối bên trái, bảng **Hiển thị** bên phải (dưới vùng vẽ ở màn hẹp), thanh phát ở đáy vùng vẽ.
  - Bảng chia theo nguồn dữ liệu: Hệ toạ độ (Xe / Toàn cục, camera bám theo xe, quỹ đạo, đặt lại góc nhìn), Point cloud (màu, cỡ điểm, từng lidar), Bù chuyển động, Cuboid (hiện/ẩn và từng loại), Cảm biến.
  - Thanh phát: phát / dừng, lùi và tới một frame, thanh kéo, đồng hồ, tốc độ. Phím cách và ← → dùng được khi không đứng ở ô nhập.
  - Góc trên trái vùng vẽ: số điểm, số cuboid, tốc độ xe, số cuboid theo loại.
- Phần vẽ three.js nằm riêng ở `src/features/projects3d/viewer/engine.ts` (chuyển từ `waymo-viewer`); route viewer tải lười nên three.js không nằm trong gói của các trang khác. Thêm phụ thuộc `three`, `@types/three`.
- `Import3DForm` nhận `project` và `onImported` để dùng lại cho project đã tạo; `requestBytes` trong `src/lib/api.ts` đọc tệp nhị phân.
- Kiểm tra bằng Chromium (WebGL vẽ phần mềm) với API giả lập trả 12 frame thật của segment mẫu, ở 1440px và 390px: frame đầu có 124.102 điểm và 24 cuboid; tắt lidar TOP còn 14.397 điểm; tắt loại SIGN còn 11 cuboid; nút tới, phím →, phát rồi phím cách để dừng đều đúng; mỗi frame chỉ được gọi một lần; không tràn ngang ở 390px. Chưa xem chế độ EN và giao diện tối của bảng điều khiển.
- Chi tiết: [projects-3d.md](projects-3d.md).

## 2026-10-12 · Tạo project 3D từ segment Waymo

- Trang Dự án có nút **+ Project 3D mới** cạnh "+ Dự án mới" (chỉ Leader), mở `/projects/new-3d` (`src/pages/NewProject3DPage.tsx`).
- Form (`src/features/projects3d/Import3DForm.tsx`): tên, mô tả, nguồn dữ liệu **Tệp rời** (nhiều tệp `.parquet` hoặc cả thư mục) hoặc **Tệp nén (.zip)**. Khối "Component nhận diện được" xếp từng tệp vào `lidar`, `lidar_calibration`, `vehicle_pose`, `lidar_box`, `lidar_pose`, ghi Bắt buộc / Tùy chọn, dung lượng, segment, và báo ngay component còn thiếu.
- Trong lúc xử lý: thanh tiến độ tải lên, rồi dòng trạng thái lấy từ backend (số frame đã chuyển, số tệp đã đưa lên kho chung).
- Trang Dự án có mục **Project 3D** (`Projects3DList.tsx`) dưới danh sách 2D: trạng thái, số frame, cuboid, đối tượng, số cuboid theo loại, nút xoá. Thẻ chưa bấm vào được vì chưa có trang project 3D. Lỗi tải mục này (ví dụ chưa migrate) hiện tại chỗ, không ảnh hưởng danh sách 2D.
- `ProjectStatus` nhận thêm `label`, `DeleteProjectButton` nhận thêm `base` để dùng lại cho 3D.
- Chuỗi mới có bản EN trong `i18n.en.ts`.
- Kiểm tra bằng Chromium với API giả lập ở 1366px và 390px: chọn 3 tệp rời thì báo thiếu `lidar`, `lidar_box`; chọn `waymo-test.zip` (158 MB) thì nhận đủ 5 component và gửi đúng 5 field; trang không tràn ngang ở 390px. Dòng trạng thái từ backend chưa xem được với API giả lập; chế độ EN chưa xem.
- Backend, DB và lưu trữ: [projects-3d.md](projects-3d.md). Cần migration 008.

## 2026-10-12 · Annotator tải .zip cho CVAT và gửi lại một file đã sửa

- Trang `/projects/:id/fixes`: nút **Tải dataset cho CVAT (.zip)** thay cho nút CVAT giả; khối **Gửi lại bản đã sửa** (chọn một file `.zip`/`.xml`/`.json` xuất từ CVAT, trình duyệt chỉ gửi các tệp nhãn).
- Sau khi Annotator gửi lại: review mở khoá, trang dự án báo "Annotator đã gửi lại bản đã sửa", trang fixes thành **Kiểm tra lại** với trạng thái từng lỗi (Đã sửa / Chưa đổi …), bộ lọc "Chưa đổi", khung lúc gửi và khung hiện tại, liên kết mở nhãn trong Review.
- Khoá review giờ chỉ áp dụng khi trạng thái là đang chờ Annotator; nút Hoàn thành hiện lại sau khi Annotator gửi lại.
- Chi tiết: `docs/review-handoff.md`.

## 2026-10-12 · Nút Hoàn thành, khoá review, trang lỗi cần sửa cho Annotator

- Nút **Hoàn thành** nằm dưới form quyết định của case cuối cùng trong hàng đợi trang Review (chỗ "Lưu & tiếp" hết chỗ đi), và ở trang dự án (`src/features/handoff/CompleteReviewButton.tsx`): pop-up chọn Annotator, ghi chú, gửi file kết quả. Annotator không thấy nút.
- Sau khi gửi: form quyết định ở Review và form đánh giá ở Kiểm tra theo ảnh bị khoá (phím tắt 1/2/3 và Ctrl+Enter cũng tắt), có thông báo ai gửi cho ai.
- Trang dự án có khối "Review đã hoàn thành" với liên kết sang trang lỗi và nút **Mở lại review** (chỉ Leader).
- Trang mới `/projects/:id/fixes` (`src/pages/FixesPage.tsx`) cho Annotator xem từng lỗi và tải file; nút CVAT để sẵn, chưa hoạt động.
- Chi tiết và API: `docs/review-handoff.md`. Cần migration 007.

## 2026-10-12 · Nút AI Checking và Label Checking AI; AI báo nhãn có thể thừa

- Trang dự án có nút **AI Checking →** mở `/projects/:id/ai-check`.
- Trang Review và Kiểm tra theo ảnh có nút **Label Checking AI** (`src/features/ai/LabelCheckButton.tsx`, hook `useAiCheck.ts`): Leader chạy AI từ nút khi chưa có kết quả; có kết quả thì nút bật/tắt gợi ý AI trên trang.
- Review: gợi ý AI của nhãn đang xem hiện ở tab Cảnh báo mà không cần đi từ trang AI Check.
- Kiểm tra theo ảnh: thêm khối "AI gợi ý xem lại n nhãn hiện có", số gợi ý AI trên từng ảnh, bộ lọc "Có gợi ý AI". Kết quả AI tải một lần cho cả trang thay vì mỗi ảnh một lần.
- Kiểm tra mới `ai.extra_annotation` (Có thể thừa nhãn), bật bằng `SMARTREVIEW_AI_FINETUNED=true`; xem `docs/ai-check.md`.
- `.sr-button[aria-pressed='true']` có viền/chữ màu nhấn.

## 2026-10-12 · "Bắt đầu kiểm tra" chỉ lấy trước ảnh của các case rủi ro

- Nút "Bắt đầu kiểm tra" không còn tải toàn bộ ảnh của dự án. Nó chỉ tải ảnh của các **case bị đánh dấu rủi ro** (đúng những gì trang Review mở), theo điểm từ cao xuống; với case thuộc một track thì gồm cả khung hình trước và sau (`StartReviewButton.tsx`).
- Ảnh không có case rủi ro nào (ví dụ khi chuyển sang "Tất cả nhãn" hoặc mở "Kiểm tra toàn bộ ảnh") được tải lúc mở như trước khi có bước lấy trước.
- Các phần khác giữ nguyên: nút hiện tiến độ, khóa các nút khác, tối đa 4 ảnh cùng lúc, giữ tối đa 512 MB trong tab.
- Kiểm tra bằng Chromium với API giả lập: dự án 30 ảnh, 4 case rủi ro nằm trên 3 ảnh; chỉ 3 ảnh đó được tải, mỗi ảnh một lần, và danh sách frame của dự án không còn được gọi.

## 2026-10-12 · Dự án mới: đổi được định dạng khi nguồn là tệp nén

- **Lỗi**: chuyển "Nguồn dữ liệu" sang "Tệp nén (.zip)" thì menu "Định dạng nhãn" bị khóa (định dạng chỉ được tự nhận diện), nên định dạng chọn trước đó nằm im ở đó và không đổi được.
- **Sửa** (`ImportForm.tsx`): menu luôn dùng được, chỉ khóa trong lúc đang đọc tệp nén và khi dự án đã tạo.
  - Chưa chọn tệp nén: đổi định dạng tự do. Khi chọn tệp nén, định dạng vẫn được tự nhận diện từ tệp nhãn bên trong.
  - Đã chọn tệp nén: đổi định dạng sẽ tìm bộ nhãn dạng đó ngay trong tệp nén. Có thì dùng bộ đó; không có thì báo "Tệp nén này không có tệp nhãn dạng …" và giữ nguyên lựa chọn đang dùng.
- Kiểm tra bằng Chromium với một tệp nén chứa cả CVAT for images lẫn YOLO: tự nhận CVAT (1 nhãn); đổi sang YOLO thì dùng bộ YOLO (2 nhãn); đổi sang KITTI thì báo lỗi và vẫn giữ YOLO; đổi lại CVAT thì về 1 nhãn.

## 2026-10-12 · Dự án mới: nhận thêm các định dạng CVAT xuất ra (Tệp rời và .zip)

- **Menu "Định dạng nhãn" có 10 định dạng**: thêm CVAT for video 1.1, Datumaro 1.0, PASCAL VOC 1.1, YOLO 1.1 / Ultralytics YOLO, LabelMe 3.0, KITTI, MOT 1.1 bên cạnh CVAT for images, COCO và SmartReview JSON. Bảng chi tiết: [projects-import.md](projects-import.md#định-dạng-nhập).
- **Tệp nén (.zip)**: thả nguyên tệp CVAT xuất ra; định dạng được nhận diện theo nội dung. Định dạng mỗi ảnh một tệp nhãn hiện thành một bộ, ví dụ "PASCAL VOC 1.1 · 120 tệp". Ảnh được ghép cả khi tệp nhãn không ghi đuôi ảnh (YOLO, KITTI, MOT, CVAT for video).
- **Tệp rời**: với định dạng nhiều tệp, ô "Tệp nhãn" cho chọn nhiều tệp và hiện "Đã chọn N tệp nhãn". Chọn tệp khác định dạng đang chọn thì hiện gợi ý "Đổi định dạng" như trước; đổi định dạng không làm mất tệp đã chọn.
- Nút "!" cạnh "Định dạng nhãn" mô tả tệp cần có của định dạng đang chọn.
- Phần đọc tệp phía trình duyệt dùng chung bộ đọc với server qua `core/importers/catalog.ts` (không kéo bộ kiểm tra schema vào trình duyệt).
- Kiểm tra bằng Chromium với API giả lập: 7 tệp .zip mẫu (mỗi định dạng mới một tệp) đều được nhận đúng định dạng và ghép đủ ảnh; upload YOLO gửi đủ `obj.names`, `train.txt`, các tệp `.txt` và ảnh; ở Tệp rời, chọn hai XML PASCAL VOC khi menu đang là YOLO thì hiện gợi ý đổi, đổi xong gửi đúng hai tệp nhãn và hai ảnh.

## 2026-10-12 · Guideline / Policy giữ nguyên chữ ở chế độ VI; sửa gợi ý của mục Guideline

- **Chế độ VI không còn dịch "Guideline" và "Policy"** thành "hướng dẫn", "quy định" (`src/lib/i18n.vi.ts`). Áp dụng cho form tạo dự án, nút "Phân tích Guideline", pop-up "Kiểm tra rules" (ví dụ "Theo Guideline", "Giữ Policy", "So sánh với Policy", "Policy đang áp dụng") và tệp phân tích tải về. Cụm "quy định gán nhãn riêng" (nói về quy định của bộ dữ liệu, không phải Policy của công cụ) giữ nguyên.
- **Gợi ý "!" của mục "Thêm Guideline / Policy mới"** trước gắn vào cả khối, nên khi đã đánh dấu:
  - ở màn hẹp hơn 1280px, khung gợi ý hiện tận cuối khối, dưới ô dán nội dung và nút phân tích, cách xa nút "!";
  - để chuột trong khối 5 giây (kể cả lúc đang gõ nội dung) là gợi ý tự bật.
    Giờ gợi ý chỉ gắn với dòng tiêu đề: hiện ngay dưới tiêu đề (màn hẹp) hoặc bên phải, thẳng hàng với gợi ý của các ô khác (màn rộng), và việc để chuột 5 giây chỉ tính trên dòng tiêu đề.
- Kiểm tra bằng Chromium ở 1100px và 1366px, đã đánh dấu mục Guideline: bấm "!" thì gợi ý hiện đúng chỗ; để chuột trên ô dán nội dung 5,6 giây thì gợi ý không bật.

## 2026-10-12 · Dự án mới: gom chú thích vào nút "!", hiện bên phải

- Các dòng chữ nhỏ dưới từng ô của form tạo dự án (`ImportForm.tsx`) được gỡ khỏi form; form ngắn đi khoảng 150px. Mỗi mục có chú thích giờ có nút tròn **"!"** cạnh nhãn: Nguồn dữ liệu, Định dạng nhãn, CSV thông tin ảnh, Ảnh dữ liệu, Thêm Guideline / Policy, và khung "Trường nhận diện được".
- Chú thích hiện trong một khung **bên phải ô đó**, phía ngoài form (màn từ 1280px; hẹp hơn thì hiện ngay dưới ô), khi:
  - bấm "!" (ghim lại; bấm lần nữa hoặc Esc để tắt),
  - rê chuột hoặc focus bàn phím vào "!",
  - **để chuột trên ô từ 5 giây**; đưa chuột ra thì tắt.
- Nội dung chú thích giữ nguyên. Phần Guideline gom ba ý vào một chỗ: khi nào nên đánh dấu, loại tệp nhận được, và lựa chọn nào làm đổi cách chấm (trước là khung vàng).
- Vẫn hiện sẵn, không giấu: số ảnh đã chọn, mục "Dataset có thư mục ảnh con?", cảnh báo sai định dạng, dòng "Để trống thì dùng … trong tệp nén".
- Thành phần dùng lại được: `src/components/FieldHelp.tsx` (`FieldHelp` bọc ô, `HelpButton` là nút "!").
- Kiểm tra bằng Chromium với API giả lập: lúc đầu không chú thích nào hiện; bấm "!" thì khung hiện cách mép ô 48px về bên phải và nằm trong trang; bấm lại thì tắt; để chuột trên ô CSV 3 giây chưa hiện, 5,6 giây thì hiện, rời chuột thì tắt; bấm "!" không mở hộp chọn tệp. Xem ở 1366px (VI) và 1024px (EN).

## 2026-10-12 · Trang Review: thanh công cụ hai hàng, chữ không còn bị dồn và cắt cụt

- **Thanh công cụ chia hai hàng rõ ràng** (`CaseDetail.tsx`). Trước đây mọi thứ nằm chung một hàng tự xuống dòng, nên ở màn 1366px nó rớt thành ba hàng và phần tiêu đề bị ép còn rất hẹp.
  - Hàng 1: ẩn/hiện hàng đợi, case trước/sau, tiêu đề khung hình, rồi nhóm nút biểu tượng ở bên phải (thu phóng, sao chép, ẩn/hiện ngữ cảnh, ẩn/hiện bảng thông tin, tập trung).
  - Hàng 2: những gì hiện trên ảnh (Tất cả nhãn / Chỉ nhãn rủi ro / Trừ nhãn rủi ro, Khung bao, Phóng to vật thể, Xem cả ảnh, So sánh với).
  - Bớt một hàng nên vùng ảnh và bảng "Vì sao bị cảnh báo" cao thêm khoảng 40px ở màn laptop.
- **Tiêu đề không còn xuống dòng lộn xộn**: "Khung hình N" và "x/y trong ảnh" luôn hiện đủ; dòng mô tả (đối tượng · tên tệp · kích thước) cắt bằng "…" khi thiếu chỗ và hiện đầy đủ khi rê chuột.
- Chữ "So sánh với" chỉ hiện từ màn rộng 1536px; hẹp hơn thì còn biểu tượng, hai nút "Ảnh gốc / Ảnh có nhãn" giữ nguyên.
- **Đầu trang**: tên dataset và dòng "N khung hình · M nhãn" tách thành hai phần, nên dòng số liệu không còn bị cắt thành "1 khung hìn…" (`ReviewPage.tsx`).
- **Hàng đợi**: tên ảnh dài hiện tối đa hai dòng thay vì cắt ở cuối, vì phần cuối tên tệp mới là phần phân biệt các ảnh (`CaseQueue.tsx`).
- Màn điện thoại (390px): trang không còn bị kéo ngang (trước đó tràn 34px).
- Kiểm tra bằng Chromium trên dữ liệu dựng lại cục bộ (1 ảnh 1280×720, 8 khung, 7 case, id dạng `image-37-box-6`) ở 390, 1024, 1366, 1536 và 1920px, VI và EN. Chưa xem trên project thật vì cần đăng nhập.

## 2026-10-12 · "Bắt đầu kiểm tra" lấy trước toàn bộ ảnh của dự án, khóa các nút khác

- Ở trang dự án, bấm **Bắt đầu kiểm tra** thì nút đổi thành **"Đang lấy ảnh… 12/30"** (EN: "Fetching images…") và chỉ chuyển sang trang Review khi đã tải xong dataset và **mọi ảnh của dự án đó** (`src/features/projects/StartReviewButton.tsx`). Danh sách ảnh lấy từ `/projects/:id/frames`; ảnh của dự án khác không bị đụng tới.
- Thứ tự tải: ảnh của các case theo điểm từ cao xuống (đúng thứ tự Review mở), rồi tới các ảnh còn lại. Tải 4 ảnh cùng lúc để không dồn yêu cầu lên Dropbox.
- Ảnh nằm trong bộ nhớ đệm ảnh của tab (`src/lib/imageCache.ts`). Bộ nhớ đệm đổi từ "giữ 24 ảnh" sang **giữ tối đa 512 MB**; dự án lớn hơn mức đó thì phần ảnh cuối không được lấy trước và sẽ tải khi mở. Trang "Kiểm tra toàn bộ ảnh" dùng chung bộ nhớ đệm này. Tải lại trang hoặc mở tab mới thì phải lấy lại.
- Trong lúc chờ, mọi nút và liên kết khác trên trang bị khóa và mờ đi: logo, "Dự án", "Đổi vai trò", xóa dự án, form thành viên, "Kiểm tra toàn bộ ảnh"… Vẫn dùng được **Đăng xuất, đổi ngôn ngữ, đổi giao diện sáng/tối**. `ProjectLayout` giữ trạng thái khóa và đặt `inert` lên các vùng đó; kiểu mờ ở `.page-lock[inert]` trong `styles.css`.
- Lỗi tải dataset hiện ngay dưới nút và mở khóa trang. Ảnh nào lỗi thì bỏ qua, Review tự báo ở khung ảnh đó. Rời trang (đăng xuất, nút Back) thì hủy chờ.
- Kiểm tra bằng Chromium với API giả lập (30 ảnh, mỗi ảnh trả chậm 0,25 giây, một ảnh lỗi 502): nút hiện tiến độ; chỉ còn ba nút trên dùng được; tối đa 4 yêu cầu ảnh cùng lúc; đủ 30 ảnh được gọi, mỗi ảnh một lần; vào đúng case điểm cao nhất; mở case khác không phát sinh yêu cầu ảnh nào.

## 2026-10-12 · Thêm thành viên trực tiếp; bản dịch không còn bị "đóng băng" khi dev

- **Khung "Thành viên project"** (`ProjectPeople`): Leader thêm người bằng form ở đầu khung: gõ tên đăng nhập (có gợi ý các tài khoản thành viên chưa ở trong project), chọn Reviewer hoặc Annotator, bấm "Thêm vào project". Đây là cách mặc định.
- **Reviewer thêm được Annotator**: Reviewer thấy cùng form đó nhưng không có ô chọn vai trò; người được thêm luôn là Annotator. Reviewer không đổi vai trò, không xóa thành viên và không thấy mã mời.
- **Mã mời thành cách phụ**: nằm trong mục gập "Cách khác: mời bằng mã" ở cuối khung. Mã chỉ được tải (và tạo lần đầu) khi mở mục này.
- **Sửa lỗi bản dịch khi chạy `npm run dev`**: plugin React buộc Vite đóng gói sẵn JSX runtime của app, kéo theo cả `i18n.en.ts`, `i18n.vi.ts` và ngôn ngữ đang chọn vào `node_modules/.vite`. Từ đó mọi thay đổi bản dịch không hiện ra cho tới khi xóa cache (đó là lý do "Reviewer" vẫn hiện "Người kiểm tra" sau khi đã bỏ bản dịch). Giờ runtime không import gì từ app: `src/lib/i18n.ts` trao hàm dịch qua `src/lib/jsx/translator.ts` khi tải. Dòng `optimizeDeps.exclude` trong `vite.config.ts` không có tác dụng nên đã bỏ.
- Cần **khởi động lại `npm run dev` một lần** sau khi kéo thay đổi này.
- Kiểm tra bằng Chromium với API giả lập trên một dev server cache mới: thêm thành viên gửi đúng `{ username, role }`; VI và EN hiện đúng; đổi ngôn ngữ không tải lại trang; sửa một mục trong `i18n.en.ts` thì trang đang mở cập nhật ngay.

## 2026-10-12 · Chế độ EN: khôi phục và bổ sung bản dịch

- **Sửa lỗi**: lần chỉnh bản dịch cho phần vai trò đã xóa nhầm 166 mục có sẵn trong `src/lib/i18n.en.ts` (từ form tạo dự án, phân tích guideline, trang tổng quan…), nên chế độ EN hiện tiếng Việt ở các màn đó. Đã khôi phục nguyên văn từ commit `ea414d5`.
- **Bổ sung** bản EN cho các chuỗi trước giờ chưa có: thông báo lỗi từ API (đăng nhập, project, upload, review, frame review, AI Check, guideline), mô tả 44 check trong `shared/policy-rules.ts`, lỗi đọc tệp ZIP, vài dòng trong pop-up "Kiểm tra rules".
- Hộp thoại `window.confirm`/`window.alert` (xóa project, bỏ thay đổi ở kiểm tra ảnh) giờ đi qua `ui()` nên cũng đổi theo ngôn ngữ.
- Ở chế độ VI, vài thông báo lỗi được viết lại trong `i18n.vi.ts` vì thay từng thuật ngữ đọc không xuôi (ví dụ "Đánh giá đã tồn tại…").
- Kiểm tra: quét toàn bộ chuỗi tiếng Việt trong `src`, `server`, `shared` và dịch thử sang EN; còn lại chỉ là chuỗi không hiện trên giao diện (thông báo CLI, log, prompt gửi mô hình) và nhãn "Chuyển sang tiếng Việt" của nút đổi ngôn ngữ (cố ý để tiếng Việt).

## 2026-10-11 · Vai trò Leader / Reviewer / Annotator, mã mời, thành viên project

Đi cùng thay đổi backend trong [project-roles.md](project-roles.md).

- **Đăng ký** (`RegisterPage`): thêm mục "Loại tài khoản" (`RadioGroup` của HeroUI): Thành viên (mặc định) hoặc Leader. Nút tròn và nhãn nằm chung trong `Radio.Content` (hàng bấm được, rộng hết khung, cao 36px), mô tả nằm bên dưới; cấu trúc ban đầu đặt sai nên chữ lệch khỏi nút và chỉ bấm trúng được nút tròn.
- **Sau đăng nhập**: leader vào thẳng `/projects`. Member được hỏi vai trò làm việc ở trang mới `/role` (`RolePage`): Reviewer hoặc Annotator, kèm số project đang có ở mỗi vai trò. Lựa chọn giữ theo tab (`sessionStorage`), quên khi đăng xuất. Thanh tài khoản có nút "Đổi vai trò".
- **Danh sách project** (`ProjectsPage`):
  - Member thấy ô "Mã mời từ leader" (`JoinProjectForm`) và chỉ các project đã tham gia với vai trò đang chọn. Nhập mã của vai trò kia thì giao diện tự chuyển sang vai trò đó.
  - Mỗi thẻ hiện leader, số reviewer, số annotator và vai trò của người xem.
  - Nút "+ New Project" và "Xóa project" chỉ hiện với leader.
- **Trang project** (`ProjectDashboardPage`): khung "Thành viên project" (`ProjectPeople`) gồm người tạo, danh sách reviewer, danh sách annotator. Leader thấy thêm mã mời của từng vai trò (Sao chép, Tạo mã mới) và nút chuyển vai trò, xóa thành viên. Member không thấy form import và nút xóa.
- **AI Check**: nút bắt đầu chỉ hiện với leader; member vẫn xem kết quả.
- **Ngôn ngữ**: Leader, Reviewer, Annotator giữ nguyên ở cả VI và EN (bỏ bản dịch "Người kiểm tra", "Người gán nhãn" trong `i18n.vi.ts`) và luôn viết hoa. Mọi chuỗi mới có bản EN trong `i18n.en.ts`, kể cả thông báo lỗi từ API và hộp xác nhận; ở VI, "project" hiện là "dự án" như phần còn lại của app.
- **Điều hướng** (`router.tsx`, `AuthGate`): `/projects/new`, `/overview`, `/review` chỉ dành cho leader. Trang chờ `/annotation` đã bỏ, chuyển về `/projects`.
- Kiểm tra: `npm run typecheck`, `npm run build`. Chưa chạy được test cần DB (`auth`, `projects`, `test:ui`) vì migration 006 chưa áp dụng.

## 2026-10-11 · Màn review: chú thích cho nút biểu tượng, nút "So sánh ảnh"

- **Nút chỉ có biểu tượng giờ có chú thích** khi rê chuột hoặc focus bằng bàn phím (`src/components/Tip.tsx`, dùng `Tooltip` của HeroUI): ẩn/hiện hàng đợi, case trước/sau, thu nhỏ/phóng to/đặt lại zoom, sao chép thông tin, ẩn/hiện ngữ cảnh, ẩn/hiện bảng thông tin, tập trung. Chú thích kèm phím tắt nếu có.
- Nút `button--icon-only button--tertiary` hình hai tờ giấy là **Sao chép thông tin case** (tên ảnh, frame, đối tượng, annotation, điểm risk, lý do) vào clipboard. Hành vi không đổi.
- **"So sánh ảnh gốc" đổi thành nhóm "So sánh với: Ảnh gốc | Ảnh có nhãn"** (biểu tượng `compare` mới trong `Icon.tsx`). Chọn một trong hai thì vùng ảnh chia đôi; bấm lại nút đang chọn để tắt.
  - Khung phải luôn là ảnh có đánh giá của SmartReview như khi không so sánh (điểm risk, số case, đề xuất AI); các nút lọc nhãn và "Khung bao" vẫn dùng được.
  - Khung trái là thứ được chọn để đối chiếu: **Ảnh gốc** (không có khung nào) hoặc **Ảnh có nhãn** (toàn bộ nhãn đã nhập, một màu, chỉ ghi tên lớp; không điểm risk, không tô nổi annotation đang review, không số thứ tự case, không khung đề xuất AI).
- Tên nhãn ở khung trái được vẽ to hơn (`labelScale` của `FrameViewer`/`AnnotationOverlay`) vì khung chỉ còn nửa chiều rộng.
- Bảng thông tin bên phải và phần quyết định không đổi khi so sánh.
- Kiểm tra: `npm run typecheck`, `npm run build`, và Playwright với API giả lập (1500px và 390px). Chưa chạy `npm run test:ui` (cần DB).

## 2026-10-10 · "Kiểm tra rules": nút tải bản phân tích về dạng Markdown

- Trong pop-up có thêm nút "Tải về (.md)", luôn hiện ở góc phải hàng nút lọc, dùng được ở cả ba mục.
- Tệp tải về (`<tên guideline>-phan-tich.md`) do trình duyệt tự tạo từ kết quả đang có, không gọi lại máy chủ hay mô hình (`src/features/projects/analysisMarkdown.ts`). Ngôn ngữ theo giao diện đang chọn.
- Nội dung đầy đủ hơn pop-up: thông tin chung (guideline, mô hình, thời điểm, số đã chọn); bảng so sánh với policy kèm lựa chọn hiện tại; chi tiết từng quy tắc (lớp, điều kiện, câu trích, tham số guideline chưa nêu); cần người kiểm tra; mâu thuẫn; lớp và thuộc tính; định nghĩa; quy tắc bị loại kèm lý do.
- Mô tả policy lấy từ `shared/policy-rules.ts` (danh mục đã được chuyển về đó; pop-up và tệp tải về dùng chung).
- Kiểm tra bằng Playwright với phản hồi giả lập: bấm nút tải được tệp, nội dung và lựa chọn đúng.

## 2026-10-10 · Lựa chọn trên guideline làm đổi cách chấm

- Chọn "Theo guideline" ở một quy tắc **Nới hơn** trong pop-up "Kiểm tra rules" giờ có hiệu lực khi tạo dự án: check policy tương ứng được tắt cho các lớp của quy tắc đó (`shared/guideline-waivers.ts`). Không chọn, hoặc chọn "Giữ policy", thì chấm như cũ.
- Quy tắc **Mới** và **Chặt hơn** vẫn chỉ được ghi lại: chúng là mô tả bằng lời, engine chưa chạy được.
- Khung "Đã phân tích xong" hiện thêm "N check sẽ tắt khi chấm", đổi ngay theo lựa chọn.
- Dòng ghi chú màu vàng dưới mục Guideline được viết lại cho đúng hành vi mới (cả `vi` và `en`).
- Trang Tổng quan của dự án: check bị tắt hiện lý do bỏ qua `guideline_waived` kèm số box, trong mục "Lý do bỏ qua" có sẵn.
- Lựa chọn chỉ áp dụng lúc tạo dự án; chưa có chỗ đổi lại sau khi dự án đã READY.
- Kiểm tra: `npm run typecheck`, `tests/guideline-waivers.test.ts`. Chưa xem trên trình duyệt.

## 2026-10-10 · Phân tích Guideline: báo dòng chưa được phân loại

- Khi backend dùng bộ phân tích theo dòng (repo `guideline-rules`, bật bằng `GUIDELINE_RULES_DIR` trong `.env`), kết quả có thêm `unclassified` (dòng mô hình không trả lời sau hai lần hỏi) và `errors` (lần gọi mô hình bị lỗi).
- Khung "Đã phân tích xong" trong `GuidelineAnalysis.tsx` hiện thêm một dòng đỏ khi có dòng chưa phân loại hoặc lần gọi lỗi. Không có thì giao diện như cũ.
- Pop-up "Kiểm tra rules" không đổi. Các trường mới của quy tắc (`line`, `downgraded`) chưa được hiển thị.
- Kiểm tra: `npm run typecheck`, `tests/guideline.test.ts`, và gọi thật route `/api/guideline/analyze` với Gemini trên `fixtures/guideline/sample-2d.txt`. Chưa xem dòng cảnh báo trên trình duyệt.

## 2026-10-10 · "Kiểm tra rules": gọn lại, so sánh guideline với policy và cho chọn

- Pop-up "Kiểm tra rules" (`GuidelineAnalysis.tsx`) bỏ bớt thông tin: còn ba mục "So sánh với policy", "Cần người kiểm tra", "Mâu thuẫn". Các mục lớp/thuộc tính, định nghĩa và quy tắc bị loại không còn hiển thị (vẫn nằm trong dữ liệu lưu kèm dự án).
- Bảng so sánh có bốn cột, hàng tô nền so le:
  - Quy tắc từ guideline: điều kiện, mã và mục, câu trích (tối đa hai dòng), tham số guideline chưa nêu.
  - So sánh: Mới / Chặt hơn / Nới hơn so với policy.
  - Policy đang áp dụng: mô tả một dòng của check tương ứng trong công cụ kèm mã check, hoặc "Chưa có quy tắc tương ứng". Mô tả nằm trong `src/features/projects/policyRules.ts`, viết theo `core/risk/checks/*`, ngưỡng lấy trực tiếp từ `core/risk/policy.ts`; đủ cho cả 33 check hiện có.
  - Chọn: "Theo guideline / Giữ policy" (với quy tắc mới là "Thêm vào / Bỏ qua"). Có nút chọn tất cả và bộ đếm "Đã chọn x/y".
- Chưa phân quyền: ai mở form cũng chọn được.
- Lựa chọn đi theo dự án: khi bấm "Tạo và nhập dữ liệu", form gửi thêm trường `guideline_rules` (kết quả phân tích + lựa chọn, JSON); `server/projects/upload.ts` lưu thành `guideline/rules.json` cạnh tệp guideline và `service.ts` ghi đường dẫn vào `dataset.metadata.guideline.rules`. Engine chưa đọc tệp này, cách chấm điểm chưa đổi.
- Kiểm tra bằng Playwright với phản hồi giả lập (sáng/tối, 390px, lựa chọn có trong dữ liệu gửi đi). Chưa chạy với Gemini thật và máy chủ thật.

## 2026-10-10 · Guideline nhận Markdown, DOCX, PDF

- Ô chọn tệp guideline nhận `.md`, `.markdown`, `.txt`, `.docx`, `.pdf`, `.json`; tệp guideline trong tệp nén cũng được nhận diện với các đuôi này. Máy chủ (`server/projects/upload.ts`) nhận thêm `.docx`, `.markdown` khi lưu kèm dự án.
- "Phân tích Guideline" giờ chạy được với cả ba dạng. Hàm gọi mô hình chỉ nhận chữ, nên trình duyệt rút chữ trước khi gửi (`src/features/projects/guidelineText.ts`); tệp gốc vẫn là thứ được tải lên và lưu.
  - Markdown / TXT / JSON: đọc nguyên văn.
  - DOCX: mở bằng bộ đọc ZIP có sẵn, lấy các đoạn trong `word/document.xml` theo thứ tự đọc (gồm cả ô bảng, tab, xuống dòng; bỏ chữ đã xoá trong chế độ theo dõi thay đổi). Số thứ tự do Word tự sinh cho danh sách/tiêu đề không nằm trong tệp dưới dạng chữ nên không có trong kết quả.
  - PDF: dùng `pdfjs-dist` (thư viện mới, chỉ tải khi mở PDF). PDF không có lớp chữ (bản quét) hoặc có mật khẩu thì báo lỗi rõ, không gửi gì đi.
- Kiểm tra bằng Playwright: cùng một guideline mẫu (`fixtures/guideline/sample-2d.txt`) ở dạng .md, .docx, .pdf đều cho ra đủ 42/42 câu nguyên văn trong nội dung gửi đi (cần cho bước đối chiếu câu trích ở backend); PDF không có chữ và DOCX hỏng báo lỗi. DOCX/PDF mẫu do tôi tự tạo, chưa thử với tệp xuất từ Word hay PDF nhiều cột.

## 2026-10-10 · Dự án mới: nút "Kiểm tra rules" mở bảng pop-up

- Sau khi "Phân tích Guideline" chạy xong, form không còn trải kết quả ra ngay bên dưới. Thay vào đó là một dòng tóm tắt số lượng và nút "Kiểm tra rules" (`GuidelineAnalysis.tsx`).
- Nút mở pop-up (HeroUI `Modal`, cỡ `cover`, cuộn bên trong, đóng bằng nút ✕, Esc hoặc bấm ra ngoài) chứa bảng quy tắc: ID, mục, nhóm, lớp, điều kiện, câu trích từ guideline, ghi chú (quan hệ với check hiện có, tham số còn thiếu, dữ liệu cần thêm).
- Các hàng tô nền so le (`odd:bg-panel even:bg-slate-100`, theo cả nền sáng lẫn tối); tiêu đề cột dính ở đầu bảng khi cuộn.
- Hàng nút lọc phía trên bảng: tất cả quy tắc, kiểm tra tự động được, cần người kiểm tra, định nghĩa, lớp và thuộc tính, mâu thuẫn, bị loại (kèm lý do bị loại). Mục không có dữ liệu thì nút bị mờ.
- Kiểm tra bằng Playwright với phản hồi giả lập (sáng/tối, 390px). Chưa chạy với phản hồi thật của Gemini.

## 2026-10-10 · Dự án mới: nút "Phân tích Guideline"

- Trong mục "Thêm Guideline / Policy mới" của `ImportForm` có thêm nút "Phân tích Guideline" (`src/features/projects/GuidelineAnalysis.tsx`). Nút chỉ xuất hiện khi mục này được đánh dấu và chỉ bấm được khi đã có nội dung: tệp MD/TXT/JSON đã chọn, nội dung dán vào, hoặc tệp guideline trong tệp nén (cùng thứ tự ưu tiên với lúc tải lên). PDF chưa phân tích được vì trình duyệt không đọc được chữ trong PDF; form ghi rõ.
- Đường gọi: nút → `POST /api/guideline/analyze { text }` → `server/guideline/http.ts` → `extractGuideline()` trong `server/guideline/model-call.ts` (lời gọi Gemini có sẵn, không sửa). Route yêu cầu đăng nhập vai trò reviewer như các API khác, nhận tối đa 512 KB văn bản, trả 503 khi backend chưa có `GEMINI_API_KEY` và 502 kèm lý do khi lời gọi mô hình lỗi.
- Kết quả hiện ngay dưới nút: tên mô hình và số lượng, danh sách lớp và thuộc tính, quy tắc chia ba nhóm (kiểm tra tự động được / cần người kiểm tra / định nghĩa) kèm mục, câu trích, quan hệ với check hiện có, tham số còn thiếu; các chỗ guideline mâu thuẫn; các quy tắc bị loại khi đối chiếu. Đổi nguồn guideline thì kết quả cũ bị bỏ.
- Kết quả là bản nháp: chưa lưu kèm dự án và chưa đổi cách chấm điểm.
- Kiểm tra: `tests/guideline.test.ts` thêm ca cho route (văn bản gửi lên tới đúng hàm gọi mô hình, lỗi được báo lại); form kiểm tra bằng Playwright với phản hồi giả lập. Chưa gọi Gemini thật.

## 2026-10-10 · Đổi ngôn ngữ không tải lại trang, không gọi lại API

- Trước đây `setLang` gọi `location.reload()`, nên mỗi lần đổi VI/EN toàn bộ API (phiên đăng nhập, dự án, case, review, ảnh) bị gọi lại.
- Giờ `lang` đổi tại chỗ (`src/lib/lang.ts`, có `onLang` để đăng ký); `main.tsx` đặt `key` theo ngôn ngữ cho `RouterProvider` để các trang dựng lại bằng ngôn ngữ mới. `AuthProvider` nằm ngoài nên phiên đăng nhập giữ nguyên; ảnh đã tải vẫn nằm trong `imageCache`.
- Các trang khi dựng lại sẽ hỏi lại dữ liệu, nên `request` (`src/lib/api.ts`) nhớ câu trả lời GET gần nhất của từng đường dẫn (tối đa 200) và trong 3 giây sau khi đổi ngôn ngữ trả lại đúng dữ liệu đó (`reuseAnswers`). Bất kỳ lệnh ghi nào (POST/PUT/DELETE) xoá bộ nhớ này, nên sau khi lưu review thì lần đổi ngôn ngữ kế tiếp sẽ tải lại dữ liệu thật.
- Hạn chế như trước: trạng thái tạm của trang (bản nháp trong form, tệp đã chọn) mất khi đổi ngôn ngữ.
- Kiểm tra bằng Playwright (API giả lập) ở `/projects`: đổi VI → EN → VI có 0 lần gọi API và 0 lần tải trang; tải lại trang thật vẫn giữ ngôn ngữ đã chọn.

## 2026-10-10 · Dự án mới: nhập từ tệp nén, dò trường sâu, Guideline/Policy tuỳ chọn

Form `ImportForm` (dùng ở `/projects/new` và ở dashboard của dự án CREATED/FAILED).

### Nguồn dữ liệu: Tệp rời / Tệp nén (.zip)

- Công tắc "Tệp rời / Tệp nén (.zip)", mặc định "Tệp rời" (luồng cũ, nhãn các ô giữ nguyên nên test cũ không đổi).
- Tệp nén được mở ngay trên trình duyệt (`src/lib/zip.ts`, dùng `DecompressionStream`, không thêm thư viện). Máy chủ vẫn chỉ nhận từng tệp như trước và không giải nén gì. Không đọc ZIP64, ZIP có mật khẩu, kiểu nén khác stored/deflate; mục giải nén ra lớn hơn kích thước khai báo bị từ chối.
- `readPack` (`src/features/projects/dataset.ts`) tự tìm trong tệp nén, ở mọi thư mục con:
  - tệp nhãn: nhận diện theo nội dung (CVAT XML 1.1, COCO JSON, SmartReview JSON), định dạng tự chọn theo đó; có nhiều tệp nhãn thì hiện ô chọn;
  - ảnh: ghép với đường dẫn trong tệp nhãn theo phần đuôi đường dẫn dài nhất (`data/images/a.jpg` khớp `images/a.jpg` hoặc `a.jpg`), tải lên dưới đúng tên tệp nhãn ghi; ảnh không được nhắc tới bị bỏ qua;
  - CSV thông tin ảnh (có cột tên tệp và env_risk) và tệp guideline (tên chứa guide/policy/quy định/hướng dẫn; .md/.txt/.pdf).
- Khung "Tìm thấy trong tệp nén" hiện kết quả; thiếu ảnh hoặc trùng tên không phân biệt được thì báo ngay và chặn nút gửi. Bỏ qua `__MACOSX`, tệp ẩn, `Thumbs.db`.

### Dò trường sâu (confidence / score / top-2 / env_risk)

- `core/importers/signals.ts`: thay vì chỉ đọc khoá ở tầng đầu, tìm theo chiều rộng tới 4 tầng trong từng nhãn (ví dụ `attributes.model.score`, `meta.detection.conf`). Trường gần nhãn nhất được dùng; giá trị không đọc được (ví dụ `score: "high"`) không che trường hợp lệ ở sâu hơn. `confidence`, `score`, `conf`, `prob`… được coi như nhau như trước; thêm nhận dạng tên kiểu camelCase (`top2Score`, `envRisk`).
- Nhóm `top2: { label, score }` được đọc thành lớp thứ hai; điểm trong nhóm này không bao giờ bị lấy làm độ tin cậy của nhãn. Không đi vào mảng (phần tử mảng là bản ghi khác).
- Chỉ ảnh hưởng dự án nhập mới; dự án đã nhập giữ nguyên dữ liệu đã chuẩn hoá.
- Form có khung "Trường nhận diện được": đường dẫn trường tìm thấy và số nhãn có trường đó, cho cả hai nguồn. Chọn tệp nhãn khác định dạng đang chọn thì có gợi ý "Đổi định dạng".
- Test: thêm ca "signals are found at any depth" trong `tests/signals.test.ts`.

### Guideline / Policy mới

- Ô đánh dấu "Thêm Guideline / Policy mới", mặc định tắt; chỉ khi đánh dấu mới mở phần chọn tệp (MD/TXT/PDF/JSON, 10 MB) hoặc dán nội dung. Với tệp nén có sẵn guideline, để trống thì dùng tệp đó; không đánh dấu thì không gửi gì.
- Máy chủ: `server/projects/upload.ts` nhận thêm trường `guideline`, lưu `guideline/guideline.<đuôi>` trong thư mục dự án; `service.ts` ghi tên tệp vào `dataset.metadata.guideline`.
- Chưa làm: bộ kiểm tra vẫn chạy policy có sẵn (`core/risk/policy.ts`), chưa đọc guideline. Form ghi rõ điều này.

### Kiểm tra

- `npm run typecheck`, `node --test tests/signals.test.ts tests/coco.test.ts tests/core.test.ts` qua. Form kiểm tra bằng Playwright với API giả lập (tệp nén lồng thư mục, thiếu ảnh, tệp không phải ZIP, sáng/tối, 390px). Chưa chạy với máy chủ thật (`npm test`, `npm run test:ui` cần DB).

## 2026-10-10 · Trang Review: gom lỗi theo ảnh, xem từng lỗi hoặc cả ảnh

Áp dụng bản demo `demo-group/index.html` (đã được duyệt), ghép vào giao diện hiện có (khung gập, Tập trung, sáng/tối, VI/EN).

### Hàng đợi

- Công tắc "Theo ảnh / Theo lỗi" ở đầu hàng đợi, mặc định "Theo ảnh", lưu trong `localStorage` (`smartreview-queue-grouping`). "Theo lỗi" là danh sách cũ, mỗi lỗi một dòng.
- "Theo ảnh": các case cùng ảnh (với video là cùng khung hình) gom thành một mục (`groupByImage` trong `src/features/review/grouping.ts`). Mục hiện tên ảnh, số case, điểm rủi ro cao nhất và "đã xem x/y". Ảnh đang chọn mở ra danh sách case đánh số; ảnh khác hiện một hàng ô số tô màu theo mức rủi ro, ô đã quyết định có dấu ✓.
- Thứ tự: ảnh xếp theo case đầu tiên của nó trong cách sắp xếp đang chọn (rủi ro giảm dần thì ảnh có rủi ro cao nhất ở trên); trong ảnh giữ nguyên thứ tự sắp xếp. Nút chuyển case và phím `←` `→` đi theo thứ tự này, nên xem hết các lỗi của một ảnh rồi mới sang ảnh kế.
- Mỗi case vẫn là đúng một liên kết trong hàng đợi (dòng trong danh sách hoặc ô số), nên các test đếm liên kết không đổi.

### Trên ảnh

- Ảnh có từ hai case trở lên thì các case được đánh số ngay trên khung, viền tô theo mức rủi ro; case đã quyết định có dấu ✓. Case đang xem giữ màu xanh ngọc và nhãn "RỦI RO …".
- Mặc định (từng lỗi): các case khác bị làm mờ. Nút "Xem cả ảnh" (phím `A`): mọi case hiện rõ kèm tên lớp.
- Bấm vào một khung có số thì mở case đó. Di chuyển bằng Tab vẫn chỉ xem thông tin, không chuyển case.
- Thanh công cụ có thêm "2/4 trong ảnh 1/9". Phím `↑` `↓` chuyển ảnh (chỉ từ 1024px trở lên; màn hình hẹp hơn để phím mũi tên cuộn trang).
- "Chỉ nhãn rủi ro" giờ hiện mọi case của ảnh, không chỉ case đang xem.

### Xem cả ảnh

- Bảng thông tin đổi thành danh sách thẻ (`ImageCaseList`), mỗi thẻ một case: số, lớp, điểm, lý do, ba nút quyết định.
- "Nhãn đúng" và "Chưa chắc" lưu ngay (không có bước lưu riêng như trong demo). "Lỗi gán nhãn…" mở riêng case đó ở chế độ từng lỗi, vì cần chọn loại lỗi và nhập nhãn đúng.
- Nút "N còn lại: nhãn đúng" lưu "nhãn đúng" cho mọi case chưa có quyết định của ảnh; "Sang ảnh kế →" chuyển ảnh.

### Thanh công cụ

- Để đỡ xuống dòng: nút Tập trung chỉ còn biểu tượng, nút đặt lại zoom hiện "1:1" (tên truy cập giữ nguyên).

### Kiểm tra

- `npm run typecheck`, `npm run build`, `prettier --check`.
- Chromium (Playwright) với API giả lập (13 case trên 9 ảnh): hàng đợi gom có đúng 13 liên kết; `→` đi hết case của ảnh rồi sang ảnh kế; `↑` về ảnh trước; "Xem cả ảnh" hiện 4 thẻ; quyết định nhanh và nút "còn lại: nhãn đúng" gửi đúng các case chưa có quyết định; bấm khung số trên ảnh mở đúng case; "Theo lỗi" trả lại danh sách cũ; vừa một màn hình ở 1600×900, không tràn ngang ở 390px.
- Chưa chạy `npm test`, `npm run test:ui`; chưa xem với dữ liệu thật. Thứ tự hàng đợi mặc định đã đổi (gom theo ảnh), nên nếu test nào dựa vào thứ tự cũ thì có thể cần sửa.

## 2026-10-10 · Trang Review: khung gập được, chế độ Tập trung, màu vùng ảnh theo giao diện

Áp dụng bố cục A của bản demo (`demo-panels/index.html`, đã được duyệt).

### Ẩn/hiện khung

- Ba khung quanh ảnh ẩn/hiện được: hàng đợi (nút đầu thanh công cụ, phím `[`), bảng thông tin (phím `]`), dải ngữ cảnh theo thời gian (phím `\`). Nút "Tập trung" (phím `F`) ẩn cả ba; bấm lại thì hiện lại cả ba. Phím tắt không chạy khi đang gõ trong ô nhập.
- Trạng thái nằm trong `usePanels` (`src/features/review/usePanels.ts`), lưu ở `localStorage` (`smartreview-review-panels`). Mặc định hiện cả ba.
- Khung bị ẩn để lại một tay nắm ở mép ảnh để mở lại. Khi không có case nào được chọn thì hàng đợi luôn hiện (vì lúc đó không có thanh công cụ).
- Khi ẩn bảng thông tin, trên ảnh có thêm:
  - thẻ cảnh báo ở góc trên phải (điểm rủi ro, tên lớp, số tín hiệu; bấm để xem lý do);
  - thanh quyết định nổi ở đáy ảnh: ba lựa chọn, ô loại lỗi / nhãn đúng khi chọn "lỗi gán nhãn", và nút "Lưu & tiếp". Ô ghi chú không hiện ở thanh này nhưng nội dung vẫn được giữ và lưu.
- Form quyết định chỉ có một bản: nút DOM của nó được chuyển giữa bảng thông tin và thanh nổi (portal vào một phần tử cố định), nên ẩn/hiện bảng không làm mất nội dung đang nhập.

### Kích thước và màu

- Từ 1280px trở lên: hàng đợi rộng 300px (trước 264px), bảng thông tin rộng 396px (trước 332px); ảnh còn khoảng 90% bề rộng cũ. Chữ lý do cảnh báo lớn hơn một cỡ.
- Vùng quanh ảnh và dải ngữ cảnh không còn luôn tối: thêm hai màu `canvas` và `film` trong `styles.css`, đổi theo giao diện sáng/tối. Các nút và thẻ nổi trên ảnh dùng màu khung của giao diện đang chọn.
- Giao diện tối: nút bật/tắt HeroUI đang bật có chữ sáng hơn (`--accent-soft*`), trước đây chữ mờ hơn cả nút tắt.

### Kiểm tra

- `npm run typecheck`, `npm run build`, `prettier --check`.
- Chromium (Playwright) với API giả lập, 1600×900: mặc định vẫn vừa một màn hình, vùng ảnh rộng 880px; ẩn bảng thông tin thì thanh nổi hiện và chọn được quyết định; hiện lại thì ghi chú và lựa chọn vẫn còn; Tập trung cho vùng ảnh rộng 1576px; vừa màn hình ở 1366×768; không tràn ngang ở 390px.
- Ở 1600px thanh công cụ xuống hai dòng khi hàng đợi đang hiện (nhiều nút hơn trước).
- Test Playwright không sửa: mặc định mọi khung đều hiện. Chưa chạy `npm test`, `npm run test:ui`; chưa xem với dữ liệu thật.

## 2026-10-10 · Chế độ VI thuần tiếng Việt

- Trước đây `vi` hiển thị thuật ngữ tiếng Anh kèm chú thích trong ngoặc ("Frame (Khung hình)") và còn nhiều nhãn chỉ có tiếng Anh ("All annotations", "Risk only"…). Nay `vi` chỉ còn tiếng Việt; `en` không đổi.
- `hint()` ở `vi` thay hẳn thuật ngữ bằng nghĩa tiếng Việt và giữ kiểu chữ của từ gốc (`frame` giữa câu → "khung hình", `PASSED` → "ĐẠT"). Một số nghĩa được rút gọn: Risk → "Rủi ro", Projects → "Dự án", Media → "Dữ liệu ảnh", Annotations → "Nhãn", N/A → "Không có".
- Bảng mới `src/lib/i18n.vi.ts`: tiếng Việt cho các nhãn viết bằng tiếng Anh trong component và cho những câu mà việc thay từng từ đọc không xuôi.
- Runtime JSX giờ dịch ở cả hai chế độ. Ở `vi`, nó tra `i18n.vi.ts`; với các câu do app viết (chính là các khóa của `i18n.en.ts`) thì thay thuật ngữ tiếng Anh còn lẫn trong câu. Chữ khác như tên lớp, tên file, mã annotation không bị đụng tới.
- Thêm `ui(text)` trong `src/lib/i18n.ts` cho nhãn tự ghép trong component (tab "Cảnh báo · 2") và cho test.
- `objectText` chỉ dịch chữ "Object"/"Track", không dịch phần mã phía sau (trước đây mã như `object-2` cũng bị thay chữ).
- Runtime JSX được loại khỏi bước pre-bundle của Vite (`optimizeDeps.exclude`): nếu không, sửa bảng dịch sẽ không có tác dụng ở dev cho tới khi xóa cache.
- Còn tiếng Anh ở `vi`: dữ liệu (tên lớp, tên file, mã check như `model.low_confidence`, nội dung server trả về), tên riêng (SmartReview, CVAT, COCO, MySQL), tên định dạng trong form import, và hai nhãn chỉ dành cho trình đọc màn hình ("Inspect …" trên khung annotation, mô tả ảnh ở trang Frames).

### Test

- Chữ hiển thị mặc định đã đổi nên sửa các test Playwright đang so chuỗi cứng: dùng `ui(...)` / `hint(...)` trong `scene`, `review`, `projects`, `ai-check`, `loading`, `frame-review`. Các test đã gọi `hint()` sẵn thì tự khớp. Chưa chạy được bộ test (cần database test), nên có thể còn chỗ so chuỗi bị sót.

### Kiểm tra

- `npm run typecheck`, `npm run build`, `prettier --check`.
- Chromium (Playwright) với API giả lập: ở `vi`, trang Review (cả ba tab) và Overview không còn chữ tiếng Anh nào của giao diện; ở `en` không còn chữ tiếng Việt; trang Review vẫn vừa một màn hình.
- Chưa xem bằng mắt ở `vi`: Projects, Dashboard, Frames, AI Check, New Project, Đăng nhập / Đăng ký.

## 2026-10-10 · Chuyển ngôn ngữ VI/EN, bo góc toàn bộ app

### Ngôn ngữ

- Nút `VI` / `EN` (`LanguageToggle`) trên thanh trên của mọi trang sau đăng nhập và ở góc trang Đăng nhập / Đăng ký. Lựa chọn lưu trong `localStorage` (`smartreview-lang`), mặc định là `vi`. Đổi ngôn ngữ thì trang tải lại, nên thay đổi chưa lưu trong form sẽ mất.
- `vi` là giao diện như cũ, không đổi một chữ nào (thuật ngữ tiếng Anh kèm chú thích tiếng Việt trong ngoặc), nên test hiện có không bị ảnh hưởng.
- `en` là tiếng Anh hoàn toàn:
  - `hint()` trả lại thuật ngữ tiếng Anh, không kèm chú thích.
  - Các câu tiếng Việt được dịch bằng bảng `src/lib/i18n.en.ts` (khoảng 300 câu, khóa là đúng câu tiếng Việt trong mã nguồn) cộng vài quy tắc regex cho câu có chèn giá trị.
- Cách áp dụng: JSX của app biên dịch qua runtime riêng (`src/lib/jsx/`, khai báo bằng `jsxImportSource` và alias trong `vite.config.ts`). Runtime này dịch chuỗi con và các thuộc tính `aria-label`, `placeholder`, `title`, `alt`, `label` ngay khi tạo phần tử, nên component không phải gọi hàm dịch. Thêm câu tiếng Việt mới thì chỉ cần thêm một dòng vào bảng; câu chưa có trong bảng sẽ hiện nguyên tiếng Việt ở chế độ `en`.
- Không dịch: nội dung từ server (lý do cảnh báo của từng check, thông báo lỗi API), tên lớp, tên file, và ngày giờ (vẫn định dạng `vi-VN`).

### Bo góc

- `.panel` bo `rounded-xl` và cắt nội dung tràn, `.sr-button` bo tròn hẳn như nút HeroUI, `.field` bo `rounded-lg`: áp dụng cho mọi trang.
- Thay hết `rounded-none` còn lại (menu trên, nhãn trạng thái project, nhãn schema/engine ở Overview) và bo các khung viền riêng ở trang Frames.

### Kiểm tra

- `npm run typecheck`, `npm run build`, `prettier --check`.
- Chromium (Playwright) với API giả lập: ở `en`, trang Review, Overview và Đăng nhập không còn câu tiếng Việt nào của giao diện; ở `vi` chữ trên nút vẫn như trước; trang Review vẫn vừa một màn hình. Overview đã xem ở giao diện tối với góc bo.
- Chưa dựng được các trang Projects, Dashboard, Frames, AI Check, New Project (cần dữ liệu thật): bản dịch và bo góc ở các trang này chưa được xem bằng mắt.
- Chưa chạy `npm test`, `npm run test:ui`.

## 2026-10-10 · Trang Review: so sánh ảnh gốc, chế độ "Without risk", nút và khung theo HeroUI

### Chức năng mới trên thanh công cụ

- **So sánh ảnh gốc**: chia vùng ảnh làm hai, bên trái là ảnh gốc không có khung nào, bên phải là ảnh có nhãn. Zoom, kéo và "Phóng to vật thể" áp dụng cho cả hai bên (`FrameViewer` có thêm `follow` và `onViewChange`). Ảnh bên trái lấy từ cache nên không tải thêm.
- **Without risk**: chế độ thứ ba cạnh "All annotations" và "Risk only", vẽ mọi annotation của frame trừ annotation đang bị cảnh báo.

### HeroUI

- HeroUI 3.2.6 có sẵn `Button`, `ToggleButton`, `ToggleButtonGroup`, `Card`, `Chip`, `Kbd`, `Tabs`, `Tooltip`, `Surface`. Đã dùng:
  - `ToggleButtonGroup` + `ToggleButton` cho ba chế độ annotation; `ToggleButton` cho BBox, Phóng to vật thể, So sánh ảnh gốc.
  - `Button` cho chuyển case, zoom, sao chép, "Save Review" (outline) và "Lưu & tiếp" (primary).
  - `Card` cho từng tín hiệu trong Why flagged.
- Nhóm ba chế độ chạy ở `selectionMode="multiple"` có kiểm soát để luôn đúng một nút được chọn: ở chế độ `single`, React Aria đổi các nút thành radio, làm hỏng tên/role mà test đang tìm.
- Chưa dùng `Tabs` của HeroUI cho cột phải: tab ẩn cần vẫn nằm trong DOM (test đọc danh sách annotation khi tab chưa mở, và trạng thái mở của Evidence cần giữ).
- Bo góc cho ô lọc, ô nhập, ô quyết định, thẻ temporal và `RiskBadge` để khớp với nút HeroUI. Các trang khác vẫn góc vuông.
- Giao diện tối: đặt `--background`, `--surface`, `--border`, `--field-background` của HeroUI theo bảng xám của app.

### Kiểm tra

- `npm run typecheck`, `npm run build`, `prettier --check`.
- Chromium (Playwright) với API giả lập: "Without risk" ẩn đúng annotation đang review; hai khung so sánh có cùng `viewBox` sau khi zoom; ba nút chế độ vẫn là `button` có `aria-pressed`; "Save Review" lưu và ở lại case; không cuộn trang ở 1920×1080 và 1366×768; không tràn ngang ở 390px.
- Chưa xem với dữ liệu thật; chưa chạy `npm test`, `npm run test:ui`.

## 2026-10-10 · Trang Review một màn hình kiểu CVAT, giao diện tối, logo dùng chung

### Trang Review vừa đúng một màn hình (từ 1024px trở lên)

- Trang không còn cuộn; từng vùng tự cuộn bên trong. Dưới 1024px vẫn xếp dọc và cuộn như trước.
- Thanh trên của `AppLayout` thu gọn khi ở trang Review và có một ô trống (`headerSlot`, truyền qua `Outlet context`); trang Review đưa tên dự án, tiến độ và các con số thống kê vào đó. Ẩn footer và nhãn trạng thái dữ liệu ở trang này.
- Thanh công cụ của case: chuyển case, tên frame, All annotations / Risk only, BBox, phóng to vật thể, zoom, sao chép. Nút zoom do `FrameViewer` vẽ vào thanh này qua prop `controlsSlot`.
- Cột trái: bộ lọc và hàng đợi. Giữa: ảnh trên nền tối cố định (cả hai giao diện), co vừa khung; lăn chuột để zoom, kéo để di chuyển khi đã zoom. Dưới ảnh là dải Temporal context; case không có track thì chỉ còn một dòng ghi chú.
- Cột phải: ba tab Why flagged, Objects (danh sách annotation của frame), Chi tiết. Form quyết định ghim ở đáy cột.
- Màu khung annotation đổi sang màu cố định đọc được trên nền tối: đang review xanh ngọc, đang chọn trắng nét đứt, còn lại xám.

### Form quyết định

- Ba lựa chọn hiển thị thành ba ô lớn (vẫn là radio, tên truy cập không đổi).
- Phím tắt: `1` `2` `3` chọn quyết định, `Ctrl+Enter` lưu rồi sang case tiếp. Phím số không chạy khi đang gõ trong ô nhập.
- Thêm nút "Lưu & tiếp →". Nút "Save Review" cũ vẫn còn và vẫn ở lại case: bản demo chỉ có một nút, nhưng giữ cả hai để lưu mà không rời case vẫn làm được và test hiện có không đổi. Ở case cuối danh sách chỉ còn nút lưu.

### Giao diện tối

- Nút mặt trời/mặt trăng trên thanh trên của mọi trang sau đăng nhập (`ThemeToggle`, `src/lib/theme.ts`), lưu lựa chọn trong `localStorage`, mặc định là sáng.
- Bảng màu tối lấy theo trang đăng nhập (nền `#1e1f22`, khung `#313338`, viền `#3f4147`). Cách làm: `:root[data-theme='dark']` đổi giá trị các biến màu của Tailwind (ink, panel, line, muted, accent, thang slate, vài màu chữ rose/amber/sky), nên các class hiện có tự đổi theo. `bg-white` trong app đổi thành `bg-panel`.
- Chỉ mới soát bằng mắt trang Review ở giao diện tối; các trang khác dùng chung biến màu nhưng chưa xem lại từng trang.

### Logo

- Logo trong `public/favicon.svg` (cùng hình với `LogoMark`) thay cho biểu tượng cũ trên thanh trên của `AppLayout` và dòng chữ trơn của `ProjectLayout`; thêm vào đầu `README.md` của repo.

### Test

- Sửa `tests/browser/scene.spec.ts` và `review.spec.ts`: bấm tab Objects / Chi tiết / Why flagged trước các bước cần nội dung trong tab. Chưa chạy được hai bộ test này (cần database test).

### Kiểm tra

- `npm run typecheck`, `npm run build`, `prettier --check`.
- Dựng trang bằng Chromium (Playwright) với API giả lập trên một dev server riêng: không cuộn trang ở 1920×1080, 1366×768 và 1100×900; không tràn ngang ở 390px; phím `2` chọn Annotation Error; `Ctrl+Enter` lưu một lần rồi sang case kế; sáng và tối đều hiển thị đúng.
- Chưa xem với dữ liệu thật (không có tài khoản đăng nhập).
- Dev server đang chạy ở cổng 5173 trả 504 "Outdated Optimize Dep" cho `react-dom` (thư mục cache `node_modules/.vite` không còn trên đĩa); cần khởi động lại `npm run dev` thì trang mới tải được.

## 2026-10-10 · Trang Review: gọn bố cục, mỗi ảnh chỉ tải một lần

### Ảnh

- Ảnh frame được server trả với `Cache-Control: no-store`, nên mỗi thẻ `<image>` trỏ cùng một URL lại tải riêng: khung chính và ô "Hiện tại" trong Temporal context tải hai lần cùng ảnh, và chuyển sang box khác trên cùng ảnh thì tải lại từ đầu.
- Thêm `src/lib/imageCache.ts`: mỗi URL ảnh chỉ `fetch` một lần, giữ dưới dạng blob URL và dùng chung. Giữ tối đa 24 ảnh; chỉ bỏ ảnh không còn khung nào đang hiển thị. Gặp 401 thì làm mới phiên và thử lại một lần (thay cho tham số `session_retry=1` cũ).
- `SessionImage` dùng cache này, nên `FrameViewer` và `WholeFrameViewer` (trang Frames, AI Check) đều được hưởng.
- Chưa đổi header phía server; cache chỉ sống trong một lần mở trang, tải lại trang thì ảnh tải lại.

### Bố cục

- Đầu trang: bỏ eyebrow và tiêu đề chung; còn một dòng gồm tên dự án, số frame, số annotation.
- `ReviewSummary` có thêm chế độ `compact` (trang Review dùng): 8 ô thống kê và thanh tiến độ gộp thành một dải một dòng. Trang Overview vẫn dùng dạng ô như cũ.
- Hàng đợi: bỏ eyebrow và chú thích cuối; ô lọc thấp hơn; mỗi case còn 3 dòng (risk và trạng thái, tên và confidence, object hoặc chuỗi class kèm tên media). Hàng đợi cao bằng cửa sổ và cuộn bên trong.
- Khung chi tiết: tên media, kích thước và thời điểm chuyển lên dòng tiêu đề; nút "Sao chép thông tin" thành nút biểu tượng cạnh nút chuyển case (bỏ khung riêng); ảnh chính cao tối đa `72vh`; "All annotations / Risk only" ghép thành một cụm; danh sách annotation và phần chi tiết annotation nằm chung một khung hai cột (bỏ khung "Annotation Details" riêng); bỏ các câu hướng dẫn lặp lại.
- Form quyết định: tiêu đề "Quyết định", ô ghi chú thấp hơn, chú thích cuối rút còn một dòng.
- Giữ nguyên nhãn, vai trò ARIA và các nút mà test Playwright đang tìm (`Annotations in frame`, `Risk only`, `Why flagged`, các region thống kê, 4 thẻ `<image>` ở case có temporal…). Vẫn dùng control gốc của trình duyệt, chưa chuyển trang này sang component HeroUI.

### Kiểm tra

- `tsc --noEmit`, `npm run build`, `prettier --check`.
- Không có tài khoản đăng nhập và MCP Chrome DevTools không tìm thấy Chrome, nên xem trang bằng Chromium (Playwright) với API giả lập ở 1600px và 390px: case temporal có 4 thẻ ảnh nhưng chỉ 3 lượt tải; chuyển sang box khác trên ảnh đã tải thì không tải thêm; không tràn ngang ở 390px.
- Chưa xem với dữ liệu thật và chưa chạy `npm test`, `npm run test:ui` (cần database test).

## 2026-10-09 · Đăng nhập, Đăng ký: nền xám kiểu Discord, form nằm trong khung

- Nền trang và form dùng bảng xám của giao diện tối mặc định Discord: nền trang `#1e1f22`, khung `#313338`, ô nhập `#1e1f22`, viền khung `#3f4147`. Các màu này đè lên token tối của HeroUI trong `AuthSurface` (`discordGray`).
- Form được bao trong một khung bo góc có viền mảnh và bóng đổ, rộng `max-w-md`, căn giữa. Logo, tiêu đề và liên kết chuyển trang nằm trong khung.
- Bỏ việc đổi sáng/tối theo hệ điều hành: hai trang này và màn hình chờ kiểm tra phiên luôn dùng nền xám tối. Các trang sau đăng nhập vẫn là giao diện sáng.
- Sửa chữ trong thông báo lỗi bị chìm trên nền tối (`--color-muted` của app là màu cố định cho nền sáng).
- Kiểm tra: `npm run build`, chụp màn hình Chromium ở 1440px và 390px. Chưa chạy `npm test` và `npm run test:ui`.

## 2026-10-09 · Đăng nhập, Đăng ký: giao diện tối giản, có chế độ tối

Lấy ý tưởng từ trang đăng nhập của PortSwigger: một cột hẹp căn giữa trên nền trơn.

- Bỏ ảnh nền, bbox, thanh trên và thẻ trắng. Trang chỉ còn logo, tiêu đề, ô nhập, nút và một dòng liên kết chuyển trang, tất cả căn giữa trong cột `max-w-sm`.
- Chế độ tối theo hệ điều hành (`prefers-color-scheme`): `AuthSurface` đặt `data-theme="dark"` hoặc `"light"` để dùng bộ token tương ứng của HeroUI, đổi ngay khi hệ thống đổi. Nền tối là gần đen, nền sáng là xám rất nhạt thay cho trắng. Chưa có nút bật/tắt thủ công và không tự đổi theo giờ.
- Chế độ tối chỉ áp dụng cho hai trang này và màn hình chờ kiểm tra phiên; các trang sau đăng nhập vẫn chỉ có giao diện sáng.
- Xóa `public/auth-frame.jpg` và `src/features/auth/authFrame.js` (ảnh dataset không còn nằm trong repo).
- Kiểm tra: `npm run build`, chụp màn hình Chromium ở chế độ tối (1440px) và sáng (390px). Chưa chạy `npm test` và `npm run test:ui`.

## 2026-10-09 · Đăng nhập, Đăng ký: bố cục một cửa sổ, nền là ảnh đã gán nhãn

Lấy ý tưởng từ account.hoyoverse.com: ảnh nền phủ kín, thanh trên có logo và nút tài khoản, form nổi ở giữa.

- Trang cao đúng một cửa sổ (`h-dvh`, không cuộn trang). Nếu cửa sổ quá thấp thì chỉ thẻ form cuộn bên trong.
- Thanh trên: logo bên trái, hai nút "Đăng nhập" / "Đăng ký" bên phải (là `NavLink` tới `/login` và `/register`, nút của trang hiện tại tô màu nhấn). Bỏ liên kết chuyển trang ở chân thẻ và logo trong thẻ vì đã có trên thanh.
- Nền: `public/auth-frame.jpg` (1280×720) là một khung hình lấy từ dự án đã import trong `storage/`, kèm 20 nhãn của chính khung hình đó trong `src/features/auth/authFrame.js`. Ảnh và bbox vẽ chung trong một SVG `preserveAspectRatio="xMidYMid slice"` nên bbox luôn khớp ảnh ở mọi kích thước cửa sổ. Nhãn có độ tin cậy dưới 0.5 tô màu hổ phách, còn lại màu teal; khung quá nhỏ hoặc trùng vị trí không in chữ.
- Thành phần `Backdrop` cũ (lưới chấm và bbox vẽ tay) bị thay hoàn toàn.
- Lưu ý: `storage/` nằm trong `.gitignore`, còn `public/auth-frame.jpg` sẽ vào repo và hiển thị cho cả người chưa đăng nhập. Nếu ảnh dataset không được phép công khai thì cần đổi ảnh khác.
- Kiểm tra: `npm run build`, chụp màn hình Chromium ở 1440px và 390px. Chưa chạy `npm test` và `npm run test:ui`.

## 2026-10-09 · Đăng nhập, Đăng ký: nền mới có khung bbox trang trí

- Thay gradient teal bằng nền xanh đậm phẳng (`#06312d`) phủ lưới chấm 24px.
- Thêm thành phần `Backdrop` trong `AuthLayout.tsx`: năm khung bbox trang trí quanh thẻ (ba khung "khớp" màu teal có nhãn và điểm tin cậy, một khung "nghi ngờ" màu hổ phách, một khung nét đứt), có tay nắm ở bốn góc. Toàn bộ là `aria-hidden` và chỉ hiện từ `lg` trở lên; mobile chỉ còn lưới chấm.
- `AuthLoading` đổi sang cùng màu nền.
- Kiểm tra: `npm run build`, chụp màn hình Chromium ở 1440px và 390px. Chưa chạy `npm test` và `npm run test:ui`.

## 2026-10-09 · Đăng nhập, Đăng ký: lược chữ, nền phẳng

- Bỏ các dòng mô tả: phụ đề dưới tiêu đề, gợi ý dưới ô nhập ở trang Đăng ký, dòng "Quên mật khẩu?…", dòng chữ dưới thẻ và phần mô tả trong thông báo "Đã tạo tài khoản". Thẻ chỉ còn logo, tiêu đề, ô nhập, nút và liên kết chuyển trang. Quy tắc tên đăng nhập và mật khẩu vẫn hiện khi nhập sai.
- Thông báo khi backend chưa có endpoint đăng ký rút còn "Máy chủ chưa mở chức năng đăng ký."
- Nền: bỏ hai quầng sáng mờ và lớp lưới, thay bằng gradient teal phẳng (`#0a8f82` → `#065f57`); bóng thẻ giảm từ `shadow-2xl` xuống `shadow-xl`. `AuthLoading` dùng nền `#087f73`.
- Kiểm tra: `npm run build`, chụp màn hình Chromium. Chưa chạy `npm test` và `npm run test:ui`.

## 2026-10-09 · Đăng nhập, Đăng ký: thẻ căn giữa trên nền xanh

- `AuthLayout` bỏ bố cục hai cột và hình minh họa khung bbox. Thay bằng nền xanh đậm phủ toàn trang (gradient và lưới của bảng thương hiệu cũ) với một thẻ trắng căn giữa cả hai chiều.
- Hai trang dùng chung một khung: cùng chiều rộng (`max-w-md`), bo góc, padding và thứ tự logo → tiêu đề → mô tả → form → liên kết chuyển trang. Chiều cao thẻ theo nội dung nên thẻ Đăng ký cao hơn thẻ Đăng nhập.
- Ô nhập chuyển sang `variant="secondary"` (nền xám nhạt) để nổi trên thẻ trắng.
- Màn hình chờ kiểm tra phiên (`AuthLoading`) cũng dùng nền xanh để không nháy trắng trước khi vào trang.
- Kiểm tra: `npm run build`, chụp màn hình Chromium ở 1440px và 390px. Chưa chạy `npm test` và `npm run test:ui`.

## 2026-10-09 · Đăng nhập, Đăng ký và logo theo HeroUI v3

### Phân tích HeroUI (heroui.com)

- Phiên bản dùng: `@heroui/react` và `@heroui/styles` 3.2.6. Yêu cầu React ≥ 19 và Tailwind CSS v4 — khớp với dự án (React 19.2, Tailwind 4.1), không cần provider hay plugin Tailwind.
- Nền tảng: React Aria Components lo hành vi và accessibility (focus, bàn phím, validation gốc của form); phần giao diện là CSS thuần theo BEM (`.button`, `.button--primary`, `.input-group__input`…) nằm trong `@layer components`.
- Component dạng ghép (compound): `Alert.Indicator`, `Alert.Content`, `InputGroup.Input`, `InputGroup.Suffix`, `Card.Header`…
- Token là biến CSS oklch, đổi theme bằng cách ghi đè biến: `--accent`, `--background`, `--surface`, `--muted`, `--border`, `--danger`, `--field-background`, `--radius` (0.5rem, các cỡ bo góc suy ra từ đây), `--field-radius`. Dark mode bật bằng class `.dark` hoặc `data-theme="dark"`.
- Ngôn ngữ thị giác: nền xám rất nhạt, bề mặt trắng, ô nhập không viền mà dùng bóng nhẹ, nút bo tròn dạng viên thuốc, vòng focus theo màu nhấn, trạng thái lỗi tô đỏ cả nhãn lẫn ô nhập.

### Đã làm

- Cài HeroUI và import `@heroui/styles` trong `src/styles.css`; đặt `--accent: #087f73` để component HeroUI dùng đúng màu thương hiệu.
- Logo SmartReview: khung bbox bốn góc bao dấu tích trên nền teal. `src/components/Logo.tsx` (`LogoMark`, `Logo`) và `public/favicon.svg`, gắn favicon trong `index.html`.
- `src/features/auth/AuthLayout.tsx`: bố cục hai cột (form bên trái, bảng thương hiệu bên phải, ẩn dưới `lg`), `AuthLoading`, `PasswordField` có nút hiện/ẩn mật khẩu.
- `src/pages/LoginPage.tsx`: viết lại bằng `Form`, `TextField`, `InputGroup`, `Button`, `Alert`. Giữ nguyên nhãn "Tên đăng nhập", "Mật khẩu" và nút "Đăng nhập" để test Playwright hiện có vẫn tìm được.
- `src/pages/RegisterPage.tsx` và route `/register`: tên đăng nhập, mật khẩu, xác nhận mật khẩu. Kiểm tra phía client theo quy tắc trong `docs/auth.md` (tên 3–64 ký tự chữ/số/`_`/`.`/`-`, mật khẩu ≥ 12 ký tự, xác nhận phải khớp). Thành công thì chuyển về `/login` kèm thông báo và điền sẵn tên đăng nhập.
- `AuthGate` dùng chung `AuthLoading` (spinner) thay cho dòng chữ trơn.

### Thay đổi ảnh hưởng toàn app

- Class `.button` cũ của app đổi tên thành `.sr-button` (43 chỗ trong `src`) vì trùng tên với `.button` của HeroUI.
- Base layer của HeroUI đặt `border-color` mặc định là `var(--border)`. Các viền trong app đều chỉ định màu rõ (`border-line`…) nên không đổi.

### Còn mở

- Backend chưa có `POST /api/auth/register`. Trang Đăng ký gọi endpoint này với `{ username, password }`; khi nhận 404 thì báo "Máy chủ chưa mở chức năng tự đăng ký". Cần phía backend bổ sung endpoint (và quyết định vai trò mặc định) thì đăng ký mới hoạt động.
- Chưa chạy `npm test` và `npm run test:ui` (cần database test). Đã kiểm tra bằng `npm run build`, `prettier --check` và chụp màn hình Chromium ở 1440px và 390px cho đăng nhập, đăng nhập sai, đăng ký lỗi validation, đăng ký gửi đi.
- Các trang sau đăng nhập chưa được xem lại bằng mắt sau khi import HeroUI (không có tài khoản để đăng nhập).
- Các trang còn lại vẫn dùng phong cách cũ (góc vuông, `.panel`, `.sr-button`); chưa chuyển sang HeroUI.
