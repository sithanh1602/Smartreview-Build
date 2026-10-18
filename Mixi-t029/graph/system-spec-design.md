# SmartReview — Đặc tả và thiết kế

Tài liệu này mô tả hệ thống làm gì, phục vụ ai và được thiết kế như thế nào ở mức tổng quan, phục vụ báo cáo và thuyết trình.

## 1. Mục tiêu và phạm vi

SmartReview hỗ trợ nhóm gán nhãn kiểm tra chất lượng dữ liệu 2D và 3D: hệ thống ưu tiên các trường hợp đáng xem, hiển thị bằng chứng và ghi nhận quyết định của con người.

Phạm vi hiện có: tài khoản và phân quyền, project 2D/3D, nhập và chuẩn hóa dữ liệu, phân tích rủi ro bằng bộ quy tắc, review, bàn giao và nhận lại nhãn đã sửa (2D), cùng các chức năng bổ trợ tùy chọn như tác vụ AI, quét CVAT và phân tích guideline.

Ngoài phạm vi: hệ thống không tự sửa nhãn, không tự ghi nhãn về CVAT và không hứa hẹn độ chính xác tự động thay cho quyết định của người kiểm tra.

## 2. Người dùng và quyền

| Vai trò | Nhiệm vụ chính |
|---|---|
| Leader | Tạo và nhập project, quản lý thành viên, theo dõi quá trình review, yêu cầu các tác vụ bổ trợ |
| Reviewer | Đánh giá các trường hợp trong project được cấp quyền, bàn giao lỗi cần sửa |
| Annotator | Xem lỗi được bàn giao, sửa nhãn ở công cụ bên ngoài, nộp lại nhãn và chạy quét kiểm tra |

Quyền thực tế do máy chủ quyết định theo tài khoản và vai trò trong từng project; giao diện chỉ hiển thị những gì tài khoản được phép làm.

## 3. Yêu cầu chức năng

| # | Chức năng | Kết quả |
|---|---|---|
| 1 | Đăng ký, đăng nhập, đăng xuất | Người dùng làm việc theo tài khoản và phiên đăng nhập |
| 2 | Quản lý project và thành viên | Mỗi project có dữ liệu, trạng thái và phạm vi truy cập riêng |
| 3 | Nhập dữ liệu 2D | Nhãn và ảnh được kiểm tra, chuẩn hóa thành tập dữ liệu thống nhất |
| 4 | Phân tích rủi ro và review 2D | Có danh sách trường hợp ưu tiên kèm bằng chứng để người dùng quyết định |
| 5 | Bàn giao và nhận nhãn sửa 2D | Lỗi được đóng gói bàn giao; nhãn đã sửa tạo phiên bản dữ liệu mới |
| 6 | Nhập, xem và review dữ liệu 3D Waymo | Có cảnh 3D, đám mây điểm, ảnh camera và quyết định đánh giá |
| 7 | Tác vụ AI bổ trợ (tùy chọn) | Bổ sung tín hiệu rủi ro, so sánh dự đoán với nhãn, hoặc kiểm tra nhãn theo lớp |
| 8 | Tích hợp ngoài (tùy chọn) | Dropbox lưu trữ tệp, CVAT cung cấp dữ liệu quét, Gemini hỗ trợ phân tích guideline |

Các chức năng tùy chọn chỉ hoạt động khi môi trường tương ứng được cấu hình đầy đủ (dịch vụ ngoài, mô hình và trọng số). Chức năng lõi từ mục 1–6 không phụ thuộc vào chúng.

## 4. Quy trình nghiệp vụ chính

| Quy trình | Các bước chính | Kết quả |
|---|---|---|
| Bắt đầu project | Leader tạo project và nhập dữ liệu | Project sẵn sàng hoặc báo lỗi cần xử lý |
| Review 2D | Mở trường hợp, xem ảnh và bằng chứng, ghi quyết định | Quyết định đúng / lỗi / chưa chắc chắn được lưu lại |
| Vòng sửa nhãn 2D | Bàn giao lỗi → sửa ở công cụ ngoài → nộp lại nhãn | Phiên bản dữ liệu mới để kiểm tra tiếp |
| Review 3D | Nhập dữ liệu Waymo → xem cảnh 3D → đánh giá đối tượng | Quyết định gắn với phiên bản cảnh tương ứng |
| AI bổ trợ | Người dùng yêu cầu tác vụ → hệ thống xử lý → xem kết quả | Tín hiệu hỗ trợ kiểm tra; không thay quyết định của người dùng |
| Quét CVAT | Nhập mã công việc → hệ thống đọc dữ liệu → phân tích | Báo cáo quét và lịch sử theo người dùng |
| Guideline | Gửi văn bản hướng dẫn → nhận đề xuất → người dùng lựa chọn | Lựa chọn được lưu; không tự biến thành quy tắc bắt buộc |

![Luồng xử lý tổng quan](diagrams/exports/04-workflows.svg)

Các tình huống lỗi chính: dữ liệu không hợp lệ, thiếu ảnh hoặc thành phần, không đủ quyền, thiếu môi trường mô hình, hoặc dịch vụ ngoài không phản hồi. Hệ thống báo trạng thái rõ ràng để người dùng xử lý, không âm thầm bỏ qua.

