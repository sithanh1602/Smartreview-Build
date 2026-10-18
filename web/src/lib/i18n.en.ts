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
  'Xóa project?': 'Delete project?',
  'Xóa vĩnh viễn': 'Delete permanently',
  'Toàn bộ ảnh upload, annotation, kết quả AI và đánh giá của project sẽ bị xóa vĩnh viễn. Không hoàn tác được.':
    'All its uploaded images, annotations, AI results and reviews will be permanently deleted. This cannot be undone.',
  'Đã xóa project': 'Project deleted',
  'Một số file chưa dọn được và đang chờ trong storage/.trash. Kiểm tra quyền thư mục trên máy chủ.':
    'Some files could not be cleaned up and are waiting in storage/.trash. Check folder permissions on the server.',
  'Đã hiểu': 'Got it',
  'Đang xóa…': 'Deleting…',
  'Xóa project': 'Delete project',
  'Chọn annotation file và các ảnh tương ứng.': 'Choose the annotation file and its images.',
  'Vượt giới hạn: annotation 10 MB; mỗi ảnh 20 MB; tổng 200 MB; tối đa 100 ảnh.':
    'Over the limit: annotation 10 MB; 20 MB per image; 200 MB in total; at most 100 images.',
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
  'ảnh · tối đa 100 ảnh / 200 MB tổng; 20 MB mỗi ảnh; annotation 10 MB.':
    'images · at most 100 images / 200 MB in total; 20 MB per image; annotation 10 MB.',
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
  'Bằng chứng số liệu': 'Evidence figures',
  'JSON gốc': 'Raw JSON',
  điểm: 'points',
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
  'Cảnh báo (xem thêm)': 'Warnings (worth a look)',
  'Cảnh báo': 'Warnings',
  'Engine: cần xem hoặc vẽ lại': 'Engine: verify or relabel',
  'Có vật nghi bị sót': 'Possibly missed objects',
  'Tự chấp nhận': 'Auto-accepted',
  'Cần xem': 'To verify',
  'Vẽ lại': 'Relabel',
  'Điểm chấm lại box của người (rescore)': 'Model rescore of drawn boxes',
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
  'Có thể thừa nhãn': 'Possibly extra label',

  // Label scan
  'Chọn cách quét nhãn': 'Choose how labels are scanned',
  'Chọn model cho dữ liệu': 'Choose models for the data',
  'Model chấm điểm box': 'Box score model',
  'Model đọc và xét box': 'Models that read and check boxes',
  Bước: 'Step',
  'Dữ liệu chưa được tải lên: project chỉ được tạo và xử lý sau khi bạn chọn xong và bấm “Nhập dữ liệu”. Risk Engine luôn chạy khi nhập.':
    'Nothing is uploaded yet: the project is created and processed only after you finish choosing and press “Import”. The Risk Engine always runs at import.',
  'Đang đọc thư mục model…': 'Reading the model folders…',
  'Model chạy một lần trên mỗi ảnh: mỗi box người vẽ được chấm điểm cho đúng nhãn của nó, vật model thấy mà chưa có box thành gợi ý. Không thêm, không sửa nhãn. Nên chọn khi tệp nhãn chưa có confidence. Đọc từ thư mục model/Model_rescore.':
    'The model runs once on each image: every drawn box is scored for its own label, and objects it sees without a box become hints. No label is added or changed. Pick one when the labels have no confidence. Read from the model/Model_rescore folder.',
  '(mặc định)': '(default)',
  'Không chấm điểm': 'No scoring',
  'Dùng confidence có sẵn trong tệp nhãn, nếu có.':
    'Uses the confidence already in the labels, if any.',
  'Tiếp →': 'Next →',
  '← Bước trước': '← Previous step',
  Huỷ: 'Cancel',
  'Luôn chạy khi nhập dữ liệu. Kết quả của nó không đổi dù bạn chọn gì bên dưới.':
    'Always runs at import. Its results do not change whatever you choose below.',
  'Lượt quét chạy một lần, tự bắt đầu khi dữ liệu đã nhập xong (project sang Ready).':
    'The scan runs once and starts by itself when the import is done (the project turns Ready).',
  'Quay lại': 'Back',
  'Nhập dữ liệu và quét': 'Import and scan',
  'Nhập dữ liệu': 'Import',
  'Đang gửi lựa chọn quét nhãn…': 'Sending the label scan choice…',
  'Quét bằng model ảnh': 'Scan with an image model',
  'Cắt phần ảnh trong từng khung để so với nhãn. Khung bị phát hiện sai vào hàng đợi kiểm tra.':
    'Crops each box and compares it with its label. Boxes found wrong join the review queue.',
  'Model quét': 'Scan model',
  'Chưa có model loại SigLIP trong thư mục model/Model_bbox.':
    'There is no SigLIP-type model in the model/Model_bbox folder yet.',
  'Xem lại bằng model thứ hai': 'Look again with a second model',
  'Xem lại các khung model quét đã nghi và xác nhận. Chậm hơn nhiều.':
    'Looks again at the boxes the scan model doubted and confirms them. Much slower.',
  'Model xem lại': 'Second-look model',
  'Chưa có model loại Qwen2.5-VL trong thư mục model/Model_bbox.':
    'There is no Qwen2.5-VL-type model in the model/Model_bbox folder yet.',
  'Đang đọc thư mục model/Model_bbox…': 'Reading the model/Model_bbox folder…',
  'Lượt quét nhãn bằng ảnh đã chọn đang chờ tới lượt.':
    'The image label scan you chose is waiting for its turn.',
  'Đang quét nhãn bằng ảnh ·': 'Scanning labels from the images ·',
  'khung. Khung bị phát hiện sai sẽ vào hàng đợi kiểm tra khi quét xong.':
    'boxes. Boxes found wrong join the review queue when the scan ends.',
  'Đã quét nhãn bằng ảnh (': 'Labels scanned from the images (',
  '):': '):',
  'khung nghi sai nhãn nằm trong hàng đợi kiểm tra, trong đó':
    'boxes with a doubted label are in the review queue, of which',
  'khung Risk Engine chưa bắt được': 'the Risk Engine had not caught',
  'xác nhận': 'confirms',
  khung: 'boxes',
  'Quét nhãn bằng ảnh chưa xong:': 'The image label scan did not finish:',
  'Một lượt kiểm nhãn đang chạy. Hãy chờ hoàn tất rồi thử lại.':
    'A label scan is in progress. Wait for it to finish, then try again.',
  'Chưa có Python của label verifier. Xem docs/label-verifier.md để cài.':
    'The label verifier’s Python is missing. See docs/label-verifier.md to install it.',
  'Dataset chưa có ảnh phù hợp để kiểm nhãn.':
    'The dataset has no images suitable for the label scan.',
  'Kiểm nhãn hỗ trợ tối đa 1000 ảnh mỗi lượt.':
    'The label scan handles at most 1000 images per run.',
  'Không chạy được label verifier. Kiểm tra cài đặt trong docs/label-verifier.md.':
    'The label verifier could not run. Check the setup in docs/label-verifier.md.',
  'GPU của máy chủ không đủ bộ nhớ trống cho mô hình. Đóng chương trình khác đang dùng GPU rồi chạy lại.':
    'The server’s GPU has too little free memory for the model. Close other programs using the GPU, then run again.',
  'Lượt kiểm nhãn bị ngắt khi server dừng. Bấm chạy lại.':
    'The label scan was interrupted when the server stopped. Run it again.',
  'Project chưa có dữ liệu để kiểm nhãn.': 'The project has no data to scan yet.',
  'Dữ liệu này đã được quét nhãn; lượt quét chỉ chạy một lần khi đưa dữ liệu lên.':
    'This data was already scanned; the scan runs once, when the data is put up.',
  'Đã sửa': 'Fixed',
  'Đã xoá nhãn': 'Label removed',
  'Đã thêm nhãn': 'Label added',
  'Chưa đổi': 'Unchanged',
  'Chưa thêm nhãn': 'Label not added',
  'Tệp nén này không có tệp nhãn.': 'This archive has no annotation file.',
  'File nhãn tối đa 10 MB.': 'Annotation files may be at most 10 MB.',
  'Kiểm tra lại': 'Check again',
  'Lỗi cần sửa': 'Labels to fix',
  'Toàn bộ ảnh và nhãn, dạng CVAT for images 1.1, để nhập vào CVAT':
    'All images and labels, as CVAT for images 1.1, to import into CVAT',
  'Tải dataset cho CVAT (.zip)': 'Download dataset for CVAT (.zip)',
  'Tải danh sách lỗi (.json)': 'Download the list (.json)',
  'đã gửi lại bản đã sửa lúc': 'returned the fixed version at',
  'mục đã được sửa,': 'items fixed,',
  'mục chưa đổi.': 'items unchanged.',
  'Gửi lại bản đã sửa': 'Return the fixed version',
  'Tải dataset cho CVAT (.zip) ở trên, nhập vào CVAT và sửa nhãn.':
    'Download the dataset for CVAT (.zip) above, import it into CVAT and fix the labels.',
  'Trong CVAT, xuất nhãn (Export task dataset, không cần kèm ảnh).':
    'In CVAT, export the labels (Export task dataset, images not needed).',
  'Chọn file vừa xuất ở đây (.zip, .xml hoặc .json). SmartReview tự nhận định dạng và chuyển về dạng của mình.':
    'Choose the exported file here (.zip, .xml or .json). SmartReview detects the format and converts it to its own.',
  'File đã sửa': 'Fixed file',
  'Gửi lại cho Reviewer': 'Return to the Reviewer',
  '· Khung liền: lúc gửi · Khung xanh nét đứt: hiện tại (':
    '· Solid box: when sent · Dashed blue box: now (',
  'Mở nhãn hiện tại trong Review →': 'Open the current label in Review →',
  'Annotator đã gửi lại bản đã sửa': 'The Annotator returned the fixed version',
  'gửi lại lúc': 'returned at',
  '. Project đang chạy trên bản đã sửa; Reviewer kiểm tra lại rồi bấm Hoàn thành lần nữa nếu còn lỗi.':
    '. The project now runs on the fixed version; Reviewers check again and press Complete once more if errors remain.',
  '. Quyết định review đang bị khoá cho tới khi Annotator gửi lại bản đã sửa.':
    '. Review decisions are locked until the Annotator returns the fixed version.',
  'Kiểm tra lại các lỗi đã gửi →': 'Check the sent errors again →',
  'Project không ở trạng thái chờ Annotator gửi lại.':
    'This project is not waiting for the Annotator to return a file.',
  'Chỉ Annotator được gửi mới gửi lại bản đã sửa.':
    'Only an Annotator it was sent to can return the fixed version.',
  'Không nhận ra định dạng file. Xuất từ CVAT dạng "CVAT for images 1.1" rồi gửi lại.':
    'The file format was not recognised. Export from CVAT as "CVAT for images 1.1" and send again.',
  'File không có thay đổi nào so với bản đã gửi.':
    'The file has no change compared with what was sent.',
  'Chọn file nhãn đã sửa để gửi.': 'Choose the fixed annotation file to send.',
  'Chỉ xuất được dataset ảnh rời sang CVAT for images.':
    'Only datasets of separate images can be exported to CVAT for images.',
  'Hoàn thành': 'Complete',
  'Hoàn thành review': 'Complete review',
  'Gửi file kết quả review cho Annotator để sửa nhãn. Sau khi gửi, các quyết định review bị khoá; chỉ Leader hoặc Reviewer mở lại được.':
    'Send the review result file to the Annotators so they can fix the labels. After sending, review decisions are locked; only the Leader or a Reviewer can reopen them.',
  'lỗi đã xác nhận trong các case rủi ro': 'confirmed errors among the risk cases',
  Còn: 'There are still',
  'case rủi ro chưa kiểm tra.': 'risk cases are not checked yet.',
  'Gửi cho Annotator': 'Send to Annotators',
  'Đang tải danh sách Annotator…': 'Loading Annotators…',
  'Project chưa có Annotator. Thêm Annotator ở trang dự án rồi quay lại.':
    'This project has no Annotator yet. Add one on the project page, then come back.',
  'Ghi chú cho Annotator (không bắt buộc)': 'Note for the Annotators (optional)',
  Hủy: 'Cancel',
  'Đang gửi…': 'Sending…',
  'Gửi và khoá review': 'Send and lock review',
  'Review đã hoàn thành:': 'Review completed:',
  'đã gửi cho': 'sent it to',
  lúc: 'at',
  '. Quyết định đang bị khoá.': '. Decisions are locked.',
  'Review đã hoàn thành': 'Review completed',
  'đã gửi kết quả cho': 'sent the result to',
  '. Quyết định review đang bị khoá.': '. Review decisions are locked.',
  'Dataset đã thay đổi sau khi gửi; file là của bản dataset trước.':
    'The dataset changed after sending; the file belongs to the previous dataset.',
  'Dataset đã thay đổi sau khi gửi; danh sách này là của bản dataset trước.':
    'The dataset changed after sending; this list belongs to the previous dataset.',
  'Xem lỗi cần sửa →': 'See what to fix →',
  'Cả hai': 'Both',
  'Lúc gửi': 'When sent',
  'Không khung': 'No boxes',
  'Hiện khung': 'Show box',
  'Khung hiển thị': 'Boxes shown',
  'Công cụ xem ảnh': 'Image tools',
  'Khung liền: nhãn lúc gửi': 'Solid box: the label when sent',
  'Khung xanh nét đứt: nhãn hiện tại': 'Blue dashed box: the label now',
  'Xem toàn ảnh (Z)': 'Whole image (Z)',
  'Phóng vào chỗ lỗi (Z)': 'Zoom to the error (Z)',
  'Xem toàn ảnh': 'Whole image',
  'Phóng vào chỗ lỗi': 'Zoom to the error',
  'Thoát toàn màn hình (F)': 'Exit full screen (F)',
  'Toàn màn hình (F)': 'Full screen (F)',
  'Thoát toàn màn hình': 'Exit full screen',
  'Toàn màn hình': 'Full screen',
  'Mở ảnh gốc trong tab mới': 'Open the original image in a new tab',
  '←/→ chuyển mục · Esc thoát': '←/→ next item · Esc to exit',
  'Phím tắt: A đồng ý · R từ chối · ←/→ mục · Z · B · F':
    'Shortcuts: A accept · R reject · ←/→ items · Z · B · F',
  'Nhãn lúc gửi': 'Label when sent',
  'Lý do cảnh báo': 'Why flagged',
  '; chưa xác nhận là lỗi.': '; not confirmed as an error.',
  '✓ Đã đồng ý': '✓ Accepted',
  '✗ Đã từ chối': '✗ Rejected',
  '. Chọn lại để đổi.': '. Choose again to change it.',
  'Từ chối thì mục được đánh lỗi lại, vào lần gửi tiếp và thành issue CVAT.':
    'Rejected, the item is marked again, goes into the next round and becomes a CVAT issue.',
  '+ Thêm ghi chú': '+ Add a note',
  'Ghi chú gửi kèm': 'Note to send along',
  'Phím tắt: A đồng ý · R từ chối · ←/→': 'Shortcuts: A accept · R reject · ←/→',
  'đồng ý': 'accepted',
  'từ chối': 'rejected',
  chờ: 'to check',
  'mục đã sửa,': 'items fixed,',
  'Chọn file…': 'Choose a file…',
  'Chưa chọn file': 'No file chosen',
  'Kiểm tra bản sửa': 'Check the fixes',
  'mục ·': 'items ·',
  'đồng ý ·': 'accepted ·',
  'từ chối.': 'rejected.',
  'Đã kiểm tra hết.': 'All checked.',
  'mục bị từ chối đã được đánh lỗi lại; về': 'rejected items were marked again; go to the',
  'trang dự án': 'project page',
  'bấm Hoàn thành để gửi vòng mới (kèm issue CVAT).':
    'and press Complete to send a new round (with CVAT issues).',
  'Mọi bản sửa đều được đồng ý.': 'Every fix was accepted.',
  'Chờ kiểm tra': 'To check',
  '✓ Đồng ý': '✓ Accepted',
  '✗ Từ chối': '✗ Rejected',
  '· Chờ kiểm tra': '· To check',
  'Bản sửa này được không?': 'Is this fix right?',
  'Đồng ý': 'Accept',
  'Từ chối': 'Reject',
  'lưu nhãn hiện tại là đúng.': 'saves the current label as correct.',
  'đánh lỗi lại mục này: nó vào lần gửi tiếp và thành issue trong CVAT.':
    'marks this item again: it goes into the next round and becomes a CVAT issue.',
  'Đã đồng ý': 'Accepted',
  'Đã từ chối': 'Rejected',
  'Ghi chú (không bắt buộc, gửi kèm khi từ chối)': 'Note (optional, sent with a rejection)',
  'Chỉ Leader hoặc Reviewer được kiểm tra bản sửa.':
    'Only the Leader or a Reviewer can check the fixes.',
  'verdict phải là accept hoặc reject.': 'verdict must be accept or reject.',
  'Thiếu item_id.': 'item_id is missing.',
  'Không tìm thấy mục này trong bản sửa.': 'This item is not in the returned round.',
  'Nhãn hiện tại không còn trong dataset.': 'The current label is no longer in the dataset.',
  'Mục này không có khung để đánh dấu lại.': 'This item has no box to mark again.',
  'Project không có bản sửa nào đang chờ kiểm tra.':
    'The project has no returned round waiting to be checked.',
  'Gửi kèm mục “Cần xem lại”:': 'Also send “To look at again”:',
  'case Chưa chắc và': 'Unsure cases and',
  'case chưa kiểm tra, tách khỏi lỗi đã xác nhận. Không chọn thì Annotator chỉ nhận lỗi đã xác nhận.':
    'unchecked cases, apart from the confirmed errors. Unticked, the Annotators get the confirmed errors only.',
  'include_review phải là true hoặc false.': 'include_review must be true or false.',
  'Reviewer chưa chắc': 'Reviewer unsure',
  'Chưa ai kiểm tra': 'Not checked yet',
  'Cần xem lại': 'To look at again',
  'Có thể thiếu': 'Possibly missing',
  'Điểm rủi ro': 'Risk score',
  '; chưa xác nhận là lỗi. Kiểm tra rồi sửa nếu sai.':
    '; not confirmed as an error. Check it and fix it if it is wrong.',
  'issue trên ảnh: [Lỗi], [Thiếu nhãn], [Cần xem lại]. Trong CVAT bấm vào vùng đỏ để đọc, sửa xong bấm Resolve.':
    'issues on the images: [Lỗi] (error), [Thiếu nhãn] (missing label), [Cần xem lại] (look again). In CVAT click a red region to read it, and press Resolve once fixed.',
  'Dataset không có ảnh nào.': 'The dataset has no images.',
  'Lấy dữ liệu để sửa': 'Get the data to fix',
  'Đưa vào công cụ': 'Put into a tool',
  'Tạo task với toàn bộ ảnh và nhãn hiện tại, mỗi lần gửi một task.':
    'Creates a task with every image and the current labels, one task per round sent.',
  'Hoặc tải về (.zip)': 'Or download (.zip)',
  'Toàn bộ ảnh và nhãn, để nhập vào công cụ khác. Giữ:':
    'Every image and label, to import into another tool. Keeps:',
  'Đang tải lỗi cần sửa…': 'Loading what to fix…',
  'Bạn có lỗi cần sửa': 'You have labels to fix',
  'Bạn đã gửi lại bản đã sửa': 'You returned the fixed file',
  '. Làm theo ba bước dưới đây.': '. Follow the three steps below.',
  '. Reviewer đang kiểm tra; bên dưới là kết quả từng lỗi.':
    '. The Reviewers are checking it; below is what became of each error.',
  'Dataset đã thay đổi sau khi gửi; danh sách lỗi là của bản dataset trước.':
    'The dataset changed after sending; the error list belongs to the previous dataset.',
  'Xem ảnh cần sửa': 'See the images to fix',
  'Sửa xong thì xuất nhãn từ công cụ (không cần kèm ảnh, định dạng nào ở bước 1 cũng được) rồi chọn file ở đây: .zip, .xml, .json hoặc .txt.':
    'When done, export the labels from the tool (no images needed, any format of step 1) and pick the file here: .zip, .xml, .json or .txt.',
  'Leader đang import dataset. Trạng thái tự cập nhật.':
    'The Leader is importing the dataset. The status updates by itself.',
  'Chưa có lỗi nào được gửi cho bạn': 'Nothing has been sent to you to fix yet',
  'Khi Reviewer hoàn thành review và chọn bạn, lỗi cần sửa và ảnh sẽ hiện ở đây.':
    'When a Reviewer completes the review and picks you, the labels to fix and their images show here.',
  'File đã gửi': 'Sent file',
  'Gửi lại bản đã sửa thay Annotator': 'Return the fixed file for the Annotators',
  'Chọn file nhãn đã sửa (.zip, .xml, .json hoặc .txt, ở bất kỳ định dạng nào SmartReview import được).':
    'Pick the fixed label file (.zip, .xml, .json or .txt, in any format SmartReview imports).',
  '1. Tải dataset (.zip)': '1. Download the dataset (.zip)',
  'Tải .zip': 'Download .zip',
  'Toàn bộ ảnh và nhãn. Giữ:': 'Every image and label. Keeps:',
  'Ultralytics YOLO · TXT mỗi ảnh': 'Ultralytics YOLO · one TXT per image',
  'Box, polygon, polyline': 'Boxes, polygons, polylines',
  'Box; polygon và polyline thành khung bao (polygon giữ thêm segmentation)':
    'Boxes; polygons and polylines become their bounding box (polygons also keep a segmentation)',
  'Box; polygon và polyline thành khung bao':
    'Boxes; polygons and polylines become their bounding box',
  'Box, polygon; polyline thành khung bao': 'Boxes, polygons; polylines become their bounding box',
  'Box, polygon; polyline nhiều điểm đọc lại thành polygon':
    'Boxes, polygons; polylines of many points read back as polygons',
  'Box; polygon và polyline thành khung bao; dấu cách trong tên nhãn thành “_”':
    'Boxes; polygons and polylines become their bounding box; spaces in label names become “_”',
  'Mọi nhãn và thuộc tính': 'Every label and attribute',
  '2. Gán vào công cụ': '2. Assign to a tool',
  'Công cụ': 'Tool',
  'Đang đưa vào CVAT…': 'Putting it into CVAT…',
  'Đưa vào CVAT': 'Put into CVAT',
  'Mở task #': 'Open task #',
  'trong CVAT ↗': 'in CVAT ↗',
  'Đang tải ảnh lên CVAT; dataset lớn có thể mất vài phút.':
    'Uploading the images to CVAT; a large dataset can take a few minutes.',
  'Đã tạo task với đủ ảnh và nhãn hiện tại.':
    'Created a task with every image and the current labels.',
  'Task của lần gửi này đã có trong CVAT; mở lại task đó.':
    'The task of this round is already in CVAT; it is opened again.',
  'Tạo một task trong CVAT với toàn bộ ảnh và nhãn, mỗi lần gửi một task.':
    'Creates a task in CVAT with every image and label, one task per round sent.',
  '3. Xem ảnh cần sửa': '3. See the images to fix',
  'Từng lỗi trên ảnh: khung, loại lỗi, nhãn cần sửa thành, ghi chú của Reviewer. Sửa xong thì gửi lại ở trang này.':
    "Each error on its image: the box, the error type, the label to fix it to, the Reviewer's note. Send the fixed file back on that page.",
  'Chỉ xuất được dataset ảnh rời.': 'Only datasets of separate images can be exported.',
  'Project không ở trạng thái chờ Annotator sửa.':
    'The project is not waiting for the Annotators to fix it.',
  'Chỉ đưa được dataset ảnh rời vào CVAT.':
    'Only datasets of separate images can be put into CVAT.',
  'CVAT không tạo job cho task.': 'CVAT made no job for the task.',
  'CVAT xử lý ảnh quá 10 phút.': 'CVAT took more than 10 minutes on the images.',
  'Xem file đã gửi →': 'See the sent file →',
  'Mở lại review': 'Reopen review',
  'File kết quả đã gửi cho': 'The result file sent to',
  'sẽ bị thu hồi. Annotator không xem được lỗi cần sửa nữa.':
    'will be withdrawn. The Annotators can no longer see what to fix.',
  'Quyết định review được mở khoá để sửa tiếp; sau đó bấm Hoàn thành để gửi lại.':
    'Review decisions are unlocked for editing; press Complete afterwards to send again.',
  'Thu hồi và mở lại': 'Withdraw and reopen',
  'Đang mở lại…': 'Reopening…',
  'Chỉ Leader hoặc Reviewer được mở lại review.':
    'Only the Leader or a Reviewer can reopen the review.',
  'Đã khoá: review đã hoàn thành và đã gửi cho Annotator.':
    'Locked: the review was completed and sent to the Annotators.',
  'Review đã hoàn thành và đã gửi cho Annotator.':
    'The review was completed and sent to the Annotators.',
  'Review đã hoàn thành và đã gửi cho Annotator. Leader hoặc Reviewer mở lại review thì mới sửa được.':
    'The review was completed and sent to the Annotators. It can be edited only after the Leader or a Reviewer reopens it.',
  'Đang tải kết quả review…': 'Loading the review result…',
  'Lỗi cần sửa ·': 'Labels to fix ·',
  'gửi lúc': 'sent at',
  cho: 'to',
  'Tải file (.json)': 'Download file (.json)',
  'Kết nối CVAT chưa được làm. Tạm thời mở CVAT và sửa theo danh sách này.':
    'The CVAT connection is not built yet. For now open CVAT and fix the labels from this list.',
  'Mở trong CVAT (sắp có)': 'Open in CVAT (coming soon)',
  'nhãn sai ·': 'wrong labels ·',
  'đối tượng thiếu nhãn': 'objects without a label',
  'đối tượng thiếu nhãn ·': 'objects without a label ·',
  'cần xem lại': 'to look at again',
  Lọc: 'Filter',
  'Nhãn sai': 'Wrong label',
  'Thiếu nhãn': 'Missing label',
  'Không có lỗi nào trong mục này.': 'Nothing to fix in this group.',
  'Danh sách lỗi cần sửa': 'Labels to fix',
  'Loại lỗi': 'Error type',
  'Nhãn hiện tại': 'Current label',
  'Sửa thành': 'Change to',
  'Thiếu nhãn: cần vẽ thêm khung tại vùng được đánh dấu':
    'Missing label: draw a box at the marked region',
  'Đối tượng': 'Object',
  'Vị trí (px)': 'Position (px)',
  'Ghi chú của Reviewer': "Reviewer's note",
  'Project chưa được gửi cho Annotator.': 'This project has not been sent to the Annotators.',
  'Kết quả review của project này không gửi cho bạn.':
    'The review result of this project was not sent to you.',
  'Chỉ Leader hoặc Reviewer được hoàn thành review.':
    'Only the Leader or a Reviewer can complete the review.',
  'Chọn ít nhất một Annotator để gửi.': 'Choose at least one Annotator.',
  'Chỉ gửi được cho Annotator của project này.':
    "It can only be sent to this project's Annotators.",
  'Project này đã được gửi cho Annotator.': 'This project was already sent to the Annotators.',
  'Database chưa có bảng project_handoffs. Chạy npm run db:migrate.':
    'The database has no project_handoffs table. Run npm run db:migrate.',
  'Có gợi ý AI': 'Has AI suggestions',
  'Chọn nhãn này': 'Select this label',
  'Gợi ý của AI về nhãn hiện có': 'AI suggestions about existing labels',
  'Hiện hoặc ẩn gợi ý của AI về nhãn': 'Show or hide the AI label suggestions',
  'Chạy AI để kiểm tra nhãn của cả project': 'Run the AI to check the labels of the whole project',
  'Leader chưa chạy AI cho project này.': 'The Leader has not run the AI for this project yet.',
  'Risk bên dưới là điểm kiểm tra bằng quy tắc riêng.':
    'The Risk below is a separate rule-based score.',
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
  'Tải lại bản đã lưu?': 'Reload the saved version?',
  'Bỏ thay đổi và tải lại': 'Discard changes and reload',
  'Các thay đổi chưa lưu trên ảnh này sẽ mất.': 'Unsaved changes on this image will be lost.',
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
  'Thành viên': 'Member',
  'Tạo project, mời và quản lý thành viên.': 'Create projects, invite and manage members.',
  'Chọn vai trò làm việc': 'Choose your working role',
  'Kiểm tra và đánh giá nhãn trong các project bạn tham gia.':
    'Check and review labels in the projects you joined.',
  'Xem và sửa nhãn trong các project bạn tham gia.':
    'View and edit labels in the projects you joined.',
  project: 'project(s)',
  'Đổi vai trò': 'Switch role',
  'Vai trò của bạn:': 'Your role:',
  'Thành viên project': 'Project members',
  'Đang tải thành viên…': 'Loading members…',
  'Người tạo (Leader)': 'Created by (Leader)',
  'Chưa gán — mọi Leader cùng quản lý': 'Unassigned — managed by every Leader',
  'Chưa có ai tham gia.': 'Nobody has joined yet.',
  'Chuyển sang': 'Move to',
  Xóa: 'Remove',
  'Xóa thành viên khỏi project?': 'Remove member from the project?',
  'Xóa thành viên': 'Remove member',
  'sẽ không vào được project này nữa. Bạn thêm lại được bất cứ lúc nào.':
    'will no longer be able to open this project. You can add them back at any time.',
  'Project chưa có dữ liệu. Leader cần import dataset trước khi bạn làm việc.':
    'This project has no data yet. The Leader needs to import a dataset before you can work.',
  // Messages from the API
  'Chỉ Leader được tạo project.': 'Only a Leader can create projects.',
  'Chỉ Leader của project được thực hiện thao tác này.': 'Only the project’s Leader can do this.',
  'Chức năng này chỉ dành cho Leader.': 'This is for Leaders only.',
  'Thành viên không thuộc project này.': 'That member is not part of this project.',
  'Vai trò phải là Reviewer hoặc Annotator.': 'The role must be Reviewer or Annotator.',
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
  'Chờ import, AI Check hoặc kiểm nhãn hoàn tất trước khi xóa.':
    'Wait for the import, AI Check or label verify to finish before deleting.',
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
  'Tối đa 100 ảnh mỗi project.': 'At most 100 images per project.',
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
  'Tối đa 100 ảnh, một annotation file, một metadata file và một guideline.':
    'At most 100 images, one annotation file, one metadata file and one guideline.',
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
  // Adding members directly
  'Bạn đổi được vai trò bất cứ lúc nào. Chưa có project? Nhờ Leader thêm bạn vào project.':
    'You can switch roles at any time. No project yet? Ask a Leader to add you to one.',
  'Các project Leader đã thêm bạn vào.': 'The projects a Leader added you to.',
  'Bạn chưa được thêm vào project nào với vai trò này. Nhờ Leader thêm bạn vào project.':
    'You have not been added to any project in this role. Ask a Leader to add you to one.',
  'Xem thành viên': 'View members',
  'Thêm thành viên': 'Add members',
  'Thêm Annotator': 'Add Annotators',
  'Tìm tài khoản': 'Find accounts',
  'Đang tải danh sách tài khoản…': 'Loading accounts…',
  'Mọi tài khoản thành viên đều đã ở trong project.':
    'Every member account is already in this project.',
  'Chọn tất cả': 'Select all',
  'Chọn tất cả kết quả': 'Select all results',
  'Không có tài khoản khớp.': 'No matching accounts.',
  'Chọn từ 1 đến 200 tài khoản.': 'Choose between 1 and 200 accounts.',
  'Vai trò': 'Role',
  'Đã thêm:': 'Added:',
  'Không tìm thấy tài khoản này.': 'That account was not found.',
  'Tài khoản Leader không thể làm thành viên project.':
    'A Leader account cannot be a project member.',
  'Đang lấy ảnh…': 'Fetching images…',
  'Xem giải thích': 'Show explanation',
  ảnh: 'image(s)',
  'Tối đa 100 ảnh / 200 MB tổng; 20 MB mỗi ảnh; annotation 10 MB.':
    'At most 100 images / 200 MB in total; 20 MB per image; annotations 10 MB.',
  // Import formats
  'Dataset đã có annotation, không cần chạy model. Nhận các định dạng CVAT xuất ra có box, polygon hoặc polyline; ảnh PNG, JPEG, WebP, GIF. Chưa nhận mask, keypoint, cuboid và tệp video.':
    'The dataset is already annotated; no model run is needed. Accepts the formats CVAT exports with boxes, polygons or polylines; PNG, JPEG, WebP and GIF images. Masks, keypoints, cuboids and video files are not accepted yet.',
  'Một tệp annotations.xml; box, polygon và polyline.':
    'One annotations.xml file; boxes, polygons and polylines.',
  'Một tệp annotations.xml chứa các track; ảnh đặt tên frame_000000, frame_000001… theo số khung hình.':
    'One annotations.xml file of tracks; images are named frame_000000, frame_000001… by frame number.',
  'Một tệp JSON chứa images, categories, annotations và bbox [x, y, width, height]. Chỉ kiểm tra bbox; segmentation/keypoints được giữ trong metadata. Không nhận COCO prediction hoặc panoptic.':
    'One JSON file with images, categories, annotations and bbox [x, y, width, height]. Only boxes are checked; segmentation/keypoints are kept in metadata. COCO predictions and panoptic files are not accepted.',
  'Một tệp JSON (thường là annotations/default.json) chứa categories và items.':
    'One JSON file (usually annotations/default.json) with categories and items.',
  'Mỗi ảnh một tệp XML trong thư mục Annotations; chọn tất cả các tệp đó.':
    'One XML file per image in the Annotations folder; choose all of them.',
  'Mỗi ảnh một tệp .txt cùng tên, kèm obj.names, classes.txt hoặc data.yaml để lấy tên lớp. Toạ độ là tỉ lệ nên cần đủ ảnh để đổi ra pixel.':
    'One .txt file per image with the same name, plus obj.names, classes.txt or data.yaml for the class names. Coordinates are fractions, so every image is needed to turn them into pixels.',
  'Mỗi ảnh một tệp XML; polygon và bounding_box.':
    'One XML file per image; polygons and bounding boxes.',
  'Mỗi ảnh một tệp .txt trong label_2, cùng tên với ảnh.':
    'One .txt file per image in label_2, named like the image.',
  'gt.txt (và labels.txt nếu có); ảnh đặt tên theo số khung hình, ví dụ 000001.jpg.':
    'gt.txt (and labels.txt if present); images are named by frame number, such as 000001.jpg.',
  'Một tệp JSON theo Schema 1.0.0 của SmartReview.':
    "One JSON file following SmartReview's Schema 1.0.0.",
  'tệp nhãn': 'annotation file(s)',
  'Các tệp nhãn tối đa 10 MB tổng cộng.': 'Annotation files can be at most 10 MB in total.',
  'Không nhận ra định dạng của tệp nhãn đã chọn.':
    'The format of the chosen annotation files was not recognised.',
  'Tệp nén không có tệp nhãn thuộc định dạng được hỗ trợ.':
    'The archive has no annotation files in a supported format.',
  'Quá nhiều tệp nhãn (tối đa 110).': 'Too many annotation files (110 at most).',
  'Định dạng này cần đúng một tệp nhãn.': 'This format needs exactly one annotation file.',
  'PASCAL VOC 1.1 · XML mỗi ảnh': 'PASCAL VOC 1.1 · one XML per image',
  'YOLO 1.1 / Ultralytics YOLO · TXT mỗi ảnh': 'YOLO 1.1 / Ultralytics YOLO · one TXT per image',
  'LabelMe 3.0 · XML mỗi ảnh': 'LabelMe 3.0 · one XML per image',
  'KITTI · TXT mỗi ảnh': 'KITTI · one TXT per image',
  'Khi chọn tệp nén, định dạng được tự nhận diện từ tệp nhãn bên trong. Đổi ở đây nếu tệp nén có nhiều bộ nhãn và bạn muốn dùng bộ khác.':
    'When you choose an archive, the format is detected from the annotation files inside it. Change it here if the archive holds several annotation sets and you want another one.',
  // 3D projects
  'Kéo khung': 'Dragging the view',
  'Phóng to': 'Zooming in',
  'Thu nhỏ': 'Zooming out',
  'Giữ yên 1 giây để ngắt lệnh': 'Hold still for 1 second to let go',
  'Đã ngắt lệnh thu phóng': 'Zoom let go',
  'Thu phóng xong, giữ yên tay 1 giây: ngắt lệnh':
    'After zooming, hold the hand still for 1 second: let go',
  'Không làm gì': 'Nothing',
  'Cử chỉ sẽ ghi': 'Gesture to record',
  'Ghi lại các điểm bàn tay thành tệp JSON để chỉnh và kiểm tra luật cử chỉ':
    'Record the hand landmarks to a JSON file, for tuning and testing the gesture rules',
  '■ Dừng & lưu': '■ Stop & save',
  '● Ghi': '● Record',
  'Giơ ngón trỏ, đưa sang trái / phải: kéo khung sang trái / phải':
    'Index finger up, moved left / right: drag the view left / right',
  'Giơ ngón trỏ, đưa lên / xuống: kéo khung lên / xuống':
    'Index finger up, moved up / down: drag the view up / down',
  'Chụm các ngón rồi bung ra: phóng to': 'Bunch the fingers, then spread them: zoom in',
  'Từ bàn tay mở, chụm các ngón lại: thu nhỏ': 'From an open hand, bunch the fingers: zoom out',
  'Giơ 1–9 ngón, giữ yên: gọi cờ số đó':
    'Hold up 1–9 fingers, still: call up the flag with that number',
  'Tắt điều khiển bằng cử chỉ': 'Turn off gesture control',
  'Điều khiển bằng cử chỉ tay qua webcam': 'Control with hand gestures through the webcam',
  'Tắt webcam': 'Turn off the webcam',
  'Chưa thấy cử chỉ': 'No gesture seen',
  'Thu phóng': 'Zooming',
  'Gọi cờ': 'Calling up a flag',
  'Đang mở webcam và tải MediaPipe…': 'Opening the webcam and loading MediaPipe…',
  'Trình duyệt không cho mở webcam ở địa chỉ này (cần localhost hoặc HTTPS).':
    'The browser does not allow the webcam at this address (localhost or HTTPS is needed).',
  'Chưa được cấp quyền dùng webcam. Cho phép trong trình duyệt rồi bật lại.':
    'The webcam permission was not granted. Allow it in the browser and switch on again.',
  'Không mở được webcam. Kiểm tra máy có camera và chưa bị ứng dụng khác giữ.':
    'The webcam could not be opened. Check that the machine has a camera and no other app is holding it.',
  'Không tải được MediaPipe hoặc model bàn tay. Kiểm tra kết nối mạng.':
    'MediaPipe or the hand model could not be loaded. Check the network connection.',
  'Cử chỉ': 'Gestures',
  'Ẩn hiện thanh công cụ': 'Show or hide the bars',
  'Bảng review': 'Review panel',
  'Ẩn bảng bên phải': 'Hide the right panel',
  'Hiện bảng bên phải': 'Show the right panel',
  Ẩn: 'Hide',
  'Ảnh camera không bắt buộc, chỉ để đối chiếu khi review: dùng component camera_image, hoặc ảnh JPEG rời đặt tên <camera>/<frame>.jpg, với frame là timestamp hoặc số thứ tự frame tính từ 0.':
    'Camera images are optional and only help the review: use the camera_image component, or loose JPEG files named <camera>/<frame>.jpg, where frame is the timestamp or the frame number counted from 0.',
  'Tệp .zip được mở ngay trên trình duyệt; máy chủ chỉ nhận các tệp parquet và ảnh camera bên trong. Chọn được nhiều tệp .zip cùng lúc, ví dụ một tệp lidar và một tệp ảnh camera.':
    'The .zip is opened in the browser; the server only receives the parquet files and camera images inside it. Several .zip files can be chosen at once, for example one with the lidar and one with the camera images.',
  'Chọn các tệp parquet cùng lúc, hoặc chọn thư mục chứa chúng. Tệp được nhận diện theo thư mục (lidar_box/…) hoặc theo tên Waymo đặt (validation_lidar_box_….parquet).':
    'Pick the parquet files at once, or pick the folder that holds them. A file is recognised by its folder (lidar_box/…) or by the name Waymo gives it (validation_lidar_box_….parquet).',
  'Tổng tối đa 2 GB. Tệp parquet gốc không được lưu lại sau khi chuyển đổi.':
    'At most 2 GB in total. The source parquet files are not kept after conversion.',
  'Chọn thư mục chứa lidar/, lidar_box/, lidar_calibration/, vehicle_pose/ (và lidar_pose/, camera_image/ nếu có) thay cho lựa chọn trên.':
    'Pick the folder holding lidar/, lidar_box/, lidar_calibration/, vehicle_pose/ (and lidar_pose/, camera_image/ if any) instead of the choice above.',
  'Thư mục ảnh camera rời, không bắt buộc': 'Folder of loose camera images (optional)',
  'Thư mục ảnh camera rời': 'Folder of loose camera images',
  'Mỗi camera một thư mục con, ví dụ FRONT/1522688014970187.jpg. Bỏ qua nếu đã có camera_image.':
    'One subfolder per camera, for example FRONT/1522688014970187.jpg. Leave empty when camera_image is given.',
  'Ảnh camera rời': 'Loose camera images',
  'Ảnh JPEG của các camera ở từng frame, để đối chiếu khi review.':
    'JPEG images of the cameras at each frame, to compare against during review.',
  'Có cả camera_image lẫn ảnh camera rời. Chỉ dùng một trong hai nguồn ảnh.':
    'Both camera_image and loose camera images were given. Use only one source of images.',
  'Có ảnh camera trùng tên (cùng camera, cùng frame).':
    'Some camera images have the same name (same camera, same frame).',
  'Mỗi ảnh camera tối đa 20 MB.': 'A camera image may be at most 20 MB.',
  'Vượt giới hạn: tổng các tệp tối đa 2 GB.': 'Over the limit: the files may total at most 2 GB.',
  'Ảnh camera': 'Camera images',
  'Hiện ảnh camera': 'Show camera images',
  'Ẩn ảnh camera': 'Hide camera images',
  'Không có ảnh': 'No image',
  'Camera trước': 'Previous camera',
  'Camera sau': 'Next camera',
  'Đóng ảnh camera': 'Close camera image',
  'Không tải được ảnh camera này.': 'This camera image could not be loaded.',
  'Upload tối đa 2 GB cho một project 3D.': 'A 3D project upload may be at most 2 GB.',
  'Ảnh camera phải là JPEG đặt tên <camera>/<frame>.jpg.':
    'A camera image must be a JPEG named <camera>/<frame>.jpg.',
  'Quá nhiều tệp.': 'Too many files.',
  'Không ảnh camera nào khớp frame của segment. Tên ảnh phải là timestamp hoặc số thứ tự frame.':
    'No camera image matches a frame of the segment. Images must be named by timestamp or by frame number.',
  'Không có tệp này của frame.': 'The frame has no such file.',
  'Review cuboid trên point cloud': 'Review cuboids on the point cloud',
  'Xem từng frame của segment, chọn một cuboid để xem chi tiết và lưu quyết định review.':
    'Go through the segment frame by frame, select a cuboid to see its details and save a review decision.',
  'Mở review 3D →': 'Open 3D review →',
  'Góc nhìn': 'View',
  Trên: 'Top',
  'Mặt trước': 'Front',
  'Mặt bên': 'Side',
  'đã review': 'reviewed',
  'Phối cảnh': 'Perspective',
  'Tên cuboid': 'Cuboid names',
  'Màu cuboid': 'Cuboid colour',
  'Theo loại': 'By type',
  'Theo kết quả review': 'By review result',
  'Chưa review': 'Not reviewed',
  Đúng: 'Correct',
  Lỗi: 'Error',
  'Cuboid trong frame': 'Cuboids in this frame',
  'Frame này không có cuboid.': 'This frame has no cuboids.',
  'Chi tiết cuboid': 'Cuboid details',
  'Đưa camera tới': 'Move camera here',
  'Bỏ chọn cuboid': 'Deselect cuboid',
  Loại: 'Type',
  'Kích thước (m)': 'Size (m)',
  'Vị trí (m)': 'Position (m)',
  'Cách xe': 'From the vehicle',
  'Hướng (yaw)': 'Heading (yaw)',
  'Điểm trong box': 'Points in box',
  'Tốc độ': 'Speed',
  'Xuất hiện': 'Appears in',
  'Cuboid (vị trí, kích thước, hướng)': 'Cuboid (position, size, heading)',
  'Ghi đè quyết định đã có ở các frame đó.': 'Replaces the decisions those frames already have.',
  'Đối tượng đang chọn không có cuboid ở frame này.':
    'The selected object has no cuboid in this frame.',
  'Bấm vào một cuboid trong point cloud, hoặc chọn trong danh sách trên, để xem chi tiết và review.':
    'Click a cuboid in the point cloud, or pick one in the list above, to see its details and review it.',
  'Không có cuboid này trong scene.': 'The scene has no such cuboid.',
  'Thiếu đối tượng không phải lỗi của một cuboid đã có.':
    'A missing object is not an error of an existing cuboid.',
  '← Dự án': '← Projects',
  'Point cloud và cuboid': 'Point cloud and cuboids',
  'Xem từng frame của segment: point cloud của các lidar, cuboid đã gán nhãn, quỹ đạo xe.':
    'Go through the segment frame by frame: the lidar point clouds, the labelled cuboids, the vehicle trajectory.',
  'Mở viewer point cloud →': 'Open the point cloud viewer →',
  Điểm: 'Points',
  'Cuboid theo loại': 'Cuboids by type',
  'Dữ liệu': 'Data',
  'Định dạng': 'Format',
  'Bù chuyển động': 'Motion compensation',
  'Có (lidar TOP, từ lidar_pose)': 'Yes (TOP lidar, from lidar_pose)',
  'Không: segment không có lidar_pose': 'No: the segment has no lidar_pose',
  'Dung lượng lưu': 'Stored size',
  'Ngày tạo': 'Created',
  'Vai trò của bạn': 'Your role',
  'Chọn dữ liệu của segment': 'Choose the data of the segment',
  'Nhập segment': 'Import segment',
  'Độ cao': 'Height',
  'Cường độ': 'Intensity',
  'Khoảng cách': 'Range',
  'Theo lidar': 'By lidar',
  'Hệ toạ độ': 'Frame of reference',
  Xe: 'Vehicle',
  'Toàn cục': 'World',
  'Camera bám theo xe': 'Camera follows the vehicle',
  'Quỹ đạo xe': 'Vehicle trajectory',
  'Đặt lại góc nhìn': 'Reset view',
  Màu: 'Colour',
  'Cỡ điểm': 'Point size',
  'Bù chuyển động (TOP)': 'Motion compensation (TOP)',
  'Segment này không có lidar_pose.': 'This segment has no lidar_pose.',
  'Hiện cuboid': 'Show cuboids',
  'Cảm biến': 'Sensors',
  'Hiện vị trí lidar trên xe': 'Show the lidars on the vehicle',
  'Kéo chuột để xoay, chuột phải để dời, cuộn để thu phóng. Phím cách: phát / dừng. ← →: từng frame.':
    'Drag to rotate, right-drag to pan, scroll to zoom. Space: play / pause. ← →: frame by frame.',
  'Hiển thị': 'Display',
  'Tạm dừng': 'Pause',
  Phát: 'Play',
  'Frame trước': 'Previous frame',
  'Frame sau': 'Next frame',
  'Tốc độ phát': 'Playback speed',
  'Đang tải scene…': 'Loading the scene…',
  'Đang tải point cloud…': 'Loading the point cloud…',
  'Project chưa sẵn sàng. Quay lại trang project để xem trạng thái.':
    'The project is not ready. Go back to the project page to see its status.',
  'Trình duyệt không mở được WebGL nên không vẽ được point cloud.':
    'The browser could not start WebGL, so the point cloud cannot be drawn.',
  'Point cloud của frame này không khớp số điểm trong scene.':
    'The point cloud of this frame does not match the point count in the scene.',
  'Không có point cloud của frame này.': 'This frame has no point cloud.',
  'Không tìm thấy dữ liệu project trên kho lưu trữ.': 'The project data was not found in storage.',
  'Project chưa có dữ liệu.': 'The project has no data yet.',
  'Project này chỉ có dữ liệu trên máy đã import. Bật kho lưu trữ chung rồi tạo lại project để chia sẻ.':
    'This project only has data on the machine that imported it. Turn on shared storage and create the project again to share it.',
  'Project 3D': '3D Projects',
  '+ Project 3D mới': '+ New 3D Project',
  'Project 3D mới': 'New 3D Project',
  'Tạo project → upload segment Waymo → chuyển thành point cloud → lưu trữ.':
    'Create project → upload a Waymo segment → convert to point clouds → store.',
  'Chưa có project 3D. Chọn + Project 3D mới để bắt đầu.':
    'No 3D projects yet. Choose + New 3D Project to start.',
  'Đang chuyển point cloud…': 'Converting point clouds…',
  'Đang lưu point cloud…': 'Storing point clouds…',
  'đối tượng': 'objects',
  'Tên project': 'Project name',
  'Mô tả, không bắt buộc': 'Description (optional)',
  'Một segment của Waymo Open Dataset v2: mỗi component một tệp .parquet. Cuboid 3D trong lidar_box là nhãn sẽ được review.':
    'One segment of the Waymo Open Dataset v2: one .parquet file per component. The 3D cuboids in lidar_box are the labels to be reviewed.',
  'Tệp .zip được mở ngay trên trình duyệt; máy chủ chỉ nhận các tệp parquet bên trong.':
    'The .zip is opened in the browser; the server only receives the parquet files inside it.',
  'Chọn cả năm tệp cùng lúc, hoặc chọn thư mục chứa chúng. Tệp được nhận diện theo thư mục (lidar_box/…) hoặc theo tên Waymo đặt (validation_lidar_box_….parquet).':
    'Pick all five files at once, or pick the folder that holds them. A file is recognised by its folder (lidar_box/…) or by the name Waymo gives it (validation_lidar_box_….parquet).',
  'Tổng tối đa 1 GB. Tệp gốc không được lưu lại sau khi chuyển đổi.':
    'At most 1 GB in total. The source files are not kept after conversion.',
  'Tệp nén segment (.zip)': 'Segment archive (.zip)',
  'Tệp parquet': 'Parquet files',
  'Các tệp nằm trong thư mục con?': 'Are the files in subfolders?',
  'Chọn thư mục chứa lidar/, lidar_box/, lidar_calibration/, lidar_pose/ và vehicle_pose/ thay cho lựa chọn trên.':
    'Pick the folder holding lidar/, lidar_box/, lidar_calibration/, lidar_pose/ and vehicle_pose/ instead of the choice above.',
  'Thư mục segment': 'Segment folder',
  'Component nhận diện được': 'Components found',
  'Bắt buộc': 'Required',
  'Tùy chọn': 'Optional',
  'Chưa có tệp': 'No file yet',
  'Chưa có tệp: point cloud của lidar TOP sẽ không được bù chuyển động.':
    'No file yet: the TOP lidar point cloud will not be motion-compensated.',
  'Range image của 5 lidar: nguồn của point cloud.':
    'Range images of the 5 lidars: the source of the point clouds.',
  'Vị trí gắn và góc nghiêng các tia của từng lidar.':
    'Mounting position and beam inclinations of each lidar.',
  'Vị trí của xe ở từng frame.': 'The vehicle pose at each frame.',
  'Cuboid 3D đã gán nhãn: thứ sẽ được review.': 'The labelled 3D cuboids: what gets reviewed.',
  'Pose từng điểm của lidar TOP, dùng để bù chuyển động khi lidar quay.':
    'Per-point pose of the TOP lidar, used to compensate for motion while the lidar spins.',
  'Tạo project 3D': 'Create 3D project',
  'Chọn tệp nén chứa các tệp parquet của segment.':
    'Choose an archive holding the parquet files of the segment.',
  'Chọn các tệp parquet của segment.': 'Choose the parquet files of the segment.',
  'Các tệp thuộc nhiều segment khác nhau. Mỗi project 3D là một segment.':
    'The files belong to different segments. A 3D project is one segment.',
  'Vượt giới hạn: tổng các tệp parquet tối đa 1 GB.':
    'Over the limit: the parquet files may total at most 1 GB.',
  'Đang giải nén tệp parquet…': 'Unpacking the parquet files…',
  'Đã tải lên. Đang xử lý point cloud…': 'Uploaded. Processing the point clouds…',
  'Kết nối bị ngắt. Xem trạng thái project 3D ở trang Dự án trước khi thử lại.':
    'The connection dropped. Check the 3D project on the Projects page before retrying.',
  'Giữ trang mở đến khi hoàn tất. Chuyển đổi và lưu point cloud của một segment có thể mất vài phút.':
    'Keep this page open until it finishes. Converting and storing the point clouds of a segment can take a few minutes.',
  'Project đã được giữ lại. Bạn có thể chọn lại tệp và thử import.':
    'The project was kept. You can choose the files again and retry the import.',
  'Upload tối đa 1 GB cho một project 3D.': 'A 3D project upload may be at most 1 GB.',
  'Project 3D chỉ nhận tệp .parquet của Waymo Open Dataset v2.':
    '3D projects only take .parquet files of the Waymo Open Dataset v2.',
  'Quá nhiều tệp parquet.': 'Too many parquet files.',
  'Chưa có Python cho project 3D. Đặt SMARTREVIEW_3D_PYTHON trong .env tới một Python có numpy và pyarrow.':
    'No Python for 3D projects. Set SMARTREVIEW_3D_PYTHON in .env to a Python that has numpy and pyarrow.',
  'Python của project 3D thiếu numpy hoặc pyarrow. Cài hai gói đó rồi thử lại.':
    'The Python for 3D projects lacks numpy or pyarrow. Install both and retry.',
  'Số tệp point cloud không khớp số frame của scene.':
    'The number of point cloud files does not match the frames of the scene.',
  'Chưa có bảng cho project 3D. Chạy npm run db:migrate.':
    'The 3D project tables are missing. Run npm run db:migrate.',
  'Chờ import hoàn tất trước khi xóa.': 'Wait for the import to finish before deleting.',
  'Scene không có frame nào.': 'The scene has no frames.',
  'Frame trong scene sai khuôn dạng.': 'A frame of the scene is malformed.',
};

