# Danh mục hàng hóa dùng chung – mã nối, bộ mã theo bộ phận, quy đổi đơn vị

- Ngày: 2026-11-13 · Trạng thái: chờ duyệt spec
- ADR: [0015](../../adr/0015-catalog-canonical-items-code-sets.md)
- Hiện trạng đã khảo sát: `product_catalog` (`packages/core/src/db/schema/declaration.ts:139`), use case `modules/declaration/application/product-catalog.ts`, màn `/products` (`apps/web/src/features/product-catalog/`), khớp HS theo tên `features/dossier-detail/steps/hs/catalog-match.ts`, bài học dòng hàng (ADR 0009, khóa `P:<partNo>`).

## 1. Bài toán và mục tiêu

Trong doanh nghiệp khách hàng, mỗi bộ phận quản lý mã hàng theo cách riêng – **kế toán/ERP, kho, XNK/hải quan, và mã của nhà cung cấp/khách hàng** in trên chứng từ. Cùng một mặt hàng mang nhiều mã, nhiều đơn vị tính (cuộn ↔ mét ↔ kg), nên khi xuất hóa đơn, làm báo cáo quyết toán… số liệu không đối chiếu được.

Hiện trạng trong code: danh mục một bảng, **một ô `code`** (khóa = mã, không có thì tên); khớp HS theo **tên**, bỏ qua mã; dòng tờ khai **không lưu mã hàng/không trỏ danh mục** (chỉ tiêu `HAG_MAHANG` để trống); hóa đơn phát hành chép nguyên Part No OCR; bài học Part No → HS là kho riêng; không có khái niệm phòng ban; chưa có quyết toán/tồn kho/định mức.

**Mục tiêu**: một **mặt hàng chuẩn có mã nối** do hệ thống cấp; mỗi bộ phận/đối tác giữ **mã riêng làm bí danh**; có **quy đổi đơn vị**; mọi chứng từ (tờ khai, hóa đơn, lô nhập tay) trỏ về mặt hàng chuẩn → số liệu cộng được theo mã nối, mỗi bộ phận vẫn xem/xuất theo mã của mình.

**Thành công** = DN đang vận hành chỉ cần gom 3–4 file Excel + duyệt các nhóm nghi vấn là chạy tiếp; sau đó hóa đơn in đúng mã kế toán/khách hàng, tờ khai có mã hàng XNK, và mọi dòng chứng từ có mã nối để làm quyết toán đợt sau.

### Đã chốt với chủ sản phẩm
- Bốn loại bộ mã: Kế toán/ERP, Kho, XNK/Hải quan, Nhà cung cấp/Khách hàng.
- Mã nối do hệ thống cấp (người dùng gần như không phải nhìn); DN chọn một bộ mã làm "mã hiển thị chính".
- Có khác đơn vị giữa các bộ phận; quy đổi **mặc định cố định theo mặt hàng, ghi đè theo lô** khi chứng từ có số thực tế.
- Mỗi bộ mã có **người phụ trách** (thường mỗi phòng một người) – không dựng module phòng ban.
- Phương án A: khối dữ liệu gốc hàng hóa riêng (module `catalog`).
- **Hai chế độ** chọn khi thiết lập: **Dùng chung một bộ mã** (DN mọi bộ phận cùng một mã – thiết lập nhanh) hoặc **Mỗi bộ phận một bộ mã**. Mã nhà cung cấp/khách hàng luôn là bộ riêng ở cả hai chế độ.

### Phạm vi
- Trong: mặt hàng chuẩn, bộ mã + người phụ trách, bí danh, quy đổi đơn vị; thiết lập lần đầu; nhập Excel → ghép → duyệt; chuyển dữ liệu `product_catalog`; tra mã khi đọc chứng từ; gắn mã nối vào dòng tờ khai, hóa đơn phát hành, lô nhập tay; điền `HAG_MAHANG`; in mã theo bộ mã trên hóa đơn; xem/xuất theo bộ mã.
- Ngoài (đợt sau): báo cáo quyết toán, nhập–xuất–tồn, định mức; đồng bộ hai chiều với ERP qua API; AI gợi ý ghép.

## 2. Chuyển đổi cho DN đang vận hành

