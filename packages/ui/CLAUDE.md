# packages/ui – design system @kb/ui

Đọc `docs/DESIGN-SYSTEM.md` trước khi sửa. Thêm/sửa component → skill `adding-ui-component`. Test → `docs/TESTING.md`.

- `src/styles/tokens.css` là nơi DUY NHẤT có mã màu. Màu mới khai báo bằng `light-dark(sáng, tối)`.
- `src/theme/` là bộ máy theme (thuần TS, có test tương phản). Không import React ở đây.
- Component chỉ dùng utility token; không `dark:`; không màu Tailwind mặc định (đã tắt).
- Nhãn/aria-label nhận qua props, mặc định tiếng Việt.
- Mỗi component có test cạnh file + `expectNoA11yViolations`.
- Lệnh: `pnpm --filter @kb/ui test`, `pnpm --filter @kb/ui typecheck`, `pnpm ui:playground`.
