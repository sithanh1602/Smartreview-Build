# Risk Engine 3D

Trạng thái: **engine `3d-1.9.0`, policy `1.9.0`. Engine chạy lúc import project 3D và bằng lệnh `npm run risk3d`. Báo cáo được lưu cạnh `scene.json`, đọc được qua API, và viewer 3D dùng nó: danh sách "Lỗi cần kiểm tra", ghim có mã lỗi trên point cloud, vạch trên thanh frame (xem `docs/frontend-changelog.md`).**

Project 3D nặng ở point cloud: mỗi frame khoảng 2,7 MB, một segment 198 frame là 534 MB. Engine này không đọc point cloud. Nó chấm mọi cuboid của segment chỉ từ `scene.json`: cuboid, pose của xe, số điểm và độ khít đã đo sẵn lúc import. Nhờ vậy chấm cả segment mẫu mất khoảng một giây, và không ai phải tải file `.bin` nào để biết cuboid nào đáng nghi.

## Các phần

| Phần                      | Ở đâu                                     | Việc                                                                                                                |
| ------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Đếm điểm, đo độ khít      | `server/projects3d/export_waymo.py`       | Lúc xuất mỗi frame, ghi `counted`, `outside`, `slack`, `moved`, `lift` vào từng cuboid và `ghosts` vào frame        |
| Ngưỡng, điểm, loại lỗi    | `policy3d/_scene.json`                    | Dữ liệu; code không chứa con số nào (trừ các hằng đo đạc của exporter)                                              |
| Engine                    | `core/risk3d/engine.ts`                   | `analyzeScene(scene)` chấm; `calibrateScene(scene)` đo nhãn đúng để đề xuất ngưỡng. Thuần tính toán, không đọc file |
| Đối chiếu với review      | `core/risk3d/precision.ts`                | `precisionOf(report, reviews)`: mỗi quy tắc đúng bao nhiêu, engine bỏ sót bao nhiêu                                 |
| Chạy lúc import, lưu, đọc | `server/projects3d/service.ts`, `http.ts` | Ghi `risk.json`, tóm tắt vào `metadata.risk`; route `/risk`, `/risk/precision`, `/risk/rescore`                     |
| Lệnh                      | `scripts/risk3d.ts`                       | `npm run risk3d -- scene.json [--out report.json] [--calibrate]`                                                    |

Engine 2D (`core/risk`, `policy/`) không bị đụng tới: 3D có thư mục engine và thư mục policy riêng.

## Số điểm trong cuboid

Khi ghi file `.bin`, exporter đang có point cloud của frame trong bộ nhớ, nên đếm luôn số điểm nằm trong từng cuboid của frame đó và ghi vào trường `counted`.

`counted` đếm trên đúng point cloud mà viewer hiển thị (lượt trả về thứ nhất của 5 lidar, đã bù chuyển động). Trường `points` có sẵn là con số Waymo ghi trong nhãn. Nó tính cả lượt trả về thứ hai nên thường lớn hơn (`counted` trùng khít ở 18% cuboid, lệch không quá 2 điểm ở 41%). Engine dùng `counted`, và chỉ dùng `points` khi scene không có `counted` (project import trước thay đổi này).

## Độ khít

Lỗi người gán hay mắc nhất là cuboid lệch khỏi vật, to hay nhỏ hơn vật, hoặc lơ lửng hay chìm, suốt nhiều frame liền nhau. Các quy tắc so với hai frame kề không thấy lỗi này: cả track lệch đều thì không có gì để so. Vì vậy exporter đo thêm cuboid khít với điểm của vật tới đâu, trong cùng lượt đếm `counted`:

| Trường    | Nghĩa                                                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outside` | Số điểm của vật nằm trong vành 0,5 m ngay ngoài cuboid, theo hai phương ngang                                                                                                                                     |
| `slack`   | `[dọc, ngang]`, mét: khoảng trống giữa mép cuboid và điểm xa nhất của vật, đo ở mặt quay về phía xe (mặt lidar nhìn thấy). Chỉ có khi cuboid có từ 10 điểm                                                        |
| `moved`   | `[dọc, ngang, số điểm tại chỗ, số điểm ở chỗ tốt nhất]`: dời cuboid (giữ hướng, kích thước) tới đâu trong ±1 m, bước 0,25 m, thì ôm được nhiều điểm của vật nhất. Không có khi quanh đó không có điểm nào của vật |
| `lift`    | Mét: đáy cuboid cao hơn mặt đường dưới tâm nó bao nhiêu (âm là chìm). Mặt đường đo như mục "Mặt đường" dưới đây; không có khi quanh cuboid không thấy mặt đường                                                   |

"Điểm của vật" là điểm trong chiều cao của cuboid, cao hơn mặt đường 0,3 m trở lên (hay cao hơn đáy cuboid 0,3 m, chỗ nào cao hơn), và không nằm trong cuboid khác của frame (nới 0,2 m). Trước `3d-1.8.0` chỉ so với đáy cuboid, nên vỉa hè hay dốc lên cạnh cuboid, và mặt đường phủ lên một cuboid bị hạ thấp, bị tính là điểm của vật. Các con số này là hằng trong exporter (`RING_M`, `GROUND_M`, `OTHER_GROW_M`, `SEARCH_M`, `SEARCH_STEP_M` và các hằng `GROUND_*`). Chúng không nằm trong policy, vì đổi chúng thì phải xuất lại scene. Trên segment mẫu, phần đo thêm làm thời gian chuyển đổi tăng từ 14 lên khoảng 19 giây.

Đo trên từng cuboid riêng lẻ thì nhiễu: vật bên cạnh (tường sau biển báo, xe dài đỗ sát) làm chính nhãn đúng có lúc tràn gần nửa số điểm ra ngoài. Nhưng trên nhãn đúng, nhiễu đó chỉ kéo dài 2–6 frame. Vì vậy các quy tắc `fit.*` lấy **trung vị trên 5 cuboid liền nhau** của đối tượng (chỉ tính cuboid đủ điểm) và so với mức trong policy. Lỗi một frame không làm trung vị đổi; các quy tắc theo frame kề đã lo phần đó.

Một chuỗi cửa sổ liền nhau vượt mức là **một case**, đặt ở cuboid lệch nhiều nhất. Trong case:

- `evidence.frame_indexes` ghi frame đầu và frame cuối của chuỗi (chỉ tính cuboid vượt mức);
- `evidence.fit` ghi các trường trên của cuboid mang case;
- với `fit.moved` và `fit.empty_side`, lý do ghi luôn hướng nên dời.

### Mặt đường

`ground_plane` trong exporter tìm mặt đường quanh từng cuboid, trong chân cuboid nới 2,5 m, bỏ điểm của cuboid khác:

1. Lấy điểm thấp nhất của mỗi ô 0,5 m: trong một ô có mặt đường thì không gì thấp hơn nó.
2. Bắt đầu từ các ô thấp (bỏ ô cao hơn phân vị 25 quá 0,3 m: thân xe, bụi cây, tường), khớp một **mặt phẳng** có trọng số (ô sát chân cuboid nặng hơn), rồi bỏ dần ô cao hơn mặt phẳng quá 0,15 m. Độ dốc tối đa 0,15 mỗi phương, và chỉ đo theo phương nào có ô ở cả hai phía cuboid.
3. Mặt đường nhựa phẳng: các ô giữ lại phải lệch khỏi mặt phẳng trung bình không quá 0,08 m. Gồ ghề hơn là không thấy mặt đường (bụi cây, bị che), và cuboid không có `lift`.
4. **Sát mép đường**, mặt đường và vỉa hè là hai bậc, không mặt phẳng nào khớp cả hai. Khi đó tìm các bậc trong các ô cách chân cuboid tới 1,5 m, và chọn bậc mà vật đứng trên: bậc cao nhất không cao hơn điểm thấp nhất của vật (bánh xe, bàn chân), với điều kiện điểm ấy chạm bậc (cách không quá 0,3 m). Ở xa chỉ thấy phần trên của vật thì không chọn.

`lift` là đáy cuboid trừ độ cao mặt phẳng ở tâm cuboid. Mặt phẳng này cũng là mốc để bỏ điểm mặt đường khỏi "điểm của vật".

Đến `3d-1.7.0`, mặt đường là phân vị 10 độ cao của các điểm trong vành 0,5–2,5 m. Cách này hỏng ở ba chỗ:

- **Trên dốc** nó lấy phía dốc xuống. Một xe đỗ đúng trên dốc khoảng 7% bị tính là lơ lửng 0,33 m.
- **Chỉ xét điểm thấp hơn đáy cuboid 1 m.** Cuboid bị hạ quá 1 m thì không còn điểm mặt đường nào để đo.
- **Sát mép đường** phía thấp luôn thắng: người đứng trên vỉa hè cạnh lòng đường bị tính là lơ lửng.

Trên segment mẫu, trong 40 m, khi cài lỗi nâng hay hạ cả track 0,5 m và đặt ngưỡng ngay trên giá trị lớn nhất của nhãn đúng, mặt phẳng bắt được:

- **xe bị hạ:** 36/36, cách cũ bắt 23/36;
- **xe bị nâng:** 31/36, cách cũ bắt 16/36.

Script so sánh nằm ở `../verifier-test/scripts/ground_compare.py`.

**Chỗ đối tượng vắng mặt.** Đối tượng vắng 1–5 frame giữa hai lần có mặt thì exporter nội suy một cuboid ở mỗi frame vắng (`ghosts` của frame). Phép nội suy làm trong hệ toạ độ cố định, dùng pose của xe. Cuboid nội suy được đo như cuboid thật, để biết chỗ đó còn điểm của vật không.

Scene xuất trước các thay đổi này không có những trường trên, nên quy tắc cần chúng không chạy trên scene đó.

## Quy tắc

Điểm của một cuboid là tổng điểm các quy tắc bắt lỗi, tối đa 100; từ 30 điểm là một case. Mức: từ 70 là cao, từ 40 là trung bình.

| Quy tắc                 | Điểm     | Lỗi nghi ngờ   | Bắt gì                                                                                                      |
| ----------------------- | -------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| `track.type_change`     | 70       | `CLASS`        | Đối tượng mang loại khác với loại của nó ở phần lớn các frame; gợi ý loại chiếm đa số                       |
| `track.position_jump`   | 50       | `BBOX`         | Tâm lệch khỏi trung điểm của hai frame kề, theo phương ngang (mức theo loại) hoặc đứng (0,4 m)              |
| `track.position_drift`  | 30       | `BBOX`         | Tâm lệch từ 60% tới 100% mức trên, và phép dò cũng bảo dời cuboid về phía track ít nhất nửa quãng lệch      |
| `track.heading_jump`    | 40       | `BBOX`         | Hướng lệch khỏi cả hai frame kề trong khi hai frame kề cùng hướng; từ 2,6 rad là quay ngược đầu             |
| `track.size_change`     | 40       | `BBOX`         | Một cạnh khác trung bình hai frame kề trên 10%                                                              |
| `track.end_off`         | 30       | `BBOX`         | Cuboid không có frame kề ở một phía: lệch, quay hay đổi cỡ so với hai frame liền nhau ở phía kia (mức ×1,5) |
| `box.size_out_of_range` | 40       | `CLASS`        | Một cạnh nằm ngoài khoảng kích thước của loại                                                               |
| `points.empty_near`     | 40       | `EXTRA_OBJECT` | Cuboid ở gần xe (VEHICLE 30 m, loại khác 20 m) mà không có điểm nào của vật (xem dưới bảng)                 |
| `points.dropped`        | 30       | `BBOX`         | Số điểm tụt dưới 10% của hai frame kề, trong khi cả hai đều có từ 30 điểm                                   |
| `track.never_observed`  | 30       | `EXTRA_OBJECT` | Đối tượng có từ 3 frame, không frame nào có điểm, có lúc ở trong 60 m. Một case cho cả đối tượng            |
| `track.single_frame`    | 20       | `EXTRA_OBJECT` | Đối tượng chỉ có đúng một frame, không phải frame đầu hay cuối segment                                      |
| `fit.moved`             | 40       | `BBOX`         | Trung vị 5 frame: dời cuboid tới 1 m thì ôm thêm điểm của vật quá mức của loại (cần 30 điểm)                |
| `fit.empty_side`        | 40       | `BBOX`         | Trung vị 5 frame: mặt quay về phía xe trống quá mức của loại, và phép dò cũng bảo dời ra xa xe              |
| `fit.floating`          | 40       | `BBOX`         | Trung vị 5 frame: đáy cao hơn mặt đường quá 0,5 m (VEHICLE, PEDESTRIAN, CYCLIST; trong 50 m; cần 20 điểm)   |
| `fit.sunk`              | 40       | `BBOX`         | Trung vị 5 frame: đáy thấp hơn mặt đường quá 0,5 m (cùng điều kiện)                                         |
| `fit.lowered`           | 40       | `BBOX`         | Trung vị 5 frame: cuboid thấp hơn chính nó ở phần còn lại của track quá mức của loại (track từ 10 cuboid)   |
| `fit.raised`            | 40       | `BBOX`         | Như trên, nhưng cao hơn                                                                                     |
| `fit.points_outside`    | 40       | `BBOX`         | Trung vị 5 frame: tỉ lệ điểm của vật nằm ngay ngoài cuboid quá mức của loại (cần 20 điểm)                   |
| `fit.loose`             | 30       | `BBOX`         | Trung vị 5 frame: cuboid rộng hơn vật ở cả hai mặt nhìn thấy, quá mức của loại (cần 20 điểm)                |
| `pair.duplicate`        | 40       | `EXTRA_OBJECT` | Hai cuboid cùng frame chồng nhau từ 50% thể tích theo cả hai chiều: một vật gán hai lần                     |
| `points.sparse`         | cảnh báo | `OTHER`        | Cuboid có dưới 10 điểm: quá ít để engine kiểm vị trí và kích thước, reviewer phải xem ảnh camera            |

`points.empty_near` với VEHICLE, PEDESTRIAN và CYCLIST (các loại đứng trên mặt đường) chỉ đếm điểm cao hơn dải 0,3 m sát đáy cuboid, lấy từ `moved[2]`. Lý do: cuboid gán vào chỗ đường trống vẫn ôm điểm mặt đường, nên đếm mọi điểm thì nó không bao giờ rỗng. SIGN vẫn đếm mọi điểm, vì biển báo không đứng trên mặt đường; đếm kiểu mới thì 12/470 biển báo trong tầm của nhãn đúng sẽ thành rỗng.

`pair.duplicate` thay cho `pair.centre_inside` (tâm một cuboid nằm trong cuboid khác). Quy tắc cũ chỉ cảnh báo mà báo 225 lần trên nhãn đúng: 80 lần là người đứng trong xe, 144 lần là xe nhỏ trong xe lớn, đều là cảnh thật. Trên nhãn đúng, phần chồng hai chiều lớn nhất chỉ 0,25.

Mức lệch vị trí theo loại: VEHICLE 0,6 m, CYCLIST 0,5 m, PEDESTRIAN 0,4 m, SIGN 0,3 m. Mức lệch hướng: VEHICLE và SIGN 0,35 rad, CYCLIST 0,6 rad, PEDESTRIAN 1,0 rad.

Mức của các quy tắc `fit.*` có mức theo loại (CYCLIST lấy theo PEDESTRIAN vì chưa có số đo):

| Loại       | `moved_ratio` (phần điểm còn thiếu) | `empty_side_m` (mặt trống, m) | `outside_ratio` (phần điểm tràn ra) | `slack_ratio` (khoảng trống / nửa cạnh) | `level_shift_m` (hạ/nâng so với track, m) |
| ---------- | ----------------------------------- | ----------------------------- | ----------------------------------- | --------------------------------------- | ----------------------------------------- |
| VEHICLE    | 0,50                                | 0,6                           | 0,45                                | 0,32                                    | 0,30                                      |
| PEDESTRIAN | 0,40                                | 0,4                           | 0,45                                | 0,55                                    | 0,45                                      |
| CYCLIST    | 0,40                                | 0,4                           | 0,45                                | 0,55                                    | 0,45                                      |
| SIGN       | 0,10                                | 0,3                           | 0,75                                | 0,45                                    | không xét                                 |

**Cuboid bị hạ xuống hay nâng lên giữa chừng** (`fit.lowered`, `fit.raised`). Sát mép đường hay trên dốc, mặt đường có thể đo lệch vài chục cm, nhưng lệch cùng một lượng suốt track. Vì vậy hai quy tắc này so `lift` của từng cuboid với trung vị `lift` của chính track đó: phần lệch chung bị trừ đi, chỉ còn lại việc cuboid tụt xuống hay nhô lên trên chính vật của nó. Trên nhãn đúng, trung vị 5 frame lệch khỏi mức của track tới 0,19 m với VEHICLE và 0,33 m với PEDESTRIAN (người bước lên, xuống vỉa hè). Nhờ vậy bắt được một đoạn bị hạ 0,3–0,5 m, dưới mức 0,5 m của `fit.sunk`. Lỗi trên cả track thì trung vị cũng dời theo, nên hai quy tắc này không thấy; phần đó do `fit.floating` và `fit.sunk` lo.

**Quá xa mặt đường thì chắc chắn sai.** `fit.floating` và `fit.sunk` có thêm `certain_m` (1,0 m). Khi trung vị 5 frame lệch khỏi mặt đường quá mức này, nhãn đúng không thể như vậy: finding mang `certain_score` 70 điểm thay cho 40, nên case thành rủi ro cao. Finding và case cũng có `certain: true`. Viewer cắm ghim đỏ, cùng màu với lỗi reviewer đã xác nhận, thay cho ghim vàng. Reviewer chấm "Đúng" thì ghim chuyển xanh như mọi lỗi khác. Trên nhãn đúng của segment mẫu, chỉ chiếc xe chở trên xe tải (đáy cao hơn mặt đường 2,3 m) thành đỏ. Các lỗi lệch 0,5–1 m vẫn là mức trung bình.

Bốn quy tắc theo mặt đường đếm điểm bằng `counted` (cả phần sát mặt đường) thay vì điểm của vật, vì cuboid bị hạ 1 m chỉ còn một lát mỏng của vật nằm trong nó.

`fit.empty_side` bù chỗ yếu của `fit.moved` ở VEHICLE. Xe đứng sát vật lớn làm chính nhãn đúng "muốn" dời tới 47%, nên `moved_ratio` của VEHICLE phải cao. Nhưng ở nhãn đúng, chỗ nào phép dò muốn dời ra xa xe thì mặt quay về phía xe vẫn khít: trung vị 5 frame lớn nhất là 0,39 m. Cuboid bị đặt lệch ra phía trước vật thì mặt đó trống bằng đúng độ lệch (xe con lệch 1 m: 1,08 m), trong khi phần điểm thiếu chỉ khoảng 40%.

Cách các quy tắc theo track chạy:

- Vị trí và hướng được đổi sang hệ toạ độ cố định bằng pose của xe trước khi so, nên xe đang chạy không làm vật đứng yên "nhảy".
- Quy tắc so với hai frame kề chỉ chạy khi đối tượng có mặt ở cả frame liền trước và liền sau. Cuboid thiếu frame kề ở một phía (frame đầu, frame cuối, sát chỗ vắng mặt) do `track.end_off` chấm: so với vị trí ngoại suy từ hai frame liền nhau ở phía kia.
- `track.end_off` chỉ dùng hai frame kia khi chính chúng khớp với frame thứ ba, để cuboid đúng không bị đổ lỗi thay cho cuboid kề bị lệch. Nó cũng không xét vị trí khi phép dò cho thấy cuboid nằm khít trên điểm của vật (dời tốt nhất ≤ 0,25 m), như cuboid đúng ngay sau một đoạn bị lệch.
- Một cuboid lệch làm hai cuboid kề nó cũng lệch một nửa so với trung điểm của chúng. Trong ba cuboid liền nhau, chỉ cuboid lệch nhiều nhất bị gắn cờ. Cuboid đầu/cuối bị `track.end_off` bắt thì cuboid kề nó không bị các quy tắc frame kề bắt vì cùng lý do.

**Chỗ có thể thiếu cuboid.** Đối tượng vắng mặt 1–5 frame giữa hai lần có mặt được liệt kê trong `gaps` của báo cáo. Không có cuboid nào để gắn điểm, nên đây không phải case. Mỗi gap mang `points` (điểm của vật trong cuboid nội suy ở từng frame vắng). Từ 10 điểm ở một frame thì `likely_missing` là `true`: vật vẫn còn đó, gần như chắc thiếu cuboid. Ít hơn thì có thể vật chỉ bị che. Viewer đánh mã cho gap như một lỗi, và xếp gap `likely_missing` ngang với case rủi ro trung bình.

## Báo cáo

```json
{
  "schema_version": "1.0.0",
  "engine_version": "3d-1.7.0",
  "policy_version": "1.7.0",
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
    {
      "object_id": "…",
      "type": "SIGN",
      "frame_indexes": [5],
      "timestamps": [1522688015469787],
      "points": [185],
      "likely_missing": true
    }
  ]
}
```

Các con số trong ví dụ minh hoạ khuôn dạng. `id` của case là khoá mà review 3D dùng cho một cuboid (`<timestamp>:<object id>`), nên một case trỏ thẳng tới frame và cuboid cần mở. `cases` xếp điểm cao trước; `warnings` là cuboid có tín hiệu nhưng dưới 30 điểm.

Lúc import, báo cáo được ghi thành `risk.json` cạnh `scene.json` (và đẩy lên kho chung cùng nó). `metadata.risk` của project giữ tóm tắt (`engine_version`, `policy_version`, `total_cases`, `levels`, `gaps`, `warnings`), và `dataset_revisions_3d.engine_version` ghi phiên bản engine. Engine không đọc được scene thì import vẫn xong, project chỉ không có case.

| Route                                    | Ai         | Việc                                                                                                                                                                                                   |
| ---------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/projects3d/:id/risk`           | Thành viên | Báo cáo đã lưu; 404 cho project import trước khi có engine                                                                                                                                             |
| `GET /api/projects3d/:id/risk/precision` | Thành viên | `precisionOf`: với mỗi quy tắc, số case, đã review, lỗi thật (`ERROR`), báo nhầm (`CORRECT`), chưa chắc, độ chính xác; và số lỗi reviewer tìm thấy mà không case nào trỏ tới (`missed`), theo loại lỗi |
| `POST /api/projects3d/:id/risk/rescore`  | Leader     | Chấm lại `scene.json` đã lưu bằng engine hiện tại, ghi đè `risk.json`, cập nhật `metadata.risk` và `engine_version` của revision                                                                       |

