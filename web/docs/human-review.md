# Human Review + MySQL (V1)

## Thiết kế và phạm vi

Giữ nguyên Annotation Schema **1.0.0**, importer, 5 risk checks và layout viewer. Backend vẫn đọc dataset chuẩn và chạy engine; tầng MySQL lưu reference + quyết định. Không copy ảnh, geometry, toàn bộ annotation hay model output vào DB.

```text
Dataset chuẩn → Risk Engine → case + evidence → reviewer chọn quyết định
                                            → API → MySQL → dashboard metrics
```

### Các bảng

| Bảng                | Dữ liệu và khóa                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `dataset_revisions` | Fingerprint unique, dataset reference/name, schema/engine version                                                         |
| `risk_cases`        | FK dataset revision, hash annotation ID + reference gốc, media/frame reference, score, severity, check IDs, is_suspicious |
| `review_decisions`  | PK/FK risk_case_id; decision, error_type, corrected_value, note, reviewer_id nullable, version, reviewed_at               |
| `schema_migrations` | Tên migration, checksum, thời điểm áp dụng                                                                                |

Dataset source JSON là nguồn cho annotation/media đầy đủ. Không cần bảng Media/Annotation riêng chỉ để lặp lại dữ liệu đó. Khi startup, chỉ đăng ký suspicious cases; khi review một annotation sạch trong All, tạo reference của annotation đó lúc lưu. Unique `(dataset_revision_id, annotation_key)` bảo đảm không nhân bản case. Review mỗi case có một quyết định hiện tại; sửa tăng version, chưa có lịch sử audit đầy đủ.

Fingerprint hiện hữu = hash JSON + engine version. Cùng annotation ID ở revision khác không dùng nhầm review cũ. Ảnh thay đổi có ý nghĩa cần cập nhật dataset revision/JSON như tài liệu schema đã nêu.

### Decision

- `CORRECT`: Correct / False Alarm.
- `ERROR`: Annotation Error; bắt buộc error_type.
- `UNSURE`: chưa chắc chắn; vẫn được tính là đã review.

Error type: `CLASS`, `BBOX`, `TRACKING`, `MISSING_OBJECT`, `EXTRA_OBJECT`, `OTHER`.

`CLASS` yêu cầu Correct Label. `corrected_value` là đề xuất dạng text (tối đa 1000 ký tự); các loại lỗi khác có thể để trống. Note tối đa 4000 ký tự. CORRECT/UNSURE phải có error_type và corrected_value null. `reviewed_at` do server ghi UTC. Chưa có auth nên reviewer_id luôn null, không nhận danh tính tùy ý từ client.

## API

Giữ `/api/cases`; `/api/risk-cases` là alias.

| Method / endpoint                    | Kết quả                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| GET `/api/cases?review_status=ERROR` | Queue, thêm filter review; hỗ trợ scope/level cũ                   |
| GET `/api/cases/:id`                 | Case và evidence hiện có                                           |
| GET `/api/cases/:id/review`          | `{ review: null }` nếu chưa có; nếu có trả quyết định/version/time |
| POST `/api/cases/:id/review`         | Tạo quyết định, HTTP 201                                           |
| PUT `/api/cases/:id/review`          | Sửa quyết định, HTTP 200; cần version hiện tại                     |
| GET `/api/reviews`                   | Map annotation ID → quyết định cho dataset hiện tại                |
| GET `/api/dashboard/metrics`         | Metrics SQL cho suspicious cases của revision hiện tại             |

`review_status`: `all`, `unreviewed`, `reviewed`, `ERROR`, `CORRECT`, `UNSURE`.

Ví dụ POST:

```json
{
  "dataset_revision": "<dataset_id từ GET /api/meta>",
  "decision": "ERROR",
  "error_type": "CLASS",
  "corrected_value": "car",
  "note": "Đã đối chiếu ba frame."
}
```

PUT gửi thêm `version` từ quyết định đã đọc. Hai reviewer/tab cùng sửa bản cũ: người lưu sau nhận 409 và có thể tải lại quyết định; không tự ghi đè. POST khi đã có review cũng trả 409. Transaction khóa row case/review để chống duplicate khi lưu đồng thời.

Lỗi: 400 input/JSON không hợp lệ; 404 case hoặc review cần sửa chưa tồn tại; 409 revision/version conflict; 413 body > 32 KiB; 415 sai Content-Type; 503 MySQL/service không sẵn sàng. Không trả SQL hoặc credential về frontend. API vẫn chỉ bind localhost; request ghi yêu cầu JSON và kiểm tra Origin nếu có.

## UX và metrics

Form không tự chọn sẵn decision. Chọn → điền correction/note → Save. Sau khi MySQL xác nhận mới cập nhật Reviewed. Giữ nguyên case sau save ở phạm vi bình thường; nếu đang lọc Unreviewed, case vừa xử lý rời hàng đợi theo bộ lọc. Có thể sửa bằng Update Review. Tải lại quyết định sẽ thay nội dung form bằng bản trong DB.

Chuyển case khi chưa Save làm mất draft; form hiển thị thông báo này. Khi lưu lỗi, nội dung đang nhập được giữ. Nếu lưu thành công nhưng tải metrics lỗi, UI nói rõ đã lưu và yêu cầu tải lại metrics.

Metrics lấy từ SQL, chỉ tính `is_suspicious=1` của dataset revision đang phục vụ:

- Total Risk Cases, High, Medium.
- Reviewed = số case có quyết định (kể cả UNSURE).
- Unreviewed = Total − Reviewed.
- Confirmed Errors / Correct / Unsure = số case theo quyết định hiện tại.
- Progress = Reviewed / Total × 100, làm tròn 1 chữ số; dataset không có case → 0%.

Bộ lọc tìm kiếm/severity/review không thay đổi tổng dashboard. Review annotation sạch vẫn lưu được nhưng không làm tăng metrics của suspicious queue. Chưa dùng số liệu này làm accuracy/precision của engine.

**localStorage cũ không còn được đọc hay ghi.** Dấu Reviewed cũ chỉ có nghĩa “đã xem”, không đủ để suy ra CORRECT/ERROR/UNSURE nên không tự chuyển thành quyết định DB. Dữ liệu local cũ không bị xóa.

## Test isolation

`npm test` thêm integration tests dùng MySQL thật ở database `smartreview_test` (hoặc `smartreview_test_<suffix>`). Test từ chối dùng tên DB ứng dụng. Mỗi lượt test tạo fingerprint riêng và chỉ xóa các row của chính revision test đó. Không DROP/TRUNCATE database hoặc xóa review thật.

Playwright mở hai server ở 3110/3111, dùng cùng DB test nhưng fingerprint riêng cho demo/human. Tests xác minh quyết định qua reload và browser context mới; core tests giữ nguyên, hai test localStorage cũ được cập nhật theo workflow MySQL thay thế nó.

## Bước sau

Authentication/user management, audit history, MySQL-backed import catalog, CVAT mapping/API, auto-correction, multi-role và deploy production chưa thực hiện. Không thêm risk algorithm, không thay schema, không sửa annotation gốc.
