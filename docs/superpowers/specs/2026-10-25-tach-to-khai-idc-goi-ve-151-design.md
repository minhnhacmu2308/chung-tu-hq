# Tách tờ khai – khai chính thức cả lô, gọi về sửa theo phạm vi, 1.51 tổng hệ số phân bổ

Bổ sung cho `2026-10-24-tach-to-khai-50-dong-design.md` (lô > 50 dòng, các tờ khai nhánh). Nhánh: `feat/tach-to-khai-50-dong`.

## Quyết định với người dùng (2026-10-25)

| # | Câu hỏi | Quyết định |
|---|---|---|
| D1 | IDC/EDC lô nhiều tờ | Có **cả hai**: nút khai chính thức cả lô (nối tiếp tờ 1 → N như khai tạm) và khai từng tờ. |
| D2 | Điều kiện khai chính thức tờ k | Mọi tờ trước tờ k **đã khai tạm xong, đang chờ khai chính thức** (hoặc đã qua bước đó). Không bắt tờ trước đã IDC. |
| D3 | Gọi về sửa (IDB/EDB, IDD/EDD) | Gọi về xong → **tự về màn hình khai sửa**. Sửa thông tin chung → phải gọi về **tất cả** tờ cùng lúc. |
| D4 | Gọi về một tờ | **Có**: chỉ gọi về tờ k thì **khóa toàn bộ chỉ tiêu chung**, chỉ sửa thông tin dòng hàng của tờ đã gọi về. |
| D5 | 1.51 / 2.42 | = tổng trị giá mọi loại phí trên tờ khai của cả lô: hàng hóa + bảo hiểm + vận chuyển + khoản điều chỉnh cộng − khoản điều chỉnh trừ; **giống hệt trên mọi tờ** để Hải quan phân bổ phí cho từng tờ. Căn cứ: nghiệp vụ người dùng xác nhận 2026-10-25. |
| D6 | Tiền tệ khác hóa đơn | Quy đổi về nguyên tệ hóa đơn theo tỷ giá trên tờ khai rồi cộng. |

Thuật ngữ trong tài liệu này:
- **Tờ còn hiệu lực ở Hải quan**: tờ có số tờ khai, không miễn (không CLEARED / POST_* / REJECTED – `recallExempt`), không đang chờ gửi nội dung (`awaitingContent` = NOT_SENT / RECALLED / AMEND_RECALLED).
- **Tờ đã gọi về**: stage RECALLED hoặc AMEND_RECALLED.

## 1. Khai chính thức (IDC/EDC, IDE/EDE)

### 1.1 Thứ tự (D2)
- Mở rộng `sheetOrderWait` (contracts, `customs-summary.ts`) dùng cho cả nghiệp vụ khai chính thức IDC/EDC và IDE/EDE: tờ k chờ tờ j < k gần nhất còn `awaitingContent`. Tờ miễn không chờ. Vị từ giữ nguyên; chỉ mở rộng tập nghiệp vụ áp dụng.
- `performOperation`: kiểm thứ tự cho IDC/EDC/IDE/EDE như IDA/IDA01 (lô nhiều tờ). Bị chặn → reason code mới `SHEET_ORDER_DECLARE` – "Tờ {sheet}: chờ tờ {waitFor} khai tạm xong trước khi khai chính thức". Đồng thời sửa câu của `SHEET_ORDER` để không giả định "khai tạm" khi tờ trước chờ IDA01 (dùng "gửi nội dung").
- Giao diện (SheetCard): dòng IDC/IDE của tờ đang chờ hiện "Chờ tờ j", nút khóa. Backend view (`_customs-view`) cũng trả nút **không bấm được** kèm lý do (sửa luôn tồn đọng "view vẫn báo IDA bấm được").

