# Khai HYS (hồ sơ đính kèm điện tử) trước IDA/EDA – điền số vào 1.63 / 2.53

Nhánh: `feat/khai-hys-truoc-ida` (từ `main`). Tham chiếu: màn "HYS – Khai báo tập tin đính kèm" của FPT.VNACCS (ảnh người dùng gửi 2026-10-26), đặc tả `VNACCS_HYS v1.2` (đã chép vào `packages/contracts/src/fpt/hys.ts`).

## Bối cảnh

- Hiện nay HYS là nghiệp vụ "phụ" của từng tờ khai, **chỉ mở sau khi có số tờ khai** (`customs-flow.ts`: `row("HYS", hasDeclarationNumber(...))`), gửi **toàn bộ** chứng từ của hồ sơ (`perform-operation.ts`), mã thủ tục cứng `A99` (`fpt-vnaccs-gateway.ts`), không điền số tiếp nhận vào tờ khai.
- Nghiệp vụ thật: HYS là nghiệp vụ độc lập (màn FPT không có ô số tờ khai). Người khai gửi bộ file kèm **mã phân loại thủ tục** (bảng A546: A01 tờ khai trị giá, A02 danh sách container…), Hải quan trả **số tiếp nhận** (TK_JNO, 12 ký tự) + ngày; số này được ghi vào chỉ tiêu **1.63 (IDA) / 2.53 (EDA) "Số đính kèm khai báo điện tử"** – tối đa 3 cặp (TK_EA{n} = mã phân loại, TK_EB{n} = số đính kèm) – trước khi khai IDA/EDA.

## Quyết định với người dùng (2026-10-26)

| # | Câu hỏi | Quyết định |
|---|---|---|
| H1 | Khi nào tờ khai cần HYS | Hệ thống **gợi ý** (luật §5); chỉ **cảnh báo**, không bắt buộc. |
| H2 | Không khai HYS dù có gợi ý | Được, nhưng khi khai IDA/EDA phải **xác nhận** "Vẫn khai, không cần HYS"; xác nhận được ghi lại. |
| H3 | Lô nhiều tờ (> 50 dòng) | **Một bộ HYS áp cho cả lô** – không chọn tờ. Lý do: 1.63/2.53 là **thông tin chung** (một bộ `fields` mỗi hồ sơ, `branchPayload` chép thông tin chung sang mọi tờ) nên giống nhau trên mọi tờ. (Người dùng chọn phương án A, thay cho "bỏ chọn được từng tờ" ban đầu.) |
| H4 | Nguồn file | Chọn từ **chứng từ trong hồ sơ** + **upload file riêng cho HYS** (không qua AI). Tự sinh file (Excel container, tờ khai trị giá) để đợt sau. |
| H5 | Sau khi có số tờ khai | Giữ cả hai cách dùng: **lô còn sửa được** (chưa khai, hoặc đã gọi về tất cả tờ) → điền 1.63/2.53; ngược lại → chỉ ghi lịch sử (HYS bổ sung khi luồng vàng/đỏ) + nhắc "Gọi về tất cả tờ để điền số HYS vào 1.63". |
| H6 | Điền 1.63 khi tờ khai đã duyệt, chưa truyền | **Giữ trạng thái đã duyệt** (1.63 không ảnh hưởng thuế/HS/luật chặn); màn Review ghi rõ "điền sau khi duyệt". |
| H7 | Kiến trúc | **Bộ HYS là đối tượng riêng gắn hồ sơ** (bảng mới), không phải nghiệp vụ lặp theo từng tờ. |
| H8 | Luật gợi ý | G1–G5 ở §5. IDA có container → gợi ý A02 ("thường phải khai, ai bỏ qua thì bỏ qua"). Không gợi ý A06 (bảo lãnh chung), A03. |

