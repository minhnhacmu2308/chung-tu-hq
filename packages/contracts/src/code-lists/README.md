# Danh mục mã VNACCS (`code-lists`)

Danh mục đầy đủ lấy từ thư mục `02_DANHMUC_VNACCS` (cạnh repo), dùng cho tra cứu mã trên tờ khai (`CodeInput` ở `apps/web/src/features/declaration-form`).
Bảng mã gọn `declaration/code-tables.ts` vẫn là nguồn của backend (chuẩn hóa trích xuất, đối chiếu catalog) – chưa đổi sang danh mục đầy đủ.

- `data/<ID>.json`: mỗi mục `{ code, name, parent?, note?, inactive? }`. `parent` = mã cha (cơ quan Hải quan của địa điểm / bộ phận xử lý, mã nước của cảng, `NK`/`XK` của loại hình).
- `manifest.json`: tên, file nguồn, file đã bị thay, số mục, ánh xạ mã cơ quan Hải quan cũ → mới.
- `loadCodeList(id)` tải từng danh mục khi cần (bundler tách riêng – địa điểm lưu kho ~2,6 MB không vào gói chính).

## Dựng lại khi có danh mục mới

```powershell
powershell -File scripts/code-lists/export-csv.ps1 -Source ..\02_DANHMUC_VNACCS -Out $env:TEMP\kb-danhmuc-csv   # cần Excel (đọc .xls đời cũ); .docx chép word/document.xml
node scripts/code-lists/build.mjs --csv $env:TEMP\kb-danhmuc-csv
pnpm code-lists:index   # cập nhật bảng chỉ mục docs/NGUON-DU-LIEU.md
pnpm --filter @kb/contracts test
```

Không sửa tay file sinh ra. Đổi cột / file nguồn → sửa quy tắc trong `scripts/code-lists/build.mjs`.

## Lưu ý về dữ liệu nguồn (bản 10/2026)

- `13.DM_DDLK_CTQ` (địa điểm lưu kho, 04/2025) còn **mã chi cục cũ** (vd `02B1A04` KHO SCSC, phần mềm khai báo hiện dùng `06B1A04`). Popup tra cứu lọc theo cơ quan Hải quan mới qua ánh xạ cũ → mới (ghép theo tên đơn vị giữa bảng 17/03/2025 và 01/06/2026 – mới ghép được 40 đơn vị) và hiện cảnh báo. Cần danh mục địa điểm lưu kho sau đợt sắp xếp.
- Bộ phận xử lý tờ khai lấy theo **mã mới** từ cột "Mã bộ phận xử lý tờ khai" của `Ma_DVHQ_01.06.2026`; bảng `2.DM_Bo_Phan_Xuly_ToKhai` còn mã cũ nên không dùng.
- Không có trong nguồn: `VNSGN` (địa điểm dỡ hàng của tờ khai mẫu), mã điều kiện giao hàng `C&F` (cách viết cũ), mã văn bản `MO`/`CU`, mã thuế GTGT `VB…`. Ô vẫn gõ tay được; giá trị không có trong danh mục được giữ nguyên.
- Bỏ qua: `3.DM_DL_HAIQUAN`, `4.DM.UYTHAC` (dữ liệu riêng của doanh nghiệp, 1 dòng mẫu – sẽ làm danh bạ đại lý / người ủy thác theo từng doanh nghiệp), sheet mô tả cấu trúc `A402A`.
- `29.DM_GANCODE` có thêm 3 sheet gắn vào tờ khai: `DM_BAOLANH` → 1.53 (`BP_REASON`), `DM_DVT_GROSS` → đơn vị 1.28 / 2.26 (`GROSS_UNIT`, chỉ KGM/TNE/LBR), `DM_MA_PLKT` → 1.36 (`INSPECTION_RESULT`).
- `27.MathuesuatthueNK_HQTV`, `28.Sacthue_ma_mien_giam_HQTV`: HQTV = Hải quan trả về. Mã thuế suất thuế NK (A ưu đãi, B chương 98…) hiện ở ô "Mã phân loại thuế suất" của dòng hàng (`HAG_B42`); mã sắc thuế ở bảng "Thuế theo sắc thuế".
- Không thuộc tờ khai (giữ để tra cứu): hãng hàng không / tàu biển / tàu hỏa (dùng cho manifest), `5.DM_PTVC_ITDUNG`, `7.DONVICAPPHEP_1CUA`, `21.DM_LYDOHUYTK_DVC` – chưa dùng.

## Mã loại hình

- Nguồn chính: văn bản `1357_QD-TCHQ-MA_LOAI_HINH.docx` (QĐ 1357/QĐ-TCHQ ngày 18/5/2021, hiệu lực 01/6/2021, thay CV 2765/TCHQ-GSQL). `export-csv.ps1` chép `word/document.xml`; `build.mjs` đọc 2 bảng (I. xuất khẩu, II. nhập khẩu) lấy tên, hướng dẫn, ghi chú, cột "Khai kết hợp". Bảng Excel `Bang ma loai hinh XNK` chỉ bổ sung ghi chú chưa có trong văn bản. Bảng gọn `TYPE_CODES_NK/XK` (code-tables.ts) chép tên theo danh mục này.
- Cột "Khai kết hợp" trong Excel lệch văn bản ở một số mã (A43, G21–G24, G61…) – theo văn bản.
- Ghi chú quan trọng của QĐ 1357: E42 / E62 xuất vào nội địa, E52 xuất vào DNCX / khu phi thuế quan, E54 – phải khai thông tin XNK tại chỗ (mã điểm đích vận chuyển bảo thuế, số quản lý nội bộ 2.58). E31 chỉ khi đáp ứng khoản 2 Điều 12 NĐ 134/2016, không thì A12. A11 của doanh nghiệp FDI / có quyền nhập khẩu dùng A41. G13 khai kèm mã miễn / không chịu thuế. A42 gồm cả hàng xuất khẩu tại chỗ quá 15 ngày không có tờ khai nhập tại chỗ tương ứng.
- `So sanh ma loai hinh NK.doc`, `So sanh ma loai hinh XK.doc` (02/2014, theo CV 2765 – đã hết hiệu lực): bảng đối chiếu mã VNACCS với mã E-CUS cũ (NKD01, NSX01, NGC01, XKD01, XGC01…). Chỉ dùng để hiểu chứng từ / dữ liệu cũ ghi mã E-CUS; không dùng làm danh mục. Các mã E46, E56 trong đó đã bị bãi bỏ (E56 gộp vào E52).