### 1.2 Khai chính thức cả lô (D1)
- Use case mới `declareAllSheets(deps, ctx, dossierId)` (integration) + route `POST /api/dossiers/[id]/submission/declare-all`.
- Điều kiện: lô nhiều tờ; không tờ nào `awaitingContent`; có ít nhất một tờ PRE_DECLARED hoặc AMEND_PRE_DECLARED; không outbox nội dung/khai chính thức đang PENDING; bất biến 7 (không BLOCKER FAIL, HS đủ) như IDC hiện nay.
- Gửi tờ đầu tiên đang chờ khai chính thức (PRE_DECLARED → IDC/EDC, AMEND_PRE_DECLARED → IDE/EDE), outbox đánh dấu chuỗi `chain: "declare"`. Worker nối tiếp đúng điểm chuỗi khai tạm đang nối (`chainNextBranch`): Hải quan nhận khai chính thức tờ k → gửi tờ kế tiếp đang chờ khai chính thức, bỏ qua tờ đã khai chính thức / miễn. Lỗi hoặc bị từ chối ở tờ nào thì dừng ở tờ đó (người khai bấm lại từng tờ hoặc bấm lại cả lô).
- Khóa idempotency theo khóa hiện có của từng tờ (nhánh ≥ 2 thêm `:b<no>`); bấm hai lần không tạo trùng.
- Giao diện: nút "Khai chính thức tất cả ({n} tờ)" ở đầu danh sách tờ của bước Truyền, chỉ hiện khi đủ điều kiện; xác nhận trước khi gửi.
- Lô một tờ: không hiện nút, IDC như cũ.

## 2. Gọi về sửa theo phạm vi (D3, D4)

### 2.1 Hộp xác nhận gọi về (lô nhiều tờ)
Bấm IDB/EDB/IDD/EDD trên tờ k → hộp xác nhận có hai lựa chọn:
1. **Gọi về tất cả tờ** (mặc định) – sửa được thông tin chung và dòng hàng.
2. **Chỉ gọi về tờ k** – chỉ sửa dòng hàng của tờ k; thông tin chung bị khóa.

Lô một tờ: hộp như cũ.

### 2.2 Gọi về tất cả
- Use case mới `recallAllSheets(deps, ctx, dossierId)` + route `POST /api/dossiers/[id]/submission/recall-all`.
- Tờ đích = mọi tờ còn hiệu lực ở Hải quan. Mỗi tờ dùng nghiệp vụ gọi về mà `operationAvailability` cho phép ở giai đoạn của tờ (PRE_DECLARED → IDB/EDB; DECLARED, AMEND_PRE_DECLARED → IDD/EDD). Có tờ đích không gọi về được (đang gửi dở, nghiệp vụ không bật) → từ chối cả lần, báo tờ và lý do; không gửi tờ nào.
- Gửi theo thứ tự tờ, nối tiếp: gọi về tờ k thành công → gửi gọi về tờ đích kế tiếp (`chain: "recall"`). Lỗi ở tờ nào dừng ở tờ đó; người khai bấm lại "Gọi về tất cả" thì chỉ gửi các tờ chưa gọi về.

### 2.3 Tự mở lại và về màn hình khai sửa
- Khi ghi nhận kết quả gọi về thành công (chỗ worker/poll cập nhật stage RECALLED/AMEND_RECALLED) và **không còn lệnh gọi về nào của lần này đang chờ**: nếu tờ khai đang APPROVED/SUBMITTED → tự mở lại (DRAFT, hồ sơ về bước `review`), ghi `DECLARATION_REOPENED` với `detail.scope` (`ALL` hoặc danh sách tờ). Thay cho bước bấm "Mở lại để sửa".
- Bước Truyền đang mở: thấy hồ sơ đã về `review` → tự chuyển sang bước Review, kèm thông báo:
  - gọi về tất cả: "Đã gọi về {n} tờ – sửa tờ khai rồi duyệt lại";
  - gọi về một/vài tờ: "Đã gọi về tờ {list} – chỉ sửa dòng hàng của các tờ này; thông tin chung bị khóa".
