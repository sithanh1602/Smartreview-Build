# Label verifier — kiểm nhãn bằng ảnh

Trạng thái: **hai engine nằm trong repo. Trong giao diện, lượt quét chạy đúng một lần cho mỗi lần đưa dữ liệu lên: người tạo project chọn cách tìm lỗi trong popup sau khi upload, và các box bị phát hiện sai nhãn vào hàng đợi của trang Review ("Bắt đầu kiểm tra"). Risk Engine không bị chạy lại và không bị sửa. Lệnh `npm run verify` vẫn chạy riêng được.**

Risk Engine chỉ nhìn toạ độ, nhãn và confidence của box. Với box do người vẽ (không có confidence), nó không có căn cứ nào để thấy một box bị gán sai nhãn: bộ thử 4 ảnh với 23 lỗi sai lớp cố ý không có lỗi nào đạt 30 điểm ở engine 6.0.0. Label verifier bổ sung chỗ đó: một mô hình nhìn phần ảnh nằm trong box và cho biết ảnh đó khớp nhãn nào.

Mô hình không gán nhãn và không tự cho điểm. Nó trả mức khớp của ảnh với từng nhãn; số điểm lấy từ `policy/_verifier.json`.

## Các phần

| Phần                                     | Ở đâu                                                  | Việc                                                                              |
| ---------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Hai engine                               | `server/verify/verify.py`                              | Nhận danh sách box và câu mô tả nhãn, cắt ảnh, trả mức khớp. `siglip` hoặc `qwen` |
| Gói Python                               | `server/verify/requirements.txt`, cài vào `../.venv`   | `./setup.sh --verifier`                                                           |
| Tải mô hình                              | `server/verify/download_models.py`                     | Tải từng mô hình về thư mục của nó                                                |
| Hai mô hình                              | hai thư mục ngang hàng với `SmartReview`               | `siglip2-base-patch16-224/` (1,5 GB) và `Qwen2.5-VL-3B-Instruct/` (7,1 GB)        |
| Engine, câu mô tả nhãn và bảng điểm      | `policy/_verifier.json`                                | Dữ liệu: hỏi mô hình cái gì, và một mức bất đồng đáng bao nhiêu điểm              |
| Dựng yêu cầu, đổi câu trả lời thành điểm | `core/risk/label-verify.ts`                            | Thuần tính toán, không đọc file, không gọi mô hình                                |
| Gọi engine                               | `server/verify/label-verifier.ts`                      | Chạy `verify.py` bằng Python của repo, gửi yêu cầu qua stdin                      |
| Lệnh                                     | `scripts/verify.ts`                                    | `npm run verify`                                                                  |
| Chạy trong project                       | `server/verify/service.ts`                             | Quản lý lượt chạy, kết hợp với Risk Engine, lưu kết quả                           |
| Đưa kết quả vào hàng đợi review          | `server/verify/queue.ts`                               | Thêm finding và điểm kết hợp vào case; box đủ điểm vào hàng đợi                   |
| Giao diện                                | `src/features/verify/ScanChoice.tsx`, `ScanStatus.tsx` | Popup chọn cách quét trước khi upload; một dòng trạng thái ở trang project        |

Cả hai mô hình chạy cục bộ; ảnh không rời máy.

| Engine   | Mô hình                           | Cách hỏi                                                                  | Tốc độ (GPU 4 GB)      | Bảng điểm     |
| -------- | --------------------------------- | ------------------------------------------------------------------------- | ---------------------- | ------------- |
| `siglip` | `google/siglip2-base-patch16-224` | So ảnh cắt với từng câu mô tả của nhãn                                    | khoảng 60 box mỗi giây | đã đo         |
| `qwen`   | `Qwen/Qwen2.5-VL-3B-Instruct`     | Một câu trắc nghiệm, mỗi nhãn một lựa chọn; đọc xác suất của từng chữ cái | khoảng 4 box mỗi giây  | chưa đo riêng |

