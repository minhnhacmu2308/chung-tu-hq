# Bản mẫu giao diện tờ khai đầy đủ chỉ tiêu (IDA / EDA)

Ngày: 2026-10-17 · Nhánh: `feat/to-khai-day-du-ban-mau` (tách từ `feat/to-khai-vai-tro-chi-tieu`)

## 1. Mục tiêu và phạm vi

**Mục tiêu:** dựng một **bản mẫu giao diện** có đầy đủ mọi chỉ tiêu của tờ khai nhập khẩu (IDA) và xuất khẩu (EDA), chạy bằng dữ liệu giả, để chủ sản phẩm duyệt bố cục trước khi quyết định làm thật.

**Căn cứ:**
- `tailieuchitieukhaibao/CHITIEU_NHAPKHAU.docx` và `CHITIEU_XUATKHAU.docx`: ảnh màn hình phần mềm khai báo, coi là danh sách đầy đủ các ô cần có.
- Phụ lục II TT39/2018, sửa đổi bởi TT121/2025 (catalog `@kb/contracts/declaration`).
- Đặc tả VNACCS IDA/EDA v1.2 (`@kb/contracts/fpt`).
- Báo cáo `docs/RA-SOAT-CHI-TIEU-TO-KHAI.md`.

**Tiêu chí thành công:**
- Mọi ô trong ảnh mẫu đều có trên bản mẫu.
- Mọi chỉ tiêu 1.1–1.96 và 2.1–2.80 có ít nhất một ô; trừ 1.46 vì Phụ lục ghi "chưa sử dụng".
- Người duyệt phân biệt được ngay ô người khai nhập và ô Hải quan trả về, ô bắt buộc và ô theo tình huống.
- Dùng được ở cả sáng/tối, màn 1366px và 390px.

**Ngoài phạm vi:** lưu dữ liệu, gửi FPT, phân quyền sửa, nối với hồ sơ thật, thay màn Review hiện có. Các phần này quyết định sau khi bản mẫu được duyệt.

## 2. Cấu trúc trang (hướng B: theo luồng làm việc)

Đường dẫn `/ban-mau/to-khai?loai=nhap|xuat&giai-doan=nhap|da-khai|thong-quan`. Trang không nằm trong menu.

**Đầu trang (luôn hiện):**
- mã hồ sơ mẫu, loại tờ khai (IDA/EDA), mã loại hình;
- giai đoạn: Nháp → Đã khai → Đã thông quan;
- 4 thông tin Hải quan trả về để nhìn nhanh: số tờ khai, phân luồng, thông quan, ngày đăng ký ("Chưa có" khi chưa có);
- bộ chuyển *Nhập / Xuất* và *giai đoạn* (chỉ có ở bản mẫu).

### Tab 1 · Người khai nhập

Mục lục các nhóm nằm bên trái (trên điện thoại là ô chọn), mỗi nhóm có bộ đếm "đã nhập / tổng". Các nhóm:

| Nhóm | Ô (theo ảnh mẫu + Phụ lục II) |
|---|---|
| 1. Thông tin chung | mã loại hình, mã phân loại hàng hóa, phương thức vận chuyển, phân loại cá nhân/tổ chức (chỉ IDA), cơ quan hải quan + nhóm xử lý hồ sơ (bộ phận xử lý tờ khai), số tờ khai đầu tiên + số nhánh/tổng số, số tờ khai TN-TX tương ứng, thời hạn tái xuất (IDA) / tái nhập (EDA), ngày khai báo dự kiến |
| 2. Các bên | IDA: người nhập khẩu (mã, tên, mã bưu chính, địa chỉ, điện thoại), người ủy thác nhập khẩu (mã, tên), người xuất khẩu (mã, tên, mã bưu chính, 4 dòng địa chỉ, mã nước), người ủy thác xuất khẩu, mã đại lý hải quan. EDA: người xuất khẩu, người ủy thác xuất khẩu, người nhập khẩu (mã, tên, mã bưu chính, 4 dòng địa chỉ, mã nước), mã đại lý hải quan |
| 3. Vận đơn & vận chuyển | IDA: 5 số vận đơn, ngày vận đơn, số kiện + loại kiện, tổng trọng lượng + đơn vị, số lượng container, mã địa điểm lưu kho, địa điểm dỡ hàng, địa điểm xếp hàng, phương tiện (hô hiệu + tên), ngày hàng đến, ký hiệu và số hiệu, mã kết quả kiểm tra nội dung, ngày được phép nhập kho đầu tiên, ngày khởi hành vận chuyển, 3 địa điểm trung chuyển (địa điểm, ngày đến, ngày khởi hành), địa điểm đích vận chuyển bảo thuế + ngày dự kiến đến. EDA: số vận đơn, số kiện, trọng lượng, địa điểm lưu kho chờ thông quan, địa điểm nhận hàng cuối cùng, địa điểm xếp hàng, phương tiện dự kiến, ngày hàng đi dự kiến, ký hiệu số hiệu, thông tin trung chuyển và điểm đích; **khối Container**: địa điểm xếp hàng lên xe (5 mã, tên, địa chỉ) và 50 ô số container |
| 4. Văn bản pháp quy & giấy phép | 5 mã văn bản pháp quy khác (IDA; EDA khai theo dòng hàng), 5 giấy phép (mã phân loại + số), số hợp đồng gia công + ngày |
| 5. Hóa đơn & trị giá | Hóa đơn: phân loại hình thức, số hóa đơn, số tiếp nhận HĐĐT, ngày phát hành, phương thức thanh toán, mã phân loại giá, điều kiện giao hàng, tổng trị giá + mã tiền. **Hợp đồng quản lý nội bộ:** số hợp đồng, ngày ký, ngày hết hạn. IDA, tờ khai trị giá: mã phân loại khai trị giá, khai trị giá tổng hợp, tổng hệ số phân bổ, chi tiết khai trị giá; phí vận chuyển (phân loại, mã tiền, số tiền); phí bảo hiểm (phân loại, mã tiền, số tiền, số đăng ký bảo hiểm); 5 khoản điều chỉnh (mã tên, mã phân loại, mã tiền, trị giá, tổng hệ số phân bổ). EDA: trị giá tính thuế + mã tiền, phân loại không cần quy đổi VND, tổng hệ số phân bổ |
| 6. Thuế & bảo lãnh | người nộp thuế, mã xác định thời hạn nộp thuế, mã lý do đề nghị BP (IDA), hạn mức (ngân hàng, năm, ký hiệu, số), bảo lãnh (ngân hàng, năm, ký hiệu, số) |
| 7. Đính kèm & ghi chú | 3 số đính kèm khai báo điện tử (phân loại + số), phần ghi chú, số quản lý nội bộ doanh nghiệp |
| 8. Danh sách hàng | bảng các dòng (STT, HS, mô tả, số lượng, trị giá, xuất xứ, trạng thái "đủ / còn thiếu N ô"). Panel chi tiết dòng, phần người khai nhập: mã HS, mã quản lý riêng, mã hàng, mã phân loại tái xác nhận giá, mô tả, số lượng 1 + ĐVT, số lượng 2 + ĐVT, trị giá hóa đơn, đơn giá + mã tiền + ĐVT, số mục khoản điều chỉnh (5), mã nước xuất xứ, mã biểu thuế, mã ngoài hạn ngạch, mã áp dụng thuế tuyệt đối, thuế suất/mức thuế tuyệt đối khi phải nhập tay, trị giá tính thuế khi phân bổ thủ công, STT dòng trên tờ khai TN-TX, danh mục miễn thuế + số dòng, mã miễn/giảm/không chịu thuế + số tiền giảm, 5 khoản thuế và thu khác (mã áp dụng thuế suất, mã miễn giảm, số tiền giảm). EDA thêm: 5 mã văn bản pháp luật khác, tiền lệ phí (đơn giá, số lượng + ĐVT, khoản tiền), tiền bảo hiểm (đơn giá, số lượng + ĐVT, khoản tiền) |

### Tab 2 · Hải quan trả về (chỉ đọc)