- Trong lúc chờ: bước Truyền hiện "Đang gọi về {k}/{n} tờ".

### 2.4 Phạm vi sửa (thuần, contracts)
Hàm mới `declarationEditScope(p: { status: DeclarationStatus; kind; sheets: { no: number; stage: CustomsStage; declarationNo: string | null }[] })`:

```
{ common: DeclarationEditMode;              // FULL | AMEND | LOCKED cho mọi chỉ tiêu chung (header, vận đơn, trị giá/khoản điều chỉnh, container…)
  lines: Record<number, DeclarationEditMode>; // theo tờ
  addRemoveLines: boolean;                    // thêm/xóa/đổi thứ tự dòng (làm dịch dòng giữa các tờ)
  lockedSheets: number[];                     // tờ còn hiệu lực ở Hải quan – lý do khóa
}
```
- `status !== "DRAFT"` → mọi thứ LOCKED.
- Còn **tờ còn hiệu lực** → `common = LOCKED`, `addRemoveLines = false`; lý do: "Thông tin chung: tờ {list} chưa gọi về – gọi về tất cả tờ để sửa".
- Không còn → `common` = AMEND nếu có tờ AMEND_RECALLED (chặt nhất), ngược lại FULL; `addRemoveLines = true`.
- `lines[no]`: NOT_SENT / RECALLED → FULL; AMEND_RECALLED → AMEND (khóa Phụ lục II trên ô dòng hàng); còn hiệu lực / miễn → LOCKED.
- Lô một tờ: `common` = `lines[1]` = `declarationEditMode(status, stage)` như cũ (không đổi hành vi).

Áp dụng một quy tắc ở mọi đường sửa (backend + mock + FE), qua một hàm chung `editBlockFor(scope, target)` (`target`: chỉ tiêu chung / ô dòng hàng của dòng thuộc tờ n / thêm–xóa dòng / dựng lại tờ khai):
- `updateDeclarationField`: chỉ tiêu chung theo `common`; ô `HANG.<id>.<ô>` theo `lines[tờ của dòng]`.
- Sửa dòng hàng, xác nhận/bỏ xác nhận HS: theo `lines[tờ của dòng]`; thêm/xóa dòng theo `addRemoveLines`.
- Khoản điều chỉnh / phí (`saveValueCharges`), sửa chỉ tiêu chứng từ (`fields`), dựng lại tờ khai, quay lại đọc chứng từ: theo `common` (LOCKED → từ chối).
- Kế hoạch triển khai liệt kê đủ các route sửa hiện có và gắn guard cho từng route.

Giao diện bước Review:
- `common` LOCKED → form chỉ tiêu chung chỉ đọc, banner nêu lý do và nút **"Gọi về các tờ còn lại để sửa thông tin chung"** (gọi `recallAllSheets` khi tờ khai đang DRAFT; xong thì phạm vi thành FULL).
- Bảng dòng hàng: dòng thuộc tờ bị khóa chỉ đọc (ghi "Tờ n – chưa gọi về"); ẩn thêm/xóa dòng khi `addRemoveLines = false`.

### 2.5 Lưới an toàn: thông tin đã khai của tờ chưa gọi về không được đổi
Guard ở 2.4 có thể sót một đường sửa (vd dựng lại tự động). Thêm kiểm tra không phụ thuộc đường sửa:
- Khi Hải quan nhận nội dung một tờ (IDA/IDA01/EDA/EDA01 thành công), lưu vào kết quả tờ (`raw.sent`): ảnh chụp chỉ tiêu chung đã gửi (chỉ tiêu của `branchPayload` trừ TK_FIC/TK_BNO, cộng khoản điều chỉnh, container, tiền tệ) và dấu vân tay các dòng hàng của tờ (lineNo + mọi giá trị gửi đi).
- Luật mới **R-SENT-SHEETS-UNCHANGED** (BLOCKER, lô nhiều tờ): với mỗi tờ còn hiệu lực, chỉ tiêu chung hiện tại phải bằng ảnh chụp đã gửi **và** dòng hàng hiện tại của tờ phải trùng dấu vân tay. Lệch → FAIL, liệt kê chỉ tiêu chung đã đổi (mã + số chỉ tiêu) hoặc "dòng hàng tờ n đã đổi", hướng dẫn "gọi về tờ {list} hoặc hoàn tác".
- Luật chặn duyệt và truyền (bất biến 7). Tờ chưa từng gửi (không có `raw.sent`) bỏ qua.
- Hệ quả cần nêu cho người khai: 1.51 (mục 3) là chỉ tiêu chung tính từ trị giá cả lô → sửa trị giá/số lượng dòng làm đổi tổng trị giá sẽ đổi 1.51 → luật FAIL, phải gọi về tất cả. Form Review ở chế độ gọi về một tờ hiện cảnh báo ngay khi 1.51 tính lại khác giá trị đã khai.

