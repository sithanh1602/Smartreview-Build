# Đăng nhập và phân quyền

Chạy migration trước khi khởi động phiên bản này: `npm run db:migrate` (trong `web`). Migration 004 bổ sung users, auth_sessions và auth_login_limits; không xóa dữ liệu dự án.

## Tạo tài khoản

Chạy trong terminal tương tác, mật khẩu được nhập ẩn và xác nhận lại (12–128 ký tự):

```bash
npm run user:create -- --username thanh-review --role reviewer
npm run user:create -- --username thanh-anno --role annotator
```

Người dùng có thể tự đăng ký tại `/register` (liên kết từ trang đăng nhập). Nhập tên đăng nhập, mật khẩu và xác nhận mật khẩu; đăng ký thành công chuyển về `/login`. Tài khoản tự đăng ký luôn có quyền `annotator`; người quản lý cấp quyền `reviewer` bằng CLI. Không có tài khoản/mật khẩu mặc định hoặc đăng ký tự chọn quyền. Tên đăng nhập 3–64 ký tự chữ, số, `_`, `.` và `-`, không phân biệt hoa thường.

```bash
npm run user:update -- --username thanh-review --reset-password
npm run user:update -- --username thanh-anno --role reviewer
npm run user:update -- --username thanh-anno --disable
npm run user:update -- --username thanh-anno --enable
```

Mỗi lần cập nhật thu hồi toàn bộ phiên của tài khoản đó. Mật khẩu lưu bằng scrypt có salt riêng. CLI cần quyền truy cập DB của ứng dụng.

## Quyền truy cập

| Vai trò        | Trang sau đăng nhập | API được phép                                                                                                    |
| -------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| reviewer       | /projects           | Các chức năng review hiện có: projects, import, xóa, ảnh, annotations, quyết định review, frame review, AI check |
| annotator      | /annotation         | /api/annotator/home và API phiên cá nhân                                                                         |
| Chưa đăng nhập | /login              | POST /api/auth/register, POST /api/auth/login, GET /api/health                                                   |

Trang annotation hiện là trang chờ để phát triển tiếp. Backend kiểm tra quyền trước khi đọc dữ liệu hoặc xử lý tác vụ; annotator gọi API reviewer nhận 403. Thiếu/không hợp lệ/hết hạn access token nhận 401. Quyền reviewer hiện áp dụng cho toàn bộ dự án; chưa có phân công quyền theo từng dự án.

## Phiên đăng nhập

Access token ngẫu nhiên sống 15 phút; refresh token sống tối đa 7 ngày tính từ lúc đăng nhập. Cả hai nằm trong cookie phiên HttpOnly, SameSite=Strict; access có Path=/api, refresh có Path=/api/auth. Không lưu token vào localStorage/sessionStorage hoặc trả token trong JSON. DB chỉ lưu SHA-256 của token.

Frontend tự gia hạn khi gặp 401, phối hợp giữa các tab qua Web Locks nếu trình duyệt hỗ trợ. Refresh thay cả hai token; token cũ mất hiệu lực. Hết thời hạn refresh phải đăng nhập lại. Cookie không có thời hạn lưu bền, tuy nhiên trình duyệt có chức năng khôi phục phiên có thể giữ cookie khi mở lại; dùng Đăng xuất để thu hồi phiên chắc chắn. Đăng xuất đồng bộ thông báo sang các tab cùng origin.

API phiên: GET /api/auth/me; POST /api/auth/login (username, password); POST /api/auth/refresh; POST /api/auth/logout. Các POST dùng JSON. Chặn Origin khác host và yêu cầu cross-site; các API ghi reviewer cũng kiểm tra Origin. Giới hạn đăng nhập: 10 lần/tài khoản, 100 lần/IP trong 15 phút; đăng nhập thành công xóa bộ đếm tài khoản, không xóa bộ đếm IP. Mỗi tiến trình xử lý tối đa hai phép kiểm tra mật khẩu đồng thời.

## Triển khai

Local HTTP giữ AUTH_COOKIE_SECURE chưa đặt/false. Production phải phục vụ HTTPS, đặt `NODE_ENV=production` và `AUTH_COOKIE_SECURE=true`. Reverse proxy giữ Host/Origin thống nhất và chuyển /api vào backend (backend nghe loopback). Không bật CORS cho origin tùy ý. Khi qua reverse proxy, bộ đếm IP hiện dùng IP socket của proxy nên dùng thêm giới hạn tại proxy phù hợp số người dùng.

Chạy `npm test` và `npm run test:ui` trên database test riêng. Các tài khoản browser test có mật khẩu ngẫu nhiên, bị xóa sau khi chạy; không dùng chúng cho ứng dụng thật.

## API đăng ký

`POST /api/auth/register` nhận JSON `{ username, password }`, trả 201 với thông tin tài khoản, không tạo phiên đăng nhập. Tên trùng (không phân biệt hoa thường) trả 409; dữ liệu không hợp lệ hoặc thêm trường quyền trả 400. Mật khẩu 12–128 ký tự được lưu bằng scrypt. API kiểm tra cùng origin và giới hạn 10 lần/tài khoản, 10 lần/IP trong 15 phút (bộ đếm riêng với đăng nhập), trả 429 khi vượt giới hạn. Đăng ký và đăng nhập dùng chung giới hạn tối đa hai phép xử lý mật khẩu đồng thời. Không cần migration bổ sung.
