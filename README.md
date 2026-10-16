<img src="web/public/favicon.svg" alt="Logo SmartReview" width="72" />

# SmartReview

Nền tảng kiểm tra chất lượng annotation (Annotation QA): nhập dataset đã gán nhãn, chấm điểm rủi ro từng box, đưa các box đáng ngờ vào hàng đợi cho người review và lưu quyết định vào MySQL. Mỗi project có một Leader và các Reviewer, Annotator tham gia bằng mã mời.

Toàn bộ mã nguồn viết bằng **TypeScript**: giao diện React + Vite, API Node.js.

```text
Dataset đã gán nhãn (CVAT images/video, COCO, Datumaro, PASCAL VOC, YOLO, LabelMe, KITTI, MOT, SmartReview JSON)
    → Importer → Chuẩn hóa + validate → Schema 1.0.0
    → Risk Engine → Hàng đợi review → Quyết định của người review (MySQL) → Số liệu

Tùy chọn, chạy bằng lệnh:
    Guideline của dự án → Guideline Review → bản nháp quy tắc → tắt check của Risk Engine theo nhãn
    Dataset + ảnh → Label verifier (engine siglip hoặc qwen) → báo cáo box nghi sai nhãn
```

## Bắt đầu nhanh

```bash
./setup.sh                 # cài gói Node, tạo web/.env nếu chưa có, Python (.venv) cho project 3D và AI Check
# điền thông tin MySQL vào web/.env
cd web
npm run db:migrate         # tạo bảng (cần kết nối MySQL)
npm run user:create -- --username <tên> --role leader
npm run dev                # http://127.0.0.1:5173
```

Thử ngay không cần dữ liệu riêng: đăng nhập bằng tài khoản Leader, vào **Projects → + New Project**, chọn `web/fixtures/upload/annotations.xml` và `web/fixtures/upload/street.png`.

## Vai trò

Tài khoản có hai loại, chọn lúc đăng ký hoặc đặt bằng `npm run user:create`:

| Loại tài khoản | Làm được gì                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Leader         | Tạo project, import dataset, chạy AI Check và kiểm nhãn bằng ảnh, xóa project, xem mã mời và quản lý thành viên |
| Thành viên     | Tham gia project bằng mã mời; xem dữ liệu và lưu quyết định review trong project đã tham gia                    |

Mỗi project có hai mã mời, một cho **Reviewer** và một cho **Annotator**; mã quyết định vai trò của người nhập. Leader thêm người trực tiếp bằng tên đăng nhập ở khung "Thành viên project" trong trang project, hoặc lấy mã mời ở cùng khung đó. Thành viên đăng nhập, chọn vai trò làm việc rồi nhập mã ở trang Projects. Một người giữ một vai trò trong mỗi project.

Reviewer và Annotator có cùng quyền xem và sửa trong project; Reviewer còn thêm được Annotator vào project bằng tên đăng nhập. Chi tiết quyền, bảng dữ liệu và API: [web/docs/project-roles.md](web/docs/project-roles.md).

> Nâng cấp từ bản trước: chạy `npm run db:migrate` để áp dụng migration `006_project_roles.sql`. Tài khoản `reviewer` cũ thành Leader, `annotator` cũ thành Thành viên. Backend bản cũ không dùng được với database đã nâng cấp, nên cập nhật code và database cùng lúc.

## Cài đặt

`setup.sh` là điểm vào duy nhất để cài các gói liên quan. Mọi thư viện được cài vào trong repo (`web/node_modules`, `.venv`). Script không đụng tới MySQL, không ghi đè `web/.env` đã có, không cài lại gói Node khi `node_modules` đã khớp, không tải mô hình của label verifier, và chỉ kiểm tra (không cài) repo bên cạnh `guideline-rules`.

| Lệnh                    | Cài gì                                                                                                                                                                                 | Khi nào cần               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `./setup.sh`            | Gói Node của `web/`, tạo `web/.env` từ `.env.example`, venv `.venv` với numpy + pyarrow (project 3D) và Ultralytics kèm PyTorch + OpenCV (AI Check), tải model `ai-service/yolo11n.pt` | Luôn cần                  |
| `./setup.sh --no-ai`    | Như trên nhưng bỏ phần AI Check (PyTorch nặng vài GB)                                                                                                                                  | Máy không dùng AI Check   |
| `./setup.sh --verifier` | Thêm các gói của label verifier (transformers, bitsandbytes…) vào `.venv`; mô hình tải riêng, xem mục Label verifier                                                                   | Chạy `npm run verify`     |
| `./setup.sh --browser`  | Thêm Chromium của Playwright                                                                                                                                                           | Chạy `npm run test:ui`    |
| `./setup.sh --all`      | Tất cả các mục trên                                                                                                                                                                    |                           |
| `./setup.sh --check`    | Không cài gì, chỉ báo máy đang thiếu gì; thoát với mã lỗi khi còn thiếu                                                                                                                | Kiểm tra nhanh môi trường |

