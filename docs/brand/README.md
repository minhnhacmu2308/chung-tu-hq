# KhaiBáo AI — bộ logo và quy tắc dùng

## 1. Logo
- **Ý tưởng**: một **tờ khai** với các dòng chỉ tiêu; **góc giấy tách ra thành mũi tên** — tạo tờ khai và truyền tới Hải quan.
- **Phiên bản**: ngang (chính) · dọc · chỉ ký hiệu · chỉ chữ.
- **Trong code**: dùng component `BrandMark` của `@kb/ui` (vẽ bằng `currentColor`, tự theo màu thương hiệu của doanh nghiệp). Không nhúng file SVG có mã màu vào màn hình.

| File | Dùng cho |
|---|---|
| `khaibao-horizontal.svg` (+ `-black`, `-white`, `-mono-0f6b55`) | Đầu trang, tài liệu, email |
| `khaibao-stacked.svg` (+ `-white`, `-mono-0f6b55`) | Chỗ vuông/hẹp: bìa, ảnh đại diện lớn |
| `khaibao-symbol.svg` (+ `-black`, `-white`, `-mono-0f6b55`, `-square`) | Ký hiệu đứng riêng |
| `khaibao-symbol-small.svg`, `khaibao-symbol-favicon.svg` | Cỡ ≤ 24 px (dòng chỉ tiêu cao hơn) |
| `khaibao-symbol-tiny.svg`, `khaibao-symbol-tiny-app-icon.svg` | Cỡ 16 px (tab trình duyệt): chỉ còn MỘT dòng chỉ tiêu đậm và góc mũi tên lớn hơn để không nhòe. Đang dùng cho `icon.svg` + `favicon.ico` |
| `khaibao-symbol-app-icon.svg`, `icon-512.png`, `apple-touch-icon.png`, `favicon.ico` | Icon ứng dụng / tab trình duyệt (đã cài ở `apps/web/src/app/`) |
| `khaibao-wordmark.svg` | Chỉ chữ |

## 2. Khoảng trống
Giữ quanh logo một khoảng trống bằng **cạnh của góc giấy (mũi tên)** ở mọi phía. Khoảng này co giãn theo logo.

## 3. Cỡ nhỏ nhất
| Phiên bản | Màn hình |
|---|---|
| Ngang | rộng 96 px |
| Ký hiệu | 16 px (dùng bản `-small` / `BrandMark small`) |

## 4. Màu
| Tên | HEX | RGB |
|---|---|---|
| Xanh KhaiBáo | `#0F6B55` | 15 · 107 · 85 |
| Trắng | `#FFFFFF` | 255 · 255 · 255 |
| Đen | `#000000` | 0 · 0 · 0 |

Cặp logo/nền được dùng: xanh trên trắng · trắng trên xanh · đen trên trắng · trắng trên nền tối. Mã CMYK/Pantone cho in ấn **chưa xác định** — cần nhà in đối chiếu màu.

## 5. Chữ
Chữ "KhaiBáo AI" trong logo dựng từ **Be Vietnam Pro SemiBold** (giấy phép SIL Open Font License), đã chuyển thành nét vẽ — không gõ lại bằng font khác.

## 6. Không nên
Không kéo méo · không đổi màu ngoài bảng màu · không xoay · không thêm bóng, viền, chuyển sắc · không đổi vị trí/tỉ lệ ký hiệu và chữ · không đặt lên nền rối mà không có ô nền.

## 7. Lưu ý
- Chưa tra cứu nhãn hiệu. Trước khi dùng thương mại nên tra cứu tại Cục Sở hữu trí tuệ và tìm kiếm hình ảnh tương tự.
- Các phương án đã cân nhắc nhưng không nằm trong bộ này: chữ K có nhánh mũi tên, các dòng chỉ tiêu nối thành mũi tên, và vòng đầu (chữ "á" dấu tick).