Thuật ngữ:
- **Bộ HYS**: một lần khai HYS = một mã thủ tục + danh sách file, áp cho cả lô.
- **Lô còn sửa được**: tờ khai hiện hành của hồ sơ ở trạng thái `DRAFT` hoặc `APPROVED`, **mọi** tờ của lô chưa có kết quả truyền hoặc đang chờ gửi lại nội dung (`awaitingContent`: NOT_SENT / RECALLED / AMEND_RECALLED), và không có outbox nội dung (`isContentOperation`) đang PENDING. Gọi về một phần (D4 của spec tách tờ) khóa thông tin chung → **không** còn sửa được.
- **Cặp 1.63**: (TK_EA{n}, TK_EB{n}), n = 1..3 (EDA: 2.53, cùng tên trường). Lưu trong `declarations.fields` dưới tên trường VNACCS (ô bổ sung, `isExtraFieldKey`).

## Quyết định kỹ thuật (dò code 2026-10-26)

| # | Vấn đề trong code hiện có | Quyết định |
|---|---|---|
| K1 | `processOutbox` đòi dòng `customs_results` (lỗi "Chưa có kết quả truyền") – trước IDA chưa có | Nhánh HYS mới tách ra **trước** bước tra kết quả; không đọc/ghi `customs_results`. |
| K2 | Outbox HYS PENDING bị tính là nghiệp vụ đang chờ của tờ (`pendingOps` trong `_customs-view.ts`, `declareAllSheets`) → khóa IDA | Loại `operation = 'HYS'` khỏi các phép kiểm "đang chờ" của tờ khai. |
| K3 | `field_audit` không có nguồn `SYSTEM` | Thêm nguồn audit `HYS_FILL` (union TypeScript ở extraction + declaration `AuditWriter`; cột `source` không có CHECK). Nguồn giá trị ô (`ValueSource`) = `SYSTEM`. |
| K4 | `customs_messages.direction` chỉ `OUT`/`IN` | Thêm `NOTE` (contract `CustomsMessageSchema` + `MessageRow`) cho xác nhận bỏ qua gợi ý. |
| K5 | Thân lỗi web bỏ `details`; `params` là `Record<string, string\|number>` | `HYS_SUGGESTED` mang `params.codes` = "A02, A01"; giao diện lấy danh sách gợi ý đầy đủ từ `GET …/hys`. |
| K6 | Quy ước khóa lưu file `orgs/<orgId>/dossiers/<dossierId>/…` | File riêng HYS: `orgs/<orgId>/dossiers/<dossierId>/hys/<submissionId>/<fileId>-<tên>`. |
| K7 | `attachDocuments` không nhận mã thủ tục/thông tin chung, không trả ngày | Đổi chữ ký cổng sang request đầy đủ (§2.2) và trả `{ receiptNo?, registeredOn?, errors? }`. |
| K8 | Lần khai IDA đầu đi qua `submitDeclaration` (không phải `performOperation`) | `hysWaived` thêm vào cả `SubmitDeclarationInputSchema` và `PerformOperationInputSchema`. |
| K9 | @kb/ui không có `Sheet` | Form dùng `Dialog` `presentation="panel"`; file dùng `FileDropzone`; dung lượng dùng `Progress`. |
| K10 | 1.47 ô 1 (`KTG_FR1`) hiện luôn "A" | Giữ điều kiện "1.47 = D" trong G3 (rẻ, đúng khi sau này cho chọn mã cước); test bằng dữ liệu dựng tay. |

## 1. Dữ liệu

