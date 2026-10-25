# Nguồn dữ liệu nghiệp vụ (master data)

Chỉ mục mọi tài liệu gốc của Hải quan mà hệ thống dựa vào: tài liệu nào, đã thành dữ liệu / quy tắc nào trong code, cập nhật thế nào.
**Không chép nội dung tài liệu vào repo** (repo công khai, file nhị phân làm repo nặng mãi mãi). File gốc lưu ở kho tài liệu chung của nhóm; ở máy dev đặt tại `docs/danhmuc/` và `docs/tailieuchitieukhaibao/` (không đưa vào git).

> Kho tài liệu chung: _chưa có – điền đường dẫn Google Drive / thư mục chia sẻ khi tạo._

## 1. Danh mục mã VNACCS (`docs/danhmuc/`)

Đã dựng thành dữ liệu máy đọc được – dev **dùng `loadCodeList(id)` / `CODE_LIST_META` từ `@kb/contracts`**, không đọc file Excel.
Chi tiết quy tắc chuyển đổi và lưu ý về dữ liệu nguồn: `packages/contracts/src/code-lists/README.md`.

**Khi Hải quan ban hành danh mục mới:**

1. Đặt file mới vào thư mục nguồn (giữ tên gốc), cập nhật kho tài liệu chung.
2. `powershell -File scripts/code-lists/export-csv.ps1 -Source <thư mục nguồn> -Out $env:TEMP\kb-danhmuc-csv` (cần Excel).
3. `node scripts/code-lists/build.mjs --csv $env:TEMP\kb-danhmuc-csv` → `data/*.json` + `manifest.json`.
4. `pnpm code-lists:index` → cập nhật bảng dưới đây.
5. `pnpm --filter @kb/contracts test`, xem diff JSON, commit.

Bảng mã gọn của backend (chuẩn hóa trích xuất, đối chiếu) ở `packages/contracts/src/declaration/code-tables.ts` – chưa dùng danh mục đầy đủ.

<!-- BEGIN danh-muc (sinh bởi scripts/code-lists/build-index.ts – không sửa tay) -->

41 danh mục, dữ liệu ở `packages/contracts/src/code-lists/data/<ID>.json` (mỗi mục `{ code, name, parent?, note?, inactive? }`). "–" = chưa gắn chỉ tiêu tờ khai (giữ để tra cứu).