Trang project 3D hiện bảng của `/risk/precision` ("Risk Engine đúng tới đâu") và nút "Chấm lại bằng engine hiện tại" cho Leader, kèm phiên bản engine của báo cáo đang lưu. Chấm lại không đo lại được độ khít: scene vẫn là scene xuất lúc import, nên quy tắc cần trường mới chỉ chạy khi import lại.

## Hiệu chỉnh ngưỡng cho dataset mới

`npm run risk3d -- scene.json --calibrate [--out calibration.json]` coi nhãn của scene là đúng. Với mỗi loại và mỗi mức của policy, lệnh in:

- giá trị lớn nhất mà nhãn đúng đạt tới, đo theo đúng cách quy tắc đo (trung vị 5 frame với `fit.*`);
- mức hiện tại;
- mức đề xuất: gấp đôi giá trị lớn nhất với các quy tắc frame kề, thêm 20% với `fit.*`, làm tròn lên 0,05;
- cờ "mức hiện tại sẽ báo nhầm" khi nhãn đúng đã chạm mức.

Lệnh không sửa policy; người viết policy đối chiếu rồi sửa `_scene.json` (xem `docs/policy-3d.md`, mục 6). Trên segment mẫu, hai cờ "sẽ báo nhầm" đúng là hai case đã biết của nhãn gốc (`fit.moved` của chiếc xe rộng hơn dài, `fit.floating` của chiếc xe nằm cao 2,3 m).

