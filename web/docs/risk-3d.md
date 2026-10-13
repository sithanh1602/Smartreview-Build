# Risk Engine 3D

Trạng thái: **chạy lúc import project 3D và bằng lệnh `npm run risk3d`. Báo cáo được lưu cạnh `scene.json` và đọc được qua API; viewer 3D chưa dùng nó (chưa có hàng đợi case trong giao diện).**

Project 3D nặng ở point cloud: mỗi frame khoảng 2,7 MB, một segment 198 frame là 534 MB. Engine này không đọc point cloud. Nó chấm mọi cuboid của segment chỉ từ `scene.json` (cuboid, pose của xe, và số điểm đã đếm sẵn lúc import), nên chấm cả segment mẫu mất chưa tới một giây và không ai phải tải file `.bin` nào để biết cuboid nào đáng nghi.

## Các phần

| Phần                      | Ở đâu                                     | Việc                                                               |
| ------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| Đếm điểm trong cuboid     | `server/projects3d/export_waymo.py`       | Lúc xuất mỗi frame, ghi `counted` vào từng cuboid của `scene.json` |
| Ngưỡng, điểm, loại lỗi    | `policy3d/_scene.json`                    | Dữ liệu; code không chứa con số nào                                |
| Engine                    | `core/risk3d/engine.ts`                   | `analyzeScene(scene)`: thuần tính toán, không đọc file             |
| Chạy lúc import, lưu, đọc | `server/projects3d/service.ts`, `http.ts` | Ghi `risk.json`, tóm tắt vào `metadata.risk`, route `/risk`        |
| Lệnh                      | `scripts/risk3d.ts`                       | `npm run risk3d -- scene.json [--out report.json]`                 |

Engine 2D (`core/risk`, `policy/`) không bị đụng tới: 3D có thư mục engine và thư mục policy riêng.

## Số điểm trong cuboid

Exporter đang có point cloud của frame trong bộ nhớ khi ghi file `.bin`, nên đếm luôn số điểm nằm trong từng cuboid của frame đó và ghi vào trường `counted`. Trên segment mẫu việc này thêm khoảng một giây vào 12 giây chuyển đổi.

`counted` đếm trên đúng point cloud mà viewer hiển thị (lượt trả về thứ nhất của 5 lidar, đã bù chuyển động). Trường `points` có sẵn là con số Waymo ghi trong nhãn; nó tính cả lượt trả về thứ hai nên thường lớn hơn (`counted` trùng khít ở 18% cuboid, lệch không quá 2 điểm ở 41%). Engine dùng `counted`, và chỉ dùng `points` khi scene không có `counted` (project import trước thay đổi này).

## Quy tắc

Điểm của một cuboid là tổng điểm các quy tắc bắt lỗi, tối đa 100; từ 30 điểm là một case. Mức: từ 70 là cao, từ 40 là trung bình.

| Quy tắc                 | Điểm     | Lỗi nghi ngờ   | Bắt gì                                                                                           |
| ----------------------- | -------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `track.type_change`     | 70       | `CLASS`        | Đối tượng mang loại khác với loại của nó ở phần lớn các frame; gợi ý loại chiếm đa số            |
| `track.position_jump`   | 50       | `BBOX`         | Tâm lệch khỏi trung điểm của hai frame kề, theo phương ngang (mức theo loại) hoặc đứng (0,4 m)   |
| `track.heading_jump`    | 40       | `BBOX`         | Hướng lệch khỏi cả hai frame kề trong khi hai frame kề cùng hướng; từ 2,6 rad là quay ngược đầu  |
| `track.size_change`     | 40       | `BBOX`         | Một cạnh khác trung bình hai frame kề trên 10%                                                   |
| `box.size_out_of_range` | 40       | `CLASS`        | Một cạnh nằm ngoài khoảng kích thước của loại                                                    |
| `points.empty_near`     | 40       | `EXTRA_OBJECT` | Cuboid ở gần xe (VEHICLE 30 m, loại khác 20 m) mà không có điểm nào                              |
| `points.dropped`        | 30       | `BBOX`         | Số điểm tụt dưới 10% của hai frame kề, trong khi cả hai đều có từ 30 điểm                        |
| `track.never_observed`  | 30       | `EXTRA_OBJECT` | Đối tượng có từ 3 frame, không frame nào có điểm, có lúc ở trong 60 m. Một case cho cả đối tượng |
| `track.single_frame`    | 20       | `EXTRA_OBJECT` | Đối tượng chỉ có đúng một frame, không phải frame đầu hay cuối segment                           |
| `pair.centre_inside`    | cảnh báo | `EXTRA_OBJECT` | Tâm nằm trong một cuboid khác cùng frame                                                         |

