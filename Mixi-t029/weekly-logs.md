# Weekly Logs – Nhóm T028 · SmartReview

Cập nhật 18/10/2026 · Nhóm T028

## Thông tin chung

Nhóm T028 (AI thực chiến – K4) làm SmartReview, công cụ kiểm tra chất lượng nhãn 2D/3D theo hướng confidence-based human review, trong 17 ngày: chọn đề tài thứ Sáu 02/10/2026, deploy tối 17/10, hoàn thành 18/10/2026.

| Thành viên | Vai trò chính | Tài khoản GitHub |
| --- | --- | --- |
| Cầm Vũ Ngọc Thạch | Trưởng nhóm: chọn đề tài, phân công; rule base confidence; nghiên cứu và triển khai model; viết báo cáo | Thachcvn, Thach-123-aa |
| Lê Sĩ Thành | Xây ý tưởng, demo sản phẩm; database, backend 2D; deploy | sithanh1602 |
| Trần Tuấn Anh | Ý tưởng mở rộng; giao diện; backend và tool 3D; quay demo | tuananh244, TaZek |
| Nguyễn Việt Hoàng | Fine-tune model; xây graph (sơ đồ kiến trúc) | hoangisreal, Hoang_Nguyen |
| Nguyễn Đình Độ | Tìm dữ liệu 3D; làm slide | — |

Ngày và việc trong log lấy từ phân công của nhóm và lịch sử commit của repo Smartreview-Build (commit đầu tiên 07/10, commit cuối 18/10).

## Tuần 1 · 02/10 – 08/10: chọn đề tài và dựng khung sản phẩm

Nhóm chốt đề tài ngày 02/10 và có khung sản phẩm đầu tiên trên GitHub ngày 07/10: nền tảng SmartReview chạy được, có đăng nhập/đăng xuất.

| Thành viên | Việc đã làm | Kết quả |
| --- | --- | --- |
| Cầm Vũ Ngọc Thạch | Chọn đề tài confidence-based human review; chia việc cho 5 người; bắt đầu nghiên cứu cách dùng confidence để chấm rủi ro | Đề tài và bảng phân công (02/10) |
| Lê Sĩ Thành | Xây ý tưởng sản phẩm; dựng demo đầu tiên, database và backend 2D | Initial commit nền tảng QA nhãn; chức năng login/logout (07/10) |
| Trần Tuấn Anh | Lên ý tưởng mở rộng cho sản phẩm | Ý tưởng mở rộng giao diện và 3D, triển khai từ tuần 2 |
| Nguyễn Việt Hoàng | Chuẩn bị hướng fine-tune model |  |
| Nguyễn Đình Độ | Tìm nguồn dữ liệu 3D |  |

Còn trống: kết quả tuần 1 của Hoàng và Độ chưa có trong repo, nhóm bổ sung trực tiếp vào ô.

**Kế hoạch tuần 2:** demo AI Check, risk engine có rule base confidence, phân quyền project, bắt đầu phần 3D.

## Tuần 2 · 09/10 – 15/10: xây lõi confidence, backend và 3D

Tuần nặng nhất: risk engine đi từ bản 3 lên 7.1.0, confidence thành tín hiệu chấm điểm độc lập (13/10), có rescore cho dữ liệu chưa có điểm (15/10) và Risk Engine 3D đầu tiên (13/10).

| Thành viên | Việc đã làm | Kết quả (ngày commit) |
| --- | --- | --- |
| Cầm Vũ Ngọc Thạch | Rule base confidence: check confidence thấp, sụt confidence trong track; YOLO chấm lại box người vẽ và tìm vật bị sót; benchmark trên BDD100K | Engine 2.2.0, confidence là tín hiệu riêng (13/10); engine 7.1.0 rescore + vật bị sót (15/10) |
| Lê Sĩ Thành | Demo AI Check; tự mở tunnel tới database; upload và xử lý ca box lệch | AI check demo (09/10); auto tunnel (12/10); upload ca rủi ro (15/10) |
| Trần Tuấn Anh | Chuyển codebase sang TypeScript; giao diện review, đa ngôn ngữ, giao diện sáng/tối; policy dạng dữ liệu; phân quyền Leader, Reviewer, Annotator; backend và tool 3D | Engine v3 + TypeScript (09/10); lưu trữ chung Dropbox (10/10); engine v4 theo policy (11/10); vai trò project, xuất CVAT, khởi đầu 3D (12/10); label verifier + Risk Engine 3D (13/10); engine 3d-1.9.0 (15/10) |
| Nguyễn Việt Hoàng | Fine-tune YOLO trên BDD100K để làm model chấm điểm | Chạy fine-tune, đưa vào repo đầu tuần 3 |
| Nguyễn Đình Độ | Tìm và chuẩn bị dữ liệu 3D | Segment Waymo Open Dataset v2 cho project 3D |

