# Rà soát chỉ tiêu tờ khai nhập (IDA) / xuất (EDA) so với giao diện

Ngày rà soát: 2026-10-17. Phạm vi: Mẫu 01 (tờ khai nhập khẩu), Mẫu 02 (tờ khai xuất khẩu), phần phản hồi của Hải quan, và các nghiệp vụ đi kèm (HYS, danh sách container, AMA, định danh hàng hóa, tách vận đơn, bổ sung chứng từ).

## 1. Nguồn tài liệu và thứ tự áp dụng

| Tài liệu (`tailieuchitieukhaibao/`) | Vai trò |
|---|---|
| `Phu luc 2 - Chi tieu thong tin khai hai quan_TT39.doc` | **Danh mục gốc**: Phụ lục II TT38/2015 đã thay bằng TT39/2018. Mẫu 01 có 96 chỉ tiêu (1.1–1.96), Mẫu 02 có 80 chỉ tiêu (2.1–2.80). |
| `121_2025_PhuLucI_SuaDoi_ChiTieuKhaiBao_PL2.doc` + `121_2025_TT-BTC_...docx` | **Sửa đổi đang hiệu lực** (TT121/2025). Mẫu 01 sửa 1.12, 1.13, 1.19, 1.20, 1.24, 1.38, 1.44, 1.50, 1.68, 1.69, 1.74, 1.78, 1.80. Mẫu 02 sửa 2.11, 2.12, 2.18, 2.19, 2.33, 2.57, 2.58, 2.65, 2.67, 2.69. |
| `Phu luc 2 ..._TT38.doc` | Bản gốc TT38, đã bị TT39 thay. Chỉ dùng để tham khảo. |
| `2061_TCHQ-GSQL_438964.docx` | Hàng chương 84/85: ô 1 của chỉ tiêu 1.37 bắt buộc là `MO` (hàng mới) hoặc `CU` (hàng đã qua sử dụng). Khai sai thì hệ thống từ chối. |
| `VNACCS_IDA v1.2.xlsx`, `VNACCS_EDA v1.2.xlsx` | Đặc tả kỹ thuật FPT.VNACCS: tên trường, độ dài, cột Required, và **đối tượng nào được gửi đi, đối tượng nào chỉ nhận về**. |
| `VNACCS_AMA v1.3`, `VNACCS_HYS v1.2`, `KHAI BAO DANH SACH CONTAINER v1.1`, `KHAI BAO LAY MA DINH DANH v1.1`, `TACH VAN DON`, `BO SUNG CHUNG TU v1.4` | Đặc tả các nghiệp vụ đi kèm tờ khai. |

Code đã có catalog đầy đủ 96 + 80 chỉ tiêu (`packages/contracts/src/declaration/catalog-ida*.ts`, `catalog-eda.ts`), kèm số chỉ tiêu, tên trường FPT và hướng dẫn khai theo TT121. **Vấn đề không nằm ở catalog. Vấn đề là màn hình chỉ hiển thị một phần nhỏ của catalog, và trộn lẫn chỉ tiêu người khai nhập với chỉ tiêu do hệ thống tính hoặc Hải quan trả về.**

## 2. Năm loại chỉ tiêu cần phân biệt trên giao diện

| Ký hiệu | Loại | Ý nghĩa | Cách nhận biết trong văn bản |
|---|---|---|---|
| **K** | Người khai bắt buộc nhập | Không có giá trị thì VNACCS từ chối | VNACCS Required = X, không có điều kiện đi kèm |
| **ĐK** | Bắt buộc có điều kiện | Chỉ phải nhập khi rơi vào tình huống cụ thể (theo loại hình, phương thức vận chuyển, tình huống thuế…) | "Chỉ nhập trong trường hợp…", "Bắt buộc nếu đã nhập…" |
| **HT** | Hệ thống hỗ trợ | Người khai có thể nhập. Bỏ trống thì VNACCS tự xác định hoặc tự hiện ra, người khai chỉ sửa khi hệ thống ra sai | "Trường hợp không nhập, hệ thống sẽ tự động…", "hệ thống tự động xuất ra" |
| **HQ** | Hải quan trả về | Người khai không nhập. Giá trị đến từ phản hồi IDA/IDC/EDA/EDC | "Không phải nhập liệu", "Phần dành cho công chức hải quan", các đối tượng VNACCS ghi "Gửi đi: Không" |
| **—** | Chưa sử dụng | Văn bản ghi "không nhập cho đến khi có hướng dẫn mới" | 1.46 |

Theo sheet `GENERAL INFORMATION` của VNACCS: `VN_IDA`, `VN_IDA_HANG`, `VN_IDA_VANDON`, `VN_IDA_KTG` vừa gửi đi vừa nhận về. **`VN_IDA_THUE`, `VN_IDA_CTHQ`, `VN_IDA_TRANGTHAI` chỉ nhận về.** Với EDA: `VN_EDA`, `VN_EDA_HANG`, `VN_EDA_CON` gửi đi, còn `VN_EDA_CTHQ`, `VN_EDA_TRANGTHAI` chỉ nhận về.

## 3. Mẫu 01 – Tờ khai nhập khẩu (IDA): đối chiếu từng chỉ tiêu

Cột "App":
- ✅ Có hiển thị.
- 📤 Có gửi FPT nhưng không hiển thị, hoặc hiển thị chưa đúng.
- ❌ Chưa có.
- ⚠️ Có nhưng sai nghiệp vụ.

### 3.1 Thông tin chung (1.1–1.11)

| STT | Chỉ tiêu | Loại | Khi nào cần | App |
|---|---|---|---|---|
| 1.1 | Số tờ khai | **HQ** | Hải quan cấp sau IDA | ✅ nhưng **đặt sai chỗ**: đang là ô "Chưa cấp…" trong nhóm Thông tin chung |
| 1.2 | Số tờ khai đầu tiên / số nhánh / tổng số tờ khai | ĐK | Lô hàng > 50 dòng, hoặc phải tách tờ khai | ❌ Luật `max-50-lines` chặn được nhưng app chưa tự tách tờ khai |
| 1.3 | Số tờ khai TN-TX tương ứng | ĐK | Tái nhập hàng tạm xuất, chuyển tiêu thụ nội địa hàng tạm nhập | ❌ |
| 1.4 | Mã loại hình | K | Luôn luôn | ✅ (khóa, sửa ở hồ sơ) |
| 1.5 | Mã phân loại hàng hóa | ĐK | Hàng quà biếu, an ninh quốc phòng, cứu trợ, viện trợ, chuyển phát nhanh… | ❌ |
| 1.6 | Mã phương thức vận chuyển | K | Luôn luôn | ✅ |
| 1.7 | Phân loại cá nhân/tổ chức | K | Luôn luôn | ✅ |
| 1.8 | Cơ quan Hải quan | HT | Bỏ trống thì hệ thống xác định theo kho | ✅ |
| 1.9 | Mã bộ phận xử lý (đội thủ tục) | HT | Bỏ trống thì hệ thống xác định theo HS | ⚠️ 📤 Gửi cứng `TK_CHB = "00"`, không hiển thị |
| 1.10 | Thời hạn tái xuất | ĐK | Loại hình tạm nhập | ❌ |
| 1.11 | Ngày khai báo dự kiến | HT | Bỏ trống thì hệ thống lấy ngày thực hiện IDC | ✅ |