### 1.1 Bảng `hys_submissions` (core, `db/schema/integration.ts`)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | text PK | `hys_…` |
| `org_id` | text, RLS | bất biến 1 |
| `dossier_id` | text FK dossiers (cascade) | |
| `seq` | int | thứ tự trong hồ sơ; unique (`dossier_id`, `seq`) |
| `procedure_code` | text | A546 (`HysProcedureCode`) → TK_TSB |
| `customs_office` | text | TK_CH – điền sẵn từ tờ khai |
| `processing_unit` | text | TK_CHB – điền sẵn từ tờ khai |
| `phone` | text null | TK_STL (≤ 20) |
| `internal_ref` | text null | TK_REF (≤ 20) – mặc định mã hồ sơ |
| `note` | text null | TK_KJJ (≤ 332) |
| `purpose` | text null | `PRE_DECLARATION` \| `SUPPLEMENT` – xác định lúc gửi (§2.2) |
| `status` | text | `DRAFT` \| `SENDING` \| `ACCEPTED` \| `REJECTED` \| `SEND_FAILED` (check) |
| `attempt` | int | số lần gửi (0 khi nháp) |
| `receipt_no` | text null | TK_JNO (string – bất biến 2) |
| `registered_on` | date null | TK_YMD (`YYYY-MM-DD`) |
| `reject` | jsonb null | `{ code, message, solution? }[]` của Hải quan / lỗi gửi |
| `fill` | jsonb null | kết quả điền 1.63: `{ outcome: "FILLED" \| "ALREADY" \| "FULL" \| "REPLACED" \| "LOCKED" \| "NO_RECEIPT", slot?: 1\|2\|3, replaced?: { code, receipt }, afterApproval?: boolean }` (REPLACED: cặp cũ bị thay) |
| `sent_by`, `sent_at` | text null, timestamptz null | người bấm gửi |
| `created_at`, `updated_at` | | |

### 1.2 Bảng `hys_submission_files`

| Cột | Ghi chú |
|---|---|
| `id`, `org_id` (RLS), `submission_id` (FK, cascade) | |
| `document_id` text null | file chọn từ chứng từ hồ sơ |
| `storage_key`, `file_name`, `mime`, `size_bytes` | với file chọn từ hồ sơ: chép từ `documents` lúc thêm; với file riêng: khóa K6 |
| `position` int | thứ tự trong LIST_FILE |

File upload riêng **không** vào bảng `documents` (không chạy AI, không ghi `usage_events`). File riêng bị xóa khỏi bộ → xóa object trong kho.

### 1.3 Bảng sẵn có

- `customs_outbox`: mỗi lần gửi một bộ = một dòng `operation = 'HYS'`, `branch = 1`, `declaration_id` = tờ khai hiện hành; payload `{ submissionId }`; khóa `hys:<submissionId>:n<attempt>`; gửi lại sau `SEND_FAILED` = `attempt + 1` (kiểm đã có số trước khi gửi lại – §2.3).
- `customs_messages`: chiều đi/về như các nghiệp vụ khác (`operation = 'HYS'`, `branch = 1`, summary có mã thủ tục + số tiếp nhận); xác nhận bỏ qua gợi ý: `direction = 'NOTE'` (K4).
- `declarations.fields`: điền TK_EA{n}/TK_EB{n} (`source: "SYSTEM"`, `note: "HYS <seq> – <receipt_no>"`); `field_audit` nguồn `HYS_FILL` (K3).

## 2. Luồng nghiệp vụ

### 2.1 Soạn (DRAFT)
- Tạo bộ: từ thẻ HYS hoặc nút "Khai HYS" của một gợi ý (điền sẵn mã thủ tục). `customs_office`/`processing_unit` lấy từ tờ khai hiện hành, `internal_ref` = mã hồ sơ (cắt 20 ký tự).
- Sửa/xóa được khi `DRAFT`, `REJECTED`, `SEND_FAILED`. `SENDING`/`ACCEPTED`: không sửa, không xóa (muốn đổi thì khai bộ mới).
- Kiểm tra (code thuần, `contracts`, `checkHysSubmission`): đuôi file thuộc `HYS_ALLOWED_EXTENSIONS` = txt, doc, docx, docm, xml, xls, xlsx, xlsm, csv, jpg, jpeg, gif, tif, tiff, bmp, pdf, htm, html (không phân biệt hoa thường); tổng dung lượng ≤ 2 MB (2 × 1024 × 1024 byte); ≥ 1 file; có mã thủ tục, cơ quan Hải quan (nhóm xử lý hồ sơ TK_CHB không bắt buộc – §10); độ dài theo `HYS_REQUEST_ROWS`. Khi lưu: cho lưu, trả danh sách vấn đề; khi gửi: còn vấn đề → chặn.