Yêu cầu trên máy:

| Thành phần             | Phiên bản                              | Ghi chú                                                              |
| ---------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| Node.js                | ≥ 22.18                                | Server chạy thẳng file `.ts`, không có bước build cho backend        |
| MySQL                  | 8.x                                    | Dùng MySQL của nhóm qua SSH tunnel (xem `web/README.md`) hoặc Docker |
| Python                 | 3.x, tùy chọn                          | Chỉ cho AI Check và dataset demo; review dataset ảnh không cần       |
| Model YOLO             | `yolo11n.pt`, tùy chọn                 | Đặt tại `ai-service/yolo11n.pt`; file model không nằm trong repo     |
| Mô hình label verifier | SigLIP 2 base, Qwen2.5-VL 3B, tùy chọn | Mỗi mô hình một thư mục ngang hàng với repo; GPU 4 GB là đủ          |

Muốn chạy trọn gói bằng container (kèm MySQL riêng) thì xem [docker/README.md](docker/README.md).

## Cấu trúc repo

| Đường dẫn       | Nội dung                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `web/`          | Ứng dụng chính: giao diện, API, risk engine, test                                                                            |
| `web/src/`      | Giao diện React (`pages/`, `features/`, `components/`, `lib/`)                                                               |
| `web/server/`   | API Node: auth, projects và thành viên, reviews, frame review, AI Check, Guideline Review, label verifier (`server/verify/`) |
| `web/policy/`   | Policy dạng dữ liệu: một file mỗi nhãn, `_dataset.json`, `_frame.json`, `_verifier.json`                                     |
| `web/policy3d/` | Policy của Risk Engine 3D (`_scene.json`)                                                                                    |
| `web/core/`     | Lõi không phụ thuộc web: schema, importers, risk engine                                                                      |
| `web/shared/`   | Quy tắc validate dùng chung cho giao diện và server                                                                          |
| `web/scripts/`  | CLI: import dataset, migrate, quản lý tài khoản                                                                              |
| `web/tests/`    | Test Node (`*.test.ts`) và test trình duyệt (`browser/*.spec.ts`)                                                            |
| `web/fixtures/` | Dataset mẫu nhỏ để thử import                                                                                                |
| `web/docs/`     | Tài liệu chi tiết từng phần                                                                                                  |
| `ai-service/`   | Script Python tùy chọn: detect, tracking, dựng dữ liệu demo                                                                  |
| `docker/`       | Chạy bằng Docker Compose                                                                                                     |
| `setup.sh`      | Cài các gói cần thiết                                                                                                        |

Risk engine có năm thư mục, mỗi thư mục một đời. Project ghi phiên bản engine lúc import và tiếp tục chạy trên đúng phiên bản đó, để điểm và fingerprint không đổi:

| Thư mục             | Phiên bản     | Policy                                                  |
| ------------------- | ------------- | ------------------------------------------------------- |
| `web/core/risk/`    | 6.0.0         | Engine hiện tại, policy 4.0.0 đọc từ `web/policy/`      |
| `web/core/risk_v5/` | 5.0.0         | Policy 3.0.0, đọc từ bản sao `web/core/risk_v5/policy/` |
| `web/core/risk_v4/` | 4.0.0         | Policy 2.0.0, viết trong code                           |
| `web/core/risk_v3/` | 3.0.0         | Policy 1.0.0, viết trong code                           |
| `web/core/risk_v1/` | 2.0.0 / 2.1.0 | Các check gốc                                           |

Project 3D có engine riêng: `web/core/risk3d/` (phiên bản `3d-1.0.0`) với policy ở `web/policy3d/`. Nó chấm mọi cuboid của một segment LiDAR chỉ từ `scene.json` (cuboid, pose của xe, số điểm trong cuboid đã đếm lúc import), không đọc point cloud, nên chạy dưới một giây cho segment 198 frame. Nó chạy lúc import project 3D và lưu báo cáo `risk.json`; viewer 3D chưa có hàng đợi case. Chi tiết và số đo: [web/docs/risk-3d.md](web/docs/risk-3d.md).

## Label verifier

