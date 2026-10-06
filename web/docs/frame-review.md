# Kiểm tra theo ảnh và đánh dấu đối tượng thiếu

Mở Projects → dự án READY → **Kiểm tra toàn bộ ảnh**.

1. Mỗi ảnh hiển thị toàn bộ bbox/polygon/polyline hiện có. Ảnh không có annotation vẫn xuất hiện. Mask/cuboid có thông báo chưa hỗ trợ hiển thị.
2. Lọc Chưa hoàn tất, Đã kiểm tra, Chưa có annotation hoặc Có vùng thiếu đã lưu.
3. Nếu thấy đối tượng cần gán nhãn nhưng chưa có box: chọn **Vẽ vùng thiếu**, kéo chuột bao quanh đối tượng. Có thể thêm bằng tọa độ và chỉnh X/Y/Rộng/Cao theo pixel gốc.
4. Ghi tên đối tượng/ghi chú tùy chọn. Vùng đỏ nét đứt là ghi chú thiếu đối tượng do người kiểm tra tạo; không phải dự đoán AI.
5. Chọn Đang kiểm tra/chưa chắc hoặc Đã kiểm tra xong ảnh, rồi **Lưu đánh giá ảnh**. Chuyển ảnh có thay đổi chưa lưu sẽ hỏi giữ lại hay bỏ thay đổi.
6. Muốn đánh giá nhãn/box hiện có: chọn khung hoặc annotation trong danh sách, mở trang đánh giá từng annotation.

Đã kiểm tra ảnh không có nghĩa mọi annotation đúng. Ảnh có lỗi thiếu vẫn có thể được đánh dấu đã xem xong. Tiến độ ảnh độc lập tiến độ đánh giá từng annotation.
Ảnh chưa có file cache (ví dụ demo video) không thể được xác nhận đã kiểm tra.
Không có tự phát hiện đối tượng thiếu; người kiểm tra phải xem ảnh và đánh dấu.

## Chạy

Trong thư mục web, chạy `npm run db:migrate` một lần để thêm bảng `frame_reviews`, rồi `npm run dev`.
Migration 003 chỉ thêm bảng mới; không sửa bảng/annotation/quyết định cũ.
Khởi chạy bản build: `npm run build`, sau đó `npm start`.

## Kiến trúc

- Route UI: `/projects/:projectId/frames/:frameId?`.
- GET `/api/projects/:projectId/frames`: danh sách mọi frame, số annotation và tiến độ theo ảnh.
- GET `/api/projects/:projectId/frames/:frameId`: ảnh, toàn bộ annotation, đánh giá ảnh.
- PUT `/api/projects/:projectId/frames/:frameId/review`: lưu status, missing_regions, note với dataset_revision/version.
- `frame_reviews`: khóa dataset_revision + SHA256(frame ID), JSON vùng thiếu, trạng thái, phiên bản và thời gian UTC.
- Kiểm tra xung đột phiên bản, same-origin, tọa độ nằm trong ảnh; tối đa 50 vùng/ảnh và 64 KB mỗi lần lưu.
- AI Check vẫn giữ code/báo cáo cũ nhưng bỏ nút khỏi dashboard chính; không chạy AI trong quy trình này.

Xuất báo cáo lỗi và đối chiếu bản annotation đã sửa là bước tiếp theo.