### 2.2 Gửi
- Use case `sendHysSubmission`: quyền như khai IDA; kiểm §2.1; có chứng thư số (`certificateId` người khai chọn, như IDA); bộ ở `DRAFT`/`REJECTED`. **Không** đòi tờ khai đã duyệt / HS xác nhận / không BLOCKER.
- `purpose`: lô còn sửa được → `PRE_DECLARATION`; ngược lại `SUPPLEMENT`.
- Một giao dịch: `attempt + 1`, `SENDING`, tạo outbox (outbox pattern, ADR 0005), xếp job `customs-send`. Worker (`processOutbox`, nhánh HYS – K1) đọc bộ + file (bytes từ `storage_key`), gọi `gateway.attachDocuments(orgId, request, key)` với `request = { customsOffice, processingUnit, procedureCode, phone, internalRef, note, files: {name, bytes}[], certificateId }`.
- Giao diện xác nhận trước khi gửi (gửi ra ngoài).

### 2.3 Kết quả (cổng FPT trả đồng bộ)
- **Thành công có số**: `ACCEPTED`, lưu `receipt_no`, `registered_on`, ghi `customs_messages` IN. Rồi:
  - Lô còn sửa được **và** `purpose = PRE_DECLARATION` → điền qua port `DeclarationReader.fillAttachment(ctx, dossierId, { procedureCode, receiptNo, note })` (use case declaration mới, cho phép `DRAFT`/`APPROVED`, **giữ nguyên trạng thái**) dùng `fillAttachmentSlot` (§2.4); `fill.afterApproval = true` khi tờ khai đang `APPROVED`.
  - Ngược lại → không sửa tờ khai; `fill.outcome = "LOCKED"`.
- **Thành công không có số**: `ACCEPTED`, `fill.outcome = "NO_RECEIPT"`; cảnh báo "Chưa nhận được số tiếp nhận – nhập tay vào 1.63".
- **Hải quan từ chối** (gateway trả `errors`): `REJECTED`, lưu `reject`, outbox `SENT`, message IN ERROR. Sửa rồi gửi lại.
- **Lỗi gửi** (ngoại lệ tạm thời): BullMQ thử lại; hết lượt (`markOutboxFailed`) hoặc lỗi vĩnh viễn (DomainError, không đọc được file – nêu tên file) → `SEND_FAILED`, lưu `reject`. Gửi lại = `sendHysSubmission` (cho phép từ `SEND_FAILED`) – trước khi gửi, nếu bộ đã có `receipt_no` thì không gửi, chỉ chuyển `ACCEPTED`.

### 2.4 Điền cặp 1.63 / 2.53 – `fillAttachmentSlot(values, procedureCode, receiptNo, replaceSlot?)`
Hàm thuần (`contracts`). `values` = `{ TK_EA1..3, TK_EB1..3 }` (chuỗi, có thể rỗng). Trả `{ outcome: "FILLED" | "ALREADY" | "FULL" | "REPLACED", slot?, set?, replaced? }`:
1. Có cặp n với TK_EB{n} = `receiptNo` → `ALREADY`, `slot = n`.
2. Cặp trống đầu tiên (TK_EB{n} trống sau trim), n = 1 → 3 → `FILLED`, `slot = n`, `set = { TK_EA{n}: procedureCode, TK_EB{n}: receiptNo }`.
3. Hết chỗ, có `replaceSlot` (người khai chọn khi gửi) → `REPLACED`, `slot = replaceSlot`, `set` = cặp mới, `replaced = { code, receipt }` (giá trị cũ); `field_audit` nguồn `HYS_FILL` ghi cũ → mới như khi điền.
4. Hết chỗ, không có `replaceSlot` → `FULL`; thẻ HYS báo "Ô 1.63 đã đủ 3 số đính kèm – số này chưa được điền".

`attachmentPairs(values)` (contracts) = các cặp có TK_EB khác rỗng `{ slot, code, receipt }`; `getHysOverview` trả thành `attachmentSlots`.