Risk Engine chỉ nhìn toạ độ, nhãn và confidence, nên không thấy được một box do người vẽ bị gán sai nhãn. Label verifier nhìn phần ảnh nằm trong box và cho biết ảnh đó khớp nhãn nào; số điểm của một mức bất đồng lấy từ `web/policy/_verifier.json`, mô hình không tự cho điểm.

Trong giao diện, lượt quét được chọn lúc tạo project và chỉ chạy một lần: upload xong thì popup **Chọn cách quét nhãn** mở ra, chọn rồi bấm nút mới sang trang project.

- **Risk Engine** luôn chạy lúc import như trước giờ; popup không đổi cách nó chạy hay kết quả của nó.
- **SigLIP 2** được tích sẵn: mặc định là Risk Engine kết hợp với `siglip`. Chỉ khi ô này được tích thì ảnh mới bị cắt theo từng box và mô hình mới chạy. Bỏ tích thì project chỉ có kết quả của Risk Engine.
- **Qwen2.5-VL** không tích sẵn và chỉ chạy khi người dùng tích: nó xem lại các box `siglip` đã nghi; điểm của nó không cộng vào.
- Lượt quét không có trang hay nút riêng. Chỉ box bị phát hiện sai mới tới người duyệt: nó vào hàng đợi của trang Review (nút **Bắt đầu kiểm tra**) với điểm Risk Engine cộng điểm verifier, tối đa 100, kèm một finding `verifier.wrong_label`. Trang project hiện một dòng trạng thái của lượt quét.
- Import còn chạy nền thì lượt quét tự bắt đầu khi project sang Ready. Báo cáo của Risk Engine, phiên bản engine và fingerprint của dataset không đổi; annotation không bị sửa.

Hai engine nằm trong repo (`web/server/verify/verify.py`), nhận cùng một yêu cầu và trả cùng dạng điểm:

| Engine   | Mô hình                           | Thư mục mô hình (ngang hàng với `SmartReview/`) | Biến trong `web/.env`       | Tốc độ (GPU 4 GB)      | Vai trò                                            |
| -------- | --------------------------------- | ----------------------------------------------- | --------------------------- | ---------------------- | -------------------------------------------------- |
| `siglip` | `google/siglip2-base-patch16-224` | `siglip2-base-patch16-224/` (1,5 GB)            | `LABEL_VERIFIER_SIGLIP_DIR` | khoảng 60 box mỗi giây | Mặc định; bảng điểm được đo với engine này         |
| `qwen`   | `Qwen/Qwen2.5-VL-3B-Instruct`     | `Qwen2.5-VL-3B-Instruct/` (7,1 GB)              | `LABEL_VERIFIER_QWEN_DIR`   | khoảng 4 box mỗi giây  | Ý kiến thứ hai; điểm chưa đo riêng, chỉ để so sánh |

```text
smartreview/
  SmartReview/                  repo này: engine, policy, lệnh
  siglip2-base-patch16-224/     mô hình của engine siglip
  Qwen2.5-VL-3B-Instruct/       mô hình của engine qwen
```

```bash
./setup.sh --verifier                                    # gói Python vào .venv
.venv/bin/python web/server/verify/download_models.py    # tải mô hình về hai thư mục trên (siglip | qwen để tải một)
cd web
npm run dev                                              # tạo project mới → popup chọn cách quét nhãn
# hoặc bằng dòng lệnh, không cần project:
npm run verify -- --input dataset.smartreview.json --images images/ --out report.json
npm run verify -- --input dataset.smartreview.json --images images/ --engine qwen --out report.qwen.json
```

Hai biến trong `web/.env` là đường dẫn tới thư mục mô hình, tính từ `web/` (ví dụ `../../siglip2-base-patch16-224`); không biến nào trỏ tới một repo khác. Không đặt biến thì mô hình được tải về cache của Hugging Face ở lần chạy đầu. File mô hình không bao giờ đưa vào Git.

Policy của verifier đã sửa ở schema 1.1.0: ghi cả hai engine và engine nào đã có số đo, lấy mốc vào danh sách nghi sai nhãn từ `tiers.flagged` của `_dataset.json` thay cho số viết cứng, bỏ qua box dưới cỡ tối thiểu của chính nhãn nó, và bỏ mọi giá trị mặc định khỏi `verify.py`. Định nghĩa `truck` khớp lại với bảng đặt tên của `car_truck.json`. Các sửa đổi này không đổi điểm của Risk Engine.

