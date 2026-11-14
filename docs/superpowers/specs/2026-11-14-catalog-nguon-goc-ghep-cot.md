# Danh mục hàng hóa: bộ nguồn gốc, ghép cột khi nhập, cột Mã nối, giữ hệ số trong hàng chờ

- Ngày: 2026-11-14 · Bổ sung ADR 0015 · Chủ sản phẩm đã duyệt 2 lựa chọn: nguồn gốc quyết định ĐVT gốc + tên/HS/thuế; cho đổi nguồn gốc, hệ thống tự quy đổi lại.

## 1. Bộ nguồn gốc
- Cột mới `code_sets.is_source` (boolean, mặc định false) + unique partial index `(org_id) WHERE is_source` → **đúng một** bộ nguồn gốc mỗi doanh nghiệp. Chỉ bộ nội bộ (ACCOUNTING / WAREHOUSE / CUSTOMS / SHARED) được làm nguồn gốc; SUPPLIER / CUSTOMER → lỗi `CATALOG_SOURCE_SET_INVALID`.
- Migration: mỗi org đã có danh mục → bộ SHARED (nếu có) hoặc bộ `is_default` (XNK) thành nguồn gốc; không có thì bộ nội bộ tạo sớm nhất.
- Thiết lập lần đầu (`setup`): bắt buộc chọn `sourceKind` (PER_DEPARTMENT, mặc định gợi ý CUSTOMS); SHARED → bộ Mã chung tự là nguồn gốc. Đổi chế độ SHARED↔PER_DEPARTMENT giữ nguyên bộ nguồn gốc (bộ Mã chung đổi thành bộ đó).
- Nguồn gốc quyết định: **ĐVT gốc** (= ĐVT của mã ở bộ nguồn gốc), **tên, HS, loại hàng, xuất xứ, biểu thuế, các thuế suất, mô tả, ghi chú** của mặt hàng. File / sửa mã của bộ khác chỉ đổi mã/tên/ĐVT của bộ đó (bí danh), không đè dữ liệu mặt hàng.
- Mặt hàng chưa có mã ở bộ nguồn gốc: giữ ĐVT gốc / thông tin hiện có (tạo từ bộ khác thì lấy theo dòng tạo).
- Gắn mã bộ nguồn gốc vào mặt hàng có ĐVT gốc khác ĐVT của mã → **đổi gốc** mặt hàng (mục 2) bằng hệ số (cột Quy đổi / hệ số đã có); thiếu hệ số → hàng chờ `UNIT_NO_FACTOR`.

## 2. Đổi gốc một mặt hàng (rebase) – code thuần, Decimal
Gốc cũ `B`, gốc mới `N`, `f` = số `B` trong 1 `N` (từ quy đổi đã có của `N`, hoặc hệ số truyền vào).
- Mỗi quy đổi `1 X = x B` (X ≠ N) → `1 X = x / f N`; thêm `1 B = 1 / f N`; bỏ dòng quy đổi của `N`. Làm tròn 9 chữ số thập phân (numeric(24,9)), ROUND_HALF_UP.
- Hệ số theo lô trên dòng tờ khai (`line_items.unit_factor`, đơn vị = ĐVT gốc) của các dòng gắn mặt hàng: chia `f` như trên. Dòng thuộc tờ đã gửi Hải quan cũng đổi (chỉ là gợi ý, không đổi chỉ tiêu đã khai).
- Ghi field_audit `CATALOG_EDIT` (`baseUnit`, `conv:<unit>`) cùng transaction.

## 3. Đổi bộ nguồn gốc (`PUT /api/org/catalog/code-sets/source`, ADMIN hoặc người phụ trách bộ đích)
- `GET …/source/preview?codeSetId=` trả: số mặt hàng sẽ đổi gốc, danh sách mặt hàng **không đổi được** (mã ở bộ mới có ĐVT khác mà thiếu hệ số – kèm mã, tên, ĐVT gốc, ĐVT mới), số mặt hàng không có mã ở bộ mới (giữ nguyên).
- Thực hiện: đặt `is_source` (một transaction: bỏ cờ bộ cũ, đặt bộ mới), đổi gốc từng mặt hàng đổi được (theo lô ≤ 200 mặt hàng/transaction); mặt hàng thiếu hệ số giữ nguyên, trả về danh sách để bổ sung rồi bấm "Áp dụng lại" (cùng endpoint, idempotent). Tên/HS/thuế không tự chép lại từ bộ mới – lần nhập file bộ mới sau đó cập nhật.
- org_audit `CATALOG_SOURCE_CHANGED`.

