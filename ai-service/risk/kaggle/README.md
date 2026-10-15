# Kaggle — review annotation có AI vẽ trước

Notebook mô phỏng đúng quy trình của web app: **YOLO pre-label → annotator chỉnh trên CVAT → reviewer kiểm tra**, và đo xem reviewer nên mở box/ảnh nào trước, ảnh nào được nhận luôn.

- `label_error_benchmark.py` — mã nguồn, chạy được như script thường (đã test local).
- `label_error_benchmark.ipynb` — bản để upload, sinh từ file `.py` bằng `python build_notebook.py`. Sửa `.py` rồi build lại, đừng sửa `.ipynb` bằng tay.

## Chạy trên Kaggle

1. **Tạo dataset:** Kaggle → Datasets → New Dataset → upload `outputs/kaggle/smartreview_bdd_bundle.zip` (86 MB: `gt.json` + 1500 ảnh BDD100K val).
2. **Tạo notebook:** File → Import Notebook → chọn `label_error_benchmark.ipynb`.
3. **Add Input** → chọn dataset vừa tạo. Notebook tự tìm `gt.json` và thư mục ảnh dưới `/kaggle/input`.
4. **Settings:** Accelerator = GPU, Internet = On (để cài `ultralytics`, `cleanlab` và tải weights).
5. **Run All.** Hai detector (YOLO11n làm pre-label, YOLO11x làm model thứ hai) mất vài phút trên GPU.
6. Tải về từ `/kaggle/working`: `benchmark.json`, `benchmark_chart.png`, `review_queue.csv`, `possible_real_bdd_errors/`.

Đổi model: sửa `PRELABEL_MODEL` / `SECOND_MODEL` ở ô cấu hình. Đổi hành vi annotator giả lập: sửa `ANNOTATOR`.

## Chạy local

```bash
cd ai-service/risk
SR_INPUT=<thư mục chứa gt.json và images/> SR_OUT=<thư mục output> \
SR_PRELABEL_MODEL=yolo11n.pt SR_SECOND_MODEL=yolo11s.pt SR_MAX_IMAGES=300 \
../../.venv/Scripts/python.exe kaggle/label_error_benchmark.py
```

`SR_MAX_IMAGES=0` (mặc định) chạy cả 1500 ảnh. Prediction được cache theo tên model trong thư mục output.

## Mỗi box có những tín hiệu gì

| Nhóm | Tín hiệu | Lấy từ đâu trong sản phẩm thật |
| --- | --- | --- |
| Confidence pre-label | confidence của box AI gốc, box ẩn dưới 0.25 annotator không thấy, lớp cạnh tranh, độ ổn định vị trí khi lật ảnh | File pre-label do `prelabel_tracking.py` sinh ra |
| Lịch sử chỉnh sửa | giữ nguyên / đã sửa / tự vẽ / đã xoá, IoU giữa box cuối và box AI, có đổi lớp không | Ghép box export từ CVAT với file pre-label theo IoU; CVAT cũng ghi `source=auto/manual` (importer đã đọc) |
| Model thứ hai | một detector mạnh hơn có đồng ý với box không, có thấy xe ở chỗ chưa có box không | Chạy thêm một model lúc review |
| Hình học, bối cảnh | kích thước, tỷ lệ, sát mép ảnh, box chồng nhau, ngày/đêm, thời tiết | Có sẵn |
| Tìm xe bị sót (ứng viên v2) | box từ 4 lượt (2 model × ảnh gốc/lật) xuống tới 0.01; số lượt đồng thuận, độ ổn định vị trí, cùng hàng với xe đã label, bị xe phía trước che, kích thước có hợp với vị trí trong ảnh không | Từ output detector và chính các box annotator đã vẽ |

`SR_CANDIDATES=v1` chạy lại cách tìm xe bị sót cũ (một model, ngưỡng 0.05) để so sánh.

## Đọc kết quả thế nào

- **Annotator là giả lập.** Hướng hành vi lấy từ literature (xác nhận lớp AI đề xuất, ít soi box lệch nhẹ, tin box AI tự tin — automation bias), còn con số trong `ANNOTATOR` là giả định. Khi reviewer bắt đầu lưu quyết định trong web app, thay chúng bằng thống kê thật.
- **`possible_real_bdd_errors/`**: AI tự tin thấy một chiếc xe mà chính nhãn BDD100K không có box. Một phần là lỗi thật của BDD100K, một phần là AI nhận nhầm — soi bằng mắt trước khi đưa lên slide.
- **ObjectLab** dùng ngưỡng chỉnh theo phân bố confidence của model thứ hai: ngưỡng mặc định 0.95 gần như không box YOLO nào đạt.
