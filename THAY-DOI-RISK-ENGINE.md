# Thay đổi: engine 7.0.0 → 7.1.0, rescore và vật bị sót

Tài liệu này tóm tắt các thay đổi trên nhánh `ThanhBranch` sau commit `10b794a` (engine 2.2.0 port sang TypeScript), và những điểm cần lưu ý khi chạy, triển khai hoặc tiếp tục phát triển.

## 1. Ý tưởng chính

Dữ liệu annotator xuất từ CVAT **không có confidence**. Vì vậy dự án thêm một bước xử lý dữ liệu: model (YOLO11s) xem lại từng ảnh **một lần** và cho ra hai thứ.

1. **Rescore**: điểm của từng box người vẽ, tức model chắc bao nhiêu rằng có vật mang đúng nhãn đó ở đúng chỗ đó. Model không vẽ lại box, không thêm và không sửa nhãn.
2. **Vật bị sót**: vật model thấy, điểm từ 0,4, mà không box nào của người phủ lên.

Engine dùng hai thứ này để tìm box sai và vật bị sót. Mọi thứ hiện trong **cùng một hàng đợi review**.

```
File CVAT/COCO/... của annotator (chưa có điểm)
   │  Import: đánh dấu ô "Chấm điểm box bằng model" (tự đánh dấu khi file chưa có confidence)
   ▼
Server chạy YOLO11s trên từng ảnh (server/ai/rescore.ts → rescore.py → ai-service/score_boxes.py)
   │  - mỗi box: attributes.rescore
   │  - vật chưa có box: dataset.metadata.missing_hints
   ▼
Engine 7.1.0 quét
   ├─ box có rescore < 0,02           → ca nghi ngờ (30 điểm)
   ├─ box như trên nhưng cạnh < 16 px  → chỉ cảnh báo (không vào hàng đợi, không chặn ảnh)
   ├─ vật bị sót (xe, người, ≥ 0,4)    → ca "Thiếu box" trong hàng đợi + ảnh không được tự chấp nhận
   └─ các luật hình học / ngữ cảnh cũ  → như trước
```

## 2. Engine và policy

| Phiên bản | Ở đâu | Thay đổi |
|---|---|---|
| 6.0.0 | `web/core/risk_v6` (đóng băng) | Bản cũ, policy 4.0.0 |
| 7.0.0 | `web/core/risk_v7` (đóng băng) | Policy 5.0.0: `*.low_confidence` từ 20 lên 30 điểm, nên confidence thấp một mình đã vào hàng đợi |
| **7.1.0** | `web/core/risk` (hiện tại) | Policy 5.1.0: rescore, vật bị sót, cảnh báo box nhỏ |

Theo quy ước của dự án: thay đổi cách chấm thì lên phiên bản và giữ bản cũ. Dự án đã import bằng bản cũ vẫn chạy trên bản đó.

Luật mới trong policy:

- **`any.rescore_low`** (`web/policy/_dataset.json`, check `confidence.rescore_low`): rescore dưới **0,02** thì cộng 30 điểm. Box có cạnh ngắn dưới **16 px** chỉ được cảnh báo (`warning_side_below_px`), vì ở cỡ đó model gần như không phán xét được (mọi ngưỡng đều gắn cờ oan từ 23% box đúng).
- **`coverage.model_missing`** (`web/policy/_frame.json`): ảnh có vật core (car, truck, bus, two_wheeler, person) bị sót, điểm từ 0,4, thì không được tự chấp nhận. Luật này chạy cả trên ảnh chỉ có box người vẽ. Vật chồng từ **0,1 IoU** với một box **cùng nhãn** đã bị gắn cờ thì không tính (`skip_near_flagged_iou`): đó là box vẽ lệch, và ca của box đó đã báo.

Vì sao rescore cần thang riêng: box **đúng** do người vẽ có rescore trung vị chỉ 0,27 (box nhỏ 0,11), còn box hỏng gần như bằng 0. Nếu đọc rescore như confidence của pre-label (ngưỡng 0,3 và 0,5), hơn 60% box đúng sẽ bị gắn cờ oan. Vì vậy rescore là một trường riêng (`rescore`), **không** ghi vào `score`/`confidence`, và box vẫn được coi là box người vẽ.

## 3. Bước chấm điểm

- **Trên UI:** khi import có ô **"Chấm điểm box bằng model (rescore) và tìm vật bị sót"**, tiến độ hiện "Đang chấm điểm box bằng model: x/N ảnh…". Bước này chạy trên dữ liệu đã chuẩn hoá, nên mọi định dạng nhập đều dùng được.
- **Dòng lệnh** (khi muốn chấm trước rồi mới upload):
  ```
  python ai-service/score_boxes.py annotations.xml --images <thư mục ảnh> --out scored.xml
  ```
  Script nhận CVAT for images, CVAT for video và COCO, và ghi ra cùng file đó có thêm `rescore` và `<meta><smartreview_missing>` (COCO: `smartreview_missing`).

## 4. Thay đổi trên UI

- **Import:** có ô chấm điểm, và dòng "Điểm chấm lại box của người (rescore)" trong mục trường nhận diện.
- **Review:**
  - Ca vật bị sót có nhãn tím **"Thiếu box"**. Người duyệt chỉ quyết định gợi ý đúng hay sai: **Annotation Error** = đúng là bị sót (loại lỗi đặt sẵn là Missing Object, nhãn đặt sẵn là nhãn gợi ý), **Correct / False Alarm** = gợi ý sai.
  - Ô "Phạm vi review" có thêm **"Cảnh báo (xem thêm)"**.
