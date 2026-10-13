# Vai trò theo project: Leader, Reviewer, Annotator

Thay đổi ngày 2026-10-11. Thay cho mô hình cũ (`reviewer` toàn quyền, `annotator` chỉ có trang chờ).

## Mô hình

- **Loại tài khoản** (`users.role`): `leader` hoặc `member`. Chọn lúc đăng ký, hoặc đổi bằng CLI.
- **Vai trò trong project**: `leader` (người tạo), `reviewer`, `annotator`. Một member giữ đúng một vai trò trong một project, có thể giữ vai trò khác ở project khác.
- **Thêm thành viên**: cách chính là Leader thêm thẳng bằng tên đăng nhập và chọn vai trò. Reviewer cũng thêm được, nhưng chỉ với vai trò Annotator. Mã mời là cách phụ.
- **Mã mời**: mỗi project có hai mã cố định, một cho reviewer và một cho annotator. Mã 10 ký tự, dùng nhiều lần, không hết hạn. Mã quyết định vai trò; người nhập không tự chọn được.
- **Mọi leader thấy và quản lý mọi project**, kể cả project do leader khác tạo (từ 2026-10-13). Riêng việc **xóa project** chỉ dành cho leader đã tạo nó.
- Project không có người tạo (`created_by` NULL: dataset demo và các project có trước thay đổi này) thì leader nào cũng xóa được.

| Việc                                                | Leader                                                                  | Reviewer / Annotator                                |
| --------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| Tạo project, import dataset                         | Có                                                                      | Không                                               |
| Xóa project                                         | Chỉ leader tạo project (hoặc mọi leader nếu project không có người tạo) | Không                                               |
| Thêm thành viên bằng tên đăng nhập                  | Có                                                                      | Reviewer: chỉ thêm được Annotator. Annotator: không |
| Xem mã mời, tạo mã mới, đổi vai trò, xóa thành viên | Có                                                                      | Không                                               |
| Chạy AI Check                                       | Có                                                                      | Không (xem kết quả)                                 |
| Phân tích guideline, dataset mặc định ngoài project | Có                                                                      | Không                                               |
| Xem project, ảnh, annotation, danh sách thành viên  | Có                                                                      | Có                                                  |
| Lưu quyết định review, frame review                 | Có                                                                      | Có                                                  |

Khi review đã được **Hoàn thành** và gửi cho Annotator thì không ai lưu được quyết định nữa cho tới khi Leader mở lại; xem `docs/review-handoff.md`.

Reviewer và annotator hiện có cùng quyền xem và sửa trong project; khác biệt duy nhất là Reviewer thêm được Annotator. Vai trò được lưu và hiển thị, sẵn để tách quyền khi có công cụ annotation riêng.

## Database (migration 006, chưa chạy trên DB thật)

`server/db/migrations/006_project_roles.sql`:

- `users.role` đổi thành `ENUM('leader','member')`. Tài khoản cũ: `reviewer` thành `leader`, `annotator` thành `member`.
- `projects.created_by` (id người tạo, NULL được). Không đặt khóa ngoại để project vẫn còn khi tài khoản bị xóa tay.
- `project_members(project_id, user_id, role, joined_at)`, khóa chính `(project_id, user_id)`.
- `project_invites(project_id, role, code)`, khóa chính `(project_id, role)`, `code` duy nhất. Mã lưu dạng rõ vì leader cần xem lại để gửi.

Xóa project thì thành viên và mã mời của nó bị xóa theo (ON DELETE CASCADE).

**Code mới cần migration này.** Chạy `npm run db:migrate` trước khi khởi động backend, nếu không các API project trả 503. Sau đó, nếu tài khoản của bạn chưa phải leader:

```bash
npm run user:update -- --username tuananh --role leader
```

## API

Mọi route dưới `/api/projects/:id` kiểm tra vai trò của người gọi trong project đó trước khi đọc dữ liệu (`ProjectMembers.role` trong `server/projects/members.ts`). Tài khoản leader có vai trò `leader` ở mọi project. Member không thuộc project nhận 404 như project không tồn tại. Thao tác chỉ dành cho leader mà member gọi thì nhận 403. `DELETE /api/projects/:id` do leader không phải người tạo gọi cũng nhận 403.

| Route                                                 | Ai                                         | Kết quả                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/register`                             | Chưa đăng nhập                             | Nhận thêm `role`: `leader` hoặc `member` (mặc định `member`)                                                                                |
| `GET /api/projects`                                   | Mọi tài khoản                              | Leader: mọi project (giao diện chia project của mình và của leader khác). Member: project đã tham gia                                       |
| `POST /api/projects`                                  | Leader                                     | Tạo project, ghi `created_by`                                                                                                               |
| `POST /api/projects/join` `{ code }`                  | Member                                     | `{ project_id, name, role }`. Đã ở project với vai trò khác: 409                                                                            |
| `GET /api/projects/:id`                               | Thành viên, leader                         | Thêm `my_role`, `creator_name`, `reviewer_count`, `annotator_count`                                                                         |
| `GET /api/projects/:id/members`                       | Thành viên, leader                         | `{ creator, reviewers[], annotators[] }`                                                                                                    |
| `POST /api/projects/:id/members` `{ username, role }` | Leader; Reviewer chỉ với `role: annotator` | Thêm thẳng một tài khoản thành viên có sẵn, không cần mã. Không có tài khoản: 404; tài khoản Leader hoặc đã ở project với vai trò khác: 409 |
| `GET /api/projects/:id/members/candidates`            | Leader, Reviewer                           | Tên các tài khoản thành viên chưa ở trong project (tối đa 200), để gợi ý khi gõ                                                             |
| `PATCH /api/projects/:id/members/:userId` `{ role }`  | Leader                                     | Đổi vai trò, trả danh sách mới                                                                                                              |
| `DELETE /api/projects/:id/members/:userId`            | Leader                                     | Xóa khỏi project, trả danh sách mới                                                                                                         |
| `GET /api/projects/:id/invites`                       | Leader                                     | `{ reviewer, annotator }`, tự tạo mã nếu chưa có                                                                                            |
| `POST /api/projects/:id/invites` `{ role }`           | Leader                                     | Tạo mã mới cho vai trò đó; mã cũ hết hiệu lực, người đã vào vẫn ở lại                                                                       |

`/api/annotator/home` đã bỏ. Các route ngoài `/api/projects` (dataset mặc định, `/api/guideline/analyze`) chỉ dành cho leader.

## Giới hạn hiện tại

- Leader nào cũng xem được tên đăng nhập của mọi tài khoản thành viên (danh sách gợi ý khi thêm). Chấp nhận cho bản demo.
- Nhập mã mời chưa có giới hạn số lần thử. Không gian mã là 32^10 và phải đăng nhập mới thử được.
- Ai cũng tự đăng ký được tài khoản leader. Chấp nhận cho bản demo.
- Vai trò làm việc member chọn sau khi đăng nhập chỉ lọc danh sách project ở frontend; quyền thật do server quyết định theo `project_members`.
