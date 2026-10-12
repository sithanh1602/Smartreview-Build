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
  'Dataset đã có annotation, không cần chạy model. Hỗ trợ ảnh PNG, JPEG, WebP, GIF; box, polygon và polyline từ CVAT images. Video/SVG và CVAT tracks chưa được hỗ trợ qua upload.':
    'The dataset is already annotated, so no model run is needed. Supports PNG, JPEG, WebP and GIF images; boxes, polygons and polylines from CVAT images. Video/SVG and CVAT tracks are not supported through upload yet.',
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
  'So sánh với': 'Compare with',
  'Ảnh có nhãn': 'Labelled image',
  'Đặt ảnh gốc, không có nhãn, bên cạnh. Bấm lần nữa để tắt.':
    'Put the original, without labels, alongside. Press again to turn off.',
  'Đặt ảnh chỉ có nhãn đã gán, chưa có đánh giá của SmartReview, bên cạnh. Bấm lần nữa để tắt.':
    'Put the image with only its imported labels, without SmartReview’s assessment, alongside. Press again to turn off.',
  'Đánh giá của SmartReview': 'SmartReview’s assessment',
  'không nhãn': 'no labels',
  'chưa có đánh giá của tool': 'no assessment from the tool',
  'Sao chép thông tin case để dán vào ghi chú hoặc tin nhắn':
    'Copy the case details to paste into a note or message',
  'Ẩn hoặc hiện hàng đợi ( [ )': 'Show or hide the queue ( [ )',
  'Ẩn hoặc hiện ngữ cảnh ( \\ )': 'Show or hide the context ( \\ )',
  'Ẩn hoặc hiện bảng thông tin ( ] )': 'Show or hide the info panel ( ] )',
  'Tập trung: ẩn hết các khung, chỉ còn ảnh (F)': 'Focus: hide every panel, image only (F)',
  'Sao chép thông tin': 'Copy details',
  'Ảnh gốc': 'Original',
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
  'Nguồn dữ liệu': 'Data source',
  'Tệp rời': 'Separate files',
  'Tệp nén (.zip)': 'Archive (.zip)',
  'Một tệp .zip chứa tệp nhãn, ảnh và (nếu có) CSV thông tin ảnh, guideline. Tệp được mở ngay trên trình duyệt; máy chủ chỉ nhận từng tệp bên trong.':
    'One .zip holding the annotation file, the images and, if any, the image metadata CSV and a guideline. It is opened in the browser; the server only receives the files inside.',
  'Chọn riêng tệp nhãn, ảnh và (nếu có) CSV thông tin ảnh.':
    'Choose the annotation file, the images and, if any, the image metadata CSV separately.',
  'Tự nhận diện từ tệp nhãn trong tệp nén.': 'Detected from the annotation file in the archive.',
  'Tệp nén dataset (.zip)': 'Dataset archive (.zip)',
  'Đang đọc tệp nén…': 'Reading the archive…',
  'Tìm thấy trong tệp nén': 'Found in the archive',
  'Tệp nhãn trong tệp nén': 'Annotation file in the archive',
  nhãn: 'annotations',
  'ảnh khớp tệp nhãn ·': 'images match the annotation file ·',
  'ảnh không được tệp nhãn nhắc tới sẽ bị bỏ qua.':
    'images not named by the annotation file will be skipped.',
  'CSV thông tin ảnh': 'Image metadata CSV',
  'Có (file_name, env_risk)': 'Yes (file_name, env_risk)',
  'Không có': 'None',
  'Chưa dùng. Đánh dấu mục Guideline/Policy bên dưới nếu muốn áp dụng.':
    'Not used. Tick Guideline/Policy below to attach it.',
  Thiếu: 'Missing',
  'ảnh (không có trong tệp nén hoặc trùng tên ở nhiều thư mục):':
    'images (not in the archive, or the same name in several folders):',
  'Tệp này có dạng': 'This file looks like',
  ', khác định dạng đang chọn.': ', not the selected format.',
  'Đổi định dạng': 'Switch format',
  'Trường nhận diện được': 'Detected fields',
  'Tìm ở mọi tầng của từng nhãn (tối đa 4 tầng); trường gần nhãn nhất được dùng.':
    'Searched at every level of each annotation (up to 4 levels deep); the field nearest the annotation is used.',
  'Độ tin cậy (confidence / score)': 'Confidence (confidence / score)',
  'Lớp xếp thứ hai (top-2)': 'Runner-up class (top-2)',
  'Điểm của lớp thứ hai': 'Runner-up score',
  'Rủi ro môi trường (env_risk)': 'Environment risk (env_risk)',
  'Lấy từ CSV thông tin ảnh': 'Taken from the image metadata CSV',
  'Không tìm thấy': 'Not found',
  'Không có độ tin cậy thì các kiểm tra dựa trên điểm số sẽ không chạy; các kiểm tra hình học và nhãn vẫn chạy.':
    'Without confidence the score-based checks do not run; geometry and label checks still do.',
  'Thêm Guideline / Policy mới': 'Add a new Guideline / Policy',
  'Chỉ đánh dấu khi dataset này có quy định gán nhãn riêng. Guideline quyết định các kiểm tra policy được hiểu thế nào, nên mặc định để trống và dùng policy có sẵn.':
    'Tick only when this dataset has its own labelling rules. The guideline decides how the policy checks are read, so it is off by default and the built-in policy is used.',
  'Tệp guideline / policy': 'Guideline / policy file',
  'Markdown, TXT, DOCX, PDF hoặc JSON · tối đa 10 MB.':
    'Markdown, TXT, DOCX, PDF or JSON · up to 10 MB.',
  'Hoặc dán nội dung': 'Or paste the text',
  'Nội dung guideline / policy': 'Guideline / policy text',
  'Ví dụ: xe bị che trên 50% không gán nhãn; người đi xe máy gán là person…':
    'Example: vehicles more than 50% occluded are not labelled; motorcycle riders are labelled person…',
  'Guideline được lưu kèm dự án. Chỉ lựa chọn "Theo guideline" ở quy tắc Nới hơn làm đổi cách chấm: check tương ứng được tắt cho các lớp của quy tắc đó. Quy tắc Mới và Chặt hơn mới được ghi lại, chưa chạy. Không chọn gì thì chấm theo policy có sẵn.':
    'The guideline is stored with the project. Only choosing "Follow guideline" on a Looser rule changes scoring: the matching check is switched off for that rule\'s classes. New and Stricter rules are recorded but do not run yet. With nothing chosen, the built-in policy applies.',
  'Chọn tệp nén chứa tệp nhãn và ảnh.': 'Choose an archive holding the annotation file and images.',
  'Tệp nén thiếu ảnh mà tệp nhãn tham chiếu. Bổ sung ảnh rồi chọn lại tệp nén.':
    'The archive lacks images the annotation file refers to. Add them and choose the archive again.',
  'Chọn tệp hoặc nhập nội dung guideline/policy, hoặc bỏ đánh dấu mục này.':
    'Choose a file or enter the guideline/policy text, or untick this section.',
  'Guideline/policy tối đa 10 MB.': 'Guideline/policy is limited to 10 MB.',
  'Đang giải nén ảnh…': 'Unpacking images…',
  'Tệp không phải ZIP hợp lệ.': 'Not a valid ZIP file.',
  'Tệp nén không có tệp nhãn CVAT XML, COCO JSON hoặc SmartReview JSON.':
    'The archive has no CVAT XML, COCO JSON or SmartReview JSON annotation file.',
  'Tệp nén không có tệp nhãn đúng định dạng của dự án.':
    "The archive has no annotation file in the project's format.",
  'Phân tích Guideline': 'Analyse Guideline',
  'Đang phân tích, có thể mất vài phút…': 'Analysing, this can take a few minutes…',
  'Gửi nội dung guideline tới mô hình ở backend (Gemini) để rút ra bản nháp quy tắc.':
    'Sends the guideline text to the backend model (Gemini) to draft rules from it.',
  'Chọn tệp hoặc dán nội dung guideline để phân tích.':
    'Choose a file or paste the guideline text to analyse it.',
  'Kiểm tra tự động được': 'Can be checked automatically',
  'Đo được bằng dữ liệu nhãn hiện có.': 'Measurable from the annotation data available.',
  'Cần người kiểm tra': 'Needs a reviewer',
  'Phải nhìn ảnh hoặc cần phán đoán của con người.':
    'Needs a look at the image or human judgement.',
  'Định nghĩa, hướng dẫn': 'Definitions and instructions',
  'Không phải yêu cầu về nhãn.': 'Not a requirement on the labels.',
  Mới: 'New',
  'Chặt hơn': 'Stricter',
  'Nới hơn': 'Looser',
  'Thiếu tham số:': 'Missing parameters:',
  'Cần thêm dữ liệu:': 'Needs data:',
  'lớp ·': 'classes ·',
  'kiểm tra tự động ·': 'automatic checks ·',
  'cần người kiểm tra ·': 'for a reviewer ·',
  'định nghĩa ·': 'definitions ·',
  'mâu thuẫn ·': 'conflicts ·',
  'bị loại': 'rejected',
  'Lớp và thuộc tính (': 'Classes and attributes (',
  'Chỗ guideline mâu thuẫn hoặc mơ hồ (': 'Where the guideline conflicts or is unclear (',
  'Bị loại khi đối chiếu với guideline (': 'Rejected when checked against the guideline (',
  'Đây là bản nháp để người duyệt. Kết quả chưa được lưu và chưa đổi cách chấm điểm.':
    'This is a draft for a person to review. The result is not saved and does not change scoring.',
  'Kiểm tra rules': 'Review rules',
  'Đã phân tích xong.': 'Analysis finished.',
  'Tất cả quy tắc': 'All rules',
  'Lớp và thuộc tính': 'Classes and attributes',
  'Mâu thuẫn': 'Conflicts',
  'Bị loại': 'Rejected',
  Mục: 'Section',
  Nhóm: 'Group',
  Lớp: 'Class',
  'Điều kiện': 'Condition',
  'Câu trích từ guideline': 'Quote from the guideline',
  'Ghi chú': 'Notes',
  'Thuộc tính bắt buộc và giá trị': 'Required attributes and values',
  'Vấn đề': 'Issue',
  '· Bản nháp để người duyệt; chưa lưu và chưa đổi cách chấm điểm.':
    '· A draft for a person to review; not saved and scoring is unchanged.',
  'Không có câu trích': 'No quote',
  'Câu trích không có trong guideline': 'Quote is not in the guideline',
  'Cần dữ liệu công cụ không có': 'Needs data the tool lacks',
  'Kiểm tra khai báo thiếu': 'Incomplete check',
  'Không nêu check bị thay': 'No overridden check named',
  'Tệp DOCX không hợp lệ: thiếu nội dung văn bản.': 'Invalid DOCX file: no document text.',
  'Tệp DOCX không hợp lệ: không đọc được nội dung.':
    'Invalid DOCX file: its content cannot be read.',
  'Không mở được PDF (tệp hỏng hoặc có mật khẩu).':
    'The PDF cannot be opened (damaged or password-protected).',
  'PDF không có lớp chữ (có thể là bản quét). Dùng bản có chữ hoặc dán nội dung.':
    'The PDF has no text layer (it may be a scan). Use a version with text or paste the text.',
  'Guideline rỗng.': 'The guideline is empty.',
  'So sánh với policy': 'Compare with policy',
  'Quy tắc từ guideline': 'Rule from the guideline',
  'So sánh': 'Comparison',
  'Policy đang áp dụng': 'Policy in use',
  Chọn: 'Choose',
  'Theo guideline': 'Use guideline',
  'Giữ policy': 'Keep policy',
  'Thêm vào': 'Add',
  'Tất cả theo guideline': 'All: guideline',
  'Tất cả giữ policy': 'All: keep policy',
  'Guideline chưa nêu:': 'Not stated in the guideline:',
  'Chưa có quy tắc tương ứng trong công cụ.': 'No matching rule in the tool yet.',
  'Chưa có mô tả cho kiểm tra này.': 'No description for this check.',
  'Yêu cầu trong guideline': 'Requirement in the guideline',
  'Vì sao công cụ chưa tự kiểm được': 'Why the tool cannot check it yet',
  'Cần nhìn ảnh hoặc phán đoán của con người.': 'Needs a look at the image or human judgement.',
  'Đặt quy tắc rút từ guideline cạnh quy tắc policy đang chạy trong công cụ, rồi chọn bên nào nên dùng.':
    'Guideline rules next to the policy rules the tool runs today; choose which side to use.',
  'Lựa chọn được lưu kèm dự án khi tạo, ai cũng chọn được (chưa phân quyền). Công cụ chưa tự đổi cách chấm điểm theo lựa chọn này.':
    'Choices are saved with the project when it is created; anyone can choose (no roles yet). Scoring does not change with these choices yet.',
  'quy tắc so được với policy ·': 'rules comparable with the policy ·',
  'mâu thuẫn · đã chọn': 'conflicts · chosen',
  'Tải về (.md)': 'Download (.md)',
  'Phân tích guideline': 'Guideline analysis',
  'Mô hình': 'Model',
  'Thời điểm': 'Time',
  'Chưa chọn': 'Not chosen',
  'Lựa chọn': 'Choice',
  'Không có.': 'None.',
  'Nội dung': 'Content',
  'Lý do': 'Reason',
  'Đây là bản nháp để người duyệt. Công cụ chưa tự đổi cách chấm điểm theo lựa chọn này.':
    'This is a draft for a person to review. Scoring does not change with these choices yet.',
  // Roles and project members. Leader, Reviewer and Annotator are written the same in both
  // languages, so they have no entry here or in i18n.vi.ts.
  'Loại tài khoản': 'Account type',
  'Thành viên': 'Member',
  'Tham gia project bằng mã mời, làm Reviewer hoặc Annotator.':
    'Join projects with an invite code, as a Reviewer or an Annotator.',
  'Tạo project, mời và quản lý thành viên.': 'Create projects, invite and manage members.',
  'Chọn vai trò làm việc': 'Choose your working role',
  'Bạn đổi được vai trò bất cứ lúc nào. Chưa tham gia project? Chọn vai trò rồi nhập mã mời Leader gửi cho bạn.':
    'You can switch roles at any time. Not in a project yet? Choose a role, then enter the invite code your Leader sent you.',
  'Kiểm tra và đánh giá nhãn trong các project bạn tham gia.':
    'Check and review labels in the projects you joined.',
  'Xem và sửa nhãn trong các project bạn tham gia.':
    'View and edit labels in the projects you joined.',
  project: 'project(s)',
  'Đổi vai trò': 'Switch role',
  'Mã mời từ Leader': 'Invite code from your Leader',
  'VD: K7M2QX9RTB': 'e.g. K7M2QX9RTB',
  'Tham gia project': 'Join project',
  'Các project bạn đã tham gia bằng mã mời của Leader.':
    'The projects you joined with your Leader’s invite code.',
  'Đã tham gia project:': 'Joined project:',
  'Bạn chưa tham gia project nào với vai trò này. Nhập mã mời ở trên để bắt đầu.':
    'You have not joined any project in this role. Enter an invite code above to start.',
  'Vai trò của bạn:': 'Your role:',
  'Thành viên project': 'Project members',
  'Đang tải thành viên…': 'Loading members…',
  'Người tạo (Leader)': 'Created by (Leader)',
  'Chưa gán — mọi Leader cùng quản lý': 'Unassigned — managed by every Leader',
  'Chưa có ai tham gia.': 'Nobody has joined yet.',
  'Mã mời': 'Invite code',
  'Chuyển sang': 'Move to',
  Xóa: 'Remove',
  'Xóa thành viên này khỏi project?': 'Remove this member from the project?',
  'Sao chép': 'Copy',
  'Đã sao chép': 'Copied',
  'Tạo mã mới': 'New code',
  'Tạo mã mới? Mã cũ sẽ không dùng được nữa.': 'Create a new code? The old one will stop working.',
  'Project chưa có dữ liệu. Leader cần import dataset trước khi bạn làm việc.':
    'This project has no data yet. The Leader needs to import a dataset before you can work.',
  // Messages from the API
  'Mã mời không đúng hoặc đã bị thay.': 'That invite code is wrong or has been replaced.',
  'Mã mời gồm 10 ký tự chữ và số.': 'Invite codes have 10 letters and digits.',
  'Tài khoản Leader không tham gia project bằng mã mời.':
    'Leader accounts do not join projects with an invite code.',
  'Chỉ Leader được tạo project.': 'Only a Leader can create projects.',
  'Chỉ Leader của project được thực hiện thao tác này.': 'Only the project’s Leader can do this.',
  'Chức năng này chỉ dành cho Leader.': 'This is for Leaders only.',
  'Thành viên không thuộc project này.': 'That member is not part of this project.',
  'Vai trò phải là Reviewer hoặc Annotator.': 'The role must be Reviewer or Annotator.',
  'Loại tài khoản phải là Leader hoặc Thành viên.': 'The account type must be Leader or Member.',
  'Project không tồn tại.': 'This project does not exist.',
  // Added by the full audit: dialogs, API error messages and policy check descriptions.
  'check sẽ tắt khi chấm': 'check(s) will be switched off when scoring',
  'dòng của guideline chưa được phân loại': 'guideline line(s) were not classified',
  '. Hãy đọc lại các dòng này bằng tay hoặc phân tích lại.':
    '. Read these lines by hand or analyse again.',
  'Bị loại khi đối chiếu với guideline': 'Rejected when checked against the guideline',
  'ZIP64 chưa được hỗ trợ. Dùng tệp nén dưới 4 GB và dưới 65535 tệp.':
    'ZIP64 is not supported. Use an archive under 4 GB with fewer than 65535 files.',
  'Mục lục ZIP bị hỏng.': 'The ZIP directory is damaged.',
  'Lượt kiểm tra bị ngắt khi server dừng. Bấm chạy lại.':
    'The run was interrupted when the server stopped. Start it again.',
  'Project đang được xóa.': 'This project is being deleted.',
  'Một lượt AI đang chạy. Hãy chờ hoàn tất rồi thử lại.':
    'An AI run is in progress. Wait for it to finish, then try again.',
  'Chưa có Python hoặc model cục bộ. Xem docs/ai-check.md để cấu hình.':
    'Python or the local model is missing. See docs/ai-check.md to set it up.',
  'Dataset chưa có ảnh phù hợp để chạy AI.': 'The dataset has no images suitable for the AI run.',
  'AI Check hỗ trợ tối đa 1000 ảnh mỗi lượt.': 'AI Check handles at most 1000 images per run.',
  'AI quá thời gian 20 phút. Thử dataset nhỏ hơn.':
    'The AI run exceeded 20 minutes. Try a smaller dataset.',
  'Không chạy được model. Kiểm tra Python/Ultralytics trong docs/ai-check.md rồi thử lại.':
    'The model could not run. Check Python/Ultralytics in docs/ai-check.md and try again.',
  'Dịch vụ đăng nhập chưa sẵn sàng.': 'The sign-in service is not ready.',
  'Chưa có dataset mặc định. Mở Projects để tạo và import dataset.':
    'There is no default dataset. Open Projects to create one and import a dataset.',
  'Không tìm thấy media.': 'Media not found.',
  'Video cần frame cụ thể.': 'A video needs a specific frame.',
  'Không tìm thấy frame của media này.': 'No frame was found for this media.',
  'Không kết nối được dịch vụ dữ liệu. Kiểm tra MySQL rồi thử lại.':
    'Could not reach the data service. Check MySQL and try again.',
  'Tên đăng nhập cần 3–64 ký tự: chữ, số, _, . hoặc -.':
    'Usernames need 3–64 characters: letters, digits, _, . or -.',
  'Mật khẩu cần từ 12 đến 128 ký tự.': 'Passwords need 12 to 128 characters.',
  'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.': 'Your session is invalid or has expired.',
  'Tên đăng nhập hợp lệ và mật khẩu từ 12 đến 128 ký tự là bắt buộc.':
    'A valid username and a password of 12 to 128 characters are required.',
  'Hệ thống đang bận. Vui lòng thử lại.': 'The system is busy. Please try again.',
  'Tên đăng nhập đã tồn tại.': 'That username is already taken.',
  'Nhập tên đăng nhập và mật khẩu hợp lệ.': 'Enter a valid username and password.',
  'Tên đăng nhập không hợp lệ.': 'That username is not valid.',
  'Tên đăng nhập hoặc mật khẩu không đúng.': 'Wrong username or password.',
  'Đăng nhập quá nhiều lần. Thử lại sau 15 phút.':
    'Too many sign-in attempts. Try again in 15 minutes.',
  'Đăng ký quá nhiều lần. Thử lại sau 15 phút.':
    'Too many sign-up attempts. Try again in 15 minutes.',
  'Đánh giá ảnh quá lớn (tối đa 64 KB).': 'The image review is too large (64 KB at most).',
  'JSON không hợp lệ.': 'Invalid JSON.',
  'Không tìm thấy đường dẫn ảnh.': 'Image route not found.',
  'Mã ảnh không hợp lệ.': 'Invalid image ID.',
  'Không tìm thấy ảnh.': 'Image not found.',
  'Chưa có ảnh để kiểm tra.': 'There are no images to check yet.',
  'Đánh giá đã thay đổi ở nơi khác. Tải lại bản đã lưu trước khi chỉnh sửa.':
    'The review was changed elsewhere. Reload the saved version before editing.',
  'Ảnh đã có đánh giá. Tải lại bản đã lưu.':
    'This image already has a review. Reload the saved version.',
  'Guideline tối đa 512 KB văn bản để phân tích.':
    'A guideline can have at most 512 KB of text to analyse.',
  'Chưa cấu hình GEMINI_API_KEY trong .env của backend.':
    'GEMINI_API_KEY is not set in the backend .env.',
  'Import bị ngắt khi server dừng. Chọn lại files để thử lại.':
    'The import was interrupted when the server stopped. Choose the files again to retry.',
  'Không thể xóa dataset demo mặc định.': 'The default demo dataset cannot be deleted.',
  'Chờ import hoặc AI Check hoàn tất trước khi xóa.':
    'Wait for the import or AI Check to finish before deleting.',
  'Tên project 1–160 ký tự; mô tả tối đa 2000 ký tự.':
    'Project names have 1–160 characters; descriptions up to 2000.',
  'Format chưa được hỗ trợ.': 'That format is not supported.',
  'Không đọc được dữ liệu từ kho lưu trữ chung. Kiểm tra mạng và cấu hình Dropbox.':
    'Could not read from shared storage. Check the network and the Dropbox settings.',
  'Project này chỉ có dữ liệu trên máy đã import. Chạy npm run storage:push trên máy đó để chia sẻ.':
    "This project's data exists only on the machine that imported it. Run npm run storage:push there to share it.",
  'Storage key của project không hợp lệ.': "The project's storage key is invalid.",
  'Không tìm thấy dữ liệu project trên kho lưu trữ chung. Nếu project được chia sẻ ở dạng .tar cũ, chạy npm run storage:push trên máy còn giữ file.':
    "The project's data was not found in shared storage. If it was shared as an old .tar, run npm run storage:push on the machine that still has the files.",
  'Project chưa READY. Xem trạng thái import.': 'The project is not READY. See the import status.',
  'Dataset trên disk đã thay đổi. Tạo project mới để import lại.':
    'The dataset on disk has changed. Create a new project to import it again.',
  'Project đang import hoặc đã READY. Tạo project mới cho dataset khác.':
    'The project is importing or already READY. Create a new project for another dataset.',
  'MVP hỗ trợ tối đa 100000 annotations và 10000 frames.':
    'The MVP supports at most 100000 annotations and 10000 frames.',
  'Có ảnh upload không được annotation tham chiếu. Chỉ chọn ảnh của dataset.':
    "Some uploaded images are not referenced by the annotations. Choose only the dataset's images.",
  'File lựa chọn quy tắc không phải JSON hợp lệ.': 'The rule choices file is not valid JSON.',
  'Không thể xử lý import. Kiểm tra storage/MySQL rồi thử lại.':
    'The import could not be processed. Check storage/MySQL and try again.',
  'Tên file/path không hợp lệ. Không dùng đường dẫn tuyệt đối hoặc ../.':
    'Invalid file name or path. Do not use absolute paths or ../.',
  'Project metadata quá lớn.': 'The project metadata is too large.',
  'Upload tối đa 200 MB.': 'Uploads can be at most 200 MB.',
  'Chỉ chọn một annotation file.': 'Choose only one annotation file.',
  'Annotation extension không khớp format.':
    'The annotation file extension does not match the format.',
  'Chỉ chọn một file metadata ảnh.': 'Choose only one image metadata file.',
  'Metadata ảnh phải là file CSV.': 'Image metadata must be a CSV file.',
  'Chỉ chọn một file guideline/policy.': 'Choose only one guideline/policy file.',
  'Guideline/policy phải là file Markdown, TXT, DOCX, PDF hoặc JSON.':
    'The guideline/policy must be a Markdown, TXT, DOCX, PDF or JSON file.',
  'Chỉ gửi một file lựa chọn quy tắc.': 'Send only one rule choices file.',
  'Lựa chọn quy tắc phải là file JSON.': 'Rule choices must be a JSON file.',
  'Media chỉ hỗ trợ PNG/JPEG/WebP/GIF; không nhận SVG, ZIP hoặc video.':
    'Media must be PNG/JPEG/WebP/GIF; SVG, ZIP and video are not accepted.',
  'Mỗi ảnh tối đa 20 MB.': 'Each image can be at most 20 MB.',
  'Annotation, metadata và guideline tối đa 10 MB mỗi file.':
    'Annotation, metadata and guideline files can be at most 10 MB each.',
  'Tối đa 1000 ảnh, một annotation file, một metadata file và một guideline.':
    'At most 1000 images, one annotation file, one metadata file and one guideline.',
  'Quá nhiều upload parts.': 'Too many upload parts.',
  'Upload bị ngắt.': 'The upload was interrupted.',
  'Upload không hoàn chỉnh.': 'The upload is incomplete.',
  'Cần annotation file và ít nhất một ảnh.':
    'An annotation file and at least one image are required.',
  'Review đã tồn tại. Tải lại quyết định rồi chỉnh sửa.':
    'A review already exists. Reload the decision, then edit it.',
  'Review chưa tồn tại.': 'No review exists yet.',
  'Review đã được chỉnh sửa ở nơi khác. Tải lại quyết định.':
    'The review was edited elsewhere. Reload the decision.',
  'Dữ liệu đánh giá ảnh không hợp lệ.': 'The image review data is invalid.',
  'Thiếu phiên bản đánh giá hợp lệ.': 'A valid review version is missing.',
  'Trạng thái đánh giá không hợp lệ.': 'The review status is invalid.',
  'Ghi chú tối đa 2000 ký tự.': 'Notes can have at most 2000 characters.',
  'Tối đa 50 vùng thiếu đối tượng mỗi ảnh.': 'At most 50 missing-object regions per image.',
  'Mã vùng đánh dấu không hợp lệ hoặc bị trùng.': 'A region ID is invalid or duplicated.',
  'Tên đối tượng tối đa 100 ký tự; ghi chú vùng tối đa 500 ký tự.':
    'Object names have at most 100 characters; region notes at most 500.',
  'Vùng thiếu phải nằm trong ảnh, rộng và cao ít nhất 1 pixel.':
    'A missing region must lie inside the image and be at least 1 pixel wide and high.',
  'Trong một track, frame giữa mang lớp khác hai frame trước và sau thì bị gắn cờ.':
    'Within a track, a middle frame whose class differs from the frames before and after is flagged.',
  'Độ tin cậy của một frame thấp hơn trung bình hai frame kề từ 0,2 trở lên thì bị gắn cờ.':
    'A frame whose confidence is 0.2 or more below the average of its two neighbours is flagged.',
  'Diện tích khung lệch từ 50% so với trung bình hai frame kề trong cùng track thì bị gắn cờ.':
    'A box whose area differs by 50% or more from the average of the two neighbouring frames in its track is flagged.',
  'Tâm khung lệch khỏi điểm giữa của hai frame kề từ nửa đường chéo khung trở lên thì bị gắn cờ.':
    'A box whose centre is half a box diagonal or more away from the midpoint of the two neighbouring frames is flagged.',
  'Khung có chiều rộng hoặc chiều cao không hợp lệ thì bị gắn cờ.':
    'A box with an invalid width or height is flagged.',
  'Hai khung cùng lớp do người vẽ chồng nhau từ 50% (IoU) thì khung vẽ sau bị gắn cờ.':
    'When two hand-drawn boxes of the same class overlap by 50% (IoU) or more, the one drawn later is flagged.',
  'Xe nằm gần trọn trong khung xe tải hoặc xe buýt bị coi là một bộ phận của xe lớn.':
    'A vehicle lying almost entirely inside a truck or bus box is treated as part of the larger vehicle.',
  'Khung xe chạm mép dưới ảnh mà không vươn tới giữa ảnh bị coi là nắp ca-pô của xe gắn camera.':
    'A vehicle box touching the bottom edge without reaching the middle of the image is treated as the hood of the camera car.',
  'Khung xe nằm trọn ở phần trên cùng của ảnh (trên đường chân trời) thì bị gắn cờ.':
    'A vehicle box lying entirely in the top part of the image (above the horizon) is flagged.',
  'Khung ô tô, xe tải, xe buýt cao hoặc dẹt bất thường (tỉ lệ cao/rộng trên 2 hoặc dưới 0,2) thì bị gắn cờ.':
    'A car, truck or bus box that is unusually tall or flat (height/width above 2 or below 0.2) is flagged.',
  'Khung xe hai bánh cao bất thường (thường do ôm cả người lái) thì bị gắn cờ.':
    'A two-wheeler box that is unusually tall (usually because it includes the rider) is flagged.',
  'Khung người nằm trong khung xe bốn bánh theo kiểu hành khách sau kính thì bị gắn cờ.':
    'A person box inside a four-wheeled vehicle box, like a passenger behind glass, is flagged.',
  'Khung người và khung xe hai bánh gần trùng nhau (một khung ôm cả hai) thì bị gắn cờ.':
    'A person box and a two-wheeler box that nearly coincide (one box covering both) are flagged.',
  'Khung người có tỉ lệ cao/rộng bất thường thì bị gắn cờ.':
    'A person box with an unusual height/width ratio is flagged.',
  'Khung đèn tín hiệu nằm trọn trong khung xe bị coi là đèn hậu của xe.':
    "A traffic light box lying entirely inside a vehicle box is treated as the vehicle's tail light.",
  'Khung đèn tín hiệu nằm thấp sát mặt đường (tâm dưới 65% chiều cao ảnh) thì bị gắn cờ.':
    'A traffic light box close to the road surface (centre below 65% of the image height) is flagged.',
  'Khung đèn tín hiệu có tâm thấp hơn mép trên của ít nhất ba phần tư số xe trong ảnh thì bị gắn cờ (thường là đèn hậu hoặc bóng phản chiếu).':
    'A traffic light box whose centre is below the top edge of at least three quarters of the vehicles in the image is flagged (usually a tail light or a reflection).',
  'Khung đèn tín hiệu có hình dạng quá khác thường thì bị gắn cờ.':
    'A traffic light box with a very unusual shape is flagged.',
  'Hai khung đèn tín hiệu gần trùng nhau bị coi là gán trùng.':
    'Two traffic light boxes that nearly coincide are treated as a duplicate label.',
  'Khung biển báo do mô hình sinh ra nằm trong khung xe thì bị gắn cờ.':
    'A model-generated sign box inside a vehicle box is flagged.',
  'Khung biển dừng do mô hình sinh ra có tỉ lệ cạnh bất thường thì bị gắn cờ.':
    'A model-generated stop sign box with an unusual aspect ratio is flagged.',
  'Khung biển báo ở vị trí bất thường trong ảnh thì bị gắn cờ.':
    'A sign box at an unusual position in the image is flagged.',
  'Hai khung biển báo gần trùng nhau bị coi là gán trùng.':
    'Two sign boxes that nearly coincide are treated as a duplicate label.',
  'Khung rào chắn có tỉ lệ cạnh bất thường thì bị gắn cờ.':
    'A barrier box with an unusual aspect ratio is flagged.',
  'Rào chắn bị xe cắt ngang mà vẫn gán một khung liền thì bị gắn cờ (phải tách hai đoạn).':
    'A barrier cut across by a vehicle but labelled as one continuous box is flagged (it must be split in two).',
  'Khung cột có tỉ lệ cạnh bất thường thì bị gắn cờ.':
    'A pole box with an unusual aspect ratio is flagged.',
  'Khung cột ôm cả đèn hoặc biển gắn trên cột thì bị gắn cờ (chỉ gán thân cột).':
    'A pole box that also covers the light or sign mounted on it is flagged (label the pole only).',
  'Hai khung cùng lớp do mô hình sinh ra chồng nhau từ 60% (IoU) thì khung có độ tin cậy thấp hơn bị coi là khung thừa.':
    'When two model-generated boxes of the same class overlap by 60% (IoU) or more, the one with lower confidence is treated as extra.',
  'Khung xe tải hoặc xe buýt gần trùng với một khung khác lớp có độ tin cậy thấp hơn vẫn bị gắn cờ: tên lớp còn đáng ngờ.':
    'A truck or bus box that nearly coincides with a lower-confidence box of another class is still flagged: its class name is doubtful.',
  'Vật thể bị che hoặc nằm ngoài khung hình quá nửa và có từ hai dấu hiệu khó xác nhận (độ tin cậy thấp, ảnh xấu, khung nhỏ, phân vân lớp) thì bị gắn cờ.':
    'An object more than half hidden or out of frame, with two or more signs that it is hard to confirm (low confidence, poor image, small box, class doubt), is flagged.',
  'Vật thể chỉ còn thấy dưới 5% (ước lượng từ các khung đứng gần camera hơn) thì bị gắn cờ là khung thừa.':
    'An object less than 5% visible (estimated from boxes closer to the camera) is flagged as an extra box.',
  'Bộ dữ liệu có attribute occluded hoặc truncated thì khung nào thiếu hoặc mang giá trị không hợp lệ bị gắn cờ.':
    'When the dataset has an occluded or truncated attribute, any box missing it or carrying an invalid value is flagged.',
  'Khung chạm mép ảnh mà truncated không phải true, hoặc không chạm mép mà truncated là true, thì bị gắn cờ.':
    'A box touching the image edge without truncated set to true, or not touching it with truncated set to true, is flagged.',
  'Một khung ô tô và một khung xe tải gần trùng chỗ thì khung xe tải bị gắn cờ và ô tô được gợi ý, dù khung nào có độ tin cậy cao hơn.':
    'When a car box and a truck box nearly share a place, the truck box is flagged and car is suggested, whichever has the higher confidence.',
  'Khung ô tô mà mô hình nghiêng hẳn về xe tải (xe tải cao hơn trên 15%) được cảnh báo, không cộng điểm.':
    'A car box where the model clearly leans towards truck (truck more than 15% higher) gets a warning with no added score.',
  'Khung xe tải có độ tin cậy dưới 70% và không có ý kiến thứ hai của mô hình thì bị gắn cờ: tên lớp chưa đủ căn cứ.':
    'A truck box with confidence below 70% and no second opinion from the model is flagged: the class name lacks support.',
  'Khung xe tải không cao hơn 1,3 lần các khung ô tô đứng cùng tầm xa thì bị gắn cờ.':
    'A truck box no more than 1.3 times taller than car boxes at the same distance is flagged.',
};

