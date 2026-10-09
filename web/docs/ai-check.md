# AI Check — Kiểm tra bằng AI (MVP)

Từ Projects → mở dự án READY → **AI Check (Kiểm tra bằng AI)** → Bắt đầu.
Ảnh được chạy cục bộ bằng YOLO11n trên CPU. Có tiến độ; rời trang và quay lại được.
Kết quả tồn tại qua lần khởi động lại. Lượt đang chạy bị ngắt sẽ hiện FAILED để chạy lại.

- Bất đồng class: IoU ≥ 0.5, nhãn khác nhau, ưu tiên 70.
- Bất đồng bbox: cùng nhãn, 0.15 ≤ IoU < 0.5, ưu tiên 50.
- Có thể thiếu nhãn: AI thấy vật thể (confidence ≥ 0.75) thuộc bộ nhãn của dataset nhưng chưa có annotation tại vùng đó (score 70-80).
- Chỉ dùng dự đoán confidence ≥ 0.65 (≥ 0.75 với ca thiếu), ghép một-một. Ưu tiên cùng nhãn và IoU ≥ 0.5 trước, rồi mới xét bất đồng nhãn; ghép cùng nhãn yếu được xét cuối. Trong mỗi nhóm ưu tiên, sắp theo IoU giảm dần.
- Viewer: annotation khung liền, AI khung xanh nét đứt (hoặc tím chấm trong kiểm tra ảnh). Có lọc, chuyển case và mở trang Review hoặc Kiểm tra theo ảnh để lưu quyết định MySQL hiện có.
- Điểm ưu tiên không phải xác suất lỗi. Model có thể sai; không sửa annotation tự động.
- Đây là báo cáo AI riêng. Số case và điểm của Risk Engine gốc không thay đổi.

## Cấu hình server tùy chọn

Mặc định dùng `<smartreview>/.venv/bin/python` và `<smartreview>/ai-service/yolo11n.pt` đã có.
Có thể cấu hình trong `web/.env`:

```
SMARTREVIEW_AI_PYTHON=/absolute/path/to/python
SMARTREVIEW_AI_MODEL=/absolute/path/to/local-model.pt
```

Python cần Ultralytics và PyTorch. Model phải tồn tại cục bộ, từ nguồn tin cậy.
Không nhận đường dẫn model hoặc lệnh Python từ request của trình duyệt.
Khởi động app như cũ: `npm run dev` trong thư mục web, hoặc `npm run build && npm start`.
Không cần migration MySQL hay dịch vụ Python riêng.

## Kiến trúc

`server/ai/predict.py` là adapter model tùy chọn, nhận manifest ảnh do server tạo.
`core/risk/ai-compare.ts` đối chiếu dự đoán với schema chuẩn, độc lập Ultralytics.
`server/ai/service.ts` quản lý job, một lượt trên toàn server, tối đa 1000 ảnh/20 phút.
GET/POST `/api/projects/:id/ai-check` đọc trạng thái/bắt đầu, POST kiểm tra same-origin.
`storage/projects/:id/ai/latest.json` lưu kết quả và fingerprint dataset, cấu hình, phiên bản model và SHA256 weights.
Annotation, output demo cũ và quyết định review hiện có không bị ghi đè.

## Giới hạn

Chỉ bbox, nhãn khớp chính xác tên lớp model (COCO với YOLO11n). Chưa có mapping nhãn tùy chỉnh hoặc polygon/3D. Đã có gợi ý đối tượng thiếu nhãn cho các lớp xuất hiện trong dataset.
Annotation không ghép được không đồng nghĩa đúng hoặc sai; được thống kê riêng.
Dataset chỉ có ảnh rời vẫn chạy được, không cần track ID hay confidence của annotation.
Demo video chỉ kiểm tra các frame đã có ảnh cache; số frame bỏ qua hiển thị rõ.
COCO128 thuộc dữ liệu COCO mà model có thể đã học: dùng kiểm thử chức năng, không dùng chứng minh khả năng tổng quát.
Đánh giá chất lượng cần tập lỗi thực được người kiểm tra, đo tỷ lệ lỗi thật trong các gợi ý hàng đầu.