**Đủ 3 cặp khi gửi bộ mới (bổ sung 2026-10-26)**: lô còn sửa được mà 1.63/2.53 đã đủ 3 cặp có số (HYS điền hoặc nhập tay) → `sendHysSubmission` bắt buộc `replaceSlot` (1/2/3); thiếu → `VALIDATION` reason `HYS_SLOTS_FULL` (param `field` = "1.63"/"2.53"), không tạo outbox. `replaceSlot` đi trong payload outbox `{ submissionId, certificateId, replaceSlot }` (không thêm cột DB; parse Zod `HysOutboxPayloadSchema`), worker truyền vào `DeclarationReader.fillAttachment`. Lúc nhận số mà còn cặp trống thì vẫn điền cặp trống (`replaceSlot` bỏ qua). Lô không còn sửa được (`SUPPLEMENT`/LOCKED): không hỏi, không đụng 1.63. Bộ HYS cũ có số bị thay vẫn ở danh sách (Hải quan đã ghi nhận, không xóa được), kèm ghi chú "Không còn trong ô 1.63".

Người khai vẫn sửa tay 1.63 như hiện nay.

### 2.5 Bỏ HYS cũ
- `customs-flow`: bỏ `row("HYS", …)` khỏi các nghiệp vụ theo tờ, bỏ gợi ý HYS ở `nextCustomsOperation`, bỏ "HYS" khỏi `operationsFor`. `CustomsOperationSchema` **giữ** "HYS" (lịch sử outbox/messages).
- `performOperation` từ chối `op = "HYS"` (reason `HYS_USE_SUBMISSION`); bỏ nhánh gửi toàn bộ chứng từ. `resendOperation` bỏ nhánh HYS.
- Luồng vàng/đỏ: thẻ HYS hiện nhắc "Khai HYS bổ sung theo yêu cầu của Hải quan".
- Mock web: bỏ HYS khỏi dòng nghiệp vụ theo tờ, giữ lịch sử mẫu.

## 3. Màn hình (apps/web)

### 3.1 Thẻ "Hồ sơ đính kèm (HYS)" – bước Khai báo Hải quan, trên danh sách tờ / nút IDA-EDA
- Danh sách bộ: mã + tên thủ tục, số file + dung lượng, nhãn trạng thái, số tiếp nhận + ngày, kết quả điền 1.63 (`fill`).
- Gợi ý chưa khai (§5): mỗi gợi ý một dòng (mã, lý do) + nút "Khai HYS".
- Bộ bị từ chối / lỗi gửi: mã lỗi, nội dung, hướng xử lý.
- Luồng vàng/đỏ: dòng nhắc khai HYS bổ sung.

### 3.2 Form HYS (`Dialog` `presentation="panel"`)
- Thông tin chung: cơ quan Hải quan, nhóm xử lý hồ sơ (CodeInput như tờ khai, không bắt buộc), phân loại thủ tục (chọn A546, hiện tên), số điện thoại, số quản lý nội bộ, ghi chú.
- File: danh sách chứng từ hồ sơ để tick + `FileDropzone` "Tải file lên"; `Progress` "x / 2 MB" (vượt → tone danger); ghi chú các đuôi được nhận.
- Nút: Lưu nháp · Gửi HYS (Dialog xác nhận, chọn chứng thư số như IDA) · Xóa (DRAFT/REJECTED/SEND_FAILED).
- Lô còn sửa được và 1.63/2.53 đã đủ 3 cặp: hộp xác nhận gửi hiện `Alert` cảnh báo "Ô 1.63 đã đủ 3 số đính kèm" + `RadioGroup` "Cặp n: {mã} / {số}" (kèm tên thủ tục) – bắt buộc chọn cặp sẽ bị thay, chưa chọn thì nút "Ký số và gửi" khóa. Thẻ HYS (§3.1) cảnh báo trước "khi gửi bộ mới sẽ phải chọn 1 cặp để thay"; bộ thay cặp hiện "Đã thay cặp {n} ({mã cũ} / {số cũ}) bằng số {số}"; bộ bị thay ghi "Không còn trong ô 1.63".

