# Khuôn dạng Policy theo từng nhãn

Trạng thái: **engine 7.1.0 chấm rủi ro từ các file này.** Mọi quy tắc `active` trong `policy/` được `core/risk` đọc và chạy; điểm, ngưỡng và loại lỗi lấy từ file, không còn nằm trong code (mục 1.1). Tài liệu chốt cách viết Policy thành dữ liệu để (1) sưu tầm quy định theo một dạng thống nhất, và (2) Guideline của từng dự án trở thành một bản vá trên Policy thay vì một bộ quy tắc riêng.

Đã viết theo khuôn dạng này: hai file chung (`_dataset.json`, `_frame.json`), đủ 9 file nhãn và file cặp nhãn `car_truck.json`. Tài liệu mô tả đúng những gì các file đó đang dùng; không còn quy tắc nào ở trạng thái `proposed`: mỗi quy tắc hoặc đang chạy, hoặc là `manual`. Những gì còn thiếu ghi ở mục 9.

Nguyên tắc xuyên suốt: mỗi quy tắc hoặc là một **khuôn chạy được** kèm tham số, hoặc được đánh dấu rõ là **cần người xem** (`manual`). Không có quy tắc nào chỉ là một câu mô tả mà lại được coi là đang chạy.

## 1. Bố cục thư mục

```
policy/
  _dataset.json       quy định chung: danh sách nhãn, alias, ngưỡng chung, quy tắc theo track (mục 5)
  _frame.json         quy tắc ở mức ảnh: ảnh tự chấp nhận hay cần xem (mục 4.4)
  car.json            một file cho mỗi nhãn
  truck.json
  bus.json
  two_wheeler.json    xe máy và xe đạp, một nhãn từ policy 4.0.0 (mục 5)
  person.json
  traffic_light.json  nhãn bonus
  traffic_sign.json   nhãn bonus
  barrier.json        nhãn bonus, do người vẽ
  pole.json           nhãn bonus, do người vẽ
  car_truck.json      một file cho mỗi cặp nhãn hay bị nhầm với nhau (mục 2.1)
  _verifier.json      label verifier: engine, câu mô tả nhãn, bảng điểm (docs/label-verifier.md); Risk Engine không đọc
```

Mỗi file bọc toàn bộ nội dung trong một khoá duy nhất tên `<tên file>_policy` (`car.json` có khoá `car_policy`, `car_truck.json` có khoá `car_truck_policy`); hai file chung bỏ dấu `_` ở đầu (`dataset_policy`, `frame_policy`). Các trường mô tả ở mục 2, 2.1, 4.4 và 5 nằm bên trong khoá đó.

Quy tắc về hai box (ví dụ người nằm trong xe) đặt trong file của nhãn **bị gắn cờ**, không phải nhãn còn lại. Riêng quy tắc mà kết quả phụ thuộc vào **cả hai nhãn cụ thể** của một cặp (ví dụ car và truck trùng chỗ thì luôn gắn cờ truck) đặt trong file của cặp.

### 1.1. Engine đọc các file này thế nào

- `core/risk/rules.ts` nạp mọi file trong `policy/` và chỉ giữ quy tắc `status: "active"`. Quy tắc `manual` (và `proposed`, nếu có) không chạy.
- Mỗi khuôn ở mục 4 là một hàm trong `core/risk/checks/templates.ts`. Hàm đọc mọi con số từ `params`, còn `score` và `error_type` lấy từ quy tắc. Khuôn `builtin` gọi code trong `core/risk/checks/builtin.ts`.
- Các quy tắc cùng `check` gộp thành một check của engine. Báo cáo, bản tắt check theo Guideline và giao diện vẫn dùng id của check; mỗi lỗi tìm được ghi thêm `rule_id` là id của quy tắc đã bắt nó.
- Quy tắc `min_size` với `action: "ignore"` không thành check: nó xếp box vào trạng thái `ignored`.
- Quy tắc mức ảnh trong `_frame.json` được `core/risk/image-rules.ts` dựng theo cùng cách.
- Một quy tắc `active` mà engine không chạy được đúng như đã viết (khuôn chưa có, tham số chưa hỗ trợ, thiếu `score`) làm engine **báo lỗi ngay khi khởi động**, không bị bỏ qua trong im lặng.
- Thứ tự các check trong báo cáo, phiên bản của từng check và câu chữ hiện cho người duyệt vẫn nằm trong code (`core/risk/checks/index.ts`, `templates.ts`). Quy tắc có `check` mới, chưa có câu chữ riêng, thì hiện `text` của nó.
- Chạy `npm run policy:check` để kiểm các file nạp được vào engine và xem engine đang chạy những check nào.

Muốn đổi điểm hay ngưỡng thì sửa file của nhãn. Muốn thử một quy tắc mới mà chưa cho chạy thì ghi `status: "proposed"`; đổi thành `active` là nó chạy, và engine báo lỗi nếu khuôn của nó chưa được viết.

**Phiên bản engine.** Sửa file policy là đổi điểm của mọi dự án đang chạy engine mới nhất, nên mỗi lần đổi hành vi phải tăng `ENGINE_VERSION` và giữ lại bản cũ. Dự án ghi phiên bản engine lúc import và tiếp tục chạy trên đúng phiên bản đó:

