# Phân tích bố cục box và cách cắt ảnh

Đọc một file `.zip` dataset (file nhãn, kèm ảnh nếu có), đo từng box, đo mức chồng giữa các box
trong cùng ảnh, rồi gom box thành **đơn vị xem xét**: mỗi đơn vị là một vùng ảnh nên cắt ra và
xem cùng lúc. Phần này chỉ đo hình học, không chấm điểm rủi ro (việc đó của Risk Engine) và không
gọi mô hình.

| File                         | Việc                                                                    |
| ---------------------------- | ----------------------------------------------------------------------- |
| `core/analysis/layout.ts`    | Đo box, đo chồng, gom đơn vị, tính vùng cắt. Không đọc file.            |
| `server/analysis/archive.ts` | Đọc `.zip` thành dataset (`readDatasetArchive`), cắt ảnh (`cropUnits`). |
| `scripts/analyze.ts`         | Lệnh `npm run analyze`.                                                 |
| `tests/layout.test.ts`       | Test, không cần DB.                                                     |

## Chạy

```bash
npm run analyze -- --input dataset.zip --out layout.json --crops crops --outline
```

- `--out`: ghi báo cáo JSON. Không có `--out` lẫn `--crops` thì JSON ra stdout.
- `--crops DIR`: cắt mỗi đơn vị thành `DIR/<kind>/<unit>.jpg`, đã phóng theo `scale`.
- `--outline`: vẽ khung từng box lên ảnh cắt, mỗi box một màu.
- `--link-share 0.2`, `--max-members 6`: đổi ngưỡng gom cụm.

Định dạng nhãn được tự nhận (CVAT for images 1.1, COCO, Datumaro, YOLO…) như lúc tạo project.
Định dạng không ghi kích thước ảnh (YOLO, KITTI, MOT) cần ảnh nằm trong `.zip`. ZIP64 chưa đọc
được.

## Đo từng box (`boxes[]`)

| Trường                | Nghĩa                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| `x, y, width, height` | Vị trí và kích thước, pixel. Polygon/polyline dùng khung bao.                 |
| `center`              | Tâm box, tỉ lệ 0–1 theo chiều rộng và chiều cao ảnh.                          |
| `zone`                | Tâm rơi vào ô nào trong 9 ô của ảnh (`top-left` … `center` … `bottom-right`). |
| `area_share`          | Diện tích box trên diện tích ảnh.                                             |
| `aspect`              | Cao chia rộng.                                                                |
| `size`                | `tiny` (cạnh dài < 24 px), `small` (< 32²), `medium` (< 96²), `large`.        |
| `edges`               | Các mép ảnh mà box chạm: vật bị khung hình cắt ở đó.                          |
| `unit_id`             | Đơn vị chứa box.                                                              |

Box không đo được (mask, cuboid, cạnh ≤ 0, không biết kích thước ảnh) nằm trong `skipped` kèm lý
do.

## Đo mức chồng

`overlapOf(a, b)` trả về diện tích chung, `iou`, phần của từng box nằm dưới box kia (`share_a`,
`share_b`) và `share_small`: **phần của box nhỏ hơn bị box kia phủ**. Gom cụm dùng `share_small`
chứ không dùng IoU, vì box nhỏ nằm trên box lớn có IoU rất thấp dù bị phủ gần hết.

Hai box **cùng nhãn** được xếp loại theo mức chồng:

| Loại        | Điều kiện           | Ý nghĩa                                     |
| ----------- | ------------------- | ------------------------------------------- |
| `duplicate` | IoU ≥ 0,8           | Nhiều khả năng một vật bị vẽ hai lần.       |
| `nested`    | `share_small` ≥ 0,9 | Box nhỏ nằm gọn trong box lớn.              |
| `heavy`     | `share_small` ≥ 0,5 | Vật này che hơn nửa vật kia.                |
| `partial`   | `share_small` ≥ 0,2 | Chồng một phần.                             |
| (không nối) | dưới 0,2            | Chỉ chạm nhau; mỗi box vẫn là đơn vị riêng. |

## Đơn vị xem xét (`units[]`)

- **`single`**: box không nối với box nào. Cắt riêng.
- **`cluster`**: các box cùng nhãn nối nhau (`car`, `car`, `car`…). Cả cụm là một ảnh cắt, vì cắt
  riêng từng box thì ảnh nào cũng lẫn xe bên cạnh.
- **`rider`**: một `person` và `two_wheeler` nó đang ngồi lên. Xem chung một ảnh cắt.
- **`mixed`**: cụm có cả cặp người – xe lẫn box cùng nhãn chồng nhau (đám xe máy, xe chở hai).

