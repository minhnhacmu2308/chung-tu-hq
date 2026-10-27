# Rule: chạy 2 agent review trước mọi lần commit / push

Áp dụng cho **mọi** yêu cầu commit, push, mở PR hoặc deploy – dù người yêu cầu nói gấp.

## Bắt buộc

1. Khi được yêu cầu commit/push, **trước khi chạy `git commit` / `git push`**, gọi song song (một lượt, hai lời gọi Agent) hai agent:
   - `hq-review-backend` – packages/core, contracts, worker, route `app/api`, `lib/server`, migration, scripts.
   - `hq-review-frontend` – `apps/web/src` (trừ `app/api`, `lib/server`), `packages/ui`.
   Agent tự lọc file thuộc phạm vi của mình; không có file nào thì trả PASS ngay.
2. Đưa cho người yêu cầu **bảng KẾT LUẬN của cả hai** (PASS/FAIL + các mục FAIL kèm `file:line`). Không tóm tắt mất mục FAIL.
3. **Cả hai PASS** → được commit/push.
4. **Có FAIL** → **không commit/push**. Sửa các mục FAIL rồi chạy lại hai agent. Chỉ bỏ qua khi người yêu cầu đã **xem danh sách FAIL** và nói rõ chấp nhận từng mục (ghi lại trong nội dung commit: `Review-override: <mục> – <lý do>`).
5. **Mô tả commit (và PR) phải có kết quả của 2 agent**, dán khối "Dòng cho commit" mà mỗi agent trả về, đặt trước các dòng `Co-Authored-By`:
   ```
   Review:
   - hq-review-backend: ✅ PASS – typecheck ✅ · lint ✅ · test @kb/core 44 ✅ · int test N/A · eval N/A
   - hq-review-frontend: ✅ PASS – typecheck ✅ · lint ✅ · test @kb/ui 600 ✅ · web 1200 ✅ · trình duyệt: sáng/tối 1366/390 đã xem
   ```
   Có mục được bỏ qua thì thêm `Review-override: <mục> – <lý do, ai chấp nhận>`. PR: mục "Review" trong mô tả PR, cùng nội dung (kèm bảng FAIL đã sửa nếu có). Commit/PR thiếu khối này là chưa đúng quy trình – reviewer trả lại.
6. Dev tự commit ngoài Claude: chạy `claude --agent hq-review-backend` / `hq-review-frontend` (hoặc nhờ Claude "chạy 2 agent review") trước khi push.

## Vì sao

Rule và kiến trúc (bất biến trong `/CLAUDE.md`, ranh giới module, `@kb/ui`, 3 ngôn ngữ, RLS, idempotency) có phần máy không bắt được. Hai agent soát đúng checklist đó và trả PASS/FAIL rõ ràng để không ai vô tình vi phạm.