`siglip` là engine mặc định (`engines.default`). Bảng `score_by_lead` được đặt theo số đo của `siglip`; báo cáo của `qwen` ghi `calibrated: false` và lệnh in một dòng nhắc rằng điểm của nó chỉ để so sánh.

## Cài đặt

```
./setup.sh --verifier                                     # ở gốc repo: transformers, bitsandbytes... vào .venv
.venv/bin/python web/server/verify/download_models.py     # tải cả hai mô hình; thêm siglip hoặc qwen để tải một
```

Tải bằng `./setup.sh --model siglip,qwen` (hoặc `--all_model`): mỗi model vào một thư mục con của `model/Model_bbox/`, tải dở thì chạy lại để tải tiếp. **Model cho popup quét nhãn nằm trong `model/Model_bbox/`** (ngang hàng với `web/`, đã thêm vào `.gitignore` nên không bị push). Mỗi model là một thư mục con có `config.json` và file trọng số `.safetensors` / `.bin`, ví dụ `model/Model_bbox/siglip2-base-patch16-224/`. Backend tự nhận loại theo `model_type` trong `config.json`: có chữ `siglip` thì dùng cho bước quét, `qwen2_vl` / `qwen2_5_vl` thì dùng cho bước xem lại; thư mục khác bị bỏ qua. Symlink tới thư mục model ở chỗ khác cũng được. Đổi chỗ thư mục bằng `LABEL_VERIFIER_MODELS_DIR` (tính từ `web/`, mặc định `../model/Model_bbox`).

Lệnh `npm run verify` và `download_models.py` vẫn dùng hai biến cũ trong `web/.env`, đường dẫn tính từ `web/`:

```
LABEL_VERIFIER_SIGLIP_DIR=../../siglip2-base-patch16-224
LABEL_VERIFIER_QWEN_DIR=../../Qwen2.5-VL-3B-Instruct
```

Không đặt biến của một engine thì mô hình của nó được tải về `~/.cache/huggingface` ở lần chạy đầu. `LABEL_VERIFIER_PYTHON` chỉ cần khi dùng một Python khác `.venv` của repo. Máy không cài phần này thì SmartReview vẫn chạy bình thường; chỉ lệnh `npm run verify` báo thiếu. `./setup.sh --check` báo tình trạng của gói Python và hai thư mục.

Phần cứng: `qwen` nạp ở dạng 4-bit (`bitsandbytes`) với lô 4 ảnh cắt, dùng khoảng 3,1 GB bộ nhớ GPU; dạng thường cần khoảng 8 GB. Hai mô hình không nạp cùng lúc được trên GPU 4 GB, nên mỗi lần chạy là một tiến trình với một engine. Không có GPU thì cả hai chạy CPU; `qwen` rất chậm.

## Chạy

```
npm run verify -- --format smartreview-json --input dataset.smartreview.json --images images/ --out report.json
npm run verify -- --input dataset.smartreview.json --images images/ --engine qwen --out report.qwen.json
```

`--format` nhận các định dạng của `npm run import` (mặc định `smartreview-json`). `--engine` chọn `siglip` hoặc `qwen` (mặc định theo policy). Báo cáo ghi ra `--out` (hoặc stdout); tiến độ và danh sách box nghi sai nhãn in ra stderr.

`verify.py` cũng chạy trực tiếp được: một yêu cầu JSON vào stdin (hoặc file ở tham số đầu), một JSON ra stdout, tiến độ ra stderr dạng `progress <xong> <tổng>`. Mọi thiết lập (`engine`, `model`, `margin`, `shape`, `pool`, `labels`) đi theo yêu cầu, lấy từ `policy/_verifier.json`; `verify.py` không có ngưỡng hay giá trị mặc định nào của riêng nó.

## Chạy trong project