- **Bàn giao cho annotator:** ca "Thiếu box" đã xác nhận nằm trong danh sách thiếu box. Khi annotator trả lại, hệ thống tự kiểm tra chỗ đó đã có box chưa.
- **Kiểm tra theo ảnh:** mỗi ảnh có kết luận của engine (Tự chấp nhận / Cần xem / Vẽ lại, kèm lý do), số "Nghi sót", và hai bộ lọc mới.
- **Tổng quan dự án:** thêm số Cảnh báo.

## 5. Kết quả đo

Tất cả đo trên BDD100K, dùng YOLO11s.

| Phép đo | Kết quả |
|---|---|
| Rescore tách box hỏng khỏi box đúng (400 ảnh, 15% box bị làm hỏng) | AUROC 0,92. Box cạnh từ 16 px: bắt 73% box hỏng, gắn cờ oan 11% box đúng |
| Vật bị sót (1500 ảnh, xoá 15% box) | Gợi ý tìm lại 39% box bị xoá; 79% gợi ý đúng vị trí; 94% gợi ý trúng đúng nhãn |
| Bộ test 100 ảnh có cài lỗi | Box lệch 61/61, box thừa 40/40, sai lớp 53/71, thiếu box 26/61 |
| Tốc độ | Khoảng 0,3–0,5 giây/ảnh trên CPU (100 ảnh khoảng 1 phút) |

Bộ test để thử lại trên UI (không nằm trong repo):
- `Downloads/bdd100k-test-100-chua-diem/`: chưa có điểm, dùng để test bước chấm điểm.
- `Downloads/bdd100k-test-100-loi/`: đã chấm sẵn.

Cả hai đều kèm đáp án (`dap_an.csv`, `dap_an_anh/`). Kết quả mong đợi: 395 ca = 347 box nghi sai + 48 ca "Thiếu box", và 173 cảnh báo.

## 6. Lưu ý

**Cấu hình** (trong `web/.env`, file này không có trong git):
- `SMARTREVIEW_AI_PYTHON`: Python có `ultralytics`, dùng chung với AI check.
- `SMARTREVIEW_SCORE_MODEL`: đường dẫn `yolo11s.pt`. Mặc định là `ai-service/yolo11s.pt`; trên máy dev hiện trỏ tới `ai-service/risk/yolo11s.pt`.
- File `.pt` bị `.gitignore` loại, **không có trong repo**. Máy chủ hoặc Docker phải tự tải `yolo11s.pt` về rồi khai báo đường dẫn. Thiếu model mà vẫn chọn chấm điểm thì import báo lỗi kèm hướng dẫn.

**Giới hạn đã biết:**
- **Ngưỡng gắn với model.** Ngưỡng 0,02 và 0,4 được đo với YOLO11s. Đổi model thì phải đo lại, dùng pipeline trong `ai-service/risk/`.
- Model COCO **không có lớp biển báo**, nên box `traffic sign` không được chấm.
- **car ↔ truck** là điểm yếu nhất. Phần lớn lỗi sai lớp bị sót là cặp này, vì YOLO thấy nhiều SUV và bán tải giống truck. Vì cùng lý do, vẫn còn một số ca "Thiếu box" trùng với box lệch khi model gọi khác loại với box đó. Coi car, truck, bus là một nhóm thì hết trùng nhưng mất vật bị sót thật, nên chưa làm.
- **Vật nhỏ:** vật dưới 32 px chỉ được tìm lại khoảng 17%. Box dưới 16 px chỉ được cảnh báo.
- **Ảnh tối hoặc mờ:** phần lớn box đúng bị gắn cờ oan nằm ở ảnh đêm, ảnh mờ, hoặc xe bị che.

**Khác:**
- `web/server/db/pool.ts`: thời gian chờ kết nối MySQL tăng từ 5 lên 20 giây và kết nối được giữ để dùng lại, vì đường hầm SSH dev đôi khi mất hơn 5 giây và gây lỗi `ETIMEDOUT`.
- `web/server/app.ts`: lỗi lập trình trong một request giờ in kèm stack ra terminal, để biết dòng gây lỗi.
- Test: `npm test` có khoảng 45 test lỗi **từ trước**, do cần MySQL test (`smartreview_test`), thiếu file demo và worker của AI check. Các test của engine, policy và importer đều qua.

## 7. Phần khác trong commit

- `ai-service/risk/`: pipeline benchmark (chia tập, predict, match, chạy engine, so sánh phiên bản) và kết quả dùng cho slide. Hướng dẫn trong `ai-service/risk/README.md` và `web/docs/review-policy.md`.
- `web/policy3d/` và `web/docs/policy-3d.md`: bản nháp policy cho dữ liệu 3D (58 luật, đa số ở trạng thái `proposed`, chưa chạy). Có test cấu trúc trong `web/tests/policy3d.test.ts`.

## 8. Tài liệu chi tiết

- `web/docs/confidence-checks.md`: rescore, vật bị sót, chấm điểm khi import, UI.
- `web/docs/policy-format.md`: bảng phiên bản engine và policy.
- `ai-service/score_boxes.py`: docstring có các con số đo được.