### 3.2 Các bên (1.12–1.25)

| STT | Chỉ tiêu | Loại | Khi nào cần | App |
|---|---|---|---|---|
| 1.12 | Mã người nhập khẩu | K (HT tự hiện nếu người nhập khẩu tự khai IDA) | Luôn luôn. TT121: nhập khẩu tại chỗ thì khai MST người được chỉ định nhận hàng | ✅ (Tài khoản) |
| 1.13 | Tên người nhập khẩu | K (HT) | Như trên | ✅ |
| 1.14 | Mã bưu chính | Tùy chọn | — | ⚠️ 📤 **Gửi `"000000"` khi không có dữ liệu**, trái quy tắc "thiếu thì để trống" |
| 1.15 | Địa chỉ người nhập khẩu | HT | Chỉ nhập khi hệ thống hiện sai | ✅ |
| 1.16 | Điện thoại | HT | — | ✅ |
| 1.17–1.18 | Mã/tên người ủy thác nhập khẩu | ĐK | Nhập khẩu ủy thác | ❌ |
| 1.19 | Mã người xuất khẩu | Tùy chọn / ĐK | Gửi kho ngoại quan. TT121: nhập khẩu tại chỗ bắt buộc MST người giao hàng | ❌ |
| 1.20 | Tên người xuất khẩu | K | Theo hợp đồng. Gia công thì ghi bên đặt gia công | ✅ |
| 1.21 | Mã bưu chính người xuất khẩu | Tùy chọn | — | ❌ (chấp nhận được) |
| 1.22 | Địa chỉ người xuất khẩu (4 ô × 35 ký tự) | K | — | ✅ (app tự tách 4 ô) |
| 1.23 | Mã nước | K | — | ✅ |
| 1.24 | Tên người ủy thác xuất khẩu | ĐK | Mua qua bên thứ ba theo chỉ định, nhập khẩu tại chỗ (TT121) | ❌ |
| 1.25 | Mã đại lý hải quan | HT / ĐK | Người khai IDA khác người khai IDC | ❌ Cần có cho khách hàng là đại lý |

### 3.3 Vận đơn và vận chuyển (1.26–1.36, 1.64–1.67)

| STT | Chỉ tiêu | Loại | Khi nào cần | App |
|---|---|---|---|---|
| 1.26 | Số vận đơn (tối đa 5) | K | Luôn luôn. Vận đơn tách thì khai số nhánh | ✅ (chỉ 1 số) |
| 1.27 | Số lượng kiện + mã loại kiện | K | — | ✅ |
| 1.28 | Tổng trọng lượng + đơn vị | K | Trừ khi PTVC = 9 | ✅ |
| 1.29 | Mã kho chờ thông quan | K | — | ✅ |
| 1.30 | Ký hiệu và số hiệu | Tùy chọn | Thường dùng để ghi tiếp khi phần ghi chú bị tràn | ❌ |
| 1.31 | Phương tiện: hô hiệu + tên | K (tên) / ĐK (hô hiệu khi đi đường biển/sông) | — | ✅ tên · ❌ hô hiệu (call sign) |
| 1.32 | Ngày hàng đến | K | — | ✅ |
| 1.33 | Địa điểm dỡ hàng | K (trừ PTVC 9) | — | ✅ |
| 1.34 | Địa điểm xếp hàng | K | — | ✅ |
| 1.35 | Số lượng container | ĐK / HT | Đường biển, hàng container | 📤 Gửi `VD_COC` nhưng không hiển thị |
| 1.36 | Mã kết quả kiểm tra nội dung | ĐK | Đã xem hàng trước khi khai | ❌ |
| 1.64 | Ngày được phép nhập kho đầu tiên | ĐK | Kho ngoại quan, loại hình A41 | ❌ |
| 1.65–1.67 | Vận chuyển kết hợp: ngày khởi hành, tối đa 3 điểm trung chuyển, điểm đích | ĐK | Khai vận chuyển kết hợp (bảo thuế) | ❌ |

### 3.4 Giấy phép, hóa đơn, trị giá (1.37–1.51)

| STT | Chỉ tiêu | Loại | Khi nào cần | App |
|---|---|---|---|---|
| 1.37 | Mã văn bản pháp quy khác (tối đa 5) | ĐK | Hàng quản lý chuyên ngành. **Chương 84/85: ô 1 bắt buộc MO/CU** (CV 2061) | ✅ (có chặn MO/CU) |
| 1.38 | Giấy phép nhập khẩu (5 cặp mã + số) | ĐK | Giấy phép/kết quả kiểm tra chuyên ngành, danh mục miễn thuế/trừ lùi, xác định trước, **số tiếp nhận hợp đồng gia công**; TT121 thêm `QPGP`, `MTTB` | ❌ **Thiếu quan trọng** |
| 1.39 | Phân loại hình thức hóa đơn | K | — | ✅ |
| 1.40 | Số tiếp nhận hóa đơn điện tử | ĐK | 1.39 = D | ❌ |
| 1.41 | Số hóa đơn | ĐK | Có hóa đơn | ✅ |
| 1.42 | Ngày phát hành | K | — | ✅ |
| 1.43 | Phương thức thanh toán | K | — | ✅ |
| 1.44 | Tổng trị giá hóa đơn: 4 ô (phân loại giá · điều kiện giá · mã tiền · tổng) | K | TT121 thêm DPU | ✅ (4 ô hiện riêng) |
| 1.45 | Mã phân loại khai trị giá | K | — | ✅ |
| 1.46 | Số tiếp nhận tờ khai trị giá tổng hợp | — | Chưa sử dụng | ❌ (đúng, không cần) |
| 1.47 | Phí vận chuyển (mã A–F · tiền tệ · số tiền) | ĐK | Điều kiện giá nhóm E/F, hoặc cước vượt | ✅ (chưa hiện mã A–F) |
| 1.48 | Phí bảo hiểm (mã A/D · tiền tệ · số tiền) | ĐK | Không nhập được với CIF/CIP… | ✅ (chưa hiện mã A/D) |
| 1.49 | Khoản điều chỉnh (tối đa 5 × [mã · AD/SB · tiền tệ · trị giá · hệ số]) | ĐK | Hoa hồng, phí bản quyền, khoản giảm giá… | ✅ nhưng gộp thành **một ô "Khoản điều chỉnh khác"**, không hiện đủ 5 dòng có mã |
| 1.50 | Chi tiết khai trị giá (≤ 280 ký tự) | ĐK (thực tế gần như luôn có) | Ngày vận đơn `DDMMYYYY#&`, số hợp đồng, giá tạm tính, DPU, hàng FOC, tham vấn (TT121) | ❌ **Không gửi `KTG_VLD`, không hiển thị** |
| 1.51 | Tổng hệ số phân bổ trị giá | HT / ĐK | Bắt buộc khi 1 hóa đơn khai nhiều tờ khai | ❌ |

