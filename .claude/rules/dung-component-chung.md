---
paths:
  - "apps/**/*.tsx"
  - "packages/ui/**/*.tsx"
---

# Rule: chỉ dùng component chung (`@kb/ui`), không tự chế

Áp dụng cho mọi màn hình trong `apps/*` – app khách lẫn khu Quản trị hệ thống. Giao diện hai bên phải giống nhau vì cùng một design system.

## 1. Nguyên tắc

1. **Có component thì dùng component.** Trước khi viết JSX, tra bảng §2 và bảng "Cần gì → dùng gì" trong skill `building-frontend-feature`.
2. **Dùng đúng mặc định của component.** Không tắt tính năng chuẩn (nút chuyển panel của popup, icon đầu popup, tìm kiếm của bảng…) để màn mình "gọn hơn".
3. **Thiếu thì thêm vào `@kb/ui`**, theo skill `adding-ui-component` (có test, playground, dòng trong `docs/DESIGN-SYSTEM.md`). Không vá trong app bằng `span` + class.
4. **Ghép nhiều component cho một nghiệp vụ** (vd hộp xác nhận kèm lý do, bảng quyền) thì đặt ở `src/components/common/` hoặc `features/<f>/common/` và chỉ ghép từ `@kb/ui` – không thêm class trình bày mới.
5. **Trước khi tạo màn mới, mở một màn tương tự đã có** (vd popup trong `features/settings/members-tab.tsx`) và làm giống hệt cấu trúc.

## 2. Những chỗ hay làm sai

| Cần | Đúng | Sai (đã gặp) |
|---|---|---|
| Popup / hộp xác nhận | `Dialog` + `DialogContent` có **`title` + `icon`** (+ `description` khi cần) + `<form>` + `DialogFooter`. **Giữ nút chuyển cửa sổ ↔ panel** (mặc định) | `allowPresentationToggle={false}`; popup không có icon |
| Xác nhận xóa / hủy / ngắt kết nối | `ConfirmDialog` (`tone="danger"` mặc định, `irreversible` khi xóa vĩnh viễn) | `Dialog` + `<p>` + nút đỏ tự ghép – nhìn không ra là nguy hiểm |
| Panel chi tiết bên phải | `Dialog defaultPresentation="panel"` | Tự dựng `aside` cố định bên phải |
| Icon trong nút | `<Button leftIcon={<X className="h-4 w-4" />}>` | `<Button><span className="[&>svg]:h-4">…</span>…</Button>` |
| Ô icon nền dịu (đầu thẻ, đầu dòng) | `IconTile` (`tone`, `size`) | `<span className="h-10 w-10 … justify-center bg-primary-subtle">` |
| Bảng danh sách | `DataTable` (+ `RowActions`, `searchable`, `meta.filter`) | `<table>` tự viết |
| Bảng vai trò × quyền | `PermissionMatrix` (`components/common`) | `<table>` với ✓ / – tự vẽ |
| Trạng thái nghiệp vụ | `StatusBadge` (thêm vào `STATUS_META` nếu thiếu) | Bảng `{ label, tone }` trong feature + `Badge` |
| KPI | `StatCard` trong `Grid cols={{ base: 2, xl: 4 }}` | `Card` + số tự căn |
| Lưới, bố cục co giãn (chia cột, xếp ngang/dọc, ẩn/hiện, giới hạn bề rộng) | `Grid cols={{ base, md, xl }}`; còn lại dùng mốc theo **vùng nội dung** `cq-sm/md/lg/xl:` và `cq-max-sm:` (vd `cq-md:max-w-xs`, `cq-sm:flex-row`, `cq-lg:col-span-2`). Khung/vùng cuộn mới tự có thì thêm `@container`. `sm:/md:/lg:` chỉ dành cho khung ứng dụng (`features/**/shell`) | `lg:grid-cols-3`, `md:max-w-xs`, `sm:flex-row`, `max-sm:sr-only` (đo theo màn hình → panel neo bên phải làm thẻ, form chật) |
| Thao tác trên dòng | `RowActions`; trong bảng truyền qua `rowActions` của `DataTable` (cụm nút nổi đè cuối dòng khi rê chuột, không chiếm cột) | Tự dựng menu "…"; cột `id: "actions"` / `sticky: "end"` |
| Đang tải / lỗi / trống | `PageLoading`, `Skeleton*`, `LoadError`, `EmptyState` | `Skeleton className="h-80"`, để trống |

## 3. Máy kiểm tra (`pnpm lint`)

`scripts/check-design-tokens.mjs` chặn trong `apps/*`: `apps-actions-column` (tự dựng cột thao tác – dùng `rowActions` của DataTable), `apps-status-map` (tự dựng bảng `{ label, tone }` cho trạng thái – dùng `StatusBadge`), `apps-dialog-toggle-off`, `apps-raw-table`, `apps-viewport-layout`, `apps-svg-selector`, `apps-icon-tile`, cùng các luật cũ (`apps-raw-control`, `apps-row-menu`, `apps-big-skeleton`, màu thô, giá trị tùy ý…). Danh sách đầy đủ: `docs/DESIGN-SYSTEM.md` §5.

Ngoại lệ hiếm (vd lưới sửa trực tiếp từng ô ở `ocr/items-table.tsx`): comment `kb-allow-raw: <lý do cụ thể>` ngay trên dòng – reviewer phải đồng ý.

TypeScript chặn: `DialogContent` thiếu `icon` (prop bắt buộc) → không biên dịch được.

Máy chưa bắt được (review phải soát): popup tự dựng khung bằng `Card` nổi; một màn dùng component khác màn tương tự đã có.

## 4. Trước khi báo xong

- [ ] `pnpm lint` xanh, không thêm `kb-allow-raw` mới mà không có lý do.
- [ ] Mọi popup mới: có icon, còn nút chuyển panel, nút hành động nằm trong `DialogFooter`.
- [ ] Mở trình duyệt so popup / bảng mới với một màn tương tự đã có – phải cùng dáng.
