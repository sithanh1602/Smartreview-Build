# SmartReview Architecture

Bộ hồ sơ kiến trúc và đặc tả **hiện trạng**, bằng tiếng Việt, phục vụ bàn giao kỹ thuật và vận hành. Bản gốc bàn giao độc lập tại `/home/vieth/Smartreview-Architecture/`; thư mục này là bản sao được version hóa trên branch `HoangBranch`.

**Source baseline:** `Smartreview-Build` · commit `8a91f5c911173453d9cacc743899c6e018e6fdc3` · ngày kiểm tra **17/10/2026**. Repository gốc không có thay đổi tracked/untracked sau công việc. Không sửa ứng dụng hoặc chạy migrations vào database hiện có.

> **Mốc phân tích:** Bộ tài liệu phản ánh commit `8a91f5c911173453d9cacc743899c6e018e6fdc3`, chưa bao gồm các thay đổi ứng dụng sau mốc này trên `HoangBranch`. Dẫn chiếu source được ghim tới commit baseline để giữ đúng nội dung và số dòng.

## Bắt đầu đọc

1. [Architecture overview](architecture.md): ranh giới hệ thống, components, workflows, AI, persistence, security, deployment và trade-offs.
2. [System specification & design](system-spec-design.md): actors/RBAC, functional/non-functional requirements, use cases, API contracts, data models, data dictionary 21 bảng và cấu hình.
3. [Gallery sơ đồ](diagrams/index.html): duyệt 13 sơ đồ, mở SVG đầy đủ hoặc source D2. Có thể mở file HTML bằng trình duyệt, không cần server.

Tóm tắt kiến trúc: React SPA → một Node native HTTP API → MySQL và artifacts local/Dropbox. Python là subprocess tùy chọn, không là AI HTTP microservice. Engine hiện tại 2D **7.1.0 / policy 5.1.0** và 3D **3d-1.11.0 / policy 1.11.0**. Import rescore, AI Check và Label Verify có tác động dữ liệu khác nhau; xem [AI data flow](diagrams/exports/05-ai-data-flow.svg).

