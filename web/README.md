# SmartReview — Annotation Quality Assurance

React + Vite + Tailwind + React Router, API Node.js. Lõi kiểm tra dữ liệu annotation chuẩn; không cần YOLO, ByteTrack, model hoặc Python để review dataset ảnh. YOLO/ByteTrack là nguồn demo tùy chọn.

```text
Annotated data / optional model output
    → Importer → Normalize + validate → SmartReview Schema 1.0.0
    → Modular Risk Engine → Review UI → MySQL / Human Decisions → Metrics
```

## Projects + Import qua giao diện

```bash
# Chỉ cần nếu MySQL đang dừng:
sudo systemctl start mysql
cd ~/smartreview/web
npm ci
npm run db:migrate
npm run build
npm run dev
```

Mở **http://127.0.0.1:5173/projects** → **+ New Project** → chọn CVAT XML hoặc SmartReview JSON → chọn annotation và ảnh → **Create & Import** → **Start Review**. Không cần sửa code hoặc chạy YOLO.

Thử ngay: chọn `fixtures/upload/annotations.xml` + `fixtures/upload/street.png` cho CVAT, hoặc `fixtures/upload/dataset.json` + cùng ảnh cho JSON. Dataset mẫu không có confidence/track; sẽ có 1 Medium case. Tạo hai project để thử lưu quyết định độc lập.

[Hướng dẫn Projects, upload, storage, API và giới hạn](docs/projects-import.md).

Ảnh PNG/JPEG/WebP/GIF tĩnh, không upload video/ZIP/SVG. Tối đa 1000 ảnh / 200 MB tổng; mỗi ảnh 20 MB / 25 MP; annotation 10 MB. MySQL lưu metadata/reviews; file nằm trong `storage/projects/`. Traffic Demo được đăng ký tự động và giữ review đã lưu trước đây.

## 1. Setup MySQL trên Ubuntu (cổng 3306)

Máy hiện tại đã có MySQL 8.4 và database riêng `smartreview`, `smartreview_test`; credential thật chỉ nằm trong `.env` (không commit). Không cần tạo lại.

Trên máy mới đã cài MySQL:

```bash
cd ~/smartreview/web
npm ci
npm run db:prepare
sudo mysql < .local/mysql-init.sql
npm run db:migrate
```

`db:prepare` tạo `.env` và file SQL riêng tư, password ngẫu nhiên, quyền chỉ trong hai database SmartReview. Nó từ chối ghi đè `.env` đã có. SQL dùng CREATE DATABASE/USER IF NOT EXISTS, không DROP hoặc sửa database khác. File `.local/mysql-init.sql` chứa credential nên không chia sẻ/commit.

Nếu đã có tài khoản DB do bạn tự quản lý, tạo `.env` từ `.env.example` và điền `DB_HOST`/DB*PORT/DB_NAME/DB_USER/DB_PASSWORD, rồi chạy migration. Database phải được admin tạo trước. Không dùng `VITE*` cho credential.

## 2. Chạy backend và frontend

```bash
cd ~/smartreview/web
npm run db:migrate
npm run build
npm run dev
```

Frontend: **http://127.0.0.1:5173** · API: **http://127.0.0.1:3100**.
Case demo: **http://127.0.0.1:5173/review/2-422**.

Chạy riêng: `npm run dev:api` và `npm run dev:ui` trong hai terminal. Production local: `npm run build && npm start`, mở http://127.0.0.1:3100. Dừng service cũ trước nếu trùng cổng. Ctrl+C dừng dev; dữ liệu review vẫn ở MySQL.

Dataset demo và human fixture đã import sẵn. Nếu chưa có demo, chạy `npm run prepare:data`. Đây là bước tùy chọn dùng OpenCV hiện có, không chạy lại YOLO hoặc ghi đè output Python cũ.

## 3. Review và lưu quyết định

1. Mở case, đối chiếu viewer, temporal context và Why Flagged.
2. Chọn **Correct / False Alarm**, **Annotation Error** hoặc **Unsure**.
3. Nếu Error, chọn Error Type. Nếu Class, nhập **Correct Label**; ví dụ truck → car.
4. Thêm Note nếu cần rồi bấm **Save Review**.
5. Khi hiện “Đã lưu vào MySQL”, Reviewed/decision và metrics cập nhật. Reload hoặc mở trình duyệt mới vẫn còn.
6. Sửa lại bằng **Update Review**. Nếu báo conflict, bấm **Tải lại quyết định** để lấy bản mới nhất trước khi sửa.

