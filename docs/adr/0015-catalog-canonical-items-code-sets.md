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

## Bổ sung 2026-11-14 – bộ nguồn gốc, ghép cột, cột Mã nối
Spec: `docs/superpowers/specs/2026-11-14-catalog-nguon-goc-ghep-cot.md` (chủ sản phẩm đã duyệt).
1. **Bộ nguồn gốc**: đúng một bộ nội bộ mỗi doanh nghiệp (`code_sets.is_source`, unique một phần theo org; SUPPLIER/CUSTOMER → `CATALOG_SOURCE_SET_INVALID`). Bộ này quyết định ĐVT gốc (= ĐVT mã của nó) và tên/HS/loại/xuất xứ/biểu thuế/thuế suất/mô tả/ghi chú; bộ khác chỉ là bí danh. Migration `0040` chọn SHARED → bộ mặc định XNK → bộ nội bộ sớm nhất.
2. **Đổi gốc mặt hàng là code thuần** (`catalog/domain/rebase.ts`, Decimal, 9 số lẻ ROUND_HALF_UP): chia quy đổi và hệ số theo lô trên dòng tờ khai cho f. Hệ số trên dòng tờ khai (bảng của declaration) đổi **trong cùng transaction** qua repo `lineFactors` ở `src/db/catalog-line-factors.ts` (theo mẫu `field-audit.ts`) – ngoại lệ có chủ đích của "mỗi module chỉ ghi bảng của mình", giới hạn ở cột `unit_factor` của dòng gắn mặt hàng; dòng thuộc tờ đã gửi cũng đổi vì đó chỉ là gợi ý, chỉ tiêu đã khai không đổi.
3. **Đổi bộ nguồn gốc** (`PUT /api/org/catalog/code-sets/source`, xem trước `GET …/source/preview`): chuyển cờ trong một transaction, đổi gốc theo lô ≤ 200 mặt hàng; thiếu hệ số giữ nguyên và trả về để "Áp dụng lại" (idempotent). Tên/HS/thuế không tự chép.
4. **Nhập file**: ghép cột đủ trường (Mã nối, loại, xuất xứ, biểu thuế, 6 thuế suất, mô tả, ghi chú); thông tin mặt hàng chỉ áp ở bộ nguồn gốc. Cột Mã nối nối thẳng (lý do `LINKED_BY_CODE`; không khớp `LINK_NOT_FOUND`), vẫn không dùng AI. Hàng chờ lưu `factor` + `item_fields` để duyệt không mất dữ liệu dòng. File không có HS: mã trùng bộ khác + tên giống ≥ 0,8 → SURE (`CODE_OTHER_SET_NAME`), tên khác → MAYBE (`CODE_OTHER_SET_NO_HS`). "Tải file đối chiếu" cho bộ không phải nguồn gốc: bộ phận điền mã của mình cạnh Mã nối rồi nhập lại (dòng chưa điền bỏ qua).

## Bổ sung 2026-11-14 – ĐVT số lượng 2 + tỷ lệ
Spec: `docs/superpowers/specs/2026-11-14-catalog-so-luong-2.md` (chủ sản phẩm đã duyệt: lưu "ĐVT 2 + tỷ lệ", không lưu con số cố định). `catalog_items.qty2_unit` + `qty2_factor numeric(24,9)` (số ĐVT 2 trong 1 ĐVT gốc; ĐVT 2 = gốc → 1; khác gốc thiếu tỷ lệ → `CATALOG_QTY2_FACTOR_REQUIRED`) là thông tin mặt hàng của bộ nguồn gốc (cột nhập `qty2Unit`/`qty2Factor`, sửa ở khung mặt hàng, field_audit cùng transaction); đổi gốc (cả sửa thẳng ĐVT gốc khi có quy đổi giữa hai gốc – không có thì bắt nhập lại tỷ lệ) nhân tỷ lệ với f. Tờ khai: Số lượng (2) 1.84/2.73 = SL dòng × hệ số dòng→gốc (lô thắng danh mục) × tỷ lệ, 2 số lẻ ROUND_HALF_UP – hàm thuần `itemQuantity2` (contracts). Giá trị được **LƯU trên dòng** (`line_items.quantity2/_unit/_factor`, migration `0042`) khi áp kế hoạch danh mục (`linkPatch`, cùng lúc `item_code`, dòng thuộc tờ đã khóa giữ nguyên), gắn mặt hàng, đổi hệ số lô; màn hình và payload FPT đọc giá trị đã lưu – không gọi danh mục lúc truyền, nên nội dung truyền = nội dung đã duyệt. Có Số lượng (2) thì thuộc ảnh chụp "đã gửi" (đổi sau khi gửi bị guard `SENT_SHEETS_CHANGED` bắt). Chưa tính được → SL2 = SL1 như cũ; ô người khai nhập thắng. Migration `0041` (danh mục), `0042` (dòng hàng).