### 2.6 Truyền lại sau khi sửa
- Thay quyết định R3 (bắt gọi về mọi tờ đã có số trước khi mở lại / truyền lại): cho phép gọi về một phần; tính đúng đắn do 2.4 + 2.5 bảo đảm. `recallFirstError` bỏ khỏi `reopenDeclaration`, còn ở `performOperation`/`submitDeclaration` thì thay bằng kết quả luật R-SENT-SHEETS-UNCHANGED.
- Duyệt lại một lần, bấm truyền một lần: chuỗi hiện có gửi lần lượt các tờ `awaitingContent` (RECALLED → IDA/EDA, AMEND_RECALLED → IDA01/EDA01) theo thứ tự tờ; tờ còn hiệu lực giữ nguyên, không gửi.
- TK_FIC tờ ≥ 2 vẫn là số tờ khai tờ 1 (kể cả khi chỉ gọi về tờ 2).

## 3. Chỉ tiêu 1.51 / 2.42 – Tổng hệ số phân bổ trị giá (D5, D6)

- Chỉ áp dụng lô nhiều tờ (`of > 1`); lô một tờ để trống như hiện nay.
- Công thức (Decimal, nguyên tệ hóa đơn):
  `1.51 = Σ trị giá dòng hàng cả lô + Σ_k (± số tiền khoản k × tỷ giá(tiền khoản k) / tỷ giá(tiền hóa đơn))`
  với khoản k là mọi khoản trên tờ khai: cước vận chuyển, phí bảo hiểm, khoản điều chỉnh 1.49 (AD cộng, SB trừ) – cùng danh sách khoản mà `allocateCustomsValue` dùng. Tỷ giá: tỷ giá đã dùng khi dựng (`Adjustment.rate`), không có thì bảng tỷ giá của tờ khai. Làm tròn ROUND_HALF_UP về số chữ số thập phân FPT cho phép ở TK_TP (kế hoạch tra đặc tả trường; mặc định 4), bỏ số 0 thừa.
- Tính **một lần ở module declaration** khi dựng tờ khai (nơi có tỷ giá), lưu thành chỉ tiêu `TK_TP` nguồn SYSTEM kèm ghi chú diễn giải ("Hàng … + cước … + BH … ± điều chỉnh …, quy đổi theo tỷ giá …"). Mọi tờ đọc cùng giá trị → giống hệt nhau.
- Thiếu tỷ giá của một khoản → không tính, BLOCKER "1.51: chưa có tỷ giá {tiền} của khoản {tên}".
- Người khai sửa tay (USER) → giữ giá trị người khai; luật mới **R-ALLOC-TOTAL-MISMATCH** (WARNING): giá trị USER khác giá trị tính.
- `branchPayload` dùng `TK_TP` lưu trên tờ khai; không còn tự tính bằng `invoiceTotal` (tờ khai cũ chưa có `TK_TP` → BLOCKER "dựng lại tờ khai để tính 1.51"). 1.49 ô 5 `KTG_VT` = 1.51 như cũ.
- Áp dụng cả EDA 2.42 (cùng công thức; tờ khai xuất thường không có khoản điều chỉnh → bằng tổng trị giá hàng).