| `engine_version`          | Thư mục        | Policy                                                                                                                                                                                                                                                                                                    |
| ------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2.0.0`, `2.1.0`, `2.2.0` | `core/risk_v1` | 5 check gốc, thêm 4 check ảnh đơn ở 2.1.0, confidence thành tín hiệu độc lập ở 2.2.0                                                                                                                                                                                                                      |
| `3.0.0`                   | `core/risk_v3` | policy 1.0.0, viết trong code                                                                                                                                                                                                                                                                             |
| `4.0.0`                   | `core/risk_v4` | policy 2.0.0, viết trong code: 33 check, 9 rule mức ảnh                                                                                                                                                                                                                                                   |
| `5.0.0`                   | `core/risk_v5` | policy 3.0.0, đọc từ `core/risk_v5/policy`: 44 check, 9 rule mức ảnh; `motorcycle` và `bicycle` còn là hai nhãn                                                                                                                                                                                           |
| `6.0.0`                   | `core/risk_v6` | policy 4.0.0, đọc từ `core/risk_v6/policy`: 44 check, 9 rule mức ảnh; hai nhãn đó gộp thành `two_wheeler`                                                                                                                                                                                                 |
| `7.0.0`                   | `core/risk_v7` | policy 5.0.0, đọc từ `core/risk_v7/policy`: như 6.0.0, nhưng `*.low_confidence` 20 → 30 điểm nên confidence thấp một mình đã vào hàng đợi                                                                                                                                                                 |
| `7.1.0`                   | `core/risk`    | policy 5.1.0, đọc từ `policy/`: như 7.0.0, thêm `any.rescore_low` cho box do người vẽ đã được `ai-service/score_boxes.py` chấm lại (rescore dưới 0,02, 30 điểm) và luật mức ảnh `coverage.model_missing` (vật core model thấy từ 0,4 mà chưa có box thì chặn tự chấp nhận, kể cả ảnh chỉ có box người vẽ) |

`analyzeDataset(data, { engineVersion })` chọn engine; `npm run import -- ... --engine 4.0.0` chấm một bộ dữ liệu bằng engine cũ.

Engine đọc policy từ file thì bản đóng băng của nó mang theo cả bản sao các file policy (`core/risk_v5/policy`, `core/risk_v6/policy`, `core/risk_v7/policy`). Sửa `policy/` không bao giờ đổi điểm của dự án đang chạy engine cũ.

## 2. File của một nhãn

```json
{
  "person_policy": {
    "schema_version": "1.0.0",
    "label": "person",
    "group": "core",
    "model_drafts": true,
    "definition": {
      "summary": "Người thật, nhìn thấy được trong ảnh.",
      "includes": ["người đi bộ", "người đang ngồi trên xe hai bánh"],
      "excludes": ["người ngồi trong ô tô", "hình người trên biển quảng cáo"]
    },
    "attributes": [
      { "name": "occluded", "required": false, "values": [true, false], "when_absent": "skip" }
    ],
    "rules": []
  }
}
```

| Trường                             | Bắt buộc | Ý nghĩa                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema_version`                   | có       | Phiên bản của khuôn dạng này                                                                                                                                                                                                                                                                                                         |
| `label`                            | có       | Tên nhãn chuẩn, chữ thường, dùng `_` (ví dụ `traffic_light`)                                                                                                                                                                                                                                                                         |
| `group`                            | có       | `core`: lỗi của nhãn này chặn ảnh khỏi tự chấp nhận. `bonus`: chỉ báo cáo                                                                                                                                                                                                                                                            |
| `model_drafts`                     | không    | `true`: mô hình có sinh box nháp cho nhãn này, nên các quy tắc `applies_to: "model"` có dữ liệu để chạy. `false`: nhãn do người vẽ từ đầu (`barrier`, `pole`); file không có quy tắc `applies_to: "model"`, `statistics` hay `calibration`. `model_drafts_note` ghi trường hợp một phần (`traffic_sign`: mô hình chỉ sinh biển stop) |
| `definition.includes` / `excludes` | có       | Nhãn gồm gì và không gồm gì, mỗi mục một cụm ngắn. Dùng để so với Guideline và làm ngữ cảnh cho người duyệt; không tự chạy                                                                                                                                                                                                           |
| `definition.summary`               | không    | Một câu định nghĩa nhãn                                                                                                                                                                                                                                                                                                              |
| `definition.appearance` / `box`    | không    | Dấu hiệu nhận biết bằng mắt và cách vẽ box, bằng lời. `definition.special` (nếu có) ghi trường hợp riêng của nhãn. Không tự chạy                                                                                                                                                                                                     |
| `attributes`                       | không    | Attribute của nhãn: `name`, `required`, `values` (danh sách, hoặc một khoảng ghi bằng chữ như `"0–100"`), `when_absent`, `note`                                                                                                                                                                                                      |
| `visibility`                       | không    | Cách tính mức thấy được của nhãn này (mục 4.7): `percent_attributes`, `estimate_from_boxes` (`typical_ratio`, `edge_px`, `occluders`, `occluder_shrink`) và các ngưỡng `thresholds`                                                                                                                                                  |
| `confirmability`                   | không    | Danh sách dấu hiệu khó xác nhận (`weak_signals`), mỗi dấu hiệu một ngưỡng: `confidence_below`, `env_risk_min`, `long_side_below_px` hoặc `top2_margin_below` (mục 4.7)                                                                                                                                                               |
| `levels`                           | không    | Chép lại các mức ở mục 4.7 kèm ngưỡng điểm của nhãn, để file đọc được độc lập                                                                                                                                                                                                                                                        |
| `scoring`                          | không    | Cách cộng điểm của nhãn: `weak_family` (mô tả nhóm `family: "weak"`), `queue_from` (điểm vào hàng đợi), `severe_from_side_px` (cỡ box mà từ đó lỗi được coi là nghiêm trọng, theo `label_policy`) kèm `severe_note`                                                                                                                  |
| `rules`                            | có       | Danh sách quy tắc, xem mục 3                                                                                                                                                                                                                                                                                                         |

Mỗi attribute `required: true` tự sinh một quy tắc `required_attribute`. Attribute `required: false` chỉ được kiểm khi có một quy tắc `required_attribute` viết rõ cho nó.

### 2.1. File của một cặp nhãn

Dùng khi hai nhãn hay bị nhầm với nhau và số đo cho thấy cách xử lý đúng phụ thuộc vào chính cặp đó. File cặp **bổ sung** cho hai file nhãn; quy tắc riêng của từng nhãn vẫn nằm ở file nhãn. Tên file là hai nhãn nối bằng `_` theo thứ tự trong `labels` của `_dataset.json` (`car_truck.json`).

File cặp không có `label`, `group`, `definition`, `attributes`. Thay vào đó:

| Trường                         | Bắt buộc | Ý nghĩa                                                                                                                                                           |
| ------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema_version`               | có       | Như file nhãn                                                                                                                                                     |
| `pair`                         | có       | Hai nhãn của cặp, ví dụ `["car", "truck"]`                                                                                                                        |
| `purpose`                      | có       | Một câu nói file này xử lý trường hợp nào                                                                                                                         |
| `naming`                       | không    | Bảng quy ước đặt tên cho các loại xe nằm giữa hai nhãn (`table`), kèm `hard_cases`                                                                                |
| `convention_warning`           | không    | Chỗ nhãn đúng của bộ dữ liệu đo lệch với bảng `naming`, và hệ quả với các số đo                                                                                   |
| `second_opinion`               | không    | Định nghĩa "ý kiến thứ hai" mà các quy tắc của cặp dùng: lấy từ `label_top2`/`score_top2`, nếu không có thì từ một box mang nhãn kia nằm gần trùng chỗ (`params`) |
| `visual_check`                 | không    | Kết quả xem ảnh bằng mắt dùng để hiệu chỉnh số đo                                                                                                                 |
| `existing_checks_on_this_pair` | không    | Các check hiện có đang làm gì trên cặp này và đúng hay sai hướng                                                                                                  |
| `what_to_do`                   | không    | Bảng tình huống và hành động cho người duyệt                                                                                                                      |
| `rules`                        | có       | Danh sách quy tắc, xem mục 3. Id có dạng `<nhãn 1>_<nhãn 2>.<chủ đề>`                                                                                             |

`sources`, `calibration`, `decisions`, `open_questions` dùng như ở file nhãn (mục 3).

Quy tắc trong file cặp ghi nhãn mà nó chấm ngay trong `params` (`label`, hoặc `between` cho quy tắc hai box), vì file không có `label` chung.

## 3. Một quy tắc

```json
{
  "id": "person.inside_vehicle",
  "template": "forbidden_inside",
  "params": { "container": ["car", "truck", "bus"], "containment": 0.9 },
  "applies_to": "any",
  "score": 30,
  "error_type": "EXTRA_OBJECT",
  "text": "Không gán người ngồi bên trong ô tô, xe tải, xe buýt.",
  "exceptions": ["Người đứng trên thùng xe tải hở vẫn gán."],
  "source": "label_policy N4"
}
```

| Trường       | Bắt buộc              | Ý nghĩa                                                                                                                                                                                                      |
| ------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`         | có                    | `<nhãn>.<chủ đề>` (file cặp: `<nhãn 1>_<nhãn 2>.<chủ đề>`), không đổi sau khi đã dùng. Bản vá của dự án trỏ vào id này                                                                                       |
| `template`   | có                    | Một khuôn trong mục 4, hoặc `manual`                                                                                                                                                                         |
| `params`     | theo khuôn            | Tham số của khuôn. Con số phải cụ thể                                                                                                                                                                        |
| `applies_to` | không                 | `model` (box có confidence), `human` (box người vẽ), `any` (mặc định)                                                                                                                                        |
| `score`      | có, trừ ba trường hợp | Điểm cộng vào box khi quy tắc bắt lỗi (0–100). Không có `score` khi: khuôn là `manual` hoặc `waive`; `min_size` với `action: "ignore"`; hoặc điểm được ghi theo bậc trong `params.score_by_margin` (mục 4.2) |
| `error_type` | không                 | `CLASS`, `EXTRA_OBJECT`, `BBOX`, `ATTRIBUTE`, `TRACK`                                                                                                                                                        |
| `text`       | có                    | Một câu nói quy tắc bằng lời, đúng như sẽ viết trong tài liệu cho người gán nhãn                                                                                                                             |
| `exceptions` | không                 | Ngoại lệ bằng lời. Không tự chạy: ngoại lệ nào đo được thì viết thành tham số                                                                                                                                |
| `source`     | có                    | Quy định này lấy từ đâu                                                                                                                                                                                      |
| `enabled`    | không                 | Mặc định `true`. Bản vá của dự án có thể tắt                                                                                                                                                                 |

Trường bổ sung, đều không bắt buộc (xem `policy/car.json` để thấy cách dùng):

