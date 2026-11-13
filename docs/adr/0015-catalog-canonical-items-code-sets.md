# ADR 0015 – Danh mục hàng hóa dùng chung: mã nối, bộ mã theo bộ phận, quy đổi đơn vị

- Trạng thái: Chấp thuận
- Ngày: 2026-11-13
- Ngày chấp thuận: 2026-11-14
- Spec: `docs/superpowers/specs/2026-11-13-danh-muc-hang-hoa-ma-noi-design.md`

## Bối cảnh
Trong doanh nghiệp khách hàng, kế toán/ERP, kho, XNK và đối tác (nhà cung cấp/khách hàng) mỗi bên một bộ mã hàng và đơn vị tính riêng, nên hóa đơn và báo cáo quyết toán không đối chiếu được. Danh mục hiện tại (`product_catalog`, thuộc module `declaration`) chỉ có một ô `code`, khớp HS theo tên; dòng tờ khai và hóa đơn không trỏ về danh mục; chỉ tiêu mã hàng (`HAG_MAHANG`) để trống; ánh xạ Part No → HS nằm riêng ở bài học (ADR 0009). Chưa có khái niệm phòng ban.

## Quyết định
1. **Module mới `catalog`** (dữ liệu gốc hàng hóa) thay cho danh mục trong `declaration`. Tờ khai, trích xuất, hóa đơn, bài học hỏi qua port của module này; không gọi trong transaction của module khác.
2. **Mặt hàng chuẩn có mã nối** (`item_no`) do hệ thống cấp, không đổi; doanh nghiệp chọn một bộ mã làm mã hiển thị chính.
3. **Bộ mã** (Kế toán, Kho, XNK, Nhà cung cấp, Khách hàng) có **người phụ trách**; mã của bộ là **bí danh** trỏ về mặt hàng (một mã ACTIVE trong một bộ → đúng một mặt hàng). Không dựng module phòng ban.
   **Hai chế độ**: *Dùng chung một bộ mã* (một bộ "Mã chung" thay cho Kế toán/Kho/XNK – thiết lập nhanh bằng một file) hoặc *Mỗi bộ phận một bộ mã*; mã nhà cung cấp/khách hàng luôn là bộ riêng. Đổi chế độ không mất bí danh.
4. **Quy đổi đơn vị** cố định theo mặt hàng; hệ số theo lô lưu trên dòng chứng từ khi có số thực tế.
5. **Ghép mã là code thuần có test** (3 mức Chắc chắn / Nghi vấn / Không khớp) + hàng chờ duyệt; không dùng AI (bất biến 5).
6. Dòng tờ khai, hóa đơn phát hành, lô nhập tay lưu **id mặt hàng chuẩn**; `HAG_MAHANG` lấy mã bộ XNK; hóa đơn in mã theo bộ mã chọn trong mẫu.
7. Không xóa cứng mặt hàng đã tham chiếu – gộp bằng `merged_into_id`. Mọi sửa ghi `field_audit`.
8. Chuyển `product_catalog` sang `catalog_items` giữ nguyên id; mã cũ thành bí danh bộ XNK.

## Hệ quả
- Tờ khai duyệt không còn tự thêm thẳng vào danh mục; dòng chưa nhận ra đi vào hàng chờ.
- Thêm 8 bảng (gồm `catalog_settings` cho chế độ và bộ đếm mã nối) + cột nối trên `line_items`; job nền `catalog-import`.
- Báo cáo quyết toán, nhập–xuất–tồn, định mức, đồng bộ ERP hai chiều để đợt sau, dựng trên mã nối.
- `product_catalog` giữ chỉ đọc một bản phát hành rồi xóa.
