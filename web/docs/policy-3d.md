# Cách viết Policy 3D

Tài liệu này hướng dẫn **người viết policy** cho Risk Engine 3D: file nằm ở đâu, gồm những phần nào, một quy tắc cần ghi gì và quy trình đặt ngưỡng. Nó không chứa policy. Policy đang chạy là `policy3d/_scene.json`; cách engine dùng các quy tắc đó được mô tả trong `docs/risk-3d.md`.

**Policy 2D và policy 3D là hai hệ riêng.** Policy 2D (box trên ảnh) viết theo `docs/policy-format.md`, nằm trong `policy/` và do `core/risk` đọc. Policy 3D (cuboid trong point cloud) viết theo tài liệu này, nằm trong `policy3d/` và do `core/risk3d` đọc. Hai bên không đọc file của nhau. Đừng chép một trường từ file 2D sang file 3D, kể cả khi trùng tên.

## 1. 2D và 3D khác nhau thế nào

| Điểm                 | Policy 2D (`policy/`)                                                   | Policy 3D (`policy3d/`)                                                   |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Đơn vị được chấm     | Box trên một ảnh                                                        | Cuboid trong một frame, và đối tượng (track) qua nhiều frame              |
| Số file              | Một file cho mỗi nhãn, file cặp nhãn, `_dataset.json`, `_frame.json`    | Một file cho cả scene: `_scene.json`                                      |
| Khoá bọc ngoài       | `<tên file>_policy` (`car_policy`, `dataset_policy`…)                   | `scene_policy`                                                            |
| Nhãn                 | Chữ thường: `car`, `person`, `two_wheeler`…                             | Loại của Waymo, chữ hoa: `VEHICLE`, `PEDESTRIAN`, `CYCLIST`, `SIGN`       |
| Quy tắc chạy thế nào | Khuôn (`check`) kèm `params`; khuôn nằm trong `checks/templates.ts`     | Mỗi `id` ứng với một đoạn code riêng trong `core/risk3d/engine.ts`        |
| Trạng thái quy tắc   | `status`: `active` / `proposed` / `manual`                              | Không có `status`. Quy tắc có trong file là chạy, xoá khỏi file là tắt    |
| Đơn vị đo            | Pixel, tỉ lệ so với ảnh                                                 | Mét, radian, số điểm LiDAR                                                |
| Dữ liệu engine đọc   | Annotation, ảnh, confidence                                             | Chỉ `scene.json`: cuboid, pose của xe, số điểm đã đếm (`counted`)         |
| Guideline của dự án  | Là bản vá trên Policy                                                   | Chưa có                                                                   |
| Phiên bản cũ         | Bản sao policy đóng băng theo `engine_version` (`core/risk_v5/policy`…) | Chưa có bản đóng băng; project giữ `risk.json` đã chấm lúc import (mục 7) |

## 2. Bố cục file

```
policy3d/
  _scene.json      toàn bộ policy 3D, bọc trong khoá "scene_policy"
```

Các phần của `scene_policy`, theo thứ tự nên viết:

| Trường           | Bắt buộc | Viết gì                                                                                                       |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `schema_version` | có       | Phiên bản của khuôn dạng file. Chỉ đổi khi thêm, bỏ hoặc đổi nghĩa một trường                                 |
| `policy_version` | có       | Phiên bản nội dung. Tăng mỗi lần đổi ngưỡng, điểm, loại hay quy tắc (mục 7)                                   |
| `purpose`        | có       | Một đoạn: policy chấm gì, engine được đọc gì và không được đọc gì                                             |
| `sources`        | có       | Dữ liệu dùng để đo ngưỡng: `id` và `ref` (segment nào, bao nhiêu frame/cuboid/đối tượng, nhãn có coi là đúng) |
| `scoring`        | có       | Cách cộng điểm và chia mức (mục 3)                                                                            |
| `tracks`         | không    | `note` bằng lời: so sánh qua các frame được làm thế nào. Engine không đọc                                     |
| `types`          | có       | Giới hạn của từng loại đối tượng (mục 4)                                                                      |
| `rules`          | có       | Danh sách quy tắc (mục 5)                                                                                     |
| `gaps`           | không    | `max_frames` và `note`: đối tượng vắng mặt bao nhiêu frame thì được liệt kê là chỗ có thể thiếu cuboid        |
| `open_questions` | không    | Những gì chưa đo, chưa chắc hoặc chưa có quy tắc. Mỗi mục một câu                                             |