## Số đo

Một segment Waymo Open Dataset v2 (198 frame, 7.271 cuboid, 137 đối tượng), nhãn gốc coi là đúng. Script đo nằm ngoài repo (`../verifier-test/scripts/inject3d.ts`). Từ `3d-1.8.0` script đo lại cuboid bị cài lỗi bằng chính hàm `count_points` của exporter (`recount3d.py`), không còn bản viết lại bằng TypeScript. Số dưới đây là của engine `3d-1.8.0` nếu không ghi khác.

**Trên nhãn gốc:** 9 case trong 7.271 cuboid (0,12%):

- 5 `points.dropped` và 2 `points.empty_near`: vật bị che trong chốc lát.
- 1 `fit.moved`: một VEHICLE rộng 2,52 m mà chỉ dài 1,45 m, có 17–52 điểm. Xe rộng hơn dài có thể là cuboid bị quay sai trong chính nhãn gốc, nên case này để lại.
- 1 `fit.floating`: một VEHICLE cao 2,98 m có đáy cao hơn mặt đường 2,3 m suốt 44 frame, có lẽ là xe chở trên xe tải.

  1.804 cuboid chỉ có cảnh báo `points.sparse` (25% số cuboid, phần lớn là vật xa).

**Lỗi cài một frame**, mỗi loại 150 cuboid chọn ngẫu nhiên, mỗi lần một loại. Cuboid bị dời, quay hay đổi cỡ được đếm lại điểm và đo lại độ khít từ file `.bin`. Cột "trước" là engine `3d-1.0.0`.