Mức lệch vị trí theo loại: VEHICLE 0,6 m, CYCLIST 0,5 m, PEDESTRIAN 0,4 m, SIGN 0,3 m. Mức lệch hướng: VEHICLE và SIGN 0,35 rad, CYCLIST 0,6 rad, PEDESTRIAN 1,0 rad.

Ba điều về cách các quy tắc theo track chạy:

- Vị trí và hướng được đổi sang hệ toạ độ cố định bằng pose của xe trước khi so, nên xe đang chạy không làm vật đứng yên "nhảy".
- Quy tắc so với hai frame kề chỉ chạy khi đối tượng có mặt ở cả frame liền trước và liền sau. Cuboid ở frame đầu và frame cuối của một đối tượng không được các quy tắc đó chấm.
- Một cuboid lệch làm hai cuboid kề nó cũng lệch một nửa so với trung điểm của chúng. Trong ba cuboid liền nhau, chỉ cuboid lệch nhiều nhất bị gắn cờ.

**Chỗ có thể thiếu cuboid.** Đối tượng vắng mặt 1–5 frame giữa hai lần có mặt được liệt kê trong `gaps` của báo cáo. Không có cuboid nào để gắn điểm, nên đây không phải case.

## Báo cáo

```json
{
  "schema_version": "1.0.0",
  "engine_version": "3d-1.0.0",
  "policy_version": "1.0.0",
  "segment": "10203656353524179475_7625_000_7645_000",
  "min_score": 30,
  "total_frames": 198,
  "total_boxes": 7271,
  "checks": { "track.position_jump": { "flagged": 0 } },
  "levels": { "high": 0, "medium": 1, "low": 5 },
  "cases": [
    {
      "id": "1522688014970187:-KpKb_7UDmsdQCf8FS3g9w",
      "timestamp": 1522688014970187,
      "frame_index": 12,
      "object_id": "-KpKb_7UDmsdQCf8FS3g9w",
      "type": "VEHICLE",
      "score": 50,
      "severity": "medium",
      "suspected_error": "BBOX",
      "reasons": ["Tâm cuboid lệch 1.02 m khỏi trung điểm của hai frame kề."],
      "findings": [
        {
          "check_id": "track.position_jump",
          "score": 50,
          "error_type": "BBOX",
          "reason": "…",
          "evidence": {}
        }
      ]
    }
  ],
  "warnings": [],
  "gaps": [
    { "object_id": "…", "type": "VEHICLE", "frame_indexes": [40], "timestamps": [1522688017769403] }
  ]
}
```

Các con số trong ví dụ minh hoạ khuôn dạng. `id` của case là khoá mà review 3D đang dùng cho một cuboid (`<timestamp>:<object id>`), nên một case trỏ thẳng tới frame và cuboid cần mở. `cases` xếp điểm cao trước; `warnings` là cuboid có tín hiệu nhưng dưới 30 điểm.

