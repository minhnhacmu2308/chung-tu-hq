# Rule: popup hiện ở đâu – giữa, bên phải, bên dưới hay neo cạnh nút

Áp dụng cho mọi lớp nổi trong `apps/*`. Chọn theo **mục đích** của popup, không theo thói quen hay độ dài nội dung.
Component: `ConfirmDialog`, `Dialog` + `DialogContent` (`defaultPresentation`: `modal` | `dock` | `panel` | `sheet`), `Popover`/`HelpPopover`, `FloatingActionBar`, `toast`, `Alert`.

## Bảng chọn nhanh

| Người dùng đang làm gì | Vị trí | Dùng | Vì sao |
|---|---|---|---|
| **Quyết định / xác nhận / cảnh báo phải trả lời** – xóa, hủy, ngắt kết nối, rời trang khi chưa lưu, đổi điều kiện làm thay đổi dữ liệu khác (vd đổi incoterm), duyệt/từ chối có lý do ngắn | **Giữa màn hình** (`modal`) | `ConfirmDialog` (xóa/hủy) hoặc `DialogContent tone="warning"` / `size="sm"` + `defaultPresentation="modal"` | Chặn mọi thao tác khác cho tới khi trả lời; mắt nhìn thẳng vào câu hỏi |
| **Thêm / sửa một đối tượng, xem chi tiết một bản ghi** cần nhìn trang bên cạnh (sửa dòng hàng khi xem chứng từ, chi tiết mã HS, nhật ký FPT) | **Bên phải, đẩy trang** (`dock` – mặc định) | `DialogContent` (mặc định) | Giữ ngữ cảnh danh sách/bản in bên trái; sửa xong thấy ngay kết quả |
| **Form dài / trình tự nhiều bước** không cần nhìn trang (tạo doanh nghiệp, thiết lập danh mục, wizard) | **Bên phải, phủ trang** (`panel`) | `DialogContent defaultPresentation="panel"` `size="lg"` | Tập trung, đủ chỗ; vẫn cùng hướng mở với popup sửa |
| **Chọn nhanh gắn với một nút / ô** – bộ lọc, chọn cột, ngày, hướng dẫn, phím tắt | **Neo cạnh nút** | `Popover`, `HelpPopover`, `DropdownMenu` | Không rời chỗ đang làm; đóng bằng Esc / bấm ra ngoài |
| **Thao tác trên các dòng đã chọn** | **Đáy giữa, nổi trên bảng** | `FloatingActionBar` (qua `DataTable selectionActions`) | Luôn trong tầm mắt khi cuộn bảng |
| **Báo kết quả, không cần trả lời** (đã lưu, đã đặt xuất xứ cho n dòng, đã gửi) | **Góc trên phải, tự tắt** | `toast` | Không chắn việc đang làm |
| **Lỗi / thiếu dữ liệu cần sửa tại chỗ** | **Ngay tại ô / vùng đó** | lỗi của `FormField`, `Alert` trong vùng | Lỗi đứng cạnh chỗ sửa; không bật popup cho lỗi nhập |
| **Xem tệp / ảnh / PDF lớn** | **Giữa, gần toàn màn** | `DialogContent size="xl"` `defaultPresentation="modal"` | Cần tối đa diện tích |

## Luật

1. **Bên trái chỉ dành cho menu chính** (`Sidebar`, ngăn kéo menu trên mobile). Không mở popup nội dung từ bên trái: người dùng đọc trái → phải, danh sách/nội dung chính nằm bên trái, chi tiết mở bên phải để vẫn thấy danh sách.
2. **Giữa = phải trả lời.** Popup giữa màn hình luôn có câu hỏi rõ và tối đa 2–3 nút (chính + Hủy/Giữ lại). Có form nhiều ô thì không phải popup giữa – dùng bên phải.
3. **Bên phải = làm việc với một đối tượng.** Mặc định `dock`; chỉ `panel` khi form dài không cần nhìn trang. Người dùng đổi qua lại được (nút chuyển trên header – không tắt, lint `apps-dialog-toggle-off`).
4. **Mobile (< 640px):** popup bên phải nên mở thành khay từ dưới lên (`sheet`); popup giữa giữ giữa, rộng hết màn trừ lề 16px. *Chưa tự động – việc cần làm ở `@kb/ui`: `DialogContent` tự đổi `dock`/`panel` → `sheet` dưới 640px.*
5. **Tối đa 2 tầng:** từ popup bên phải được mở 1 popup giữa (xác nhận). Không mở popup bên phải chồng popup bên phải; cần đối tượng khác → thay nội dung panel hiện tại (có nút Quay lại).
6. **Không popup cho thông báo thành công** – dùng `toast`. Không `toast` cho câu hỏi – dùng popup giữa.
7. **Kích thước theo nội dung:** `sm` câu hỏi/xác nhận, `md` form ngắn (≤ 6 ô), `lg` chi tiết/form nhiều phần, `xl` xem tệp.
8. **Đóng:** Esc và nút ✕ luôn đóng (trừ lúc đang lưu – `ConfirmDialog loading`). Đóng popup bên phải khi đang nhập dở → hỏi "Bỏ thay đổi?" bằng popup giữa.

## Cây quyết định

```
Cần người dùng TRẢ LỜI trước khi làm tiếp?          → GIỮA (modal, sm)
  └ xóa / hủy / khó quay lại?                        → ConfirmDialog
Gắn với 1 nút / ô nhỏ (lọc, chọn, hướng dẫn)?        → NEO CẠNH NÚT (Popover)
Thao tác trên nhiều dòng đã chọn?                    → ĐÁY GIỮA (FloatingActionBar)
Chỉ báo kết quả?                                     → GÓC TRÊN PHẢI (toast)
Xem / sửa / thêm MỘT đối tượng?                      → BÊN PHẢI
  ├ cần nhìn trang song song?                        → dock (mặc định)
  └ form dài, tập trung?                             → panel
Xem tệp lớn?                                         → GIỮA (modal, xl)
```
