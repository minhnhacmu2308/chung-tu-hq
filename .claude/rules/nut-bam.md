---
paths:
  - "apps/web/**/*.tsx"
  - "packages/ui/**/*.tsx"
---

# Rule: nút bấm đồng bộ toàn hệ thống

Mọi nút là `Button` của `@kb/ui`. Chọn `variant` theo **vai trò** của nút, không theo sở thích từng màn. Cùng một vai trò thì ở màn nào cũng phải giống nhau.

## 1. Vai trò → variant

| Vai trò | Dùng | Ví dụ |
|---|---|---|
| Thao tác chính của vùng (lưu, gửi, sang bước sau) | `primary` (mặc định) – **tối đa 1 nút chính mỗi vùng** (chân popup, thanh hành động, đầu trang) | Lưu, Sang Review tờ khai, Thêm mặt hàng |
| Hủy / Đóng / Quay lại / Để sau / Bỏ qua (bỏ thao tác, không xóa dữ liệu) | `secondary` – nền trắng, viền | Hủy, Đóng, Quay lại OCR, Về thẻ KVGS, Để sau |
| Thao tác phụ đứng cạnh nút chính | `secondary` | Xuất Excel, Nhập dữ liệu, Gộp/Tách dòng |
| Xóa / gỡ / hủy dữ liệu | `danger-outline` cạnh nút chính; `danger-ghost` nút thùng rác trong dòng; `danger` (đỏ đặc) chỉ cho nút xác nhận cuối trong `ConfirmDialog` / thanh thao tác hàng loạt | Xóa mặt hàng, Hủy tờ khai |
| Nút icon trong dòng, thanh công cụ, cạnh nhãn | `ghost` + `size="icon"`/`"icon-sm"` + `aria-label` + `Tooltip` | ✓ / ✕ trên dòng, ⓘ hướng dẫn |
| Liên kết trong câu chữ | `link` | "xem hướng dẫn" |

`ghost` có chữ **chỉ** dùng cho nút không đứng cạnh nút chính và không phải Hủy/Đóng/Quay lại (vd "Thêm dòng" trong bảng). Nhìn như chữ thường nên không dùng cho nút người dùng phải tìm.

## 2. Kích thước

| Chỗ | Size |
|---|---|
| Chân popup, form, thanh hành động, đầu trang | `md` (mặc định, 40px) |
| Thanh công cụ của bảng, thanh thao tác hàng loạt, trong thẻ nhỏ | `sm` (32px) |
| Trong ô bảng | `sm` / `icon` có `className="h-8 w-8"`; ô nhập cùng hàng cao 32px: `Input className="h-8"`, `Combobox size="sm"` |
| Nút icon trên đường viền khung, cạnh nhãn | `icon-sm` |

Các nút đứng cùng một hàng phải cùng size. Ô nhập và nút trong cùng hàng phải cùng chiều cao.

## 3. Thứ tự và vị trí

- Chân popup / form: nút trong `DialogFooter`. Nút phụ (Hủy, Quay lại) bên trái, nút chính ngoài cùng bên phải.
- Nút xóa (`danger-outline`) và thao tác khác loại (Gộp, Xuất…) tách về trái bằng `className="mr-auto"`, xa nút chính.
- Nút chuyển trang dùng `asChild` bọc `<Link>`, giữ đúng variant theo vai trò (Quay lại → `secondary`).

## 4. Nội dung nút

- Icon đặt qua `leftIcon` / `rightIcon` (`h-4 w-4`), không nhét `<svg>` vào children.
- Đang chạy → `loading` (tự khóa nút, hiện spinner). Không tự ghép `Spinner` + `disabled`.
- Nhãn lấy từ `*.messages.ts` (đủ vi/en/zh), dạng động từ ngắn ("Lưu", "Quay lại OCR"). Nhãn dài trong Alert trên mobile → `wrap`.
- Nút chỉ có icon luôn có `aria-label` (+ `Tooltip`).

## 5. Không được làm

| Sai | Đúng |
|---|---|
| `variant="ghost"` cho Hủy / Đóng / Quay lại / Để sau (lint `apps-ghost-cancel` chặn, kể cả nút viết nhiều dòng, bọc `<Link>`, nút có `leftIcon={<ArrowLeft />}`) | `variant="secondary"` |
| Nút chữ `ghost` trong `DialogFooter` / `CardFooter` hoặc cạnh nút chính (Bỏ qua, Khôi phục, Hoàn tác, Đặt lại, Ở lại, Tạo mới từ…) – lint `apps-ghost-in-footer` chặn phần nằm trong footer | `secondary`; ngắt kết nối / gỡ → `danger-outline` / `danger-ghost` |
| Hai nút `primary` cạnh nhau | Một `primary`, còn lại `secondary` |
| Nút xóa `ghost`/`secondary` xám, hoặc tự thêm `text-danger` | `danger-outline` / `danger-ghost` |
| `<button>` thô, `className` đổi màu/nền/bo góc của `Button` | Chọn đúng `variant`; thiếu thì thêm variant vào `@kb/ui` |
| Ô nhập cao 40px đứng cạnh ô 32px trong cùng dòng bảng | `Combobox size="sm"` / `Input className="h-8"` |

Máy chưa bắt được (review phải soát): hai nút chính trong một vùng; thứ tự nút sai; nút phụ cạnh nút chính dùng `ghost` ở **ngoài** footer (thanh hành động, khối gợi ý); nút cùng hàng khác size; ô nhập lệch chiều cao trong bảng.
