// English for every Vietnamese string the UI renders, keyed by the source text exactly as
// written in the components. Strings missing here stay Vietnamese in English mode.
export const en: Record<string, string> = {
  // Shared
  'Dataset đã thay đổi. Tải lại trang.': 'The dataset changed. Reload the page.',
  'Dataset chưa tải xong.': 'The dataset has not finished loading.',
  'Đang tải các case và dữ liệu video…': 'Loading cases and video data…',
  'Chưa kết nối được dữ liệu': 'Could not connect to the data',
  'Thử lại': 'Retry',
  'Metrics từ MySQL · suspicious cases của dataset hiện tại · không đổi theo bộ lọc hàng đợi.':
    'Metrics from MySQL · suspicious cases of the current dataset · not affected by queue filters.',
  Cao: 'High',
  'Trung bình': 'Medium',
  Thấp: 'Low',
  'Chuyển sang giao diện sáng': 'Switch to light theme',
  'Chuyển sang giao diện tối': 'Switch to dark theme',
  'Đang đăng xuất…': 'Signing out…',
  'Đăng xuất': 'Sign out',
  'Đang kiểm tra phiên đăng nhập…': 'Checking your session…',
  'SmartReview — Tổng quan': 'SmartReview — Overview',
  'Điều hướng chính': 'Main navigation',
  'Tổng quan': 'Overview',
  'Dữ liệu sẵn sàng': 'Data ready',
  'Chưa kết nối': 'Not connected',
  'Đang kết nối': 'Connecting',
  'Dataset đã thay đổi khi tải. Hãy thử lại.': 'The dataset changed while loading. Try again.',
  'Trang này không tồn tại.': 'This page does not exist.',
  'Về tổng quan': 'Back to overview',

  // Whole-frame viewer
  'Hiện tên đối tượng': 'Show object names',
  'Không tải được ảnh. Tải lại trang để thử lại.':
    'The image failed to load. Reload the page to retry.',
  'Frame này chưa có ảnh. Chưa thể xác nhận đã kiểm tra.':
    'This frame has no image, so it cannot be marked as checked yet.',
  'Đang tải ảnh…': 'Loading image…',
  'Vùng đang vẽ': 'Region being drawn',
  'Khung xanh liền: annotation gốc · Khung đỏ nét đứt: vùng thiếu do bạn đánh dấu':
    'Solid green box: original annotation · Dashed red box: missing region you marked',
  '· Khung tím chấm: AI gợi ý có thể thiếu nhãn':
    '· Dotted purple box: AI suggests a missing label',

  // Projects and import
  'Project đã xóa. Một số file chờ dọn trong storage/.trash; kiểm tra quyền thư mục trên máy chủ.':
    'Project deleted. Some files are waiting for cleanup in storage/.trash; check folder permissions on the server.',
  'Đang xóa…': 'Deleting…',
  'Xóa project': 'Delete project',
  'Chọn annotation file và các ảnh tương ứng.': 'Choose the annotation file and its images.',
  'Vượt giới hạn: annotation 10 MB; mỗi ảnh 20 MB; tổng 200 MB; tối đa 1000 ảnh.':
    'Over the limit: annotation 10 MB; 20 MB per image; 200 MB in total; at most 1000 images.',
  'Đang tạo project…': 'Creating project…',
  'Đang tải dữ liệu lên…': 'Uploading data…',
  'Đã tải lên. Đang kiểm tra và phân tích dataset…':
    'Uploaded. Validating and analysing the dataset…',
  'Kết nối bị ngắt. Mở project để xem trạng thái trước khi thử lại.':
    'The connection dropped. Open the project to see its status before retrying.',
  'Phản hồi import không hợp lệ.': 'The import response was invalid.',
  'Chọn COCO JSON chứa images, categories, annotations và bbox [x, y, width, height], cùng tất cả ảnh được khai báo. Chỉ kiểm tra bbox; segmentation/keypoints được giữ trong metadata, không dùng để kiểm tra. Không nhận COCO prediction hoặc panoptic.':
    'Choose a COCO JSON with images, categories, annotations and bbox [x, y, width, height], plus every image it declares. Only bboxes are checked; segmentation/keypoints are kept in metadata and not used for checks. COCO prediction and panoptic files are not accepted.',
  'Dataset đã có annotation, không cần chạy model. Hỗ trợ ảnh PNG, JPEG, WebP, GIF; box, polygon và polyline từ CVAT images. Video/ZIP/SVG và CVAT tracks chưa được hỗ trợ qua upload.':
    'The dataset is already annotated, so no model run is needed. Supports PNG, JPEG, WebP and GIF images; boxes, polygons and polylines from CVAT images. Video/ZIP/SVG and CVAT tracks are not supported through upload yet.',
  'File như images.csv: mỗi ảnh một dòng, có cột file_name và env_risk (0–1).':
    'A file like images.csv: one row per image, with file_name and env_risk (0–1) columns.',
  'Dataset có thư mục ảnh con?': 'Does the dataset have image subfolders?',
  'Chọn thư mục chứa ảnh thay cho lựa chọn trên. Đường dẫn cần khớp annotation; tên file đơn chỉ được ghép khi duy nhất.':
    'Choose the image folder instead of the selection above. Paths must match the annotation; bare file names are matched only when unique.',
  'Đã chọn': 'Selected',
  'ảnh · tối đa 1000 ảnh / 200 MB tổng; 20 MB mỗi ảnh; annotation 10 MB.':
    'images · at most 1000 images / 200 MB in total; 20 MB per image; annotation 10 MB.',
  'Đang xử lý…': 'Processing…',
  'Dữ liệu đã tải lên': 'Data uploaded',
  'Tiến độ tải dữ liệu lên': 'Upload progress',
  'Giữ trang mở đến khi hoàn tất. Sau khi tải lên, hệ thống cần thêm thời gian để kiểm tra và phân tích.':
    'Keep this page open until it finishes. After the upload, validation and analysis take some more time.',
  'Project đã được giữ lại. Bạn có thể chọn lại file và thử import.':
    'The project was kept. You can choose the files again and retry the import.',
  'Chờ upload': 'Waiting for upload',
  'Đang nhận files…': 'Receiving files…',
  'Đang kiểm tra annotations…': 'Validating annotations…',
  'Đang chuẩn hóa…': 'Normalising…',
  'Đang chạy QA checks…': 'Running QA checks…',
  'Tạo project → upload → validate → QA checks → review.':
    'Create project → upload → validate → QA checks → review.',
  'Đang tải project…': 'Loading project…',
  'Đang xử lý dataset. Trạng thái tự cập nhật; bạn có thể quay lại Projects.':
    'Processing the dataset. The status updates by itself; you can go back to Projects.',
  'Đang tải thống kê…': 'Loading statistics…',
  'Kiểm tra toàn bộ ảnh →': 'Review every image →',
  'Không có cảnh báo. Trong Review, chọn Tất cả annotations để kiểm tra thủ công.':
    'No warnings. In Review, choose All annotations to check manually.',
  '· Quyết định được lưu riêng cho project này.': '· Decisions are stored for this project only.',
  'Import dữ liệu đã gán nhãn, kiểm tra chất lượng và lưu quyết định review.':
    'Import labelled data, check its quality and store review decisions.',
  'Đang tải projects…': 'Loading projects…',
  'Chưa có project. Chọn + New Project để bắt đầu.':
    'No projects yet. Choose + New Project to start.',

  // Review workspace
  Trước: 'Previous',
  'Hiện tại': 'Current',
  Sau: 'Next',
  'Dataset hoặc frame đã thay đổi. Tải lại trang.':
    'The dataset or frame changed. Reload the page.',
  'Đã sao chép thông tin.': 'Details copied.',
  'Không sao chép được. Dùng thông tin annotation hiển thị bên dưới.':
    'Could not copy. Use the annotation details shown below.',
  'Chi tiết': 'Details',
  'Case trước': 'Previous case',
  'Case tiếp theo': 'Next case',
  'Annotation hiển thị': 'Annotations shown',
  'Toàn cảnh': 'Full frame',
  'Phóng to vật thể': 'Zoom to object',
  'So sánh ảnh gốc': 'Compare with original',
  'Sao chép thông tin': 'Copy details',
  'Ảnh gốc': 'Original',
  'Có nhãn': 'Labelled',
  ': không có observation.': ': no observation.',
  '← → chuyển case': '← → change case',
  '1 2 3 chọn quyết định': '1 2 3 choose a decision',
  'Ctrl + Enter lưu và sang case tiếp': 'Ctrl + Enter save and go to the next case',
  'Annotation đơn lẻ.': 'Single annotation.',
  'Không có track ID; các kiểm tra temporal được bỏ qua.':
    'No track ID; temporal checks are skipped.',
  'Chưa có observation lân cận cho track này.': 'This track has no neighbouring observations yet.',
  'Bằng chứng và quyết định review': 'Evidence and review decision',
  'Không tải được toàn bộ annotation:': 'Could not load all annotations:',
  'Đang hiển thị annotation đang xem.': 'Showing only the annotation under review.',
  'Tải lại annotations': 'Reload annotations',
  'Không tìm thấy annotation đang xem trong danh sách frame; đang dùng dữ liệu từ Risk Case.':
    'The annotation under review is not in the frame list; using the data from the Risk Case.',
  'Thông tin case': 'Case information',
  'AI Check (Kiểm tra bằng AI) · Điểm ưu tiên': 'AI Check · Priority score',
  '· Độ tin cậy': '· Confidence',
  '% · IoU (Độ trùng khớp)': '% · IoU',
  'Khung xanh nét đứt là đề xuất AI. Risk bên dưới là điểm kiểm tra bằng quy tắc riêng.':
    'The dashed blue box is the AI proposal. The Risk below is a separate rule-based score.',
  'tín hiệu · điểm cộng dồn, tối đa 100': 'signals · scores add up, capped at 100',
  'Evidence · số liệu': 'Evidence · figures',
  'Chưa phát hiện bất thường trong các check hiện có.': 'No anomaly found by the current checks.',
  'Check coverage · đã chạy / bỏ qua': 'Check coverage · ran / skipped',
  'Đang tải annotation của frame…': 'Loading the frame’s annotations…',
  '· Đang review': '· Under review',
  'đang xem, không phải annotation đang review': 'inspecting; not the annotation under review',
  'Danh sách risk cases': 'Risk case list',
  'Hàng đợi kiểm tra': 'Review queue',
  'Tìm frame, track hoặc class': 'Search frame, track or class',
  'Phạm vi review': 'Review scope',
  'Tất cả annotations': 'All annotations',
  'Lọc trạng thái review': 'Filter by review status',
  'Mọi trạng thái review': 'Any review status',
  'Lọc mức risk': 'Filter by risk level',
  'Mọi severity': 'Any severity',
  'Sắp xếp case': 'Sort cases',
  'Không có case khớp bộ lọc.': 'No case matches the filters.',
  'Xóa bộ lọc': 'Clear filters',
  'Thu phóng ảnh': 'Image zoom',
  'Thu nhỏ ảnh': 'Zoom out',
  'Mức thu phóng': 'Zoom level',
  'Phóng to ảnh': 'Zoom in',
  'Đặt lại zoom': 'Reset zoom',
  'Không tải được ảnh. Hãy tải lại trang.': 'The image failed to load. Reload the page.',
  'Chưa có ảnh cho frame này.': 'This frame has no image yet.',
  'Đang tải frame…': 'Loading frame…',
  'Chưa có overlay cho': 'No overlay yet for',
  '; dữ liệu đã được giữ nguyên.': '; the data is kept unchanged.',
  'Đã lưu vào MySQL. Metrics chưa tải được; bấm Tải lại quyết định để cập nhật.':
    'Saved to MySQL. Metrics could not be loaded; press Reload decision to update.',
  'Đã lưu vào MySQL.': 'Saved to MySQL.',
  'Đã tải lại quyết định từ MySQL.': 'Decision reloaded from MySQL.',
  'Quyết định': 'Decision',
  'chưa review': 'not reviewed',
  'Quyết định review': 'Review decision',
  'Đang lưu…': 'Saving…',
  'Lưu & tiếp →': 'Save & next →',
  'Tải lại quyết định': 'Reload decision',
  'Không tìm thấy case này': 'Case not found',
  'Không có case để hiển thị': 'No case to show',
  'Case có thể đã thay đổi sau khi chạy lại Risk Engine.':
    'The case may have changed after the Risk Engine ran again.',
  'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.': 'Try changing the filters or the search text.',
  'Về hàng đợi review': 'Back to the review queue',
  'Dataset đã thay đổi. Tải lại trang trước khi lưu.':
    'The dataset changed. Reload the page before saving.',
  'Chọn Correct, Error hoặc Unsure.': 'Choose Correct, Error or Unsure.',
  'Chọn loại lỗi annotation.': 'Choose the annotation error type.',
  'Nhập Correct Label cho lỗi Class.': 'Enter the Correct Label for a Class error.',
  'Correction và error type chỉ dùng cho Annotation Error.':
    'Correction and error type apply to Annotation Error only.',

  'Ẩn hoặc hiện hàng đợi': 'Show or hide the queue',
  'Ẩn hoặc hiện ngữ cảnh': 'Show or hide the context strip',
  'Ẩn hoặc hiện bảng thông tin': 'Show or hide the info panel',
  'Tập trung': 'Focus',
  'Hiện hàng đợi': 'Show the queue',
  'Hiện bảng thông tin': 'Show the info panel',
  'Hiện ngữ cảnh': 'Show the context strip',
  'tín hiệu': 'signals',
  '[ ] \\ ẩn hiện khung · F tập trung': '[ ] \\ show or hide panels · F focus',

  'Gom hàng đợi': 'Queue grouping',
  'Theo ảnh': 'By image',
  'Theo lỗi': 'By case',
  'Cao nhất': 'Highest',
  'đã xem': 'reviewed',
  'trong ảnh': 'in image',
  'trong ảnh này': 'in this image',
  'Xem cả ảnh': 'Whole image',
  'Quyết định ngay trên từng thẻ. Lỗi gán nhãn cần nhập chi tiết nên sẽ mở riêng mục đó.':
    'Decide right on each card. An annotation error needs details, so it opens that case on its own.',
  'Nhãn đúng': 'Correct',
  'Lỗi gán nhãn…': 'Annotation error…',
  'Chưa chắc': 'Unsure',
  'còn lại: nhãn đúng': 'remaining: mark correct',
  'Sang ảnh kế →': 'Next image →',
  '← → chuyển case · ↑ ↓ chuyển ảnh · A xem cả ảnh':
    '← → change case · ↑ ↓ change image · A whole image',

  // AI Check
  '← Về dự án': '← Back to project',
  'AI Check (Kiểm tra bằng AI)': 'AI Check',
  'Đối chiếu nhãn và khung bao với model cục bộ. Gợi ý cần người kiểm tra xác nhận.':
    'Compares labels and boxes with a local model. Suggestions need a reviewer to confirm them.',
  'Đang kiểm tra…': 'Checking…',
  'Đang bắt đầu…': 'Starting…',
  'Chạy lại AI Check': 'Run AI Check again',
  'Bắt đầu AI Check': 'Start AI Check',
  'Tải lại': 'Reload',
  'Đang tải trạng thái AI…': 'Loading AI status…',
  'Chưa tìm thấy Python hoặc model cục bộ. Xem hướng dẫn cấu hình trong docs/ai-check.md.':
    'Python or the local model was not found. See the setup guide in docs/ai-check.md.',
  'Tìm bất đồng về loại đối tượng và vị trí khung bao':
    'Find disagreements on object class and box position',
  'Ảnh được xử lý trên máy này. Ngoài bất đồng nhãn/khung, AI chỉ ra đối tượng có thể chưa được gán nhãn (chỉ với các lớp đã xuất hiện trong dataset). Nhãn không thuộc bộ nhãn của model sẽ được bỏ qua. Nhãn gốc và kết quả kiểm tra bằng quy tắc được giữ nguyên.':
    'Images are processed on this machine. Besides label/box disagreements, the AI points out objects that may be unlabelled (only for classes already present in the dataset). Labels outside the model’s label set are skipped. Original labels and rule-based results are left unchanged.',
  'Đã xử lý': 'Processed',
  'ảnh. Bạn có thể rời trang rồi quay lại.': 'images. You can leave this page and come back.',
  'gợi ý cần kiểm tra': 'suggestions to check',
  'ảnh đã xử lý': 'images processed',
  'nhãn ghép được với AI': 'labels matched with the AI',
  '· CPU · Confidence (Độ tin cậy) ≥': '· CPU · Confidence ≥',
  '% · IoU (Độ trùng khớp khung) ≥': '% · IoU ≥',
  'để so nhãn; từ': 'to compare labels; from',
  'đến dưới': 'to below',
  'để gợi ý lệch khung cùng nhãn.': 'to suggest a shifted box with the same label.',
  'Bỏ qua:': 'Skipped:',
  'nhãn ngoài bộ nhãn model;': 'labels outside the model’s label set;',
  'hình học chưa hỗ trợ;': 'unsupported geometry;',
  'nhãn không ghép được;': 'labels that could not be matched;',
  'frame (khung hình) không có ảnh phù hợp.': 'frames without a usable image.',
  'Lọc gợi ý': 'Filter suggestions',
  'Tất cả': 'All',
  'Bất đồng nhãn': 'Label disagreement',
  'Bất đồng khung bao': 'Box disagreement',
  'Có thể thiếu nhãn': 'Possibly missing label',
  'Không có gợi ý phù hợp. Điều này không xác nhận toàn bộ annotation đều đúng.':
    'No matching suggestions. This does not confirm that every annotation is correct.',
  'Danh sách gợi ý AI': 'AI suggestion list',
  'Điểm ưu tiên': 'Priority score',
  '← Trước': '← Previous',
  'Khung liền: annotation hiện tại': 'Solid box: current annotation',
  'Khung xám: annotation đang có trong ảnh': 'Grey box: annotations already in the image',
  'Khung xanh nét đứt: AI đề xuất': 'Dashed blue box: AI proposal',
  'Hiện khung AI': 'Show AI box',
  'Why Flagged (Lý do cảnh báo)': 'Why Flagged',
  'Confidence (Độ tin cậy AI):': 'AI confidence:',
  '· IoU (Độ trùng khớp):': '· IoU:',
  'Điểm ưu tiên là quy tắc xếp hàng, không phải xác suất nhãn sai. Hãy đối chiếu ảnh trước khi lưu quyết định.':
    'The priority score is a queueing rule, not the probability that the label is wrong. Check the image before saving a decision.',
  'Mở annotation để lưu đánh giá →': 'Open the annotation to save a review →',
  'Mở ảnh để đánh dấu vùng thiếu →': 'Open the image to mark the missing region →',

  // Annotation home
  'Không gian gán nhãn': 'Annotation workspace',
  'Chức năng annotation sẽ sớm được bổ sung': 'Annotation features are coming soon',
  'Đây là không gian làm việc dành cho người gán nhãn. Công cụ và danh sách công việc sẽ xuất hiện tại đây khi sẵn sàng.':
    'This is the workspace for annotators. Tools and task lists will appear here when they are ready.',

  // Frame review
  'Đang tải danh sách ảnh…': 'Loading the image list…',
  'Kiểm tra theo ảnh ·': 'Review by image ·',
  'Xem đủ đối tượng trong từng ảnh, đánh dấu vùng thiếu và lưu kết quả kiểm tra.':
    'Check every object in each image, mark missing regions and save the result.',
  'Tổng ảnh / frame': 'Total images / frames',
  'Đã kiểm tra': 'Checked',
  'Chưa hoàn tất': 'Not finished',
  'Vùng thiếu đã lưu': 'Saved missing regions',
  'Đã kiểm tra nghĩa là bạn đã xem xong ảnh, không có nghĩa ảnh không có lỗi. Có ảnh để xem:':
    'Checked means you finished looking at the image, not that it has no errors. Images available:',
  'Tìm ảnh': 'Search images',
  'Lọc ảnh': 'Filter images',
  'Tất cả ảnh': 'All images',
  'Chưa có annotation': 'No annotations',
  'Có vùng thiếu đã lưu': 'Has saved missing regions',
  'ảnh phù hợp': 'matching images',
  'nhãn ·': 'labels ·',
  'Đang kiểm tra': 'In progress',
  'Chưa kiểm tra': 'Not checked',
  '· Chưa có ảnh': '· No image',
  'Không tìm thấy ảnh này.': 'Image not found.',
  'Không có ảnh phù hợp.': 'No matching images.',
  'Tối đa 50 vùng mỗi ảnh.': 'At most 50 regions per image.',
  'AI gợi ý': 'AI suggestion',
  'Đã lưu đánh giá ảnh.': 'Image review saved.',
  'Đang tải ảnh và annotation…': 'Loading image and annotations…',
  'Thay đổi chưa lưu': 'Unsaved changes',
  'Có thay đổi chưa lưu. Rời ảnh sẽ bỏ các thay đổi này.':
    'There are unsaved changes. Leaving this image discards them.',
  'Ở lại để lưu': 'Stay and save',
  'Bỏ thay đổi và rời ảnh': 'Discard changes and leave',
  '← Ảnh trước': '← Previous image',
  'Ảnh sau →': 'Next image →',
  'Gợi ý thiếu nhãn từ AI': 'AI missing-label suggestions',
  'đối tượng có thể chưa có nhãn': 'objects that may be unlabelled',
  'Thêm thành vùng thiếu': 'Add as missing region',
  'Bỏ qua': 'Dismiss',
  'Chỉ là gợi ý của model. Hãy đối chiếu ảnh rồi bấm Lưu đánh giá ảnh.':
    'This is only a model suggestion. Check the image, then press Save image review.',
  'Ảnh chưa có annotation. Nếu có đối tượng cần gán nhãn, hãy đánh dấu vùng thiếu.':
    'This image has no annotations. If it contains objects that need labels, mark the missing regions.',
  'Có hình học chưa hỗ trợ hiển thị (mask/cuboid). Chỉ xác nhận phần bạn đã kiểm tra được.':
    'Some geometry cannot be displayed (mask/cuboid). Confirm only what you were able to check.',
  'Annotation (Nhãn hiện có)': 'Annotations',
  'Chọn khung trên ảnh hoặc trong danh sách': 'Select a box on the image or in the list',
  'Đánh giá nhãn / khung đã có →': 'Review the existing label / box →',
  'Missing Object (Thiếu đối tượng)': 'Missing Object',
  'Kéo chuột bao quanh đối tượng chưa có box, hoặc thêm vùng rồi nhập tọa độ. Đây là ghi chú kiểm tra, không sửa annotation gốc.':
    'Drag around an object that has no box, or add a region and type its coordinates. This is a review note; it does not edit the original annotation.',
  'Dừng vẽ vùng thiếu': 'Stop drawing',
  'Vẽ vùng thiếu': 'Draw missing region',
  'Thêm vùng bằng tọa độ': 'Add region by coordinates',
  'Kéo chuột từ một góc đến góc đối diện của đối tượng trên ảnh.':
    'Drag from one corner of the object to the opposite corner.',
  'Vùng thiếu': 'Missing region',
  'Xóa vùng': 'Delete region',
  'Tên đối tượng (không bắt buộc)': 'Object name (optional)',
  Rộng: 'Width',
  'Ghi chú vùng': 'Region note',
  'Ghi chú ảnh': 'Image note',
  'Trạng thái kiểm tra': 'Review status',
  'Đang kiểm tra / chưa chắc': 'In progress / unsure',
  'Đã kiểm tra xong ảnh': 'Image fully checked',
  'Lưu đánh giá ảnh': 'Save image review',
  'Có thay đổi chưa lưu': 'Unsaved changes',
  'Bỏ thay đổi chưa lưu và tải lại bản đã lưu?':
    'Discard unsaved changes and reload the saved version?',
  'Tải lại bản đã lưu': 'Reload saved version',

  // Sign in and registration
  'Đăng nhập': 'Sign in',
  'Chưa có tài khoản?': 'No account yet?',
  'Đăng ký': 'Register',
  'Đã tạo tài khoản': 'Account created',
  'Kết nối lại': 'Reconnect',
  'Tên đăng nhập': 'Username',
  'Nhập tên đăng nhập.': 'Enter your username.',
  'Mật khẩu': 'Password',
  'Nhập mật khẩu.': 'Enter your password.',
  'Đang đăng nhập…': 'Signing in…',
  'Tên đăng nhập gồm 3–64 ký tự: chữ, số, dấu _ . hoặc -':
    'Usernames have 3–64 characters: letters, digits, _ . or -',
  'Mật khẩu cần ít nhất 12 ký tự.': 'Passwords need at least 12 characters.',
  'Tạo tài khoản': 'Create account',
  'Đã có tài khoản?': 'Already have an account?',
  'Máy chủ chưa mở chức năng đăng ký.': 'The server has not enabled registration.',
  'Xác nhận mật khẩu': 'Confirm password',
  'Nhập lại mật khẩu.': 'Enter the password again.',
  'Mật khẩu xác nhận không khớp.': 'The passwords do not match.',
  'Đang tạo tài khoản…': 'Creating account…',

  // Overview
  'Chất lượng annotation, trong một workspace.': 'Annotation quality, in one workspace.',
  'Kiểm tra dữ liệu từ người gán nhãn hoặc model. Mỗi cảnh báo có bằng chứng để bạn đối chiếu và quyết định.':
    'Review data from annotators or models. Every warning comes with evidence for you to check and decide.',
  'Bắt đầu review': 'Start review',
  'Cần bạn kiểm tra': 'Needs your review',
  'Xem tất cả →': 'See all →',
  'Không có suspicious case trong các check hiện tại.': 'No suspicious case in the current checks.',
  'Xem tất cả annotations': 'See all annotations',
  'Mức bao phủ kiểm tra. Thiếu confidence hoặc track không đồng nghĩa annotation có lỗi.':
    'Check coverage. A missing confidence or track does not mean the annotation is wrong.',
  'Lý do bỏ qua': 'Skip reason',
};