// Strings built with values in them. Tried only when there is no exact entry above.
export const enRules: [RegExp, string][] = [
  [/^Chọn cho (.+)$/, 'Choice for $1'],
  [/^Cần thêm dữ liệu: (.+)$/, 'Needs data: $1'],
  [/^Để trống thì dùng (.+) trong tệp nén\.$/, 'Leave empty to use $1 from the archive.'],
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
  [
    /^Bạn đã là (Reviewer|Annotator) của project này\. Leader có thể đổi vai trò cho bạn\.$/,
    'You are already a $1 in this project. The Leader can change your role.',
  ],
  [/^Thiếu (\d+)(: .+)?$/, 'Missing $1$2'],
  [
    /^Xóa project “(.+)”\? Toàn bộ ảnh upload, annotation, kết quả AI và đánh giá của project sẽ bị xóa vĩnh viễn\.$/,
    'Delete project “$1”? All its uploaded images, annotations, AI results and reviews will be permanently deleted.',
  ],
  [/^· (\d+) lần gọi mô hình bị lỗi$/, '· $1 model call(s) failed'],
  [/^Tệp nén có mật khẩu: (.+)$/, 'The archive is password-protected: $1'],
  [/^Kiểu nén chưa được hỗ trợ \((.+)\): (.+)$/, 'Unsupported compression method ($1): $2'],
  [/^ZIP bị hỏng tại (.+)$/, 'The ZIP is damaged at $1'],
  [/^Không giải nén được (.+)$/, 'Could not extract $1'],
  [
    /^Kích thước thực của (.+) lớn hơn khai báo trong ZIP\.$/,
    'The real size of $1 is larger than the ZIP declares.',
  ],
  [/^Object \(Đối tượng\): (.+)$/, 'Object: $1'],
  [/^Frame \(Khung hình\): (.+)$/, 'Frame: $1'],
  [
    /^Không đọc được ảnh (.+) từ kho lưu trữ chung\.$/,
    'Could not read image $1 from shared storage.',
  ],
  [/^Không phân tích được guideline: (.+)$/, 'The guideline could not be analysed: $1'],
  [/^Mã mời gồm (\d+) ký tự chữ và số\.$/, 'Invite codes have $1 letters and digits.'],
  [/^Tên file chỉ khác nhau chữ hoa\/thường: (.+)$/, 'File names differ only in letter case: $1'],
  [
    /^Dữ liệu project nằm trên (.+)\. Cấu hình SMARTREVIEW_REMOTE_STORAGE trong \.env để đọc\.$/,
    "The project's data is on $1. Set SMARTREVIEW_REMOTE_STORAGE in .env to read it.",
  ],
  [/^Frame (.+) thiếu image reference\.$/, 'Frame $1 has no image reference.'],
  [
    /^Thiếu ảnh hoặc tên ảnh không duy nhất: (.+)$/,
    'An image is missing or its name is not unique: $1',
  ],
  [
    /^Kích thước ảnh (.+) không khớp annotation \((\d+)×(\d+) thực tế\)\.$/,
    'The size of image $1 does not match the annotation (actually $2×$3).',
  ],
  [/^BBox (.+): width và height phải > 0\.$/, 'BBox $1: width and height must be > 0.'],
  [/^Trùng media filename: (.+)$/, 'Duplicate media file name: $1'],
  [
    /^Nội dung ảnh không khớp loại file: (.+)$/,
    'The image content does not match its file type: $1',
  ],
  [
    /^Ảnh hỏng, ảnh động hoặc vượt 25 megapixels: (.+)$/,
    'The image is damaged, animated or over 25 megapixels: $1',
  ],
  [
    /^Khung của mô hình có độ tin cậy dưới (\d+%) thì bị gắn cờ\.$/,
    'A model box with confidence below $1 is flagged.',
  ],
  [
    /^Điểm của lớp đứng đầu và lớp thứ hai cách nhau dưới (\d+%) thì bị gắn cờ \(mô hình phân vân giữa hai nhãn\)\.$/,
    'When the top class and the second class score less than $1 apart, the box is flagged (the model is torn between two labels).',
  ],
  [
    /^Lớp thứ hai là một loại xe gần giống và cách lớp đứng đầu dưới (\d+%) thì bị gắn cờ\.$/,
    'When the second class is a similar vehicle type less than $1 behind the top class, the box is flagged.',
  ],
  [
    /^Mô hình phân vân giữa người và xe hai bánh, hai điểm cách nhau dưới (\d+%), thì bị gắn cờ\.$/,
    'When the model is torn between person and two-wheeler, with scores less than $1 apart, the box is flagged.',
  ],
  [
    /^Hai khung khác lớp chồng nhau từ (\d+%) \(IoU\) bị coi là một vật thể gán hai tên; người ngồi trên xe hai bánh được loại trừ\.$/,
    'Two boxes of different classes overlapping by $1 (IoU) or more are treated as one object with two names; a person riding a two-wheeler is excluded.',
  ],
  [
    /^Khung sát mép ảnh, chỉ còn một dải hẹp của vật thể và có độ tin cậy dưới (\d+%) thì bị gắn cờ\.$/,
    'A box at the image edge showing only a narrow strip of the object, with confidence below $1, is flagged.',
  ],
  [
    /^Khung có độ tin cậy dưới (\d+%) trong frame có điều kiện xấu \(env_risk từ (\d+%)\) thì bị gắn cờ\.$/,
    'A box with confidence below $1 in a frame with poor conditions (env_risk of $2 or more) is flagged.',
  ],
];