### 3.3 Xác nhận khai IDA/EDA khi còn gợi ý chưa khai (H2)
- Áp dụng: lần khai IDA/EDA đầu (`submitDeclaration`) và khai lại IDA/EDA sau gọi về (`performOperation` op IDA/EDA). Không áp dụng IDC/EDC, gọi về, IDA01/EDA01, AMA, tờ 2..N do chuỗi nối tiếp của worker.
- Backend: còn gợi ý chưa khai (§5) và không có `hysWaived: true` → lỗi `HYS_SUGGESTED` (params `codes`), không tạo outbox. Có cờ → gửi + ghi `customs_messages` NOTE "Người khai xác nhận không khai HYS: {codes}" + `orgAudit` nếu có.
- Giao diện: nhận `HYS_SUGGESTED` → Dialog "Tờ khai này nên có hồ sơ đính kèm HYS" (danh sách gợi ý + lý do từ `GET …/hys`) với **Khai HYS trước** (mở form, mã điền sẵn) / **Vẫn khai, không cần HYS** (gọi lại với `hysWaived: true`).

### 3.4 Review và form tờ khai
- Ô 1.63/2.53 do HYS điền: nhãn nguồn "Hệ thống" (`ValueSource SYSTEM`) + ghi chú ô "HYS <seq> – <số>"; thêm "(điền sau khi duyệt)" khi `afterApproval`.

### 3.5 Chung
- vi/en/zh đủ 3 bản (bất biến 12) – tên mã thủ tục A01… có bản dịch.
- Chỉ dùng `@kb/ui`.
- Chế độ dữ liệu mock (`NEXT_PUBLIC_DATA_SOURCE=mock`): đủ danh sách, gợi ý, form, gửi (giả lập số tiếp nhận), điền 1.63, hộp xác nhận.

## 4. API (apps/web, mỏng)

| Route | Use case |
|---|---|
| `GET /api/dossiers/[id]/hys` | `getHysOverview` – bộ HYS + file + gợi ý chưa khai + `lotEditable` |
| `POST /api/dossiers/[id]/hys` | `createHysSubmission` |
| `PATCH /api/dossiers/[id]/hys/[hysId]` | `updateHysSubmission` (thông tin chung + `documentIds`) |
| `DELETE /api/dossiers/[id]/hys/[hysId]` | `deleteHysSubmission` |
| `POST /api/dossiers/[id]/hys/[hysId]/files` | `addHysUploadedFiles` (multipart) |
| `DELETE /api/dossiers/[id]/hys/[hysId]/files/[fileId]` | `removeHysFile` |
| `POST /api/dossiers/[id]/hys/[hysId]/send` | `sendHysSubmission` (`{ certificateId }`) |
| (sẵn có) `POST …/submission`, `POST …/submission/operations` | thêm `hysWaived?: boolean` (K8) |

Mọi body/response có Zod schema trong `packages/contracts` (bất biến 9).

## 5. Luật gợi ý HYS – `suggestHys(kind, values, satisfied)` (contracts, code thuần)

Chạy **một lần cho cả lô** trên thông tin chung (`values` = `declarationFormValues(kind, fields)`, tên VNACCS). Trả `{ code: HysProcedureCode, rule: "G1"…"G5", fieldNo: string }[]` (lý do hiển thị = i18n theo `rule`).

| # | Áp dụng | Điều kiện | Gợi ý |
|---|---|---|---|
| G1 | IDA | 1.35 `VD_COC` > 0 | A02 – danh sách container |
| G1 | EDA | số ô container `CON_C01..` khác rỗng > 50, hoặc tổng số container của lô > 50 | A02 – danh sách container |
| G2 | IDA, EDA | `TK_IV1` = B (bảng kê, nhiều hóa đơn) | A99 – danh sách hóa đơn |
| G3 | IDA | `KTG_VD1` có giá trị và ∉ {6, 7}, **hoặc** `KTG_FR1` = D | A01 – tờ khai trị giá |
| G4 | IDA (1.58), EDA (2.48) | `TK_ENC` = A (bảo lãnh riêng) | A08 – chứng thư bảo lãnh riêng |
| G5 | IDA (1.68), EDA (2.57) | `TK_NT2` dài hơn `maxLen` của chỉ tiêu ghi chú trong catalog | A99 – phần ghi chú còn lại |