| Trường            | Ở đâu   | Ý nghĩa                                                                                                                                                                                            |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`          | quy tắc | `active`: engine chạy quy tắc này, kết quả ghi dưới check ở `check`. `manual`: cần người xem. `proposed`: đề xuất, chưa chạy (hiện không file nào dùng)                                            |
| `check`           | quy tắc | Id của check mà kết quả của quy tắc được ghi vào (mục 1.1). `null` khi engine làm việc đó nhưng không qua một check; khi ấy ghi `engine_note`                                                      |
| `engine_note`     | quy tắc | Engine hiện làm việc này bằng cách nào khi không có check tương ứng (ví dụ `min_side`: box bị xếp vào trạng thái ignored)                                                                          |
| `suggests`        | quy tắc | Nhãn gợi ý cho người duyệt khi quy tắc bắt lỗi. Engine chỉ chuyển tiếp khi đây là một tên nhãn; `label_top2` hay một cụm chữ là để người đọc, khuôn tự biết gợi ý gì                               |
| `replaces`        | quy tắc | Quy tắc này thay một check trong phạm vi hẹp: `check`, `for_pair`, `why` (một mục hoặc một danh sách). Check bị thay không xét cặp nhãn đó nữa; ngoài phạm vi đó nó vẫn chạy                       |
| `level`           | quy tắc | `warning`: lỗi tìm được hiện cho người duyệt nhưng không cộng điểm (mục 4.7). `queue`, `high`: chỉ để người đọc, điểm quyết định                                                                   |
| `unless`          | quy tắc | Danh sách điều kiện; một điều kiện đúng là quy tắc không chấm box đó (lý do bỏ qua `excepted`). Hai dạng: `{ "attribute": "occluded", "equals": true }` và `{ "visibility_below": 0.5 }` (mục 4.7) |
| `family`          | quy tắc | Các quy tắc cùng `family` chỉ tính một lần, lấy điểm cao nhất (hiện có `weak`)                                                                                                                     |
| `requires`        | quy tắc | Dữ liệu box phải có thì quy tắc mới chạy (ví dụ `label_top2`, `env_risk`)                                                                                                                          |
| `principle`       | quy tắc | Nguyên tắc N1–N12 trong `label_policy/00_chung.md` làm lý do                                                                                                                                       |
| `examples`        | quy tắc | Mã tình huống trong `label_policy` (ví dụ `CAR-5`)                                                                                                                                                 |
| `evidence`        | quy tắc | Số đo trên dữ liệu thật ủng hộ hoặc phản bác ngưỡng, kèm tên nguồn                                                                                                                                 |
| `note`            | quy tắc | Ghi chú cho người đọc; với `manual` ghi rõ thiếu ngưỡng hay cần khuôn mới                                                                                                                          |
| `sources`         | file    | Các nguồn mà `source` và `evidence` trỏ tới                                                                                                                                                        |
| `defaults`        | file    | Cách xử lý mặc định cho các trường hợp Guideline hay bỏ ngỏ                                                                                                                                        |
| `confusable_with` | file    | Các nhãn hay bị nhầm với nhãn này                                                                                                                                                                  |
| `statistics`      | file    | Phân bố đo trên một bộ dữ liệu, để đặt và kiểm ngưỡng                                                                                                                                              |
| `frame_rules`     | file    | Các quy tắc mức ảnh có liên quan tới nhãn này (định nghĩa nằm ở `_frame.json`)                                                                                                                     |
| `measured`        | quy tắc | Số đo trên box của mô hình đã đối chiếu với nhãn đúng: `flagged_share` (tỉ lệ box bị gắn cờ) và `error_rate` (tỉ lệ sai trong số đó)                                                               |
| `calibration`     | file    | Phép đo đứng sau các `measured`: số box, định nghĩa thế nào là sai, tỉ lệ sai chung để so                                                                                                          |
| `decisions`       | file    | Các câu hỏi đã chốt: quyết định và căn cứ                                                                                                                                                          |
| `open_questions`  | file    | Điểm chưa chốt                                                                                                                                                                                     |

Quy ước chung:

- Kích thước tính bằng pixel; vị trí tính bằng tỉ lệ so với cạnh ảnh (0–1), gốc ở góc trên trái.
- Tỉ lệ khung là **cao chia rộng**.
- Ngưỡng `min` và `max` đều tính cả giá trị biên.
- Một quy tắc chỉ nói một việc. Hai yêu cầu là hai quy tắc.
- `template` và `status` là hai trục khác nhau. `template: "manual"` đi với `status: "manual"` là quy định cần người xem. `template: "manual"` đi với `status: "proposed"` là quy định **kiểm được bằng dữ liệu nhưng chưa có khuôn**; `note` phải ghi "cần khuôn mới".
- Với quy tắc `active`, engine chạy đúng các con số trong `params`. Riêng khuôn `builtin` thì `params` chỉ chép lại con số trong code (mục 4.5).

## 4. Các khuôn

### 4.1. Mức một box

| Khuôn                    | Bắt lỗi khi                                                                | Tham số                                                                                                                                     | Check hiện có tương ứng                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `required_attribute`     | Thiếu attribute, hoặc giá trị ngoài danh sách                              | `names` (danh sách tên), `values` (tuỳ chọn), `only_when_dataset_has_them` (tuỳ chọn: bộ dữ liệu không có attribute thì quy tắc không chạy) | `attribute.required`                                                                                                                  |
| `required_track`         | Box không có `track_id`                                                    | không                                                                                                                                       | có khuôn, chưa quy tắc nào dùng                                                                                                       |
| `min_size`               | Cạnh nhỏ hơn ngưỡng                                                        | `side`: `long` \| `ignore`: trạng thái box `ignored`. `flag`: có khuôn, chưa quy tắc nào dùng                                               | `height`; `px`; `action`: `flag` \| `ignore`                                                                                          | Hiện chỉ có dạng `ignore` (bảng kích thước tối thiểu) |
| `aspect_ratio`           | Tỉ lệ cao/rộng ngoài khoảng                                                | `min`, `max` (có thể chỉ ghi một đầu)                                                                                                       | `geometry.vehicle_aspect`, `two_wheeler_aspect`, `person_aspect`, `light_aspect`, `stop_sign_aspect`, `barrier_aspect`, `pole_aspect` |
| `position_band`          | Điểm neo của box nằm ngoài dải cho phép                                    | `anchor`: `center` \| `top` \| `bottom`; `min_y`, `max_y`; `relative_to`: `image` \| `horizon`                                              | `geometry.vehicle_position`, `light_position`, `sign_position`                                                                        |
| `low_confidence`         | Confidence dưới ngưỡng                                                     | `below`; `only_without_second_opinion` (tuỳ chọn, file cặp)                                                                                 | `confidence.low_score`; file cặp: `pair.unsupported_name`                                                                             |
| `class_margin`           | Nhãn đứng đầu và nhãn thứ hai quá sát nhau                                 | `margin`; `confusable_with` (tuỳ chọn). File cặp: `second_opinion`, `margin_below`                                                          | `confidence.class_margin`, `vehicle_confusion`, `person_vs_two_wheeler`; file cặp: `pair.second_opinion_margin`                       |
| `edge_sliver`            | Box sát mép ảnh, chỉ còn một dải hẹp                                       | `edge_px`, `max_confidence`, `normal_ratio`, `side_cut_ratio_over`, `vertical_cut_ratio_under`                                              | `geometry.edge_truncated`                                                                                                             |
| `valid_box`              | Box không hợp lệ về hình học                                               | `require`: `positive_size` \| `inside_image`; `tolerance_px` (với `inside_image`)                                                           | `geometry.bbox_validity`                                                                                                              |
| `attribute_matches_edge` | Attribute đúng/sai không khớp với việc box chạm mép ảnh                    | `attribute` (ví dụ `truncated`), `edge_px`                                                                                                  | `attribute.truncated_edge`                                                                                                            |
| `below_objects`          | Điểm neo của box nằm thấp hơn mép của phần lớn các box nhãn khác trong ảnh | `objects` (danh sách nhãn), `anchor`, `their_edge`: `top` \| `bottom`, `min_share`, `min_objects`                                           | `geometry.light_below_vehicles`                                                                                                       |

`min_size` có hai nghĩa khác nhau, phải chọn rõ: `ignore` là box nhỏ hơn ngưỡng thì không đánh giá (không đúng không sai); `flag` là box nhỏ hơn ngưỡng thì **không được có** và bị gắn cờ.

`valid_box` được viết thành hai quy tắc cho mỗi nhãn vì hai lỗi có điểm khác nhau: `positive_size` (rộng hoặc cao không dương) và `inside_image` (box vượt ra ngoài ảnh quá `tolerance_px`). Cả hai cùng trỏ vào check `geometry.bbox_validity`.

`edge_sliver`: `normal_ratio` là khoảng tỉ lệ cao/rộng của vật thấy trọn (`NORMAL_RATIO` trong engine). Box chạm mép trái/phải có tỉ lệ trên `side_cut_ratio_over`, hoặc chạm mép trên/dưới có tỉ lệ dưới `vertical_cut_ratio_under`, thì được coi là chỉ còn một dải hẹp.

`class_margin` trong file cặp so với một nhãn cụ thể: `second_opinion` là nhãn kia (theo định nghĩa `second_opinion` của file), `margin_below` là ngưỡng của hiệu confidence (box đang xét trừ ý kiến thứ hai). Giá trị âm nghĩa là nhãn kia phải mạnh hơn ít nhất chừng đó thì quy tắc mới bắt.

### 4.2. Mức hai box cùng ảnh

| Khuôn               | Bắt lỗi khi                                                    | Tham số                                                                                    | Check hiện có tương ứng                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forbidden_inside`  | Box nằm gần trọn trong box của nhãn khác                       | `container` (danh sách nhãn), `containment`, `not_duplicate_iou` (tuỳ chọn)                | `context.vehicle_in_large_vehicle`, `person_in_vehicle`, `light_in_vehicle`, `sign_in_vehicle`                                                                                        |
| `forbidden_overlap` | Hai box chồng nhau quá ngưỡng                                  | `with` hoặc `between`; `iou`; `flag`; `min_rival_confidence`, `score_by_margin` (tuỳ chọn) | `geometry.cross_class_overlap`, `manual_overlap`, `light_overlap`, `sign_overlap`, `duplicate_draft`, `stronger_duplicate`, `context.person_two_wheeler`; file cặp: `pair.same_place` |
| `must_not_cover`    | Box ôm cả vật thể của nhãn khác                                | `objects` (danh sách nhãn), `containment`, `min_objects` (số box bị ôm trọn tối thiểu)     | `context.pole_covers_objects`                                                                                                                                                         |
| `relative_size`     | Box không lớn hơn đủ so với các box nhãn khác đứng cùng tầm xa | `compare_to`, `same_depth_within_bottom_fraction`, `min_neighbours`, `height_ratio_below`  | `pair.relative_size`                                                                                                                                                                  |

Tham số của `forbidden_overlap`:

- `with`: nhãn của box kia. Một danh sách nhãn, `same` (cùng nhãn), hoặc `other_labels` (mọi nhãn khác).
- `except_with`: các nhãn không tính dù khớp `with` (ví dụ `person` không bị coi là trùng với `two_wheeler`: người lái chồng lên xe là bình thường).
- `class_error_within_margin`: hai confidence cách nhau dưới mức này thì lỗi nghi ngờ là `CLASS` thay cho `error_type` của quy tắc, và nhãn của box kia được gợi ý.
- `between`: dùng thay `with` trong file cặp, ghi cả hai nhãn (`["car", "truck"]`).
- `flag`: box nào nhận điểm. `weaker` (confidence thấp hơn), `stronger` (confidence cao hơn), `later` (box vẽ sau, cho box người vẽ), hoặc một tên nhãn (luôn gắn cờ box mang nhãn đó, ví dụ `person` trong `person.overlap_two_wheeler`).
- `min_area_ratio`: diện tích box nhỏ chia box lớn phải từ mức này thì mới tính là trùng (`traffic_light.duplicate_same_label`).
- `min_rival_confidence`: box kia phải có confidence từ mức này, kể cả box vùng xám.
- `score_by_margin`: điểm theo bậc, thay cho `score`. Mỗi bậc có `lead_below`, `score`, có thể có `level`, và `when` mô tả bằng lời. `lead` là confidence của box bị gắn cờ trừ confidence của box kia; bậc đầu tiên có `lead_below` lớn hơn `lead` được dùng, bậc cuối không có `lead_below` nhận phần còn lại.

Quy tắc `applies_to: "model"` chỉ so box nháp với box nháp; `applies_to: "human"` chỉ so box người vẽ với nhau.

`forbidden_inside.not_duplicate_iou`: hai box chồng nhau từ mức này thì là gán trùng (việc của `forbidden_overlap`), không phải box nằm trong box.

`relative_size` chỉ chạy khi ảnh có ít nhất `min_neighbours` box nhãn `compare_to` có đáy lệch không quá `same_depth_within_bottom_fraction` (theo chiều cao ảnh) so với box đang xét. Nó bắt lỗi khi chiều cao box chia cho chiều cao các box đó nhỏ hơn `height_ratio_below`.

Guideline cho phép điều mà Policy cấm thì **không** viết thành quy tắc: nó là bản vá, tắt quy tắc hoặc bớt một nhãn khỏi `container` / `with` (mục 6). Khuôn `waive` (mục 4.8) là việc khác: Policy tự nới một check của chính nó trong một điều kiện đo được.

### 4.3. Mức track

| Khuôn               | Bắt lỗi khi                                       | Tham số                                                                                                                                                                           | Check hiện có tương ứng                                           |
| ------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `constant_in_track` | Một trường đổi giá trị trong cùng track           | `field`: `label` \| `attribute:<tên>`; `mode`: `blip` (chỉ frame giữa lệch hai frame kề) \| `any_change`; `max_frame_gap`                                                         | `temporal.class_inconsistency` (dạng `blip`)                      |
| `smooth_in_track`   | Một đại lượng nhảy quá ngưỡng so với hai frame kề | `quantity`: `area` \| `position` \| `confidence`; `max_change`; `relative_to`: `mean_of_neighbours` \| `box_diagonal`; `direction`: `drop` (chỉ tính chiều giảm); `max_frame_gap` | `geometry.bbox_area`, `bbox_position`, `confidence.neighbor_drop` |
| `max_gap`           | Track mất rồi hiện lại sau quá số frame cho phép  | `frames`                                                                                                                                                                          | có khuôn, chưa quy tắc nào dùng                                   |

### 4.4. Mức ảnh (`_frame.json`)

Quy tắc mức ảnh không cộng điểm cho box. Chúng quyết định ảnh có được tự chấp nhận hay không, và chỉ chạy khi dự án có box của mô hình. Id của quy tắc là id của rule trong báo cáo (`coverage.*`); `_frame.json` còn có `missing_candidates`: ba ngưỡng xác định box xám nào được báo là vật nghi bị sót của ảnh. File nhãn nhắc lại các quy tắc liên quan tới nó trong `frame_rules`. Mỗi quy tắc có thêm `reason` (vì sao ảnh như vậy cần người xem) và `measured` (số ảnh quy tắc bật, và tỉ lệ ảnh trong số đó có vật bị mô hình sót).

| Khuôn             | Kích hoạt khi                                  | Tham số                                                                                                                                                                                            | Rule hiện có tương ứng                                                                                                             |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `frame_count`     | Số box của một nhóm nhãn vượt hoặc chạm ngưỡng | `labels` (danh sách hoặc `any`), `state`: `draft` \| `grey`; với `grey` có thêm `min_confidence`, `min_long_side_px`, `max_overlap_with_any_draft`; `op`: `>=` \| `>` \| `==`; `value`; `blocking` | `coverage.no_draft_box`, `bus_present`, `grey_vehicles`, `dense_traffic`, `grey_person`, `crowd`, `many_lights`, `many_stop_signs` |
| `frame_condition` | Ảnh có điều kiện xấu và nhiều box vùng xám     | `env_risk_min`, `grey_boxes_over`, `grey_min_confidence`, `blocking`                                                                                                                               | `coverage.night_grey`                                                                                                              |

### 4.5. Khuôn `builtin`

Một số check hiện có dùng logic phức tạp không gói được vào vài tham số (ví dụ phân biệt hành khách sau kính với người đứng trước xe, hay ước lượng đường chân trời). Chúng giữ nguyên code và xuất hiện trong Policy dưới dạng:

```json
{
  "id": "car.ego_bonnet",
  "template": "builtin",
  "params": { "check": "context.ego_vehicle" },
  "score": 30,
  "text": "Không gán nắp ca-pô của chính xe gắn camera.",
  "source": "label_policy N4"
}
```

Ngoài `check`, `params` của một quy tắc `builtin` được phép chép các ngưỡng đang nằm trong code (ví dụ `min_env_risk`, `max_confidence` của `env.poor_condition`; `max_bottom_over_height` của `geometry.vehicle_position`). Chúng để người đọc biết check đang dùng con số nào; engine không đọc lại chúng.

Với `builtin`, dự án chỉ bật, tắt hoặc đổi điểm được; không đổi được logic. Các check cần giữ dạng này: `context.ego_vehicle`, `context.person_in_vehicle` (phần nhận diện người đi bộ), `context.barrier_spans_vehicle`, `geometry.vehicle_position` (phần đường chân trời), `env.poor_condition`.

### 4.6. Khuôn `manual`

```json
{
  "id": "person.on_billboard",
  "template": "manual",
  "text": "Không gán người trên biển quảng cáo, tượng, ma-nơ-canh và hình phản chiếu trong kính.",
  "source": "guideline 2D mẫu, mục 4.2"
}
```

Dùng cho mọi quy định mà muốn kiểm phải nhìn ảnh hoặc cần phán đoán. Không có `score`, không chạy. Vẫn phải viết ra: đây là thứ để so với Guideline và là danh sách kiểm cho người duyệt.

Dấu hiệu một quy định phải là `manual`: muốn áp dụng thì phải biết vật thể trong ảnh thật sự là gì, phải biết có vật thể nào chưa được gán, hoặc câu chữ không có con số ("quá nhỏ", "che khuất nhiều", "ôm sát").

### 4.7. Mức thấy được và mức cảnh báo

