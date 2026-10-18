# Vai trò theo project: Leader, Reviewer, Annotator

Thay đổi ngày 2026-10-11. Thay cho mô hình cũ (`reviewer` toàn quyền, `annotator` chỉ có trang chờ).

## Mô hình

- **Loại tài khoản** (`users.role`): `leader` hoặc `member`. Đăng ký luôn tạo `member`; Leader chỉ tạo hoặc đổi bằng CLI.
- **Vai trò trong project**: `leader` (người tạo), `reviewer`, `annotator`. Một member giữ đúng một vai trò trong một project, có thể giữ vai trò khác ở project khác.
- **Thêm thành viên**: Leader bấm **Xem thành viên** ở khung thành viên của project, tích một hoặc nhiều tài khoản trong popup, chọn vai trò rồi bấm **Thêm thành viên**. Reviewer cũng mở được popup đó, nhưng chỉ thêm được Annotator (không có ô chọn vai trò).
- **Mã mời đã bỏ (2026-10-16)**: không còn tạo mã, xem mã hay nhập mã để tham gia. Route `/invites` và `/join` của cả 2D lẫn 3D đã gỡ. Bảng `project_invites` / `project_invites_3d` vẫn còn trong DB nhưng không được dùng nữa; chưa có migration xoá bảng.
- **Mọi leader thấy và quản lý mọi project**, kể cả project do leader khác tạo (từ 2026-10-13). Riêng việc **xóa project** chỉ dành cho leader đã tạo nó.
- **Ẩn project (migration 009, 2026-10-15):** leader tạo project bật/tắt "Ẩn với Leader khác" (cả 2D và 3D). Project đang ẩn không hiện trong danh sách của leader khác, mở bằng ID thì nhận 404. Member đã tham gia vẫn vào bình thường. Project không có người tạo (demo, project cũ) không ẩn được.
- Project không có người tạo (`created_by` NULL: dataset demo và các project có trước thay đổi này) thì leader nào cũng xóa được.

| Việc                                                | Leader                                                                  | Reviewer / Annotator                                |
| --------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| Tạo project, import dataset                         | Có                                                                      | Không                                               |
| Xóa project                                         | Chỉ leader tạo project (hoặc mọi leader nếu project không có người tạo) | Không                                               |
| Thêm thành viên (popup chọn nhiều)                  | Có                                                                      | Reviewer: chỉ thêm được Annotator. Annotator: không |
| Đổi vai trò, xóa thành viên                         | Có                                                                      | Không                                               |
| Chạy AI Check                                       | Có                                                                      | Không (xem kết quả)                                 |
| Phân tích guideline, dataset mặc định ngoài project | Có                                                                      | Không                                               |
| Xem project, ảnh, annotation, danh sách thành viên  | Có                                                                      | Có                                                  |
| Lưu quyết định review, frame review                 | Có                                                                      | Có                                                  |

Khi review đã được **Hoàn thành** và gửi cho Annotator thì không ai lưu được quyết định nữa cho tới khi Leader hoặc Reviewer mở lại; xem `docs/review-handoff.md`.

Reviewer và annotator hiện có cùng quyền xem và sửa trong project; khác biệt duy nhất là Reviewer thêm được Annotator. Vai trò được lưu và hiển thị, sẵn để tách quyền khi có công cụ annotation riêng.

## Database (migration 006, chưa chạy trên DB thật)

`server/db/migrations/006_project_roles.sql`:

- `users.role` đổi thành `ENUM('leader','member')`. Tài khoản cũ: `reviewer` thành `leader`, `annotator` thành `member`.
- `projects.created_by` (id người tạo, NULL được). Không đặt khóa ngoại để project vẫn còn khi tài khoản bị xóa tay.
- `project_members(project_id, user_id, role, joined_at)`, khóa chính `(project_id, user_id)`.
- `project_invites(project_id, role, code)`: bảng của mã mời cũ, không còn dùng từ 2026-10-16.

Xóa project thì thành viên của nó bị xóa theo (ON DELETE CASCADE).

**Code mới cần migration này.** Chạy `npm run db:migrate` trước khi khởi động backend, nếu không các API project trả 503. Sau đó, nếu tài khoản của bạn chưa phải leader:

```bash
npm run user:update -- --username tuananh --role leader
```

## API

Mọi route dưới `/api/projects/:id` kiểm tra vai trò của người gọi trong project đó trước khi đọc dữ liệu (`ProjectMembers.role` trong `server/projects/members.ts`). Tài khoản leader có vai trò `leader` ở mọi project. Member không thuộc project nhận 404 như project không tồn tại. Thao tác chỉ dành cho leader mà member gọi thì nhận 403. `DELETE /api/projects/:id` do leader không phải người tạo gọi cũng nhận 403.

`PATCH /api/projects/:id` và `PATCH /api/projects3d/:id` nhận đúng `{ "hidden": true | false }` (trường khác hoặc kiểu khác trả 400) và trả `{ id, hidden }`. Chỉ leader tạo project được gọi; leader khác nhận 403 khi project đang hiện, 404 khi project đang ẩn.

| Route                                                    | Ai                                         | Kết quả                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/auth/register`                                | Chưa đăng nhập                             | Luôn tạo `member`; không nhận `role` hay `leaderCode`                                                                                                                                                        |
| `GET /api/projects`                                      | Mọi tài khoản                              | Leader: project của mình và project leader khác không ẩn, kèm `hidden`. Member: project đã tham gia                                                                                                          |
| `POST /api/projects`                                     | Leader                                     | Tạo project, ghi `created_by`                                                                                                                                                                                |
| `GET /api/projects/:id`                                  | Thành viên, leader                         | Thêm `my_role`, `creator_name`, `reviewer_count`, `annotator_count`                                                                                                                                          |
| `GET /api/projects/:id/members`                          | Thành viên, leader                         | `{ creator, reviewers[], annotators[] }`                                                                                                                                                                     |
| `POST /api/projects/:id/members` `{ usernames[], role }` | Leader; Reviewer chỉ với `role: annotator` | Thêm 1–200 tài khoản thành viên có sẵn cùng một vai trò (vẫn nhận `username` đơn lẻ). Thêm tất cả hoặc không thêm ai: có tên không tồn tại: 404; có tài khoản Leader hoặc đã ở project với vai trò khác: 409 |
| `GET /api/projects/:id/members/candidates`               | Leader, Reviewer                           | Tên các tài khoản thành viên chưa ở trong project (tối đa 200), hiện trong popup thêm thành viên                                                                                                             |
| `PATCH /api/projects/:id/members/:userId` `{ role }`     | Leader                                     | Đổi vai trò, trả danh sách mới                                                                                                                                                                               |
| `DELETE /api/projects/:id/members/:userId`               | Leader                                     | Xóa khỏi project, trả danh sách mới                                                                                                                                                                          |

`/api/annotator/home` đã bỏ. Các route ngoài `/api/projects` (dataset mặc định, `/api/guideline/analyze`) chỉ dành cho leader.

## Giới hạn hiện tại

- Leader nào cũng xem được tên đăng nhập của mọi tài khoản thành viên (trong popup thêm thành viên). Chấp nhận cho bản demo.
- Vai trò làm việc member chọn sau khi đăng nhập chỉ lọc danh sách project ở frontend; quyền thật do server quyết định theo `project_members`.