### 3.5 Nộp thuế, hạn mức, bảo lãnh (1.52–1.62)

| STT | Chỉ tiêu | Loại | Khi nào cần | App |
|---|---|---|---|---|
| 1.52 | Người nộp thuế | K | — | ✅ |
| 1.53 | Mã lý do đề nghị giải phóng hàng (BP) | ĐK | Giải phóng hàng trên cơ sở bảo lãnh | ❌ |
| 1.54–1.57 | Ngân hàng trả thuế thay, năm, ký hiệu, số hạn mức | ĐK (khai cả nhóm) | Dùng hạn mức ngân hàng | ❌ |
| 1.58 | Mã xác định thời hạn nộp thuế (A/B/C/D) | ĐK (thực tế thường khai) | Bảo lãnh, ân hạn, nộp ngay | ❌ **Nên có** |
| 1.59–1.62 | Ngân hàng bảo lãnh, năm, ký hiệu, số | ĐK (khai cả nhóm) | Bảo lãnh riêng/chung | ❌ |

### 3.6 Đính kèm, ghi chú, chỉ thị Hải quan (1.63, 1.68–1.73)

| STT | Chỉ tiêu | Loại | Khi nào cần | App |
|---|---|---|---|---|
| 1.63 | Số đính kèm khai báo điện tử (tối đa 3: mã phân loại + số HYS) | ĐK | Đã khai HYS trước IDA (bảng kê hóa đơn, tờ khai trị giá A01…) | ❌ App chỉ có HYS **sau** khi có số tờ khai |
| 1.68 | Phần ghi chú (≤ 100 ký tự) | Tùy chọn / ĐK | C/O kèm ngày cấp, #&số tờ khai chuyển tiêu thụ nội địa… (TT121) | ✅ |
| 1.69 | Số quản lý nội bộ doanh nghiệp | Tùy chọn / ĐK | TT121 quy định cú pháp `#&NKTC#&…`, `#&GCPTQ`, `#&1…#&9` cho một số tình huống | ⚠️ Luôn điền mã hồ sơ, sẽ **đè lên cú pháp bắt buộc** khi rơi vào các tình huống đó |
| 1.70–1.73 | Chỉ thị của Hải quan (phân loại, ngày, tên, nội dung; tối đa 10 lần) | **HQ** | Sau khi công chức ra chỉ thị | ❌ `GatewayStatus.directives` đã có kiểu dữ liệu nhưng chưa hiện lên màn hình |

### 3.7 Chi tiết dòng hàng (1.74–1.96)

Tab "Hàng hóa" hiện có các cột: STT, mô tả + xuất xứ, mã HS, lượng + đơn vị, đơn giá, trị giá, trị giá tính thuế (VND, do app ước tính), thuế nhập khẩu, VAT.

| STT | Chỉ tiêu | Loại | Khi nào cần | App |
|---|---|---|---|---|
| 1.74 | Mã số hàng hóa (HS 8 số) | K | — | ✅ |
| 1.75 | Mã quản lý riêng | ĐK | Máy móc đồng bộ chương 84/85/90, danh mục trừ lùi | ❌ |
| 1.76 | Thuế suất | HT | VNACCS tự xác định theo HS + biểu thuế | ✅ (đang là số app ước tính, chưa ghi rõ) |
| 1.77 | Mức thuế tuyệt đối | HT / ĐK | Hàng chịu thuế tuyệt đối/hỗn hợp | ❌ |
| 1.78 | Mô tả hàng hóa | K | TT121 yêu cầu thêm thành phần, hàm lượng… | ✅ |
| 1.79 | Mã nước xuất xứ | K | — | ✅ |
| 1.80 | **Mã biểu thuế nhập khẩu** | K | B01 MFN, các biểu FTA… | ⚠️ 📤 **Gửi `HAG_ORS` nhưng không hiển thị**, nên người duyệt không thấy đang áp biểu thuế nào |
| 1.81 | Mã ngoài hạn ngạch | ĐK | Áp thuế suất ngoài hạn ngạch | ❌ |
| 1.82 | Mã áp dụng mức thuế tuyệt đối | ĐK | — | ❌ |
| 1.83 | Số lượng (1) + ĐVT | K | — | ✅ |
| 1.84 | **Số lượng (2) + ĐVT** (theo đơn vị tính của biểu thuế) | K (VNACCS ghi X) | — | ⚠️ 📤 **Đang chép nguyên số lượng (1) sang**. Sai khi đơn vị tính của biểu thuế khác (ví dụ khai PCE nhưng biểu thuế tính KGM) |
| 1.85 | Trị giá hóa đơn | K | — | ✅ |
| 1.86 | Đơn giá + mã tiền + đơn vị | K | — | ✅ (mã tiền, đơn vị chưa hiện) |
| 1.87 | Trị giá tính thuế | HT / ĐK (khi phân bổ thủ công) | — | ✅ đang là số app ước tính, chưa ghi rõ là ước tính |
| 1.88 | Số mục khoản điều chỉnh | ĐK | Khoản điều chỉnh chỉ áp cho một số dòng | ❌ |
| 1.89 | STT dòng trên tờ khai TN-TX | ĐK | Đi kèm 1.3 | ❌ |
| 1.90–1.91 | Số danh mục miễn thuế, số dòng tương ứng | ĐK | Hàng miễn thuế theo danh mục | ❌ |
| 1.92–1.93 | Mã miễn/giảm/không chịu thuế nhập khẩu, số tiền giảm | ĐK | — | ❌ |
| 1.94 | Mã áp dụng thuế suất thu khác (5 khoản: chống bán phá giá, chống phân biệt đối xử, TTĐB, BVMT, **VAT bắt buộc**) | K (VAT) / ĐK (các khoản còn lại) | — | 📤 Gửi mã VAT (`HAG_TX5`, ghi chú "chưa đối chiếu") nhưng chỉ hiện %; chưa có TTĐB/BVMT/chống bán phá giá |
| 1.95–1.96 | Mã miễn/giảm thu khác, số tiền giảm | ĐK | — | ❌ |

