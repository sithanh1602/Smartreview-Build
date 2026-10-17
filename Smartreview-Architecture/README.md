# SmartReview — Kiến trúc, đặc tả và thiết kế tổng quan

Bộ tài liệu tập trung vào **cấu trúc hệ thống, chức năng chính và cách các thành phần phối hợp**. Mức chi tiết đủ để hiểu và trình bày hệ thống, không đi vào danh mục endpoints hoặc từng cột database.

**Source baseline:** `0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f` trên HoangBranch, bao gồm thay đổi lựa chọn YOLO26s. Dẫn chiếu source được ghim vào commit này. Application code không bị thay đổi bởi việc lập tài liệu.

## Nội dung

- [Kiến trúc hệ thống](architecture.md): bối cảnh, cấu trúc, thành phần, data flow và giới hạn.
- [Đặc tả và thiết kế](system-spec-design.md): mục tiêu, actors, yêu cầu, use cases, mô hình dữ liệu và thiết kế tổng quan.
- [Gallery sơ đồ](diagrams/index.html): mở bằng trình duyệt sau khi tải bộ tài liệu về máy.

| Sơ đồ | Nội dung | Nguồn chỉnh sửa |
|---|---|---|
| [01 · System Context](diagrams/exports/01-system-context.svg) | Người dùng và các hệ thống ngoài | [D2](diagrams/sources/01-system-context.d2) |
| [02 · Container Architecture](diagrams/exports/02-container-architecture.svg) | React, Node, Python, MySQL và storage | [D2](diagrams/sources/02-container-architecture.d2) |
| [03 · Components](diagrams/exports/03-components.svg) | Các nhóm module và trách nhiệm | [D2](diagrams/sources/03-components.d2) |
| [04 · Workflows](diagrams/exports/04-workflows.svg) | Luồng dữ liệu 2D và 3D ở mức tổng quan | [D2](diagrams/sources/04-workflows.d2) |

C4 được dùng cho ba góc nhìn đầu. Màu xanh dương: UI; xanh ngọc: backend; tím: AI/worker; vàng: persistence; xám: hệ ngoài. Những chức năng tùy chọn có nhãn chữ. Mũi tên cấu trúc thể hiện phụ thuộc/giao tiếp, không biểu diễn đầy đủ thứ tự hoặc concurrency của từng request.

## Tái tạo sơ đồ

Dùng D2 **v0.9.0**, ELK và Noto Sans đã kèm. Binary có tại [D2 release chính thức](https://github.com/d2lang/d2/releases/tag/v0.9.0).

```bash
bash diagrams/render.sh
```

Nếu D2 chưa ở PATH:

```bash
D2_BIN=/absolute/path/to/d2 bash diagrams/render.sh
```

Xem PNG tạm ngoài bộ bàn giao:

```bash
PNG_DIR=/tmp/smartreview-preview bash diagrams/render.sh --png
```

Sửa D2 trong `diagrams/sources/`, rồi render lại SVG. Theme và font nằm trong `diagrams/`; [giấy phép font](diagrams/fonts/OFL.txt) và [NOTICE](diagrams/fonts/NOTICE.txt) được giữ kèm. Không cần Python hoặc application runtime để render các SVG.

## Kiểm chứng và phạm vi

- Đối chiếu các nhận định chính với source của baseline, có dẫn chiếu file/dòng trong tài liệu.
- Validate, render SVG, kiểm tra PNG trực quan và kiểm tra liên kết tài liệu.
- Đây là hồ sơ implementation hiện tại theo source; không trình bày tính năng dự kiến như đã hoạt động.
- Chưa chạy end-to-end MySQL/Dropbox/CVAT/Gemini/models/Docker, không khẳng định runtime readiness, SLA hay accuracy tổng quát.
- Không thay đổi application code hoặc database.

Bản bàn giao độc lập nằm tại `/home/vieth/Smartreview-Architecture/`; bản version hóa nằm trong thư mục `Smartreview-Architecture/` trên HoangBranch. Khi cập nhật source cần rà lại sơ đồ và nội dung liên quan.
