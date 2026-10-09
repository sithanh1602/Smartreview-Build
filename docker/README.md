# Chạy SmartReview bằng Docker

Chạy lệnh từ thư mục gốc `/home/thanh/data/smartreview`. Cần Docker Engine và Compose plugin (`docker compose version`); hướng dẫn cài Ubuntu: https://docs.docker.com/engine/install/ubuntu/.

## Chạy trên máy local

```bash
node docker/setup.ts
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
```

Mở http://localhost:3100. Nếu cổng đang được ứng dụng cũ sử dụng, sửa `DOCKER_HTTP_PORT=3101` trong `.env.docker`, rồi chạy lại Compose và mở http://localhost:3101.

Script setup sinh mật khẩu riêng, không in mật khẩu và không ghi đè file đã tồn tại. Giữ `.env.docker` để dùng lại khi restart; file được bỏ qua bởi Git và Docker build. `web/.env` trên máy không được copy vào image.

MySQL chờ sẵn sàng trước khi API khởi động; API tự chạy migration. Frontend được build bởi Vite và phục vụ cùng Node API, không cần chạy Vite dev server. Container chạy bằng user `node`.

## Tài khoản

Tạo reviewer đầu tiên (terminal hỏi mật khẩu ẩn):

```bash
docker compose --env-file .env.docker exec web npm run user:create -- --username thanhdev --role reviewer
```

Hoặc đăng ký qua giao diện rồi đổi quyền:

```bash
docker compose --env-file .env.docker exec web npm run user:update -- --username thanhdev --role reviewer
```

## Dữ liệu và phạm vi

- `mysql_data` giữ tài khoản, project, review và schema.
- `project_storage` giữ ảnh upload, dataset chuẩn hóa và kết quả phân tích.
- Đây là database Docker mới, không tự chuyển tài khoản/dữ liệu từ MySQL hiện tại. Sau khi tạo tài khoản, import dataset qua giao diện.
- Image không chứa dataset local, traffic demo, backup hoặc model. App hỗ trợ khởi động không có demo.
- Import COCO/CVAT/SmartReview JSON và Risk Engine hoạt động trong bản cơ bản. AI Check cần image mở rộng có Python, Ultralytics/PyTorch và model tin cậy; bản này chưa đóng gói các thành phần đó.
- Backup cần giữ cả MySQL và storage cùng thời điểm, cùng file cấu hình bí mật; chỉ lưu image không bao gồm dữ liệu.

## Vận hành

```bash
# Xem log
docker compose --env-file .env.docker logs -f web

# Build lại sau khi sửa code
docker compose --env-file .env.docker up -d --build

# Dừng, giữ dữ liệu
docker compose --env-file .env.docker down

# Xuất image để mang sang máy cùng kiến trúc CPU
docker save -o smartreview-image.tar smartreview:local
```

Không thêm `-v` vào lệnh `down` nếu muốn giữ dữ liệu. Đổi mật khẩu trong `.env.docker` không tự đổi mật khẩu của MySQL đã có volume; phải cập nhật tài khoản MySQL đồng bộ.

Máy nhận chạy `docker load -i smartreview-image.tar`, mang theo `compose.yaml` và `docker/setup.ts`, sinh `.env.docker` riêng, rồi chạy `docker compose --env-file .env.docker up -d --no-build`. MySQL image cần có sẵn hoặc có mạng để pull. Dữ liệu cũ cần backup/restore riêng.

## HTTPS production

Compose mặc định dành cho HTTP local, bind cổng máy host tại `127.0.0.1`. Giá trị `NODE_ENV=development` chỉ cho phép cookie local HTTP; vẫn phục vụ frontend đã build.

Khi triển khai qua reverse proxy HTTPS, đặt `DOCKER_NODE_ENV=production` và `DOCKER_AUTH_COOKIE_SECURE=true` trong `.env.docker`. Proxy chuyển cả UI và `/api` tới cổng local, giữ Host/Origin thống nhất. Chỉ đổi cấu hình cookie không tự tạo HTTPS. Production app từ chối khởi động nếu chưa bật secure cookies.

## Kiểm chứng

Cần chạy build và smoke test trên Docker trước khi triển khai. Cấu hình chưa được chạy container trên máy hiện tại vì chưa có lệnh Docker.