Lượt quét được chọn **lúc tạo project** và **chỉ chạy một lần**. Bấm "Tạo và nhập dữ liệu" chỉ kiểm tra form trên trình duyệt rồi mở popup "Chọn cách quét nhãn"; chưa có project nào được tạo, chưa có tệp nào được tải lên. Bấm "Quay lại" thì đóng popup, không có gì thay đổi. Bấm "Nhập dữ liệu" / "Nhập dữ liệu và quét" thì form mới tạo project, tải lên, chờ server nhận dataset, gửi lựa chọn quét (`POST /api/projects/:id/label-verify`, server giữ yêu cầu cho tới khi project sang Ready) rồi sang trang project.

| Ô trong popup              | Mặc định                                          | Việc                                                                                             |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Risk Engine                | luôn bật, khoá                                    | Chạy lúc import như trước giờ; lựa chọn bên dưới không đổi cách nó chạy hay kết quả của nó       |
| Quét bằng model ảnh        | tích nếu `model/Model_bbox/` có model loại SigLIP | Chọn model trong danh sách. Chỉ khi được tích thì ảnh mới bị cắt theo từng box và model mới chạy |
| Xem lại bằng model thứ hai | không tích                                        | Chọn model loại Qwen2.5-VL. Chỉ tích được khi ô trên đang tích                                   |

Popup đọc danh sách model từ `GET /api/projects/label-verify/models` (tài khoản Leader; không cần project vì project chưa được tạo). Route theo project `GET /api/projects/:id/label-verify/models` (Leader của project) vẫn còn và trả cùng dạng, trả `{ first: [...], second: [...] }`. Thư mục trống thì ô đó bị khoá và popup báo chưa có model. Bỏ tích ô quét thì không lượt quét nào chạy và project chỉ có kết quả của Risk Engine. Không có nút hay trang nào để quét lại sau đó: yêu cầu quét thứ hai cho cùng dữ liệu bị từ chối (409). Ngoại lệ duy nhất là lượt quét bị lỗi (ví dụ GPU hết bộ nhớ): dòng trạng thái ở trang project hiện nút "Thử lại" cho Leader, gửi lại đúng lựa chọn cũ.

Khi bấm nút mà import còn đang chạy nền (đưa ảnh lên kho lưu trữ, lưu risk case), lựa chọn được giữ ở backend và lượt quét tự bắt đầu khi project sang READY; lựa chọn đang chờ mất nếu server khởi động lại trước lúc đó.

**Kết quả đi đâu.** Lượt quét không có trang riêng. Chỉ box bị phát hiện sai mới tới tay người duyệt, ở trang Review mở bằng nút **Bắt đầu kiểm tra**:

- `siglip` xem mọi box mà Risk Engine chấm; box vùng xám (`grey`) và box `ignored` không được xem (`with_risk_engine.skip_states`).
- Box được verifier cho điểm (từ 30) nhận thêm một finding `verifier.wrong_label` bên cạnh các finding của Risk Engine, và điểm của nó thành điểm Risk Engine cộng điểm verifier, tối đa 100. Box đủ 30 điểm mà chưa ở trong hàng đợi thì vào hàng đợi; box đã ở trong hàng đợi thì lên điểm và lên thứ hạng. Nhãn verifier gợi ý thành nhãn gợi ý của case nếu Risk Engine chưa gợi ý gì.
- Box chỉ ở mức cảnh báo (không có điểm) và box verifier không nghi thì không đổi gì, không vào hàng đợi.
- `qwen`, khi được chọn, xem lại các box `siglip` nghi từ mức cảnh báo. Điểm của nó không cộng vào; việc nó xác nhận hay không nằm trong phần "Evidence" của finding.

Báo cáo của Risk Engine, `engine_version` và fingerprint của dataset không đổi: kết quả quét được ghép vào hàng đợi ở tầng server (`server/verify/queue.ts`), mỗi lần dataset của project được nạp lại thì ghép lại từ kết quả đã lưu, và ghép hai lần không đổi gì thêm. Bảng `risk_cases` trong MySQL được cập nhật điểm và cờ hàng đợi, nên số liệu ở trang project (Risk Cases, Remaining, Progress) tính cả các case này. Quyết định review đã lưu không bị đụng tới. Không cần migration.

