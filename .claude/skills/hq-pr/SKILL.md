---
name: hq-pr
description: Use when opening a pull request in chung-tu-hq – checks the branch is not main, rebased on origin/main, every commit has the Review block from hq-review-backend/hq-review-frontend, then creates the PR into main with a Vietnamese title and description via gh (never merges)
---

# hq-pr – mở Pull Request vào main

## Nguyên tắc
- PR là đường **duy nhất** để code vào `main`. Skill này **chỉ tạo PR, không merge**; người review duyệt rồi merge trên GitHub.
- Commit trên nhánh phải làm theo `hq-commit` (tiêu đề tiếng Việt rõ tính năng, có khối `Review:`).

## Các bước

### 1. Kiểm nhánh
```bash
git fetch origin
git branch --show-current          # không được là main
git status --short                 # còn thay đổi chưa commit → dùng hq-commit trước
git log --oneline origin/main..HEAD
```
- Đang ở `main` → dừng, dùng `hq-commit` để tạo nhánh và commit.
- Không có commit nào so với `origin/main` → không có gì để mở PR.

### 2. Cập nhật theo main
```bash
git rebase origin/main
```
- Xung đột → giải quyết, chạy lại kiểm tra của phần bị ảnh hưởng.
- Rebase làm đổi code (xung đột, hoặc main có thay đổi cùng chỗ) → **chạy lại 2 agent review** (`hq-review-backend`, `hq-review-frontend`) trên diff `origin/main...HEAD`; FAIL → sửa qua `hq-commit`.
- Đẩy lại: `git push --force-with-lease origin <nhánh>` (chỉ nhánh của mình).

### 3. Kiểm commit
```bash
git log --format='%h %s%n%b---' origin/main..HEAD
```
- Mỗi commit có tiêu đề `<loại>(<phạm vi>): <tính năng tiếng Việt>` và khối `Review:` có dòng của cả 2 agent.
- Thiếu → chạy 2 agent cho diff của nhánh, đưa kết quả vào mô tả PR (mục Review) và báo người yêu cầu commit nào thiếu.

### 4. Tiêu đề và mô tả PR
- **Tiêu đề**: `<loại>(<phạm vi>): <tính năng tiếng Việt>` – nhánh 1 commit thì dùng tiêu đề commit; nhiều commit thì viết tên tính năng chung.
- **Mô tả** (tiếng Việt):
```markdown
## Đang làm
<tính năng/lỗi nào, vì sao cần – đủ để reviewer không theo dõi task vẫn hiểu>

## Thay đổi chính
- <hành vi thay đổi 1 – module/file chính>
- <hành vi thay đổi 2>

## Cách kiểm tra
- <lệnh đã chạy + kết quả: typecheck, lint, test (số test), int test, eval>
- <bước thử tay trên giao diện nếu có>

## Review
- hq-review-backend: <dòng cho commit của agent>
- hq-review-frontend: <dòng cho commit của agent>
<Review-override nếu có; bảng FAIL đã sửa nếu có>

## Rủi ro / triển khai
- Merge vào `main` = deploy production (workflow `deploy.yml` chạy sau khi `ci` xanh) – <cần làm gì trước khi merge: dump DB, báo khách…/không>
- Migration: <có (số migration, có cần dump trước) / không>
- Biến môi trường, cấu hình, dữ liệu tham chiếu: <…/không>
- Ảnh hưởng tích hợp ngoài (FPT/VNACCS, HSCodePro…): <…/không>

## Ảnh chụp
<màn hình trước/sau – bắt buộc khi đổi giao diện, sáng/tối, 1366/390>
```
- PR do Claude tạo: cuối mô tả thêm dòng attribution theo hướng dẫn phiên.

### 5. Tạo PR
```bash
gh pr create --base main --head <nhánh> --title "<tiêu đề>" --body-file <file mô tả>
```
- Ghi mô tả ra file tạm (scratchpad) rồi `--body-file`, tránh lỗi trích dẫn.
- Chưa xong hẳn → thêm `--draft`.
- Nhắc reviewer: merge vào `main` sẽ deploy production (`deploy.yml`).
- **Không** chạy `gh pr merge`, không bấm merge thay reviewer, không push vào `main`.
- Xong → báo người yêu cầu link PR và tóm tắt Review.

## Sai thường gặp
| Sai | Đúng |
|---|---|
| Mở PR từ `main` hoặc merge thẳng | Nhánh riêng → PR → reviewer merge |
| Mô tả PR trống / tiếng Anh chung chung | Theo mẫu trên, tiếng Việt, có mục Review |
| Rebase xong không review lại phần đổi | Chạy lại 2 agent khi rebase làm đổi code |
| `--force` lên nhánh người khác | Chỉ `--force-with-lease` trên nhánh của mình |
