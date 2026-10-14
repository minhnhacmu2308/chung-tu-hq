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

## Quy ước bổ sung (rút từ lỗi thật)

- **Hiệu ứng**: chỉ dùng `motion-safe:animate-fade-in / pop-in / slide-in-right / slide-up` (khai báo trong `styles/index.css`). Hover/focus đã có transition 150ms ở lớp base – không thêm `transition-*` trừ khi cần `scale`/`transform`. Hiệu ứng lặp vô hạn chỉ cho trang trí `aria-hidden`.
- **Tác dụng phụ lên trang** (khóa cuộn, listener toàn cục, đổi `<body>`): đặt trong component CHỈ được dựng khi đang hiển thị (vd bên trong `Portal`), không đặt ở lớp vỏ luôn render. Nhiều thực thể mở cùng lúc → đếm tham chiếu. Có test "đóng thì trả lại nguyên trạng".
- **Đổi cấu trúc DOM của control đang dùng** (thêm khung bao, đổi thẻ gốc): `className` cũ của nơi gọi phải vẫn đúng nghĩa – class bố cục (bề rộng, flex, lưới, margin) áp cho phần tử ngoài cùng, class dáng ô áp cho control. Kiểm tra mọi nơi đang dùng trong `apps/`.
- **Thứ hiện ra khi rê chuột** phải: nằm trong tầm mắt (cột dính nếu bảng cuộn ngang), hiện cả khi `focus-within`, và có đường khác cho màn cảm ứng (`[@media(hover:none)]`).
- **Nội dung trong Dialog**: không đặt chiều cao cứng; cần chiếm hết chỗ → utility `dialog-fill`. Dialog có form: nút đặt trong `DialogFooter` (tự nằm sát đáy ở dạng panel).
- **Phần tử dính** dùng `top-shell` / biến `--kb-shell-top` (menu có thể nằm trên).
- **SVG nhiều hình chồng nhau**: `fill-rule="evenodd"` chỉ đặt cho path có lỗ; hình chồng lên nhau để path riêng (nếu gộp, chỗ chồng bị thủng).
- **Tùy chọn giao diện mới**: ngoài các bước ở bảng trên, thêm **hình mô phỏng** cho từng lựa chọn trong `AppearancePanel` (kích thước/màu của hình không được phụ thuộc chính tùy chọn đó) và đặt vào đúng tab (Chung / Bố cục & chữ / Màu sắc).
- **Màu mới cho control** (viền, vùng chọn, thanh cuộn…): thêm token `--kb-color-*` trong `tokens.css` bằng `light-dark()`; phần tử tương tác chưa chọn cần tương phản ≥ 3:1 với nền.
- **Trạng thái nghiệp vụ mới**: thêm vào `STATUS_META` + `STATUS_LABELS_EN` (TypeScript bắt thiếu nhãn EN).
- Component mới phải có trong **playground** và một dòng trong bảng `docs/DESIGN-SYSTEM.md` §4; thứ thay cho cách làm cũ → thêm dòng vào bảng "Cần gì → dùng gì" của skill `building-frontend-feature`.

## Kiểm tra bằng trình duyệt (bắt buộc với thay đổi nhìn thấy được)

Test jsdom không tính CSS: không bắt được bố cục vỡ, phần tử bị che, tràn ngang, khóa cuộn. Sau khi test xanh:

1. `pnpm --filter @kb/web build && pnpm --filter @kb/web start` (cổng 3100). **Không dùng `next dev` để đo** – Chrome headless chạy bản dev rất giật, số đo sai.
2. Script Playwright tạm trong `packages/ui/` (import `@playwright/test`, `chromium.launch({ channel: "chrome" })`), chạy xong xóa. Chờ dữ liệu mock: đợi hết `main .skeleton-shimmer`.
3. **Đo, đừng chỉ nhìn**: `document.documentElement.scrollWidth - innerWidth` (tràn ngang), `scrollY` sau khi `page.mouse.wheel` (cuộn được không), `getBoundingClientRect()` của phần tử cần nằm trong khung nhìn, `getComputedStyle(el).opacity` sau `hover()`.
4. Chụp ở: sáng + tối (`colorScheme`), 1366×800 và 390×780; nếu đụng menu thì cả 3 vị trí menu (`localStorage["kb-appearance"].menuPosition`).
5. Route mẫu: `/dossiers/dos_021` (OCR), `dos_022` (upload), `dos_023` (review), `dos_024` (truyền), `dos_026` (agent), `/skills/sk_inv_gen`.
6. Dừng server theo cổng (`kill $(lsof -tiTCP:3100 -sTCP:LISTEN)`), không `pkill` theo tên.

## Lỗi hay gặp

| Lỗi | Đúng |
|---|---|
| `` `grid-cols-${n}` `` | Bảng map class tĩnh |
| `text-green-600` cho trạng thái đạt | `StatusBadge status="PASS"` hoặc `text-success-subtle-fg` |
| Màu chữ trên nền màu tự chọn | Dùng cặp token `X` / `X-fg`, `X-subtle` / `X-subtle-fg` – đã đảm bảo tương phản |
| `getByTestId` trong test | `getByRole(…, { name })` |
| Ẩn input bằng `display:none` | `sr-only` để bàn phím + trình đọc màn hình vẫn dùng được |
| `useEffect` khóa cuộn/đổi `body` trong component luôn render | Đặt trong phần chỉ dựng khi mở (trong `Portal`) + đếm tham chiếu |
| `h-160`, `max-h-80` cho nội dung trong dialog | `dialog-fill` / để nội dung tự cao |
| Icon hành động chỉ hiện khi hover, nằm ở cột cuối của bảng cuộn ngang | Cột dính phải (`meta.sticky: "end"`) + `focus-within` + đường cho cảm ứng |
| Ô đánh dấu/select mặc định của trình duyệt | `Checkbox` / `Select` (đã tự vẽ, vẫn là control gốc) |
| Thêm lựa chọn giao diện mà không có hình mô phỏng | Thêm preview trong `AppearancePanel` |
