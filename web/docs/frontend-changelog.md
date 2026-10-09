# Lịch sử thay đổi frontend

Ghi lại mỗi lần sửa xong một chức năng hoặc thay đổi lớn ở frontend. Mục mới nhất ở trên cùng.

## 2026-10-09 · Đăng nhập, Đăng ký: nền xám kiểu Discord, form nằm trong khung

- Nền trang và form dùng bảng xám của giao diện tối mặc định Discord: nền trang `#1e1f22`, khung `#313338`, ô nhập `#1e1f22`, viền khung `#3f4147`. Các màu này đè lên token tối của HeroUI trong `AuthSurface` (`discordGray`).
- Form được bao trong một khung bo góc có viền mảnh và bóng đổ, rộng `max-w-md`, căn giữa. Logo, tiêu đề và liên kết chuyển trang nằm trong khung.
- Bỏ việc đổi sáng/tối theo hệ điều hành: hai trang này và màn hình chờ kiểm tra phiên luôn dùng nền xám tối. Các trang sau đăng nhập vẫn là giao diện sáng.
- Sửa chữ trong thông báo lỗi bị chìm trên nền tối (`--color-muted` của app là màu cố định cho nền sáng).
- Kiểm tra: `npm run build`, chụp màn hình Chromium ở 1440px và 390px. Chưa chạy `npm test` và `npm run test:ui`.

## 2026-10-09 · Đăng nhập, Đăng ký: giao diện tối giản, có chế độ tối

Lấy ý tưởng từ trang đăng nhập của PortSwigger: một cột hẹp căn giữa trên nền trơn.

- Bỏ ảnh nền, bbox, thanh trên và thẻ trắng. Trang chỉ còn logo, tiêu đề, ô nhập, nút và một dòng liên kết chuyển trang, tất cả căn giữa trong cột `max-w-sm`.
- Chế độ tối theo hệ điều hành (`prefers-color-scheme`): `AuthSurface` đặt `data-theme="dark"` hoặc `"light"` để dùng bộ token tương ứng của HeroUI, đổi ngay khi hệ thống đổi. Nền tối là gần đen, nền sáng là xám rất nhạt thay cho trắng. Chưa có nút bật/tắt thủ công và không tự đổi theo giờ.
- Chế độ tối chỉ áp dụng cho hai trang này và màn hình chờ kiểm tra phiên; các trang sau đăng nhập vẫn chỉ có giao diện sáng.
- Xóa `public/auth-frame.jpg` và `src/features/auth/authFrame.js` (ảnh dataset không còn nằm trong repo).
- Kiểm tra: `npm run build`, chụp màn hình Chromium ở chế độ tối (1440px) và sáng (390px). Chưa chạy `npm test` và `npm run test:ui`.

## 2026-10-09 · Đăng nhập, Đăng ký: bố cục một cửa sổ, nền là ảnh đã gán nhãn

Lấy ý tưởng từ account.hoyoverse.com: ảnh nền phủ kín, thanh trên có logo và nút tài khoản, form nổi ở giữa.

- Trang cao đúng một cửa sổ (`h-dvh`, không cuộn trang). Nếu cửa sổ quá thấp thì chỉ thẻ form cuộn bên trong.
- Thanh trên: logo bên trái, hai nút "Đăng nhập" / "Đăng ký" bên phải (là `NavLink` tới `/login` và `/register`, nút của trang hiện tại tô màu nhấn). Bỏ liên kết chuyển trang ở chân thẻ và logo trong thẻ vì đã có trên thanh.
- Nền: `public/auth-frame.jpg` (1280×720) là một khung hình lấy từ dự án đã import trong `storage/`, kèm 20 nhãn của chính khung hình đó trong `src/features/auth/authFrame.js`. Ảnh và bbox vẽ chung trong một SVG `preserveAspectRatio="xMidYMid slice"` nên bbox luôn khớp ảnh ở mọi kích thước cửa sổ. Nhãn có độ tin cậy dưới 0.5 tô màu hổ phách, còn lại màu teal; khung quá nhỏ hoặc trùng vị trí không in chữ.
- Thành phần `Backdrop` cũ (lưới chấm và bbox vẽ tay) bị thay hoàn toàn.
- Lưu ý: `storage/` nằm trong `.gitignore`, còn `public/auth-frame.jpg` sẽ vào repo và hiển thị cho cả người chưa đăng nhập. Nếu ảnh dataset không được phép công khai thì cần đổi ảnh khác.
- Kiểm tra: `npm run build`, chụp màn hình Chromium ở 1440px và 390px. Chưa chạy `npm test` và `npm run test:ui`.

