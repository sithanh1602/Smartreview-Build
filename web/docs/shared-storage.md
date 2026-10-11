# Lưu trữ chung cho project (Dropbox)

Cập nhật 2026-10-10. Áp dụng khi nhiều người chạy backend local nhưng dùng chung
MySQL trên VPS.

## Vấn đề

Ảnh và `dataset.json` của project từng nằm trong `storage/` của máy đã import, còn
`projects.dataset_path` lưu đường dẫn tuyệt đối của máy đó. Backend ở máy khác
thấy project trong MySQL nhưng không có file để đọc.

## Cách hoạt động

MySQL không đọc Dropbox. Backend là bên duy nhất nói chuyện với cả hai: MySQL giữ
vị trí (`storage_key`), Dropbox giữ file, token Dropbox chỉ nằm trong `web/.env`.

Khi bật Dropbox, backend **không giữ file project trên đĩa**. Mỗi file được lưu
riêng trên Dropbox và đọc thẳng từ đó.

| Thao tác    | Backend làm gì                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Import      | Nhận file vào thư mục tạm trong `storage/`, kiểm tra và phân tích, đẩy từng file lên Dropbox, rồi xóa thư mục tạm    |
| Mở project  | Tải `dataset.json` từ Dropbox vào RAM và phân tích; không ghi gì ra đĩa                                              |
| Xem ảnh     | `/api/.../assets` tải ảnh từ Dropbox. Ảnh vừa xem được giữ trong RAM (tối đa 64 MB mỗi backend), mất khi tắt backend |
| AI Check    | Tải các frame vào `storage/.tmp/<uuid>` cho model đọc, xóa khi chạy xong. Kết quả ghi vào Dropbox                    |
| Xóa project | Xóa dòng MySQL, rồi xóa thư mục `projects/<id>` trên Dropbox                                                         |

Bố cục trên Dropbox (trong App folder):

```
/projects/<project_id>/<uuid>/dataset.json
/projects/<project_id>/<uuid>/media/...        ảnh, giữ nguyên đường dẫn tương đối
/projects/<project_id>/<uuid>/annotations/...  file annotation gốc
/projects/<project_id>/<uuid>/risk/report.json
/projects/<project_id>/ai/latest.json          kết quả AI Check gần nhất
```

Đo trên Dropbox thật ngày 2026-10-10: đẩy 15 file nhỏ mất khoảng 5 giây, mở
project khoảng 0,5 giây, ảnh đầu tiên khoảng 0,5 giây, ảnh đã có trong RAM trả ngay.

## Migration 005

`server/db/migrations/005_shared_storage.sql` thêm vào `projects`:

- `storage_provider ENUM('local','dropbox')`, mặc định `local`.
- `storage_key`: đường dẫn tương đối `projects/<id>/<uuid>`, là thư mục của project
  trên Dropbox. `NULL` nghĩa là project chỉ có trên máy đã import.
- `storage_synced_at`: thời điểm đẩy lên Dropbox.

Project trên Dropbox có `dataset_path = NULL`. Migration là một câu `ALTER TABLE`
nên không chạy lại được nếu bị ngắt sau khi đã thêm cột; khi đó thêm tay dòng
tương ứng vào `schema_migrations`.

## Cấu hình

Trong `web/.env` của từng máy (không commit, không đặt tiền tố `VITE_`):

```
SMARTREVIEW_REMOTE_STORAGE=dropbox
DROPBOX_APP_KEY=...
DROPBOX_APP_SECRET=...
DROPBOX_REFRESH_TOKEN=...
```

App Dropbox dùng kiểu **App folder** và cần các quyền `files.content.write`,
`files.content.read`, `files.metadata.read`. Bật quyền xong phải cấp lại refresh
token, vì token cũ không nhận quyền mới. Bỏ `SMARTREVIEW_REMOTE_STORAGE` thì
backend lưu project trên đĩa như trước và project đó chỉ có trên máy import.

Chạy bằng Docker thì phải truyền thêm bốn biến trên vào service `web` trong
`compose.yaml`; hiện chưa khai báo.

## Chuyển project đang nằm trên đĩa

Trên máy đang giữ file của project:

```bash
npm run storage:push
```

Lệnh xử lý các project `READY` còn thư mục trong `storage/projects/<id>/<uuid>/`:
project import khi chưa bật Dropbox và project đã chia sẻ ở dạng một file `.tar`
(cách làm đầu tiên của tính năng này). Mỗi project được đẩy từng file lên Dropbox,
ghi `storage_key`, xóa file `.tar` cũ và **xóa bản trên đĩa**. Project demo không
đẩy: mỗi máy dùng `datasets/demo` của chính nó.

## Mã nguồn

- `server/storage/remote.ts`: interface `RemoteStorage` và đọc cấu hình từ env.
- `server/storage/dropbox.ts`: làm mới access token, ghi một file, đẩy nhiều file
  bằng upload session rồi commit một lượt (`finish_batch_v2`), đọc, xóa; thử lại
  khi gặp 401, 429, 5xx.
- `server/repository.ts`: `buildDataset` nhận một `AssetSource` (đĩa hoặc remote);
  dataset có `readAsset(frameId)` và cờ `remote`.
- `server/projects/service.ts`: `publish`, `load`, `remoteSource`, `share`.
- `server/ai/service.ts`: `saved` và `persist` đọc/ghi kết quả ở remote khi có.
- `tests/shared-storage.test.ts`: dùng một thư mục giả làm Dropbox.

## Giới hạn hiện tại

- Review phụ thuộc mạng: mỗi ảnh chưa có trong RAM là một lần gọi Dropbox, và
  Dropbox có thể giới hạn tốc độ khi nhiều người xem cùng lúc.
- Dropbox không phân biệt chữ hoa/thường trong tên file. Dataset có hai file chỉ
  khác nhau hoa/thường bị từ chối lúc import (422).
- Lượt AI Check đang chạy chỉ hiện trên backend đang chạy nó; backend khác thấy kết
  quả trước đó cho tới khi lượt mới kết thúc, và trễ tối đa một phút.
- Khóa xóa project và AI Check (`deleting`, `ai.active`) vẫn nằm trong RAM của từng
  backend, chưa chặn được thao tác đồng thời từ hai máy.
- Bước xóa trên Dropbox thất bại thì backend chỉ ghi log `Remote project cleanup
pending`; chưa có lệnh dọn file thừa.
- Mọi backend phải chạy cùng phiên bản code: bản cũ không đọc được project lưu theo
  từng file.