- Mã được coi là **đã khai** (`satisfied`) chỉ khi số tiếp nhận thật sự đã vào 1.63/2.53: 1.63/2.53 có cặp cùng mã và TK_EB khác rỗng (HYS đã điền, hoặc khai ngoài phần mềm và nhập tay); **hoặc** có bộ HYS cùng mã ở `ACCEPTED` với kết quả điền `FILLED`/`ALREADY`/`REPLACED`. Bộ `SENDING`, hay `ACCEPTED` mà `LOCKED`/`FULL`/`NO_RECEIPT`, **chưa** tính là đã khai → vẫn hiện hộp xác nhận bỏ qua thông thường (không chặn cứng). Lý do: khai IDA khi HYS còn đang gửi thì thông điệp IDA dựng không có số tiếp nhận. G2 và G5 cùng mã A99: một A99 đã khai thỏa cả hai.
- `VALUATION_CODES_WITHOUT_A01 = ["6", "7"]` là hằng số riêng (căn cứ TT39/2015 sửa đổi TT60/2019 – chưa đối chiếu văn bản; chỉ là gợi ý).
- Không có luật cho A03, A06 và các mã khác.

## 6. Xử lý lỗi (tóm tắt)

| Tình huống | Xử lý |
|---|---|
| > 2 MB / sai đuôi / không file / thiếu mã thủ tục | Chặn khi gửi, nêu rõ file / số byte vượt; không tạo outbox |
| File mất khi worker gửi | `SEND_FAILED`, nêu tên file; bỏ file rồi gửi lại |
| Hải quan từ chối | `REJECTED` + mã/nội dung/hướng xử lý; sửa → gửi lại (khóa mới) |
| Lỗi mạng / cổng | Thử lại tự động; hết lượt → `SEND_FAILED` + "Gửi lại" (đã có số thì không gửi) |
| Thành công không có số | `ACCEPTED`, `NO_RECEIPT`, cảnh báo nhập tay |
| 1.63 đủ 3 cặp, lô còn sửa được | Gửi bắt chọn cặp bị thay (thiếu → `HYS_SLOTS_FULL`, không outbox); nhận số → `REPLACED` cặp đã chọn, audit cũ → mới; bộ cũ ghi "Không còn trong ô 1.63" |
| Nhận số mà đủ 3 cặp, không có cặp chọn trước (vd gửi khi chưa đủ) | `FULL`, không ghi đè, cảnh báo |
| Lô không còn sửa được (đang truyền, đã khai, gọi về một phần) | `LOCKED`, chỉ ghi lịch sử, không tự điền; nhắc gọi về tất cả tờ rồi nhập tay số tiếp nhận vào 1.63/2.53 |
| Bấm gửi hai lần | Khóa idempotency outbox → một lần gửi |
| Người khác tổ chức | RLS + `orgId` → không thấy |

## 7. Giả lập

- `apps/fpt-mock` `/api/HYS`: đã kiểm TK_CH, TK_TSB, có file, < 2 MB; thêm: đuôi file ngoài danh sách → lỗi; ghi chú (`tK_KJJ`) chứa `REJECT` → lỗi nghiệp vụ.
- `FakeCustomsGateway` (test core): request mới; trả `receiptNo` 12 ký tự + `registeredOn`; giữ kịch bản lỗi lần đầu (`flakyHys`) và thêm `rejectHys`.
- Web mock: bộ HYS trong `mocks/db.ts` (tăng `DB_VERSION`), số tiếp nhận giả 12 số.

## 8. Test

