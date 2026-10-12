# KhaiBáo AI – bộ khung quy chuẩn

> **PM / thiết kế:** chạy và chỉnh giao diện theo [docs/HUONG-DAN-PM.md](docs/HUONG-DAN-PM.md) – `npx pnpm@10 install` rồi `npx pnpm@10 dev:web` → http://localhost:3100

Thư mục này hiện chứa **kiến trúc, quy ước, skill và cấu hình ép quy tắc**. Code ứng dụng sẽ dựng trên khung này.

## Người mới vào đọc theo thứ tự

1. `docs/PRODUCT.md` – sản phẩm làm gì, luồng 6 bước, màn hình, tích hợp, câu hỏi mở (20 phút)
2. `docs/architecture.html` – sơ đồ kiến trúc tương tác, mở bằng trình duyệt (nguồn: `docs/diagrams/architecture.json`)
3. `docs/ARCHITECTURE.md` – hệ thống gồm gì, chia module và tầng thế nào (15 phút)
4. `docs/CONVENTIONS.md` – quy tắc bắt buộc (10 phút)
   · `docs/DESIGN-SYSTEM.md` – token, component, tùy biến giao diện · `docs/TESTING.md` – chuẩn viết test
5. `docs/adr/` – vì sao chọn như vậy
6. `CLAUDE.md` (gốc) + `CLAUDE.md` trong `apps/web`, `apps/worker`, `packages/core`

## Ba lớp bảo vệ để "không code sai"

| Lớp | Ở đâu | Bắt được gì |
|---|---|---|
| **Máy tự chặn** | `tsconfig.base.json` (strict), `.dependency-cruiser.cjs`, eslint, CI `.github/workflows/ci.yml` | Import sai tầng/module, dùng SDK AI sai chỗ, web truy vấn DB thẳng, vòng phụ thuộc, lỗi kiểu |
| **Hướng dẫn cho AI và người** | `CLAUDE.md` theo thư mục + `.claude/skills/` | Cách làm đúng cho từng loại việc |
| **Review** | `.github/pull_request_template.md` | Phần máy không kiểm được: orgId, Decimal, eval trước/sau, review nghiệp vụ |

## Skill (`.claude/skills/`)

| Skill | Dùng khi |
|---|---|
| `adding-document-type` | Thêm loại chứng từ mới |
| `adding-validation-rule` | Thêm/sửa luật đối chiếu chéo |
| `adding-backend-use-case` | Thêm use case, endpoint, job, bảng DB |
| `building-frontend-feature` | Làm màn hình, form (ghép từ @kb/ui) |
| `adding-ui-component` | Thêm/sửa component, token, tùy chọn giao diện trong @kb/ui |
| `changing-extraction-prompt-or-model` | Sửa prompt, schema trích xuất, đổi model AI |
| `mapping-declaration-fields` | Ánh xạ dữ liệu sang chỉ tiêu tờ khai |

Claude Code tự đọc `CLAUDE.md` và tự nạp skill phù hợp khi làm việc trong repo này. Người không dùng Claude Code đọc skill như checklist.
