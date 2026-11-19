---
name: hq-commit
description: Use when committing work in chung-tu-hq – creates/uses a feature branch (never commits on main), runs hq-review-backend + hq-review-frontend, writes a Vietnamese commit message with a clear feature name, what is being worked on, and the Review block, then pushes the branch
---

# hq-commit – commit lên nhánh tính năng

## Nguyên tắc
- **Không commit, không push thẳng vào `main`.** Mọi thay đổi đi qua nhánh riêng → `hq-pr` mở PR → người review duyệt rồi mới merge.
- Commit chỉ sau khi **2 agent review đều PASS** (`.claude/rules/review-truoc-commit.md`).
- Thông điệp commit **bằng tiếng Việt**, tên tính năng rõ ràng, có khối `Review:`.

## Các bước

### 1. Nhánh
```bash
git fetch origin
git branch --show-current
```
- Đang ở `main` (hoặc nhánh đã merge) → tạo nhánh mới từ `origin/main`:
  `git switch -c <loại>/<tên-tính-năng-không-dấu> origin/main` (giữ thay đổi đang sửa).
  - Switch báo lỗi vì file đang sửa khác `origin/main` → `git stash` → switch → `git stash pop`.
  - `main` local có commit chưa push → `git switch -c <nhánh>` tại HEAD rồi `git rebase origin/main` (đừng bỏ lại commit trên `main`).
- Loại: `feat` (tính năng), `fix` (sửa lỗi), `refactor`, `docs`, `test`, `chore`, `perf`.
- Tên nhánh: chữ thường, không dấu, nối bằng `-`, nói đúng tính năng. Ví dụ: `feat/gop-dong-cung-loai`, `fix/gui-lai-dung-body-moi`.
- Đang ở đúng nhánh tính năng → dùng tiếp.

### 2. Chọn file
```bash
git status --short
git diff --stat
```
- **Stage từng file theo tên** (`git add <file> …`). Không dùng `git add -A` / `git add .`.
- Không đưa vào commit: file chưa track của người khác hoặc file cá nhân (`deploy/`, `business/`, `docs/DEPLOY.md`, `apps/web/.next-*`, `.claude/worktrees/`, `.env*`, tài liệu tạm), file chứa bí mật.
- `Dockerfile`, `.dockerignore`, `.github/workflows/deploy.yml` **được commit** (image build trên GitHub Actions) – soát như mã.
- Thay đổi không liên quan tính năng → tách commit/nhánh khác.

### 3. Máy kiểm tra
Theo phạm vi thay đổi: `pnpm -r --no-bail typecheck` (thấy hết lỗi mọi package), `pnpm lint`, test của package bị đổi (`pnpm -F <pkg> test`), int test khi đổi repo/migration, `pnpm eval` khi đổi trích xuất. Đỏ → sửa trước, không commit.

### 4. Review – chạy song song 2 agent
Một lượt, hai lời gọi Agent: `hq-review-backend` và `hq-review-frontend` (phạm vi: diff đã stage).
- Đưa người yêu cầu bảng KẾT LUẬN của cả hai (PASS/FAIL, mục FAIL kèm `file:line`).
- Có FAIL → sửa, chạy lại. Chỉ bỏ qua khi người yêu cầu đã xem từng mục FAIL và nói rõ chấp nhận → ghi `Review-override:`.
- Giữ nguyên "Dòng cho commit" mỗi agent trả về để dán vào bước 5.

### 5. Thông điệp commit
```
<loại>(<phạm vi>): <tên tính năng tiếng Việt, rõ ràng, ≤ 100 ký tự>

Đang làm: <tính năng/lỗi nào, vì sao – 1–3 câu cho người không theo dõi task hiểu>

Thay đổi:
- <điểm thay đổi chính 1 – nói theo hành vi, kèm file/module khi cần>
- <điểm 2>

Kiểm tra: <lệnh đã chạy + kết quả, vd typecheck ✅ · test @kb/core 644 ✅ · đã xem trình duyệt 1366/390>

Review:
- hq-review-backend: <dòng cho commit của agent>
- hq-review-frontend: <dòng cho commit của agent>
[Review-override: <mục> – <lý do, ai chấp nhận>]
```
- `<phạm vi>`: module/khu vực, vd `customs`, `declaration`, `review`, `ui`, `fpt`, `billing`, `docs`.
- Tiêu đề nói **tính năng/kết quả**, không nói "update code", "fix bug", "sửa vài chỗ".
- Commit do Claude tạo: thêm các dòng attribution (`Co-Authored-By: …`, `Claude-Session: …`) theo hướng dẫn phiên, sau khối Review.
- Ghi bằng heredoc: `git commit -F - <<'EOF' … EOF`.

Ví dụ:
```
fix(customs): Gửi lại dựng lại body FPT từ tờ khai hiện tại

Đang làm: "Gửi lại" phát lại body chốt lúc truyền nên ô điền sau (1.58 TK_ENC) không được gửi, Hải quan trả E1028.

Thay đổi:
- resend-operation: dựng lại request + lineIds/sent từ tờ khai SUBMITTED hiện tại
- Chưa có số tờ khai thì luôn cho gửi lại (cả outbox PENDING chưa hết lượt thử)

Kiểm tra: typecheck ✅ · test @kb/core integration 644 ✅

Review:
- hq-review-backend: ✅ PASS – typecheck ✅ · lint ✅ · test @kb/core 644 ✅ · int test N/A · eval N/A
- hq-review-frontend: N/A – không đổi frontend
```

### 6. Đẩy nhánh
```bash
git push -u origin <nhánh>
```
- Không `git push origin main`, không `--force` lên nhánh người khác. Cần ghi đè lịch sử nhánh của mình sau rebase → `--force-with-lease`.
- Xong → báo người yêu cầu: nhánh, mã commit, kết quả review. Mở PR bằng skill `hq-pr`.

## Sai thường gặp
| Sai | Đúng |
|---|---|
| Commit trên `main` rồi push | Tạo nhánh trước, `main` chỉ nhận qua PR |
| Tiêu đề "update", "fix bug" | Tên tính năng tiếng Việt rõ ràng |
| Thiếu khối `Review:` | Luôn dán dòng của cả 2 agent (N/A nếu không có file thuộc phạm vi) |
| `git add -A` kéo file cá nhân | Stage theo tên file |
| Commit khi agent FAIL | Sửa rồi chạy lại, hoặc override có lý do |
