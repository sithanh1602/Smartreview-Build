<img src="web/public/favicon.svg" alt="Logo SmartReview" width="72" />

# SmartReview

Nền tảng kiểm tra chất lượng annotation (Annotation QA): nhập dataset đã gán nhãn, chấm điểm rủi ro từng box, đưa các box đáng ngờ vào hàng đợi cho người review và lưu quyết định vào MySQL.

Toàn bộ mã nguồn viết bằng **TypeScript**: giao diện React + Vite, API Node.js.

```text
Dataset đã gán nhãn (CVAT XML / COCO / SmartReview JSON)
    → Importer → Chuẩn hóa + validate → Schema 1.0.0
    → Risk Engine → Hàng đợi review → Quyết định của người review (MySQL) → Số liệu
```

## Bắt đầu nhanh

```bash
./setup.sh                 # cài gói Node, tạo web/.env nếu chưa có
# điền thông tin MySQL vào web/.env
cd web
npm run db:migrate         # tạo bảng (cần kết nối MySQL)
npm run user:create -- --username <tên> --role reviewer
npm run dev                # http://127.0.0.1:5173
```

Thử ngay không cần dữ liệu riêng: vào **Projects → + New Project**, chọn `web/fixtures/upload/annotations.xml` và `web/fixtures/upload/street.png`.

## Cài đặt

`setup.sh` là điểm vào duy nhất để cài các gói liên quan. Script không đụng tới MySQL và không ghi đè `web/.env` đã có.

| Lệnh                   | Cài gì                                                           | Khi nào cần                  |
| ---------------------- | ---------------------------------------------------------------- | ---------------------------- |
| `./setup.sh`           | Gói Node của `web/`, tạo `web/.env` từ `.env.example`            | Luôn cần                     |
| `./setup.sh --ai`      | Thêm Python venv `.venv` với Ultralytics (kèm PyTorch) và OpenCV | Dùng AI Check hoặc dựng demo |
| `./setup.sh --browser` | Thêm Chromium của Playwright                                     | Chạy `npm run test:ui`       |
| `./setup.sh --all`     | Tất cả các mục trên                                              |                              |
| `./setup.sh --check`   | Không cài gì, chỉ báo máy đang thiếu gì                          | Kiểm tra nhanh môi trường    |

Yêu cầu trên máy:

| Thành phần | Phiên bản              | Ghi chú                                                              |
| ---------- | ---------------------- | -------------------------------------------------------------------- |
| Node.js    | ≥ 22.18                | Server chạy thẳng file `.ts`, không có bước build cho backend        |
| MySQL      | 8.x                    | Dùng MySQL của nhóm qua SSH tunnel (xem `web/README.md`) hoặc Docker |
| Python     | 3.x, tùy chọn          | Chỉ cho AI Check và dataset demo; review dataset ảnh không cần       |
| Model YOLO | `yolo11n.pt`, tùy chọn | Đặt tại `ai-service/yolo11n.pt`; file model không nằm trong repo     |

Muốn chạy trọn gói bằng container (kèm MySQL riêng) thì xem [docker/README.md](docker/README.md).

## Cấu trúc repo

| Đường dẫn       | Nội dung                                                          |
| --------------- | ----------------------------------------------------------------- |
| `web/`          | Ứng dụng chính: giao diện, API, risk engine, test                 |
| `web/src/`      | Giao diện React (`pages/`, `features/`, `components/`, `lib/`)    |
| `web/server/`   | API Node: auth, projects, reviews, frame review, AI Check         |
| `web/core/`     | Lõi không phụ thuộc web: schema, importers, risk engine           |
| `web/shared/`   | Quy tắc validate dùng chung cho giao diện và server               |
| `web/scripts/`  | CLI: import dataset, migrate, quản lý tài khoản                   |
| `web/tests/`    | Test Node (`*.test.ts`) và test trình duyệt (`browser/*.spec.ts`) |
| `web/fixtures/` | Dataset mẫu nhỏ để thử import                                     |
| `web/docs/`     | Tài liệu chi tiết từng phần                                       |
| `ai-service/`   | Script Python tùy chọn: detect, tracking, dựng dữ liệu demo       |
| `docker/`       | Chạy bằng Docker Compose                                          |
| `setup.sh`      | Cài các gói cần thiết                                             |