Hai khuôn dưới đây chấm theo việc **có đủ căn cứ để tin box là đúng nhãn hay không**, thay vì theo hình dạng. Chúng dùng hai đại lượng khai báo ở đầu file của nhãn:

- `visibility`: phần của vật còn thấy được, từ 0 đến 1. Lấy từ attribute phần trăm nếu có, nếu không thì ước lượng từ box (phần còn trong khung hình nhân với phần không bị box đứng gần hơn che). Ước lượng từ box luôn tính dư phần bị che.
- `confirmability`: danh sách dấu hiệu khó xác nhận (confidence thấp, ảnh xấu, box nhỏ, phân vân nhãn). Dấu hiệu nào thiếu dữ liệu thì không tính.

| Khuôn             | Bắt lỗi khi                                                             | Tham số                                                                                                      | Check hiện có tương ứng    |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------- | ------- |
| `visibility_risk` | Vật bị che hoặc bị cắt quá ngưỡng **và** có đủ số dấu hiệu khó xác nhận | `visibility_below`, `weak_signals_at_least`                                                                  | `visibility.mostly_hidden` |
| `min_visibility`  | Vật còn thấy dưới ngưỡng tối thiểu                                      | `visibility_below`; `action_when_measured`, `action_when_estimated`: `ignore` \| `visibility.barely_visible` | `queue`                    | chưa có |

`min_visibility` tách hai trường hợp theo nguồn của `visibility`: đo được từ attribute phần trăm (`action_when_measured`) hay chỉ ước lượng từ box (`action_when_estimated`). Các file dùng `ignore` cho trường hợp đo được (engine xếp box vào trạng thái `ignored` trước khi chạy check) và `queue` cho trường hợp ước lượng, vì số đo cho thấy đa số box loại này là box thừa. Ước lượng không được dùng để `ignore`.

Cách tính: nếu box mang một attribute trong `percent_attributes` thì `visibility = 1 − phần trăm / 100`. Nếu không, `visibility = phần còn trong khung hình × (1 − phần bị che)`. Box chạm mép trái/phải thì phần còn trong khung là `rộng × typical_ratio ÷ cao`; chạm mép trên/dưới là `cao ÷ (rộng × typical_ratio)`; tối đa 1. Phần bị che là phần diện tích box nằm dưới các box nhãn `occluders` có đáy thấp hơn, mỗi box thu nhỏ còn `occluder_shrink` quanh tâm.

Ngưỡng của hai khuôn lấy từ `visibility.thresholds` của file (`mostly_hidden`: 0,5; `barely_visible`: 0,05). `visibility.estimate_from_boxes` ghi công thức ước lượng, gồm `occluder_shrink` (box che được thu nhỏ còn bấy nhiêu quanh tâm trước khi tính).

Các mức (`level`):