// Strings built with values in them. Tried only when there is no exact entry above.
export const enRules: [RegExp, string][] = [
  [/^Xoá \/ chưa thêm nhãn · (\d+) ·$/, 'Removed / not added · $1 ·'],
  [
    /^Phần ảnh trong box giống (.+) hoặc (.+) \((\d+%)\) hơn (.+) \((\d+%)\)\.$/,
    'The pixels in the box look more like $1 or $2 ($3) than $4 ($5).',
  ],
  [
    /^Phần ảnh trong box giống (.+) \((\d+%)\) hơn (.+) \((\d+%)\)\.$/,
    'The pixels in the box look more like $1 ($2) than $3 ($4).',
  ],
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
    /^File thiếu (\d+) ảnh của project\. Xuất đủ mọi ảnh rồi gửi lại\.$/,
    'The file lacks $1 of the project images. Export every image and send again.',
  ],
  [
    /^File có ảnh không thuộc project hoặc bị lặp: (.+)$/,
    'The file has an image that is not in the project, or twice: $1',
  ],
  [
    /^Kích thước ảnh (.+) không khớp ảnh của project\.$/,
    'The size of image $1 does not match the project image.',
  ],
  [/^(.+) · AI không thấy đối tượng$/, '$1 · AI sees no object'],
  [
    /^AI không thấy đối tượng nào tại khung “(.+)” này — nhãn có thể thừa\.$/,
    'The AI sees no object at this “$1” box — the label may be extra.',
  ],
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
  [/^Thêm (\d+) thành viên$/, 'Add $1 members'],
  [
    /^Không có model "(.+)" trong thư mục model\/Model_bbox\.$/,
    'There is no model "$1" in the model/Model_bbox folder.',
  ],
  [/^Model "(.+)" không dùng được cho bước này\.$/, 'Model "$1" cannot be used for this step.'],
  [/^Không tìm thấy tài khoản: (.+)$/, 'Accounts not found: $1'],
  [
    /^Đã ở project với vai trò khác: (.+)\. Đổi vai trò trong danh sách thành viên\.$/,
    'Already in the project in another role: $1. Change their role in the member list.',
  ],
  [/^Thiếu (\d+)(: .+)?$/, 'Missing $1$2'],
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
  [
    /^Tài khoản này đã là (Reviewer|Annotator) của project\. Đổi vai trò trong danh sách thành viên\.$/,
    'That account is already a $1 in this project. Change the role in the member list.',
  ],
  [/^Trùng tên tệp nhãn: (.+)$/, 'Duplicate annotation file name: $1'],
  [/^(.+) · (\d+) tệp$/, '$1 · $2 files'],
  [
    /^Tệp nén này không có tệp nhãn dạng (.+)\.$/,
    'This archive has no annotation files in the $1 format.',
  ],
  [/^Thiếu tệp parquet của: (.+)\.$/, 'Missing the parquet files of: $1.'],
  [/^Quá nhiều tệp cho (\w+)\.$/, 'Too many files for $1.'],
  [/^Quá nhiều tệp cho (\w+) \(tối đa (\d+)\)\.$/, 'Too many files for $1 (at most $2).'],
  [/^Trùng tên tệp: (.+)$/, 'Duplicate file name: $1'],
  [/^Tệp không phải parquet hợp lệ: (.+)$/, 'Not a valid parquet file: $1'],
  [/^Không chuyển được dữ liệu Waymo: (.+)$/, 'Could not convert the Waymo data: $1'],
  [/^Tổng: (.+)$/, 'Total: $1'],
  [
    /^(\d+) tệp khác không thuộc năm component này sẽ bị bỏ qua\.$/,
    '$1 other files are not one of these five components and will be skipped.',
  ],
  [
    /^Đang chuyển range image thành point cloud…(.*)$/,
    'Converting range images to point clouds…$1',
  ],
  [
    /^Đang đưa point cloud lên kho lưu trữ chung…(.*) tệp$/,
    'Sending the point clouds to shared storage…$1 files',
  ],
  [/^Đang đưa point cloud lên kho lưu trữ chung…$/, 'Sending the point clouds to shared storage…'],
  [/^([\d.]+) giây$/, '$1 seconds'],
  [/^([\d,]+) đối tượng được theo dõi$/, '$1 tracked objects'],
  [/^([\d.]+) triệu$/, '$1 million'],
  [/^([\d,]+) điểm mỗi frame$/, '$1 points per frame'],
  [/^Áp dụng cho cả (\d+) frame của đối tượng này$/, 'Apply to all $1 frames of this object'],
  [/^Đã lưu cho (\d+) frame\.$/, 'Saved for $1 frames.'],
  [
    /^Chưa có tệp: point cloud của lidar TOP sẽ không được bù chuyển động\.$/,
    'No file yet: the TOP lidar point cloud will not be motion-compensated.',
  ],
  [
    /^Chưa có tệp: viewer sẽ không có ảnh camera\.$/,
    'No file yet: the viewer will have no camera images.',
  ],
  [/^(\d+) camera · (\d+) ảnh$/, '$1 cameras · $2 images'],
  [
    /^(\d+) ảnh JPEG không theo tên <camera>\/<frame>\.jpg sẽ bị bỏ qua\.$/,
    '$1 JPEG files not named <camera>/<frame>.jpg will be skipped.',
  ],
  [
    /^(\d+) tệp khác không phải component hay ảnh camera sẽ bị bỏ qua\.$/,
    '$1 other files are neither a component nor a camera image and will be skipped.',
  ],
  [/^Quá nhiều ảnh camera \(tối đa (\d+)\)\.$/, 'Too many camera images (at most $1).'],
  [/^Đang tách ảnh camera… (\d+) ảnh$/, 'Extracting camera images… $1 images'],
  [/^Đang tạo ảnh xem nhanh… (.+) frame$/, 'Making preview images… $1 frames'],
  [/^Đang đưa dữ liệu lên kho lưu trữ chung…(.*)$/, 'Sending the data to shared storage…$1'],
  [/^([\d,]+) ảnh · (.+)$/, '$1 images · $2'],
  [/^Trùng ảnh camera: (.+)$/, 'Duplicate camera image: $1'],
  [/^Ảnh camera không phải JPEG: (.+)$/, 'Camera image is not a JPEG: $1'],
  [/^Ảnh camera hỏng hoặc không phải JPEG: (.+)$/, 'Camera image is corrupt or not a JPEG: $1'],
  [/^Hai ảnh camera cùng chỉ một frame: (.+)$/, 'Two camera images name the same frame: $1'],
  [/^Tên camera không hợp lệ: (.+)$/, 'Invalid camera name: $1'],
  [/^Frame này không có cờ số (\d+)\.$/, 'This frame has no flag number $1.'],
  [/^(\d+) cờ lỗi:$/, '$1 error flags:'],
  [/^Cờ (\d+): (.+)$/, 'Flag $1: $2'],
  [/^Lỗi (Class|Cuboid|Tracking|Extra Object|Other)$/, '$1 error'],
];