## 4. Ba ngôn ngữ, tài liệu, mock
- Mọi chữ mới (nút, hộp xác nhận, banner, "Đang gọi về k/n tờ", reason code `SHEET_ORDER_DECLARE`, câu `SHEET_ORDER` sửa, hai luật mới) có vi/en/zh.
- Mock (`mocks/customs-sim.ts`, `mocks/api/*`) chạy cùng quy tắc (dùng hàm contracts chung): chuỗi khai chính thức, gọi về tất cả, tự mở lại, phạm vi sửa.
- Cập nhật `docs/QUY-TRINH-NGHIEP-VU.md` §9.3 (thứ tự IDC, gọi về theo phạm vi, 1.51, hai luật mới) và `docs/PRODUCT.md`.

## 5. Kiểm thử
- Contracts (thuần): `sheetOrderWait` cho IDC/IDE (tờ trước NOT_SENT/RECALLED/AMEND_RECALLED chờ; PRE_DECLARED/DECLARED/CLEARED/REJECTED không chờ); `declarationEditScope` đủ ma trận (lô 1 tờ = như cũ; gọi về tờ 2/3; gọi về tất cả; trộn RECALLED + AMEND_RECALLED; tờ 1 đã thông quan).
- Core:
  - IDC tờ 2 khi tờ 1 RECALLED → `SHEET_ORDER_DECLARE`, không tạo outbox; khi tờ 1 PRE_DECLARED → gửi.
  - `declareAllSheets`: 3 tờ PRE_DECLARED → IDC 1 → 2 → 3; lỗi tờ 2 dừng; bấm lại chỉ gửi tờ chưa khai; bấm hai lần không trùng.
  - `recallAllSheets`: tờ trộn PRE_DECLARED/DECLARED → IDB/IDD đúng tờ, đúng thứ tự; tờ đã thông quan bỏ qua; một tờ không gọi về được → từ chối cả lần.
  - Tự mở lại sau lệnh gọi về cuối cùng; không mở lại khi còn lệnh đang chờ.
  - Guard sửa: sửa chỉ tiêu chung khi chỉ gọi về tờ 2 → từ chối; sửa ô dòng tờ 2 → được; sửa ô dòng tờ 1 → từ chối; thêm/xóa dòng → từ chối; saveValueCharges → từ chối.
  - R-SENT-SHEETS-UNCHANGED: đổi chỉ tiêu chung/dòng tờ còn hiệu lực qua đường không có guard → FAIL, chặn truyền; đổi trị giá dòng tờ 2 làm đổi 1.51 → FAIL.
  - 1.51: hàng + cước + BH + AD − SB, khác tiền tệ quy đổi đúng; thiếu tỷ giá → BLOCKER; USER giữ + WARNING; mọi tờ cùng giá trị; KTG_VT = 1.51; lô 1 tờ không điền.
  - Lô một tờ: thông điệp FPT và luồng gọi về/mở lại giống hệt trước.
- Web: hộp gọi về hai lựa chọn; chuyển về Review sau gọi về; form khóa chỉ tiêu chung + dòng tờ khóa; nút "Khai chính thức tất cả"; "Chờ tờ j" ở IDC; axe a11y. Kiểm bằng trình duyệt thật trên `dos_028` (sáng + tối, desktop + mobile).
- Integration (testcontainers): cột/JSON `raw.sent` lưu và đọc đúng theo nhánh.

## Ngoài phạm vi
- Sửa sau thông quan (AMA) giữ nguyên theo từng tờ (Q8 spec trước).
- Đổi số tờ sau khi đã có số (R-BRANCH-COUNT-LOCKED giữ nguyên).
- Tồn đọng: tờ 1 có số rồi bị REJECTED (các tờ sau dùng lại số đó ở TK_FIC) – không xử lý ở đây.