| Mức       | Ý nghĩa                                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ignore`  | Box không được đánh giá và không vào danh sách nào                                                                                                               |
| `warning` | Lỗi tìm được có `level: "warning"`: hiện cho người duyệt và vào `warning_cases` của báo cáo, nhưng **không cộng điểm**, không chặn ảnh, không vào hàng đợi chính |
| `queue`   | Vào hàng đợi review khi tổng điểm từ 30 (`tiers.flagged`)                                                                                                        |
| `high`    | Mức cao khi tổng điểm từ 70 (`tiers.high`)                                                                                                                       |

Attribute không phải bộ dữ liệu nào cũng có (ví dụ `occluded`) được khai báo với `required: false` và `when_absent: "skip"`: có thì dùng, không có thì các quy tắc dựa vào nó tự bỏ qua.

### 4.8. Khuôn `waive`

Khuôn duy nhất **bớt** điểm thay vì cộng. Nó tắt một số check cho một box nháp khi một điều kiện đo được xảy ra; check bị tắt ghi lý do bỏ qua `policy_waived`. Hiện chỉ dùng trong file cặp.

```json
{
  "id": "car_truck.car_keeps_name",
  "status": "active",
  "template": "waive",
  "params": {
    "label": "car",
    "when_second_opinion_is": "truck",
    "waives": [
      "confidence.class_margin",
      "confidence.vehicle_confusion",
      "geometry.cross_class_overlap"
    ]
  },
  "applies_to": "model",
  "text": "Box car có ý kiến thứ hai là truck không bị cộng điểm vì phân vân nhãn.",
  "source": "số đo"
}
```

| Tham số                  | Ý nghĩa                                             |
| ------------------------ | --------------------------------------------------- |
| `label`                  | Nhãn của box được nới                               |
| `when_second_opinion_is` | Chỉ nới khi ý kiến thứ hai (mục 2.1) là nhãn này    |
| `waives`                 | Id các check của engine không tính điểm cho box này |

Không có `score`. Ngoài điều kiện đã ghi, các check trong `waives` vẫn chạy bình thường (ví dụ khi ý kiến thứ hai là bus). Một quy tắc `waive` phải có `evidence` hoặc `measured` cho thấy check bị nới đang báo động giả trong điều kiện đó.

## 5. File chung

`_dataset.json` giữ những gì không thuộc riêng nhãn nào. Dưới đây là phần lõi của file; engine đọc các giá trị này qua `core/risk/policy.ts`, và ghi `policy_version` vào mọi báo cáo.

```json
{
  "schema_version": "1.0.0",
  "policy_version": "5.1.0",
  "labels": [
    "car",
    "truck",
    "bus",
    "two_wheeler",
    "person",
    "traffic_light",
    "traffic_sign",
    "barrier",
    "pole"
  ],
  "merged_labels": { "two_wheeler": ["motorcycle", "bicycle"] },
  "aliases": {
    "stop_sign": "traffic_sign",
    "motorcycle": "two_wheeler",
    "bicycle": "two_wheeler",
    "motor": "two_wheeler",
    "motorbike": "two_wheeler",
    "bike": "two_wheeler",
    "pedestrian": "person",
    "rider": "person"
  },
  "unknown_label": "score_as_core",
  "thresholds": {
    "working_score": 0.3,
    "grey_floor": 0.1,
    "containment": 0.9,
    "duplicate_iou": 0.8,
    "edge_px": 2,
    "poor_env": 0.5
  },
  "tiers": { "flagged": 30, "high": 70, "relabel_flagged": 5, "relabel_high": 2 }
}
```

- `merged_labels`: các nhãn đã gộp vào một nhãn khác. Tên cũ nằm trong `aliases`, nên engine chấm chúng như nhãn mới. Khác với alias thường, khi import (`mergeLabels` trong `core/risk/policy.ts`) annotation mang tên cũ được **đổi tên** thành nhãn mới, nên dữ liệu lưu và dữ liệu xuất ra chỉ còn một nhãn. Alias thường (`rider`, `stop_sign`) chỉ là cách viết khác: engine hiểu nhưng không sửa dữ liệu. Lệnh `npm run import -- ... --engine 5.0.0` không đổi tên, vì engine đó còn hai nhãn.
- `groups.flagged_bonus_boxes`: `queue` (đang dùng) đưa box bonus bị gắn cờ từ 30 điểm vào hàng đợi chính và chặn ảnh khỏi tự chấp nhận; chỉ box core mới đẩy ảnh sang `relabel`. `advisory` chỉ liệt kê chúng ở danh sách phụ, như engine 4.0.0. Việc **thiếu** box bonus thì không bao giờ chặn ảnh.
- `labels` là danh sách đóng. `unknown_label: "score_as_core"` là hành vi hiện tại của engine: nhãn ngoài danh sách không bị gắn cờ chỉ vì lạ, không có luật riêng và không có cỡ tối thiểu, nhưng các quy tắc chung vẫn chạy và box bị gắn cờ chặn ảnh như nhãn `core`. Giá trị `flag` (gắn cờ mọi box mang nhãn lạ) được dự trù nhưng engine chưa có.
- Ngoài các trường trong ví dụ, file còn có: `groups` (nhãn nào `core`, nhãn nào `bonus`), `pairs` (các file cặp), `label_normalisation`, `min_side_px`, `normal_ratio` (cho khuôn `edge_sliver`), `box_states` (`draft`, `manual`, `grey`, `ignored`, `invalid`, `unsupported`), `scoring`, `auto_accept` và `open_questions`.
- `rules` trong `_dataset.json` là các quy tắc chạy trên **mọi nhãn**, id có dạng `any.<chủ đề>`. Hiện có bốn quy tắc theo track (mục 4.3) và tám quy tắc mức box **dự phòng** (`valid_box`, `low_confidence`, `class_margin`, `edge_sliver`, ...). Quy tắc dự phòng chạy trên nhãn nào mà file của nhãn đó không có quy tắc cho cùng `check`: nhãn ngoài danh sách, và `barrier`, `pole` khi box của chúng có confidence. File nhãn đã có quy tắc cho `check` đó, ở bất kỳ `status` nào, thì quy tắc dự phòng không chạy trên nhãn ấy. Các quy tắc chung mức box vẫn được chép vào từng file nhãn, vì điểm và số đo của chúng khác nhau theo nhãn.
- `thresholds` là các ngưỡng chung: trạng thái box (`working_score`, `grey_floor`) và các check `builtin`. Quy tắc theo khuôn không lấy mặc định từ đây; mỗi quy tắc ghi đủ tham số của mình (mục 9).

## 6. Bản vá của một dự án

Guideline không tạo ra bộ quy tắc riêng. Nó tạo ra một danh sách thay đổi trên Policy; engine đọc Policy sau khi đã vá. Không có bản vá thì chạy đúng Policy mặc định. Engine nhận bản vá qua `analyzeDataset(data, { patches })` và ghi lại chúng trong báo cáo; bản vá không hợp lệ làm engine báo lỗi. Phần server và giao diện hiện vẫn chỉ sinh ra dạng tắt check theo nhãn (`waivers`), chưa sinh bản vá (mục 9).

```json
{
  "policy_version": "3.0.0",
  "patches": [
    {
      "op": "set",
      "rule": "person.min_height",
      "params": { "px": 20 },
      "from": { "line": 23, "quote": "Không gán box có cạnh dài nhỏ hơn 20 px." }
    },
    {
      "op": "disable",
      "rule": "person.overlap_two_wheeler",
      "from": { "line": 35, "quote": "box person được phép chồng lấn với box xe." }
    },
    {
      "op": "narrow",
      "rule": "car.inside_large_vehicle",
      "params": { "container": { "remove": ["truck"] } },
      "from": { "line": 30, "quote": "Xe con được chở trên xe chuyên chở vẫn gán từng xe." }
    },
    {
      "op": "add",
      "label": "person",
      "rule": {
        "id": "project.person.track",
        "template": "required_track",
        "score": 30,
        "text": "Mọi box phải có track_id."
      },
      "from": { "line": 25, "quote": "Ảnh trích từ video thì mọi box phải có track_id." }
    }
  ]
}
```

| `op`      | Tác dụng                                     | Tương ứng với lựa chọn trên giao diện           |
| --------- | -------------------------------------------- | ----------------------------------------------- |
| `set`     | Đổi tham số hoặc điểm của một quy tắc có sẵn | Guideline chặt hơn hoặc lỏng hơn về con số      |
| `disable` | Tắt một quy tắc                              | Guideline cho phép điều Policy cấm              |
| `narrow`  | Bớt nhãn khỏi một tham số dạng danh sách     | Guideline cho phép trong một trường hợp hẹp hơn |
| `add`     | Thêm quy tắc mới theo một khuôn có sẵn       | Guideline có tình huống Policy chưa có          |

Ràng buộc để lựa chọn luôn có hiệu lực:

- `rule` phải là một id có trong Policy; `template` của quy tắc thêm mới phải là một khuôn ở mục 4.
- Bản vá không hợp lệ thì bị từ chối khi tạo dự án, không được bỏ qua trong im lặng.
- Mỗi bản vá ghi dòng Guideline làm căn cứ (`from`), để truy ngược được vì sao điểm thay đổi.
- Quy định `manual` không vá được: nó không chạy ở cả hai phía.

## 7. Ví dụ đầy đủ: `person.json`

Ví dụ dưới đây là bản rút gọn để minh hoạ khuôn dạng, bỏ lớp bọc `person_policy` và các trường `status`, `check`; các con số trong đó là số minh hoạ. File thật là `policy/person.json`, với số chép từ code của engine (ví dụ tỉ lệ cao/rộng dưới 0,8 và mức chồng 0,5 với xe hai bánh).

```json
{
  "schema_version": "1.0.0",
  "label": "person",
  "group": "core",
  "definition": {
    "includes": ["người đi bộ", "người đang ngồi trên xe hai bánh"],
    "excludes": ["người ngồi trong ô tô, xe tải, xe buýt", "hình người in, tượng, phản chiếu"]
  },
  "attributes": [],
  "rules": [
    {
      "id": "person.min_side",
      "template": "min_size",
      "params": { "side": "long", "px": 16, "action": "ignore" },
      "text": "Box người có cạnh dài dưới 16 px không được đánh giá.",
      "source": "label_policy"
    },
    {
      "id": "person.aspect",
      "template": "aspect_ratio",
      "params": { "min": 1.5, "max": 4.5 },
      "score": 30,
      "error_type": "BBOX",
      "text": "Box người có tỉ lệ cao/rộng bất thường.",
      "source": "label_policy N2"
    },
    {
      "id": "person.inside_vehicle",
      "template": "builtin",
      "params": { "check": "context.person_in_vehicle" },
      "score": 30,
      "error_type": "EXTRA_OBJECT",
      "text": "Không gán người ngồi bên trong ô tô, xe tải, xe buýt.",
      "exceptions": ["Người đứng trước xe, ở xa phía sau xe, hoặc ló ra ở góc trên của box xe."],
      "source": "label_policy N4, N12"
    },
    {
      "id": "person.overlap_two_wheeler",
      "template": "forbidden_overlap",
      "params": { "with": ["two_wheeler"], "iou": 0.8, "flag": "weaker" },
      "score": 30,
      "error_type": "BBOX",
      "text": "Box người và box xe hai bánh gần trùng nhau: một box đang ôm cả hai.",
      "source": "label_policy N3"
    },
    {
      "id": "person.low_confidence",
      "template": "low_confidence",
      "params": { "below": 0.5 },
      "applies_to": "model",
      "score": 20,
      "text": "Box người do mô hình sinh ra có độ tin cậy dưới 50%.",
      "source": "label_policy N5"
    },
    {
      "id": "person.on_billboard",
      "template": "manual",
      "text": "Không gán người trên biển quảng cáo, tượng, ma-nơ-canh, hình phản chiếu.",
      "source": "chưa có trong policy; lấy từ guideline 2D mẫu"
    }
  ]
}
```

Lưu ý: `score` và khoảng tỉ lệ trong ví dụ này là minh hoạ cho khuôn dạng. Khi chuyển Policy thật sang dạng này, từng con số phải được chép từ code của check tương ứng, không lấy từ ví dụ.

## 8. Cách viết một quy định mới

1. Viết quy định thành một câu (`text`) và ghi nguồn.
2. Hỏi: kiểm được chỉ bằng nhãn, toạ độ, attribute, confidence, `track_id` của các box **đã có** không?
   - Không: dùng `manual`, dừng ở đây.
3. Chọn khuôn ở mục 4 theo phạm vi: một box, hai box, track, hay cả ảnh.
4. Điền mọi tham số bằng con số cụ thể. Chưa có con số thì quy định chưa xong; để tạm `manual` và ghi chú thiếu ngưỡng nào.
5. Không khuôn nào khớp: ghi lại quy định dưới dạng `manual` kèm ghi chú "cần khuôn mới", để gom các trường hợp giống nhau trước khi thêm khuôn.
6. Kiểm tra trùng: hai quy tắc cùng nhãn, cùng khuôn, cùng đối tượng thì phải gộp hoặc chọn một.

## 9. Những gì khuôn dạng này chưa giải quyết

- **Sửa policy là đổi điểm.** Engine đọc thẳng các file này, nên mỗi lần đổi quy tắc phải ra phiên bản engine mới và giữ bản cũ (mục 1.1). Engine 4.0.0 được giữ ở `core/risk_v4` và 5.0.0 ở `core/risk_v5`; báo cáo của mỗi bản khớp với bản trước khi tách trên các bộ dữ liệu sinh ngẫu nhiên (3.000 bộ cho 4.0.0, 1.500 bộ cho 5.0.0).
- **Gộp nhãn làm mất thông tin.** Từ policy 4.0.0, dữ liệu import không còn phân biệt xe máy với xe đạp. Bên dùng dữ liệu cần phân biệt thì phải thêm một attribute. AI Check (`core/risk/ai-compare.ts`) chưa biết nhãn `two_wheeler`: mô hình của nó vẫn trả `motorcycle` và `bicycle`, nên box `two_wheeler` bị bỏ qua vì nhãn không được hỗ trợ.
- **Box gộp nhiều xe và box quá to so với vật.** Đo trên 66.227 box nháp car, truck, bus: 0,7% là box gộp từ hai xe trở lên, 1,1% là box to quá 1,5 lần vật. Không dấu hiệu nào từ toạ độ tách được chúng: box chứa box xe khác sai 12,1%, bằng mức chung 12,2%, vì xe gần che xe xa là cảnh thường gặp. Cần mô hình thứ hai (AI Check).
- **Điểm của các quy tắc mới bật chưa được kiểm trên dữ liệu ngoài.** Chúng lấy từ số đo trên một bộ dữ liệu; `*.occlusion_attributes_valid` (30) và `*.truncated_matches_edge` (10) là đánh giá, chưa có số đo.
- **Box đèn có confidence thấp.** 84% số box đèn sai có confidence dưới 0,5, và trong nhóm đó đúng sai gần ngang nhau. Toạ độ box không tách được chúng; các quy tắc vị trí chỉ bắt được khoảng 7% số lỗi, dù rất chắc. Đèn cho người đi bộ, mặt sau hộp đèn và đèn bị sót cũng không có dấu hiệu nào trong dữ liệu box. Cần tín hiệu từ ảnh (màu, độ sáng vùng box) hoặc mô hình thứ hai.
- **Biển báo.** Mô hình chỉ sinh biển stop, nên gần như mọi biển khác đều thiếu box và không quy tắc nào thấy được việc đó.
- **Còn thiếu file cho cặp truck–bus và car–bus.** `barrier` và `pole` chưa có số đo nào; bốn quy tắc theo track cũng vậy, vì dữ liệu đã đo là ảnh rời.
- **Khuôn chưa hỗ trợ:** `position_band` với `relative_to: "horizon"`; `forbidden_overlap` với `flag` là nhãn của box kia ngoài file cặp; `constant_in_track` cho attribute và dạng `any_change`.
- **`thresholds` chưa là giá trị mặc định cho khuôn.** Mỗi quy tắc phải ghi đủ tham số của mình; `thresholds` chỉ được các check `builtin` và phần xếp trạng thái box dùng.
- **Câu chữ cho người duyệt, thứ tự và phiên bản check vẫn nằm trong code.**
- **"Ý kiến thứ hai" chưa có dữ liệu thật.** Dự đoán đã đo không có `label_top2`, nên các quy tắc của file cặp được đo bằng box trùng chỗ; cần đo lại khi có `label_top2`.
- **`scoring.severe_from_side_px` chưa được engine dùng.**
- **Bản vá mới đi được một phần đường.** Engine nhận `set`, `disable`, `narrow`, `add`. Dự án thật dùng `add`: quy tắc mới hoặc chặt hơn của Guideline mà người dùng chọn và điền số trong bảng "Kiểm tra rules" thành một quy tắc check `guideline.<id>` (`shared/guideline-rules.ts`), lưu trong `metadata.guideline_patches` và tính vào fingerprint. Phần nới lỏng vẫn đi bằng waivers; `set`, `disable`, `narrow` chưa được sinh ra.
- **Bộ nhãn khác hẳn** (ví dụ Guideline 3D dùng `Vehicle`, `Pedestrian`) cần thêm một bảng ánh xạ nhãn theo dự án; khuôn dạng này chưa có chỗ cho nó.
- **Hình học 3D** (cuboid, yaw, mặt đường) chưa có khuôn nào trong engine. Policy 3D đề xuất, kèm các khuôn 3D, nằm ở `policy3d/`: xem [Policy 3D (bản nháp)](policy-3d-draft.md).
- **Bước dịch Guideline thành bản vá vẫn do mô hình làm**, nên vẫn cần bộ đáp án để đo độ chính xác.