| Lỗi cài               | Vào hàng đợi (trước → nay)     | Case thừa (trước → nay) |
| --------------------- | ------------------------------ | ----------------------- |
| Đổi loại              | 150 → 150/150                  | 0 → 0                   |
| Dời ngang 0,5 m       | 95 → 122/150 (81%)             | 0 → 0                   |
| Dời ngang 1 m         | 146 → 150/150                  | 2 → 1                   |
| Dời ngang 2 m         | 147 → 150/150                  | 3 → 0                   |
| Nâng lên 0,6 m        | 146 → 146/150                  | 0 → 0                   |
| Hạ xuống 0,6 m        | — → 144/150                    | — → 3                   |
| Quay ngược đầu        | 144 → 149/150                  | 0 → 0                   |
| Quay 30°              | 117 → 118/150 (79%)            | 0 → 0                   |
| Phóng to 1,3 lần      | 144 → 150/150                  | 9 → 1                   |
| Xoá cuboid giữa track | 150/150 trong `gaps`           | 0                       |
| Gán trùng (+0,3 m)    | — → 119/150 (`pair.duplicate`) | 0                       |

Các case thừa của `3d-1.8.0` nằm trên chính đối tượng có một frame bị cài lỗi, ở frame bên cạnh: frame lỗi kéo trung vị 5 frame của `fit.lowered` hay `fit.sunk` qua mức (2 case), hoặc biển báo bị hạ chồng vào biển báo khác (`pair.duplicate`, 2 case). Phần tăng ở lỗi dời 0,5 m là `track.position_drift`. Phần tăng ở lỗi 1–2 m, quay ngược và phóng to là cuboid ở frame đầu/cuối track, giờ do `track.end_off` chấm. Gán trùng bị sót chủ yếu ở biển báo: cuboid dày khoảng 0,1 m nên dời 0,3 m là hai cuboid không còn chồng nhau. Lỗi quay 30° còn lọt nằm dưới mức 1,0 rad của PEDESTRIAN.