Trang project hiện một dòng trạng thái: đang chờ, đang quét (kèm tiến độ theo số khung), đã quét (bao nhiêu khung vào hàng đợi, bao nhiêu khung Risk Engine chưa bắt được), hoặc lỗi.

`GET /api/projects/:id/label-verify` trả trạng thái (`IDLE`, `RUNNING`, `FAILED`, `READY`; `queued: true` khi một lượt đang chờ). `POST` với `{ "model": "<tên thư mục>", "second_model"?: "<tên thư mục>" }` là yêu cầu quét của popup; tên phải là một model hợp lệ đang có trong `model/Model_bbox/` và đúng loại cho bước đó, nếu không trả 400: chỉ Leader, kiểm tra same-origin, một lần cho mỗi bản dataset. Kết quả lưu ở `storage/projects/:id/verify/latest.json` (hoặc kho lưu trữ chung) kèm fingerprint của dataset. Một lượt trên toàn server, tối đa 1000 ảnh, mỗi engine tối đa 30 phút.

Trên bộ 4 ảnh Việt Nam (54 box xem được): lượt mặc định mất khoảng 11 giây; hàng đợi review từ 5 case thành 6 (một ô tô bị người lái xe máy che, Risk Engine cho 0 điểm), và case SUV gán `truck` từ 70 lên 100 điểm, đứng đầu hàng đợi. Thêm `qwen` (xem lại 3 box) mất khoảng 27 giây.

## Cách chấm

1. Mỗi box bbox có nhãn nằm trong `captions`, cạnh dài từ `crop.min_side_px` và không dưới cỡ tối thiểu của chính nhãn nó (quy tắc `min_side` trong file nhãn) được cắt ra khỏi ảnh, giữ thêm lề `crop.margin` (tính theo cạnh của box). Mô hình nhìn một ảnh vuông: với `crop.shape: "pad"` ảnh cắt được đặt vào giữa một nền xám vuông, không bị kéo méo.
2. Engine `siglip` so ảnh cắt với câu mô tả của từng nhãn. Với `pool: "mean"` mỗi nhãn được đại diện bằng trung bình các câu của nó. Các nhãn chia nhau một đơn vị, nên điểm của một box cộng lại bằng 1. Engine `qwen` được hỏi "vật chính trong ảnh cắt là gì?" với mỗi nhãn một chữ cái, kèm các tên lấy từ `captions`; điểm của nhãn là xác suất của chữ cái đó, `pool` không áp dụng và báo cáo không có `caption`.
3. `predicted` là nhãn được tin nhất ngoài nhóm của nhãn đang gán. `lead` là điểm của `predicted` trừ điểm của nhãn đang gán.
4. `lead` được tra vào `findings[].score_by_lead`: bậc đầu tiên mà `lead` đạt tới quyết định điểm. Bậc có `level: "warning"` chỉ cảnh báo, không cộng điểm. Dưới bậc cuối thì box không bị gắn gì.

Hai nhãn trong cùng một cặp ở `not_distinguished.pairs` (hiện là `person` và `two_wheeler`) không được đem ra phân xử với nhau: mô hình thấy `two_wheeler` trên một box `person` thì box đó không bị gắn cờ. Khi so với nhãn khác, điểm của hai nhãn trong cặp được cộng lại, vì mô hình chia niềm tin giữa người lái và chiếc xe; lý do hiện cho người duyệt ghi cả hai tên (`person hoặc two_wheeler`).

Bảng điểm hiện tại: `lead` từ 0,8 là 50 điểm, từ 0,6 là 30 điểm, từ 0,3 là cảnh báo. Box vào `cases` từ mức `tiers.flagged` của `policy/_dataset.json` (30 điểm), cùng mốc với hàng đợi của Risk Engine.

Box không kiểm được nằm trong `skipped` của báo cáo kèm lý do (`not_a_bbox`, `unsupported_label`, `invalid_box`, `below_minimum_size`, `missing_image`, `image_not_found`, `empty_crop`); không box nào bị bỏ qua trong im lặng.