## 4. Mẫu 02 – Tờ khai xuất khẩu (EDA): đối chiếu

Chỉ ghi các điểm **khác** Mẫu 01. Các chỉ tiêu có cùng bản chất (loại hình, PTVC, cơ quan Hải quan, người xuất khẩu lấy từ Tài khoản, hóa đơn, HS, mô tả, số lượng, trị giá…) có trạng thái giống mục 3.

| STT | Chỉ tiêu | Loại | Khi nào cần | App |
|---|---|---|---|---|
| 2.1 | Số tờ khai | **HQ** | — | ✅ (đặt sai chỗ, giống 1.1) |
| 2.2, 2.3, 2.5, 2.7 | Tách tờ khai, tờ khai TN-TX, phân loại hàng, thời hạn tái nhập | ĐK | > 50 dòng, tạm xuất/tái xuất, hàng đặc thù | ❌ |
| 2.9 | Đội thủ tục | HT | — | ⚠️ gửi cứng `"00"` |
| 2.16–2.18 | Người ủy thác xuất khẩu; mã người nhập khẩu (TT121: xuất khẩu tại chỗ bắt buộc MST người nhận) | ĐK | — | ❌ |
| 2.23 | Mã đại lý hải quan | HT / ĐK | — | ❌ |
| 2.24 | Số vận đơn = **số quản lý hàng hóa** (đăng ký trước theo Mẫu 14) | ĐK | — | ✅ |
| 2.28 | Địa điểm nhận hàng cuối cùng | K | — | ✅ |
| 2.30 | Phương tiện vận chuyển dự kiến (hô hiệu + tên) | ĐK | — | ✅ tên · ❌ hô hiệu |
| 2.33 | Giấy phép xuất khẩu (5 cặp) | ĐK | Hàng phải có giấy phép, kết quả kiểm tra chuyên ngành, xác định trước | ❌ |
| 2.39 | Trị giá hóa đơn (điều kiện giá · mã tiền · trị giá · phân loại giá) | K | — | ✅ |
| 2.40 | **Trị giá tính thuế (tổng) + mã tiền** | ĐK | **Bắt buộc khi điều kiện giá khác FOB/DAP/DAF** (ví dụ CIF, CFR) hoặc không có hóa đơn | ❌ **Thiếu quan trọng**: thuế xuất khẩu tính trên trị giá FOB |
| 2.41 | Phân loại không cần quy đổi VND | Tùy chọn | — | ❌ |
| 2.42 | Tổng hệ số phân bổ | ĐK | — | ❌ |
| 2.43 | Người nộp thuế | ĐK | — | ❌ EDA không gửi `TK_TPM` |
| 2.44–2.52 | Hạn mức, thời hạn nộp thuế, bảo lãnh | ĐK | — | ❌ |
| 2.53–2.56 | Đính kèm HYS, vận chuyển kết hợp | ĐK | — | ❌ |
| 2.59 | Địa điểm đóng hàng lên xe (vanning), tối đa 5 mã + tên + địa chỉ | ĐK | Hàng container đóng ngoài khu vực giám sát | ❌ |
| 2.60 | Số container (tối đa 50) | ĐK | Đường biển, hàng container | 📤 Gửi `CON_C01..50` nhưng không hiển thị |
| 2.61–2.64 | Chỉ thị của Hải quan | **HQ** | — | ❌ |
| 2.67 | Thuế suất xuất khẩu | HT | — | ✅ nhưng **cột ghi "Thuế NK"** |
| 2.69 | Mô tả hàng hóa | K | — | ✅ (app tự nối thêm xuất xứ) |
| 2.73 | Số lượng (2) | ĐK | — | ⚠️ chép nguyên số lượng (1) |
| 2.70–2.71, 2.77–2.79 | Miễn/giảm thuế xuất khẩu, dòng TN-TX, danh mục miễn thuế | ĐK | — | ❌ |
| 2.80 | **Mã văn bản pháp luật khác (khai theo dòng hàng, `HAG_OL1..5`)** | ĐK | Hàng xuất khẩu thuộc quản lý chuyên ngành | ❌ **EDA không gửi**. Mẫu 01 khai ở cấp tờ khai, còn Mẫu 02 khai **ở từng dòng hàng** |

**Lỗi hiển thị riêng của EDA:** tab Hàng hóa và tab Thuế đang ghi cứng tiêu đề "Thuế NK", "VAT", "Thuế nhập khẩu", "Thuế GTGT" (`review-step.tsx` `ItemsTab`/`TaxTab` không nhận `kind`). Tờ khai xuất khẩu phải hiện **Thuế xuất khẩu** và không có VAT.

## 5. Chỉ tiêu do Hải quan trả về

Phần này hiện **gần như chưa có**. Thẻ "Kết quả từ Hải quan" ở bước 6 mới hiện 5 thông tin: số tờ khai, luồng, trạng thái, một con số "thuế dự kiến", thời điểm cập nhật.

