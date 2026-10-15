# Risk pipeline — BDD100K benchmark

Đo xem review policy bắt được bao nhiêu lỗi thật. Policy và kết quả: [`web/docs/review-policy.md`](../../web/docs/review-policy.md).

```text
labels + ảnh ─ split.py ─▶ subset.json + images/          (1500 ảnh, phân tầng ngày/đêm × thời tiết)
images ─ predict_subset.py ─▶ predictions.json              (detector, conf 0.05, không chứa ảnh)
subset + predictions ─ match.py ─▶ matches.json             (TP / FP / FN / nhầm lớp / lệch vị trí)
predictions ─ engine_scores.mjs ─▶ engine_<ver>.json        (rule engine của web app, chạy nguyên bản)
tất cả ─ run_benchmark.py ─▶ signal_table.csv + benchmark.json
benchmark ─ plot_benchmark.py ─▶ benchmark_chart.png
signal_table ─ make_queue.py ─▶ review_queue_test.csv       (3 tầng + lý do)
```

## Chạy lại từ đầu

Cần `bdd100k.zip` (ảnh) và `bdd100k_labels_release.zip` (label 2018). Rút file label val trước:

```bash
W=work   # thư mục làm việc bất kỳ, ngoài repo
python -c "import zipfile; zipfile.ZipFile('bdd100k_labels_release.zip').extract('bdd100k/labels/bdd100k_labels_images_val.json', '$W')"

cd ai-service/risk
PY=../../.venv/Scripts/python.exe     # Linux/Kaggle: python
$PY split.py --labels $W/bdd100k/labels/bdd100k_labels_images_val.json --zip bdd100k.zip --out $W --size 1500
$PY predict_subset.py --images $W/images --out $W/predictions.json --imgsz 1280
$PY match.py --subset $W/subset.json --predictions $W/predictions.json --out $W/matches.json
node engine_scores.mjs $W/predictions.json $W/engine_2.2.0.json 2.2.0
node engine_scores.mjs $W/predictions.json $W/engine_2.1.0.json 2.1.0
node engine_scores.mjs $W/predictions.json $W/engine_6.0.0.json 6.0.0   # tùy chọn
node engine_scores.mjs $W/predictions.json $W/engine_7.0.0.json 7.0.0   # tùy chọn: engine của import mới
$PY run_benchmark.py --work $W
$PY plot_benchmark.py --work $W --out $W/benchmark_chart.png
$PY make_queue.py --work $W --split test
```

Trên CPU 12 nhân, YOLO11n chạy 0.17 s/ảnh, cả pipeline khoảng 6 phút. `seed=0` cố định nên chạy lại ra cùng subset.

Kiểm tra matching bằng mắt (plan C1 yêu cầu 20 ảnh): `render_check.py --work $W --out $W/check --names <ảnh...>`. Kết quả đã soi nằm trong `results/matcher_check/`.

## Thử detector mạnh hơn trên Kaggle

Đây là bước có giá trị nhất còn lại: với YOLO11n, tầng tự động nhận rỗng vì detector sót 56% số xe (xem policy). Chỉ cần chạy lại **bước predict** với model khác; mọi bước còn lại chạy local, vì `predictions.json` không chứa ảnh.

1. Upload `$W/images/` (1500 ảnh, ~90 MB) lên Kaggle làm dataset — không cần upload zip 6.3 GB.
2. Trong notebook GPU, copy `predict_subset.py` và chạy:
   ```bash
   pip install ultralytics
   python predict_subset.py --images /kaggle/input/<dataset>/images --out predictions.json        --model yolo11x.pt --device 0
   ```
3. Tải `predictions.json` về, đặt vào `$W`, chạy lại từ `match.py` trở xuống.

So sánh mục `alpha` trong `benchmark.json` giữa hai lần chạy: tỷ lệ ảnh tự động nhận được tăng bao nhiêu khi detector tốt hơn — đó là con số cho câu hỏi "confidence-based review tiết kiệm được gì".

## File

| File                | Việc                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `bdd.py`            | Đọc label BDD100K (bản 2018 và det_20) thành record phẳng                      |
| `split.py`          | Chọn subset phân tầng, tách calibration/test theo ảnh, rút đúng ảnh cần từ zip |
| `predict_subset.py` | Chạy detector, map lớp COCO → BDD, ghi `predictions.json`                      |
| `match.py`          | Ghép greedy 2 pass, gán nhãn lỗi theo spec plan v1.4                           |
| `engine_scores.mjs` | Chạy `web/core/risk/engine.ts` trên prediction                                |
| `run_benchmark.py`  | Bảng tín hiệu, scorer, đường cong theo ảnh và theo giờ, phân tích α            |
| `plot_benchmark.py` | Biểu đồ 2 panel                                                                |
| `make_queue.py`     | Queue 3 tầng kèm lý do                                                         |
| `render_check.py`   | Vẽ GT + prediction để soi tay matching                                         |
| `results/`          | Kết quả lần chạy YOLO11n, dùng cho slide                                       |