## Báo cáo

```json
{
  "schema_version": "1.0.0",
  "dataset_id": "...",
  "engine": "siglip",
  "model": "google/siglip2-base-patch16-224",
  "calibrated": true,
  "checked": 28,
  "skipped": [{ "annotation_id": "box-9", "reason": "below_minimum_size" }],
  "results": [
    {
      "annotation_id": "box-79",
      "frame_id": "image-3:0",
      "label": "car",
      "predicted": "person",
      "label_score": 0.02,
      "predicted_score": 0.97,
      "lead": 0.95,
      "score": 50,
      "rule_id": "verifier.wrong_label",
      "error_type": "CLASS",
      "suggested_label": "person",
      "reason": "Phần ảnh trong box giống person (97%) hơn car (2%)."
    }
  ],
  "min_score": 30,
  "cases": [],
  "warnings": []
}
```

Các con số trong ví dụ là minh hoạ khuôn dạng. `cases` là các box từ `min_score` điểm, cao trước; `warnings` là các box chỉ ở mức cảnh báo.

## Số đo

Cấu hình đo: SigLIP 2 base, `margin` 0,15, `shape: "pad"`, `pool: "mean"`, GPU 4 GB. Tốc độ khoảng 60 box mỗi giây sau khi mô hình đã nạp.

**Bộ thử sai lớp cố ý** (4 ảnh, 28 box người vẽ, 23 lỗi và 5 box đối chứng):

|                                  | Engine 6.0.0 | Label verifier             |
| -------------------------------- | ------------ | -------------------------- |
| Lỗi đạt từ 30 điểm               | 0/23         | 20/23 (19 box đạt 50 điểm) |
| Lỗi chỉ ở mức cảnh báo           | —            | 2/23                       |
| Lỗi dưới 30 điểm, không cảnh báo | 23/23        | 1/23                       |
| Box đối chứng bị gắn từ 30 điểm  | 1/5          | 1/5                        |

Ba lỗi không đạt 30 điểm: đèn gán thành biển báo (box 20×33 px), một ô tô gán `truck` và một xe tải gán `car`. Box đối chứng bị báo nhầm là một ô tô bị một người lái xe máy che gần hết.

**Dữ liệu có nhãn đúng** (4.900 box, 700 box mỗi nhãn, cạnh dài từ 24 px, ảnh 1280×720). Báo nhầm là tỉ lệ box đúng nhãn bị gắn; mức 30 điểm tính cả các box đạt 50 điểm:

| Nhãn đúng       | Cảnh báo trở lên | Từ 30 điểm | 50 điểm |
| --------------- | ---------------- | ---------- | ------- |
| `car`           | 14,4%            | 4,4%       | 1,6%    |
| `truck`         | 21,7%            | 7,0%       | 2,1%    |
| `bus`           | 24,0%            | 6,9%       | 1,3%    |
| `two_wheeler`   | 5,3%             | 2,1%       | 0,9%    |
| `person`        | 1,9%             | 0,3%       | 0,0%    |
| `traffic_light` | 31,1%            | 9,4%       | 3,1%    |
| `traffic_sign`  | 24,1%            | 6,9%       | 2,1%    |

Bắt được là tỉ lệ box bị đổi sang nhãn sai mà mô hình gắn ở mức đó:

| Lỗi                                      | Cảnh báo trở lên | Từ 30 điểm | 50 điểm |
| ---------------------------------------- | ---------------- | ---------- | ------- |
| `person` gán thành `car`                 | 92,6%            | 74,4%      | 58,6%   |
| `two_wheeler` gán thành `car`            | 78,6%            | 59,4%      | 42,6%   |
| `car` gán thành `person`                 | 63,4%            | 46,9%      | 30,4%   |
| `car` gán thành `truck`                  | 79,6%            | 52,3%      | 32,3%   |
| `truck` gán thành `car`                  | 65,1%            | 40,0%      | 22,7%   |
| `car` gán thành `bus`                    | 86,1%            | 54,7%      | 34,1%   |
| `bus` gán thành `car`                    | 67,0%            | 49,6%      | 39,0%   |
| `traffic_light` gán thành `traffic_sign` | 69,0%            | 25,9%      | 11,6%   |
| `traffic_sign` gán thành `traffic_light` | 62,0%            | 29,4%      | 16,6%   |