**Lỗi kéo dài**: cùng một thay đổi, cố định theo hướng của vật, trên mọi cuboid của một đoạn 10 frame liền nhau (mỗi đối tượng một đoạn, 95 đoạn) hoặc của cả track (99 track có từ 10 frame đủ 20 điểm). Ô ghi số đối tượng có case trên cuboid bị cài lỗi: engine `3d-1.0.0` → `3d-1.7.0` → `3d-1.8.0`, trong ngoặc là số đối tượng có case `fit.*` ở `3d-1.8.0`. Hai cột cũ đo cuboid bị cài lỗi bằng bản TypeScript của phép đo cũ, nên chỉ so được gần đúng.

| Lỗi cài          | Đoạn 10 frame        | Cả track             |
| ---------------- | -------------------- | -------------------- |
| Dời 0,5 m        | 15 → 46 → 40/95 (24) | 30 → 72 → 71/99 (49) |
| Dời 1 m          | 38 → 84 → 88/95 (58) | 37 → 90 → 87/99 (69) |
| Quay 30°         | 0 → 13 → 13/95 (13)  | 2 → 38 → 40/99 (39)  |
| Phóng to 1,3 lần | 75 → 76 → 80/95 (18) | 19 → 46 → 45/99 (36) |
| Thu nhỏ 0,8 lần  | 53 → 63 → 67/95 (33) | 4 → 42 → 42/99 (40)  |
| Nâng 0,5 m       | — → — → 43/95 (42)   | — → — → 39/99 (34)   |
| Hạ 0,3 m         | — → — → 17/95 (17)   | — → — → 18/99 (16)   |
| Hạ 0,5 m         | — → — → 42/95 (42)   | — → — → 50/99 (48)   |
| Nâng 1 m         | — → 87 → 84/95 (40)  | — → 69 → 72/99 (51)  |
| Hạ 1 m           | — → 82 → 88/95 (42)  | — → 69 → 64/99 (51)  |