Không ai phải bỏ mã đang dùng. Bốn bước:
1. **Đưa danh mục vào (một lần)**: mỗi bộ phận xuất Excel từ hệ thống của mình (MISA/Fast/SAP, file kho, bảng kê đã khai hoặc danh mục NPL–SP đăng ký HQ); mã đối tác lấy từ invoice/packing list đã OCR.
2. **Hệ thống tự ghép, người phụ trách duyệt chỗ nghi vấn** (mục 4).
3. **Chạy song song một kỳ**, đối chiếu bằng "Bảng đối chiếu mã".
4. **Vận hành**: chứng từ mới tự nhận mã; mã lạ hỏi một lần rồi nhớ; mỗi bộ phận xem/xuất theo mã của mình.

## 3. Dữ liệu (module mới `packages/core/src/modules/catalog`)

Mọi bảng có `org_id` + RLS (bất biến 1). Mã là `string` (bất biến 2), hệ số quy đổi/tiền là Decimal (bất biến 3).

**`catalog_items`** – mặt hàng chuẩn
| Cột | Ghi chú |
|---|---|
| `id`, `org_id` | |
| `item_no` | Mã nối, tự cấp `<tiền tố><số 6 chữ số>` (tiền tố theo DN, mặc định `MH-`), duy nhất theo org, không đổi |
| `kind` | `MATERIAL` (nguyên liệu) · `PRODUCT` (sản phẩm) · `GOODS` (hàng hóa) · `SUPPLY` (vật tư) |
| `name`, `name_key` | Tên chuẩn + tên chuẩn hóa để so |
| `hs_code`, `base_unit` | Mã HS (có thể trống khi mới tạo), đơn vị gốc (mã ĐVT Hải quan) |
| `origin`, `tariff_schedule`, các thuế suất, `description`, `note` | Chuyển từ `product_catalog` |
| `times_declared`, `last_declaration_*` | Chuyển từ `product_catalog`, cập nhật khi tờ khai duyệt |
| `status` | `ACTIVE` · `MERGED` (kèm `merged_into_id`) · `ARCHIVED`. Không xóa cứng mặt hàng đã được tham chiếu |
| `source`, `updated_by`, thời điểm | |

**`catalog_settings`** – mỗi org một dòng: `org_id` (khóa), `mode` (`SHARED` · `PER_DEPARTMENT`), `item_no_prefix` (mặc định `MH-`), `item_no_seq` (bộ đếm cấp mã nối), `setup_at`.

**Chế độ `SHARED`**: chỉ có một bộ nội bộ kind `SHARED` "Mã chung" (`is_default`, `is_primary_display`); nó thay cho Kế toán/Kho/XNK ở mọi chỗ cần (điền `HAG_MAHANG`, in hóa đơn, hiển thị). Không được tạo bộ `ACCOUNTING`/`WAREHOUSE`/`CUSTOMS` khi đang `SHARED`; bộ `SUPPLIER`/`CUSTOMER` vẫn tạo bình thường. **Chuyển sang `PER_DEPARTMENT`**: chọn bộ "Mã chung" trở thành loại nào (Kế toán/Kho/XNK), bí danh giữ nguyên, rồi thêm các bộ còn lại; nếu nó không thành XNK thì phải chọn/tạo bộ XNK mặc định. Chuyển ngược `SHARED` chỉ khi org còn đúng một bộ nội bộ.

**`code_sets`** – bộ mã: `id`, `org_id`, `kind` (`SHARED` · `ACCOUNTING` · `WAREHOUSE` · `CUSTOMS` · `SUPPLIER` · `CUSTOMER`), `name`, `partner_name`, `partner_key` (tên đối tác chuẩn hóa, cho SUPPLIER/CUSTOMER), `is_primary_display` (tối đa một bộ = true mỗi org; không có = hiển thị mã nối), `is_default` (đánh dấu bộ `CUSTOMS` mặc định). Mỗi org có đúng một bộ mặc định cho Hải quan (dùng điền `HAG_MAHANG`): bộ `CUSTOMS` `is_default` ở chế độ `PER_DEPARTMENT`, bộ `SHARED` ở chế độ `SHARED`.

**`code_set_owners`** – `code_set_id`, `user_id` (khóa chính kép), `org_id`.

