---
name: building-frontend-feature
description: Use when creating or changing a screen, page, form, table, or interactive component in apps/web
---

# Làm feature frontend

## Cấu trúc

```
apps/web/src/
  app/(app)/dossiers/[id]/review/page.tsx   ← mỏng: lấy params, gọi queries, render <OcrReview/>
  features/ocr-review/
    components/OcrReview.tsx, FieldRow.tsx, ...
    hooks/useJobProgress.ts
    queries.ts      ← server-only, đọc dữ liệu
    actions.ts      ← "use server", ghi dữ liệu
```

## Các bước
1. **Page** chỉ: đọc `params/searchParams`, gọi `queries.ts`, render component feature. Không logic.
2. **Đọc dữ liệu** – `queries.ts` (`import "server-only"`): lấy session → gọi use case qua `@kb/core/modules/<m>`.
3. **Ghi dữ liệu** – `actions.ts` (`"use server"`): session → parse Zod từ `@kb/contracts` → use case → trả `{ ok } | { error: messageVi }`. Sau khi ghi gọi `revalidatePath`.
4. **Form** – react-hook-form + `zodResolver(schema dùng chung)`. Hiển thị lỗi theo trường.
5. **Trạng thái UI bắt buộc**: loading (skeleton), empty (`EmptyState` + hành động tiếp theo), error (thông báo tiếng Việt + thử lại). Nút gửi bị khóa khi đang chạy.
6. **State**: tab/filter/trang lưu trên URL (`searchParams`); server state qua RSC/TanStack Query; còn lại `useState`.
7. **Giao diện chỉ ghép từ `@kb/ui`** (Button, Field/Input/Select, Card, Grid/Stack, PageHeader, StatusBadge, Alert, Dialog, Tabs, EmptyState, Skeleton…) + utility token (`bg-surface`, `text-fg-muted`, `gap-4`). Thiếu thứ gì → **REQUIRED SUB-SKILL:** `adding-ui-component`, không tự vá. `pnpm lint` chặn mã màu, màu Tailwind mặc định, `dark:`, giá trị tùy ý, `<button>` thô.
   Số/tiền/ngày qua `lib/format`; trạng thái nghiệp vụ qua `StatusBadge`; mỗi trang mở đầu bằng `PageHeader`.
8. **A11y**: control có label; dùng được bằng bàn phím; không truyền nghĩa chỉ bằng màu.
8b. **Chọn component theo bảng "Cần gì → dùng gì" bên dưới** trước khi viết JSX. Tự dựng lại thứ đã có là lỗi review.
8c. **Xem bằng trình duyệt thật** trước khi báo xong (sáng + tối, 1366px + 390px): test xanh không bắt được bố cục vỡ. Cách chạy: mục "Kiểm tra bằng trình duyệt" trong skill `adding-ui-component`.
9. **Test**: logic thuần trong feature → Vitest; luồng chính → Playwright e2e.

## Cần gì → dùng gì (tất cả từ `@kb/ui`)