Hai lựa chọn cấu hình đến từ phép đo trên 1.500 box: kéo méo ảnh cắt thành hình vuông làm mô hình nhận đúng `person` ở 52% số box, đặt vào nền vuông là 77%, thêm lấy trung bình câu mô tả là 92%.

## Hai engine so với nhau

Đo trên RTX 3050 Ti 4 GB; báo cáo gốc và script đo nằm ngoài repo, ở `../verifier-test`.

- Với câu hỏi "nhãn này đúng không", `qwen` cho gần cùng đáp án với `siglip`. Trên 100 ảnh BDD100K (1.705 box, 20% bị đổi nhãn) ở mức 30 điểm: `siglip` bắt 46,9% và báo nhầm 3,6% trong 26 giây; `qwen` bắt 45,7% và báo nhầm 4,3% trong 6 phút.
- Hai engine sai ở những box khác nhau. Cả hai cùng gắn từ 30 điểm thì 90% số box bị gắn là lỗi thật (bắt 32,8%); `siglip` từ mức cảnh báo rồi `qwen` từ 30 điểm thì 85% (bắt 43,1%, `qwen` chỉ xem 28% số box). Cách ghép hai tầng này chưa có trong repo.
- `qwen` không cho kết quả y hệt giữa các lần chạy khác cỡ lô: điểm của một box xê dịch tới 0,04 theo các box cùng lô, đủ để một box sát ngưỡng đổi bậc. Thu nhỏ ảnh cắt hay tăng lô không làm nó nhanh hơn đáng kể.
- Cả hai engine gọi 30–40% box người lái là `two_wheeler`; vì vậy cặp `person`/`two_wheeler` trong `not_distinguished` phải giữ.

## Policy của verifier: những gì đã sửa (schema 1.1.0)

| Vấn đề                                                                                                                       | Sửa                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Policy chỉ ghi một `model`; engine thứ hai chỉ gọi được từ script thử ngoài repo                                             | `engines` ghi cả hai engine, engine mặc định, và `pool` nằm trong engine dùng nó (`siglip`)           |
| Bảng `score_by_lead` đo với `siglip` nhưng áp cho mọi mô hình mà không nói gì                                                | Mỗi engine có `calibrated`; `measured.engine` ghi engine đã đo; báo cáo mang `engine` và `calibrated` |
| Mốc 30 điểm của `cases` viết cứng trong code                                                                                 | Lấy từ `tiers.flagged` của `_dataset.json`                                                            |
| `crop.min_side_px` 24 px thấp hơn cỡ tối thiểu của `barrier` và `pole` (32 px): verifier chấm box mà engine coi là `ignored` | Box dưới cỡ tối thiểu của nhãn nó bị bỏ qua với lý do `below_minimum_size`                            |
| `verify.py` có mặc định riêng (`stretch`, `max`, lề 0,15) khác policy (`pad`, `mean`)                                        | Bỏ mọi mặc định: thiếu thiết lập thì `verify.py` báo lỗi                                              |
| `truck.json` ghi "xe bán tải (theo mặc định)" và thiếu van chở hàng, đầu kéo, trái với bảng `naming` của `car_truck.json`    | `definition.includes` của `truck` khớp bảng `naming`                                                  |
| `sources` của 10 file policy trỏ engine 4.0.0 vào `web/core/risk` (nay là 6.0.0)                                             | Trỏ về `web/core/risk_v4`                                                                             |