**`item_aliases`** – bí danh: `id`, `org_id`, `code_set_id`, `code`, `code_key` (chuẩn hóa: viết hoa, bỏ khoảng trắng/`-`/`.`/`/`), `name`, `unit`, `item_id`, `status` (`PROPOSED` · `ACTIVE` · `REJECTED`), `proposed_by`, `decided_by`, `decided_at`, `source` (`IMPORT` · `DOCUMENT` · `MANUAL` · `MIGRATION` · `LESSON`).
Ràng buộc: **unique `(code_set_id, code_key)` WHERE status = 'ACTIVE'** – một mã trong một bộ mã chỉ trỏ một mặt hàng. Một mặt hàng được có nhiều mã trong cùng bộ (mã cũ/mới).

**`item_unit_conversions`** – `item_id`, `unit`, `factor` (numeric, "1 `unit` = `factor` `base_unit`"), unique `(item_id, unit)`.

**Hàng chờ ghép – `catalog_match_queue`**: `id`, `org_id`, `import_id` (nullable), `code_set_id`, `code`, `name`, `unit`, `hs_code`, `level` (`SURE` · `MAYBE` · `NONE`), `suggested_item_id`, `candidates` jsonb (≤ 5: itemId, điểm, lý do), `reason`, `status` (`PENDING` · `DONE` · `SKIPPED`), `decided_by`, `decided_at`, `source_ref` (vd dòng tờ khai/hồ sơ đã sinh ra mục này).

**`catalog_imports`** – lần nhập: `id`, `org_id`, `code_set_id`, `file_name`, `column_map` jsonb, `status` (`PARSING` · `MATCHING` · `DONE` · `FAILED`), `counts` jsonb (mới / tự ghép / chờ / lỗi), `errors` jsonb (theo dòng), thời điểm, người nhập.

**Nối với chứng từ** (cột mới, nullable, không FK chéo module – chỉ id):
- `line_items`: `catalog_item_id`, `catalog_alias_id`, `unit_factor` (hệ số theo lô, numeric, null = dùng mặc định), `item_code` (mã điền `HAG_MAHANG`).
- Ảnh chụp hóa đơn phát hành (`issued-invoice` items jsonb): `catalogItemId`, `printedCode`, `printedUnit`, `printedQuantity`.
- Dòng lô nhập tay: `catalogItemId`.

**Lịch sử**: mọi sửa tên/HS/ĐVT/bí danh/quy đổi/gộp/tách ghi `field_audit` (append-only, bất biến 6), source `CATALOG_EDIT`.

**Chuyển dữ liệu `product_catalog`** (migration + script idempotent): mỗi dòng → một `catalog_items` (giữ `id` cũ để tham chiếu cũ còn tra được); tạo `catalog_settings` (`mode` chưa chọn → coi như `PER_DEPARTMENT` cho tới khi thiết lập) và sẵn bộ `CUSTOMS` "XNK" (nếu thiết lập chọn `SHARED`, bộ này đổi thành `SHARED` "Mã chung"); `code` cũ → bí danh `ACTIVE` trong bộ XNK; `unit` → `base_unit`; `partner` cũ → `note` (đề xuất tạo bộ mã nhà cung cấp ở bước ghép). Bảng `product_catalog` giữ lại chỉ đọc một bản phát hành rồi xóa ở đợt sau.

## 4. Nhập Excel → ghép → duyệt

**Thiết lập lần đầu** (Quản trị/Chủ), bước 1 chọn chế độ:
- **Dùng chung một bộ mã (thiết lập nhanh)**: một bộ "Mã chung" + người phụ trách + tiền tố mã nối → nhập **một file** Excel là xong; ghép chỉ để phát hiện trùng trong chính danh mục (luật `SURE`/`MAYBE` như dưới, không có so chéo giữa các bộ nội bộ).
- **Mỗi bộ phận một bộ mã**: tạo sẵn ba bộ Kế toán, Kho, XNK; đặt tên, người phụ trách, tiền tố mã nối, mã hiển thị chính.
Ở cả hai chế độ, bộ nhà cung cấp/khách hàng tạo dần. Đổi chế độ sau này ở tab Bộ mã (Quản trị/Chủ), theo quy tắc mục 3.