## 5. Thiết kế dữ liệu

| Nhóm dữ liệu | Nội dung | Nơi lưu |
|---|---|---|
| Tài khoản / phiên | Người dùng, vai trò và phiên đăng nhập | MySQL |
| Project / thành viên | Thông tin project, trạng thái và quyền theo project | MySQL |
| Tập dữ liệu / cảnh 3D | Nhãn đã chuẩn hóa, cảnh và số đo đã xuất | Tệp trên máy chủ hoặc Dropbox |
| Ảnh / đám mây điểm | Nội dung hiển thị khi review | Tệp trên máy chủ hoặc Dropbox |
| Phiên bản / quyết định review | Phiên bản dữ liệu đang kiểm tra và quyết định tương ứng | MySQL |
| Kết quả rủi ro / AI | Danh sách trường hợp ưu tiên và báo cáo | Tệp báo cáo, liên kết với project |
| Bàn giao / lịch sử quét | Gói lỗi bàn giao 2D và lịch sử quét CVAT | MySQL |

Quan hệ cốt lõi: một project gắn với một phiên bản dữ liệu tại mỗi thời điểm; quyết định review luôn gắn với phiên bản đó, nên khi nhãn sửa tạo phiên bản mới, kết quả kiểm tra cũ không bị nhầm sang dữ liệu mới.

## 6. Thiết kế AI và chấm rủi ro

Phần lõi của hệ thống là **bộ quy tắc chấm rủi ro** viết bằng TypeScript: mỗi trường hợp được đối chiếu với các quy tắc chất lượng và nhận mức ưu tiên kiểm tra. Điểm rủi ro là thứ hạng ưu tiên, không phải xác suất nhãn sai.

Mô hình AI đóng vai trò bổ trợ theo yêu cầu:

- **Bổ sung tín hiệu khi nhập dữ liệu**: mô hình gợi ý đối tượng có thể bị thiếu trước khi chấm rủi ro.
- **So sánh độc lập**: dự đoán của mô hình được đối chiếu với nhãn hiện có và lưu thành kết quả riêng.
- **Kiểm tra nhãn theo lớp**: mô hình thị giác kiểm tra nhãn có khớp với nội dung ảnh hay không.
- **Dữ liệu 3D**: AI không chạy trực tiếp trên đám mây điểm; Python chỉ xuất cảnh và số đo, bộ quy tắc đọc dữ liệu đã xuất.

Mọi kết quả AI đều cần môi trường Python, gói thư viện và trọng số phù hợp mới chạy được. Hệ thống không công bố con số độ chính xác khi chưa có đo lường chính thức.

## 7. Yêu cầu phi chức năng

| Chủ đề | Thiết kế hiện tại | Giới hạn cần biết |
|---|---|---|
| Bảo mật | Đăng nhập bằng phiên phía máy chủ, phân quyền tại backend, kiểm tra dữ liệu tải lên | Vận hành production vẫn cần HTTPS và quản lý khóa bí mật riêng |
| Nhất quán dữ liệu | Quyết định review gắn với phiên bản dữ liệu, có kiểm tra xung đột khi ghi đồng thời | Dữ liệu trong MySQL và tệp không nằm trong cùng một giao dịch |
| Khả năng phục hồi | Báo trạng thái lỗi rõ ràng, hỗ trợ tiếp tục nhập dữ liệu khi còn dữ liệu tạm | Tác vụ nền nằm trong bộ nhớ, mất khi máy chủ khởi động lại |
| Hiệu năng | Giới hạn kích thước tải lên, thời gian chờ cho tác vụ mô hình, bộ nhớ đệm | Chưa có đo tải và cam kết hiệu năng chính thức |
| Bảo trì | Tách rõ giao diện, máy chủ, engine dùng chung; quy tắc chấm điểm để thành tệp chính sách riêng | Cần cập nhật tài liệu khi quy tắc hoặc cấu trúc thay đổi |

## 8. Triển khai, cấu hình và giới hạn

Hệ thống cần Node, MySQL và vùng lưu trữ tệp. Có thể chạy trực tiếp trên máy chủ (môi trường phát triển có sẵn proxy cho API) hoặc bằng Docker cho Node và MySQL. Chức năng Python/AI cần cài đặt môi trường riêng. Sao lưu phải gồm cả MySQL và kho tệp.

Giới hạn hiện tại:

- Hàng đợi và tác vụ nền chưa bền vững qua khởi động lại.
- Dữ liệu 3D tập trung vào từng đoạn Waymo; một số cấu trúc dữ liệu 3D đã có nhưng chưa có quy trình sử dụng.
- Bản đóng gói Docker chưa đầy đủ cho luồng 3D/AI.
- Chưa có nhật ký kiểm toán (audit log) đầy đủ cho mọi thao tác.
- Chưa xác minh vận hành đầu-cuối với các dịch vụ ngoài và mô hình trong đợt lập tài liệu này; không khẳng định sẵn sàng production hay SLA.