| Cần | Dùng | Không làm |
|---|---|---|
| Thẻ chỉ số / KPI đầu trang | `StatCard` (số `number` tự chạy đếm) trong `Grid cols={{ base: 2, xl: 4 }} stagger` | Tự ghép `Card` + `CardTitle` thành KPI |
| Form từ ~5 trường | Chia nhóm bằng `FormSection`; ô ngắn (ngày, mã, số ĐT) thêm `className="md:max-w-xs"` | Một cột trường dài hoặc lưới 2–3 cột đều nhau |
| Trạng thái nghiệp vụ (hồ sơ, tờ khai, luồng, đối chiếu) | `StatusBadge` – thêm trạng thái mới vào `STATUS_META` (+ nhãn EN) của `@kb/ui` | Khai báo bảng `{ label, tone }` trong feature rồi dùng `Badge` |
| Nhãn phụ không phải trạng thái nghiệp vụ | `Badge` (`size`, `dot`, `icon`) | |
| Chọn một trong nhiều lựa chọn có nhãn dài / mô tả (câu hỏi, phương án) | `RadioGroup` (dọc; ít lựa chọn ngắn → `SegmentedControl`) | Nhiều `Button` giả radio; `<input type="radio">` thô |
| Thao tác trên một dòng bảng/danh sách | `RowActions` (icon hiện khi rê chuột + nút "…" đủ thao tác); DataTable: truyền qua `rowActions` | Tự dựng `DropdownMenu` + `MoreHorizontal` (lint `apps-row-menu` chặn) |
| Bảng danh sách | `DataTable`; cột định danh `meta: { sticky: true }`; cột thao tác tự dính phải | `<table>` tự viết |
| Đang tải – đã biết dáng nội dung | `PageLoading` (cả trang) / `SkeletonStats` / `SkeletonCard` / `SkeletonTable` / `SkeletonForm` / `SkeletonList` | `<Skeleton className="h-80" />` cho cả khối (lint `apps-big-skeleton` chặn) |
| Đang tải – chưa biết dáng (chờ AI, chờ Hải quan) | `LoadingState` với tiêu đề nói rõ đang làm gì | Spinner trơ giữa trang |
| Đang lưu / tải lại trên nội dung đã có | `LoadingOverlay` | Xóa nội dung cũ rồi hiện skeleton |
| Không tải được dữ liệu | `LoadError` (`@/components/common/load-error`) có nút Thử lại | Để trống hoặc skeleton mãi |
| Báo kết quả một thao tác | `toast({ tone, title })`; thao tác dài: `toastPromise(promise, { loading, success, error })` | `alert()`, toast riêng cho từng bước |
| Thao tác ghi dữ liệu (`useMutation`) | LUÔN có `onError` – mặc định `toastMutationError("Không lưu được …")` từ `@/lib/mutation-error` | Mutation chỉ có `onSuccess` (thất bại trong im lặng) |
| Popup / panel bên phải | `Dialog` + `DialogContent` (luôn có `title` + `icon`) + `DialogFooter`; giữ nút chuyển cửa sổ ↔ panel; nội dung chính cần chiếm hết chỗ (sơ đồ, khung xem) thêm class `dialog-fill` | Đặt `h-160`/`max-h-*` cứng cho nội dung trong dialog; `allowPresentationToggle={false}` (lint `apps-dialog-toggle-off` chặn) |
| Icon trong nút | `leftIcon` / `rightIcon` của `Button` | Bọc icon trong `span` + `[&>svg]:…` (lint `apps-svg-selector` chặn) |
| Ô icon nền dịu ở đầu thẻ / đầu dòng | `IconTile` (`tone`, `size`) | Tự ghép `span` + `bg-*-subtle` (lint `apps-icon-tile` chặn) |
| Bảng vai trò × quyền | `PermissionMatrix` (`@/components/common/permission-matrix`) | `<table>` tự viết (lint `apps-raw-table` chặn) |
| Phần tử dính đầu trang trong màn | class `top-shell` (tự né thanh menu khi người dùng chọn menu ở trên) | `top-4`, `top-0` |
| Khối hiện lần lượt khi vào trang | prop `stagger` của `Grid`/`Stack` (tối đa 1–2 khối mỗi màn) | Tự viết animation, thư viện motion |
| Logo | `BrandMark` (`small` khi ≤ 24px, `decorative` khi đứng cạnh tên) | Nhúng file SVG có mã màu |
| File `app/**/not-found.tsx`, `loading.tsx`, `error.tsx` dùng `@kb/ui` | Đặt `"use client"` ở đầu file (`@kb/ui` là thư viện phía client) | Import `@kb/ui` vào Server Component → build lỗi |

## Lỗi hay gặp

| Lỗi | Thay bằng |
|---|---|
| `fetch("/api/...")` trong component | `queries.ts` / `actions.ts` / hook |
| Khai báo lại schema form bằng tay | Schema từ `@kb/contracts` |
| `n.toLocaleString()` rải rác | `formatMoney`, `formatNumber`, `formatDate` |
| Lưu tab đang mở trong `useState` | `searchParams` để F5/chia sẻ link vẫn đúng |
| Màu hex, `bg-blue-500`, `dark:`, `w-[437px]` | Utility token / thang spacing chuẩn (lint chặn) |
| `<button>`, `<input>` thô | `Button`, `Field` + `Input` từ `@kb/ui` |
| Hiện "92% tin cậy" lấy từ model | Trạng thái theo ADR 0003 (`CROSS_CHECKED`, `CONFLICT`…) |
| Thông tin chính (lỗi, cảnh báo, kết quả) để cỡ `text-xs` | `text-sm`; `text-xs` chỉ cho gợi ý phụ |
| `useMutation` không có `onError` | `onError: toastMutationError("…")` |
| Cùng một trạng thái mà hai màn hai nhãn khác nhau | Một nguồn: `STATUS_META` trong `@kb/ui` |
| Truyền `className="w-48"` cho control rồi tự bọc thêm `div` để ép bề rộng | Truyền thẳng: class bề rộng/flex của `Select` tự áp cho khung bao |
| Báo "xong" khi mới chạy test | Mở trình duyệt, đo/chụp màn vừa sửa ở sáng + tối + mobile |