**Nhập** (mỗi lần một bộ mã): tải `.xlsx` → tự nhận cột theo tên thường gặp (`Mã hàng`, `Mã vật tư`, `Mã VT`, `Item code`, `Tên hàng`, `Tên vật tư`, `ĐVT`, `Đơn vị tính`, `Mã HS`, `HS code`, `Quy đổi`…) → người dùng sửa ghép cột → **xem trước** kiểm từng dòng (Zod): thiếu mã/tên, trùng mã trong file, HS sai định dạng (4–10 chữ số), ĐVT không có trong danh mục ĐVT Hải quan (cho chọn ĐVT tương ứng) → nhập. Dòng lỗi bỏ qua, dòng khác vẫn nhập. Nhập lại cùng file: mã đã có trong bộ → cập nhật tên/ĐVT; mã mới → vào ghép. File > 500 dòng chạy nền (BullMQ, job `catalog-import`), có tiến độ.
**Lấy từ dữ liệu sẵn có**: dòng tờ khai đã duyệt (mã hàng + HS → bộ XNK) và dòng invoice/packing list đã OCR (Part No + người bán → bộ nhà cung cấp tương ứng).

**Ghép tự động** – code thuần có test (`packages/contracts/src/catalog/match.ts`), không AI:
| Mức | Điều kiện | Xử lý |
|---|---|---|
| `SURE` | (a) `code_key` đã là bí danh ACTIVE trong bộ này; **hoặc** (b) cùng HS 8 số và `name_key` trùng hẳn; **hoặc** (c) cùng `code_key` là bí danh ACTIVE ở bộ khác **và** cùng HS 4 số (hoặc cả hai thiếu HS và `name_key` trùng) | Tự ghép (bí danh ACTIVE). Nếu ĐVT dòng ≠ `base_unit` và chưa có quy đổi → hạ xuống `MAYBE` |
| `MAYBE` | Điểm tên (Dice trên từ của `name_key`) ≥ 0,8 và cùng chương HS (2 số) hoặc một bên thiếu HS; **hoặc** cùng HS 8 số nhưng tên khác | Vào hàng chờ, gợi ý ứng viên điểm cao nhất + ≤ 4 ứng viên khác, kèm lý do |
| `NONE` | Không ứng viên nào đạt | Vào hàng chờ dạng "tạo mặt hàng mới" |

**Duyệt**: người phụ trách bộ mã của mục (Quản trị duyệt mọi bộ) chọn Xác nhận / Chọn mặt hàng khác / Tạo mặt hàng mới / Bỏ qua; xác nhận hàng loạt. ĐVT khác `base_unit` mà chưa có quy đổi → bắt buộc nhập hệ số trước khi xác nhận. Xử lý idempotent (mục đã DONE → `CATALOG_QUEUE_ITEM_DONE`).

**Kết quả + đối chiếu**: tóm tắt số mới/tự ghép/chờ/lỗi; xuất **Bảng đối chiếu mã** (mỗi dòng một mã nối + mã ở mọi bộ, tên, ĐVT, hệ số).

## 5. Tra mã và dùng ở chứng từ

**Dịch vụ tra mã** `resolveItem(orgId, { codeSetId?, partnerName?, code?, name?, hsCode?, unit? })` → `{ itemId, aliasId, level, factor? } | { level: "NONE", candidates }`. Thứ tự: bí danh ACTIVE trong bộ chỉ định → cùng `code_key` ở bộ khác (luật `SURE`(c)) → luật ghép mục 4.

