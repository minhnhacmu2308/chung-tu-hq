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
9. **Test**: logic thuần trong feature → Vitest; luồng chính → Playwright e2e.

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
