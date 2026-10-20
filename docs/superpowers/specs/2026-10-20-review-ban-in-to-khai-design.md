# Bước 5 Review: tờ khai dạng bản in VNACCS

Ngày: 2026-10-20 · Trạng thái: đã duyệt hướng, chờ duyệt spec · Liên quan: `2026-10-17-to-khai-day-du-ban-mau-design.md` (bố cục dữ liệu `declaration-layout`, giữ nguyên), `docs/RA-SOAT-CHI-TIEU-TO-KHAI.md`

## 1. Mục tiêu

Ở bước 5, người duyệt xem tờ khai **giống bản in VNACCS** mà họ đã quen, thay cho form Phụ lục II dài nhiều nhóm. Ba lý do, cùng lúc:

1. Người duyệt quen đọc mẫu in → kiểm nhanh, ít sót.
2. Cần in / lưu PDF để lưu hồ sơ, gửi khách hàng, trình ký.
3. Form hiện tại quá dài, rối.

Thành công khi:
- Bước 5 chỉ có **một** cách xem tờ khai: bản in. Mọi chỉ tiêu người khai nhập vẫn sửa được (trên bản in hoặc khối "Chỉ tiêu khác").
- Ctrl+P / nút In ra trang A4 khớp bố cục mẫu `MAUIN_TOKHAI_NHAPKHAU.pdf` / `MAUIN_TOKHAI_XUATKHAU.pdf`.
- Ô lỗi / còn thiếu / ước tính nhìn thấy ngay trên bản in, nhảy được lần lượt.

Mẫu tham chiếu (thư mục `tailieuchitieukhaibao/`):
- `MAUIN_TOKHAI_NHAPKHAU.pdf` – IDA "thông báo kết quả phân luồng", 4 trang: tr.1 đầu tờ khai, các bên, vận đơn, hóa đơn/trị giá, giấy phép, khai trị giá, thuế theo sắc thuế; tr.2 đính kèm, ghi chú, số quản lý, 10 chỉ thị Hải quan, mục thông báo, trung chuyển; tr.3+ mỗi dòng hàng một khối (thuế NK + 5 khoản thuế và thu khác).
- `MAUIN_TOKHAI_XUATKHAU.pdf` – EDA "thông quan", 3 trang: tr.1 tương tự (mục thông báo có ngày hoàn thành kiểm tra, ngày cấp phép); tr.2 Vanning (5 địa điểm xếp hàng lên xe, 50 số container) + chỉ thị; tr.3+ dòng hàng (thuế XK, lệ phí, bảo hiểm, mã văn bản pháp luật khác 1–5).
- Đầu trang lặp ở mọi trang: `<IMP>`/`<EXP>`, tiêu đề, số tờ khai, số tờ khai đầu tiên, TN-TX tương ứng, mã phân loại kiểm tra, mã loại hình, cơ quan Hải quan, mã bộ phận xử lý, ngày đăng ký, ngày thay đổi đăng ký, thời hạn tái nhập/tái xuất, số trang `n / N`. Mã vạch ở trang 1.

Ngoài phạm vi: máy chủ tạo PDF; mã vạch thật (chừa chỗ); bản in cho AMA (bước 7) và trang `/ban-mau/to-khai`; sửa trực tiếp trong ô; nghiệp vụ, API, DB, luật khóa ô – giữ nguyên.

## 2. Quyết định đã chốt

| # | Quyết định |
|---|---|
| Q1 | Theo **mẫu in chính thức VNACCS** (không theo Mẫu 01/02 Phụ lục II, không tự chế bố cục). |
| Q2 | Sửa bằng **bấm ô trên bản in → panel bên phải** (mobile: sheet dưới). Bản in luôn giữ hình dạng giấy. |
| Q3 | Bản in **thay hẳn** tab "Tờ khai đầy đủ" và gộp tab "Hải quan trả về". Thông tin không có trên mẫu in → khối **"Chỉ tiêu khác"**. Form cũ giữ sau cờ cấu hình trong giai đoạn thử nghiệm rồi xóa. |
| Q4 | In / PDF bằng **CSS print của trình duyệt**; không có máy chủ PDF. |

## 3. Thiết kế giao diện

### 3.1 Bố cục bước 5

Tab: **Tờ khai** (mặc định) · Chứng từ đính kèm · Theo dõi & nghiệp vụ.

Desktop – hai cột:
```
┌──────────────────────────────────────────┬──────────────────────┐
│ Thanh công cụ: Trang 1·2·3·4 │ Chỉ ô cần │ Panel sửa ô          │
│ xử lý (n) │ In / Lưu PDF                 │ (mở khi bấm một ô)   │
├──────────────────────────────────────────┤                      │
│  Trang A4 1…N (như mẫu VNACCS)           │                      │
│  Khối "Chỉ tiêu khác" (thu gọn được)     │                      │
└──────────────────────────────────────────┴──────────────────────┘
   Thanh dưới (giữ nguyên): tổng thuế ước tính · Quay lại OCR · Phê duyệt / Mở lại
```