Có filter Unreviewed/Reviewed/Confirmed Error/Correct/Unsure. Không tự chuyển case trừ khi case vừa lưu không còn khớp bộ lọc đang dùng. localStorage không còn là nguồn review và không tự suy ra quyết định từ dấu “đã xem” cũ.

Chi tiết bảng, API, validation, concurrency và metrics: [docs/human-review.md](docs/human-review.md).

### Import CVAT thực tế

Hỗ trợ **CVAT for images 1.1**, XML + thư mục ảnh, geometry box/polygon/polyline:

```bash
npm run import -- --format cvat-images \
  --input /path/to/annotations.xml \
  --images /path/to/images \
  --out datasets/my-cvat --id my-cvat

SMARTREVIEW_DATASET=datasets/my-cvat/dataset.json npm run dev
```

`--out` phải là thư mục mới; importer không ghi đè dataset đã có. Ảnh được copy vào dataset, tên/thư mục con phải khớp XML. Lỗi file ảnh hoặc geometry chưa hỗ trợ sẽ báo lỗi rõ, không âm thầm bỏ annotation. Importer này **chưa hỗ trợ CVAT video tracks/interpolation, rotated boxes, masks, tags, skeletons hay ZIP**.

Import JSON theo schema chuẩn:

```bash
npm run import -- --format smartreview-json \
  --input /path/to/dataset.json --out datasets/custom
```

Đường dẫn ảnh trong JSON tương đối với file JSON, được copy giữ nguyên cấu trúc. Dữ liệu hợp lệ nhưng không có image path vẫn review metadata được; UI báo chưa có ảnh.

### Chạy fixture không có model / confidence / track

Fixture là ảnh minh họa và annotation thủ công có chủ đích chứa hai lỗi bbox:

```bash
# Chỉ chạy import khi datasets/human chưa có.
npm run import -- --format cvat-images \
  --input fixtures/human/annotations.xml --images fixtures/human \
  --out datasets/human --id human-fixture

SMARTREVIEW_DATASET=datasets/human/dataset.json PORT=3200 npm start
```

Mở **http://127.0.0.1:3200/review**. Có 4 annotations, 2 cảnh báo hình học. Confidence = N/A, track không được tự tạo. Chọn **Tất cả annotations** để review cả annotation không có cảnh báo. Không cần `.venv`, `tracks.json` hay video cho luồng này.

## Dashboard

Total Risk Cases / High / Medium / Reviewed / Unreviewed / Confirmed Errors / Correct / Unsure / Review Progress được lấy từ backend/MySQL. Tất cả chỉ tính suspicious cases của revision hiện tại, không đổi theo filter hoặc phạm vi All. Annotation sạch có thể được review trong All nhưng không làm tăng metrics suspicious.

Giữ viewer, bbox/polygon/polyline, temporal context, N/A khi thiếu signal, filter/sort và router. Check Coverage nằm cuối dashboard trong **Engine Diagnostics**. Trạng thái review lưu DB; draft chỉ tồn tại trong form và mất khi chuyển case chưa Save.

## Cấu trúc chính

| Thư mục/file                                     | Trách nhiệm                                                 |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `core/schema/annotation-v1.schema.json`          | JSON Schema version 1.0.0                                   |
| `core/schema/normalize.mjs`                      | Validate, kiểm tra ID/reference/track, bỏ optional null     |
| `core/importers/demo.mjs`                        | Adapter duy nhất hiểu output tracks.json hiện tại           |
| `core/importers/cvat-images.mjs`                 | Import CVAT image XML 1.1                                   |
| `core/importers/index.mjs`                       | Registry importer, thêm format mới tại đây                  |
| `core/risk/checks/`                              | Các check độc lập                                           |
| `core/risk/engine.mjs`                           | Context theo media + track, tổng điểm và evidence           |
| `server/repository.mjs`                          | Đọc **schema chuẩn**, chạy engine và project dữ liệu cho UI |
| `src/app/`, `src/pages/`, `src/features/review/` | Router/state, màn hình và component review                  |
| `scripts/import.mjs`, `scripts/prepare.mjs`      | CLI import chuẩn/CVAT và chuẩn bị demo tùy chọn             |
| `fixtures/human/`, `tests/`                      | Fixture và kiểm thử độc lập model                           |

