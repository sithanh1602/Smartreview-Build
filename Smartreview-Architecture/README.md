# SmartReview — Kiến trúc, đặc tả và thiết kế

Bộ tài liệu phục vụ báo cáo và thuyết trình về SmartReview — hệ thống kiểm tra chất lượng dữ liệu gán nhãn 2D/3D.

## Sản phẩm bàn giao

- **Architecture** — [architecture.md](architecture.md): sơ đồ tổng thể thể hiện cấu trúc hệ thống kèm giải thích các thành phần và luồng xử lý.
- **System Specification & Design** — [system-spec-design.md](system-spec-design.md): mục tiêu, người dùng, yêu cầu, quy trình, thiết kế dữ liệu và AI ở mức tổng quan.

## File hỗ trợ

- Sơ đồ D2 (nguồn có thể chỉnh sửa) trong `diagrams/sources/` và bản SVG trong `diagrams/exports/`; xem nhanh tại `diagrams/index.html`.
- Vẽ lại SVG sau khi sửa nguồn D2: `bash diagrams/render.sh` (cần D2 v0.9.0; đặt `D2_BIN` nếu chưa có trong PATH).

Nội dung được đối chiếu với mã nguồn hiện tại của hệ thống. Các chức năng ghi là tùy chọn chỉ hoạt động khi môi trường tương ứng được cấu hình đầy đủ.