| ID | Danh mục | File nguồn | Số mã | Chỉ tiêu tờ khai dùng | Ghi chú |
|---|---|---|---:|---|---|
| `A038` | Cơ quan Hải quan | Ma_DVHQ_01.06.2026 ver 16 | 197 | EDA 2.8, IDA 1.8 | thay 1.Bang ma don vi HQ 2025 17032025 |
| `A014` | Bộ phận xử lý tờ khai | Ma_DVHQ_01.06.2026 ver 16 | 213 | EDA 2.9, IDA 1.9 | thay 2.DM_Bo_Phan_Xuly_ToKhai |
| `A202` | Địa điểm lưu kho | 13.DM_DDLK_CTQ | 14754 | EDA 2.27, EDA 2.55, EDA 2.56, IDA 1.29, IDA 1.66, IDA 1.67 | còn mã chi cục cũ |
| `A016` | Địa điểm xếp / dỡ hàng | 11a.DM_DDXEPDOHANG_Cang - ICDtrongnuoc, 11.DM.DD_XEPDOHANG, 12.DM.DD_XEPDOHANG_NUOCNGOAI | 14710 | EDA 2.28, EDA 2.29, IDA 1.33, IDA 1.34 | 14 mã ngưng dùng |
| `COUNTRY` | Mã nước | 10.QUOCGIA | 246 | EDA 2.22, EDA ô APP_XUAT_XU, IDA 1.23, IDA 1.79 | 1 mã ngưng dùng |
| `PACKAGE_KIND` | Loại kiện | 14.DM_MA_LOAIKIEN | 138 | EDA 2.25, IDA 1.27 |  |
| `UNIT` | Đơn vị tính | 15.DM_DVT | 158 | EDA 2.68, EDA 2.72, EDA 2.73, EDA 2.75, EDA ô HAG_CQC, EDA ô HAG_IQC, IDA 1.77, IDA 1.83, IDA 1.84, IDA 1.86 |  |
| `CURRENCY` | Mã tiền tệ | 16.DM_TIENTE | 26 | EDA 2.39, EDA 2.40, EDA 2.68, EDA 2.75, EDA 2.76, IDA 1.44, IDA 1.47, IDA 1.48, IDA 1.49, IDA 1.77, IDA 1.86, IDA 1.87 |  |
| `TYPE_CODE` | Mã loại hình | 1357_QD-TCHQ-MA_LOAI_HINH, Bang ma loai hinh XNK - QD 1357-TCHQ | 40 | EDA 2.4, IDA 1.4 | thay 8.LOAIHINH_NHAPKHAU, 9.LOAIHINH_XUATKHAU |
| `A520` | Mã miễn / giảm / không chịu thuế | 23.DM_MAMIENGIAMTHUESUAT_TONGHOP | 138 | EDA 2.70, IDA 1.92, IDA 1.95 |  |
| `OTHER_TAX` | Mã áp dụng thuế suất / mức thuế và thu khác | 24.DM_MA_MGTHUETHUKHAC | 288 | IDA 1.94 | 1 mã ngưng dùng |
| `BANK` | Ngân hàng | 25.DM_NGANHANG | 1354 | EDA 2.44, EDA 2.49, IDA 1.54, IDA 1.59 |  |
| `TAX_TABLE` | Mã biểu thuế nhập khẩu | 26.DM_BIEUTHUE | 29 | IDA 1.80 |  |
| `ABS_TAX` | Mã áp dụng mức thuế tuyệt đối | 22.DM_THUESUATTUYETDOI_GANCODE | 7 | IDA 1.82 |  |
| `A546` | Phân loại đính kèm khai báo điện tử | 20.DM_KHAI_HYS_GANCODE | 14 | EDA 2.53, IDA 1.63 |  |
| `A519` | Mã văn bản pháp quy | 3. CẬP NHẬT MÃ VĂN BẢN 08052026 | 130 | EDA 2.80, IDA 1.37 | thay 6.DM_VANBANPHAPQUY_PHANLOAIGIAYPHEP |
| `A528` | Mã phân loại giấy phép | 3. CẬP NHẬT MÃ VĂN BẢN 08052026 | 140 | EDA 2.33, IDA 1.38 | thay 6.DM_VANBANPHAPQUY_PHANLOAIGIAYPHEP |
| `CARGO_CLASS` | Mã phân loại hàng hóa | 29.DM_GANCODE | 11 | EDA 2.5, IDA 1.5 |  |
| `TRANSPORT_MODE` | Mã phương thức vận chuyển | 29.DM_GANCODE | 7 | EDA 2.6, IDA 1.6 |  |
| `PARTY_CLASS` | Phân loại cá nhân / tổ chức | 29.DM_GANCODE | 5 | IDA 1.7 |  |
| `INVOICE_KIND` | Phân loại hình thức hóa đơn | 29.DM_GANCODE | 3 | EDA 2.34, IDA 1.39 |  |
| `PRICE_KIND` | Mã phân loại giá hóa đơn | 29.DM_GANCODE | 4 | EDA 2.39, IDA 1.44 |  |
| `PAYMENT` | Phương thức thanh toán | 29.DM_GANCODE | 15 | EDA 2.38, IDA 1.43 |  |
| `INCOTERM` | Điều kiện giao hàng | 29.DM_GANCODE | 15 | EDA 2.39, IDA 1.44 |  |
| `VALUATION_METHOD` | Mã phân loại khai trị giá | 29.DM_GANCODE | 9 | IDA 1.45 |  |
| `FREIGHT_CLASS` | Phân loại phí vận chuyển | 29.DM_GANCODE | 6 | IDA 1.47 |  |
| `INSURANCE_CLASS` | Phân loại phí bảo hiểm | 29.DM_GANCODE | 2 | IDA 1.48 |  |
| `ADJUSTMENT_CODE` | Mã tên khoản điều chỉnh | 29.DM_GANCODE | 17 | IDA 1.49 |  |
| `TAX_PAYER` | Người nộp thuế | 29.DM_GANCODE | 2 | EDA 2.43, IDA 1.52 |  |
| `DUE_DATE` | Mã xác định thời hạn nộp thuế | 29.DM_GANCODE | 4 | EDA 2.48, IDA 1.58 |  |
| `GROSS_UNIT` | Đơn vị tính trọng lượng (Gross) | 29.DM_GANCODE | 3 | EDA 2.26, IDA 1.28 |  |
| `INSPECTION_RESULT` | Mã kết quả kiểm tra nội dung | 29.DM_GANCODE | 3 | IDA 1.36 |  |
| `BP_REASON` | Mã lý do đề nghị giải phóng hàng (bảo lãnh) | 29.DM_GANCODE | 3 | IDA 1.53 |  |
| `IMPORT_TAX_RATE_KIND` | Mã thuế suất thuế nhập khẩu | 27.MathuesuatthueNK_HQTV | 7 | IDA ô HAG_B42 |  |
| `TAX_KIND` | Mã sắc thuế | 28.Sacthue_ma_mien_giam_HQTV | 11 | IDA ô THUE_KF, IDA ô TK_KN |  |
| `AIRLINE` | Hãng hàng không | 17.DM_HANG_HANGKHONG | 162 | – |  |
| `SHIPPING_LINE` | Hãng tàu biển | 18.DM_HANG_TAUBIEN | 5020 | – |  |
| `RAIL_CARRIER` | Hãng tàu hỏa | 19.DM_HANGTAUHOA | 19 | – |  |
| `VEHICLE_KIND` | Phương tiện vận chuyển (ít dùng) | 5.DM_PTVC_ITDUNG | 37 | – |  |
| `LICENSING_BODY` | Đơn vị cấp phép (Một cửa) | 7.DONVICAPPHEP_1CUA | 20 | – |  |
| `CANCEL_REASON` | Lý do hủy tờ khai | 21.DM_LYDOHUYTK_DVC | 9 | – |  |