## 2026-10-09 · Đăng nhập, Đăng ký: nền mới có khung bbox trang trí

- Thay gradient teal bằng nền xanh đậm phẳng (`#06312d`) phủ lưới chấm 24px.
- Thêm thành phần `Backdrop` trong `AuthLayout.jsx`: năm khung bbox trang trí quanh thẻ (ba khung "khớp" màu teal có nhãn và điểm tin cậy, một khung "nghi ngờ" màu hổ phách, một khung nét đứt), có tay nắm ở bốn góc. Toàn bộ là `aria-hidden` và chỉ hiện từ `lg` trở lên; mobile chỉ còn lưới chấm.
- `AuthLoading` đổi sang cùng màu nền.
- Kiểm tra: `npm run build`, chụp màn hình Chromium ở 1440px và 390px. Chưa chạy `npm test` và `npm run test:ui`.

## 2026-10-09 · Đăng nhập, Đăng ký: lược chữ, nền phẳng

- Bỏ các dòng mô tả: phụ đề dưới tiêu đề, gợi ý dưới ô nhập ở trang Đăng ký, dòng "Quên mật khẩu?…", dòng chữ dưới thẻ và phần mô tả trong thông báo "Đã tạo tài khoản". Thẻ chỉ còn logo, tiêu đề, ô nhập, nút và liên kết chuyển trang. Quy tắc tên đăng nhập và mật khẩu vẫn hiện khi nhập sai.
- Thông báo khi backend chưa có endpoint đăng ký rút còn "Máy chủ chưa mở chức năng đăng ký."
- Nền: bỏ hai quầng sáng mờ và lớp lưới, thay bằng gradient teal phẳng (`#0a8f82` → `#065f57`); bóng thẻ giảm từ `shadow-2xl` xuống `shadow-xl`. `AuthLoading` dùng nền `#087f73`.
- Kiểm tra: `npm run build`, chụp màn hình Chromium. Chưa chạy `npm test` và `npm run test:ui`.

## 2026-10-09 · Đăng nhập, Đăng ký: thẻ căn giữa trên nền xanh

- `AuthLayout` bỏ bố cục hai cột và hình minh họa khung bbox. Thay bằng nền xanh đậm phủ toàn trang (gradient và lưới của bảng thương hiệu cũ) với một thẻ trắng căn giữa cả hai chiều.
- Hai trang dùng chung một khung: cùng chiều rộng (`max-w-md`), bo góc, padding và thứ tự logo → tiêu đề → mô tả → form → liên kết chuyển trang. Chiều cao thẻ theo nội dung nên thẻ Đăng ký cao hơn thẻ Đăng nhập.
- Ô nhập chuyển sang `variant="secondary"` (nền xám nhạt) để nổi trên thẻ trắng.
- Màn hình chờ kiểm tra phiên (`AuthLoading`) cũng dùng nền xanh để không nháy trắng trước khi vào trang.
- Kiểm tra: `npm run build`, chụp màn hình Chromium ở 1440px và 390px. Chưa chạy `npm test` và `npm run test:ui`.

## 2026-10-09 · Đăng nhập, Đăng ký và logo theo HeroUI v3

### Phân tích HeroUI (heroui.com)

