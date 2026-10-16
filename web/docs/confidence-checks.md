# Confidence checks — engine 2.2.0

Thay đổi trong `core/risk_v1/checks/confidence.ts` và `core/risk_v1/engine.ts`: đưa confidence của prediction thành tín hiệu độc lập trong Risk Engine, đúng yêu cầu của đề tài: _"bắt reviewer xem prediction có confidence **thấp** hoặc **bất thường**"_.

## Vấn đề trước khi sửa

Trước 2.2.0, confidence chỉ được đọc ở đúng một chỗ: check `confidence.neighbor_drop`. Check này có hai hạn chế:

1. **Không bao giờ tự tạo được case.** Check cho 20 điểm, trong khi queue chỉ nhận case có score ≥ 30 (`minScore` trong `core/risk_v1/engine.ts`). Confidence chỉ cộng thêm điểm vào case mà check hình học đã tìm ra.
2. **Chỉ xét "bất thường", không xét "thấp".** Check so confidence của frame hiện tại với trung bình 2 frame bên cạnh. Một box confidence 0.27 ở cả 3 frame có độ sụt bằng 0, nên được chấm **0 điểm — "sạch"**, dù model gần như đang đoán. Ngoài ra check cần `track_id` và 2 frame láng giềng, nên dataset ảnh rời (BDD100K detection, COCO, CVAT images) luôn bị skip.

## Thay đổi

### `confidence.low` (check mới, v1.0.0)

Xét **giá trị tuyệt đối** của confidence. Không cần track hay láng giềng, nên chạy được trên cả ảnh rời.

|                         |                                                                   |
| ----------------------- | ----------------------------------------------------------------- |
| Điều kiện flag          | `confidence < 0.5`                                                |
| Điểm                    | 30 → 70, tuyến tính theo mức thấp: `30 + 40 × (0.5 − conf) / 0.5` |
| Ví dụ                   | conf 0.49 → 31 · conf 0.27 → 48 · conf 0 → 70                     |
| Không có confidence     | `skipped` với reason `missing_confidence` — không coi thiếu là 0  |
| Lý do hiện cho reviewer | `Model không chắc chắn: confidence 0.27 < 0.5`                    |

Sàn 30 bảo đảm một box confidence thấp **tự nó vào được queue**.

### `confidence.neighbor_drop` v2.0.0

Cùng điều kiện như v1 (trung bình confidence 2 frame bên cạnh − frame hiện tại ≥ 0.20), nhưng điểm tỷ lệ theo mức sụt thay vì cố định 20:

|       |                                                                          |
| ----- | ------------------------------------------------------------------------ |
| Điểm  | 30 → 80: `30 + 50 × (drop − 0.2) / 0.8`                                  |
| Ví dụ | 0.95 → 0.55 → 0.92 (sụt 0.385) → 42 · 0.95 → 0.10 → 0.95 (sụt 0.85) → 71 |

v1.0.0 (20 điểm cố định) **vẫn còn trong code** và vẫn là check được dùng ở profile 2.0.0 / 2.1.0.

### Profile `2.2.0` trong `core/risk_v1/engine.ts`

| Profile                                      | Check                                                                              | Dùng cho                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `2.0.0` (`ENGINE_VERSION`)                   | 5 check gốc, `neighbor_drop` v1                                                    | Project cũ — **không đổi điểm**                             |
| `2.1.0` (`IMAGE_ENGINE_VERSION`, export mới) | + 4 check ảnh đơn                                                                  | Project đã import trước thay đổi này — **không đổi điểm**   |
| `2.2.0` (`LATEST_ENGINE_VERSION`)            | `neighbor_drop` **v2** + `confidence.low` + các check còn lại của 2.1.0 = 10 check | Project đã import bằng 2.2.0 (import mới dùng engine 7.1.0) |

Engine version được ghim theo từng project (`server/projects/service.ts`), nên project cũ giữ nguyên kết quả. **Muốn thấy check mới trong app phải tạo project mới hoặc import lại dataset.**

## Trước và sau

Chạy cùng một annotation qua profile 2.0.0 và 2.2.0:

| Tình huống                        | 2.0.0                | 2.2.0                       |
| --------------------------------- | -------------------- | --------------------------- |
| conf 0.27 ở cả 3 frame            | 0 → không vào queue  | **48 → vào queue**          |
| conf 0.27, ảnh rời không có track | 0 → không vào queue  | **48 → vào queue**          |
| conf sụt 0.95 → 0.55 → 0.92       | 20 → không vào queue | **42 → vào queue**          |
| conf sụt mạnh 0.95 → 0.10 → 0.95  | 20 → không vào queue | **100 → vào queue**         |
| conf 0.49, sát ngưỡng             | 0 → không vào queue  | **31 → vào queue**          |
| conf 0.9 ổn định                  | 0                    | 0 — không sinh báo động giả |

Trên benchmark BDD100K (`ai-service/risk/results/`), độ tương quan giữa điểm của engine và số lỗi thật của ảnh (Spearman) tăng từ **0.07 (2.1.0) lên 0.33 (2.2.0)**.