- **Đọc invoice/packing list**: Part No từng dòng tra trong bộ nhà cung cấp (nhận theo `partner_key` của người bán; chưa có → tạo bộ). Thấy → gắn mặt hàng; HS/tên/thuế của mặt hàng **thay** gợi ý khớp-tên hiện tại (`catalog-match.ts`), vẫn là gợi ý – HS phải được người khai xác nhận (bất biến 7). Mã lạ → dòng hàng hiện "Mã lạ – Chọn mặt hàng"; người phụ trách bộ mã chọn → bí danh ACTIVE ngay; người khác → `PROPOSED` (dòng hồ sơ vẫn đi tiếp).
- **Bài học dòng hàng** (ADR 0009): tra bí danh trước khóa `P:<partNo>`; duyệt bài học LINE sinh đề xuất bí danh `source = LESSON`.
- **Tờ khai**: dòng lưu `catalog_item_id`, `catalog_alias_id`; `HAG_MAHANG` = mã của mặt hàng trong bộ `CUSTOMS` (nhiều mã → mã mới nhất); không có → để trống + cảnh báo (không chặn truyền). ĐVT invoice ≠ ĐVT khai → gợi ý lượng quy đổi (hệ số lô từ packing list nếu có, không thì danh mục), hiện phép tính, sửa được (ghi `field_audit`).
- **Duyệt tờ khai**: thay `recordApprovedProducts` – dòng đã gắn mặt hàng → cập nhật `times_declared`/`last_declaration_*`; dòng chưa gắn → mục hàng chờ `NONE` (không tự thêm thẳng vào danh mục). Gọi qua port module `catalog` **sau** khi giao dịch tờ khai commit (không gọi port module khác trong transaction).
- **Hóa đơn phát hành**: mẫu hóa đơn thêm `itemCodeSet` (bộ mã in ở cột mã hàng; mặc định = bộ khách hàng nếu có, không thì Kế toán – hoặc "Mã chung" ở chế độ `SHARED` – không thì mã nối); số lượng quy đổi sang ĐVT của bí danh đó; ảnh chụp lưu mặt hàng + mã/ĐVT/lượng đã in.
- **Lô nhập tay / khai trước hàng xuất**: chọn hàng tìm theo mọi mã, mã nối, tên.
- **Xem/xuất theo bộ mã**: danh sách mặt hàng đổi cột mã/tên/ĐVT theo bộ đang chọn; Excel xuất theo đó.

## 6. Giao diện (`apps/web/src/features/catalog/`, route `/products` giữ nguyên)

Bốn tab:
1. **Mặt hàng** – `DataTable` (thẻ trên mobile): mã hiển thị chính, tên, HS, ĐVT gốc, loại, số bộ có mã, trạng thái; tìm theo mọi mã/tên; `Select` "Xem theo bộ mã"; lọc loại / "chưa có mã XNK" / "chưa có quy đổi"; Thêm, Xuất Excel, Xuất bảng đối chiếu mã. Bấm dòng → panel chi tiết (`Dialog` panel, nút Đóng cuối): thông tin chung, mã theo bộ mã (bảng con + `RowActions` Chuyển sang mặt hàng khác/Ngưng dùng), quy đổi đơn vị, đã dùng ở (tờ khai/hóa đơn gần nhất), lịch sử; Gộp vào mặt hàng khác (`ConfirmDialog`), Ngưng dùng.
2. **Bộ mã** – dòng đầu hiện chế độ ("Dùng chung một bộ mã" / "Mỗi bộ phận một bộ mã") + nút **Đổi chế độ** (Quản trị/Chủ, popup theo quy tắc chuyển); danh sách (tên, loại `StatusBadge`, số mã, người phụ trách, ★ mã hiển thị chính); popup tạo/sửa (người phụ trách chọn nhiều; chế độ `SHARED` chỉ cho tạo bộ nhà cung cấp/khách hàng). Danh mục trống → `EmptyState` + "Thiết lập danh mục" (trình hướng dẫn: bước 1 chọn chế độ, chế độ dùng chung đi thẳng tới nhập file).
3. **Chờ duyệt** (số đếm) – `DataTable`: mã/tên theo bộ → gợi ý, mức (`StatusBadge` Chắc chắn/Nghi vấn/Không khớp), lý do, người đề xuất; lọc "Của tôi"/bộ mã/mức; ✓ Xác nhận, Chọn khác (`Combobox` tìm mọi mã), Tạo mới, Bỏ qua; ô hệ số trên dòng khi thiếu quy đổi; chọn nhiều → "Xác nhận n mục".
4. **Nhập dữ liệu** – chọn bộ mã → `FileDropzone` → ghép cột → xem trước lỗi → nhập (tiến độ) → tóm tắt + "Xem n mục chờ duyệt"; nút "Lấy từ chứng từ đã đọc".

Màn khác: bước kiểm dòng hàng của hồ sơ có thẻ mã nối + tên; "Mã lạ" + `Combobox` chọn/tạo; tờ khai hiện chú thích quy đổi ở ô lượng; mẫu hóa đơn có `Select` "In mã hàng theo bộ mã"; ô chọn hàng ở lô nhập tay tìm theo mọi mã. Mọi nhãn 3 ngôn ngữ trong `*.messages.ts`; chỉ `@kb/ui` + token.

## 7. Quyền, lỗi