Guideline Review (phân tích guideline thành bản nháp quy tắc, `npm run guideline:extract` và nút phân tích trong trang import) chưa điều khiển được verifier: quy tắc của guideline chưa tắt được `verifier.wrong_label`, và định nghĩa class của guideline chưa tới được câu mô tả nhãn của verifier. Chi tiết, số đo và giới hạn: [web/docs/label-verifier.md](web/docs/label-verifier.md).

## Lệnh thường dùng

Chạy trong `web/`.

| Lệnh                             | Tác dụng                                                              |
| -------------------------------- | --------------------------------------------------------------------- |
| `npm run dev`                    | API (cổng 3100) và giao diện (cổng 5173), tự tải lại                  |
| `npm run build`                  | Build giao diện vào `dist/`                                           |
| `npm start`                      | Chạy bản đã build tại http://127.0.0.1:3100                           |
| `npm run typecheck`              | Kiểm tra kiểu TypeScript cho mã ứng dụng và test                      |
| `npm test`                       | Test Node; phần lớn cần database test `smartreview_test`              |
| `npm run test:core`              | Test lõi schema, importer, risk engine; không cần MySQL               |
| `npm run test:ui`                | Test trình duyệt bằng Playwright                                      |
| `npm run format`                 | Định dạng mã bằng Prettier                                            |
| `npm run db:migrate`             | Tạo hoặc cập nhật bảng MySQL                                          |
| `npm run user:create -- …`       | Tạo tài khoản `leader` hoặc `member`                                  |
| `npm run import -- …`            | Import dataset bằng dòng lệnh                                         |
| `npm run verify -- …`            | Label verifier: kiểm nhãn từng box bằng ảnh (`--engine siglip\|qwen`) |
| `npm run policy:check`           | Kiểm các file `policy/` nạp được vào engine                           |
| `npm run risk3d -- …`            | Risk Engine 3D: chấm cuboid của một `scene.json`                      |
| `npm run guideline:extract -- …` | Guideline Review bằng dòng lệnh: guideline thành bản nháp quy tắc     |

## Tài liệu

| Chủ đề                                           | File                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Hướng dẫn chạy chi tiết, kết nối MySQL           | [web/README.md](web/README.md)                                   |
| Kiến trúc, schema, danh sách check               | [web/docs/architecture.md](web/docs/architecture.md)             |
| Projects, upload, định dạng nhập, giới hạn file  | [web/docs/projects-import.md](web/docs/projects-import.md)       |
| Review và lưu quyết định                         | [web/docs/human-review.md](web/docs/human-review.md)             |
| Kiểm tra theo ảnh, đánh dấu vùng thiếu           | [web/docs/frame-review.md](web/docs/frame-review.md)             |
| Đăng nhập, phân quyền, tài khoản                 | [web/docs/auth.md](web/docs/auth.md)                             |
| Vai trò theo project, mã mời, thành viên         | [web/docs/project-roles.md](web/docs/project-roles.md)           |
| AI Check                                         | [web/docs/ai-check.md](web/docs/ai-check.md)                     |
| Label verifier: hai engine, policy, số đo        | [web/docs/label-verifier.md](web/docs/label-verifier.md)         |
| Project 3D: import, viewer, review               | [web/docs/projects-3d.md](web/docs/projects-3d.md)               |
| Risk Engine 3D: quy tắc, báo cáo, số đo          | [web/docs/risk-3d.md](web/docs/risk-3d.md)                       |
| Khuôn dạng policy theo nhãn, Guideline là bản vá | [web/docs/policy-format.md](web/docs/policy-format.md)           |
| Lịch sử thay đổi giao diện                       | [web/docs/frontend-changelog.md](web/docs/frontend-changelog.md) |
| Chạy bằng Docker                                 | [docker/README.md](docker/README.md)                             |

## Quy ước TypeScript

- Import nội bộ ghi rõ đuôi `.ts`; import chỉ để lấy kiểu dùng `import type`.
- Không dùng `enum` hay `namespace`, vì Node chỉ xóa chú thích kiểu chứ không biên dịch.
- Mã ứng dụng kiểm tra ở chế độ `strict` (`web/tsconfig.json`); test dùng cấu hình lỏng hơn (`web/tests/tsconfig.json`).
- Kiểu dùng chung nằm ở `core/schema/types.ts`, `core/risk/types.ts`, `server/types.ts` và `src/types.ts`.

## Không đưa vào Git

`.env`, `web/datasets/`, `web/storage/`, file model (`*.pt`) và `node_modules/` đã nằm trong `.gitignore`. Mô hình của label verifier nằm ngoài repo. Ảnh và nhãn của dataset không được đưa lên dịch vụ bên ngoài.