- Phiên bản dùng: `@heroui/react` và `@heroui/styles` 3.2.6. Yêu cầu React ≥ 19 và Tailwind CSS v4 — khớp với dự án (React 19.2, Tailwind 4.1), không cần provider hay plugin Tailwind.
- Nền tảng: React Aria Components lo hành vi và accessibility (focus, bàn phím, validation gốc của form); phần giao diện là CSS thuần theo BEM (`.button`, `.button--primary`, `.input-group__input`…) nằm trong `@layer components`.
- Component dạng ghép (compound): `Alert.Indicator`, `Alert.Content`, `InputGroup.Input`, `InputGroup.Suffix`, `Card.Header`…
- Token là biến CSS oklch, đổi theme bằng cách ghi đè biến: `--accent`, `--background`, `--surface`, `--muted`, `--border`, `--danger`, `--field-background`, `--radius` (0.5rem, các cỡ bo góc suy ra từ đây), `--field-radius`. Dark mode bật bằng class `.dark` hoặc `data-theme="dark"`.
- Ngôn ngữ thị giác: nền xám rất nhạt, bề mặt trắng, ô nhập không viền mà dùng bóng nhẹ, nút bo tròn dạng viên thuốc, vòng focus theo màu nhấn, trạng thái lỗi tô đỏ cả nhãn lẫn ô nhập.

### Đã làm

- Cài HeroUI và import `@heroui/styles` trong `src/styles.css`; đặt `--accent: #087f73` để component HeroUI dùng đúng màu thương hiệu.
- Logo SmartReview: khung bbox bốn góc bao dấu tích trên nền teal. `src/components/Logo.jsx` (`LogoMark`, `Logo`) và `public/favicon.svg`, gắn favicon trong `index.html`.
- `src/features/auth/AuthLayout.jsx`: bố cục hai cột (form bên trái, bảng thương hiệu bên phải, ẩn dưới `lg`), `AuthLoading`, `PasswordField` có nút hiện/ẩn mật khẩu.
- `src/pages/LoginPage.jsx`: viết lại bằng `Form`, `TextField`, `InputGroup`, `Button`, `Alert`. Giữ nguyên nhãn "Tên đăng nhập", "Mật khẩu" và nút "Đăng nhập" để test Playwright hiện có vẫn tìm được.
- `src/pages/RegisterPage.jsx` và route `/register`: tên đăng nhập, mật khẩu, xác nhận mật khẩu. Kiểm tra phía client theo quy tắc trong `docs/auth.md` (tên 3–64 ký tự chữ/số/`_`/`.`/`-`, mật khẩu ≥ 12 ký tự, xác nhận phải khớp). Thành công thì chuyển về `/login` kèm thông báo và điền sẵn tên đăng nhập.
- `AuthGate` dùng chung `AuthLoading` (spinner) thay cho dòng chữ trơn.

### Thay đổi ảnh hưởng toàn app

- Class `.button` cũ của app đổi tên thành `.sr-button` (43 chỗ trong `src`) vì trùng tên với `.button` của HeroUI.
- Base layer của HeroUI đặt `border-color` mặc định là `var(--border)`. Các viền trong app đều chỉ định màu rõ (`border-line`…) nên không đổi.

### Còn mở

- Backend chưa có `POST /api/auth/register`. Trang Đăng ký gọi endpoint này với `{ username, password }`; khi nhận 404 thì báo "Máy chủ chưa mở chức năng tự đăng ký". Cần phía backend bổ sung endpoint (và quyết định vai trò mặc định) thì đăng ký mới hoạt động.
- Chưa chạy `npm test` và `npm run test:ui` (cần database test). Đã kiểm tra bằng `npm run build`, `prettier --check` và chụp màn hình Chromium ở 1440px và 390px cho đăng nhập, đăng nhập sai, đăng ký lỗi validation, đăng ký gửi đi.
- Các trang sau đăng nhập chưa được xem lại bằng mắt sau khi import HeroUI (không có tài khoản để đăng nhập).
- Các trang còn lại vẫn dùng phong cách cũ (góc vuông, `.panel`, `.sr-button`); chưa chuyển sang HeroUI.