Trường nào engine đọc thì phải có số, không được ghi bằng lời. Trường `note`, `text`, `measured`, `purpose` dành cho người đọc.

## 3. `scoring`

```json
"scoring": {
  "queue_from": 30,
  "max_score": 100,
  "high_from": 70,
  "medium_from": 40,
  "sum": "…",
  "error_type": "…"
}
```

- `queue_from`: cuboid có tổng điểm từ mức này trở lên là một **case** và vào hàng đợi review. Dưới mức này, cuboid chỉ nằm trong `warnings` của báo cáo.
- `max_score`: trần của tổng điểm.
- `high_from`, `medium_from`: ngưỡng chia mức `high` / `medium` / `low`. Viewer 3D tô ghim theo mức: cam là `high`, vàng là `medium` hoặc `low`.
- `sum`, `error_type`: viết bằng lời cách cộng điểm và cách chọn lỗi nghi ngờ khi nhiều quy tắc cùng bắt một cuboid. Engine không đọc hai trường này; nếu đổi cách cộng thì phải sửa code.

Đặt ngưỡng sao cho **một quy tắc mạnh đứng một mình cũng đủ thành case**, còn quy tắc yếu thì phải cộng với quy tắc khác mới vượt `queue_from`.

## 4. `types`

Mỗi loại đối tượng là một khoá, kèm các giới hạn mà quy tắc dùng:

```json
"VEHICLE": {
  "size": { "length": [1.2, 26], "width": [0.6, 4], "height": [0.8, 5.5] },
  "position_jump_m": 0.6,
  "heading_jump_rad": 0.35,
  "empty_within_m": 30,
  "outside_ratio": 0.45,
  "slack_ratio": 0.32,
  "moved_ratio": 0.5,
  "empty_side_m": 0.6,
  "level_shift_m": 0.3
}
```

| Trường             | Đơn vị | Ý nghĩa                                                                       |
| ------------------ | ------ | ----------------------------------------------------------------------------- |
| `size`             | m      | `[nhỏ nhất, lớn nhất]` của dài (theo hướng cuboid), rộng, cao                 |
| `position_jump_m`  | m      | Tâm lệch khỏi trung điểm của hai frame kề từ mức này thì bị gắn cờ            |
| `heading_jump_rad` | rad    | Hướng lệch khỏi hai frame kề từ mức này thì bị gắn cờ                         |
| `empty_within_m`   | m      | Trong khoảng cách này tới xe, cuboid không có điểm LiDAR nào là bất thường    |
| `outside_ratio`    | 0–1    | Mức của `fit.points_outside`: trung vị phần điểm của vật tràn ra ngoài cuboid |
| `slack_ratio`      | 0–1    | Mức của `fit.loose`: trung vị khoảng trống ở hai mặt nhìn thấy, chia nửa cạnh |
| `moved_ratio`      | 0–1    | Mức của `fit.moved`: trung vị phần điểm cuboid còn thiếu so với chỗ tốt nhất  |
| `empty_side_m`     | m      | Mức của `fit.empty_side`: trung vị khoảng trống ở mặt quay về phía xe         |
| `level_shift_m`    | m      | Mức của `fit.lowered`/`fit.raised`: trung vị `lift` lệch khỏi mức của track   |

Cách viết:

- Tên loại phải trùng đúng với `type` trong `scene.json` (chữ hoa). Loại không có trong `types` thì **không bị chấm**, và engine cũng không báo lỗi.
- Mọi loại phải có đủ tám trường đầu. Thiếu một trường thì quy tắc dùng trường đó sẽ chạy sai. Riêng `level_shift_m` được bỏ trống: loại không có nó (như `SIGN`, không đứng trên mặt đường) thì `fit.lowered` và `fit.raised` không xét.
- Các trường của `fit.*` so với **trung vị trên nhiều frame** (mục `Độ khít` của `docs/risk-3d.md`), nên đo chúng bằng trung vị trên cùng cửa sổ, không bằng giá trị của từng cuboid.
- Đo trên dữ liệu đúng rồi **nới rộng** ra: lấy giá trị lớn nhất đo được, cộng thêm một khoảng an toàn. Ghi số đo gốc vào `measured` của quy tắc liên quan để người sau biết khoảng nới là bao nhiêu.
- Loại chưa có số đo (như `CYCLIST` hiện nay) vẫn có thể đặt giới hạn ước lượng, nhưng phải ghi vào `note` hoặc `open_questions`.