**Quyền** (backend `requireRole` + kiểm người phụ trách; giao diện chỉ ẩn nút cho đỡ rối):
| Vai trò | Được |
|---|---|
| VIEWER | Xem, xuất |
| DECLARANT | Đề xuất bí danh, tạo mặt hàng (vào hàng chờ), gắn mặt hàng cho dòng hồ sơ mình làm |
| Người phụ trách bộ mã (bất kỳ vai trò ≠ VIEWER) | Sửa/duyệt bí danh, quy đổi, nhập Excel trong bộ của mình |
| ADMIN, OWNER | Tất cả: bộ mã, người phụ trách, gộp/tách, thiết lập, sửa mặt hàng |
APPROVER: như DECLARANT + sửa thông tin chung mặt hàng (tên, HS, thuế) – như quyền danh mục hiện tại.

**Lỗi** (mã lý do ổn định + nhãn vi/en/zh):
| Tình huống | Mã / xử lý |
|---|---|
| Mã đã trỏ mặt hàng khác trong cùng bộ | `CATALOG_CODE_TAKEN` (kèm mặt hàng đang giữ) |
| Thiếu quy đổi khi xác nhận ghép khác ĐVT | `CATALOG_UNIT_FACTOR_REQUIRED` |
| Hệ số lô lệch > 20% so với mặc định | Cảnh báo, không chặn |
| Mục hàng chờ đã xử lý | `CATALOG_QUEUE_ITEM_DONE` |
| Gộp vào chính nó / vào mặt hàng đã gộp | `CATALOG_MERGE_INVALID` |
| Không phải người phụ trách bộ mã | `CATALOG_NOT_CODE_SET_OWNER` |
| Vai trò thiếu (vd VIEWER sửa) | `FORBIDDEN` |
| Excel sai cấu trúc / dòng lỗi | Lỗi theo dòng trong `catalog_imports.errors` |
| Hai bộ cùng `is_primary_display` | Ràng buộc DB (partial unique) |
| Tạo bộ Kế toán/Kho/XNK khi đang `SHARED`; chuyển về `SHARED` khi còn > 1 bộ nội bộ | `CATALOG_MODE_CONFLICT` |

Không tính lượt khai; không AI; nhập lớn chạy nền, không gọi dịch vụ ngoài.

## 8. Kiểm thử
- **contracts**: chuẩn hóa mã; luật ghép 3 mức (bảng ca mẫu); quy đổi Decimal; Zod dòng Excel + nhận cột.
- **core**: chế độ `SHARED` (thiết lập nhanh, `HAG_MAHANG`/hóa đơn dùng "Mã chung", chặn tạo bộ nội bộ khác, chuyển sang `PER_DEPARTMENT` giữ bí danh); bộ mã/người phụ trách; nhập (lần đầu, nhập lại không trùng); ghép, duyệt, từ chối, idempotent; gộp/tách (chứng từ cũ tra đúng qua `merged_into_id`); quyền vai trò + người phụ trách; org khác → NOT_FOUND; `field_audit`; chuyển `product_catalog` (số dòng, mã cũ → bí danh XNK, id giữ nguyên); `resolveItem`; tờ khai duyệt → cập nhật/hàng chờ.
- **int Postgres**: RLS các bảng mới, unique bí danh ACTIVE, partial unique mã hiển thị chính, migration chuyển dữ liệu.
- **extraction/declaration/invoice**: Part No → đúng mặt hàng; mã lạ → đề xuất; `HAG_MAHANG`; quy đổi lượng theo lô; hóa đơn in mã/ĐVT theo bộ mã.
- **web**: 4 tab, thiết lập, nhập (ghép cột, xem trước), hàng chờ (hàng loạt, bắt buộc hệ số), "Mã lạ" ở dòng hàng, axe, 3 ngôn ngữ.
- **Trình duyệt**: sáng/tối, 1366/390, vi/en/zh; seed 3 bộ mã + vài chục mặt hàng có khác ĐVT và trùng mã.

## 9. Tài liệu cập nhật
ADR 0015; `docs/QUY-TRINH-NGHIEP-VU.md` (mục danh mục, dòng 430–433); `docs/ARCHITECTURE.md` (module `catalog`, bảng, job `catalog-import`); `docs/adr/0009` (bài học tra bí danh); `apps/web/CLAUDE.md` (route `org/catalog/*`); `docs/DESIGN-SYSTEM.md` nếu thêm component.
