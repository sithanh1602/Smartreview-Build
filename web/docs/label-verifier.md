# Label verifier — kiểm nhãn bằng ảnh

Trạng thái: **chạy được bằng lệnh `npm run verify`; chưa ghép vào server, DB hay giao diện, và chưa đổi điểm của Risk Engine.**

Risk Engine chỉ nhìn toạ độ, nhãn và confidence của box. Với box do người vẽ (không có confidence), nó không có căn cứ nào để thấy một box bị gán sai nhãn: bộ thử 4 ảnh với 23 lỗi sai lớp cố ý không có lỗi nào đạt 30 điểm ở engine 6.0.0. Label verifier bổ sung chỗ đó: một mô hình nhìn phần ảnh nằm trong box và cho biết ảnh đó khớp nhãn nào.

Mô hình không gán nhãn và không tự cho điểm. Nó trả mức khớp của ảnh với từng nhãn; số điểm lấy từ `policy/_verifier.json`.

## Các phần

| Phần                                     | Ở đâu                                               | Việc                                                                     |
| ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| Mô hình và môi trường Python             | repo `label-verifier`, ngang hàng với `SmartReview` | `verify.py`: nhận danh sách box và câu mô tả nhãn, cắt ảnh, trả mức khớp |
| Câu mô tả nhãn và bảng điểm              | `policy/_verifier.json`                             | Dữ liệu: hỏi mô hình cái gì, và một mức bất đồng đáng bao nhiêu điểm     |
| Dựng yêu cầu, đổi câu trả lời thành điểm | `core/risk/label-verify.ts`                         | Thuần tính toán, không đọc file, không gọi mô hình                       |
| Gọi mô hình                              | `server/verify/label-verifier.ts`                   | Chạy `verify.py` bằng Python của repo kia, gửi yêu cầu qua stdin         |
| Lệnh                                     | `scripts/verify.ts`                                 | `npm run verify`                                                         |

Mô hình hiện dùng là SigLIP 2 base (`google/siglip2-base-patch16-224`), chạy cục bộ; ảnh không rời máy.

## Cài đặt

```
cd ../../label-verifier
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Rồi đặt trong `web/.env`:

```
LABEL_VERIFIER_DIR=../../label-verifier
```

Không đặt biến này thì SmartReview vẫn chạy bình thường; chỉ lệnh `npm run verify` báo thiếu.

## Chạy

```
npm run verify -- --format smartreview-json --input dataset.smartreview.json --images images/ --out report.json
```

`--format` nhận các định dạng của `npm run import` (mặc định `smartreview-json`). `--dir` chỉ thẳng tới repo mô hình thay cho `LABEL_VERIFIER_DIR`. Báo cáo ghi ra `--out` (hoặc stdout); tiến độ và danh sách box nghi sai nhãn in ra stderr.

## Cách chấm

1. Mỗi box bbox có nhãn nằm trong `captions` và cạnh dài từ `crop.min_side_px` được cắt ra khỏi ảnh, giữ thêm lề `crop.margin` (tính theo cạnh của box). Mô hình nhìn một ảnh vuông: với `crop.shape: "pad"` ảnh cắt được đặt vào giữa một nền xám vuông, không bị kéo méo.
2. Mô hình so ảnh cắt với câu mô tả của từng nhãn. Với `pool: "mean"` mỗi nhãn được đại diện bằng trung bình các câu của nó. Các nhãn chia nhau một đơn vị, nên điểm của một box cộng lại bằng 1.
3. `predicted` là nhãn được tin nhất ngoài nhóm của nhãn đang gán. `lead` là điểm của `predicted` trừ điểm của nhãn đang gán.
4. `lead` được tra vào `findings[].score_by_lead`: bậc đầu tiên mà `lead` đạt tới quyết định điểm. Bậc có `level: "warning"` chỉ cảnh báo, không cộng điểm. Dưới bậc cuối thì box không bị gắn gì.

Hai nhãn trong cùng một cặp ở `not_distinguished.pairs` (hiện là `person` và `two_wheeler`) không được đem ra phân xử với nhau: mô hình thấy `two_wheeler` trên một box `person` thì box đó không bị gắn cờ. Khi so với nhãn khác, điểm của hai nhãn trong cặp được cộng lại, vì mô hình chia niềm tin giữa người lái và chiếc xe; lý do hiện cho người duyệt ghi cả hai tên (`person hoặc two_wheeler`).

Bảng điểm hiện tại: `lead` từ 0,8 là 50 điểm, từ 0,6 là 30 điểm, từ 0,3 là cảnh báo.

Box không kiểm được nằm trong `skipped` của báo cáo kèm lý do (`not_a_bbox`, `unsupported_label`, `invalid_box`, `below_minimum_size`, `missing_image`, `image_not_found`, `empty_crop`); không box nào bị bỏ qua trong im lặng.

## Báo cáo

```json
{
  "schema_version": "1.0.0",
  "dataset_id": "...",
  "model": "google/siglip2-base-patch16-224",
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

## Giới hạn

- **Kết quả phụ thuộc cỡ box và chất lượng ảnh.** Bộ thử 4 ảnh có box lớn, ảnh rõ, nên tốt hơn nhiều so với dữ liệu có nhãn đúng, nơi phần lớn box dưới 96 px.
- **Car, truck, bus còn báo nhầm 4–7% ở mức 30 điểm.** Một phần do nhãn đúng dùng để đo gọi xe bán tải và xe van là `car`, còn câu mô tả ở đây xếp chúng vào `truck` theo bảng đặt tên của policy; phần này chưa tách ra được.
- **Đèn và biển báo nhỏ nhận kém.** Bắt được dưới 30% lỗi nhầm giữa hai nhãn này ở mức 30 điểm.
- **Vật bị che bởi vật khác nhãn** bị báo nhầm: mô hình thấy vật đứng trước.
- **`barrier` và `pole` chưa có số đo.**
- **Mô hình không đọc phần chữ của policy.** Nó chỉ dùng các câu mô tả trong `captions`; các quy tắc `manual` (người trên biển quảng cáo, hình phản chiếu) cần một mô hình đọc được cả ảnh lẫn chữ.
- **Lệnh hiện kiểm mọi box, kể cả box vùng xám của mô hình.** Khi ghép vào engine cần giới hạn ở box đang được chấm.
- **Chưa ghép vào engine.** Điểm của verifier nằm trong báo cáo riêng; `engine_version` và điểm của dự án không đổi.
