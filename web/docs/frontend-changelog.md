# Lịch sử thay đổi frontend

Ghi lại mỗi lần sửa xong một chức năng hoặc thay đổi lớn ở frontend. Mục mới nhất ở trên cùng.

## 2026-10-10 · Trang Review: gom lỗi theo ảnh, xem từng lỗi hoặc cả ảnh

Áp dụng bản demo `demo-group/index.html` (đã được duyệt), ghép vào giao diện hiện có (khung gập, Tập trung, sáng/tối, VI/EN).

### Hàng đợi

- Công tắc "Theo ảnh / Theo lỗi" ở đầu hàng đợi, mặc định "Theo ảnh", lưu trong `localStorage` (`smartreview-queue-grouping`). "Theo lỗi" là danh sách cũ, mỗi lỗi một dòng.
- "Theo ảnh": các case cùng ảnh (với video là cùng khung hình) gom thành một mục (`groupByImage` trong `src/features/review/grouping.ts`). Mục hiện tên ảnh, số case, điểm rủi ro cao nhất và "đã xem x/y". Ảnh đang chọn mở ra danh sách case đánh số; ảnh khác hiện một hàng ô số tô màu theo mức rủi ro, ô đã quyết định có dấu ✓.
- Thứ tự: ảnh xếp theo case đầu tiên của nó trong cách sắp xếp đang chọn (rủi ro giảm dần thì ảnh có rủi ro cao nhất ở trên); trong ảnh giữ nguyên thứ tự sắp xếp. Nút chuyển case và phím `←` `→` đi theo thứ tự này, nên xem hết các lỗi của một ảnh rồi mới sang ảnh kế.
- Mỗi case vẫn là đúng một liên kết trong hàng đợi (dòng trong danh sách hoặc ô số), nên các test đếm liên kết không đổi.

### Trên ảnh

- Ảnh có từ hai case trở lên thì các case được đánh số ngay trên khung, viền tô theo mức rủi ro; case đã quyết định có dấu ✓. Case đang xem giữ màu xanh ngọc và nhãn "RỦI RO …".
- Mặc định (từng lỗi): các case khác bị làm mờ. Nút "Xem cả ảnh" (phím `A`): mọi case hiện rõ kèm tên lớp.
- Bấm vào một khung có số thì mở case đó. Di chuyển bằng Tab vẫn chỉ xem thông tin, không chuyển case.
- Thanh công cụ có thêm "2/4 trong ảnh 1/9". Phím `↑` `↓` chuyển ảnh (chỉ từ 1024px trở lên; màn hình hẹp hơn để phím mũi tên cuộn trang).
- "Chỉ nhãn rủi ro" giờ hiện mọi case của ảnh, không chỉ case đang xem.

### Xem cả ảnh

- Bảng thông tin đổi thành danh sách thẻ (`ImageCaseList`), mỗi thẻ một case: số, lớp, điểm, lý do, ba nút quyết định.
- "Nhãn đúng" và "Chưa chắc" lưu ngay (không có bước lưu riêng như trong demo). "Lỗi gán nhãn…" mở riêng case đó ở chế độ từng lỗi, vì cần chọn loại lỗi và nhập nhãn đúng.
- Nút "N còn lại: nhãn đúng" lưu "nhãn đúng" cho mọi case chưa có quyết định của ảnh; "Sang ảnh kế →" chuyển ảnh.

### Thanh công cụ

- Để đỡ xuống dòng: nút Tập trung chỉ còn biểu tượng, nút đặt lại zoom hiện "1:1" (tên truy cập giữ nguyên).

### Kiểm tra

- `npm run typecheck`, `npm run build`, `prettier --check`.
- Chromium (Playwright) với API giả lập (13 case trên 9 ảnh): hàng đợi gom có đúng 13 liên kết; `→` đi hết case của ảnh rồi sang ảnh kế; `↑` về ảnh trước; "Xem cả ảnh" hiện 4 thẻ; quyết định nhanh và nút "còn lại: nhãn đúng" gửi đúng các case chưa có quyết định; bấm khung số trên ảnh mở đúng case; "Theo lỗi" trả lại danh sách cũ; vừa một màn hình ở 1600×900, không tràn ngang ở 390px.
- Chưa chạy `npm test`, `npm run test:ui`; chưa xem với dữ liệu thật. Thứ tự hàng đợi mặc định đã đổi (gom theo ảnh), nên nếu test nào dựa vào thứ tự cũ thì có thể cần sửa.

