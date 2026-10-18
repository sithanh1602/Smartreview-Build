<img src="web/public/favicon.svg" alt="Logo SmartReview" width="72" />

# SmartReview

Kiểm tra chất lượng dữ liệu gán nhãn 2D và 3D. SmartReview nhập dataset đã gán nhãn, chấm điểm rủi ro từng box, đưa các box đáng ngờ vào hàng đợi để người review quyết định, rồi lưu quyết định vào MySQL. Lỗi đã xác nhận được bàn giao cho Annotator sửa và nộp lại.

Mã nguồn viết bằng TypeScript: giao diện React + Vite, API Node.js. Các model AI chạy bằng Python trong `.venv`.

```text
Dataset 2D (CVAT, COCO, YOLO, Pascal VOC, LabelMe, KITTI, MOT, Datumaro, SmartReview JSON)
  → chuẩn hoá → [model chấm điểm] → Risk Engine → [model xét box] → hàng đợi review
  → quyết định (MySQL) → bàn giao lỗi → Annotator sửa → nộp lại

Segment Waymo 3D → scene, point cloud → Risk Engine 3D → trình xem 3D → quyết định (MySQL)
```

## Bắt đầu nhanh

```bash
./setup.sh                                  # cài gói và model mặc định
# điền thông tin MySQL vào web/.env
cd web
npm run db:migrate
npm run user:create -- --username <tên> --role leader
npm run dev                                 # http://127.0.0.1:5173
```

Thử với dữ liệu mẫu: đăng nhập tài khoản Leader, vào **Projects → + New Project**, chọn `web/fixtures/upload/annotations.xml` và `web/fixtures/upload/street.png`.

## Cài đặt

Yêu cầu: Node.js ≥ 22.18, MySQL 8, Python 3. GPU chỉ cần cho model xét box (khoảng 4 GB là đủ).

`setup.sh` cài mọi thứ vào trong repo (`web/node_modules`, `.venv`, `model/`). Script không đụng tới MySQL và không ghi đè `web/.env` đã có.

| Lệnh                     | Việc                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `./setup.sh`             | Gói Node, `web/.env`, `.venv` cho project 3D và AI Check, model chấm điểm `yolo11s`    |
| `./setup.sh --verifier`  | Thêm gói Python cho model xét box (transformers, bitsandbytes…)                        |
| `./setup.sh --browser`   | Thêm Chromium cho test giao diện                                                       |
| `./setup.sh --all`       | Tất cả các mục trên                                                                    |
| `./setup.sh --model A,B` | Tải các model đã nêu, ví dụ `--model yolo11m,siglip`                                   |
| `./setup.sh --all_model` | Tải mọi model tải được                                                                 |
| `./setup.sh --no-ai`     | Bỏ phần AI (PyTorch nặng vài GB)                                                       |
| `./setup.sh --check`     | Chỉ kiểm tra máy còn thiếu gì; dùng kèm `--model` / `--all_model` để kiểm tra cả model |

## Model

Khi bấm **Tạo và nhập dữ liệu**, popup cho chọn hai loại model trước khi dữ liệu được xử lý. Popup chỉ liệt kê model có trong hai thư mục dưới đây (đã có trong `.gitignore`):

| Thư mục                | Dùng để                               | Tên trong `setup.sh`                                                  |
| ---------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| `model/Model_rescore/` | Chấm điểm box, tìm vật bị sót         | `yolo11n`, `yolo11s` (mặc định), `yolo11m`, `yolo26n`, `yolo26s-coco` |
| `model/Model_bbox/`    | Đọc phần ảnh trong box, xét đúng nhãn | `siglip` (1,5 GB, quét), `qwen` (7,5 GB, xem lại)                     |