| Nhóm | Trường VNACCS (IDA · EDA) | Ý nghĩa với người dùng | App |
|---|---|---|---|
| Định danh tờ khai | `TK_ICN` · `TK_ECN`; `TK_BNO`/`TK_DNO` (nhánh/tổng số tờ khai) | Số tờ khai 12 ký tự. Ký tự thứ 12 là số lần khai bổ sung | ✅ số · ❌ nhánh |
| Đăng ký | `TK_A09`/`TK_AD11` · `TK_K10`/`TK_RT1`; ngày giờ thay đổi `TK_AD21`/`TK_AD31` | Ngày giờ đăng ký: **mốc tính tỷ giá và thuế suất** | ❌ |
| Phân luồng | `TK_A06` · `TK_K07` (mã phân loại kiểm tra), `TK_LUONG` | Xanh / vàng / đỏ | ✅ luồng · ❌ mã phân loại kiểm tra |
| Cơ quan xử lý | `TK_A07` · `TK_K08` (tên Chi cục), đội thủ tục thực tế | Biết Chi cục/đội nào xử lý | ❌ |
| Đại diện | `TK_A00` · `TK_K01` (HS đại diện), `TK_B12`/`TK_B13` · `TK_K69`/`TK_K70` (số trang, số dòng) | Đối chiếu khi in tờ khai | ❌ |
| Tạm nhập – tái xuất | `TK_RED`/`TK_AAA` · `TK_RID` | Thời hạn tái xuất/tái nhập, cờ đã quá hạn | ❌ |
| **Thuế chính thức** | `VN_IDA_THUE`: tối đa 6 sắc thuế (mã, tên, tổng tiền, số dòng), `THUE_B02` tổng phải nộp, `THUE_B03` số tiền bảo lãnh. EDA: `TK_ETA`, `TK_TCO` (lệ phí), `TK_SAM` | **Số thuế phải nộp theo Hải quan**, khác với số app ước tính | ⚠️ chỉ có một con số tổng |
| **Tỷ giá Hải quan** | `THUE_KJ/KK1..3` · `TK_RC/RD1..2` | Tỷ giá áp tại ngày đăng ký | ❌ (app hiện tỷ giá tự tra ở tab Thuế) |
| Trị giá theo dòng | `HAG_B36/B51` (trị giá tính thuế S/M), `HAG_B43` thuế suất, `HAG_B47` tiền thuế, `HAG_KZ1..5` thu khác, `HAG_B59`/`HAG_LC*` điều khoản miễn giảm | Hải quan tính lại từng dòng | ❌ |
| Ân hạn thuế | `TK_KN/KO/KP1..6`, `TK_ADY/ADZ` | Sắc thuế được ân hạn, hạn nộp | ❌ |
| Chỉ thị Hải quan | `VN_IDA_CTHQ` / `VN_EDA_CTHQ` (≤ 10 lần: ngày, tên, nội dung) | **Hải quan yêu cầu sửa/bổ sung**, người khai phải đọc và làm theo | ❌ |
| Thông quan | `TK_C21`/`TK_AD4` · `TK_K86`/`TK_AD5` (ngày giờ cấp phép), `TK_C22` (hoàn thành kiểm tra), `TK_C20` · `TK_K87` (trưởng đơn vị), `TK_C24..25` (BP), `TK_C23` (thẩm tra sau thông quan) | Mốc thông quan, giải phóng hàng | ⚠️ chỉ có trạng thái |
| Hủy / chuyển thủ công | `TK_B31`/`AD8`, `TK_B32`/`AD9` | — | ❌ |
| AMA | `TK_ADD` số thông báo, `TK_A02` ngày đăng ký khai bổ sung, `TK_ADE` cờ quá 60 ngày, `VN_AMA_TRANGTHAI` | Kết quả khai bổ sung | Chưa rõ trên giao diện |
| HYS / Container / Định danh / Tách VĐ / Bổ sung chứng từ | `TK_JNO` số tiếp nhận HYS; `SO_TN`/`NGAY_TN`/`TRANG_THAI`/`KET_QUA`; định danh: `SO_DD`, `NGAY_DD`, **`CODE_CONTENT` (QR base64)** | Số tiếp nhận, kết quả, mã QR định danh | Có HYS và CONT. **Định danh hàng hóa, tách vận đơn (Mẫu 12), bổ sung chứng từ V5 chưa có nghiệp vụ** |

Tất cả phản hồi lỗi (`errorList`) đều có `indexCode`/`nameCode` (chỉ tiêu bị lỗi) và `rowPosition` (dòng hàng). Nên dùng hai trường này để **gắn lỗi ngay vào ô chỉ tiêu tương ứng** trên tờ khai, không chỉ ghi vào nhật ký thông điệp.

## 6. Tổng hợp thừa / thiếu / sai

### Đang thừa hoặc đặt sai chỗ
1. **Số tờ khai (1.1/2.1)** đang là một ô trong nhóm "Thông tin chung" với giá trị "Chưa cấp…". Đây là chỉ tiêu do Hải quan trả về, nên chuyển sang khối Kết quả Hải quan hoặc header hồ sơ.
2. **Tỷ giá tính thuế** (`TY_GIA`) và **Chứng từ chứng nhận xuất xứ** (`SO_CO`) không phải chỉ tiêu của Mẫu 01 (`no: null`) nhưng lại nằm lẫn trong nhóm "Hóa đơn & trị giá". Tỷ giá là số tham khảo, bị thay bằng tỷ giá Hải quan sau khi đăng ký. C/O thực chất được ghi vào 1.68. Nên tách ra khối "Thông tin tham khảo / tính toán".
3. Nhãn ô đang hiện mã kỹ thuật (`· TONG_TG`, `· NNK_MST`). Người khai quen số chỉ tiêu, nên hiện **"1.44 · Tổng trị giá hóa đơn"** và giấu mnemonic (chỉ để trong tooltip).
4. Trị giá tính thuế và thuế ở tab Hàng/Thuế là **số app ước tính** nhưng hiển thị như số chính thức. Cần nhãn "Ước tính" và hiện song song với số Hải quan khi đã có.

### Thiếu, ưu tiên cao (ảnh hưởng đúng/sai tờ khai)
- 1.50 Chi tiết khai trị giá (IDA, gần như lô nào cũng cần).
- 1.38 / 2.33 Giấy phép (quản lý chuyên ngành, gia công, miễn thuế, TT121 ANQP).
- 2.40 Trị giá tính thuế tổng của EDA (khi điều kiện giá khác FOB/DAP/DAF).
- 2.80 Mã văn bản pháp luật theo dòng hàng của EDA.
- 1.80 Mã biểu thuế: đã gửi nhưng phải hiển thị và cho người duyệt xác nhận (quyết định thuế suất FTA).
- 1.84 / 2.73 Số lượng (2) theo đơn vị tính biểu thuế: đang chép sai từ số lượng (1).
- 1.94 Các khoản thu khác (TTĐB, BVMT, chống bán phá giá) và mã VAT hiển thị được.
- 1.58 Mã xác định thời hạn nộp thuế; 2.43 Người nộp thuế cho EDA.
- 1.70–1.73 / 2.61–2.64 Chỉ thị Hải quan và **thuế chính thức theo sắc thuế** trong phần phản hồi.
- 1.2 / 2.2 Tách tờ khai khi > 50 dòng: hiện mới chặn, chưa hỗ trợ.

### Thiếu, ưu tiên trung bình (theo tình huống)
1.3/1.10/1.89 (tạm nhập – tái xuất); 1.5; 1.17–1.19, 1.24 (ủy thác, nhập khẩu tại chỗ); 1.25 (đại lý); hô hiệu tàu 1.31/2.30; 1.35/2.60 hiển thị container; 1.36; 1.40; 1.47–1.49 hiện đủ mã phân loại và đủ 5 khoản điều chỉnh; 1.51; 1.53–1.62 (bảo lãnh, hạn mức); 1.63; 1.64–1.67 (kho ngoại quan, vận chuyển kết hợp); 1.75, 1.77, 1.81, 1.82, 1.88, 1.90–1.93, 1.95–1.96; 2.59 vanning.

