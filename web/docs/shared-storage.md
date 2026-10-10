# Lưu trữ chung cho project (Dropbox)

Ghi ngày 2026-10-10. Áp dụng khi nhiều người chạy backend local nhưng dùng chung
MySQL trên VPS.

## Vấn đề

Ảnh và `dataset.json` của project nằm trong `storage/` của máy đã import, còn
`projects.dataset_path` lưu đường dẫn tuyệt đối của máy đó. Backend ở máy khác
thấy project trong MySQL nhưng không có file để đọc.

## Cách hoạt động

MySQL không đọc Dropbox. Backend là bên duy nhất nói chuyện với cả hai: MySQL giữ
vị trí (`storage_key`), Dropbox giữ file, token Dropbox chỉ nằm trong `web/.env`.

| Thao tác    | Backend làm gì                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Import      | Xử lý trên đĩa như cũ, nén thư mục thành tar, đẩy lên Dropbox, rồi mới ghi `storage_key` và chuyển `READY`           |
| Mở project  | Nếu `storage/<storage_key>/dataset.json` chưa có: tải tar, giải nén vào `storage/`. Các lần sau đọc thẳng từ đĩa     |
| Xem ảnh     | Không đổi, `/api/.../assets` đọc từ đĩa local                                                                        |
| AI Check    | Kết quả cuối (`READY`/`FAILED`) của `ai/latest.json` được đẩy lên; máy khác lấy bản mới hơn, tối đa mỗi phút một lần |
| Xóa project | Xóa dòng MySQL và thư mục local, rồi xóa thư mục `projects/<id>` trên Dropbox                                        |

Bố cục trên Dropbox (trong App folder):

```
/projects/<project_id>/<uuid>.tar      dataset.json + media/ + risk/
/projects/<project_id>/ai/latest.json  kết quả AI Check gần nhất
```

## Migration 005

`server/db/migrations/005_shared_storage.sql` thêm vào `projects`:

- `storage_provider ENUM('local','dropbox')`, mặc định `local`.
- `storage_key`: đường dẫn tương đối `projects/<id>/<uuid>`, dùng cho cả thư mục
  local lẫn file tar trên Dropbox. `NULL` nghĩa là project chỉ có trên máy đã import.
- `storage_synced_at`: thời điểm đẩy lên Dropbox.

`dataset_path` vẫn được ghi để backend chưa cập nhật code tiếp tục chạy được trên
máy đã import. Migration là một câu `ALTER TABLE` nên không chạy lại được nếu bị
ngắt sau khi đã thêm cột; khi đó thêm tay dòng tương ứng vào `schema_migrations`.

Backend mới cần các cột này cho mọi lần import, kể cả khi không bật Dropbox, nên
phải chạy `npm run db:migrate` trước khi khởi động.

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
backend chạy như trước, project import ra chỉ có trên máy đó.

Chạy bằng Docker thì phải truyền thêm bốn biến trên vào service `web` trong
`compose.yaml`; hiện chưa khai báo.

## Project đã import trước đó

Trên máy đang giữ file của project:

```bash
npm run storage:push
```

Lệnh đẩy các project `READY` chưa có `storage_key` và có file dưới
`storage/projects/<id>/<uuid>/` lên Dropbox rồi ghi `storage_key`. Project demo
không đẩy: mỗi máy dùng `datasets/demo` của chính nó.

## Mã nguồn

- `server/storage/remote.ts`: interface `RemoteStorage` và đọc cấu hình từ env.
- `server/storage/dropbox.ts`: làm mới access token, upload theo phiên (chunk 8 MB),
  download, xóa; thử lại khi gặp 401, 429, 5xx.
- `server/storage/archive.ts`: gọi lệnh `tar` của hệ thống.
- `server/projects/service.ts`: `push`, `pull`, `datasetFile`, `share`.
- `server/ai/service.ts`: `persist` đẩy kết quả, `refresh` lấy kết quả mới hơn.
- `tests/shared-storage.test.ts`: dùng một thư mục giả làm Dropbox.

## Giới hạn hiện tại

- Khóa xóa project và AI Check (`deleting`, `ai.active`) vẫn nằm trong RAM của từng
  backend, chưa chặn được thao tác đồng thời từ hai máy.
- Project bị xóa ở máy khác để lại thư mục cache trong `storage/` của máy này.
- Chưa có lệnh dọn file thừa trên Dropbox khi bước xóa từ xa thất bại; backend chỉ
  ghi log `Remote project cleanup pending`.
- Lần đầu mở project ở mỗi máy phải tải cả file tar.