## 5. Viết một quy tắc

```json
{
  "id": "track.position_jump",
  "score": 50,
  "error_type": "BBOX",
  "text": "Tâm cuboid lệch khỏi trung điểm của hai frame kề nhiều hơn mức của loại đó…",
  "params": { "vertical_jump_m": 0.4 },
  "measured": "Segment mẫu, lệch ngang lớn nhất: VEHICLE 0,27 m, PEDESTRIAN 0,17 m…"
}
```

| Trường       | Bắt buộc                       | Viết gì                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | có                             | `<phạm vi>.<tên>`, chữ thường, `_` giữa các từ. Phạm vi xem bảng dưới                                                                                                                                                                                                  |
| `score`      | có, trừ khi `level: "warning"` | Điểm cộng vào cuboid khi quy tắc bắt được, lớn hơn 0                                                                                                                                                                                                                   |
| `level`      | không                          | `"warning"`: chỉ cảnh báo, không cộng điểm. Dùng khi chính dữ liệu đúng cũng hay rơi vào quy tắc này                                                                                                                                                                   |
| `error_type` | có                             | Lỗi nghi ngờ, một trong `CLASS`, `BBOX`, `TRACKING`, `EXTRA_OBJECT`, `OTHER`. Phải trùng với lựa chọn lỗi của form review 3D (`ERROR_TYPES_3D` trong `ObjectPanel.tsx`). Không dùng `MISSING_OBJECT` của 2D: cuboid còn thiếu không có gì để gắn điểm, nó thuộc `gaps` |
| `text`       | có                             | Một câu nói quy tắc bắt gì, viết cho reviewer. Nhắc tên tham số (`ratio`, `min_frames`…) nếu có                                                                                                                                                                        |
| `params`     | có                             | Các con số riêng của quy tắc. `{}` nếu quy tắc chỉ dùng giới hạn trong `types`                                                                                                                                                                                         |
| `measured`   | có                             | Số đo trên dữ liệu ở `sources` dẫn tới ngưỡng này: lớn nhất bao nhiêu, bao nhiêu phần trăm rơi vào. Chưa đo thì ghi rõ "chưa đo"                                                                                                                                       |

Phạm vi của `id`:

| Tiền tố   | Chấm gì                                                   | Ví dụ                                                                                                                     |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `box.`    | Một cuboid, tự nó                                         | `box.size_out_of_range`                                                                                                   |
| `points.` | Số điểm LiDAR trong cuboid                                | `points.empty_near`, `points.dropped`                                                                                     |
| `pair.`   | Hai cuboid trong cùng một frame                           | `pair.duplicate`                                                                                                          |
| `track.`  | Một đối tượng qua các frame (cùng `id`)                   | `track.type_change`, `track.size_change`                                                                                  |
| `fit.`    | Độ khít của cuboid với điểm của vật, trên một chuỗi frame | `fit.moved`, `fit.empty_side`, `fit.floating`, `fit.sunk`, `fit.lowered`, `fit.raised`, `fit.points_outside`, `fit.loose` |

Quy ước khi viết:

- **Một quy tắc bắt một kiểu lỗi.** Nếu một hiện tượng có thể do hai loại lỗi khác nhau gây ra, tách thành hai quy tắc với hai `error_type`.
- **Quy tắc theo track** phải nói rõ trong `text` là so với frame nào (hai frame kề, đa số các frame…). Engine chỉ so với hai frame kề khi đối tượng có ở cả frame liền trước và liền sau.
- **Quy tắc ở mức đối tượng** (một case cho cả track, như `track.never_observed`) phải ghi trong `text` là case được gắn vào cuboid nào.
- **Không dùng `score` để tắt quy tắc.** Muốn tắt thì xoá quy tắc khỏi file. Muốn giữ nhưng không cộng điểm thì dùng `level: "warning"`.

## 6. Quy trình đặt một ngưỡng

