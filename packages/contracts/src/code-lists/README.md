# Danh mục mã VNACCS (`code-lists`)

Danh mục đầy đủ lấy từ thư mục `02_DANHMUC_VNACCS` (cạnh repo), dùng cho tra cứu mã trên tờ khai (`CodeInput` ở `apps/web/src/features/declaration-form`).
Bảng mã gọn `declaration/code-tables.ts` vẫn là nguồn của backend (chuẩn hóa trích xuất, đối chiếu catalog) – chưa đổi sang danh mục đầy đủ.

- `data/<ID>.json`: mỗi mục `{ code, name, parent?, note?, inactive? }`. `parent` = mã cha (cơ quan Hải quan của địa điểm / bộ phận xử lý, mã nước của cảng, `NK`/`XK` của loại hình).
- `manifest.json`: tên, file nguồn, file đã bị thay, số mục, ánh xạ mã cơ quan Hải quan cũ → mới.
- `loadCodeList(id)` tải từng danh mục khi cần (bundler tách riêng – địa điểm lưu kho ~2,6 MB không vào gói chính).

## Dựng lại khi có danh mục mới

```powershell
powershell -File scripts/code-lists/export-csv.ps1 -Source ..\02_DANHMUC_VNACCS -Out $env:TEMP\kb-danhmuc-csv   # cần Excel (đọc .xls đời cũ)
node scripts/code-lists/build.mjs --csv $env:TEMP\kb-danhmuc-csv
pnpm --filter @kb/contracts test
```

Không sửa tay file sinh ra. Đổi cột / file nguồn → sửa quy tắc trong `scripts/code-lists/build.mjs`.

## Lưu ý về dữ liệu nguồn (bản 10/2026)

- `13.DM_DDLK_CTQ` (địa điểm lưu kho, 04/2025) còn **mã chi cục cũ** (vd `02B1A04` KHO SCSC, phần mềm khai báo hiện dùng `06B1A04`). Popup tra cứu lọc theo cơ quan Hải quan mới qua ánh xạ cũ → mới (ghép theo tên đơn vị giữa bảng 17/03/2025 và 01/06/2026 – mới ghép được 40 đơn vị) và hiện cảnh báo. Cần danh mục địa điểm lưu kho sau đợt sắp xếp.
- Bộ phận xử lý tờ khai lấy theo **mã mới** từ cột "Mã bộ phận xử lý tờ khai" của `Ma_DVHQ_01.06.2026`; bảng `2.DM_Bo_Phan_Xuly_ToKhai` còn mã cũ nên không dùng.
- Không có trong nguồn: `VNSGN` (địa điểm dỡ hàng của tờ khai mẫu), mã điều kiện giao hàng `C&F` (cách viết cũ), mã văn bản `MO`/`CU`, mã thuế GTGT `VB…`. Ô vẫn gõ tay được; giá trị không có trong danh mục được giữ nguyên.
- Bỏ qua: `3.DM_DL_HAIQUAN`, `4.DM.UYTHAC` (dữ liệu riêng của doanh nghiệp, 1 dòng mẫu), sheet mô tả cấu trúc `A402A`.