## Lưu ý

- **Hai check có thể cùng bắn** trên một box (confidence vừa thấp vừa sụt). Điểm cộng dồn rồi cap ở 100 như mọi check khác, nên case tệ nhất bão hoà ở 100.
- **Ngưỡng 0.5 chưa được hiệu chỉnh** bằng ground truth — đang chọn theo điểm vận hành của detector hiện tại. Các hằng số `LOW_CONFIDENCE`, `LOW_SCORE_RANGE`, `DROP_THRESHOLD`, `DROP_SCORE_RANGE` được export ở đầu `confidence.ts`, chỉnh ở một chỗ.
- **Check chỉ chạy khi annotation có trường `confidence`.** Dataset từ pre-label của model (`prelabel_tracking.py`, demo `tracks.json`) có trường này. Annotation import từ CVAT hiện **không** mang confidence (`core/importers/cvat-images.ts`), nên trên dữ liệu đó cả hai check đều skip.

## Test

`tests/confidence.test.ts` (6 test):

- box confidence thấp ổn định tự tạo case ở 2.2.0, và không tạo case ở 2.0.0;
- điểm tăng dần khi confidence giảm, có sàn và trần;
- confidence ≥ 0.5 thì pass;
- thiếu confidence thì skip, không coi là 0;
- `neighbor_drop` v2 tự vào được queue và tăng theo mức sụt;
- profile 2.0.0 vẫn giữ đúng 20 điểm.

`tests/image-quality.test.ts` và `tests/projects.test.ts` cập nhật phiên bản mới nhất từ `2.1.0` thành `2.2.0`.

Chạy: `node --test tests/confidence.test.ts tests/core.test.ts tests/image-quality.test.ts tests/coco.test.ts` — 22/22 pass, không cần MySQL.

## Rescore và vật bị sót cho box do người vẽ (engine 7.1.0)

File CVAT hoặc COCO của annotator không có confidence. `ai-service/score_boxes.py` chạy YOLO một lần trên mỗi ảnh và cho ra hai thứ: điểm của **đúng các box có sẵn** (không thêm, không bớt, không sửa box), và danh sách vật model thấy mà chưa ai vẽ. Điểm của một box là xác suất cao nhất mà model cho đúng nhãn của box, lấy trong các ứng viên của model trùng với box (IoU ≥ 0,5).

```
python ai-service/score_boxes.py annotations.xml --images <thư mục ảnh> --out scored.xml
```

Điểm được ghi vào trường `rescore`, không ghi vào `score`, vì hai thang điểm khác nhau. Box đúng do người vẽ có trung vị 0,27 (box dưới 32 px chỉ 0,11). Nếu đọc nó như confidence, ngưỡng 0,3 và 0,5 của box mô hình sẽ đẩy nửa số box đúng vào vùng xám và gắn cờ hơn 60% box đúng. Vì vậy:

- importer đọc `rescore` vào `attributes.rescore`; box vẫn là box của người (`manual`), và bộ dữ liệu không thành output của mô hình;
- rule `any.rescore_low` (check `confidence.rescore_low`, family `weak`, 30 điểm) gắn cờ box có rescore dưới 0,02. Box có cạnh ngắn dưới 16 px thì chỉ được **cảnh báo** (không vào hàng đợi, không chặn ảnh), vì ở cỡ đó model gần như không phán xét được: mọi ngưỡng đều gắn cờ oan từ 23% box đúng.

Đo trên 400 ảnh BDD100K với 15,5% box bị làm hỏng có chủ đích, dùng YOLO11s: AUROC 0,92; dưới 0,02, tính trên box có cạnh ngắn từ 16 px, engine đưa 73% số box hỏng vào hàng đợi (23% nữa thành cảnh báo) và gắn cờ oan 11% box đúng. Trên bộ 100 ảnh test có cài lỗi (`Downloads/bdd100k-test-100-loi`), engine bắt 61/61 box lệch, 40/40 box thừa, 53/71 box sai lớp (phần sót gần như toàn car ↔ truck) và 26/61 box bị xoá. Box đúng bị gắn cờ phần lớn ở ảnh đêm, bị che hoặc mờ. Ngưỡng này gắn với model chấm điểm, nên đổi model thì phải đo lại. Lớp model không biết (ví dụ `traffic sign`) không được chấm.

### Vật bị sót

Cùng lần chạy đó, các detection của model (sau NMS, như AI check) mang một nhãn mà file có dùng, điểm từ 0,4 (`--missing`), và không box nào phủ lên (IoU từ 0,3, hoặc quá nửa detection nằm trong một box) được ghi thành danh sách gợi ý: CVAT trong `<meta><smartreview_missing>`, COCO trong `smartreview_missing`. Danh sách này **không bao giờ thành nhãn**. Importer lưu nó vào `dataset.metadata.missing_hints`; với CVAT video, frame không có box nào nhưng có vật bị sót vẫn được thêm vào dự án.