## 4. Ghép cột khi nhập file
- Giao diện: sau khi đọc file, bước **Ghép cột**: mỗi cột trong file → một trường hệ thống hoặc "Bỏ qua"; tự đoán theo tên cột (mở rộng `detectItemColumns`); mỗi trường chỉ gán một cột; Mã + Tên bắt buộc. Xem trước 5 dòng theo ghép cột. Nhớ ghép cột theo bộ mã (localStorage) cho lần sau.
- Trường hệ thống: `code`, `name`, `unit`, `hs`, `factor`, `linkCode` (Mã nối), `kind` (GOODS/MATERIAL/PRODUCT/… theo `ITEM_KINDS`, nhận cả nhãn tiếng Việt), `origin` (mã nước 2 chữ), `tariffSchedule`, `importDutyRate`, `vatRate`, `envTaxRate`, `exciseRate`, `safeguardRate`, `antiDiscriminationRate` (Decimal ≥ 0, ≤ 1000), `description`, `note`. Kiểm tra từng ô như hiện nay (`TOO_LONG`, `INVALID_FORMAT`), lỗi báo theo dòng/cột.
- Trường thông tin mặt hàng chỉ được áp khi bộ nhận dữ liệu là **bộ nguồn gốc**; bộ khác → giao diện báo "các cột này sẽ bỏ qua vì bộ không phải nguồn gốc" và không gửi.

## 5. Cột Mã nối (`linkCode`)
- Giá trị khớp **mã nối** (`item_no`, so khớp không phân biệt hoa thường/khoảng trắng) hoặc **mã ở bộ nguồn gốc** (codeKey) → nối thẳng vào mặt hàng đó (chuỗi gộp → mặt hàng cuối), bỏ qua luật SURE/MAYBE. Mức `SURE`, lý do mới `LINKED_BY_CODE`.
- Không khớp → hàng chờ, lý do mới `LINK_NOT_FOUND`. ĐVT khác ĐVT gốc mà không có hệ số → hàng chờ `UNIT_NO_FACTOR` với mặt hàng gợi ý = mặt hàng được nối.
- Mã của dòng đã ACTIVE trong bộ cho mặt hàng khác → hàng chờ `AMBIGUOUS` (không tự chuyển).

## 5b. File không có HS, file đối chiếu (bổ sung cùng ngày, chủ sản phẩm duyệt)
- Mã trùng mã của mặt hàng ở bộ khác, một bên thiếu HS: tên giống ≥ 0,8 → SURE `CODE_OTHER_SET_NAME`; tên khác → MAYBE `CODE_OTHER_SET_NO_HS`. Hai bên có HS: giữ luật cùng 4 số.
- Tab Nhập dữ liệu, bộ không phải nguồn gốc: "Tải file đối chiếu" (Mã nối · mã bộ nguồn gốc/tên/HS/ĐVT gốc tham khảo · Mã hàng/Tên hàng/ĐVT/Quy đổi để điền, mã đã có điền sẵn). Tiêu đề cột điền khớp `detectItemColumns` ở cả 3 ngôn ngữ. Nhập lại: dòng có Mã nối mà trống mã → bỏ qua, không báo lỗi.

## 6. Giữ hệ số và dữ liệu dòng trong hàng chờ
- `catalog_match_queue` thêm `factor numeric(24,9)` + `item_fields jsonb` (các trường mặt hàng của dòng, chỉ khi bộ là nguồn gốc). Duyệt: ô hệ số điền sẵn `factor`; "Tạo mới" dùng `item_fields` (loại, xuất xứ, thuế…); "Xác nhận" vào mặt hàng có sẵn với bộ nguồn gốc → áp `item_fields`.

## 7. Bất biến / kiểm tra
- orgId mọi truy vấn, RLS bảng mới/cột mới; Decimal; Zod mọi input; field_audit cùng transaction; không AI.
- Test: domain (rebase, ghép cột, link), use case (đổi nguồn gốc + preview, link, queue giữ hệ số, org khác), int test (unique is_source, migration chuyển dữ liệu, rebase transaction), web (ghép cột, chọn nguồn gốc, preview đổi nguồn gốc, prefill hệ số), mock = http. 3 ngôn ngữ. Trình duyệt sáng/tối 1366/390.