**Khó khăn và cách xử lý**

- File CVAT của annotator không có confidence → cho YOLO chấm lại từng box (rescore).
- Rescore của box đúng chỉ khoảng 0,27; ngưỡng 0,5 gắn cờ oan hơn 60% box đúng → đổi sang ngưỡng riêng 0,02.
- Nhầm car ↔ truck là lỗi bị sót nhiều nhất; ghi nhận là giới hạn.
- Point cloud 3D rất nặng (534 MB một segment) → đo sẵn lúc import, engine 3D chỉ đọc scene.json.
- Tunnel SSH tới MySQL hay timeout → tăng thời gian chờ kết nối từ 5 lên 20 giây.

**Kế hoạch tuần 3:** đưa model fine-tune vào app, hoàn thiện bàn giao lỗi qua CVAT, deploy, quay demo, viết báo cáo và làm slide.

## Tuần 3 · 16/10 – 18/10: hoàn thiện, deploy và bàn giao

Sản phẩm được deploy lên Google Cloud tối 17/10 (SmartReview, CVAT và AI engine chung một máy); ngày 18/10 sửa lỗi sau deploy và hoàn thành demo, báo cáo, graph, slide.

| Thành viên | Việc đã làm | Kết quả (ngày commit) |
| --- | --- | --- |
| Cầm Vũ Ngọc Thạch | Triển khai model vào app: chọn model chấm điểm lúc import; viết báo cáo | Import chọn model, tự tải khi dùng lần đầu (16/10); báo cáo (18/10) |
| Lê Sĩ Thành | Panel Scan QA trong CVAT; Redis cho hàng đợi; Docker; deploy; sửa lỗi sau deploy | Panel CVAT local (16/10); Redis ổn định (17/10); deploy GCP tối 17/10; tối ưu PointPillars 3D và các fix Docker, YOLO, scan (18/10) |
| Trần Tuấn Anh | Giao diện import chọn model, panel review dễ đọc; bàn giao lỗi qua CVAT; bàn giao 3D cho annotator; quay demo | Đăng ký thành viên, bàn giao CVAT (17/10); popup chọn model, bàn giao 3D, cảnh báo hết phiên, sửa panel CVAT (18/10); video demo |
| Nguyễn Việt Hoàng | Đưa model fine-tune vào app; xây graph kiến trúc hệ thống | yolo26s fine-tune là model rescore chọn được (16/10); tài liệu và sơ đồ kiến trúc (17/10) |
| Nguyễn Đình Độ | Làm slide thuyết trình | Slide 29 trang (18/10) |

**Khó khăn và cách xử lý**

- Docker trên máy chủ thiếu thư viện đồ hoạ (lỗi libxcb) → dùng opencv-python-headless.
- PyTorch CPU không cài được từ nguồn mặc định → thêm extra-index-url của PyTorch.
- Thiếu policy3d trong container → copy vào image runtime.

## Tổng kết và sản phẩm bàn giao

Sau 17 ngày nhóm bàn giao một sản phẩm đã deploy, kiểm tra nhãn 2D và 3D. Trên bộ 100 ảnh test BDD100K, người review xem 19% số box và bắt 90% lỗi box.

| Sản phẩm | Người phụ trách chính | Hoàn thành |
| --- | --- | --- |
| Web app SmartReview (2D, 3D, phân quyền, bàn giao lỗi) | Lê Sĩ Thành, Trần Tuấn Anh | 18/10 |
| Risk engine 7.1.0 với rule base confidence và rescore | Cầm Vũ Ngọc Thạch | 15/10 |
| Model yolo26s fine-tune trên BDD100K | Nguyễn Việt Hoàng | 16/10 |
| Risk Engine 3D và trình xem 3D | Trần Tuấn Anh | 18/10 |
| Dữ liệu 3D (Waymo) | Nguyễn Đình Độ | tuần 2 |
| Bản deploy trên Google Cloud | Lê Sĩ Thành | 17/10 |
| Video demo | Trần Tuấn Anh | 18/10 |
| Báo cáo | Cầm Vũ Ngọc Thạch | 18/10 |
| Graph kiến trúc hệ thống | Nguyễn Việt Hoàng | 17/10 |
| Slide thuyết trình | Nguyễn Đình Độ | 18/10 |
