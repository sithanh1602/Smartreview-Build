# SmartReview — Đặc tả hệ thống và thiết kế

**Tiếng Việt · bàn giao cho kỹ thuật / vận hành · 17/10/2026**  
**Baseline:** `8a91f5c911173453d9cacc743899c6e018e6fdc3`

Đặc tả được tái dựng từ implementation, không là cam kết tính năng tương lai. “Phải” trong bảng yêu cầu dưới đây là hành vi code đang áp dụng; không có nghĩa đã kiểm chứng toàn bộ bằng runtime. Các tích hợp, model inference, live schema và Docker chưa được chạy xác nhận. Xem [kiến trúc](architecture.md) và [phương pháp kiểm chứng](README.md#kiểm-chứng).

## 1. Mục tiêu và phạm vi

Hệ thống giúp nhóm annotation ưu tiên kiểm tra bbox 2D/cuboid 3D, quyết định đúng/sai/không chắc, đánh dấu vùng thiếu, bàn giao sửa nhãn và đánh giá kết quả sửa. Dữ liệu vào chủ yếu là annotation exports + ảnh hoặc một segment Waymo v2. Đầu ra là canonical datasets/scenes, risk findings, quyết định review và báo cáo handoff/scan.

Trong phạm vi implemented: auth/RBAC, projects 2D/3D, import/validation/scoring, viewer, reviews, handoff/return 2D, AI tùy chọn, Gemini guideline drafts, CVAT scan read-only, local/Dropbox storage. Ngoài phạm vi hiện tại: auto annotation writeback CVAT, video streaming/upload trực tiếp, multi-segment 3D tổng quát, durable distributed queue, append-only audit log, tự biên dịch guideline bất kỳ thành rule, self-hosted AI HTTP API riêng.

Nguồn entry points: [web/server/index.ts:15](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/index.ts#L15), [web/server/app.ts:43](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/app.ts#L43), [web/src/app/router.tsx:21](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/src/app/router.tsx#L21).

## 2. Actors và mô hình phân quyền

Tài khoản có `leader/member`; member giữ `reviewer/annotator` riêng trong từng project. 2D và 3D có membership/invite tables riêng. Không dùng vai trò UI chọn theo tab như quyền server.

| Thao tác | Leader được thấy project | Reviewer trong project | Annotator trong project |
|---|---|---|---|
| Tạo project / import / resume 2D | Có | Không | Không |
| Xem dashboard / media / risk / reviews | Có | Có | Có |
| Ghi case / frame 2D hoặc cuboid/track 3D | Có | Có | Có |
| Chạy AI Check / Label Verify, rescore 3D | Có | Không | Không |
| Xem danh sách người | Có | Có | Có |
| Thêm annotator bằng username | Có | Có | Không |
| Thêm reviewer / đổi vai trò / xóa member | Có | Không | Không |
| Tạo / đọc / đổi invite code | Có | Không | Không |
| Send handoff 2D | Có | Có | Không |
| Return handoff | Có (theo code hiện tại) | Không | Chỉ annotator được gửi |
| Reopen handoff | Có | Không | Không |
| Ẩn / hiện | Chỉ creator | Không | Không |
| Xóa | Creator; 2D legacy không creator cho leader xóa | Không | Không |
| Scan CVAT / đọc scan của chính mình | Có | Có | Có |
| Debug raw CVAT job; guideline analyze | Global leader | Không | Không |

Project hidden không hiển thị cho leader khác nhưng member đã join vẫn giữ quyền. 2D legacy có creator null cho phép leader xóa; 3D `owns` yêu cầu đúng creator. Invite code gồm 10 ký tự, tái sử dụng được, một code mỗi project-role; đổi code không xóa người đã join. GET invites có thể tạo code lần đầu — không phải endpoint chỉ đọc tuyệt đối về side effect.

Nguồn: [web/server/projects/members.ts:59](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/members.ts#L59), [web/server/projects/members.ts:75](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/members.ts#L75), [web/server/projects/members.ts:103](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/members.ts#L103), [web/server/projects3d/service.ts:131](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects3d/service.ts#L131), [web/server/projects/handoff.ts:276](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/handoff.ts#L276), [web/server/app.ts:76](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/app.ts#L76).

## 3. Yêu cầu chức năng được tái dựng

| ID | Yêu cầu / hành vi | Hiện trạng / bằng chứng |
|---|---|---|
| FR-01 | Đăng ký member; leader cần code; login/logout và fixed expiry | Implemented, `auth/*` |
| FR-02 | Tạo/list/hide/delete projects; quản lý người và invite codes | Implemented, hai nhánh 2D/3D |
| FR-03 | Import 10 định dạng 2D, validate references và ảnh, canonical schema 1.0.0 | Implemented, importers + schema |
| FR-04 | Tính risk, warnings và frame triage; lưu engine/revision | Implemented, core/risk + repository |
| FR-05 | Review case có revision/version, frame review + missing bbox | Implemented, ReviewStore / FrameReviewStore |
| FR-06 | Snapshot lỗi, khóa review, export ảnh/nhãn, nhận return và revision mới | Implemented 2D; không có 3D handoff API |
| FR-07 | Rescore YOLO khi import, AI Check, SigLIP/Qwen label verify | Code implemented; tùy Python/packages/weights; chưa inference xác nhận |
| FR-08 | Analyze guideline thành drafts có kiểm tra và lựa chọn waiver | Code implemented; cần Gemini hoặc external module; rule mới chưa tự chạy |
| FR-09 | Import Waymo v2 1 segment; cloud/cameras/measurements/risk | Code implemented; cần numpy/pyarrow; chưa import thực tế |
| FR-10 | Viewer 3D lazy cloud + camera; review box/track; rescore scene | Implemented, không tái đo cloud khi rescore |
| FR-11 | Scan CVAT 2D/3D và lịch sử theo user | Code implemented; cần server CVAT token; không writeback |
| FR-12 | Dùng local hoặc Dropbox cho artifacts; remote đọc trực tiếp có cache | Adapter implemented; chưa kiểm chứng kết nối |

Đối chiếu FR-01/02 với các nguồn RBAC ở trên; FR-03/04: [web/core/importers/catalog.ts:33](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/core/importers/catalog.ts#L33), [web/core/schema/normalize.ts:12](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/core/schema/normalize.ts#L12), [web/core/risk/engine.ts:62](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/core/risk/engine.ts#L62); FR-05/06: [web/server/reviews/store.ts:154](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/reviews/store.ts#L154), [web/server/frames/store.ts:43](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/frames/store.ts#L43), [web/server/projects/service.ts:435](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/service.ts#L435); FR-07–12: [kiến trúc §§6–8](architecture.md#6-workflows-và-data-flow).

## 4. Yêu cầu phi chức năng và ràng buộc thực tế

| ID | Ràng buộc hiện tại | Không được suy diễn |
|---|---|---|
| NFR-01 / nhất quán | Revision mismatch và review version conflict → 409; DB transactions cho review | Không bao phủ atomicity giữa SQL và Dropbox/file |
| NFR-02 / bảo mật | HttpOnly SameSite cookie, hash token/password, server RBAC, write-origin checks | Không là chứng nhận security/compliance; thiếu Origin vẫn được cho qua |
| NFR-03 / tài nguyên | Upload/inference/timeouts có caps; MySQL pool 5; memory cache bounded | Chưa có throughput/latency SLO hoặc load test |
| NFR-04 / khả năng phục hồi | Import recovery FAILED, finish resume 2D nếu staging còn; result files cho completed AI jobs | Pending jobs/guards không bền qua restart; không durable queue |
| NFR-05 / tương thích | 2D schema 1.0.0 + stored engine versions; 3D scene schema marker 3d-1.0.0 | Không tự migrate mọi legacy dataset/export |
| NFR-06 / quan sát | Console logs, progress maps/status APIs, health HTTP | Health không kiểm tra dependencies, không metrics/tracing stack |
| NFR-07 / triển khai | Node native runtime; Compose/MySQL volumes; non-root container user | Docker packaging hiện còn blocker tĩnh; chưa production-ready được chứng minh |
| NFR-08 / trình duyệt | Three.js/WebGL, optional camera permissions và model download | Chưa xác nhận mọi browser/mobile; không có SLA cho cloud rendering |

Nguồn: [web/shared/review.ts:71](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/shared/review.ts#L71), [web/server/auth/http.ts:14](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/auth/http.ts#L14), [web/server/projects/upload.ts:11](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/upload.ts#L11), [web/server/db/pool.ts:17](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/pool.ts#L17), [web/server/projects/service.ts:102](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/service.ts#L102), [web/server/app.ts:64](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/app.ts#L64), [Dockerfile:21](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/Dockerfile#L21).

## 5. Use cases và workflow nghiệp vụ

| UC | Trigger / điều kiện | Luồng thành công | Kết quả / nhánh lỗi |
|---|---|---|---|
| UC-01 / vào hệ thống | Tài khoản enabled; mật khẩu đúng | Login → cookie → me/session | 401 credentials/expiry; 429 throttle; register leader thiếu code →403 |
| UC-02 / bắt đầu review 2D | Leader tạo project và chọn format | Upload → validate → normalize → score → publish/SQL → READY | 201/202; validation422; finish fail có thể resume |
| UC-03 / đánh giá | Project visible/READY | Chọn case/frame → lưu revision/version → refresh metrics | 409 khi dữ liệu/quyết định thay đổi; 423 nếu handoff SENT |
| UC-04 / sửa lỗi | Leader/reviewer đã xác nhận lỗi | Send annotators → export → sửa ngoài → return text labels | Revision mới, đối chiếu kết quả; reviewer không được return |
| UC-05 / AI bổ trợ | Leader; Python/model ready | Chọn một luồng phù hợp → chạy/poll → hiển thị findings | 503 setup; 409 active/already scanned; 422 size; timeout |
| UC-06 / kiểm tra 3D | Leader, một Waymo v2 segment | Export cloud/scene → score → viewer → review box/track | Missing components422; Python503; risk có thể null mà project READY |
| UC-07 / Scan QA CVAT | Người dùng login, CVAT token cấu hình | job_id → read CVAT → branch2D/3D → SQL history | 404 job; 502 CVAT; fallback/notes cho khả năng thiếu |
| UC-08 / guideline | Leader, prose và Gemini key | Analyze → người chọn → upload choices khi import | 502 upstream/schema; chỉ known looser checks thành waiver |

Các sequence tương ứng: [import 2D](diagrams/exports/08-sequence-import-2d.svg), [review/handoff](diagrams/exports/09-sequence-review-handoff.svg), [3D](diagrams/exports/10-sequence-waymo-3d.svg), [CVAT](diagrams/exports/11-sequence-cvat-scan.svg), [guideline](diagrams/exports/12-sequence-guideline.svg).

State machine project dùng chung SQL enum: `CREATED, UPLOADING, VALIDATING, NORMALIZING, ANALYZING, READY, FAILED`; không bắt buộc mọi nhánh đi qua mọi trạng thái. 3D thường chuyển UPLOADING → NORMALIZING và có ANALYZING khi publish remote. Initial 2D failure xóa staging; finish failure giữ staging; restart đánh dấu các import dở FAILED. Handoff là `SENT → RETURNED`; reopen xóa hàng handoff. AI jobs là IDLE (synthesized)/RUNNING/READY/FAILED; verifier có thêm `queued` cho pending map.

Nguồn: [web/server/db/migrations/002_projects.sql:6](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/002_projects.sql#L6), [web/server/projects/service.ts:575](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/service.ts#L575), [web/server/projects3d/service.ts:288](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects3d/service.ts#L288), [web/server/verify/service.ts:51](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/verify/service.ts#L51), [web/server/projects/handoff.ts:333](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/handoff.ts#L333).

## 6. Hợp đồng API

### 6.1. Quy ước chung

Base URL cùng origin, prefix `/api`. Các paths được ghi bên dưới là contract thực thi, không có OpenAPI file được ứng dụng dùng như authority. JSON responses mang `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`; lỗi dự kiến là `{ "error": "..." }`. Unknown exceptions log phía server và trả generic 503, kể cả một số lỗi lập trình.

Ký hiệu quyền: **U** = user đăng nhập; **P** = có quyền project (leader thấy project hoặc member đã join); **L** = project leader; **O** = owner/creator; **R** = reviewer; **Aₛ** = annotator trong danh sách handoff. Leader global xử lý guideline/debug CVAT. Tất cả writes qua API được kiểm tra Origin/Sec-Fetch-Site; auth login/register/logout cũng có check. ID/case/frame/object cần URL encoding khi có ký tự đặc biệt.

Requests JSON thông thường được `readJson` giới hạn 16 KiB; case review parser 32 KiB; guideline 512 KiB; handoff return parser 12 MiB transport. Import có cap annotation10 MiB; return parser thực tế cho12 MiB dù thông báo lỗi ghi “10 MB”. Không thấy kiểm tra byte10 MiB riêng trong returnedDataset; phải dùng giới hạn thực thi, không lấy thông báo làm contract. Không có paging contract ở project/case list; CVAT history giới hạn 50.

| HTTP | Ý nghĩa quan sát được |
|---|---|
| 200 / 201 | Đọc/cập nhật hoặc tạo thành công |
| 202 | 2D finish / AI task được nhận; chưa đồng nghĩa hoàn tất |
| 400 / 413 / 415 / 422 | Input không hợp lệ / quá lớn / content-type / dữ liệu không xử lý được |
| 401 / 403 / 404 | Session / thiếu quyền / không thấy resource (project có thể che tồn tại bằng404) |
| 409 / 423 / 429 | Revision/version/state conflict / handoff lock / throttling |
| 502 / 503 / 504 | Upstream / service hoặc setup chưa sẵn sàng / worker timeout tùy đường gọi |

Nguồn: [web/server/projects/upload.ts:47](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/upload.ts#L47), [web/server/reviews/http.ts:14](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/reviews/http.ts#L14), [web/server/projects/http.ts:19](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/http.ts#L19), [web/server/app.ts:209](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/app.ts#L209).

### 6.2. Auth và health

| Method / path | Quyền / request | Response thành công | Lỗi đáng chú ý |
|---|---|---|---|
| GET `/health` | Public | 200 `{ok:true}` | Không dependency probe |
| POST `/auth/register` | Public; `{username,password,role?,leaderCode?,website?}` | 201 `{user}`; không auto-login | 400/403/409/429; honeypot website có thể trả success giả không tạo user |
| POST `/auth/login` | Public; `{username,password}` | 200 `{user,expiresAt}` + Set-Cookie | 401/429 |
| GET `/auth/me` | Cookie | 200 `{user,expiresAt}` | 401 expiry/disabled |
| POST `/auth/logout` | JSON body, cookie nếu có | 200 `{ok:true}` + clear cookies | Origin/content-type/size |

`User={id,username,role:'leader'|'member'}`. Username 3–64 ký tự ASCII `[a-zA-Z0-9_.-]`, canonical lowercase; password 12–128 khi tạo. Token opaque 43 ký tự base64url (32 byte entropy), session 60 phút từ login, không sliding/refresh. Nguồn: [web/server/auth/http.ts:31](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/auth/http.ts#L31), [web/server/auth/service.ts:59](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/auth/service.ts#L59), [web/server/auth/password.ts:5](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/auth/password.ts#L5).

### 6.3. Project lifecycle và membership chung 2D/3D

Áp dụng bảng này cho cả hai base **B=`/projects`** và **B=`/projects3d`**, trừ chỗ được ghi riêng.

| Method / path sau `/api` | Quyền / input | Response |
|---|---|---|
| GET `B` | U | 200 `Project[]` theo visibility |
| POST `B` | Global leader; `{name,description?,format}` | 201 Project; 2D format catalog, 3D `waymo-v2` |
| POST `B/join` | member; `{code}` | 200 `{project_id,name,role}`; code quyết định role |
| GET `B/:id` | P | 200 Project + `my_role`; 2D có progress/handoff, 3D progress/review_summary khi READY |
| GET `B/:id/import-status` | P | Cùng payload GET project |
| PATCH `B/:id` | O; `{hidden:boolean}` | 200 `{id,hidden}` |
| DELETE `B/:id` | O; ngoại lệ owner-null 2D | 200 `{deleted:true,cleanupPending:boolean}` |
| GET `B/:id/members` | P | 200 `{creator,reviewers,annotators}` |
| GET `B/:id/members/candidates` | L hoặc R | 200 `string[]` usernames, tối đa200 |
| POST `B/:id/members` | L; R chỉ role annotator; `{username,role}` | 201 people snapshot |
| PATCH `B/:id/members/:userId` | L; `{role:'reviewer'\|'annotator'}` | 200 people snapshot |
| DELETE `B/:id/members/:userId` | L | 200 people snapshot |
| GET `B/:id/invites` | L | 200 `{reviewer:code,annotator:code}`; tạo nếu thiếu |
| POST `B/:id/invites` | L; `{role}` | 200 codes sau regenerate |

Project API không lộ `dataset_path`, SQL revision ID, demo key, storage_provider/key/synced_at. Các trường công khai còn lại gồm id/name/description/format/status/error_message/metadata/created_by/hidden/timestamps, creator_name và reviewer/annotator counts; enrichment phụ thuộc endpoint. Name 1–160 sau trim, description ≤2000. Không giả định metadata của 2D và 3D cùng shape.

Nguồn: [web/server/projects/http.ts:47](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/http.ts#L47), [web/server/projects3d/http.ts:9](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects3d/http.ts#L9), [web/server/projects/service.ts:58](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/service.ts#L58), [web/server/projects3d/service.ts:38](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects3d/service.ts#L38), [web/server/projects/members.ts:158](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/members.ts#L158).

### 6.4. Import và AI 2D

Các format IDs hợp lệ: `cvat-images` (XML1.1), `cvat-video` (XML1.1), `coco-detection` (JSON bbox), `datumaro` (JSON1.0), `pascal-voc` (XML mỗi ảnh), `yolo` (TXT + class list/YAML), `labelme` (XML3.0), `kitti` (TXT), `mot` (gt.txt), `smartreview-json` (schema1.0.0). LabelMe JSON không nằm trong catalog này.

| Method / path | Quyền / input | Response / semantics |
|---|---|---|
| GET `/projects/score-models` | U | 200 model catalog n/s/m, installed/default và mô tả |
| POST `/projects/:id/import?rescore=1&model=yolo11s` | L, multipart files | 201 READY hoặc202 Project; flags tùy chọn |
| POST `/projects/:id/import/resume` | L | 202 Project; chỉ FAILED có staged files trên instance |
| GET `/projects/:id/ai-check` | P | 200 AI status/result + available |
| POST `/projects/:id/ai-check` | L | 202 RUNNING job; một job/instance |
| GET `/projects/:id/label-verify` | P | 200 status, available, queued, engine, second_engine và saved result nếu có |
| POST `/projects/:id/label-verify` | L; JSON `{second?:boolean}` | 202 RUNNING hoặc IDLE+queued; một successful scan/revision |

Import multipart chỉ có file parts, fields: `annotation` (một hoặc nhiều theo format), `media` (ảnh), `metadata` CSV tùy chọn, `guideline` tùy chọn, `guideline_rules` JSON tùy chọn. Filename/path phải safe relative. Media thực tế phải được frame tham chiếu và khớp declared width/height; không nhận ảnh thừa.

| Giới hạn 2D | Giá trị thực thi |
|---|---|
| Tổng upload | 200 MiB |
| Mỗi file media | 20 MiB; PNG/JPEG/WebP/GIF static, tối đa25 megapixels |
| Media files | 100 ảnh/project qua upload |
| Annotation | 10 MiB tổng; tối đa110 files; extension theo format |
| Metadata / guideline / rules | Mỗi file ≤10 MiB; metadata `.csv`; guideline `.md/.markdown/.txt/.docx/.pdf/.json`; rules `.json` |
| Canonical count sau parse | 100000 annotations / 10000 frames; media cap100 vẫn áp dụng |
| AI Check | 1000 ảnh, timeout20 phút, defaults YOLO11n |
| Import rescore | Timeout20 phút, defaults YOLO11s; n/s/m chọn được |
| Label Verify | 1000 ảnh, timeout30 phút/call, SigLIP2 và optional Qwen |

AI status là union `IDLE/RUNNING/READY/FAILED`; progress trường `completed,total`, skipped_frames (AI Check), stage/second (verifier), dataset_revision, timestamps; completed job thêm comparison/combined report. Không coi IDLE+queued như chưa được nhận task. Results path `projects/:id/ai/latest.json` và `verify/latest.json` trong storage, không phải public API path trực tiếp.

Nguồn: [web/server/projects/upload.ts:11](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/upload.ts#L11), [web/server/projects/upload.ts:229](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/upload.ts#L229), [web/server/projects/service.ts:624](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/service.ts#L624), [web/server/projects/http.ts:117](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/http.ts#L117), [web/server/ai/service.ts:15](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/ai/service.ts#L15), [web/server/verify/service.ts:25](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/verify/service.ts#L25).

### 6.5. Dataset, case và frame APIs 2D

Đặt **P2=`/projects/:id`**. Project context phải nạp được. `dataset` query ở annotations/assets là fingerprint, không phải UUID project hay SQL bigint.

| Method / path | Input / quyền | Response |
|---|---|---|
| GET `P2/dashboard` | P | `{project,dataset,metrics}` |
| GET `P2/meta` | P | DatasetMeta |
| GET `P2/checks` | P | Danh mục checks của stored engine |
| GET `P2/annotations?dataset=F&media=M&frame=R` | P; frame bắt buộc cho video | `{dataset_revision,media_id,frame_id,annotations}`; loại synthetic missing |
| GET `P2/cases` | P; query level/review_status/scope | `Case[]` |
| GET `P2/cases/:caseId` | P | Case hoặc404 |
| GET `P2/cases/:caseId/review` | P | `{review:Review\|null}` |
| POST `P2/cases/:caseId/review` | P; ReviewCreate | 201 `{review}`; 409 đã có |
| PUT `P2/cases/:caseId/review` | P; ReviewUpdate | 200 `{review}`; 404 chưa có /409 version |
| GET `P2/reviews` | P | Map case ID → Review |
| GET `P2/dashboard/metrics` | P | Metrics: total_risk_cases/high/medium/reviewed/confirmed_errors/correct/unsure/unreviewed/review_progress/dataset_revision |
| GET/HEAD `P2/assets/:frameId?dataset=F` | P; dataset phải khớp | 200 image binary, no-store; 409 changed |
| GET `P2/frames` | P | `{dataset_revision,name,frames,summary}` |
| GET `P2/frames/:frameId` | P | `{dataset_revision,frame,annotations,triage,review}` |
| PUT `P2/frames/:frameId/review` | P; FrameReviewInput | 200 `{review}`; 422 không có ảnh /409 version |

`/risk-cases` là alias cho `/cases`, kể cả qua project dispatch. `level=all|high|medium|low`; `review_status=all|unreviewed|reviewed|ERROR|CORRECT|UNSURE`; `scope=all` chọn allCases, `warnings` chọn warningCases, giá trị khác/mặc định chọn queue. List không có paging server-side.

```json
{
  "dataset_revision": "<20-hex-fingerprint>",
  "decision": "ERROR",
  "error_type": "CLASS",
  "corrected_value": "car",
  "note": "Xác nhận class từ ảnh gốc"
}
```

Đây là **ReviewCreate** minh họa; PUT thêm `version` nguyên ≥1 đã đọc. POST không được có version. Chỉ cho phép fields trên + version; unknown field →400. `decision=CORRECT|ERROR|UNSURE`; khi ERROR cần error_type trong `CLASS/BBOX/TRACKING/MISSING_OBJECT/EXTRA_OBJECT/OTHER`, CLASS phải có corrected_value. Khi không ERROR, error_type/corrected_value phải null/rỗng. corrected_value≤1000, note≤4000. Reviewer ID lấy từ session, không nhận giả mạo từ body.

**FrameReviewInput**: `{dataset_revision,version,status,missing_regions,note}`; version=0 để tạo, ≥1 để update; status IN_PROGRESS/REVIEWED; note≤2000. Mỗi ảnh ≤50 regions, mỗi region `{id,label,note,geometry:{type:'bbox',x,y,width,height}}`; ID unique 1–64, label≤100, region note≤500, bbox trong ảnh và mỗi cạnh ≥1 pixel. Frame summary chứa counts reviewed/in_progress/missing_regions/available_images.

Legacy equivalents `/api/meta`, `/api/checks`, `/api/annotations`, `/api/cases` (+risk-cases alias), `/api/reviews`, `/api/dashboard/metrics`, `/api/assets` và case review routes còn trong generic handler, global leader-only. Startup tiêu chuẩn không nạp default dataset/reviews: các endpoint này sẽ không có dữ liệu (thường409; review store path có thể503). Không quảng bá chúng như một default dataset API đang sẵn sàng.

Nguồn: [web/server/app.ts:100](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/app.ts#L100), [web/server/reviews/http.ts:21](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/reviews/http.ts#L21), [web/shared/review.ts:32](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/shared/review.ts#L32), [web/server/frames/http.ts:26](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/frames/http.ts#L26), [web/shared/frame-review.ts:12](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/shared/frame-review.ts#L12), [web/server/index.ts:27](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/index.ts#L27).

### 6.6. Handoff / return 2D

| Method / path sau P2 | Quyền / body | Response / constraints |
|---|---|---|
| GET `/handoff` | P; nội dung lọc theo vai trò/recipient | 200 `{handoff,report:{project,dataset_revision,errors,missing},result}` |
| POST `/handoff` | L/R; `{annotator_ids:string[],note?:string}` | 201 handoff snapshot, ít nhất1 annotator hợp lệ, note≤1000 |
| DELETE `/handoff` | L | 200 `{handoff:null}`; reopen xóa row |
| GET `/handoff/dataset.zip` | P với check report visibility | ZIP `annotations.xml` + `images/`; chỉ image dataset, 422 nếu không hỗ trợ |
| POST `/handoff/return` | L hoặc Aₛ; `{files:[{name,text}]}` | 200 HandoffResult; cùng media, revision mới; 409 sai trạng thái |

Return transport giới hạn12 MiB, tối đa1010 files; filename bị cắt500 ký tự trước khi importer xử lý; annotation validation còn riêng. HandoffResult giữ outcome và summary cho các lỗi/vùng thiếu, không là chứng nhận annotator đã sửa đúng mọi annotation. Review case/frame bị khóa423 khi SENT; return cần SENT và đúng recipient. Không có 3D handoff routes dù schema đã tạo bảng.

Nguồn: [web/server/projects/http.ts:21](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/http.ts#L21), [web/server/projects/http.ts:204](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/http.ts#L204), [web/server/projects/handoff.ts:272](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/handoff.ts#L272), [web/server/projects/service.ts:435](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/service.ts#L435).

### 6.7. APIs đặc thù 3D

Đặt **P3=`/projects3d/:id`**; membership/lifecycle dùng bảng chung ở §6.3.

| Method / path | Quyền / input | Response |
|---|---|---|
| POST `P3/import` | L; multipart Waymo components / images | 201 Project sau export/publish/SQL |
| GET/HEAD `P3/scene` | P | scene JSON; thiếu artifact409 |
| GET/HEAD `P3/frames/:timestamp.bin` | P | octet-stream cloud binary |
| GET/HEAD `P3/sheets/:timestamp.jpg` | P | camera contact sheet JPEG |
| GET/HEAD `P3/cameras/:CAMERA/:timestamp.jpg` | P | JPEG một camera |
| GET `P3/risk` | P | Risk3DReport; 404 nếu không có report |
| GET `P3/risk/precision` | P | Precision3D từ report + reviews |
| POST `P3/risk/rescore` | L | Kết quả rescore / metadata theo service; không tạo revision |
| GET `P3/reviews` | P | `{dataset_revision,reviews}` map timestamp:objectId |
| POST `P3/boxes/:timestamp/:objectId/review` | P; ReviewCreate | 201 `{reviews}` |
| PUT `P3/boxes/:timestamp/:objectId/review` | P; ReviewUpdate | 200 `{reviews}`; CAS409 |
| PUT `P3/tracks/:objectId/review` | P; ReviewCreate-style, **không version** | 200 `{reviews}`; overwrite mọi box của object |

Single box và whole-track từ chối `MISSING_OBJECT` vì không phải lỗi của cuboid hiện hữu. `dataset_revision` phải khớp scene index. Stored-file branch cho private immutable cache1 năm khi **có** query `dataset`; không kiểm tra giá trị query khớp revision. Không có import/resume 3D route, frame-review3D hay handoff3D API. `risk/rescore` trả metadata risk mới (engine_version/policy_version/total_cases/levels/gaps/warnings), giữ fingerprint và measurements cũ.

Multipart names: `lidar`, `lidar_calibration`, `vehicle_pose`, `lidar_box` bắt buộc; `lidar_pose`/`camera_image` tùy chọn; JPEG loose dùng `camera`, không đi cùng camera_image Parquet. Tổng≤2 GiB, tối đa4 Parquet/component, ≤4000 JPEG, mỗi ảnh≤20 MiB; một segment. Camera loose filename `<camera>/<timestamp-or-index>.jpg`. Export timeout20 phút; Python path ưu tiên SMARTREVIEW_3D_PYTHON.

Nguồn: [web/server/projects3d/http.ts:44](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects3d/http.ts#L44), [web/server/projects3d/http.ts:137](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects3d/http.ts#L137), [web/server/projects3d/upload.ts:44](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects3d/upload.ts#L44), [web/shared/waymo.ts:39](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/shared/waymo.ts#L39), [web/server/projects3d/service.ts:495](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects3d/service.ts#L495).

### 6.8. CVAT và guideline APIs

| Method / path | Quyền / input | Response |
|---|---|---|
| POST `/cvat/scan` | U; `{job_id:number,min_score?:number}` | 201 Scan; min_score mặc định10 cho2D; 3D dùng policy riêng |
| GET `/cvat/scans` | U | 200 `{scans:ScanSummary[]}` của caller, tối đa50; changed so bản trước cùng job nếu có |
| GET `/cvat/scans/:scanId` | U, sở hữu scan | 200 Scan hoặc404 |
| GET `/cvat/jobs/:jobId` | Global leader | 200 `{job,summary:{shapes,tracks,tags},annotations}` debug raw |
| POST `/guideline/analyze` | Global leader; `{text:string}` ≤512KiB | 200 GuidelineExtraction; thiếu key503, upstream/schema502 |

ScanSummary: id/job_id/annotation_hash/engine_version/annotation_count/risk_count/duration_ms/scanned_by_name/scanned_at; optional changed/ai_model. Scan thêm skipped[], risks[], dimension2d/3d, policy_version/notes/capabilities khi nhánh cung cấp. Risk gồm id/frame/object_id/label/severity/score/reasons/check_ids/bbox; có thể source=rule/ai, confidence hoặc cuboid/evidence.

GuidelineExtraction: classes[{name,attributes}], rules[RuleDraft], conflicts[{quotes,issue}], model, rejected[{rule,reason}]; external engine có thể thêm unclassified/errors. RuleDraft có id/section/quote/kind/level/classes/condition/quantities/verdict/relation/overrides/missing_parameters/needs và optional line/downgraded. Cấu trúc draft không là executable policy contract.

Không có numeric validation chặt cho min_score tương tự job_id: code dùng Number(input.min_score ??10); không suy diễn một range API đã bảo đảm. CVAT REST dùng Bearer token server, timeout30 giây/request, đọc jobs/annotations/meta/labels/frame. Không có mapping quyền CVAT theo user SmartReview. Nguồn: [web/server/cvat/http.ts:13](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/cvat/http.ts#L13), [web/server/cvat/scans.ts:31](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/cvat/scans.ts#L31), [web/server/cvat/scans.ts:124](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/cvat/scans.ts#L124), [web/server/guideline/model-call.ts:38](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/guideline/model-call.ts#L38), [web/server/guideline/http.ts:7](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/guideline/http.ts#L7).

## 7. Mô hình dữ liệu ngoài SQL

### 7.1. Canonical annotation dataset 1.0.0

Authority runtime là JSON Schema + Ajv, không chỉ TypeScript types. Dataset gồm:

| Object | Fields / semantics |
|---|---|
| Dataset | `schema_version:'1.0.0', dataset, media[], frames[], annotations[]` |
| DatasetInfo | `id,name,source?,metadata?` |
| Media | `id,name,type:image\|video,width,height,fps?,frame_count?,source?` |
| Frame | `id,media_id,index,image?,timestamp_ms?` |
| Annotation | `id,frame_id,label,geometry,object_id?,track_id?,confidence?,source?,attributes?` |
| Source | `kind:human\|model\|import\|unknown`, optional name/model/metadata |
| BBox | `type:'bbox',x,y,width,height` pixel coordinates |
| Polygon / Polyline | `type`, `points:[[x,y],...]` |
| Mask | `type:'mask',encoding:'rle',size:[h,w],counts:string\|number[]` |
| Cuboid (canonical generic) | `type:'cuboid',center[3],size[3],rotation[3],coordinate_system` |

Normalization kiểm tra ID uniqueness, tham chiếu media/frame/annotation, frame-index và track uniqueness trong đúng phạm vi, đường dẫn image an toàn. Các importers có giới hạn riêng; catalog LabelMe là **XML3.0**, không LabelMe JSON. COCO branch là bbox detection. SmartReview generic cuboid schema không tự là scene Waymo3D contract.

`attributes.rescore` và metadata.missing_hints là tín hiệu bổ sung khi có rescore. Synthetic missing case id `missing:<frame>:<index>` được repository tạo riêng, không nằm trong canonical annotation array. DatasetMeta dùng fingerprint làm dataset_id, giữ dataset_reference gốc, engine/schema versions, counts/levels/checks, guideline_waivers khi áp dụng, review_storage=mysql.

Nguồn: [web/core/schema/types.ts:71](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/core/schema/types.ts#L71), [web/core/schema/normalize.ts:12](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/core/schema/normalize.ts#L12), [web/core/importers/catalog.ts:48](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/core/importers/catalog.ts#L48), [web/server/repository.ts:100](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/repository.ts#L100), [web/server/repository.ts:213](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/repository.ts#L213).

### 7.2. Risk / Case / Review views

RiskReport giữ schema/engine/policy versions, checks/evaluations, results, queue cases, warnings/advisories và frame triage tùy engine. Case là projection của risk result + annotation/media/frame context: score/risk_score, severity/risk_level, findings/reasons/check_ids, geometry, class_name, frame_ref/string và frame_id/index, image_url, previous/current/next khi có. Không dùng frame_id numeric ở case view như canonical frame ID string.

Review: decision/error_type/corrected_value/note/version/reviewed_at; reviewer_id lưu SQL. FrameReview: status/missing_regions/note/version/updated_at. Handoff report snapshot errors/missing gồm vị trí, annotation/frame refs, ảnh và hướng dẫn sửa. Không có event stream lịch sử quyết định.

Nguồn: [web/core/risk/types.ts:135](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/core/risk/types.ts#L135), [web/server/repository.ts:188](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/repository.ts#L188), [web/server/reviews/store.ts:18](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/reviews/store.ts#L18), [web/server/frames/store.ts:6](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/frames/store.ts#L6), [web/server/projects/handoff.ts:39](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/handoff.ts#L39).

### 7.3. Scene 3D và binary cloud

Scene có segment, lasers[{id,name,extrinsic}], optional cameras, frames[]. Mỗi frame có timestamp microsecond, file=`frames/<timestamp>.bin`, pose4×4, laserCounts[], boxes[], optional cameras/ghosts. Box có id/type/center[3]/size[3]/heading/points và optional measurements counted/outside/slack/moved/lift/lidarAxis tùy exporter/engine. Coordinates vehicle với z-up; world transforms dùng poses, exporter giảm world origin để giữ precision.

Binary hiện tại **22 byte/point tổng cộng**: block float32 little-endian XYZI (16N byte), sau đó block int16 delta XYZ (6N byte, mm để undo TOP motion compensation). Không phải interleaved record22byte. `laserCounts` mô tả số điểm theo lidar; bản viewer giữ40 frame cache. Camera sheets dùng tile240×160, full image lazy. Scene schema marker trong metadata là `3d-1.0.0`; scene JSON không cần mang cùng fields như canonical annotation Dataset.

Risk3DReport: schema_version/engine_version/policy_version, cases/findings, gaps/warnings/levels và stats theo engine. Precision3D là tally theo review: `errors/(errors+correct)`, null nếu chưa có quyết định chắc; không phải model recall/accuracy trên ground truth đầy đủ. Gap không tự là case review. Nguồn: [web/src/features/projects3d/viewer/engine.ts:28](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/src/features/projects3d/viewer/engine.ts#L28), [web/src/features/projects3d/viewer/engine.ts:76](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/src/features/projects3d/viewer/engine.ts#L76), [web/src/features/projects3d/viewer/engine.ts:207](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/src/features/projects3d/viewer/engine.ts#L207), [web/shared/waymo.ts:64](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/shared/waymo.ts#L64), [web/core/risk3d/precision.ts:16](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/core/risk3d/precision.ts#L16), [web/server/projects3d/export_waymo.py:498](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects3d/export_waymo.py#L498).

## 8. Database schema cuối cùng

Schema dưới đây là mô hình sau khi áp dụng **001–011** và bảng tracker do runner tạo, không là live introspection. Những fields bổ sung vào bảng gốc đến từ [web/server/db/migrations/005_shared_storage.sql:1](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/005_shared_storage.sql#L1), [web/server/db/migrations/006_project_roles.sql:7](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/006_project_roles.sql#L7) và [web/server/db/migrations/009_session_hour_and_hidden_projects.sql:8](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/009_session_hour_and_hidden_projects.sql#L8). UUID dùng ASCII binary collation ở đa số keys, text dùng DB utf8mb4; timestamps DATETIME(3) được code diễn giải là UTC. mysql2 dùng timezone=Z, nhưng không thấy SET time_zone trong pool; timezone thực tế của DB cần kiểm tra khi provision, nhất là các DEFAULT CURRENT_TIMESTAMP. `NULL` chỉ khi ghi rõ `?`; fields không có `?` là NOT NULL. `PK/UK/FK` lần lượt primary/unique/foreign key. Auto_increment viết `AI`.

### 8.1. Data dictionary auth và 2D

#### `users`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `id` | `CHAR(36) PRIMARY KEY` |
| `username` | `VARCHAR(64)  UNIQUE` |
| `password_hash` | `VARCHAR(255)` |
| `role` | `ENUM('leader','member')  DEFAULT 'member'` |
| `enabled` | `BOOLEAN  DEFAULT TRUE` |
| `created_at` | `DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)` |

Nguồn: [web/server/db/migrations/004_auth.sql:1](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/004_auth.sql#L1).

#### `auth_sessions`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `id` | `CHAR(36) PRIMARY KEY` |
| `user_id` | `CHAR(36)` |
| `access_hash` | `CHAR(64)  UNIQUE` |
| `refresh_hash?` | `CHAR(64) NULL UNIQUE` |
| `access_expires_at` | `DATETIME(3)` |
| `refresh_expires_at?` | `DATETIME(3) NULL` |
| `created_at` | `DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)` |

Keys/checks: `KEY idx_session_expiry (refresh_expires_at) CONSTRAINT session_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE KEY idx_session_access_expiry (access_expires_at)`.

Nguồn: [web/server/db/migrations/004_auth.sql:1](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/004_auth.sql#L1).

#### `auth_login_limits`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `bucket` | `CHAR(64) PRIMARY KEY` |
| `attempts` | `INT UNSIGNED  DEFAULT 1` |
| `resets_at` | `DATETIME(3)` |

Keys/checks: `KEY idx_login_limit_expiry (resets_at)`.

Nguồn: [web/server/db/migrations/004_auth.sql:1](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/004_auth.sql#L1).

#### `dataset_revisions`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `id` | `BIGINT UNSIGNED AI PRIMARY KEY` |
| `fingerprint` | `CHAR(20)  UNIQUE` |
| `dataset_reference` | `TEXT` |
| `name` | `TEXT` |
| `schema_version` | `VARCHAR(32)` |
| `engine_version` | `VARCHAR(32)` |
| `created_at` | `DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)` |

Nguồn: [web/server/db/migrations/001_review.sql:1](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/001_review.sql#L1).

#### `projects`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `id` | `CHAR(36) PRIMARY KEY` |
| `name` | `VARCHAR(160)` |
| `description` | `TEXT` |
| `format` | `VARCHAR(40)` |
| `status` | `ENUM('CREATED','UPLOADING','VALIDATING','NORMALIZING','ANALYZING','READY','FAILED')  DEFAULT 'CREATED'` |
| `error_message?` | `TEXT NULL` |
| `dataset_path?` | `TEXT NULL` |
| `dataset_revision_id?` | `BIGINT UNSIGNED NULL` |
| `metadata?` | `JSON NULL` |
| `demo_key?` | `CHAR(20) NULL UNIQUE` |
| `created_at` | `DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)` |
| `updated_at` | `DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)` |
| `storage_provider` | `ENUM('local','dropbox')  DEFAULT 'local'` |
| `storage_key?` | `VARCHAR(512) NULL` |
| `storage_synced_at?` | `DATETIME(3) NULL` |
| `created_by?` | `CHAR(36) NULL` |
| `hidden` | `BOOLEAN  DEFAULT FALSE` |

Keys/checks: `UNIQUE KEY project_dataset (dataset_revision_id) CONSTRAINT project_revision_fk FOREIGN KEY (dataset_revision_id) REFERENCES dataset_revisions(id) KEY idx_project_creator (created_by)`.

Nguồn: [web/server/db/migrations/002_projects.sql:1](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/002_projects.sql#L1).

#### `risk_cases`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `id` | `BIGINT UNSIGNED AI PRIMARY KEY` |
| `dataset_revision_id` | `BIGINT UNSIGNED` |
| `annotation_key` | `CHAR(64)` |
| `annotation_reference` | `TEXT` |
| `media_reference` | `TEXT` |
| `frame_reference` | `TEXT` |
| `frame_index` | `BIGINT UNSIGNED` |
| `score` | `TINYINT UNSIGNED` |
| `severity` | `ENUM('high','medium','low')` |
| `is_suspicious` | `BOOLEAN` |
| `check_ids` | `JSON` |

Keys/checks: `UNIQUE KEY uq_case (dataset_revision_id, annotation_key) KEY idx_dataset_risk (dataset_revision_id, is_suspicious, severity) CONSTRAINT fk_case_dataset FOREIGN KEY (dataset_revision_id) REFERENCES dataset_revisions(id) CONSTRAINT valid_score CHECK (score <= 100)`.

Nguồn: [web/server/db/migrations/001_review.sql:1](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/001_review.sql#L1).

#### `review_decisions`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `risk_case_id` | `BIGINT UNSIGNED PRIMARY KEY` |
| `decision` | `ENUM('CORRECT','ERROR','UNSURE')` |
| `error_type?` | `ENUM('CLASS','BBOX','TRACKING','MISSING_OBJECT','EXTRA_OBJECT','OTHER') NULL` |
| `corrected_value?` | `TEXT NULL` |
| `note?` | `TEXT NULL` |
| `reviewer_id?` | `VARCHAR(255) NULL` |
| `version` | `INT UNSIGNED  DEFAULT 1` |
| `reviewed_at` | `DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)` |

Keys/checks: `CONSTRAINT fk_review_case FOREIGN KEY (risk_case_id) REFERENCES risk_cases(id) CONSTRAINT valid_error_fields CHECK ( (decision = 'ERROR' AND error_type IS NOT NULL) OR (decision <> 'ERROR' AND error_type IS NULL AND corrected_value IS NULL) )`.

Nguồn: [web/server/db/migrations/001_review.sql:1](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/001_review.sql#L1).

#### `frame_reviews`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `dataset_revision_id` | `BIGINT UNSIGNED` |
| `frame_key` | `CHAR(64)` |
| `frame_reference` | `TEXT` |
| `status` | `ENUM('IN_PROGRESS','REVIEWED')  DEFAULT 'IN_PROGRESS'` |
| `missing_regions` | `JSON` |
| `note` | `TEXT` |
| `version` | `INT UNSIGNED  DEFAULT 1` |
| `updated_at` | `DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)` |

Keys/checks: `PRIMARY KEY (dataset_revision_id, frame_key) CONSTRAINT frame_review_revision_fk FOREIGN KEY (dataset_revision_id) REFERENCES dataset_revisions(id) ON DELETE CASCADE`.

Nguồn: [web/server/db/migrations/003_frame_reviews.sql:1](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/003_frame_reviews.sql#L1).

#### `project_members`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `project_id` | `CHAR(36)` |
| `user_id` | `CHAR(36)` |
| `role` | `ENUM('reviewer','annotator')` |
| `joined_at` | `DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)` |

Keys/checks: `PRIMARY KEY (project_id, user_id) KEY idx_member_user (user_id) CONSTRAINT member_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE CONSTRAINT member_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`.

Nguồn: [web/server/db/migrations/006_project_roles.sql:11](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/006_project_roles.sql#L11).

#### `project_invites`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `project_id` | `CHAR(36)` |
| `role` | `ENUM('reviewer','annotator')` |
| `code` | `CHAR(10)  UNIQUE` |
| `created_at` | `DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)` |

Keys/checks: `PRIMARY KEY (project_id, role) CONSTRAINT invite_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`.

Nguồn: [web/server/db/migrations/006_project_roles.sql:11](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/006_project_roles.sql#L11).

#### `project_handoffs`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `project_id` | `CHAR(36)` |
| `status` | `ENUM('SENT','RETURNED')  DEFAULT 'SENT'` |
| `dataset_fingerprint` | `VARCHAR(64)` |
| `sent_by?` | `CHAR(36) NULL` |
| `sent_by_name` | `VARCHAR(64)` |
| `recipients` | `JSON` |
| `note` | `VARCHAR(1000)  DEFAULT ''` |
| `report` | `MEDIUMTEXT` |
| `sent_at` | `DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)` |
| `returned_by_name?` | `VARCHAR(64) NULL` |
| `returned_at?` | `DATETIME(3) NULL` |
| `result?` | `MEDIUMTEXT NULL` |

Keys/checks: `PRIMARY KEY (project_id) CONSTRAINT handoff_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`.

Nguồn: [web/server/db/migrations/007_review_handoff.sql:1](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/007_review_handoff.sql#L1).



### 8.2. Các bảng 3D và khác biệt

Migration008 dùng CREATE TABLE LIKE, sau đó thêm FKs riêng (LIKE không copy FKs). Không copy dữ liệu 2D sang3D.

| Bảng 3D | Cột/index kế thừa | FKs / khác biệt cuối cùng |
|---|---|---|
| dataset_revisions_3d | Toàn bộ dataset_revisions | Fingerprint riêng, schema `3d-1.0.0` |
| projects_3d | Toàn bộ projects trước009, sau009 có hidden | FK revision_3d; storage_provider default `dropbox` ở DDL (service có thể ghi local theo cấu hình) |
| risk_cases_3d | Toàn bộ risk_cases | FK revision_3d; lazy inserts score0/low/false/check_ids[] |
| review_decisions_3d | Toàn bộ review_decisions | FK case_3d; cùng current-decision semantics |
| frame_reviews_3d | Toàn bộ frame_reviews | FK revision_3d ON DELETE CASCADE; chưa có API workflow |
| project_members_3d | Toàn bộ project_members | FK project3d/user, CASCADE |
| project_invites_3d | Toàn bộ project_invites | FK project3d CASCADE |
| project_handoffs_3d | Toàn bộ project_handoffs | FK project3d CASCADE; chưa có handoff API |

created_by/reviewer_id/sent_by là logical references trong schema hiện tại, không tự có user FK chỉ vì tên cột. auth_sessions/users dùng chung. Bảng3D không biến risk report thành relational source; `risk.json` mới là report authority. Nguồn: [web/server/db/migrations/008_projects_3d.sql:6](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/008_projects_3d.sql#L6), [web/server/db/migrations/009_session_hour_and_hidden_projects.sql:15](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/009_session_hour_and_hidden_projects.sql#L15), [web/server/projects3d/reviews.ts:68](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects3d/reviews.ts#L68).

### 8.3. CVAT / migration metadata

#### `cvat_scans`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `id` | `CHAR(36)` |
| `user_id` | `CHAR(36)` |
| `job_id` | `INT UNSIGNED` |
| `annotation_hash` | `CHAR(16)` |
| `engine_version` | `VARCHAR(20)` |
| `annotation_count` | `INT UNSIGNED` |
| `risk_count` | `INT UNSIGNED` |
| `duration_ms` | `INT UNSIGNED` |
| `result` | `MEDIUMTEXT` |
| `scanned_by_name` | `VARCHAR(64)` |
| `scanned_at` | `DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)` |

Keys/checks: `PRIMARY KEY (id) KEY idx_cvat_scan_user (user_id, job_id, scanned_at) CONSTRAINT cvat_scan_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`.

Nguồn: [web/server/db/migrations/011_cvat_scans_per_user.sql:3](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/011_cvat_scans_per_user.sql#L3).

#### `schema_migrations`

| Cột (? = nullable) | Kiểu / default / constraint |
|---|---|
| `version` | `VARCHAR(100)  PRIMARY KEY` |
| `checksum` | `CHAR(64)` |
| `applied_at` | `DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)` |

Nguồn: [web/server/db/migrate.ts:13](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrate.ts#L13).



Tổng **21 bảng**: 11 auth/2D +8 cloned3D +cvat_scans +schema_migrations. Không liệt kê schema001 của users role reviewer/annotator như schema cuối: migration006 chuyển thành leader/member. Refresh hash/expiry vẫn tồn tại nullable để compatibility nhưng code mới không phát refresh token. Migration011 **drop cvat_scans cũ và mất history cũ**, tạo lại owner=user_id.

Runner dùng advisory lock GET_LOCK, SHA-256 checksum từng SQL file và lưu version/checksum/applied_at. ALTER migrations 008/009 không hoàn toàn idempotent; interrupted run có thể cần xử lý tay trước ghi tracker. DDL MySQL không nên được xem như transaction rollback toàn bộ migration. Nguồn: [web/server/db/migrate.ts:9](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrate.ts#L9), [web/server/db/migrations/006_project_roles.sql:3](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/006_project_roles.sql#L3), [web/server/db/migrations/009_session_hour_and_hidden_projects.sql:9](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/009_session_hour_and_hidden_projects.sql#L9), [web/server/db/migrations/011_cvat_scans_per_user.sql:1](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/db/migrations/011_cvat_scans_per_user.sql#L1).

## 9. AI, policy và thiết kế xử lý lỗi

Luồng [AI data flow](diagrams/exports/05-ai-data-flow.svg) phân tách import rescore / AI Check / label verify. Rescore thêm tín hiệu trước revision; AI Check chỉ comparison; verifier có thể augment cases và SQL queue sau initial risk. Worker dùng subprocess và temporary files/stdio; không có broker hoặc model-serving endpoint riêng. Default SigLIP2 `google/siglip2-base-patch16-224`, second Qwen2.5-VL3B theo policy; availability path check không bảo đảm inference chạy được.

Engine2D7.1.0/policy5.1.0 dùng bbox rule checks, aliases/merged labels, cap100, queue≥30, high≥70/medium≥40, warning zero-score. Frame gates tạo auto_accept/verify/relabel; unsupported geometry/unknown labels và thiếu tín hiệu có thể chặn tự accept. Existing legacy datasets dùng engine stored version, không tự nâng mọi dataset lên latest. Ngưỡng đo với model nhất định không suy ra đã được calibrate cho mọi model n/s/m.

Engine3D3d-1.11.0/policy1.11.0 đọc scene-only, dùng measurements đã xuất, không neural detector. CVAT3D limited yaw/keyframes/temporal=false và fallback khác khả năng Waymo full scene. Guideline new/stricter draft không thành active rule. Không công bố accuracy/SLA từ comments/benchmark artifacts như một kết quả đã đo trên môi trường bàn giao.

| Failure mode | Hành vi hiện tại / ảnh hưởng |
|---|---|
| Sai annotation / ảnh / references | 422, project FAILED, xóa initial staging |
| Finish2D publish/SQL thất bại | FAILED, giữ staging để resume trên máy đó |
| Restart khi import / task dở | Import recovery FAILED; AI saved RUNNING coi interrupted; pending verifier mất |
| Python/packages/weights thiếu | 503 setup hoặc worker error; không chứng minh usable qua available=true |
| Worker timeout | Kill child, lỗi/FAILED; timeout20phút rescore/AI/export, verifier30phút/call |
| 3D scoring throw | Log lỗi; scene hợp lệ vẫn có thể READY, không risk report |
| Remote cleanup fail | Có thể cleanupPending, không rollback toàn bộ distributed state |
| Case/frame write conflict | 409; client cần đọc lại, không silent overwrite |
| Whole-track review3D | Overwrite, không CAS từng cuboid; cần tránh chỉnh đồng thời |
| Gemini quota/network/schema | 502 với diagnostic rút gọn; không tự sửa policy |

Nguồn: [web/server/ai/rescore.ts:156](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/ai/rescore.ts#L156), [web/server/verify/service.ts:37](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/verify/service.ts#L37), [web/server/projects/service.ts:732](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects/service.ts#L732), [web/server/projects3d/service.ts:335](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/projects3d/service.ts#L335), [web/server/guideline/http.ts:45](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/guideline/http.ts#L45), [web/core/risk/label-verify.ts:29](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/core/risk/label-verify.ts#L29).

## 10. Cấu hình và vận hành

### 10.1. Danh mục cấu hình server

Không chứa secret values. `.env` được Node load từ `web/.env` trừ khi SMARTREVIEW_ENV_FILE đổi path. Bảng ghi defaults từ source, không là snapshot biến đang hoạt động.

| Variables | Default / tác dụng |
|---|---|
| HOST, PORT | `127.0.0.1`,3100; Docker0.0.0.0 |
| NODE_ENV, AUTH_COOKIE_SECURE | Production bắt Secure=true; Compose local development/false |
| SMARTREVIEW_ENV_FILE | `web/.env`; không tự mở key trong hồ sơ |
| DB_HOST, DB_PORT, DB_NAME | 127.0.0.1,3306,smartreview; DB_NAME alnum/underscore |
| DB_USER, DB_PASSWORD | USER bắt buộc, PASSWORD mặc định rỗng trong code; triển khai phải cấu hình riêng |
| LEADER_SIGNUP_CODE | Không có → chỉ tạo leader qua CLI; không công bố code |
| SMARTREVIEW_ROOT | Parent của web, dùng đường dẫn repo/AI assets |
| SMARTREVIEW_STORAGE | `web/storage`; cần staging writable cả khi remote |
| SMARTREVIEW_DATASET | Fallback config path `web/datasets/demo/dataset.json`; startup hiện không nạp default dataset |
| SMARTREVIEW_REMOTE_STORAGE | Không có → local; chỉ chấp nhận `dropbox` |
| DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN | Bắt buộc khi chọnDropbox; server OAuth refresh |
| SMARTREVIEW_AI_PYTHON | Repo `.venv/bin/python` (Windows fallback Scripts/python.exe trong config) cho2D AI; một số worker khác hard-code Linux fallback |
| SMARTREVIEW_SCORE_MODEL | `ai-service/yolo11s.pt`; import rescore default |
| SMARTREVIEW_AI_MODEL | `ai-service/yolo11n.pt`; AI Check/CVAT YOLO |
| SMARTREVIEW_AI_FINETUNED | 1/true/yes mới bật extra-annotation reasoning |
| LABEL_VERIFIER_PYTHON | Repo `.venv/bin/python` |
| LABEL_VERIFIER_SIGLIP_DIR, LABEL_VERIFIER_QWEN_DIR | Optional model directories; relative paths resolve từweb; else HF cache |
| SMARTREVIEW_3D_PYTHON | `.venv/bin/python`; Waymo exporter |
| GEMINI_API_KEY | Bắt buộc guideline HTTP; server-only |
| GEMINI_MODEL, GEMINI_THINKING_LEVEL | `gemini-3.5-flash-lite`, `medium` trong code |
| GUIDELINE_RULES_DIR | Nạp extract.ts/gemini.ts từ code ngoài; chưa xác minh module ngoài |
| CVAT_BASE_URL, CVAT_TOKEN | Optional server CVAT URL/Bearer token; không per-user mapping |
| DEV_SSH_TUNNEL, DEV_SSH_HOST, DEV_SSH_USER | Dev tunnel khi flag=true |
| DEV_SSH_PORT, DEV_SSH_DB_PORT | 22,3306; local forwarded port dùng DB_PORT hoặc13306 |
| DOCKER_DB_PASSWORD, DOCKER_DB_ROOT_PASSWORD | Compose substitutions bắt buộc; generated qua setup helper nếu dùng |
| DOCKER_HTTP_PORT, DOCKER_NODE_ENV, DOCKER_AUTH_COOKIE_SECURE | Host3100,development,false trong Compose |

Nguồn: [web/server/env.ts:3](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/env.ts#L3), [web/server/config.ts:4](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/config.ts#L4), [web/server/index.ts:13](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/index.ts#L13), [web/server/storage/remote.ts:15](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/storage/remote.ts#L15), [web/server/ai/rescore.ts:15](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/ai/rescore.ts#L15), [web/server/verify/label-verifier.ts:14](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/verify/label-verifier.ts#L14), [web/server/guideline/model-call.ts:321](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/guideline/model-call.ts#L321), [web/scripts/dev.ts:54](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/scripts/dev.ts#L54), [compose.yaml:42](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/compose.yaml#L42).

### 10.2. Deployment / runbook ở mức thiết kế

Native: cài dependencies đúng lockfile và Node supported; provision MySQL riêng, backup trước migrations, chạy migration/user CLI theo môi trường đã chọn; build UI rồi start API. Dev dùng Vite5173/API3100; có optional SSH tunnel, không required architecture. Python/ML packages và model weights là bước provision riêng; không chỉ kiểm tra có binary Python. Chưa chạy các bước ghi DB trong đợt lập tài liệu này.

Docker: Compose có named volumes mysql_data/project_storage, database healthcheck và web HTTPhealth; web non-root. Runtime image thiếu `policy3d` dù eager import backend cần nó, dự kiến startup fail. Python/weights/score_boxes.py cũng chưa được đóng gói. `npm run analyze` phụ thuộc `src/lib/zip.ts` ngoài COPY. Vì không sửa ứng dụng trong task, không trình bày lệnh Docker như một quy trình đã xác nhận chạy được. Xem [deployment view](diagrams/exports/13-deployment.svg).

Production cần HTTPS ở reverse proxy được quản trị riêng, Secure cookie và source-origin policy phù hợp. Optional CVAT panel nginx8081 rewrite prefix/cookie/origin; cần đánh giá theo môi trường triển khai, không suy diễn proxy này xác minh user CVAT. Backup/restore cần cùng mốc MySQL + artifacts + policy/model configuration; repository chưa có cơ chế snapshot atomic hay RPO/RTO cam kết. Horizontal scaling cần thiết kế bổ sung cho jobs/guards/cache.

Nguồn: [docker/entrypoint.sh:5](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/docker/entrypoint.sh#L5), [Dockerfile:15](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/Dockerfile#L15), [web/core/risk3d/engine.ts:6](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/core/risk3d/engine.ts#L6), [web/server/analysis/archive.ts:12](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/analysis/archive.ts#L12), [cvat-panel/nginx.conf:21](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/cvat-panel/nginx.conf#L21), [web/server/app.ts:220](https://github.com/sithanh1602/Smartreview-Build/blob/8a91f5c911173453d9cacc743899c6e018e6fdc3/web/server/app.ts#L220).

## 11. Hạn chế và phần chưa được xác minh

| Chủ đề | Kết luận có thể dùng | Giới hạn kiểm chứng |
|---|---|---|
| API/schema | Contract suy từ handlers/validators và migrations001–011 | Không introspect DB thật, không HTTP integration roundtrip |
| Pure logic | TypeScript typecheck +6 selected test files pass ở baseline | Không toàn bộ test suite; DB/browser tests chưa chạy |
| AI | Có runtime callers và artifacts contracts rõ | Chưa tải/run models, kiểm GPU/accuracy/latency |
| Remote/integrations | Dropbox/CVAT/Gemini adapters implemented | Chưa kiểm credentials/network/quota/access permissions |
| Deployment | Compose/Dockerfiles tồn tại, missingCOPY được trace | Chưa build/run image; startup failure là inference tĩnh |
| Review audit | Version/CAS và latest row implemented | Không immutable history; handoff latest-only |
| 3D | Waymo single segment, scene-only rules, binary viewer | Calibration hạn chế; gap workflow chưa đầy đủ; track overwrite |
| Proposed policies | Draft/metadata được lưu hoặc hiển thị | Không coi chưa có evaluator là implemented check |

Đề xuất chưa thực hiện: sửa blocker đóng gói, readiness sâu hơn, durable jobs, audit/history và strategy consistent backups nếu vận hành yêu cầu. Tài liệu hiện trạng phải được cập nhật khi source đổi, đặc biệt API, schema, policy versions và artifact contracts.