## 2026-10-10 · Trang Review: khung gập được, chế độ Tập trung, màu vùng ảnh theo giao diện

Áp dụng bố cục A của bản demo (`demo-panels/index.html`, đã được duyệt).

### Ẩn/hiện khung

- Ba khung quanh ảnh ẩn/hiện được: hàng đợi (nút đầu thanh công cụ, phím `[`), bảng thông tin (phím `]`), dải ngữ cảnh theo thời gian (phím `\`). Nút "Tập trung" (phím `F`) ẩn cả ba; bấm lại thì hiện lại cả ba. Phím tắt không chạy khi đang gõ trong ô nhập.
- Trạng thái nằm trong `usePanels` (`src/features/review/usePanels.ts`), lưu ở `localStorage` (`smartreview-review-panels`). Mặc định hiện cả ba.
- Khung bị ẩn để lại một tay nắm ở mép ảnh để mở lại. Khi không có case nào được chọn thì hàng đợi luôn hiện (vì lúc đó không có thanh công cụ).
- Khi ẩn bảng thông tin, trên ảnh có thêm:
  - thẻ cảnh báo ở góc trên phải (điểm rủi ro, tên lớp, số tín hiệu; bấm để xem lý do);
  - thanh quyết định nổi ở đáy ảnh: ba lựa chọn, ô loại lỗi / nhãn đúng khi chọn "lỗi gán nhãn", và nút "Lưu & tiếp". Ô ghi chú không hiện ở thanh này nhưng nội dung vẫn được giữ và lưu.
- Form quyết định chỉ có một bản: nút DOM của nó được chuyển giữa bảng thông tin và thanh nổi (portal vào một phần tử cố định), nên ẩn/hiện bảng không làm mất nội dung đang nhập.

### Kích thước và màu

- Từ 1280px trở lên: hàng đợi rộng 300px (trước 264px), bảng thông tin rộng 396px (trước 332px); ảnh còn khoảng 90% bề rộng cũ. Chữ lý do cảnh báo lớn hơn một cỡ.
- Vùng quanh ảnh và dải ngữ cảnh không còn luôn tối: thêm hai màu `canvas` và `film` trong `styles.css`, đổi theo giao diện sáng/tối. Các nút và thẻ nổi trên ảnh dùng màu khung của giao diện đang chọn.
- Giao diện tối: nút bật/tắt HeroUI đang bật có chữ sáng hơn (`--accent-soft*`), trước đây chữ mờ hơn cả nút tắt.

### Kiểm tra

- `npm run typecheck`, `npm run build`, `prettier --check`.
- Chromium (Playwright) với API giả lập, 1600×900: mặc định vẫn vừa một màn hình, vùng ảnh rộng 880px; ẩn bảng thông tin thì thanh nổi hiện và chọn được quyết định; hiện lại thì ghi chú và lựa chọn vẫn còn; Tập trung cho vùng ảnh rộng 1576px; vừa màn hình ở 1366×768; không tràn ngang ở 390px.
- Ở 1600px thanh công cụ xuống hai dòng khi hàng đợi đang hiện (nhiều nút hơn trước).
- Test Playwright không sửa: mặc định mọi khung đều hiện. Chưa chạy `npm test`, `npm run test:ui`; chưa xem với dữ liệu thật.

## 2026-10-10 · Chế độ VI thuần tiếng Việt

- Trước đây `vi` hiển thị thuật ngữ tiếng Anh kèm chú thích trong ngoặc ("Frame (Khung hình)") và còn nhiều nhãn chỉ có tiếng Anh ("All annotations", "Risk only"…). Nay `vi` chỉ còn tiếng Việt; `en` không đổi.
- `hint()` ở `vi` thay hẳn thuật ngữ bằng nghĩa tiếng Việt và giữ kiểu chữ của từ gốc (`frame` giữa câu → "khung hình", `PASSED` → "ĐẠT"). Một số nghĩa được rút gọn: Risk → "Rủi ro", Projects → "Dự án", Media → "Dữ liệu ảnh", Annotations → "Nhãn", N/A → "Không có".
- Bảng mới `src/lib/i18n.vi.ts`: tiếng Việt cho các nhãn viết bằng tiếng Anh trong component và cho những câu mà việc thay từng từ đọc không xuôi.
- Runtime JSX giờ dịch ở cả hai chế độ. Ở `vi`, nó tra `i18n.vi.ts`; với các câu do app viết (chính là các khóa của `i18n.en.ts`) thì thay thuật ngữ tiếng Anh còn lẫn trong câu. Chữ khác như tên lớp, tên file, mã annotation không bị đụng tới.
- Thêm `ui(text)` trong `src/lib/i18n.ts` cho nhãn tự ghép trong component (tab "Cảnh báo · 2") và cho test.
- `objectText` chỉ dịch chữ "Object"/"Track", không dịch phần mã phía sau (trước đây mã như `object-2` cũng bị thay chữ).
- Runtime JSX được loại khỏi bước pre-bundle của Vite (`optimizeDeps.exclude`): nếu không, sửa bảng dịch sẽ không có tác dụng ở dev cho tới khi xóa cache.
- Còn tiếng Anh ở `vi`: dữ liệu (tên lớp, tên file, mã check như `model.low_confidence`, nội dung server trả về), tên riêng (SmartReview, CVAT, COCO, MySQL), tên định dạng trong form import, và hai nhãn chỉ dành cho trình đọc màn hình ("Inspect …" trên khung annotation, mô tả ảnh ở trang Frames).

### Test

- Chữ hiển thị mặc định đã đổi nên sửa các test Playwright đang so chuỗi cứng: dùng `ui(...)` / `hint(...)` trong `scene`, `review`, `projects`, `ai-check`, `loading`, `frame-review`. Các test đã gọi `hint()` sẵn thì tự khớp. Chưa chạy được bộ test (cần database test), nên có thể còn chỗ so chuỗi bị sót.

### Kiểm tra

- `npm run typecheck`, `npm run build`, `prettier --check`.
- Chromium (Playwright) với API giả lập: ở `vi`, trang Review (cả ba tab) và Overview không còn chữ tiếng Anh nào của giao diện; ở `en` không còn chữ tiếng Việt; trang Review vẫn vừa một màn hình.
- Chưa xem bằng mắt ở `vi`: Projects, Dashboard, Frames, AI Check, New Project, Đăng nhập / Đăng ký.

## 2026-10-10 · Chuyển ngôn ngữ VI/EN, bo góc toàn bộ app

### Ngôn ngữ

- Nút `VI` / `EN` (`LanguageToggle`) trên thanh trên của mọi trang sau đăng nhập và ở góc trang Đăng nhập / Đăng ký. Lựa chọn lưu trong `localStorage` (`smartreview-lang`), mặc định là `vi`. Đổi ngôn ngữ thì trang tải lại, nên thay đổi chưa lưu trong form sẽ mất.
- `vi` là giao diện như cũ, không đổi một chữ nào (thuật ngữ tiếng Anh kèm chú thích tiếng Việt trong ngoặc), nên test hiện có không bị ảnh hưởng.
- `en` là tiếng Anh hoàn toàn:
  - `hint()` trả lại thuật ngữ tiếng Anh, không kèm chú thích.
  - Các câu tiếng Việt được dịch bằng bảng `src/lib/i18n.en.ts` (khoảng 300 câu, khóa là đúng câu tiếng Việt trong mã nguồn) cộng vài quy tắc regex cho câu có chèn giá trị.
- Cách áp dụng: JSX của app biên dịch qua runtime riêng (`src/lib/jsx/`, khai báo bằng `jsxImportSource` và alias trong `vite.config.ts`). Runtime này dịch chuỗi con và các thuộc tính `aria-label`, `placeholder`, `title`, `alt`, `label` ngay khi tạo phần tử, nên component không phải gọi hàm dịch. Thêm câu tiếng Việt mới thì chỉ cần thêm một dòng vào bảng; câu chưa có trong bảng sẽ hiện nguyên tiếng Việt ở chế độ `en`.
- Không dịch: nội dung từ server (lý do cảnh báo của từng check, thông báo lỗi API), tên lớp, tên file, và ngày giờ (vẫn định dạng `vi-VN`).

### Bo góc

- `.panel` bo `rounded-xl` và cắt nội dung tràn, `.sr-button` bo tròn hẳn như nút HeroUI, `.field` bo `rounded-lg`: áp dụng cho mọi trang.
- Thay hết `rounded-none` còn lại (menu trên, nhãn trạng thái project, nhãn schema/engine ở Overview) và bo các khung viền riêng ở trang Frames.

### Kiểm tra

- `npm run typecheck`, `npm run build`, `prettier --check`.
- Chromium (Playwright) với API giả lập: ở `en`, trang Review, Overview và Đăng nhập không còn câu tiếng Việt nào của giao diện; ở `vi` chữ trên nút vẫn như trước; trang Review vẫn vừa một màn hình. Overview đã xem ở giao diện tối với góc bo.
- Chưa dựng được các trang Projects, Dashboard, Frames, AI Check, New Project (cần dữ liệu thật): bản dịch và bo góc ở các trang này chưa được xem bằng mắt.
- Chưa chạy `npm test`, `npm run test:ui`.

## 2026-10-10 · Trang Review: so sánh ảnh gốc, chế độ "Without risk", nút và khung theo HeroUI

### Chức năng mới trên thanh công cụ

- **So sánh ảnh gốc**: chia vùng ảnh làm hai, bên trái là ảnh gốc không có khung nào, bên phải là ảnh có nhãn. Zoom, kéo và "Phóng to vật thể" áp dụng cho cả hai bên (`FrameViewer` có thêm `follow` và `onViewChange`). Ảnh bên trái lấy từ cache nên không tải thêm.
- **Without risk**: chế độ thứ ba cạnh "All annotations" và "Risk only", vẽ mọi annotation của frame trừ annotation đang bị cảnh báo.

### HeroUI

- HeroUI 3.2.6 có sẵn `Button`, `ToggleButton`, `ToggleButtonGroup`, `Card`, `Chip`, `Kbd`, `Tabs`, `Tooltip`, `Surface`. Đã dùng:
  - `ToggleButtonGroup` + `ToggleButton` cho ba chế độ annotation; `ToggleButton` cho BBox, Phóng to vật thể, So sánh ảnh gốc.
  - `Button` cho chuyển case, zoom, sao chép, "Save Review" (outline) và "Lưu & tiếp" (primary).
  - `Card` cho từng tín hiệu trong Why flagged.
- Nhóm ba chế độ chạy ở `selectionMode="multiple"` có kiểm soát để luôn đúng một nút được chọn: ở chế độ `single`, React Aria đổi các nút thành radio, làm hỏng tên/role mà test đang tìm.
- Chưa dùng `Tabs` của HeroUI cho cột phải: tab ẩn cần vẫn nằm trong DOM (test đọc danh sách annotation khi tab chưa mở, và trạng thái mở của Evidence cần giữ).
- Bo góc cho ô lọc, ô nhập, ô quyết định, thẻ temporal và `RiskBadge` để khớp với nút HeroUI. Các trang khác vẫn góc vuông.
- Giao diện tối: đặt `--background`, `--surface`, `--border`, `--field-background` của HeroUI theo bảng xám của app.

### Kiểm tra

- `npm run typecheck`, `npm run build`, `prettier --check`.
- Chromium (Playwright) với API giả lập: "Without risk" ẩn đúng annotation đang review; hai khung so sánh có cùng `viewBox` sau khi zoom; ba nút chế độ vẫn là `button` có `aria-pressed`; "Save Review" lưu và ở lại case; không cuộn trang ở 1920×1080 và 1366×768; không tràn ngang ở 390px.
- Chưa xem với dữ liệu thật; chưa chạy `npm test`, `npm run test:ui`.

## 2026-10-10 · Trang Review một màn hình kiểu CVAT, giao diện tối, logo dùng chung

### Trang Review vừa đúng một màn hình (từ 1024px trở lên)

- Trang không còn cuộn; từng vùng tự cuộn bên trong. Dưới 1024px vẫn xếp dọc và cuộn như trước.
- Thanh trên của `AppLayout` thu gọn khi ở trang Review và có một ô trống (`headerSlot`, truyền qua `Outlet context`); trang Review đưa tên dự án, tiến độ và các con số thống kê vào đó. Ẩn footer và nhãn trạng thái dữ liệu ở trang này.
- Thanh công cụ của case: chuyển case, tên frame, All annotations / Risk only, BBox, phóng to vật thể, zoom, sao chép. Nút zoom do `FrameViewer` vẽ vào thanh này qua prop `controlsSlot`.
- Cột trái: bộ lọc và hàng đợi. Giữa: ảnh trên nền tối cố định (cả hai giao diện), co vừa khung; lăn chuột để zoom, kéo để di chuyển khi đã zoom. Dưới ảnh là dải Temporal context; case không có track thì chỉ còn một dòng ghi chú.
- Cột phải: ba tab Why flagged, Objects (danh sách annotation của frame), Chi tiết. Form quyết định ghim ở đáy cột.
- Màu khung annotation đổi sang màu cố định đọc được trên nền tối: đang review xanh ngọc, đang chọn trắng nét đứt, còn lại xám.

### Form quyết định

- Ba lựa chọn hiển thị thành ba ô lớn (vẫn là radio, tên truy cập không đổi).
- Phím tắt: `1` `2` `3` chọn quyết định, `Ctrl+Enter` lưu rồi sang case tiếp. Phím số không chạy khi đang gõ trong ô nhập.
- Thêm nút "Lưu & tiếp →". Nút "Save Review" cũ vẫn còn và vẫn ở lại case: bản demo chỉ có một nút, nhưng giữ cả hai để lưu mà không rời case vẫn làm được và test hiện có không đổi. Ở case cuối danh sách chỉ còn nút lưu.

### Giao diện tối

- Nút mặt trời/mặt trăng trên thanh trên của mọi trang sau đăng nhập (`ThemeToggle`, `src/lib/theme.ts`), lưu lựa chọn trong `localStorage`, mặc định là sáng.
- Bảng màu tối lấy theo trang đăng nhập (nền `#1e1f22`, khung `#313338`, viền `#3f4147`). Cách làm: `:root[data-theme='dark']` đổi giá trị các biến màu của Tailwind (ink, panel, line, muted, accent, thang slate, vài màu chữ rose/amber/sky), nên các class hiện có tự đổi theo. `bg-white` trong app đổi thành `bg-panel`.
- Chỉ mới soát bằng mắt trang Review ở giao diện tối; các trang khác dùng chung biến màu nhưng chưa xem lại từng trang.

### Logo

- Logo trong `public/favicon.svg` (cùng hình với `LogoMark`) thay cho biểu tượng cũ trên thanh trên của `AppLayout` và dòng chữ trơn của `ProjectLayout`; thêm vào đầu `README.md` của repo.

### Test

- Sửa `tests/browser/scene.spec.ts` và `review.spec.ts`: bấm tab Objects / Chi tiết / Why flagged trước các bước cần nội dung trong tab. Chưa chạy được hai bộ test này (cần database test).

### Kiểm tra

- `npm run typecheck`, `npm run build`, `prettier --check`.
- Dựng trang bằng Chromium (Playwright) với API giả lập trên một dev server riêng: không cuộn trang ở 1920×1080, 1366×768 và 1100×900; không tràn ngang ở 390px; phím `2` chọn Annotation Error; `Ctrl+Enter` lưu một lần rồi sang case kế; sáng và tối đều hiển thị đúng.
- Chưa xem với dữ liệu thật (không có tài khoản đăng nhập).
- Dev server đang chạy ở cổng 5173 trả 504 "Outdated Optimize Dep" cho `react-dom` (thư mục cache `node_modules/.vite` không còn trên đĩa); cần khởi động lại `npm run dev` thì trang mới tải được.

## 2026-10-10 · Trang Review: gọn bố cục, mỗi ảnh chỉ tải một lần

### Ảnh

- Ảnh frame được server trả với `Cache-Control: no-store`, nên mỗi thẻ `<image>` trỏ cùng một URL lại tải riêng: khung chính và ô "Hiện tại" trong Temporal context tải hai lần cùng ảnh, và chuyển sang box khác trên cùng ảnh thì tải lại từ đầu.
- Thêm `src/lib/imageCache.ts`: mỗi URL ảnh chỉ `fetch` một lần, giữ dưới dạng blob URL và dùng chung. Giữ tối đa 24 ảnh; chỉ bỏ ảnh không còn khung nào đang hiển thị. Gặp 401 thì làm mới phiên và thử lại một lần (thay cho tham số `session_retry=1` cũ).
- `SessionImage` dùng cache này, nên `FrameViewer` và `WholeFrameViewer` (trang Frames, AI Check) đều được hưởng.
- Chưa đổi header phía server; cache chỉ sống trong một lần mở trang, tải lại trang thì ảnh tải lại.

### Bố cục

- Đầu trang: bỏ eyebrow và tiêu đề chung; còn một dòng gồm tên dự án, số frame, số annotation.
- `ReviewSummary` có thêm chế độ `compact` (trang Review dùng): 8 ô thống kê và thanh tiến độ gộp thành một dải một dòng. Trang Overview vẫn dùng dạng ô như cũ.
- Hàng đợi: bỏ eyebrow và chú thích cuối; ô lọc thấp hơn; mỗi case còn 3 dòng (risk và trạng thái, tên và confidence, object hoặc chuỗi class kèm tên media). Hàng đợi cao bằng cửa sổ và cuộn bên trong.
- Khung chi tiết: tên media, kích thước và thời điểm chuyển lên dòng tiêu đề; nút "Sao chép thông tin" thành nút biểu tượng cạnh nút chuyển case (bỏ khung riêng); ảnh chính cao tối đa `72vh`; "All annotations / Risk only" ghép thành một cụm; danh sách annotation và phần chi tiết annotation nằm chung một khung hai cột (bỏ khung "Annotation Details" riêng); bỏ các câu hướng dẫn lặp lại.
- Form quyết định: tiêu đề "Quyết định", ô ghi chú thấp hơn, chú thích cuối rút còn một dòng.
- Giữ nguyên nhãn, vai trò ARIA và các nút mà test Playwright đang tìm (`Annotations in frame`, `Risk only`, `Why flagged`, các region thống kê, 4 thẻ `<image>` ở case có temporal…). Vẫn dùng control gốc của trình duyệt, chưa chuyển trang này sang component HeroUI.

### Kiểm tra

- `tsc --noEmit`, `npm run build`, `prettier --check`.
- Không có tài khoản đăng nhập và MCP Chrome DevTools không tìm thấy Chrome, nên xem trang bằng Chromium (Playwright) với API giả lập ở 1600px và 390px: case temporal có 4 thẻ ảnh nhưng chỉ 3 lượt tải; chuyển sang box khác trên ảnh đã tải thì không tải thêm; không tràn ngang ở 390px.
- Chưa xem với dữ liệu thật và chưa chạy `npm test`, `npm run test:ui` (cần database test).

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
- Thêm thành phần `Backdrop` trong `AuthLayout.tsx`: năm khung bbox trang trí quanh thẻ (ba khung "khớp" màu teal có nhãn và điểm tin cậy, một khung "nghi ngờ" màu hổ phách, một khung nét đứt), có tay nắm ở bốn góc. Toàn bộ là `aria-hidden` và chỉ hiện từ `lg` trở lên; mobile chỉ còn lưới chấm.
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
- Logo SmartReview: khung bbox bốn góc bao dấu tích trên nền teal. `src/components/Logo.tsx` (`LogoMark`, `Logo`) và `public/favicon.svg`, gắn favicon trong `index.html`.
- `src/features/auth/AuthLayout.tsx`: bố cục hai cột (form bên trái, bảng thương hiệu bên phải, ẩn dưới `lg`), `AuthLoading`, `PasswordField` có nút hiện/ẩn mật khẩu.
- `src/pages/LoginPage.tsx`: viết lại bằng `Form`, `TextField`, `InputGroup`, `Button`, `Alert`. Giữ nguyên nhãn "Tên đăng nhập", "Mật khẩu" và nút "Đăng nhập" để test Playwright hiện có vẫn tìm được.
- `src/pages/RegisterPage.tsx` và route `/register`: tên đăng nhập, mật khẩu, xác nhận mật khẩu. Kiểm tra phía client theo quy tắc trong `docs/auth.md` (tên 3–64 ký tự chữ/số/`_`/`.`/`-`, mật khẩu ≥ 12 ký tự, xác nhận phải khớp). Thành công thì chuyển về `/login` kèm thông báo và điền sẵn tên đăng nhập.
- `AuthGate` dùng chung `AuthLoading` (spinner) thay cho dòng chữ trơn.

### Thay đổi ảnh hưởng toàn app

- Class `.button` cũ của app đổi tên thành `.sr-button` (43 chỗ trong `src`) vì trùng tên với `.button` của HeroUI.
- Base layer của HeroUI đặt `border-color` mặc định là `var(--border)`. Các viền trong app đều chỉ định màu rõ (`border-line`…) nên không đổi.

### Còn mở

- Backend chưa có `POST /api/auth/register`. Trang Đăng ký gọi endpoint này với `{ username, password }`; khi nhận 404 thì báo "Máy chủ chưa mở chức năng tự đăng ký". Cần phía backend bổ sung endpoint (và quyết định vai trò mặc định) thì đăng ký mới hoạt động.
- Chưa chạy `npm test` và `npm run test:ui` (cần database test). Đã kiểm tra bằng `npm run build`, `prettier --check` và chụp màn hình Chromium ở 1440px và 390px cho đăng nhập, đăng nhập sai, đăng ký lỗi validation, đăng ký gửi đi.
- Các trang sau đăng nhập chưa được xem lại bằng mắt sau khi import HeroUI (không có tài khoản để đăng nhập).
- Các trang còn lại vẫn dùng phong cách cũ (góc vuông, `.panel`, `.sr-button`); chưa chuyển sang HeroUI.