Risk engine có ba thư mục, mỗi thư mục một đời:

| Thư mục             | Phiên bản     | Vai trò                                                               |
| ------------------- | ------------- | --------------------------------------------------------------------- |
| `web/core/risk/`    | 4.0.0         | Engine hiện tại, dùng cho mọi project import mới                      |
| `web/core/risk_v1/` | 2.0.0 / 2.1.0 | Giữ cho project đã import trước đây, để điểm và fingerprint không đổi |
| `web/core/risk_v3/` | 3.0.0         | Bản chụp để đối chiếu, không dùng khi chạy                            |

## Lệnh thường dùng

Chạy trong `web/`.

| Lệnh                       | Tác dụng                                                 |
| -------------------------- | -------------------------------------------------------- |
| `npm run dev`              | API (cổng 3100) và giao diện (cổng 5173), tự tải lại     |
| `npm run build`            | Build giao diện vào `dist/`                              |
| `npm start`                | Chạy bản đã build tại http://127.0.0.1:3100              |
| `npm run typecheck`        | Kiểm tra kiểu TypeScript cho mã ứng dụng và test         |
| `npm test`                 | Test Node; phần lớn cần database test `smartreview_test` |
| `npm run test:core`        | Test lõi schema, importer, risk engine; không cần MySQL  |
| `npm run test:ui`          | Test trình duyệt bằng Playwright                         |
| `npm run format`           | Định dạng mã bằng Prettier                               |
| `npm run db:migrate`       | Tạo hoặc cập nhật bảng MySQL                             |
| `npm run user:create -- …` | Tạo tài khoản reviewer hoặc annotator                    |
| `npm run import -- …`      | Import dataset bằng dòng lệnh                            |

## Tài liệu

| Chủ đề                                 | File                                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| Hướng dẫn chạy chi tiết, kết nối MySQL | [web/README.md](web/README.md)                                   |
| Kiến trúc, schema, danh sách check     | [web/docs/architecture.md](web/docs/architecture.md)             |
| Projects, upload, giới hạn file        | [web/docs/projects-import.md](web/docs/projects-import.md)       |
| Review và lưu quyết định               | [web/docs/human-review.md](web/docs/human-review.md)             |
| Kiểm tra theo ảnh, đánh dấu vùng thiếu | [web/docs/frame-review.md](web/docs/frame-review.md)             |
| Đăng nhập, phân quyền, tài khoản       | [web/docs/auth.md](web/docs/auth.md)                             |
| AI Check                               | [web/docs/ai-check.md](web/docs/ai-check.md)                     |
| Lịch sử thay đổi giao diện             | [web/docs/frontend-changelog.md](web/docs/frontend-changelog.md) |
| Chạy bằng Docker                       | [docker/README.md](docker/README.md)                             |

## Quy ước TypeScript

- Import nội bộ ghi rõ đuôi `.ts`; import chỉ để lấy kiểu dùng `import type`.
- Không dùng `enum` hay `namespace`, vì Node chỉ xóa chú thích kiểu chứ không biên dịch.
- Mã ứng dụng kiểm tra ở chế độ `strict` (`web/tsconfig.json`); test dùng cấu hình lỏng hơn (`web/tests/tsconfig.json`).
- Kiểu dùng chung nằm ở `core/schema/types.ts`, `core/risk/types.ts`, `server/types.ts` và `src/types.ts`.

## Không đưa vào Git

`.env`, `web/datasets/`, `web/storage/`, file model (`*.pt`) và `node_modules/` đã nằm trong `.gitignore`. Ảnh và nhãn của dataset không được đưa lên dịch vụ bên ngoài.
