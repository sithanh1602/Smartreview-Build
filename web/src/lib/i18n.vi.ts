// Vietnamese for strings written in English in the components, and for mixed strings where
// swapping single terms (see englishHints.ts) would read badly.
export const vi: Record<string, string> = {
  'All annotations': 'Tất cả nhãn',
  'Risk only': 'Chỉ nhãn rủi ro',
  'Without risk': 'Trừ nhãn rủi ro',
  Flags: 'Cảnh báo',
  Objects: 'Đối tượng',
  'Annotations (': 'Nhãn (',
  'Annotations in frame': 'Nhãn trong khung hình',
  Risk: 'Rủi ro',
  '· Frame': '· Khung hình',
  Conf: 'Tin cậy',
  'Frame, object, media, label…': 'Khung hình, đối tượng, ảnh, nhãn…',
  'frames ·': 'khung hình ·',
  annotations: 'nhãn',
  Errors: 'Lỗi',
  Correct: 'Đúng',
  'Model:': 'Mô hình:',
  'Import failed.': 'Nhập dữ liệu thất bại.',
  'Image metadata CSV (optional)': 'CSV thông tin ảnh (không bắt buộc)',
  'SmartReview dataset': 'Bộ dữ liệu SmartReview',
  'unknown source': 'không rõ nguồn',
  'risk cases': 'trường hợp đáng nghi',
  'Annotated dataset': 'Bộ dữ liệu đã gán nhãn',
  'Mọi severity': 'Mọi mức độ',
  'Đặt lại zoom': 'Đặt lại thu phóng',
  '· Đang review': '· Đang kiểm tra',
  'chưa review': 'chưa kiểm tra',
  'AI Check (Kiểm tra bằng AI)': 'Kiểm tra bằng AI',
  'AI Check (Kiểm tra bằng AI) · Điểm ưu tiên': 'Kiểm tra bằng AI · Điểm ưu tiên',
  '% · IoU (Độ trùng khớp)': '% · Độ trùng khớp',
  '· IoU (Độ trùng khớp):': '· Độ trùng khớp:',
  '% · IoU (Độ trùng khớp khung) ≥': '% · Độ trùng khớp khung ≥',
  '· CPU · Confidence (Độ tin cậy) ≥': '· CPU · Độ tin cậy ≥',
  'Confidence (Độ tin cậy AI):': 'Độ tin cậy AI:',
  'Why Flagged (Lý do cảnh báo)': 'Lý do cảnh báo',
  'Annotation (Nhãn hiện có)': 'Nhãn hiện có',
  'Missing Object (Thiếu đối tượng)': 'Thiếu đối tượng',
  'frame (khung hình) không có ảnh phù hợp.': 'khung hình không có ảnh phù hợp.',
  'Tạo project → upload → validate → QA checks → review.':
    'Tạo dự án → tải lên → kiểm tra hợp lệ → kiểm tra chất lượng → đánh giá.',
  'Chọn Correct, Error hoặc Unsure.': 'Chọn Đúng, Lỗi hoặc Chưa chắc chắn.',
  'Nhập Correct Label cho lỗi Class.': 'Nhập nhãn đúng cho lỗi loại đối tượng.',
  'Correction và error type chỉ dùng cho Annotation Error.':
    'Đề xuất sửa và loại lỗi chỉ dùng cho lỗi gán nhãn.',
  'Ctrl + Enter lưu và sang case tiếp': 'Ctrl + Enter lưu và sang trường hợp tiếp',

  // Sentences whose leftover English words are not domain terms worth swapping everywhere.
  'Project đã xóa. Một số file chờ dọn trong storage/.trash; kiểm tra quyền thư mục trên máy chủ.':
    'Dự án đã xóa. Một số tệp chờ dọn trong storage/.trash; kiểm tra quyền thư mục trên máy chủ.',
  'Chọn annotation file và các ảnh tương ứng.': 'Chọn tệp nhãn và các ảnh tương ứng.',
  'Đang nhận files…': 'Đang nhận tệp…',
  'Project đã được giữ lại. Bạn có thể chọn lại file và thử import.':
    'Dự án đã được giữ lại. Bạn có thể chọn lại tệp và thử nhập dữ liệu.',
  'File như images.csv: mỗi ảnh một dòng, có cột file_name và env_risk (0–1).':
    'Tệp như images.csv: mỗi ảnh một dòng, có cột file_name và env_risk (0–1).',
  'Chọn thư mục chứa ảnh thay cho lựa chọn trên. Đường dẫn cần khớp annotation; tên file đơn chỉ được ghép khi duy nhất.':
    'Chọn thư mục chứa ảnh thay cho lựa chọn trên. Đường dẫn cần khớp tệp nhãn; tên tệp đơn chỉ được ghép khi duy nhất.',
  'Chọn COCO JSON chứa images, categories, annotations và bbox [x, y, width, height], cùng tất cả ảnh được khai báo. Chỉ kiểm tra bbox; segmentation/keypoints được giữ trong metadata, không dùng để kiểm tra. Không nhận COCO prediction hoặc panoptic.':
    'Chọn tệp COCO JSON chứa images, categories, annotations và bbox [x, y, width, height], cùng tất cả ảnh được khai báo. Chỉ kiểm tra khung bao; segmentation/keypoints được giữ lại nhưng không dùng để kiểm tra. Không nhận COCO prediction hoặc panoptic.',
  'Dataset đã có annotation, không cần chạy model. Hỗ trợ ảnh PNG, JPEG, WebP, GIF; box, polygon và polyline từ CVAT images. Video/SVG và CVAT tracks chưa được hỗ trợ qua upload.':
    'Bộ dữ liệu đã có nhãn, không cần chạy mô hình. Hỗ trợ ảnh PNG, JPEG, WebP, GIF; khung bao, đa giác và đường gấp khúc từ CVAT images. Video/SVG và chuỗi theo dõi của CVAT chưa được hỗ trợ khi tải lên.',
  'Đang chạy QA checks…': 'Đang chạy kiểm tra chất lượng…',
  'Import dữ liệu đã gán nhãn, kiểm tra chất lượng và lưu quyết định review.':
    'Nhập dữ liệu đã gán nhãn, kiểm tra chất lượng và lưu quyết định đánh giá.',
  'Không có track ID; các kiểm tra temporal được bỏ qua.':
    'Không có mã chuỗi theo dõi; các kiểm tra theo thời gian được bỏ qua.',
  'Chưa phát hiện bất thường trong các check hiện có.':
    'Chưa phát hiện bất thường trong các phép kiểm tra hiện có.',
  'Không có suspicious case trong các check hiện tại.':
    'Không có trường hợp đáng nghi trong các phép kiểm tra hiện tại.',
  'Chưa có overlay cho': 'Chưa vẽ được hình cho',
  'Đối chiếu nhãn và khung bao với model cục bộ. Gợi ý cần người kiểm tra xác nhận.':
    'Đối chiếu nhãn và khung bao với mô hình cục bộ. Gợi ý cần người kiểm tra xác nhận.',
  'Chưa tìm thấy Python hoặc model cục bộ. Xem hướng dẫn cấu hình trong docs/ai-check.md.':
    'Chưa tìm thấy Python hoặc mô hình cục bộ. Xem hướng dẫn cấu hình trong docs/ai-check.md.',
  'Ảnh được xử lý trên máy này. Ngoài bất đồng nhãn/khung, AI chỉ ra đối tượng có thể chưa được gán nhãn (chỉ với các lớp đã xuất hiện trong dataset). Nhãn không thuộc bộ nhãn của model sẽ được bỏ qua. Nhãn gốc và kết quả kiểm tra bằng quy tắc được giữ nguyên.':
    'Ảnh được xử lý trên máy này. Ngoài bất đồng nhãn/khung, AI chỉ ra đối tượng có thể chưa được gán nhãn (chỉ với các lớp đã xuất hiện trong bộ dữ liệu). Nhãn không thuộc bộ nhãn của mô hình sẽ được bỏ qua. Nhãn gốc và kết quả kiểm tra bằng quy tắc được giữ nguyên.',
  'nhãn ngoài bộ nhãn model;': 'nhãn ngoài bộ nhãn của mô hình;',
  'Chỉ là gợi ý của model. Hãy đối chiếu ảnh rồi bấm Lưu đánh giá ảnh.':
    'Chỉ là gợi ý của mô hình. Hãy đối chiếu ảnh rồi bấm Lưu đánh giá ảnh.',
  'Kiểm tra dữ liệu từ người gán nhãn hoặc model. Mỗi cảnh báo có bằng chứng để bạn đối chiếu và quyết định.':
    'Kiểm tra dữ liệu từ người gán nhãn hoặc mô hình. Mỗi cảnh báo có bằng chứng để bạn đối chiếu và quyết định.',
  'Có hình học chưa hỗ trợ hiển thị (mask/cuboid). Chỉ xác nhận phần bạn đã kiểm tra được.':
    'Có hình học chưa hỗ trợ hiển thị (mặt nạ/khối hộp). Chỉ xác nhận phần bạn đã kiểm tra được.',
  'Kéo chuột bao quanh đối tượng chưa có box, hoặc thêm vùng rồi nhập tọa độ. Đây là ghi chú kiểm tra, không sửa annotation gốc.':
    'Kéo chuột bao quanh đối tượng chưa có khung, hoặc thêm vùng rồi nhập tọa độ. Đây là ghi chú kiểm tra, không sửa nhãn gốc.',
  'Đang tải các case và dữ liệu video…': 'Đang tải các trường hợp và dữ liệu…',
  '← → chuyển case': '← → chuyển trường hợp',
  'Tệp nén dataset (.zip)': 'Tệp nén bộ dữ liệu (.zip)',
  'Một tệp .zip chứa tệp nhãn, ảnh và (nếu có) CSV thông tin ảnh, guideline. Tệp được mở ngay trên trình duyệt; máy chủ chỉ nhận từng tệp bên trong.':
    'Một tệp .zip chứa tệp nhãn, ảnh và (nếu có) CSV thông tin ảnh, Guideline. Tệp được mở ngay trên trình duyệt; máy chủ chỉ nhận từng tệp bên trong.',
  'Chưa dùng. Đánh dấu mục Guideline/Policy bên dưới nếu muốn áp dụng.':
    'Chưa dùng. Đánh dấu mục Guideline / Policy bên dưới nếu muốn áp dụng.',
  'Độ tin cậy (confidence / score)': 'Độ tin cậy (confidence / score)',
  'Thêm Guideline / Policy mới': 'Thêm Guideline / Policy mới',
  'Chỉ đánh dấu khi dataset này có quy định gán nhãn riêng. Guideline quyết định các kiểm tra policy được hiểu thế nào, nên mặc định để trống và dùng policy có sẵn.':
    'Chỉ đánh dấu khi bộ dữ liệu này có quy định gán nhãn riêng. Guideline quyết định các kiểm tra Policy được hiểu thế nào, nên mặc định để trống và dùng Policy có sẵn.',
  'Tệp guideline / policy': 'Tệp Guideline / Policy',
  'Nội dung guideline / policy': 'Nội dung Guideline / Policy',
  'Ví dụ: xe bị che trên 50% không gán nhãn; người đi xe máy gán là person…':
    'Ví dụ: xe bị che trên 50% không gán nhãn; người đi xe máy gán là person…',
  'Guideline được lưu kèm dự án. Chỉ lựa chọn "Theo guideline" ở quy tắc Nới hơn làm đổi cách chấm: check tương ứng được tắt cho các lớp của quy tắc đó. Quy tắc Mới và Chặt hơn mới được ghi lại, chưa chạy. Không chọn gì thì chấm theo policy có sẵn.':
    'Guideline được lưu kèm dự án. Chỉ lựa chọn "Theo Guideline" ở quy tắc Nới hơn làm đổi cách chấm: kiểm tra tương ứng được tắt cho các lớp của quy tắc đó. Quy tắc Mới và Chặt hơn mới được ghi lại, chưa chạy. Không chọn gì thì chấm theo Policy có sẵn.',
  'Chọn tệp hoặc nhập nội dung guideline/policy, hoặc bỏ đánh dấu mục này.':
    'Chọn tệp hoặc nhập nội dung Guideline / Policy, hoặc bỏ đánh dấu mục này.',
  'Guideline/policy tối đa 10 MB.': 'Guideline / Policy tối đa 10 MB.',
  'Phân tích Guideline': 'Phân tích Guideline',
  'Gửi nội dung guideline tới mô hình ở backend (Gemini) để rút ra bản nháp quy tắc.':
    'Gửi nội dung Guideline tới mô hình ở máy chủ (Gemini) để rút ra bản nháp quy tắc.',
  'Chọn tệp hoặc dán nội dung guideline để phân tích.':
    'Chọn tệp hoặc dán nội dung Guideline để phân tích.',
  'Chỗ guideline mâu thuẫn hoặc mơ hồ (': 'Chỗ Guideline mâu thuẫn hoặc mơ hồ (',
  'Bị loại khi đối chiếu với guideline (': 'Bị loại khi đối chiếu với Guideline (',
  'Kiểm tra rules': 'Kiểm tra quy tắc',
  'Câu trích từ guideline': 'Câu trích từ Guideline',
  'Câu trích không có trong guideline': 'Câu trích không có trong Guideline',
  'Không nêu check bị thay': 'Không nêu kiểm tra bị thay',
  'So sánh với policy': 'So sánh với Policy',
  'Quy tắc từ guideline': 'Quy tắc từ Guideline',
  'Policy đang áp dụng': 'Policy đang áp dụng',
  'Theo guideline': 'Theo Guideline',
  'Giữ policy': 'Giữ Policy',
  'Tất cả theo guideline': 'Tất cả theo Guideline',
  'Tất cả giữ policy': 'Tất cả giữ Policy',
  'Guideline chưa nêu:': 'Guideline chưa nêu:',
  'Yêu cầu trong guideline': 'Yêu cầu trong Guideline',
  'Đặt quy tắc rút từ guideline cạnh quy tắc policy đang chạy trong công cụ, rồi chọn bên nào nên dùng.':
    'Đặt quy tắc rút từ Guideline cạnh quy tắc Policy đang chạy trong công cụ, rồi chọn bên nào nên dùng.',
  'quy tắc so được với policy ·': 'quy tắc so được với Policy ·',
  'Phân tích guideline': 'Phân tích Guideline',
  // Roles: swapping single terms would read badly here.
  'Project chưa có dữ liệu. Leader cần import dataset trước khi bạn làm việc.':
    'Dự án chưa có dữ liệu. Leader cần nhập bộ dữ liệu trước khi bạn làm việc.',
  'Chỉ Leader của project được thực hiện thao tác này.':
    'Chỉ Leader của dự án được thực hiện thao tác này.',
  'Bạn đã là Reviewer của project này. Leader có thể đổi vai trò cho bạn.':
    'Bạn đã là Reviewer của dự án này. Leader có thể đổi vai trò cho bạn.',
  'Bạn đã là Annotator của project này. Leader có thể đổi vai trò cho bạn.':
    'Bạn đã là Annotator của dự án này. Leader có thể đổi vai trò cho bạn.',
  // API messages where swapping single terms would read badly.
  'Project metadata quá lớn.': 'Thông tin dự án quá lớn.',
  'Annotation extension không khớp format.': 'Phần mở rộng của tệp nhãn không khớp định dạng.',
  'Quá nhiều upload parts.': 'Tải lên quá nhiều phần.',
  'Review đã tồn tại. Tải lại quyết định rồi chỉnh sửa.':
    'Đánh giá đã tồn tại. Tải lại quyết định rồi chỉnh sửa.',
  'Review chưa tồn tại.': 'Đánh giá chưa tồn tại.',
  'Review đã được chỉnh sửa ở nơi khác. Tải lại quyết định.':
    'Đánh giá đã được chỉnh sửa ở nơi khác. Tải lại quyết định.',
  'Project chưa READY. Xem trạng thái import.': 'Dự án chưa sẵn sàng. Xem trạng thái nhập dữ liệu.',
  'Project đang import hoặc đã READY. Tạo project mới cho dataset khác.':
    'Dự án đang nhập dữ liệu hoặc đã sẵn sàng. Tạo dự án mới cho bộ dữ liệu khác.',
  'Project này chỉ có dữ liệu trên máy đã import. Chạy npm run storage:push trên máy đó để chia sẻ.':
    'Dự án này chỉ có dữ liệu trên máy đã nhập. Chạy npm run storage:push trên máy đó để chia sẻ.',
  'Annotation, metadata và guideline tối đa 10 MB mỗi file.':
    'Tệp nhãn, metadata và guideline tối đa 10 MB mỗi tệp.',
  'Tối đa 100 ảnh, một annotation file, một metadata file và một guideline.':
    'Tối đa 100 ảnh, một tệp nhãn, một tệp metadata và một guideline.',
  'Gửi mã cho người cần tham gia; họ tự nhập mã ở trang Projects. Mã dùng được nhiều lần và quyết định vai trò.':
    'Gửi mã cho người cần tham gia; họ tự nhập mã ở trang Dự án. Mã dùng được nhiều lần và quyết định vai trò.',
  'Tài khoản này đã là Reviewer của project. Đổi vai trò trong danh sách thành viên.':
    'Tài khoản này đã là Reviewer của dự án. Đổi vai trò trong danh sách thành viên.',
  'Tài khoản này đã là Annotator của project. Đổi vai trò trong danh sách thành viên.':
    'Tài khoản này đã là Annotator của dự án. Đổi vai trò trong danh sách thành viên.',
};