Không có case thừa ở đối tượng khác, trừ 10 case `pair.duplicate` khi nâng 0,5 m. Mười case này là một biển báo bị nâng chồng lên đúng biển báo khác ở trên nó, nên là chồng chéo thật do phép cài lỗi tạo ra.

Với `3d-1.7.0`, lỗi 0,5 m không thể bị `fit.floating`/`fit.sunk` bắt, vì mức khi đó là 0,8 m và 0,6 m. Hạ 1 m trên cả track giảm từ 69 xuống 64. Trước đây mặt đường phủ lên cuboid bị hạ được tính là điểm của vật, nên các quy tắc `fit.*` khác cũng bắt. Giờ điểm mặt đường bị loại đúng như thiết kế, nên với SIGN (không xét mặt đường) không còn gì bắt được lỗi này.

Với engine cũ, phần bắt được ở lỗi dời trên cả track gần hết là `points.empty_near` và `track.never_observed` ở vật xa, ít điểm: cuboid dời đi thì rỗng. Ở đoạn 10 frame, `track.position_drift` và `track.end_off` bắt thêm chỗ bắt đầu và kết thúc đoạn lệch.

Theo loại:

- **Nâng/hạ trên cả track:** `fit.floating` và `fit.sunk` bắt VEHICLE 39/50 và 37/50 khi lệch 1 m, 29/50 và 37/50 khi lệch 0,5 m. PEDESTRIAN hạ 0,5 m: 11/12. Trong 50 xe, 10 xe ở xa hơn 50 m suốt track và 2 xe gần như không lúc nào thấy mặt đường, nên giới hạn là khoảng 38/50. SIGN không xét, đúng như thiết kế.
- **Hạ một đoạn 10 frame:** `fit.lowered` bắt VEHICLE 14/48 khi hạ 0,3 m và 34/48 khi hạ 0,5 m (cùng với `fit.sunk`).
- **Dời 1 m trên cả track:** `fit.*` bắt SIGN 25/37, PEDESTRIAN 10/12, VEHICLE 39/50.
- **Thu nhỏ 0,8 lần:** bắt nhiều ở VEHICLE nhưng gần như không ở SIGN và PEDESTRIAN, vì vật nhỏ thì cuboid nhỏ đi vẫn ôm gần hết điểm.
- **`fit.loose`** đóng góp ít, vì mặt cuboid quay về phía xe hay bị vật khác che.