- **Đăng ký:** số tờ khai, ngày/giờ đăng ký, ngày/giờ thay đổi đăng ký, mã phân loại kiểm tra (kèm giải nghĩa luồng), tên cơ quan hải quan, đội thủ tục, mã HS đại diện, tổng số trang, tổng số dòng, phân loại xuất báo cáo sửa đổi, biểu thị trường hợp hết hạn.
- **Thuế tờ khai:** 6 sắc thuế (mã, tên, tổng tiền, số dòng), tổng tiền thuế phải nộp, số tiền bảo lãnh, 3 tỷ giá tính thuế, tổng trị giá tính thuế, phân loại nộp thuế, sắc thuế được ân hạn + hạn nộp. EDA: tổng thuế xuất khẩu, tổng lệ phí. Có so sánh "Ứng dụng ước tính … – chênh …".
- **Từng dòng hàng:** trị giá tính thuế (S/M), số lượng tính thuế, đơn giá tính thuế, thuế suất, số tiền thuế, số tiền miễn giảm, các khoản thu khác (tên, trị giá tính thuế, thuế suất, số tiền, miễn giảm, điều khoản).
- **Chỉ thị Hải quan:** phân loại chỉ thị; 10 lần chỉ thị (ngày, người ra/tên, nội dung).
- **Thông quan:** ngày/giờ cấp phép, ngày/giờ hoàn thành kiểm tra, tên trưởng đơn vị, ngày phê duyệt BP, ngày hủy, ngày chuyển thủ công.

Chưa có phản hồi thì ô để trống, kèm câu "Có sau khi khai tạm / khai chính thức / thông quan".

### Tab 3 · Theo dõi & nghiệp vụ

- Nhật ký thông điệp Hải quan (mã, tên, thời gian).
- Nghiệp vụ bổ sung: đăng ký bổ sung file đính kèm (HYS), khai sửa đổi sau thông quan (AMA), khai danh sách container, chứng từ bổ sung, cập nhật hủy tờ khai + lý do.
- Tra cứu: trạng thái tờ khai, nợ thuế, nộp thuế, mã vạch qua khu vực giám sát (KVGS).
- Số hóa chứng từ.
- Trong bản mẫu, các nút chỉ báo "bản mẫu".

## 3. Cách hiển thị ô

- **Nhãn:** "số chỉ tiêu · tên"; ô không có số chỉ tiêu (ngày vận đơn, mã hàng, hợp đồng nội bộ) chỉ ghi tên. Nút (i) mở hướng dẫn khai lấy từ catalog (ghi chú TT121 nếu có).
- **Kiểu ô:** chữ, mã (chọn từ bảng mã có sẵn, hiện "mã – tên"), ngày, số, đoạn văn.
- **Vai trò:** huy hiệu Bắt buộc / Theo tình huống / VNACCS tự xác định / Không bắt buộc. Ô bắt buộc còn trống: viền vàng, ghi "Còn thiếu".
- **Chỉ tiêu nhiều ô con** (địa chỉ 4 dòng, tổng trị giá 4 ô, phí vận chuyển 3 ô…) hiện thành một nhóm có nhãn chung, các ô con nằm ngang và tự xuống dòng trên màn hẹp. Nhóm lặp (5 vận đơn, 5 giấy phép, 5 khoản điều chỉnh, 3 trung chuyển, 3 đính kèm, 5 khoản thu khác): hiện các dòng đã có dữ liệu cộng một dòng trống, có nút "Thêm dòng". 50 số container: dạng lưới.
- **Theo tình huống:**
  - ô áp dụng ghi "Có vì: …";
  - ô không áp dụng mặc định bị ẩn; công tắc **"Hiện cả chỉ tiêu không áp dụng"** cho hiện mờ, ghi "Không áp dụng vì: …";
  - điều kiện dùng đúng các luật đã có (`mapping/conditions.ts`), không viết lại.
- **Hải quan trả về:** chỉ đọc, nền `info-subtle`, biểu tượng con dấu.
- **Panel dòng hàng:** Dialog dạng panel bên phải (toàn màn hình trên điện thoại), gồm phần người khai nhập (sửa được) và khối "Hải quan tính cho dòng này" (chỉ đọc).

## 4. Tổ chức code

