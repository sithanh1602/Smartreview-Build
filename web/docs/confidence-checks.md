# Confidence checks — engine 2.2.0

Thay đổi trong `core/risk/checks/confidence.mjs` và `core/risk/engine.mjs`: đưa confidence của prediction thành tín hiệu độc lập trong Risk Engine, đúng yêu cầu của đề tài: _"bắt reviewer xem prediction có confidence **thấp** hoặc **bất thường**"_.

## Vấn đề trước khi sửa

Trước 2.2.0, confidence chỉ được đọc ở đúng một chỗ: check `confidence.neighbor_drop`. Check này có hai hạn chế:

1. **Không bao giờ tự tạo được case.** Check cho 20 điểm, trong khi queue chỉ nhận case có score ≥ 30 (`minScore` trong `engine.mjs`). Confidence chỉ cộng thêm điểm vào case mà check hình học đã tìm ra.
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

### Profile `2.2.0` trong `engine.mjs`

| Profile                                      | Check                                                                              | Dùng cho                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `2.0.0` (`ENGINE_VERSION`)                   | 5 check gốc, `neighbor_drop` v1                                                    | Project cũ — **không đổi điểm**                           |
| `2.1.0` (`IMAGE_ENGINE_VERSION`, export mới) | + 4 check ảnh đơn                                                                  | Project đã import trước thay đổi này — **không đổi điểm** |
| `2.2.0` (`LATEST_ENGINE_VERSION`)            | `neighbor_drop` **v2** + `confidence.low` + các check còn lại của 2.1.0 = 10 check | **Import mới**                                            |

Engine version được ghim theo từng project (`server/projects/service.mjs`), nên project cũ giữ nguyên kết quả. **Muốn thấy check mới trong app phải tạo project mới hoặc import lại dataset.**

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
- **Ngưỡng 0.5 chưa được hiệu chỉnh** bằng ground truth — đang chọn theo điểm vận hành của detector hiện tại. Các hằng số `LOW_CONFIDENCE`, `LOW_SCORE_RANGE`, `DROP_THRESHOLD`, `DROP_SCORE_RANGE` được export ở đầu `confidence.mjs`, chỉnh ở một chỗ.
- **Check chỉ chạy khi annotation có trường `confidence`.** Dataset từ pre-label của model (`prelabel_tracking.py`, demo `tracks.json`) có trường này. Annotation import từ CVAT hiện **không** mang confidence (`core/importers/cvat-images.mjs`), nên trên dữ liệu đó cả hai check đều skip.

## Test

`tests/confidence.test.mjs` (6 test):

- box confidence thấp ổn định tự tạo case ở 2.2.0, và không tạo case ở 2.0.0;
- điểm tăng dần khi confidence giảm, có sàn và trần;
- confidence ≥ 0.5 thì pass;
- thiếu confidence thì skip, không coi là 0;
- `neighbor_drop` v2 tự vào được queue và tăng theo mức sụt;
- profile 2.0.0 vẫn giữ đúng 20 điểm.

`tests/image-quality.test.mjs` và `tests/projects.test.mjs` cập nhật phiên bản mới nhất từ `2.1.0` thành `2.2.0`.

Chạy: `node --test tests/confidence.test.mjs tests/core.test.mjs tests/image-quality.test.mjs tests/coco.test.mjs` — 22/22 pass, không cần MySQL.