**Bộ 10 frame có cài lỗi** (`../verifier-test/scripts/make_3d_errors.py`, danh sách lỗi trong `../verifier-test/output/waymo-3d-loi/LOI-DA-CAI.md`). Script sửa `lidar_box` của 10 frame đầu segment mẫu, cài 11 lỗi, để có bản import được qua app. Engine `3d-1.8.0` bắt 10 lỗi:

- 11 case, case nào cũng nằm trên cuboid bị cài lỗi; xe tải lệch frame 2–8 có ba case: chỗ bắt đầu, giữa đoạn và chỗ kết thúc; xe dài 11,8 m bị hạ 0,6 m cả 10 frame bị `fit.sunk` bắt;
- 1 chỗ trong `gaps` với `likely_missing` (cuboid nội suy còn 185 điểm của biển báo);
- 36 cuboid ít điểm thành cảnh báo.

Lỗi còn lại cố ý để lại vì engine chưa thấy được: xe tải 9,8 m thu nhỏ 0,8 lần (vẫn ôm 81–86% điểm). Bản 10 frame không cài lỗi cho 0 case.

## Giới hạn

- **Số đo trên là trường hợp dễ.** Nhãn Waymo rất mượt (kích thước một đối tượng không đổi qua các frame, hướng lệch dưới 0,02 rad) và lỗi được cài bằng máy. Mức của các quy tắc mới đặt sát trên giá trị lớn nhất đo được ở một segment duy nhất. Chưa đo trên lỗi thật; `/risk/precision` sẽ cho số đó khi có review.
- **Quy tắc cần độ khít chỉ chạy trên scene xuất từ exporter mới.** Project import trước giữ scene cũ. "Chấm lại" dùng policy và engine mới nhưng không có trường đo mới; muốn có đủ thì phải import lại.
- **VEHICLE bắt lỗi lệch kém hơn các loại khác.** Mức `moved_ratio` 0,50 phải đặt trên các xe đứng sát vật lớn trong nhãn đúng. Cuboid lệch ra sau vật (mặt quay về phía xe vẫn khít) mà thiếu dưới 50% điểm thì vẫn lọt; xe dài thu nhỏ cũng lọt.
- **Mặt đường chỉ đo tốt ở gần và ở chỗ thấy được.** Bốn quy tắc theo mặt đường không xét quá 50 m. Chỗ không thấy mặt đường (bụi cây, bị che) thì cuboid không có `lift`: trên segment mẫu 4.902/7.271 cuboid có `lift`. Ở mép đường có bậc mà không thấy bánh xe hay bàn chân, exporter cũng bỏ qua. Xe chở trên xe khác có đáy cao hơn mặt đường thật sự.
- **`fit.lowered`/`fit.raised` chỉ thấy lỗi giữa chừng**, cần track có từ 10 cuboid đo được `lift`. Lỗi trên cả track hay trên hơn nửa track thì phải đủ 0,5 m để `fit.sunk`/`fit.floating` thấy.
- **Bộ dữ liệu gán từng frame riêng** sẽ dao động nhiều hơn Waymo và cần ngưỡng riêng; chạy `--calibrate` trên một phần nhãn đã kiểm trước khi dùng.
- **CYCLIST chưa có số đo:** segment mẫu không có loại này.
- **Viewer chưa vẽ cuboid nội suy** ở chỗ thiếu cuboid; danh sách lỗi chỉ mở frame đó.
- **Chưa kiểm bằng ảnh.** Chiếu cuboid lên ảnh camera để dùng lại label verifier 2D cần thêm component `camera_calibration`, chưa làm.
- **Import 3D qua app** đã chạy trên MySQL ở VPS và Dropbox (project `Demo3D-10`, `Demo3D-10 2`); route `/risk/precision` và `/risk/rescore` mới kiểm bằng test với pool giả.
