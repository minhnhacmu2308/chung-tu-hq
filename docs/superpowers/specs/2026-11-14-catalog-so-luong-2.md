# Danh mục hàng hóa: ĐVT số lượng 2 + tỷ lệ → tự điền Số lượng (2) trên tờ khai

- Ngày: 2026-11-14 · Bổ sung ADR 0015 · Chủ sản phẩm đã duyệt: lưu "ĐVT 2 + tỷ lệ" (không lưu con số cố định – số lượng 2 đổi theo từng lô).

## 1. Danh mục
- `catalog_items` thêm `qty2_unit text` (mã ĐVT Hải quan) + `qty2_factor numeric(24,9)` = số ĐVT 2 trong **1 ĐVT gốc** (vd 1 PCE = 0,25 KGM → 0.25). ĐVT 2 = ĐVT gốc → tỷ lệ 1 (không bắt nhập). Có ĐVT 2 khác gốc mà thiếu tỷ lệ → lỗi kiểm (Zod, > 0).
- Là **thông tin mặt hàng** (như HS, thuế): chỉ bộ nguồn gốc quyết định; nằm trong `CatalogItemFields`; sửa ở khung mặt hàng, ghi field_audit `CATALOG_EDIT` cùng transaction.
- Nhập file: 2 trường mới của Ghép cột `qty2Unit` ("ĐVT số lượng 2", "ĐVT SL2", "ĐVT 2", "unit 2", "second unit") và `qty2Factor` ("Tỷ lệ SL2", "Tỷ lệ số lượng 2", "qty2 factor") – thuộc ITEM_IMPORT_ITEM_FIELDS (chỉ áp ở bộ nguồn gốc). Hàng chờ `item_fields` mang theo.
- Đổi gốc (rebase, gốc cũ B → mới N, 1 N = f B): `qty2_factor` mới = cũ × f (9 số lẻ, ROUND_HALF_UP); ĐVT 2 = N → tỷ lệ 1.

## 2. Tờ khai (1.84 IDA HAG_QN2/QT2 · 2.73 EDA)
- Dòng gắn mặt hàng có `qty2Unit`: SL2 = SL dòng × hệ số dòng→gốc (hệ số theo lô `unit_factor` nếu có, không thì quy đổi danh mục; ĐVT dòng = gốc → 1) × tỷ lệ; làm tròn 2 số lẻ ROUND_HALF_UP; QT2 = qty2Unit. Không quy được về gốc → không tính (giữ mặc định cũ SL2 = SL1, ĐVT dòng).
- Dùng cho cả form hiển thị (itemFormValues) lẫn payload truyền FPT (itemDefaults). Ô người khai đã nhập (HANG.<id>.HAG_QN2/QT2) vẫn thắng.
- LineItem DTO thêm `quantity2?: { qty, unit, factor }` (factor = số ĐVT 2 trên 1 ĐVT dòng) – chú thích ở khung "Quy đổi lượng": "n ĐVT × factor = qty ĐVT2 (theo danh mục)".

## 3. Bất biến / test
- orgId, RLS (cột mới trên bảng có RLS), Decimal, Zod, field_audit cùng tx, không AI, 3 ngôn ngữ, mock = http.
- Test: domain (tính SL2, làm tròn, rebase tỷ lệ), use case (sửa mặt hàng, org khác), int (migration 0041, cột), web (khung mặt hàng, ghép cột, chú thích dòng tờ khai), payload FPT có HAG_QN2/QT2 đúng.