**Điểm cần chú ý trước vận hành:** Dockerfile hiện không copy `policy3d`, trong khi backend eagerly import `policy3d/_scene.json`. Dự kiến image tiêu chuẩn lỗi khi khởi động; kết luận này được trace từ source, chưa chạy Docker xác nhận. Image cũng chưa có Python/weights/`score_boxes.py`. Những thiếu sót được ghi nhận trong [kiến trúc §10](architecture.md#10-deployment-và-cấu-hình), không sửa trong scope tài liệu.

## Danh mục sơ đồ

| # | SVG | Nội dung | Source |
|---|---|---|---|
| 01 | [Bối cảnh hệ thống](diagrams/exports/01-system-context.svg) | Actors, SmartReview và các hệ thống ngoài | [D2](diagrams/sources/01-system-context.d2) |
| 02 | [Container architecture](diagrams/exports/02-container-architecture.svg) | Browser, Node, Python, MySQL và storage | [D2](diagrams/sources/02-container-architecture.d2) |
| 03 | [Thành phần frontend](diagrams/exports/03-frontend-components.svg) | Routes, auth, feature modules, API client và viewer | [D2](diagrams/sources/03-frontend-components.d2) |
| 04 | [Thành phần backend](diagrams/exports/04-backend-components.svg) | HTTP, domain services, core và persistence | [D2](diagrams/sources/04-backend-components.d2) |
| 05 | [Ba luồng AI project 2D](diagrams/exports/05-ai-data-flow.svg) | Import rescore / AI Check / Label Verify và tác động dữ liệu | [D2](diagrams/sources/05-ai-data-flow.d2) |
| 06 | [ERD auth, project và review 2D](diagrams/exports/06-erd-auth-review-2d.svg) | Keys, cardinality và ownership; bản rút gọn | [D2](diagrams/sources/06-erd-auth-review-2d.d2) |
| 07 | [Dữ liệu 3D và CVAT](diagrams/exports/07-erd-3d-cvat.svg) | Bảng riêng, shared users và schema chưa có workflow | [D2](diagrams/sources/07-erd-3d-cvat.d2) |
| 08 | [Import 2D](diagrams/exports/08-sequence-import-2d.svg) | Phần xử lý request và finish nền | [D2](diagrams/sources/08-sequence-import-2d.d2) |
| 09 | [Review → handoff → return](diagrams/exports/09-sequence-review-handoff.svg) | Version, lock, sửa ngoài và revision mới | [D2](diagrams/sources/09-sequence-review-handoff.d2) |
| 10 | [Waymo 3D](diagrams/exports/10-sequence-waymo-3d.svg) | Export, scoring, lazy viewing và review | [D2](diagrams/sources/10-sequence-waymo-3d.d2) |
| 11 | [CVAT Scan QA](diagrams/exports/11-sequence-cvat-scan.svg) | Nhánh 2D / 3D và lịch sử theo user | [D2](diagrams/sources/11-sequence-cvat-scan.d2) |
| 12 | [Guideline → waiver](diagrams/exports/12-sequence-guideline.svg) | Gemini drafts, lựa chọn của con người và giới hạn thực thi | [D2](diagrams/sources/12-sequence-guideline.d2) |
| 13 | [Triển khai hiện tại](diagrams/exports/13-deployment.svg) | Native / Compose và blocker đóng gói xác định tĩnh | [D2](diagrams/sources/13-deployment.d2) |

C4 được dùng cho Context/Container/Component; ERD và sequence bổ sung thiết kế dữ liệu / hành vi. Python children và services trong Node là những ranh giới khác nhau; diagram không biến các TypeScript modules thành containers độc lập. Sơ đồ ưu tiên một góc nhìn mỗi hình, không đưa mọi chi tiết API vào graph.

Màu thống nhất: xanh dương = UI, xanh ngọc = backend/domain, tím = AI/worker, vàng = persistence, xám = hệ thống ngoài. Khung nét đứt biểu thị grouping/boundary hoặc schema chưa có workflow khi có nhãn. **Màu không chứng minh readiness**: các thành phần tùy chọn và phần chưa triển khai đều có nhãn chữ. Mũi tên sequence có thể lược prefix `/api`; source contract đầy đủ ở đặc tả. ERD rút gọn không hiển thị mọi cột; data dictionary mới là danh sách fields đầy đủ.

## Tổ chức artifacts

```text
Smartreview-Architecture/
├── README.md
├── architecture.md
├── system-spec-design.md
└── diagrams/
    ├── index.html                 # gallery offline, link tới SVG và D2
    ├── render.sh                  # validate + render toàn bộ sources
    ├── theme.d2                   # palette và component classes
    ├── fonts/                     # Noto Sans + OFL + notice
    ├── sources/                   # 13 D2, chỉnh sửa được
    └── exports/                   # 13 SVG, fonts bundled
```

Không có scratch scripts, plans, downloaded D2 binary, logs hoặc PNG kiểm tra trong bộ bàn giao. Không có secrets hoặc nội dung `.env`.

## Sửa và tái tạo SVG

Yêu cầu **D2 v0.9.0**, Bash và bốn file Noto Sans đã kèm. Lấy binary tương ứng OS/CPU từ [release chính thức D2 0.9.0](https://github.com/d2lang/d2/releases/tag/v0.9.0); không cần cài D2 vào repository ứng dụng. Script dùng ELK, SVG bundled assets, padding 40 và các font styles explicit. Không cần Graphviz, Python hay browser để render SVG.

Từ thư mục này:

```bash
bash diagrams/render.sh
```

Nếu binary chưa ở PATH:

```bash
D2_BIN=/absolute/path/to/d2 bash diagrams/render.sh
```

Xuất PNG tạm để kiểm tra (giữ ngoài bộ bàn giao):

```bash
PNG_DIR=/tmp/smartreview-diagram-preview bash diagrams/render.sh --png
```

Script validate từng source, kiểm mã thoát rồi render; file SVG tồn tại riêng lẻ không đủ chứng minh compile thành công. D2 hỗ trợ [ELK](https://d2lang.com/tour/elk/), [sequence diagrams](https://d2lang.com/tour/sequence-diagrams/) và [custom fonts](https://d2lang.com/tour/fonts/). Dùng đúng phiên bản/font để tránh thay đổi text metrics/layout. Noto Sans kèm nguyên bản version 2.015, [SIL OFL 1.1](diagrams/fonts/OFL.txt); xem [NOTICE](diagrams/fonts/NOTICE.txt). SVG tự chứa font subsets, có thể xem/phóng lớn độc lập với D2.

Sau khi sửa source: render lại, mở SVG ở kích thước đọc và PNG preview; kiểm tra title, tiếng Việt, contrast, text overflow, crossings và sự khớp với docs. Nếu thay API/schema/engine/artifact contract, cập nhật cả tài liệu, sơ đồ liên quan và baseline commit. Không chỉ sửa SVG export bằng tay vì sẽ mất khi render lại.

## Kiểm chứng

| Hạng mục | Kết quả thực hiện |
|---|---|
| Baseline | HEAD đúng commit nêu trên; repository clean trước/sau |
| Codebase research | Inventory 496 tracked files; trace UI→route→service→engine/worker→SQL/files; phân loại runtime với CLI/demo/benchmark |
| API | Đối chiếu app/auth/projects/projects3d/reviews/frames/cvat/guideline handlers và validators; ghi rõ aliases/default dataset routes |
| Schema | Tổng hợp11 migrations + tracker runner, 21 bảng cuối; không truy vấn live schema |
| TypeScript | `npm run typecheck` thành công (app + tests) |
| Selected pure tests | Sáu tệp core, formats, risk, risk3d, policy, policy3d đều pass; không tuyên bố toàn bộ suite pass |
| D2 / SVG | 13 sources validate và compile thành công với D2 v0.9.0/ELK; render lại từ source; 13 SVG tái tạo có SHA-256 giống từng byte |
| Visual QA | Đã render PNG và kiểm tra trực quan từng hình; sửa bố cục quá dài và contrast ERD, xác minh lại bản cuối |
| Liên kết / consistency | Đã kiểm tra liên kết nội bộ, file/dòng source và đối chiếu versions / quyền / state / persistence |

Các lệnh pure tests đã chạy tại `Smartreview-Build/web`:

```bash
npm run typecheck
node --test tests/core.test.ts tests/risk.test.ts tests/risk3d.test.ts tests/policy.test.ts tests/policy3d.test.ts tests/formats.test.ts
```

**Chưa kiểm chứng runtime:** MySQL/migrations/live records, Dropbox, CVAT/nginx overlay, Gemini/external guideline module, tải models/inference/GPU, Waymo import thật, browser end-to-end, Docker build/start và tải thực tế. Các trạng thái Implemented/Configured/Planned là mô tả source; không dùng chúng như bảo đảm deployment đang hoạt động.

Các dẫn chiếu file:dòng đều được kiểm tra tồn tại, trỏ qua GitHub permalink tới commit baseline và `#Lnn`; không phụ thuộc branch mặc định hay vị trí checkout. Số dòng là gợi ý định vị cho text viewer; trình duyệt không hỗ trợ code-line anchors vẫn mở đúng file.

## Cách duy trì

| Khi thay đổi | Cập nhật chính |
|---|---|
| Auth/roles/API | Đặc tả§2/6; component và workflow liên quan |
| Migration / SQL ownership | Đặc tả§8; ERD06/07; tổng bảng |
| Engine/policy/model | Kiến trúc§7/8, đặc tả§9; AIflow05; version labels |
| Storage / revision / recovery | Kiến trúc§6/8; sequence08–10 |
| Docker / proxy / worker packaging | Kiến trúc§10; đặc tả§10; deployment13 |

Hồ sơ sử dụng [C4 Model](https://c4model.com/diagrams) ở mức phù hợp với modular monolith hiện tại. Những đề xuất cải thiện đều được ghi riêng là chưa thực hiện.
