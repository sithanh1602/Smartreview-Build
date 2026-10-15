# Đăng nhập và phân quyền

Chạy migration trước khi khởi động phiên bản này: `npm run db:migrate` (trong `web`). Migration 004 bổ sung users, auth_sessions và auth_login_limits; không xóa dữ liệu dự án.

## Tạo tài khoản

Chạy trong terminal tương tác, mật khẩu được nhập ẩn và xác nhận lại (12–128 ký tự):

```bash
npm run user:create -- --username thanh-lead --role leader
npm run user:create -- --username thanh-anno --role member
```

Người dùng có thể tự đăng ký tại `/register` (liên kết từ trang đăng nhập). Nhập tên đăng nhập, mật khẩu và xác nhận mật khẩu; đăng ký thành công chuyển về `/login`. Khi đăng ký, người dùng chọn loại tài khoản `member` (mặc định) hoặc `leader`. Chọn `leader` phải nhập **mã Leader** (biến `LEADER_SIGNUP_CODE` trong `.env` của backend); chưa đặt biến này thì chỉ tạo leader được bằng CLI. Không có tài khoản/mật khẩu mặc định. Tên đăng nhập 3–64 ký tự chữ, số, `_`, `.` và `-`, không phân biệt hoa thường.

```bash
npm run user:update -- --username thanh-review --reset-password
npm run user:update -- --username thanh-anno --role leader
npm run user:update -- --username thanh-anno --disable
npm run user:update -- --username thanh-anno --enable
```

Mỗi lần cập nhật thu hồi toàn bộ phiên của tài khoản đó. Mật khẩu lưu bằng scrypt có salt riêng. CLI cần quyền truy cập DB của ứng dụng.

## Quyền truy cập

Từ migration 006, quyền gắn với từng project. Chi tiết về vai trò, mã mời và API: [project-roles.md](project-roles.md).

| Loại tài khoản | Trang sau đăng nhập                            | Được phép                                                             |
| -------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| leader         | /projects                                      | Tạo và quản lý project của mình, mã mời, thành viên, import, AI Check |
| member         | /role (chọn Reviewer/Annotator), rồi /projects | Xem và sửa trong các project đã tham gia bằng mã mời                  |
| Chưa đăng nhập | /login                                         | POST /api/auth/register, POST /api/auth/login, GET /api/health        |

Backend kiểm tra vai trò trong project trước khi đọc dữ liệu hoặc xử lý tác vụ. Thiếu/không hợp lệ/hết hạn access token nhận 401; member gọi chức năng của leader nhận 403; project mình không thuộc về nhận 404.

## Phiên đăng nhập

Từ migration 009 (2026-10-15), mỗi lần đăng nhập tạo **một** access token ngẫu nhiên sống **60 phút tính từ lúc đăng nhập**, không có refresh token và không gia hạn. Hết 60 phút, frontend tự đăng xuất và chuyển về `/login`. Mọi API trả 401 thì cũng đăng xuất ngay. Migration 009 xóa toàn bộ phiên cũ, nên mọi người phải đăng nhập lại một lần.

Token nằm trong cookie duy nhất `access_token` (HttpOnly, SameSite=Strict, Path=/api, Max-Age=3600, Secure khi bật `AUTH_COOKIE_SECURE`). Đây là thứ duy nhất của phiên mà tab Application trong F12 hiển thị. HttpOnly chặn JavaScript đọc cookie nhưng không giấu nó khỏi DevTools. Các phản hồi đăng nhập và đăng xuất xóa luôn cookie `sr_access` và `sr_refresh` của phiên bản cũ. Không lưu token vào localStorage/sessionStorage hay trả token trong JSON. DB chỉ lưu SHA-256 của token, và vai trò luôn đọc từ bảng `users`, nên sửa giá trị cookie chỉ nhận 401.

API phiên: GET /api/auth/me trả `{ user, expiresAt }`; POST /api/auth/login (username, password) trả `{ user, expiresAt }`; POST /api/auth/logout. `/api/auth/refresh` đã bỏ (404). Các POST dùng JSON. Chặn Origin khác host và yêu cầu cross-site; các API ghi reviewer cũng kiểm tra Origin. Giới hạn đăng nhập: 10 lần/tài khoản, 100 lần/IP trong 15 phút; đăng nhập thành công xóa bộ đếm tài khoản, không xóa bộ đếm IP. Mỗi tiến trình xử lý tối đa hai phép kiểm tra mật khẩu đồng thời. Đăng xuất đồng bộ thông báo sang các tab cùng origin.

## Triển khai

Local HTTP giữ AUTH_COOKIE_SECURE chưa đặt/false. Production phải phục vụ HTTPS, đặt `NODE_ENV=production` và `AUTH_COOKIE_SECURE=true`. Reverse proxy giữ Host/Origin thống nhất và chuyển /api vào backend (backend nghe loopback). Không bật CORS cho origin tùy ý. Khi qua reverse proxy, bộ đếm IP hiện dùng IP socket của proxy nên dùng thêm giới hạn tại proxy phù hợp số người dùng.

Chạy `npm test` và `npm run test:ui` trên database test riêng. Các tài khoản browser test có mật khẩu ngẫu nhiên, bị xóa sau khi chạy; không dùng chúng cho ứng dụng thật.

## API đăng ký

`POST /api/auth/register` nhận JSON `{ username, password, role?, leaderCode?, website? }` (`role` là `leader` hoặc `member`, mặc định `member`), trả 201 với thông tin tài khoản, không tạo phiên đăng nhập. `role: leader` mà thiếu `leaderCode` hoặc sai mã (so khớp bằng SHA-256 và timingSafeEqual) thì trả 403. `website` là trường bẫy bot, bị ẩn khỏi người dùng: có giá trị thì API vẫn trả 201 nhưng không tạo tài khoản. Tên trùng (không phân biệt hoa thường) trả 409; dữ liệu không hợp lệ, `role` khác hai giá trị trên hoặc trường lạ trả 400. Mật khẩu 12–128 ký tự được lưu bằng scrypt. API kiểm tra cùng origin và giới hạn 10 lần/tài khoản, 10 lần/IP trong 15 phút (bộ đếm riêng với đăng nhập), trả 429 khi vượt giới hạn. Đăng ký và đăng nhập dùng chung giới hạn tối đa hai phép xử lý mật khẩu đồng thời.