1. **Đo trên dữ liệu đúng.** Chạy `npm run risk3d -- scene.json --calibrate` trên một segment có nhãn coi là đúng: lệnh in, cho mỗi loại và mỗi mức, giá trị lớn nhất nhãn đúng đạt tới (đo đúng như quy tắc đo), mức hiện tại, mức đề xuất, và cờ khi mức hiện tại sẽ báo nhầm. Quy tắc chưa có trong lệnh thì viết script đo riêng (để ngoài repo). Ghi lại giá trị lớn nhất và phân bố.
2. **Đặt ngưỡng trên giá trị lớn nhất đó**, cộng khoảng an toàn. Nếu dữ liệu đúng cũng vượt ngưỡng ở nhiều chỗ, quy tắc đó chỉ nên là `warning`.
3. **Cài lỗi giả để thử.** Sửa một bản sao `scene.json`: dịch, xoay hoặc đổi kích thước một cuboid, đổi `type` ở một frame, xoá điểm… Kiểm rằng quy tắc bắt được đúng cuboid đó và không bắt hai cuboid kề nó.
4. **Ghi `measured`** bằng số cụ thể, và thêm segment đã dùng vào `sources` nếu là segment mới.
5. **Tăng `policy_version`** (mục 7) và chạy `node --test tests/risk3d.test.ts`.
6. Điều gì chưa đo được thì ghi vào `open_questions`, đừng để ngầm định.

## 7. Phiên bản, và điều gì cần code

- **Đổi số** (ngưỡng, điểm, `error_type`, giới hạn trong `types`): chỉ sửa `_scene.json` và tăng `policy_version`, ví dụ `1.0.0` → `1.1.0`.
- **Thêm quy tắc mới**: cần cả file lẫn code. Viết quy tắc vào `_scene.json`, đồng thời phải có đoạn code trong `core/risk3d/engine.ts` chạy `id` đó. Test `every rule of the policy is one the engine runs` hiện **không bắt được** một `id` chưa có code: quy tắc đó sẽ không làm gì mà không báo lỗi. Vì vậy mỗi quy tắc mới phải đi kèm một test riêng trong `tests/risk3d.test.ts`, có cài lỗi giả để chứng minh quy tắc thật sự bắt được.
- **Đổi tên `id`**: phải sửa cả code, vì engine tìm quy tắc theo `id`.
- **Đổi cách cộng điểm** hoặc thêm một trường mà engine phải đọc: tăng `ENGINE_3D_VERSION` trong `core/risk3d/engine.ts`, và tăng `schema_version` nếu khuôn dạng file đổi.
- **Ảnh hưởng tới project đã import**: báo cáo được chấm lúc import và lưu thành `risk.json`. Sửa policy chỉ đổi kết quả của các lần import sau, cho tới khi Leader bấm "Chấm lại bằng engine hiện tại" ở trang project (`POST /api/projects3d/:id/risk/rescore`): `scene.json` đã lưu được chấm lại và `risk.json` bị ghi đè. Quy tắc cần trường đo mới của exporter vẫn chỉ chạy khi import lại, vì scene đã lưu không có trường đó.
- **Quy tắc đúng tới đâu trên dữ liệu thật**: trang project hiện bảng "Risk Engine đúng tới đâu" (`GET /api/projects3d/:id/risk/precision`): với mỗi quy tắc, bao nhiêu case reviewer xác nhận lỗi, bao nhiêu báo nhầm, và engine bỏ sót bao nhiêu lỗi. Dùng nó để biết nên nới hay siết mức nào.

## 8. Danh sách kiểm trước khi gửi

- [ ] File vẫn là JSON hợp lệ, mọi nội dung nằm trong `scene_policy`.
- [ ] `policy_version` đã tăng.
- [ ] Mỗi loại trong `types` có đủ `size`, `position_jump_m`, `heading_jump_rad`, `empty_within_m`, `outside_ratio`, `slack_ratio`, `moved_ratio`, `empty_side_m` (và `level_shift_m` nếu loại đứng trên mặt đường).
- [ ] Mỗi quy tắc có `id`, `error_type`, `text`, `params`, `measured`, và có `score > 0` hoặc `level: "warning"`.
- [ ] `error_type` là một trong `CLASS`, `BBOX`, `TRACKING`, `EXTRA_OBJECT`, `OTHER`.
- [ ] Quy tắc mới có code trong `core/risk3d/engine.ts` và một test cài lỗi giả.
- [ ] `node --test tests/risk3d.test.ts` qua.
- [ ] `docs/risk-3d.md` (bảng quy tắc) đã cập nhật nếu điểm, ngưỡng hay quy tắc thay đổi.
- [ ] Không có gì của policy 2D (`policy/`, `docs/policy-format.md`) bị sửa theo.