Các sửa đổi này không đổi điểm của Risk Engine: `ENGINE_VERSION` và `policy_version` giữ nguyên. Còn mở, ghi trong `open_questions`: câu mô tả chưa phủ hết định nghĩa nhãn (xe cứu hộ, xe chở rác, xe buýt trường học, xe đạp điện) và `qwen` chưa có bảng điểm riêng; cả hai cần đo lại trước khi sửa.

## Liên hệ với Guideline Review

Guideline Review (`server/guideline`, `docs/policy-format.md`) biến guideline của dự án thành bản nháp quy tắc; lựa chọn của người duyệt tắt check của Risk Engine theo nhãn (`shared/guideline-waivers.ts`). Verifier hiện đứng ngoài đường đó:

- **`verifier.wrong_label` không nằm trong danh mục check gửi cho mô hình đọc guideline**, nên không quy tắc nào của guideline tắt được nó. Lời nhắc của bước đọc guideline còn ghi công cụ không nhìn thấy pixel ảnh; khi verifier được ghép vào engine thì câu đó phải sửa cùng lúc.
- **Định nghĩa class của guideline không tới được `captions`.** Guideline mẫu (`fixtures/guideline/sample-2d.txt`) xếp bán tải vào `car` và xe ba bánh vào `motorcycle`; policy xếp bán tải vào `truck` và loại xe ba bánh khỏi `two_wheeler`. Với dự án theo guideline đó, verifier sẽ gợi ý `truck` cho một box bán tải gán đúng theo guideline.
- **Caption theo dự án đã có:** tab "Định nghĩa nhãn" của bảng "Kiểm tra rules" cho thêm câu mô tả tiếng Anh cho từng nhãn (ví dụ "a photo of a pickup truck" cho `car`). Câu được lưu với project (`metadata.guideline.captions`) và ghép sau caption của policy khi chạy verifier trong project. Bảng `score_by_lead` đã đo với caption gốc, nên thêm câu có thể làm điểm lệch.
- `waivers` cho `verifier.wrong_label` vẫn chưa làm.

## Giới hạn

- **Kết quả phụ thuộc cỡ box và chất lượng ảnh.** Bộ thử 4 ảnh có box lớn, ảnh rõ, nên tốt hơn nhiều so với dữ liệu có nhãn đúng, nơi phần lớn box dưới 96 px.
- **Car, truck, bus còn báo nhầm 4–7% ở mức 30 điểm.** Một phần do nhãn đúng dùng để đo gọi xe bán tải và xe van là `car`, còn câu mô tả ở đây xếp chúng vào `truck` theo bảng đặt tên của policy; phần này chưa tách ra được.
- **Đèn và biển báo nhỏ nhận kém.** Bắt được dưới 30% lỗi nhầm giữa hai nhãn này ở mức 30 điểm.
- **Vật bị che bởi vật khác nhãn** bị báo nhầm: mô hình thấy vật đứng trước.
- **`barrier` và `pole` chưa có số đo.**
- **Không engine nào đọc phần chữ của policy.** Cả hai chỉ dùng các câu mô tả trong `captions`; các quy tắc `manual` (người trên biển quảng cáo, hình phản chiếu) chưa được hỏi, kể cả với `qwen`.
- **Lệnh `npm run verify` kiểm mọi box, kể cả box vùng xám của mô hình.** Chỉ lượt chạy trong project mới giới hạn ở box Risk Engine chấm.
- **Bản dataset do Annotator gửi lại không được quét.** Lượt quét gắn với lần upload lúc tạo project; bản đã sửa là một bản dataset mới, chỉ có kết quả của Risk Engine.
- **Báo nhầm của verifier vào thẳng hàng đợi review.** Theo số đo, khoảng 3–4% box đúng nhãn bị gắn từ 30 điểm; người duyệt sẽ gặp chúng như các case khác.
- **Test trình duyệt (`tests/browser/projects.spec.ts`, đã sửa để bấm qua popup) chưa chạy được trên máy phát triển** vì tài khoản MySQL không có quyền vào database test.