Bản fine-tune `yolo26s` (BDD100K) tải bằng `./setup.sh --model yolo26s` từ [GitHub Release `model-yolo26s-bdd100k-v1`](https://github.com/sithanh1602/Smartreview-Build/releases/tag/model-yolo26s-bdd100k-v1); script kiểm tra sha256 trước khi đặt vào `model/Model_rescore/yolo26s.pt`. Mỗi file `.pt` khác đặt vào `Model_rescore/` cũng được popup liệt kê, dùng ngưỡng chung. Chi tiết: [web/docs/confidence-checks.md](web/docs/confidence-checks.md), [web/docs/label-verifier.md](web/docs/label-verifier.md).

## Tài khoản và vai trò

Đăng ký luôn tạo tài khoản Thành viên. Tài khoản Leader tạo bằng `npm run user:create -- --role leader`.

| Vai trò trong project | Việc chính                                                          |
| --------------------- | ------------------------------------------------------------------- |
| Leader                | Tạo project, nhập dữ liệu, chọn model, thêm thành viên, xoá project |
| Reviewer              | Review, bàn giao lỗi, thêm Annotator                                |
| Annotator             | Xem lỗi được bàn giao, sửa nhãn, nộp lại                            |

Leader thêm thành viên trong khung **Thành viên project** của trang project. Chi tiết: [web/docs/project-roles.md](web/docs/project-roles.md).

## Cấu trúc repo

| Đường dẫn      | Nội dung                                                     |
| -------------- | ------------------------------------------------------------ |
| `web/src/`     | Giao diện React                                              |
| `web/server/`  | API Node: tài khoản, project, review, bàn giao, AI, CVAT     |
| `web/core/`    | Schema, importer, Risk Engine 2D (`risk/`) và 3D (`risk3d/`) |
| `web/policy/`  | Policy 2D theo nhãn; `web/policy3d/` cho 3D                  |
| `web/scripts/` | CLI: migrate, tài khoản, import, verify                      |
| `web/tests/`   | Test Node và test trình duyệt                                |
| `web/docs/`    | Tài liệu chi tiết                                            |
| `ai-service/`  | Script Python: chấm điểm, AI Check, dựng dữ liệu demo        |
| `model/`       | Model do `setup.sh` tải về (không đưa vào Git)               |
| `docker/`      | Chạy bằng Docker Compose                                     |

Risk Engine 2D hiện là `7.1.0`. Các thư mục `web/core/risk_v*/` giữ phiên bản cũ để project đã nhập tiếp tục chấm đúng phiên bản của nó.

## Lệnh thường dùng

Chạy trong `web/`.

| Lệnh                         | Tác dụng                                             |
| ---------------------------- | ---------------------------------------------------- |
| `npm run dev`                | API (cổng 3100) và giao diện (cổng 5173)             |
| `npm run build`, `npm start` | Build giao diện và chạy bản build ở cổng 3100        |
| `npm run typecheck`          | Kiểm tra kiểu TypeScript                             |
| `npm test`                   | Test Node (phần lớn cần database `smartreview_test`) |
| `npm run test:core`          | Test lõi, không cần MySQL                            |
| `npm run test:ui`            | Test trình duyệt (Playwright)                        |
| `npm run db:migrate`         | Tạo hoặc cập nhật bảng MySQL                         |
| `npm run user:create -- …`   | Tạo tài khoản                                        |
| `npm run verify -- …`        | Xét nhãn bằng model ảnh từ dòng lệnh                 |

## Tài liệu

| Chủ đề                                 | File                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Chạy chi tiết, kết nối MySQL           | [web/README.md](web/README.md)                                                                                 |
| Kiến trúc, schema, danh sách check     | [web/docs/architecture.md](web/docs/architecture.md)                                                           |
| Nhập dữ liệu, định dạng, giới hạn file | [web/docs/projects-import.md](web/docs/projects-import.md)                                                     |
| Review và bàn giao                     | [web/docs/human-review.md](web/docs/human-review.md), [web/docs/review-handoff.md](web/docs/review-handoff.md) |
| Model chấm điểm                        | [web/docs/confidence-checks.md](web/docs/confidence-checks.md)                                                 |
| Model xét box (label verifier)         | [web/docs/label-verifier.md](web/docs/label-verifier.md)                                                       |
| Project 3D và Risk Engine 3D           | [web/docs/projects-3d.md](web/docs/projects-3d.md), [web/docs/risk-3d.md](web/docs/risk-3d.md)                 |
| Tài khoản, phân quyền                  | [web/docs/auth.md](web/docs/auth.md)                                                                           |
| Lịch sử thay đổi giao diện             | [web/docs/frontend-changelog.md](web/docs/frontend-changelog.md)                                               |
| Docker                                 | [docker/README.md](docker/README.md)                                                                           |

## Không đưa vào Git

`web/.env`, `web/datasets/`, `web/storage/`, `model/`, file `*.pt` và `node_modules/`. Ảnh và nhãn của dataset không được gửi lên dịch vụ bên ngoài.