Luật mức ảnh `coverage.model_missing` (`policy/_frame.json`) chặn tự chấp nhận khi ảnh có vật core (xe, người) trong danh sách. Khác các luật coverage khác, luật này chạy cả trên ảnh chỉ có box người vẽ. Đo trên BDD100K 1500 ảnh với YOLO11s: trong 191 ảnh engine 7.0.0 tự chấp nhận, luật chặn 47 ảnh và cả 47 đều có vật bị sót thật; khi xoá 15% box thật (2281 box), gợi ý tìm lại 39% và 79% gợi ý là đúng. Vật dưới 32 px chỉ tìm lại được 17%.

Bỏ phần này bằng `--no-missing`.

### Trên UI

Mỗi vật bị sót mà luật `coverage.model_missing` nêu ra là **một ca trong hàng đợi review**, cùng danh sách với các box nghi sai (nhãn "Thiếu box"). Box của ca là box model đề xuất; điểm của ca là 40 + 40 × điểm của model (0,4 → 56, 0,9 → 76). Người duyệt chỉ quyết định gợi ý đúng hay sai: **Annotation Error** (loại lỗi đặt sẵn Missing Object, nhãn đặt sẵn là nhãn gợi ý) nghĩa là đúng là bị sót, và ca được gửi cho annotator trong danh sách thiếu box của bàn giao; **Correct / False Alarm** nghĩa là gợi ý sai. Các ca này không nằm trong danh sách annotation của ảnh. Vật chồng từ 0,1 (IoU) với một box cùng nhãn đã bị gắn cờ không thành ca: đó là box bị vẽ lệch, và ca của box đó đã báo (`skip_near_flagged_iou` trong luật).

Trang **Kiểm tra theo ảnh** hiện kết luận của engine cho từng ảnh (Tự chấp nhận / Cần xem / Vẽ lại, kèm lý do) và có hai bộ lọc: "Engine: cần xem hoặc vẽ lại" và "Có vật nghi bị sót".

Ở trang Review, ô **Phạm vi review** có thêm lựa chọn **Cảnh báo (xem thêm)**: các box engine chỉ cảnh báo, ví dụ box dưới 16 px có rescore thấp. Chúng không vào hàng đợi chính và không chặn ảnh; trang tổng quan dự án hiện số cảnh báo cạnh số Risk Cases.

### Chấm điểm ngay khi import

Khi tạo dự án, ô **Chấm điểm box bằng model (rescore) và tìm vật bị sót** (tự đánh dấu khi tệp nhãn chưa có confidence hay rescore) cho máy chủ chạy bước trên sau khi đọc tệp nhãn và trước khi engine quét: `server/ai/rescore.ts` gọi `server/ai/rescore.py`, dùng chung bộ chấm của `ai-service/score_boxes.py`. Bước này chạy trên dữ liệu đã chuẩn hoá nên mọi định dạng nhập đều dùng được. Người tạo dự án chọn model chấm điểm ngay dưới ô này:

| Model   | Tốc độ (CPU, ảnh 1280 px)                | Ghi chú                                           |
| ------- | ---------------------------------------- | ------------------------------------------------- |
| YOLO11n | nhanh nhất, ~0,2–0,3 giây/ảnh (ước tính) | kém nhất với vật nhỏ; hợp để chấm thử dataset lớn |
| YOLO11s | cân bằng, 0,3–0,5 giây/ảnh (đã đo)       | mặc định; ngưỡng của policy được đo với model này |
| YOLO11m | chậm nhất, ~0,6–1,0 giây/ảnh (ước tính)  | rescore không tốt hơn YOLO11s; ngưỡng chưa đo lại |
| YOLO26s fine-tune | cân bằng, ảnh 960 px (điểm train) | weights riêng, copy tay vào `ai-service/`; vật bị sót cắt ở 0,31 (điểm vận hành precision 0,8 của nó, `result_yolo26s/results/threshold_lock.json`); thang rescore đã đo riêng: AUROC 0,95, giữ 0,02 (bắt 93% box hỏng, cờ oan 11%; box từ 16 px: 94%/6%); box `train` không chấm (holdout 0/15, model mù) |

Model chưa có trên máy được server tải về `ai-service/` ở lần đầu chọn (YOLO11n 5,4 MB, YOLO11s 19 MB, YOLO11m 39 MB; trang import hiện "Đang tải model … lần đầu"), nên máy mới chỉ cần chạy `./setup.sh` (tạo `.venv` có Ultralytics và tải sẵn `yolo11s.pt`). Không tải được thì import báo lỗi kèm cách đặt file tay. Cấu hình tùy chọn: `SMARTREVIEW_AI_PYTHON` (chung với AI check; mặc định Python của `.venv`, cả trên Windows) và `SMARTREVIEW_SCORE_MODEL` (file YOLO11s, mặc định `ai-service/yolo11s.pt`; thư mục của nó cũng là nơi tìm các model khác). Trang import hiện tiến độ "Đang chấm điểm box bằng model: x/N ảnh…".