// Strings built with values in them. Tried only when there is no exact entry above.
export const enRules: [RegExp, string][] = [
  [/^Trước: frame (.+)$/, 'Previous: frame $1'],
  [/^Hiện tại: frame (.+)$/, 'Current: frame $1'],
  [/^Sau: frame (.+)$/, 'Next: frame $1'],
  [/^hiện tại: (.+)$/, 'current: $1'],
  [/^Ẩn (.+)$/, 'Hide $1'],
  [/^Hiện (.+)$/, 'Show $1'],
  [
    /^Ảnh (.+): (\d+) annotation, (\d+) vùng thiếu$/,
    'Image $1: $2 annotations, $3 missing regions',
  ],
  [/^Chưa có nhãn · AI: (.+)$/, 'No label · AI: $1'],
  [
    /^(\d+) ảnh có mask\/3D nên không dò thiếu nhãn\.$/,
    '$1 images have masks/3D, so missing labels were not searched.',
  ],
  [
    /^Không kết nối được dịch vụ dữ liệu \(HTTP (\d+)\)\. Kiểm tra backend rồi thử lại\.$/,
    'Could not reach the data service (HTTP $1). Check the backend and try again.',
  ],
  [
    /^Dịch vụ trả về dữ liệu không hợp lệ \(HTTP (\d+)\)\. Hãy thử lại\.$/,
    'The service returned invalid data (HTTP $1). Try again.',
  ],
];