- Trang giấy dựng HTML/CSS theo thứ tự, cách nhóm và nhãn **y như mẫu**; giá trị font đơn cách. Số chỉ tiêu (1.44…) không in trên trang; hiện ở tooltip khi rê chuột và ở panel.
- IDA: 2 trang chung + mỗi dòng hàng một khối (`< 01 >`, `< 02 >`…). EDA: trang chung + Vanning/container + dòng hàng. Khối dòng hàng xếp liên tục trên màn hình; khi in theo mẫu: IDA mỗi dòng hàng một trang, EDA các dòng hàng nối tiếp và chỉ ngắt trang khi hết chỗ (không cắt đôi một khối dòng hàng).
- Tiêu đề theo giai đoạn:

| Giai đoạn | Tiêu đề |
|---|---|
| Chưa khai (nháp / đã duyệt / khai tạm chưa có số) | "Tờ khai hàng hóa nhập khẩu – BẢN NHÁP" + watermark |
| Đã có số tờ khai, đã phân luồng | "… (thông báo kết quả phân luồng)" |
| Đã thông quan | "… (thông quan)" |

- Ô do Hải quan trả về (số tờ khai, mã phân loại kiểm tra, ngày đăng ký, thuế theo sắc thuế, chỉ thị, mục thông báo…) chưa có dữ liệu → in như mẫu ("- / /", để trống), riêng số tờ khai hiện "Chưa cấp".
- Khối **"Chỉ tiêu khác (không có trên mẫu in)"** dưới trang cuối: chỉ tiêu người khai không có chỗ trên mẫu (chỉ tiêu theo tình huống đang áp dụng, ô `APP_*` của phần mềm…), nhóm theo Phụ lục II, mỗi ô dạng nhãn – giá trị; bấm mở panel như ô trên bản in. Không có ô nào → không hiện khối.
- Mobile: panel thành sheet từ dưới lên; trang giấy co theo bề ngang, không cuộn ngang trang; dưới ngưỡng hẹp, vùng hai cột của mẫu xếp một cột.

### 3.2 Trạng thái ô (chỉ trên màn hình)

Màu bằng token `@kb/ui`, luôn kèm dấu hiệu không phụ thuộc màu:

| Trạng thái | Hiện |
|---|---|
| Lỗi Hải quan (`rejection`) / luật BLOCKER FAIL | nền danger nhạt + viền + biểu tượng cảnh báo |
| Bắt buộc còn trống | viền đứt warning + chữ "Còn thiếu" |
| Số ứng dụng ước tính (trị giá tính thuế, thuế trước khi khai) | chữ nghiêng + nhãn "ƯT" |
| Người khai đã sửa tay (nguồn USER) | chấm accent góc ô |
| Hải quan trả về khác số ước tính | số Hải quan đậm, số ước tính gạch ngang bên cạnh (thay phần so sánh của `CustomsInfoPanel`) |
| Khóa theo giai đoạn / chỉ đọc | không nhấn mạnh; panel mở chỉ đọc kèm lý do (`AmendLock.reason`) |
| Ô đang chọn | viền focus |

Chỉ thị Hải quan (tr.2) có nội dung → khối chỉ thị nổi bật (như hiện nay ở tab "Hải quan trả về").

### 3.3 Thanh công cụ

- Nhảy trang (1…N, thêm "Chỉ tiêu khác").
- **Chỉ ô cần xử lý (n)**: lần lượt nhảy tới ô lỗi → ô còn thiếu, cuộn tới và mở panel. Thay khung tổng hợp lỗi hiện tại; số `n` cũng hiện trên tab "Tờ khai".
- **In / Lưu PDF**: `window.print()`.

### 3.4 Panel sửa ô

- Đầu panel: số chỉ tiêu · tên đầy đủ · huy hiệu vai trò (`declarationFieldRole`: K / ĐK / HT / HQ…).
- Ô nhập theo `FieldInput` (text, code có tra danh mục, date, number, choice…). Ô thuộc `LayoutGroup` / `LayoutRepeat` → panel hiện cả nhóm (địa chỉ 4 dòng, tổng trị giá 4 ô, 5 giấy phép…).
- Lỗi Hải quan + cách khắc phục; "Có trên tờ khai vì: …" (`condition`); hướng dẫn TT121 từ catalog.
- Nguồn giá trị: chứng từ, trang; nút "Xem trên chứng từ" (mở bước OCR đúng chứng từ/trường).
- Ô theo chứng từ / mã HS / tính từ nguyên tệ (`ITEM_LOCK`, `DERIVED_LOCK`): không sửa trong panel; nút dẫn tới bước OCR hoặc hộp "Chọn mã HS" như hiện nay.
- **Lưu / Hủy**: lưu từng ô bằng API sửa chỉ tiêu hiện có (`updateDeclarationField`, backend kiểm tra lại, ghi `field_audit`). Tab / Shift+Tab trong panel → ô kế tiếp / trước theo thứ tự in. Esc đóng panel. Có thay đổi chưa lưu mà chọn ô khác → hỏi lưu / bỏ.
- Vai trò VIEWER hoặc tờ khai chỉ đọc: panel chỉ đọc.