### Sai nghiệp vụ cần sửa
- ~~`TK_IMY = "000000"` và `TK_CHB = "00"` gửi cứng là sai~~ – **đính chính (đợt 3):** đặc tả `VNACCS_IDA/EDA v1.2` đánh dấu `TK_IMY` và `TK_CHB` là Required (X), và phản hồi thật của FPT trả `tK_CHB: "00"`. Bỏ hai trường này có thể làm FPT từ chối, nên **giữ nguyên**. Cách đúng lâu dài: lưu mã bưu chính của doanh nghiệp ở Tài khoản và gửi giá trị thật thay cho `000000`.
- `HAG_QN2/QT2` chép từ số lượng (1) (`declaration-to-fpt.ts:93-94`).
- 1.69 luôn điền mã hồ sơ, sẽ đè cú pháp TT121 bắt buộc (`#&NKTC#&…`, `#&GCPTQ`, `#&1…#&9`) khi rơi vào các tình huống đó.
- Tiêu đề thuế của EDA ghi "Thuế NK / VAT" (`review-step.tsx` `ItemsTab`, `TaxTab`).
- Catalog đánh dấu 1.15 là "O" nhưng mapping đánh dấu `required: true`. Cần thống nhất (theo TT39, 1.15 là HT).

## 7. Đề xuất tổ chức giao diện

### 7.1 Nguyên tắc: hiện theo giai đoạn của tờ khai

| Giai đoạn | Hiện gì | Không hiện |
|---|---|---|
| **① Dựng nháp / Duyệt** (bước 5) | Chỉ tiêu **K**; chỉ tiêu **ĐK** *đã kích hoạt*; chỉ tiêu **HT** dạng thu gọn ("Để Hải quan tự xác định" + nút "Khai thay") | Chỉ tiêu HQ (chỉ có dòng ghi chú "Số tờ khai, luồng, thuế chính thức sẽ có sau khi khai") |
| **② Đã khai tạm IDA/EDA** | Như ①, cộng thêm khối **"Hải quan phản hồi (khai tạm)"**: số tờ khai, tên Chi cục/đội, thuế theo sắc thuế, tỷ giá HQ, trị giá tính thuế theo dòng. Hiện **chênh lệch so với số ước tính** | Luồng (chưa có) |
| **③ Đã khai chính thức IDC/EDC** | Khóa chỉ tiêu người khai (chỉ xem). Hiện ngày giờ đăng ký, luồng + mã phân loại kiểm tra, **chỉ thị Hải quan** (nổi bật, có số lượng chưa đọc), ân hạn/bảo lãnh | — |
| **④ Thông quan / sau thông quan** | Ngày giờ cấp phép, trưởng đơn vị, kết quả AMA (số thông báo, cờ quá 60 ngày), HYS/container/định danh (số tiếp nhận, QR) | — |

### 7.2 Phân biệt bằng hình thức (dùng token và component của `@kb/ui`)

Mỗi ô chỉ tiêu có **một huy hiệu "vai trò"** tách biệt với huy hiệu **"nguồn"** đang có (Invoice / B/L / Tài khoản…):

| Vai trò | Huy hiệu | Hình thức ô | Hành vi |
|---|---|---|---|
| K (bắt buộc) | "Bắt buộc" | Viền thường; trống thì viền `danger` và ghi "Thiếu – chặn truyền" | Sửa được |
| ĐK (có điều kiện) | "Khi …" (ví dụ "Khi tạm nhập", "Khi 1.39 = D") | Chỉ hiện khi điều kiện đúng; tooltip nêu điều kiện kích hoạt | Sửa được |
| HT (hệ thống hỗ trợ) | "VNACCS tự xác định" | Nền `surface-muted`, giá trị in nghiêng "Để trống", nút "Khai thay" | Mặc định không gửi |
| Ước tính (app tính) | "Ước tính" | Số kèm biểu tượng máy tính; sau phản hồi HQ thì hiện "HQ: …" bên cạnh | Không sửa (đúng `DERIVED_DECLARATION_FIELD_CODES`) |
| HQ (Hải quan trả về) | "Hải quan trả về" + thời điểm nhận | Khối riêng, nền `info-subtle`, biểu tượng con dấu; không có nút Sửa | Chỉ đọc |

Mỗi ô hiện **số chỉ tiêu trước tên** ("1.44 · Tổng trị giá hóa đơn"). Chỉ tiêu nhiều ô con (1.44, 1.47, 1.48, 1.49, 1.38, 1.63, 1.66) hiện thành **một nhóm** có tên các ô con, thay vì 4 ô rời rạc như hiện nay.

### 7.3 Sắp lại nhóm và tab

Bỏ cách chia 4 nhóm hiện tại, chia theo đúng thứ tự Phụ lục II để người khai dễ dò với tờ khai in:

1. **Thông tin chung**: 1.2–1.11 (+ 1.63, 1.68, 1.69)
2. **Các bên**: 1.12–1.25
3. **Vận đơn & vận chuyển**: 1.26–1.36, 1.64–1.67
4. **Giấy phép & văn bản pháp quy**: 1.37, 1.38 (nhóm mới, hiện ra khi hàng thuộc quản lý chuyên ngành)
5. **Hóa đơn & trị giá**: 1.39–1.51 (gồm một bảng 5 dòng "Khoản điều chỉnh")
6. **Nộp thuế / bảo lãnh**: 1.52–1.62 (thu gọn, mặc định chỉ hiện 1.52 và 1.58)
7. **Hàng hóa**: bảng dòng hàng. Thêm cột **Mã biểu thuế**, **Số lượng (2)**, **Mã VAT/thu khác**, miễn/giảm. Bấm vào một dòng thì mở ngăn chi tiết đủ 1.74–1.96
8. **Thông tin tham khảo**: tỷ giá tự tra, C/O, số ước tính
9. **Kết quả Hải quan** (tab chỉ hiện khi đã có phản hồi; có chấm báo khi có chỉ thị mới): định danh, đăng ký, luồng, thuế chính thức theo sắc thuế, tỷ giá HQ, so sánh ước tính với HQ, chỉ thị, thông quan

Với EDA: đổi nhãn theo `kind` (thuế xuất khẩu, không có VAT), thêm cột **Mã VB pháp luật** vào bảng hàng (2.80), thêm **2.40** vào nhóm trị giá và **2.59/2.60** (vanning, danh sách container) vào nhóm vận chuyển.

### 7.4 Bảng điều kiện kích hoạt chỉ tiêu ĐK

Nên đặt thành cấu hình thuần, cạnh catalog (ví dụ thêm thuộc tính `when` vào `DeclarationFieldDef`). Viết như vậy thì test được và dùng chung được cho cả hiển thị lẫn luật chặn:

| Điều kiện | Chỉ tiêu bật lên |
|---|---|
| Loại hình tạm nhập (G1x…) / tái nhập / tái xuất | 1.3, 1.10, 1.89 · 2.3, 2.7, 2.77 |
| Lô > 50 dòng | 1.2 / 2.2 (tách tờ khai) |
| Loại hình gia công / SXXK / chế xuất | 1.38 (số tiếp nhận HĐGC), 1.69 cú pháp `#&GCPTQ`… |
| Nhập/xuất khẩu tại chỗ | 1.19, 1.24, 1.69 `#&NKTC` · 2.18 |
| Có người ủy thác | 1.17–1.18 · 2.16–2.17 |
| PTVC = 2 (container) | 1.35 · 2.59, 2.60 |
| PTVC = 2/3/6 (đường thủy) | hô hiệu 1.31 / 2.30 |
| HS chương 84/85 | 1.37 ô 1 = MO/CU; 1.75 (máy móc đồng bộ) |
| Hàng quản lý chuyên ngành | 1.37, 1.38 · 2.33, 2.80 |
| 1.39 = D | 1.40 · 2.35 |
| Điều kiện giá nhóm E/F (IDA) | 1.47, 1.48 |
| Điều kiện giá khác FOB/DAP/DAF (EDA) | 2.40 |
| Có khoản điều chỉnh | 1.49, 1.88 |
| Một hóa đơn nhiều tờ khai | 1.51 / 2.42 |
| Bảo lãnh / hạn mức | 1.53–1.62 · 2.44–2.52 |
| Kho ngoại quan / A41 | 1.64, 1.68 |
| Vận chuyển kết hợp | 1.65–1.67 · 2.54–2.56 |
| Miễn/giảm thuế, danh mục miễn thuế | 1.90–1.93, 1.95–1.96 · 2.70–2.71, 2.78–2.79 |
| Hàng chịu TTĐB / BVMT / chống bán phá giá | 1.94 (khoản tương ứng) |

## 8. Tiến độ

**Đợt 1 – khung hiển thị (xong, nhánh `feat/to-khai-vai-tro-chi-tieu`):**
- Catalog có thêm `assist` (VNACCS tự xác định) và `unused`. Hàm `declarationFieldRole(kind, no)` trong `@kb/contracts` trả vai trò REQUIRED / CONDITIONAL / OPTIONAL / ASSIST / CUSTOMS / UNUSED / REFERENCE, có test.
- Màn Review (`steps/declaration-groups.ts` + `review-step.tsx`):
  - Ô chỉ tiêu hiện số chỉ tiêu trước tên, có huy hiệu vai trò và chú thích nhãn ở đầu tab.
  - Nhóm theo Phụ lục II; Số tờ khai vào nhóm "Do Hải quan cấp / trả về"; tỷ giá và C/O vào nhóm "Thông tin tham khảo".
  - Trị giá tính thuế và thuế ghi rõ là ước tính.
  - Tờ khai xuất không còn hiện "Thuế NK / VAT"; thay bằng chỉ dẫn xem thuế Hải quan trả về.

**Đợt 2 – Hải quan trả về (xong):**
- `CustomsInfoSchema` (`@kb/contracts`, `SubmissionView.customsInfo`).
- `parseCustomsInfo` / `mergeCustomsInfo` (`integration/domain/customs-info.ts`) đọc VN_IDA/VN_EDA, _HANG, _THUE, _CTHQ, _TRANGTHAI: số tờ khai và tờ khai nhánh, ngày giờ đăng ký, mã phân loại kiểm tra, Chi cục/đội, HS đại diện, số trang/dòng, tỷ giá, tổng trị giá tính thuế, thuế theo sắc thuế, bảo lãnh, trị giá/thuế từng dòng, chỉ thị Hải quan, cấp phép. Có test với phản hồi EDA thật của FPT.
- Gateway FPT trả `info` cho IDA/EDA, IDC/EDC, IID/IEX. Thông tin được gộp dần và lưu ở `customs_results.raw.customsInfo` (không cần migration).
- fpt-mock trả thêm ngày giờ đăng ký, mã phân loại kiểm tra và ngày giờ cấp phép.
- Giao diện: khối "Hải quan trả về" ở bước Khai báo Hải quan và tab cùng tên ở màn Review. Khối này hiện chỉ thị Hải quan nổi bật và so sánh số Hải quan với số ứng dụng ước tính.
- Còn lại: gắn `errorList` (`indexCode`) vào đúng ô chỉ tiêu; đọc các thông điệp VAD8000/VAE8000 (chỉ thị gửi riêng) và ân hạn thuế.

**Đợt 3 – dữ liệu gửi Hải quan và trị giá/thuế (xong):**
- Tờ khai xuất: trị giá tính thuế = giá tại cửa khẩu xuất. Giá CFR/CIF/CPT/CIP/nhóm D thì **trừ** cước và bảo hiểm quốc tế (`planExportAdjustments`); thiếu số cước thì không trừ bừa mà đánh dấu cần kiểm tra. FOB/DAP/DAF không trừ.
- Tờ khai xuất không còn ước tính "thuế" bằng thuế suất nhập khẩu + GTGT (thuế dự kiến = 0, Hải quan tính).
- Chỉ tiêu mới, dựng và gửi FPT:
  - 1.38/2.33 giấy phép → `TK_SS/SN`; loại hình gia công thì nhắc khai số tiếp nhận hợp đồng.
  - 1.50 chi tiết khai trị giá → `KTG_VLD`: ngày vận đơn `DDMMYYYY#&` cộng ghi chú dòng FOC.
  - 2.40 trị giá tính thuế → `TK_FKK/TK_FCD`.
  - 2.43 người nộp thuế → `TK_TPM`; có thể đặt mặc định ở Cài đặt cho cả tờ khai xuất.
  - 2.80 mã văn bản pháp luật theo dòng → `HAG_OL1..5`, cú pháp "mã chung; số dòng: mã riêng".
- Mock web: tờ khai xuất FOB hết cộng cước; có các chỉ tiêu mới (`DB_VERSION` 10).
- **Chưa làm được, thiếu dữ liệu:** số lượng (2) theo đơn vị tính biểu thuế (`HAG_QN2/QT2`) cần bảng đơn vị tính theo mã HS. 1.69 vẫn điền mã hồ sơ: cần biết tình huống tại chỗ / gia công với DNCX để dùng cú pháp TT121.