Lúc import, báo cáo được ghi thành `risk.json` cạnh `scene.json` (và đẩy lên kho chung cùng nó), `metadata.risk` của project giữ tóm tắt (`engine_version`, `policy_version`, `total_cases`, `levels`, `gaps`), và `dataset_revisions_3d.engine_version` ghi `3d-1.0.0` thay cho `none`. `GET /api/projects3d/:id/risk` trả báo cáo cho thành viên của project; project import trước khi có engine trả 404. Engine không đọc được scene thì import vẫn xong, project chỉ không có case.

## Số đo

Một segment Waymo Open Dataset v2 (198 frame, 7.271 cuboid, 137 đối tượng), nhãn gốc coi là đúng. Script đo nằm ngoài repo (`../verifier-test/scripts/inject3d.ts`).

**Trên nhãn gốc:** 6 case trong 7.271 cuboid (0,08%): 5 `points.dropped` và 1 `points.empty_near`, đều là vật bị che trong chốc lát. 226 cuboid chỉ có cảnh báo, gần hết là `pair.centre_inside`. Thời gian chấm dưới 1 giây.

**Lỗi cài bằng máy**, mỗi loại 150 cuboid chọn ngẫu nhiên, mỗi lần một loại; cuboid bị dời, quay hay đổi cỡ được đếm lại điểm từ file `.bin`:

| Lỗi cài               | Vào hàng đợi         | Riêng cuboid ở giữa track | Case thừa |
| --------------------- | -------------------- | ------------------------- | --------- |
| Đổi loại              | 150/150 (100%)       | 144/144                   | 0         |
| Dời ngang 0,5 m       | 95/150 (63%)         | 95/145 (66%)              | 0         |
| Dời ngang 1 m         | 146/150 (97%)        | 146/146                   | 2         |
| Dời ngang 2 m         | 147/150 (98%)        | 147/147                   | 3         |
| Nâng lên 0,6 m        | 146/150 (97%)        | 146/146                   | 0         |
| Quay ngược đầu        | 144/150 (96%)        | 144/144                   | 0         |
| Quay 30°              | 117/150 (78%)        | 117/143 (82%)             | 0         |
| Phóng to 1,3 lần      | 144/150 (96%)        | 141/141                   | 9         |
| Xoá cuboid giữa track | 150/150 trong `gaps` | —                         | 0         |

Lỗi không bắt được là cuboid ở frame đầu hoặc cuối của đối tượng, lỗi dời 0,5 m nằm dưới mức 0,6 m của VEHICLE, và lỗi quay 30° nằm dưới mức 1,0 rad của PEDESTRIAN.

## Giới hạn

- **Số đo trên là trường hợp dễ.** Nhãn Waymo rất mượt (kích thước một đối tượng không đổi qua các frame, hướng lệch dưới 0,02 rad) và lỗi được cài từng frame một bằng máy. Lỗi thật của người gán thường kéo dài nhiều frame liền nhau: một cuboid lệch đều suốt cả track không làm quy tắc nào nổ. Chưa đo trên lỗi thật.
- **Bộ dữ liệu gán từng frame riêng** sẽ dao động nhiều hơn Waymo và cần ngưỡng riêng; dùng ngưỡng hiện tại sẽ báo nhầm nhiều.
- **CYCLIST chưa có số đo:** segment mẫu không có loại này.
- **Chưa có quy tắc về mặt đường** (cuboid lơ lửng hay chìm): đường dốc làm đáy cuboid trong hệ toạ độ xe thay đổi từ −1,8 m tới 3,2 m ngay trong nhãn đúng.
- **Chưa có giao diện.** Viewer chưa có hàng đợi case, chưa mở thẳng frame của case; báo cáo mới đọc được qua API và lệnh.
- **Chưa kiểm bằng ảnh.** Chiếu cuboid lên ảnh camera để dùng lại label verifier 2D cần thêm component `camera_calibration`, chưa làm.
- **Import 3D chưa chạy trên MySQL và Dropbox thật** (xem `docs/projects-3d.md`); phần engine nối vào import mới được kiểm bằng test với pool giả và exporter giả, còn exporter thật và engine được chạy trực tiếp trên segment mẫu.