### 3.5 In

`@media print`: ẩn thanh công cụ, panel, tab, thanh dưới, khối "Chỉ tiêu khác", mọi đánh dấu trạng thái; chữ đen trên nền trắng; A4 dọc, ngắt trang như mẫu; đầu trang lặp và `n / N` ở mỗi trang. Chưa khai → watermark "BẢN NHÁP – CHƯA KHAI HẢI QUAN" trên mọi trang.

## 4. Kiến trúc

### 4.1 `@kb/contracts` – `print-layout/` (dữ liệu thuần)

- `types.ts`: `PrintLayout { kind; header: PrintRow[]; pages: PrintPage[]; item: PrintRegion[] }`; `PrintPage { id; regions: PrintRegion[] }`; `PrintRegion { id; title?; columns: 1 | 2; rows: PrintRow[] }`; `PrintRow` = danh sách `PrintCell { key; label; width?; align? }` hoặc nhóm lặp (`{n}` như `LayoutRepeat`). `key` là khóa ô **đã có** trong `declaration-layout` (không tạo khóa mới).
- `ida-print.ts`, `eda-print.ts`: bố cục theo hai mẫu PDF ở §1.
- `printTitle(kind, stage)`: tiêu đề theo giai đoạn (§3.1).
- `otherFields(kind)`: khóa người khai nhập trong `layoutFor(kind)` không có trên bản in, giữ thứ tự Phụ lục II.

### 4.2 `@kb/ui`

- `PaperSheet`: khung trang A4 (tỉ lệ, lề, ngắt trang khi in, watermark tùy chọn, số trang).
- Token: font đơn cách cho giá trị, đường kẻ trang giấy, màu trạng thái ô in (ánh xạ về token danger/warning/accent sẵn có). Có trong playground; test a11y (axe).

### 4.3 `apps/web/src/features/declaration-print/`

- `print-declaration.tsx`: vẽ header lặp + trang + khối dòng hàng + "Chỉ tiêu khác" từ `PrintLayout`; giá trị và quyền sửa lấy qua `dossier-adapter` (`declarationValues`, `itemValues`, `editableKeys`) và `customs-adapter`; khóa theo `formKeyLock`. Không viết lại logic giá trị / khóa.
- `print-cell.tsx`: một ô có trạng thái; `role="button"`, `aria-label` = số chỉ tiêu + tên đầy đủ + giá trị + trạng thái.
- `field-edit-panel.tsx`: ô nhập + lưu; tách phần dùng chung từ `declaration-form` (`field.tsx`, `field-group.tsx`, `field-repeat.tsx`, `code-input.tsx`) thay vì sao chép.
- `print-toolbar.tsx`, `use-attention-cells.ts` (danh sách ô lỗi / còn thiếu theo thứ tự in).
- `print.css`: chỉ quy tắc `@media print`.

### 4.4 `review-step.tsx`

- Tabs còn: `full` → "Tờ khai" (`PrintDeclaration`), `docs`, `ops`. Bỏ `customs`; `?tab=customs` cũ chuyển về "Tờ khai".
- Cờ `NEXT_PUBLIC_REVIEW_LEGACY_FORM=1` → vẫn dùng `DossierDeclarationForm` + tab "Hải quan trả về" như hiện nay. Mặc định tắt. Xóa cờ và form cũ khỏi bước 5 sau thử nghiệm (ghi vào BACKEND-TODO).
- Alert đầu màn (4 mắt, HS chưa xác nhận…) và thanh dưới giữ nguyên.

## 5. Kiểm thử

- Contracts:
  - Phủ khóa: mọi khóa `origin` người khai trong `layoutFor(kind)` có mặt **đúng một lần** ở bản in hoặc `otherFields`; mọi `PrintCell.key` tồn tại trong `layoutFor(kind)`.
  - Mọi ô Hải quan trả về có trên mẫu in có khóa tương ứng.
  - `printTitle` theo giai đoạn.
- Web (vitest + axe): `PrintCell` đủ trạng thái §3.2; panel lưu / hủy / ô khóa / ô dẫn sang OCR; "Chỉ ô cần xử lý" nhảy đúng thứ tự; cờ legacy.
- Mock: `dos_021` (nháp, watermark), `dos_019` (phân luồng vàng), `dos_018` (thông quan) – đúng tiêu đề, số Hải quan, so sánh ước tính.
- Trình duyệt thật: sáng + tối, desktop + mobile; Ctrl+P đối chiếu từng trang với hai PDF mẫu (bố cục, ngắt trang, không lộ đánh dấu).
- `pnpm typecheck && pnpm lint && pnpm test` xanh.