**Đợt 4 – chỉ tiêu theo tình huống và lỗi Hải quan gắn vào ô (xong):**
- `FieldMapping.when { label, test }` (`mapping/conditions.ts`): chỉ tiêu chỉ có trên tờ khai khi điều kiện đúng. Lý do hiện được lưu ở `condition` và hiển thị dưới ô ("Có trên tờ khai vì: …").
  - Chỉ tiêu không áp dụng thì không gửi Hải quan, không bị chặn phê duyệt, và giá trị người khai đã sửa trước đó bị bỏ khi dựng lại.
  - Đã có: 1.3 / 2.3 số tờ khai TN-TX (G51 / G21–G24); 1.10 / 2.7 thời hạn tái xuất / tái nhập (G11–G14 / G61); 1.31 / 2.30 hô hiệu (đường biển/sông); 1.35 số lượng container, 2.60 số container (mã 2); 2.40 (điều kiện giá khác FOB/DAP/DAF).
  - Dữ liệu gửi FPT tương ứng: `TK_TDN`, `TK_RED`/`TK_RID`, `VD_VSC`/`TK_VSC`, `VD_COC`, `CON_C01..`.
- Lỗi Hải quan:
  - `fieldDefForFptIndex` (`@kb/contracts`) đổi `indexCode` FPT (EPN, IP2, SN3, CMD…) sang số chỉ tiêu.
  - Gateway đọc `rowPosition` thành dòng hàng; outbox lưu `raw.rejection` và xóa khi chính nghiệp vụ đó gửi lại thành công; view trả `rejection`.
  - Màn Review: ô lỗi viền đỏ kèm nội dung và cách khắc phục, khung tổng hợp lỗi ở đầu màn, số lỗi trên tab. Bước Khai báo có nút "Xem lỗi trên tờ khai".
- Còn có thể bổ sung: 1.17–1.19, 1.24 (ủy thác, tại chỗ – cần dữ liệu hồ sơ cho biết), 1.40 (theo 1.39 = D), 1.53–1.62 (bảo lãnh/hạn mức), 1.64–1.67 (kho ngoại quan, vận chuyển kết hợp); lỗi theo dòng hàng gắn vào bảng hàng.

**Bản mẫu tờ khai đầy đủ chỉ tiêu (xong, nhánh `feat/to-khai-day-du-ban-mau`):**
- Trang `/ban-mau/to-khai` (không nằm trong menu): 3 tab theo luồng làm việc (Người khai nhập / Hải quan trả về / Theo dõi & nghiệp vụ). Dữ liệu giả theo ảnh mẫu `CHITIEU_NHAPKHAU`/`CHITIEU_XUATKHAU`, có 3 giai đoạn. Thiết kế: `docs/superpowers/specs/2026-10-17-to-khai-day-du-ban-mau-design.md`.
- Bố cục là dữ liệu trong `@kb/contracts/declaration-layout` (khóa ô = tên trường VNACCS), có test bắt buộc đủ 1.1–1.96 (trừ 1.46) và 2.1–2.80.
- Luật "theo tình huống" giờ là một nguồn chung (`DECLARATION_CONDITIONS`), backend và bản mẫu cùng dùng.
- Cần đối chiếu khi làm thật: catalog EDA ghi 2.79 là `HAG_TXR`, nhưng đặc tả VNACCS_EDA là `HAG_ADE`.

**Bước 5 dạng bản in (xong, nhánh `feat/review-ban-in-to-khai`):** bước 5 hiện tờ khai giống mẫu in VNACCS (`@kb/contracts/print-layout`, `features/declaration-print/`), sửa ô bằng panel, lỗi / còn thiếu / ước tính đánh dấu trên ô, gộp tab "Hải quan trả về"; form cũ còn sau cờ `NEXT_PUBLIC_REVIEW_LEGACY_FORM=1` đến hết thử nghiệm (BACKEND-TODO K9).

**Phát hiện thêm khi làm đợt 1 (để đợt 3 xử lý):**
- Tờ khai xuất đang tính "thuế" bằng thuế suất **nhập khẩu** và VAT (`declaration/domain/tax.ts`). Chưa có thuế suất xuất khẩu.
- Tờ khai xuất điều kiện FOB vẫn cộng cước quốc tế vào trị giá tính thuế (dữ liệu mẫu `dos_020`). Trị giá tính thuế xuất khẩu là giá FOB, không cộng cước.
- Catalog đánh dấu 1.44 / 2.39 là "C" nên 4 ô con của Tổng trị giá hóa đơn hiện nhãn "Theo tình huống". Cần xem lại: chỉ bỏ trống khi không có hóa đơn.

## 9. Thứ tự làm đề xuất

1. **Sửa sai nghiệp vụ trước**: bỏ gửi cứng `TK_IMY`/`TK_CHB`, sửa `HAG_QN2`, sửa nhãn thuế của EDA, xử lý xung đột 1.69 với cú pháp TT121.
2. **Tách vai trò trên giao diện**: huy hiệu K/ĐK/HT/Ước tính/HQ, hiện số chỉ tiêu, chuyển Số tờ khai và Tỷ giá ra khỏi nhóm chỉ tiêu khai.
3. **Tab "Kết quả Hải quan"**: parse `VN_IDA_THUE`, `VN_IDA_CTHQ`, `VN_IDA_TRANGTHAI` (và bản EDA), so sánh ước tính với số HQ, gắn `errorList` vào đúng ô chỉ tiêu.
4. **Bổ sung chỉ tiêu ưu tiên cao**: 1.50, 1.38/2.33, 2.40, 2.80, hiển thị 1.80, 1.94, 1.58.
5. **Cấu hình `when` cho chỉ tiêu ĐK**, rồi thêm dần các chỉ tiêu theo tình huống ở mục 6.
6. Nghiệp vụ còn thiếu: định danh hàng hóa (hiện QR), tách vận đơn (Mẫu 12), bổ sung chứng từ V5.
   - Bản mẫu (2026-10-17): nhóm 3 "Vận đơn & vận chuyển" có nút **Chia tách vận đơn** (chỉ nhập khẩu, TachVanDonReq) và **Khai báo định danh** (V5IdentifierReq) – panel đủ chỉ tiêu theo đặc tả FPT, điền sẵn từ tờ khai, phần kết quả chỉ đọc (`packages/contracts/src/declaration-layout/transport-operations.ts`). Khối Vận đơn thêm lựa chọn khai định danh theo đường biển / hàng không, hàng không → có phát hành HAWB → ô Số HAWB cạnh từng số vận đơn; ngày vận đơn theo từng số. Chưa có: gửi/hỏi kết quả thật, hiện ảnh QR, ghép ngày vận đơn vào 1.50.

Mọi thay đổi chỉ tiêu bắt buộc hoặc trị giá cần người có nghiệp vụ hải quan review (skill `mapping-declaration-fields`, bước 7).
