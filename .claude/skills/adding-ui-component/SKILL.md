---
name: adding-ui-component
description: Use when a screen needs a UI element, style, color, spacing, or interaction that @kb/ui does not provide yet, or when changing design tokens, theme options, or an existing @kb/ui component
---

# Thêm / sửa component trong @kb/ui

## Nguyên tắc
App không được tự vá giao diện. Thiếu gì → thêm vào `packages/ui`, có test, rồi app dùng lại. Toàn hệ thống đồng bộ và khách tùy biến được nhờ điều này.

## Quyết định nhanh

| Cần | Làm |
|---|---|
| Màu / khoảng cách / bo góc mới | Hầu như KHÔNG cần – dùng token sẵn có. Thật sự cần → thêm token vào `tokens.css` (dạng `light-dark()`) + `@theme inline` trong `styles/index.css` + test tương phản |
| Biến thể mới của component sẵn có | Thêm vào `cva` của component đó |
| Component mới | Theo các bước dưới |
| Tùy chọn giao diện mới (giống ảnh cấu hình) | Thêm vào `APPEARANCE_OPTIONS` + `Appearance` + `appearanceAttributes` + khối `[data-…]` trong `tokens.css` + `AppearancePanel` + test |

## Các bước (component mới)

1. File `packages/ui/src/components/<ten>.tsx`. Chỉ dùng utility token (`bg-surface`, `text-fg-muted`, `bg-primary`, `rounded-md`…). Biến thể bằng `cva`. Gộp class bằng `cn()`.
2. Dựa trên phần tử gốc có ngữ nghĩa (button, fieldset/radio, dialog của Radix). Không dựng lại hành vi bàn phím bằng `div`.
3. Chuỗi hiển thị (nhãn nút, aria-label) nhận qua props `labels`, có mặc định tiếng Việt.
4. Màu đến từ dữ liệu người dùng (vd mã màu thương hiệu) → truyền qua biến CSS cục bộ `style={{ "--x": value }}` + `bg-[var(--x)]`, không hard-code.
5. Không dùng `dark:` – token đã tự đổi.
6. Test `<ten>.test.tsx` theo checklist `docs/TESTING.md` §3 (hiển thị, biến thể, chuột + bàn phím, axe, props).
7. Nhãn đủ `vi` + `en` qua `useMessages`. Export trong `src/index.ts`; thêm vào playground; thêm dòng vào bảng component trong `docs/DESIGN-SYSTEM.md`.
8. Chạy: `pnpm --filter @kb/ui typecheck && pnpm --filter @kb/ui test && pnpm lint && pnpm --filter @kb/ui test:visual`. Mở playground, xem ở **sáng + tối + 2 màu thương hiệu + mật độ Gọn + mobile + EN**. Ảnh chụp đỏ mà thay đổi là cố ý → `test:visual:update` và ghi lý do vào PR.

## Lỗi hay gặp

| Lỗi | Đúng |
|---|---|
| `` `grid-cols-${n}` `` | Bảng map class tĩnh |
| `text-green-600` cho trạng thái đạt | `StatusBadge status="PASS"` hoặc `text-success-subtle-fg` |
| Màu chữ trên nền màu tự chọn | Dùng cặp token `X` / `X-fg`, `X-subtle` / `X-subtle-fg` – đã đảm bảo tương phản |
| `getByTestId` trong test | `getByRole(…, { name })` |
| Ẩn input bằng `display:none` | `sr-only` để bàn phím + trình đọc màn hình vẫn dùng được |