- **contracts**: `checkHysSubmission` (đuôi hoa/thường, đúng 2 MB, vượt 1 byte, rỗng, thiếu mã); `fillAttachmentSlot` (trống đầu tiên, cặp 2 trống khi cặp 1 có, ALREADY, FULL, khoảng trắng); `suggestHys` từng luật + "đã khai" bằng bộ HYS và bằng nhập tay; Zod schema API.
- **core**: CRUD + RLS/`orgId`; gửi → outbox → worker → ACCEPTED → điền 1.63 + `field_audit` HYS_FILL; APPROVED giữ APPROVED + `afterApproval`; lô đã khai / gọi về một phần → LOCKED; REJECTED → gửi lại `n2`; SEND_FAILED → gửi lại (đã có số → không gửi); outbox HYS PENDING không khóa IDA; IDA còn gợi ý: không cờ → `HYS_SUGGESTED`, có cờ → gửi + NOTE; gợi ý đã khai → không hỏi; `performOperation("HYS")` bị từ chối; repo drizzle int test (cross-org).
- **web**: thẻ HYS, form, hộp xác nhận (axe); i18n 3 ngôn ngữ; reason codes.
- **Trình duyệt thật** (mock): tạo bộ A02 → gửi → 1.63 được điền → khai IDA không hỏi; xóa gợi ý-thỏa → khai IDA → hộp xác nhận → "Vẫn khai". Sáng + tối, desktop + mobile.

## 9. Ngoài phạm vi

- Tự sinh file theo mã thủ tục (Excel danh sách container, tờ khai trị giá).
- Luật A03, A06, các mã khác.
- 1.63 riêng từng tờ (phương án B – không làm).
- Đối chiếu khóa JSON HYS với mẫu phản hồi FPT thật (đặc tả `hys.ts` còn suy luận – cần mẫu thật trước production).
- Điền 1.63 khi khai sửa đổi sau thông quan (AMA).

## 10. Đối chiếu tài liệu VNACCS gốc (2026-10-26)

Nguồn (thư mục `docs/tailieuchitieukhaibao/HYS/`, chỉ có trên máy): `6001-1_HYS_Service Specification.docx` (đặc tả nghiệp vụ 6001 HYS v1.2), `6001-2_HYS_Input_Data_Element.xlsx` (chỉ tiêu nhập), một bản lưu kết quả HYS thật (PDF "Bản lưu thông tin tờ khai phổ thông" – có dữ liệu doanh nghiệp thật, không đưa vào repo).

| Điểm | Tài liệu VNACCS | Quyết định |
|---|---|---|
| Nhóm xử lý hồ sơ (CHB, `TK_CHB`) | **C** – có điều kiện: chỉ nhập khi được phân bộ phận khai đặc biệt / thủ tục thông quan | Không bắt buộc: bỏ lỗi `MISSING_UNIT`; vẫn điền sẵn từ tờ khai. Nhãn đổi thành "Nhóm xử lý hồ sơ" theo tài liệu |
| Cơ quan Hải quan (`TK_CH`) | **M**; phải là đơn vị đã đăng ký nhận loại thủ tục đó; hệ thống chọn công chức nhận theo CH + loại thủ tục | Giữ bắt buộc; không kiểm được đăng ký – Hải quan từ chối thì hiện lỗi trả về |
| Phân loại thủ tục (`TK_TSB`) | **M**, bảng mã A546 (và A559) | A546 khớp đủ 14 mã với `20.DM_KHAI_HYS_GANCODE`; A559 chưa có trong `docs/danhmuc` – chưa dùng |
| Ghi chú | ID gốc `KIJ` (Remarks, kiểu v, 332) | Đặc tả FPT (`VNACCS_HYS v1.2.xlsx`) ghi `TK_KJJ` – giữ theo FPT vì cổng FPT là nơi nhận; cần đối chiếu khi có mẫu phản hồi thật |
| Dung lượng | Tổng file **< 3 MB** (đặc tả 2013) | Giữ **≤ 2 MB** theo phần mềm FPT.VNACCS / đặc tả FPT (chặt hơn, an toàn) |
| File | Phải có file, đúng định dạng quy định; hệ thống không kiểm nội dung | Như §2.1 |
| Kết quả | Hệ thống cấp **số tiếp nhận khai báo phổ thông** (bản lưu in nhãn "Số tờ khai", 12 chữ số), kèm phân loại, tên thủ tục, cơ quan HQ, nhóm xử lý, ngày khai, tên/địa chỉ/điện thoại người khai | Khớp `TK_JNO` (12) + `TK_TNM`, `TK_YMD`, `TK_SNM`, `TK_SAD`; số này là giá trị điền vào ô 2 của 1.63/2.53 |