```
packages/contracts/src/declaration-layout/
  types.ts        // LayoutTab → LayoutSection → LayoutBlock → LayoutField / LayoutGroup (ô con, nhóm lặp)
  ida.ts, eda.ts  // cấu hình bố cục từng mẫu (phần giống nhau dùng chung trong shared.ts)
  conditions.ts   // điều kiện "theo tình huống" (mã loại hình, mã phương thức vận chuyển, điều kiện giá) – MỘT nguồn:
                  // core/declaration/domain/mapping/conditions.ts chuyển sang dùng các hằng/hàm ở đây, không giữ bản riêng
  index.ts
apps/web/src/app/(app)/ban-mau/to-khai/page.tsx      // mỏng: đọc searchParams, render <DeclarationFormPrototype/>
apps/web/src/features/declaration-form/
  declaration-form.tsx   // khung: đầu trang, 3 tab, mục lục
  section.tsx, field.tsx, field-group.tsx, items-table.tsx, item-panel.tsx, customs-returned.tsx, operations.tsx
  form-state.ts          // logic thuần: đếm đã nhập/tổng, áp dụng/không áp dụng, còn thiếu
  fixtures/ida-a44.ts, fixtures/eda-b13.ts   // dữ liệu giả theo ảnh mẫu, 3 giai đoạn
```

- **Khóa của ô** = tên trường VNACCS (`TK_IMC`, `VD_BL2`, `HAG_TX3`…). Ô không có trong đặc tả VNACCS (ngày vận đơn, hợp đồng nội bộ, mã hàng) dùng khóa riêng có tiền tố `APP_`.
- **Thông tin lấy từ catalog, không khai báo lại:**
  - vai trò, hướng dẫn và độ dài tối đa: catalog Phụ lục II, tra theo tên trường VNACCS (`fptField`) hoặc số chỉ tiêu;
  - nguồn của ô (người khai / Hải quan): theo đặc tả VNACCS (`VN_IDA_THUE`, `_CTHQ`, `_TRANGTHAI` là chỉ nhận về) và các trường đầu ra ghi trong đặc tả.
- **Giao diện:** chỉ ghép từ `@kb/ui` (Tabs, FormSection, Field, Input, Textarea, Select/Combobox, Switch, SegmentedControl, DataTable, Dialog panel, Badge, Alert). Thiếu thì thêm vào `@kb/ui` theo skill `adding-ui-component`, không vá trong app.
- **Trạng thái:** tab, nhóm, loại, giai đoạn lưu trên URL; giá trị đang sửa giữ trong `useState` (không lưu).
- Màn Review và luồng hồ sơ hiện có **không thay đổi**.

## 5. Kiểm thử

- **Test cấu hình (`@kb/contracts`):**
  - mọi chỉ tiêu 1.1–1.96, 2.1–2.80 có ít nhất một ô, trừ 1.46;
  - không tên trường VNACCS nào xuất hiện hai lần trong cùng mẫu;
  - mọi khóa không có tiền tố `APP_` phải có trong đặc tả VNACCS IDA/EDA (`VN_*_FIELDS`);
  - ô Hải quan trả về chỉ thuộc tab 2.
- **Test logic (`form-state.ts`):** bộ đếm đã nhập/tổng; ẩn/hiện ô theo tình huống (G11–G14, G21–G24, G51, G61, đường biển/sông, container, điều kiện giá); ô bắt buộc còn trống.
- **Test component:** a11y (axe) cho ô, nhóm ô và panel dòng hàng.
- `pnpm typecheck && pnpm lint && pnpm test` xanh.
- **Trình duyệt:** bản build, cả 2 bộ dữ liệu × 3 giai đoạn, sáng/tối, 1366px/390px. Đo tràn ngang, chụp từng tab, đối chiếu từng ô với ảnh mẫu.

## 6. Rủi ro và quyết định để sau

- Một số ô trong ảnh mẫu là tính năng riêng của phần mềm đó, không có trong Phụ lục II hay VNACCS: mã hàng, ngày vận đơn, hợp đồng quản lý nội bộ. Bản mẫu vẫn giữ, gắn tiền tố `APP_`; khi làm thật mới quyết định có lưu hay không.
- Cấu hình bố cục được dựng để dùng lại khi làm thật. Việc lưu hơn 200 ô và dựng dữ liệu gửi FPT từ chúng là một thiết kế riêng, chỉ bắt đầu sau khi bản mẫu được duyệt.
