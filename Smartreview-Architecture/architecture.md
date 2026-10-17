# SmartReview — Kiến trúc hệ thống

**Phạm vi:** tổng quan cấu trúc, trách nhiệm thành phần và luồng dữ liệu.  
**Source baseline:** `0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f` trên HoangBranch.

## 1. Tổng quan

SmartReview hỗ trợ kiểm tra chất lượng annotation 2D và 3D. Hệ thống nhập dữ liệu, xác định các trường hợp đáng kiểm tra và ghi nhận đánh giá của người dùng. Với dữ liệu 2D, hệ thống còn hỗ trợ bàn giao lỗi và nhận lại nhãn đã sửa.

Kiến trúc chính gồm **React SPA → Node HTTP API → MySQL và kho file**. Các chức năng AI và xuất dữ liệu Waymo được Node gọi bằng Python subprocess. Các modules backend chạy trong cùng ứng dụng Node; không có một AI HTTP service độc lập trong đường chạy này.

Nguồn: [web/server/index.ts:12](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/index.ts#L12), [web/server/app.ts:222](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/app.ts#L222), [web/server/ai/service.ts:186](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/ai/service.ts#L186).

## 2. Bối cảnh hệ thống

![System Context](diagrams/exports/01-system-context.svg)

- **Leader:** tạo và quản lý project, import dữ liệu, quản lý thành viên và yêu cầu tác vụ AI.
- **Reviewer / Annotator:** vai trò của thành viên trong từng project, tham gia review và xử lý nhãn theo quyền được cấp.
- **CVAT:** hệ thống ngoài để đọc job phục vụ Scan QA hoặc chỉnh sửa nhãn qua file.
- **Dropbox:** remote storage tùy chọn cho media và artifacts.
- **Gemini:** dịch vụ tùy chọn để đề xuất quy tắc từ văn bản guideline.

SmartReview không tự ghi annotation trở lại CVAT và không gửi thông báo email/Slack trong luồng handoff hiện tại.

Nguồn: [web/server/projects/members.ts:59](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/projects/members.ts#L59), [web/server/projects/http.ts:263](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/projects/http.ts#L263), [web/server/cvat/client.ts:5](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/cvat/client.ts#L5), [web/server/storage/remote.ts:15](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/storage/remote.ts#L15), [web/server/guideline/model-call.ts:185](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/guideline/model-call.ts#L185).

## 3. Cấu trúc triển khai logic

![Container Architecture](diagrams/exports/02-container-architecture.svg)

| Thành phần | Trách nhiệm |
|---|---|
| React SPA | Giao diện project, import, dashboard và review; Three.js hiển thị dữ liệu 3D |
| Node HTTP API | Xác thực, phân quyền, quản lý project, điều phối import/review và chạy risk engines |
| Python subprocess | Chạy các tác vụ model theo yêu cầu, chuyển đổi Waymo và hỗ trợ đo dữ liệu khi cần |
| MySQL | Lưu tài khoản, phiên đăng nhập, project, thành viên, revisions, review và lịch sử CVAT scan |
| Filesystem | Nhận dữ liệu tạm và lưu dataset, ảnh, scene, point cloud, reports |
| Dropbox tùy chọn | Thay kho lưu trữ artifacts lâu dài; máy chủ vẫn cần local staging |

Frontend gọi `/api` cùng origin và dùng session cookie. Node cũng phục vụ giao diện đã build. MySQL cần cho cả chạy native và Docker. Khi remote storage được bật, Node đọc/ghi artifacts qua Dropbox adapter.

Nguồn: [web/src/main.tsx:22](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/src/main.tsx#L22), [web/src/lib/api.ts:35](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/src/lib/api.ts#L35), [web/server/index.ts:32](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/index.ts#L32), [web/server/db/pool.ts:8](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/db/pool.ts#L8), [web/server/projects/service.ts:52](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/projects/service.ts#L52).

## 4. Thành phần phần mềm

![Components](diagrams/exports/03-components.svg)

| Nhóm module | Vai trò chính |
|---|---|
| `web/src/` | UI, router, API client, các màn hình review và viewer |
| `web/server/auth/`, `app.ts` | Session, kiểm tra request và quyền truy cập |
| `web/server/projects/`, `projects3d/` | Vòng đời project, import, membership và artifacts |
| `web/core/` | Importers, schema validation, chuẩn hóa và risk engines |
| `web/server/reviews/`, `frames/` và review 3D | Lưu quyết định và kiểm tra phiên bản review |
| `web/server/ai/`, `verify/` | Gọi Python cho rescore, AI Check và kiểm tra class |
| `web/server/cvat/`, `guideline/`, `storage/` | Kết nối hệ thống ngoài và kho file |

Các scripts nghiên cứu/CLI trong repository không mặc nhiên là dịch vụ đang chạy. Riêng `ai-service/score_boxes.py` được luồng import rescore sử dụng.

Nguồn: [web/server/projects/service.ts:67](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/projects/service.ts#L67), [web/server/projects3d/service.ts:69](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/projects3d/service.ts#L69), [web/server/ai/rescore.py:5](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/ai/rescore.py#L5), [web/server/reviews/store.ts:34](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/reviews/store.ts#L34).

## 5. Luồng dữ liệu chính

![Workflows](diagrams/exports/04-workflows.svg)

**2D:** người dùng gửi nhãn và ảnh → server kiểm tra/chuẩn hóa → risk engine tạo findings và hàng đợi → người dùng review → lưu quyết định. Có thể bàn giao lỗi và nhận nhãn sửa; nhãn sửa tạo revision mới để tiếp tục kiểm tra. Frontend theo dõi tiến độ trong lúc import; bước publish/SQL cuối import có thể hoàn tất nền.

**3D:** người dùng gửi một segment Waymo v2 → Python xuất scene, point cloud và measurements → risk engine đọc scene để phân tích → viewer tải dữ liệu và cho phép review cuboid/track. Engine 3D sử dụng measurements đã xuất; không trực tiếp chạy detector trên cloud. Scene hợp lệ vẫn có thể được lưu nếu bước scoring thất bại.

**AI bổ trợ 2D:** import rescore bổ sung tín hiệu trước khi chấm rủi ro; AI Check lưu kết quả so sánh riêng; Label Verify có thể bổ sung findings và đưa case vào hàng đợi. Ba chức năng này có tác động khác nhau và đều phụ thuộc môi trường model phù hợp. Catalog hiện có YOLO11 và lựa chọn YOLO26s fine-tuned; model nào dùng được còn phụ thuộc weights và dependencies.

Nguồn: [web/server/projects/service.ts:575](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/projects/service.ts#L575), [web/server/projects/service.ts:435](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/projects/service.ts#L435), [web/server/projects3d/service.ts:332](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/projects3d/service.ts#L332), [web/core/risk3d/engine.ts:6](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/core/risk3d/engine.ts#L6), [web/server/verify/queue.ts:11](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/verify/queue.ts#L11), [web/server/ai/rescore.ts:72](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/ai/rescore.ts#L72).

## 6. Lưu trữ và tính nhất quán

MySQL lưu metadata và quyết định nghiệp vụ; ảnh, dataset JSON, scene, cloud và reports nằm trong local storage hoặc Dropbox. Hai nhóm dữ liệu cần được quản lý cùng nhau khi backup/restore.

Revision xác định bộ dữ liệu đang được review. Version của quyết định giúp phát hiện chỉnh sửa đồng thời; review cả track 3D là trường hợp ghi đè các box của đối tượng. SQL và kho file không nằm trong một transaction chung. Jobs, pending queue và caches chủ yếu nằm trong bộ nhớ của một instance.

Nguồn: [web/server/repository.ts:83](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/repository.ts#L83), [web/shared/review.ts:71](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/shared/review.ts#L71), [web/server/projects3d/reviews.ts:62](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/projects3d/reviews.ts#L62), [web/server/verify/service.ts:51](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/verify/service.ts#L51).

## 7. Security, triển khai và giới hạn

Session được quản lý phía server; cookie HttpOnly và kiểm tra quyền được áp dụng tại backend. Production cần HTTPS và Secure cookie. Tích hợp ngoài dùng credentials phía server; văn bản guideline được gửi ra Gemini khi người dùng yêu cầu chức năng đó.

Repository có cấu hình native/dev và Docker Compose với Node/MySQL. Tuy nhiên, Docker runtime hiện thiếu `policy3d` trong COPY dù backend import file từ đó; dự kiến gây lỗi khởi động. Các dependencies Python và model assets cũng cần provision riêng. Đây là nhận định từ source, chưa build/chạy Docker xác nhận.

Điểm rủi ro chỉ hỗ trợ ưu tiên kiểm tra, không phải chứng nhận nhãn đúng/sai. Chưa có bằng chứng vận hành về SLA, độ chính xác tổng quát, HA hoặc durable distributed jobs. Các kết nối MySQL/Dropbox/CVAT/Gemini và inference chưa được chạy end-to-end trong đợt lập tài liệu.

Nguồn: [web/server/auth/http.ts:23](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/auth/http.ts#L23), [web/server/app.ts:220](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/server/app.ts#L220), [Dockerfile:15](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/Dockerfile#L15), [web/core/risk3d/engine.ts:6](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/web/core/risk3d/engine.ts#L6), [compose.yaml:5](https://github.com/sithanh1602/Smartreview-Build/blob/0a2b6451000b7ce681b3aa2b5a2b1a72d7a5f20f/compose.yaml#L5).