File nguồn không dựng thành danh mục:

- `3.DM_DL_HAIQUAN`: Danh sách đại lý của riêng doanh nghiệp (1 dòng mẫu) – dữ liệu khách hàng, không phải danh mục VNACCS
- `4.DM.UYTHAC`: Danh sách người ủy thác của riêng doanh nghiệp (1 dòng mẫu)
- `22.DM_THUESUATTUYETDOI_GANCODE`: Sheet A402A là mô tả cấu trúc bảng, không phải dữ liệu

<!-- END danh-muc -->

## 2. Tài liệu chỉ tiêu khai báo (`docs/tailieuchitieukhaibao/`)

Không phải bảng mã mà là quy định / đặc tả → đã chuyển thành **định nghĩa chỉ tiêu, luật kiểm tra và ánh xạ FPT** trong code. Rà soát chi tiết từng chỉ tiêu: `docs/RA-SOAT-CHI-TIEU-TO-KHAI.md`.

| Tài liệu | Nội dung | Đã thành gì trong code |
|---|---|---|
| `Phu luc 2 - Chi tieu thong tin khai hai quan_TT38.doc`, `…_TT39.doc` | Phụ lục 2 TT 38/2015, sửa bởi TT 39/2018: chỉ tiêu tờ khai, độ dài, bắt buộc, hướng dẫn khai | Catalog chỉ tiêu `packages/contracts/src/declaration/catalog-ida*.ts`, `catalog-eda.ts` (`legalNote`, `maxLen`, M/C); luật `packages/core/src/modules/validation/domain/rules/*` |
| `121_2025_TT-BTC_SuaDoi_TT38_TT39_ThuTucHQ.docx`, `121_2025_PhuLucI_SuaDoi_ChiTieuKhaiBao_PL2.doc` | TT 121/2025 sửa đổi TT 38 / TT 39 và Phụ lục chỉ tiêu | Cập nhật catalog chỉ tiêu (xem `RA-SOAT-CHI-TIEU-TO-KHAI.md`) |
| `2061_TCHQ-GSQL_438964.docx` | CV 2061/TCHQ-GSQL: hàng chương 84/85 khai mã văn bản MO / CU | Luật `validation/domain/rules/law-mo-cu.ts`, ánh xạ `declaration/domain/mapping/ida.ts` |
| `VNACCS_IDA v1.2.xlsx`, `VNACCS_EDA v1.2.xlsx` | Đặc tả bản tin IDA / EDA (trường, độ dài, kiểu) | Schema FPT `packages/contracts/src/fpt/ida.ts`, `eda.ts`; `integration/domain/declaration-to-fpt.ts` |
| `VNACCS_AMA v1.3.xlsx`, `TK_AMA_(chua_dang_ky / da_dang_ky / da_chap_nhan).pdf` | Đặc tả bản khai bổ sung sau thông quan AMA và mẫu in | `integration/domain/post-amendment.ts`, `contracts/src/declaration-layout/amend.ts` |
| `VNACCS_HYS v1.2.xlsx` | Đặc tả khai hồ sơ đính kèm (HYS) | Schema `packages/contracts/src/fpt/hys.ts` |
| `MAUIN_TOKHAI_NHAPKHAU.pdf`, `MAUIN_TOKHAI_XUATKHAU.pdf` | Mẫu in tờ khai nhập / xuất | Bản in tờ khai ở bước Review (`declaration-layout`) |
| `BO SUNG CHUNG TU v1.4.xlsx`, `KHAI BAO DANH SACH CONTAINER v1.1.xlsx`, `KHAI BAO LAY MA DINH DANH v1.1.xlsx`, `TACH VAN DON.xlsx`, `In bản kê mã vạch container.pdf`, `In bản kê mã vạch hàng lẻ.pdf` | Đặc tả nghiệp vụ phụ: bổ sung chứng từ, danh sách container, lấy mã định danh, tách vận đơn, bản kê mã vạch | **Chưa làm** – nguồn cho các tính năng sau |

> Lưu ý: 3 file `TK_AMA_(…).pdf` có thể chứa dữ liệu doanh nghiệp thật – kiểm tra trước khi chia sẻ ra ngoài nhóm.