Cách gom: các cặp nối được ghép dần, **cặp chồng nhiều nhất trước**, và một đơn vị không vượt
`max_members` (6) box. Dãy xe chồng nhau liên tục dài hơn thế sẽ đứt ở chỗ chồng ít nhất; đơn vị
mang cờ `chain_cut`, box bị tách nằm trong `neighbours`. Cặp người lái – xe luôn được ghép trước
nên không bị tách.

**Người lái.** `isRider(person, vehicle)` đúng khi hai box chung ít nhất 20% box nhỏ hơn, tâm
ngang của người nằm trong bề rộng xe (nới 10%), đỉnh box người cao hơn giữa xe và đáy box người
xuống tới ít nhất 1/4 chiều cao xe. Mỗi người gắn với đúng một xe (xe chồng nhiều nhất); một xe
nhận tối đa 3 người. Người đứng cạnh xe dựng không thành cặp; người đứng chắn trước xe thì vẫn
thành cặp, nên cần mắt người xem.

Mỗi đơn vị có:

| Trường       | Nghĩa                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `region`     | Khung nhỏ nhất bao mọi box của đơn vị.                                                              |
| `crop`       | Vùng cần cắt: `region` thêm lề 15% mỗi cạnh, tối thiểu 96 px, nằm trong ảnh, số nguyên.             |
| `scale`      | Hệ số phóng để cạnh dài đạt 224 px, tối đa 4.                                                       |
| `members`    | Các box, toạ độ tính từ góc trên trái của `crop` (để vẽ khung lên ảnh cắt).                         |
| `links`      | Từng cặp nối trong đơn vị: `relation`, `iou`, `share_small`, diện tích chung.                       |
| `neighbours` | Box ngoài đơn vị nhưng phủ ≥ 20% một box trong đơn vị (kể cả khác nhãn), nên sẽ thấy trong ảnh cắt. |
| `flags`      | Xem bảng dưới.                                                                                      |
| `advice`     | Câu hướng dẫn cách xử lý, sinh từ loại đơn vị và các cờ.                                            |

| Cờ                           | Khi nào                              | Xử lý                                                       |
| ---------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| `duplicate`                  | Có cặp cùng nhãn IoU ≥ 0,8           | Kiểm tra một vật bị vẽ hai lần.                             |
| `nested`                     | Có box nằm gọn trong box cùng nhãn   | Kiểm tra box thừa, hoặc một phần vật bị vẽ thành box riêng. |
| `heavy_overlap`              | Có cặp chồng ≥ 50%                   | Vật sau bị che nhiều: box có bao đúng phần của nó không.    |
| `rider_near_identical`       | Người và xe IoU ≥ 0,55               | Một trong hai box có thể đang bao cả người lẫn xe.          |
| `vehicle_box_contains_rider` | ≥ 90% box người nằm trong box xe     | Box xe có thể đã vẽ cả người lái.                           |
| `rider_box_contains_vehicle` | ≥ 90% box xe nằm trong box người     | Box person có thể đã vẽ cả xe.                              |
| `chain_cut`                  | Dãy chồng nhau dài hơn `max_members` | Xem thêm đơn vị kế bên.                                     |
| `too_small`                  | Có box cạnh dài < 24 px              | Không xét từ ảnh cắt; xem trong ảnh gốc.                    |
| `at_image_edge`              | Có box chạm mép ảnh                  | Box chỉ cần bao phần còn thấy.                              |

Ngưỡng 0,55 của người lái lấy từ số đo trong `policy/person.json` (người lái đúng chồng lên xe ở
IoU trung vị 0,354, p95 0,549). Lề 15% và cạnh tối thiểu 24 px trùng với `policy/_verifier.json`.
Mọi ngưỡng nằm trong `LAYOUT` (`core/analysis/layout.ts`) và truyền đè được qua tham số thứ hai
của `analyzeLayout`.

## Chưa làm

- Chưa nối vào label verifier: nó vẫn cắt từng box riêng. Kết quả ở đây cho biết box nào nên bỏ
  qua hoặc xét theo cụm (`kind !== 'single'`, `too_small`).
- Chưa có API và giao diện; mới có hàm và lệnh dòng lệnh.
- Các ngưỡng gom cụm (0,2 / 0,5 / 0,9 / 6 box) là chọn ban đầu, chưa đo trên dữ liệu thật.
- Dataset video: mỗi frame được xét riêng, chưa dùng track.