Chi tiết schema, check IDs và hợp đồng đầu ra: [docs/architecture.md](docs/architecture.md).

## API và cấu hình

- `GET /api/health`, `/api/meta`, `/api/checks`.
- `GET /api/cases?level=high&scope=all`: mặc định chỉ suspicious cases, `scope=all` gồm tất cả annotations.
- `GET /api/cases/:annotationId`: detail có reference chuẩn, findings, evaluations và context.
- `GET /api/assets/:frameId?dataset=<fingerprint>`: ảnh đã khai báo trong dataset. Fingerprint cũ trả 409 để tránh ghép ảnh mới với annotation cũ.
- Chỉ bind `127.0.0.1`, API ghi review qua POST/PUT; annotation API vẫn chỉ đọc. Dataset được nạp lúc khởi động; sau import/cập nhật hãy restart API và reload UI.

Biến môi trường:

- `SMARTREVIEW_DATASET`: đường dẫn JSON chuẩn. Mặc định `web/datasets/demo/dataset.json`.
- `PORT`: API/production port, mặc định 3100; dev proxy cũng cần đổi nếu thay port.
- `SMARTREVIEW_ROOT`, `SMARTREVIEW_PYTHON`: **chỉ cho chuẩn bị/demo và kiểm thử compatibility**; mặc định project cha và `.venv/bin/python` đã có OpenCV.

Demo chỉ trích ảnh cho risk context (23 ảnh). Để xem ảnh của tất cả 900 frame trong chế độ All, chạy `npm run prepare:data -- --all-frames`; chiếm thêm dung lượng. Schema JSON và risk-report được lưu ở `datasets/demo/`, output Python cũ được giữ nguyên. Các dataset generated không commit; fixture nhỏ được giữ trong source.

## 4. Kiểm thử

```bash
npm run prepare:data                    # optional demo; dùng OpenCV đã có
# Import datasets/human một lần theo hướng dẫn trên nếu chưa có.
npm run build
npm test                               # 31 core + API + MySQL + Project tests
npm run test:core                      # riêng schema/importer/checks, không cần demo
npm run format:check
npx playwright install chromium
npm run test:ui                        # browser tests; ports 3110 + 3111 và DB test riêng
```

Trên Ubuntu 26.04, bản Playwright hiện tại cần fallback đã được kiểm tra:

```bash
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 \
PLAYWRIGHT_BROWSERS_PATH=/home/thanhdev/Documents/Codex/playwright-browsers npx playwright install chromium

PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 \
PLAYWRIGHT_BROWSERS_PATH=/home/thanhdev/Documents/Codex/playwright-browsers npm run test:ui
```

Integration tests dùng dataset demo hiện tại và fixture human; so sánh đủ **9 case/score** với Risk Engine V1. Case 422 vẫn **car .5231 → truck .2928 → car .605, Risk 70**. Browser tests gồm review, filter/sort, context, zoom, refresh/back, lỗi API, mobile, review MySQL, browser context mới và dữ liệu thiếu confidence/track.

## Để dành bước sau

Auth/user management, audit history, CVAT mapping/API, auto-correction, 3D, importer bổ sung và tối ưu dataset lớn. Không thêm risk check trong phase MySQL này. Schema vẫn 1.0.0, engine vẫn 2.0.0, 9 case demo và điểm số giữ nguyên.

## AI Check (Kiểm tra bằng AI)

Mở một dự án READY → AI Check để so sánh nhãn/khung bao với model cục bộ.
Có tiến độ, bằng chứng và khung đề xuất; kết quả AI lưu riêng, không sửa annotation.
Xem [hướng dẫn AI Check](docs/ai-check.md) để cấu hình và hiểu giới hạn.

## Kiểm tra theo ảnh

Mở dự án → **Kiểm tra toàn bộ ảnh** để xem tất cả box, đánh dấu đối tượng thiếu và lưu tiến độ theo ảnh. Chạy `npm run db:migrate` để thêm bảng mới trước khi dùng. Xem [hướng dẫn](docs/frame-review.md).
