# Khai HYS (hồ sơ đính kèm điện tử) trước IDA/EDA – điền số vào 1.63 / 2.53

Nhánh: `feat/khai-hys-truoc-ida` (từ `main`). Tham chiếu: màn "HYS – Khai báo tập tin đính kèm" của FPT.VNACCS (ảnh người dùng gửi 2026-10-26), đặc tả `VNACCS_HYS v1.2` (đã chép vào `packages/contracts/src/fpt/hys.ts`).

## Bối cảnh

- Hiện nay HYS là nghiệp vụ "phụ" của từng tờ khai, **chỉ mở sau khi có số tờ khai** (`customs-flow.ts`: `row("HYS", hasDeclarationNumber(...))`), gửi **toàn bộ** chứng từ của hồ sơ (`perform-operation.ts`), không có mã thủ tục (TK_TSB), không điền số tiếp nhận vào tờ khai.
- Nghiệp vụ thật: HYS là nghiệp vụ độc lập (màn FPT không có ô số tờ khai). Người khai gửi bộ file kèm **mã phân loại thủ tục** (bảng A546: A01 tờ khai trị giá, A02 danh sách container…), Hải quan trả **số tiếp nhận** (TK_JNO, 12 ký tự) + ngày; số này được ghi vào chỉ tiêu **1.63 (IDA) / 2.53 (EDA) "Số đính kèm khai báo điện tử"** – tối đa 3 cặp (TK_EA{n} = mã phân loại, TK_EB{n} = số đính kèm) – trước khi khai IDA/EDA.

## Quyết định với người dùng (2026-10-26)

| # | Câu hỏi | Quyết định |
|---|---|---|
| H1 | Khi nào tờ khai cần HYS | Hệ thống **gợi ý** (luật §5); chỉ **cảnh báo**, không bắt buộc. |
| H2 | Không khai HYS dù có gợi ý | Được, nhưng khi khai IDA/EDA phải **xác nhận** "Vẫn khai, không cần HYS"; xác nhận được ghi lại. |
| H3 | Lô nhiều tờ (> 50 dòng) | **Một bộ HYS dùng chung cả lô**, mặc định gắn mọi tờ, **bỏ chọn được** từng tờ. |
| H4 | Nguồn file | Chọn từ **chứng từ trong hồ sơ** + **upload file riêng cho HYS** (không qua AI). Tự sinh file (Excel container, tờ khai trị giá) để đợt sau. |
| H5 | Sau khi có số tờ khai | Giữ cả hai cách dùng: **trước IDA hoặc đang gọi về sửa** → điền 1.63/2.53; **đã khai chính thức** → chỉ ghi lịch sử (HYS bổ sung khi luồng vàng/đỏ). |
| H6 | Điền 1.63 khi tờ khai đã duyệt, chưa truyền | **Giữ trạng thái đã duyệt** (1.63 không ảnh hưởng thuế/HS/luật chặn); màn Review ghi rõ "điền sau khi duyệt". |
| H7 | Kiến trúc | **Bộ HYS là đối tượng riêng gắn hồ sơ** (bảng mới), không phải nghiệp vụ lặp theo từng tờ. |
| H8 | Luật gợi ý | G1–G5 ở §5. IDA có container → gợi ý A02 ("thường phải khai, ai bỏ qua thì bỏ qua"). Không gợi ý A06 (bảo lãnh chung), A03. |

Thuật ngữ:
- **Bộ HYS**: một lần khai HYS = một mã thủ tục + danh sách file + phạm vi tờ.
- **Tờ còn sửa được**: tờ khai chưa gửi nội dung lần nào hoặc đang chờ gửi lại nội dung (`awaitingContent`: NOT_SENT / RECALLED / AMEND_RECALLED) và không có outbox nội dung đang PENDING.
- **Cặp 1.63**: (TK_EA{n}, TK_EB{n}), n = 1..3 (EDA: 2.53, cùng tên trường).

## 1. Dữ liệu

### 1.1 Bảng `hys_submissions` (core, schema `integration`)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | text PK | `hys_…` |
| `org_id` | text, RLS | bất biến 1 |
| `dossier_id` | text FK dossiers | |
| `seq` | int | thứ tự trong hồ sơ; unique (`dossier_id`, `seq`) |
| `procedure_code` | text | A546 (`HysProcedureCode`) → TK_TSB |
| `customs_office` | text | TK_CH – điền sẵn từ tờ khai |
| `processing_unit` | text | TK_CHB – điền sẵn từ tờ khai |
| `phone` | text null | TK_STL (≤ 20) |
| `internal_ref` | text null | TK_REF (≤ 20) – mặc định mã hồ sơ |
| `note` | text null | TK_KJJ (≤ 332) |
| `target_branches` | jsonb `number[]` | tờ được gắn; mặc định mọi tờ của lô; ≥ 1 phần tử |
| `purpose` | text null | `PRE_DECLARATION` \| `SUPPLEMENT` – xác định lúc gửi (§2.2) |
| `status` | text | `DRAFT` \| `SENDING` \| `ACCEPTED` \| `REJECTED` \| `SEND_FAILED` (check) |
| `receipt_no` | text null | TK_JNO (string – bất biến 2) |
| `registered_on` | date null | TK_YMD (`YYYY-MM-DD`) |
| `reject` | jsonb null | `{ code, message, solution }` của Hải quan / lỗi gửi |
| `fill_report` | jsonb null | kết quả điền 1.63 theo tờ: `{ branch, outcome: "FILLED" \| "ALREADY" \| "FULL" \| "LOCKED" \| "NO_RECEIPT", slot? }[]` |
| `sent_by`, `sent_at` | | người bấm gửi |
| `created_at`, `updated_at` | | |

### 1.2 Bảng `hys_submission_files`

| Cột | Ghi chú |
|---|---|
| `id`, `org_id` (RLS), `submission_id` (FK, cascade) | |
| `document_id` text null | file chọn từ chứng từ hồ sơ |
| `storage_key`, `file_name`, `mime`, `size_bytes` | file upload riêng (null khi dùng `document_id`) |
| `position` int | thứ tự trong LIST_FILE |

Check: đúng một nguồn (`document_id` xor `storage_key`). File upload riêng **không** vào bảng `documents` (không chạy AI đọc/đối chiếu, không ghi `usage_events`). Lưu ở kho file hiện có (MinIO/S3) dưới tiền tố `org/<orgId>/dossier/<dossierId>/hys/`.

### 1.3 Bảng sẵn có

- `customs_outbox`: mỗi lần gửi một bộ = một dòng `operation = 'HYS'`; `declaration_id`/`branch` = tờ đầu tiên trong `target_branches` (cột bắt buộc); payload `{ submissionId, attempt, request, certificateId }`; khóa `hys:<submissionId>:n<attempt>` (gửi lại sau lỗi gửi: `:retry<k>` như cơ chế hiện có).
- `customs_messages`: ghi chiều đi/về như các nghiệp vụ khác (summary có mã thủ tục + số tiếp nhận) → hiện trong lịch sử hồ sơ.
- `declarations.fields`: điền TK_EA{n}/TK_EB{n}; **không** thêm cột. `field_audit` nguồn `SYSTEM`, ghi chú `HYS <seq> – <receipt_no>`.
- Xác nhận bỏ qua gợi ý (§3.3) ghi `customs_messages` (direction `NOTE`) + audit log hồ sơ.

## 2. Luồng nghiệp vụ

### 2.1 Soạn (DRAFT)
- Tạo bộ: từ thẻ HYS hoặc nút "Khai HYS" của một gợi ý (điền sẵn mã thủ tục). `customs_office`/`processing_unit` lấy từ tờ khai hiện hành của hồ sơ (tờ 1), `internal_ref` = mã hồ sơ.
- Sửa/xóa được khi `DRAFT`, `REJECTED`, `SEND_FAILED`. `SENDING`/`ACCEPTED`: không sửa, không xóa (muốn đổi thì khai bộ mới).
- Kiểm tra khi lưu và khi gửi (code thuần, `contracts`): đuôi file thuộc `HYS_ALLOWED_EXTENSIONS` = txt, doc, docx, docm, xml, xls, xlsx, xlsm, csv, jpg, jpeg, gif, tif, tiff, bmp, pdf, htm, html (không phân biệt hoa thường); tổng dung lượng ≤ 2 MB (2 × 1024 × 1024 byte); có ≥ 1 file; `target_branches` ≥ 1 tờ hợp lệ của lô; độ dài các ô theo `HYS_REQUEST_ROWS`. Khi lưu: cho lưu nháp nhưng trả danh sách lỗi; khi gửi: lỗi → chặn.

### 2.2 Gửi
- Use case `sendHysSubmission`: quyền như khai IDA; kiểm §2.1; có chứng thư số; không có outbox HYS của bộ này đang PENDING. **Không** đòi tờ khai đã duyệt / HS xác nhận / không BLOCKER (HYS không chứa nội dung tờ khai).
- `purpose`: có ≥ 1 tờ trong phạm vi **còn sửa được** → `PRE_DECLARATION`; ngược lại `SUPPLEMENT`.
- Tạo outbox + chuyển `SENDING` trong cùng giao dịch (outbox pattern, ADR 0005). Worker đọc file (từ `documents.storage_key` hoặc `storage_key` riêng), dựng request theo `HysRequestSchema` (LIST_FILE: FILE_NAME + FILE_BASE64), gửi qua `CustomsGateway`.
- Giao diện xác nhận trước khi gửi (gửi ra ngoài).

### 2.3 Kết quả
Cổng FPT trả kết quả đồng bộ trong phản hồi HYS (không cần hỏi lại).

- **Thành công có số**: `ACCEPTED`, lưu `receipt_no`, `registered_on`, ghi `customs_messages`. Với từng tờ trong `target_branches`:
  - Tờ **còn sửa được** → `fillAttachmentSlot` (§2.4) rồi ghi `fields` + `field_audit` (SYSTEM). Trạng thái tờ khai **giữ nguyên** (DRAFT vẫn DRAFT, APPROVED vẫn APPROVED – H6); ghi dấu `filledAfterApproval` trong `fill_report` khi tờ đang APPROVED.
  - Tờ **đang có outbox nội dung PENDING** (đang truyền IDA/IDA01) hoặc **đã khai chính thức** → không sửa tờ khai; `fill_report` = `LOCKED`.
- **Thành công không có số**: `ACCEPTED`, `fill_report` = `NO_RECEIPT` cho mọi tờ; cảnh báo "Chưa nhận được số tiếp nhận – nhập tay vào 1.63".
- **Hải quan từ chối** (lỗi nghiệp vụ E-…): `REJECTED`, lưu `reject`. Sửa rồi gửi lại → `attempt + 1`.
- **Lỗi gửi** (mạng, cổng bận): worker thử lại như các nghiệp vụ khác; hết lượt → `SEND_FAILED` + nút "Gửi lại" dùng cơ chế `resendOperation` (trước khi gửi lại kiểm đã có số tiếp nhận chưa – không gửi trùng).
- **Không đọc được file** khi worker gửi: lỗi vĩnh viễn → `SEND_FAILED`, `reject.message` nêu tên file.

### 2.4 Điền cặp 1.63 / 2.53 – `fillAttachmentSlot(fields, kind, procedureCode, receiptNo)`
Hàm thuần (`contracts`), trả `{ fields, outcome, slot? }`:
1. Có cặp n với TK_EB{n} = `receiptNo` → `ALREADY` (không đổi gì – gửi lại/xử lý lại không điền hai lần).
2. Cặp trống đầu tiên (TK_EB{n} trống), n = 1 → 3 → ghi TK_EA{n} = `procedureCode`, TK_EB{n} = `receiptNo` → `FILLED`.
3. Hết chỗ → `FULL` (không ghi đè); tờ đó hiện cảnh báo "1.63 đã đủ 3 số đính kèm – số HYS {receipt} ({code}) chưa được điền".

Người khai vẫn sửa tay 1.63 như hiện nay (`field_audit` nguồn USER).

### 2.5 Thay đổi với HYS cũ
- Bỏ HYS "phụ theo từng tờ" trong `customs-flow` (`row("HYS", …)`, `nextCustomsOperation` gợi ý HYS khi luồng vàng/đỏ) và nhánh `op === "HYS"` gửi toàn bộ chứng từ trong `perform-operation.ts` / `process-outbox.ts`; thay bằng bộ HYS. Luồng vàng/đỏ: gợi ý "Khai HYS bổ sung" trỏ tới thẻ HYS (bộ mới có `purpose = SUPPLEMENT`).
- Lịch sử `customs_messages` cũ có `operation = 'HYS'` vẫn hiển thị bình thường.

## 3. Màn hình (apps/web)

### 3.1 Thẻ "Hồ sơ đính kèm (HYS)" – bước Khai báo Hải quan, trên các nút IDA/EDA
- Danh sách bộ: mã + tên thủ tục, số file + dung lượng, tờ được gắn (lô nhiều tờ), nhãn trạng thái, số tiếp nhận + ngày; kết quả điền 1.63 theo tờ (`fill_report`).
- Gợi ý chưa khai (§5): mỗi gợi ý một dòng (mã, lý do, tờ) + nút "Khai HYS".
- Bộ bị từ chối / lỗi gửi: mã lỗi, nội dung, hướng xử lý (dùng cách hiển thị lỗi IDA hiện có `customs-errors`).
- Tab hồ sơ "Nghiệp vụ" (`dossier-tabs`) dẫn sang thẻ này như hiện nay.

### 3.2 Form HYS (Sheet bên phải)
Bố cục theo màn FPT:
- Thông tin chung: cơ quan Hải quan, bộ phận xử lý (CodeInput như tờ khai), phân loại thủ tục (chọn A546, hiện tên), số điện thoại, số quản lý nội bộ, ghi chú.
- Tờ được gắn: checkbox Tờ 1…N, mặc định chọn hết; ẩn khi lô một tờ.
- File: danh sách chứng từ hồ sơ để tick + nút "Tải file lên" (file riêng); thanh tổng dung lượng "x / 2 MB" (vượt → trạng thái lỗi); ghi chú các đuôi được nhận.
- Nút: Lưu nháp · Gửi HYS (Dialog xác nhận) · Xóa (DRAFT/REJECTED/SEND_FAILED).

### 3.3 Xác nhận khai IDA/EDA khi còn gợi ý chưa khai (H2)
- Áp dụng: khai tạm IDA/EDA (từng tờ hoặc "khai tạm tất cả"). Không áp dụng IDC/EDC, gọi về, IDA01/EDA01, AMA.
- Backend: `performOperation` / khai tạm cả lô nhận `hysWaived?: boolean`. Còn gợi ý chưa khai cho tờ được gửi và không có cờ → lỗi mềm reason `HYS_SUGGESTED` kèm `{ suggestions }` (không tạo outbox). Có cờ → gửi bình thường + ghi "Người khai {user} xác nhận không khai HYS: {mã…}" (customs_messages NOTE + audit).
- Giao diện: nhận `HYS_SUGGESTED` → Dialog "Tờ khai này nên có hồ sơ đính kèm HYS" (danh sách gợi ý + lý do) với hai nút **Khai HYS trước** (mở form, mã điền sẵn) / **Vẫn khai, không cần HYS** (gọi lại với `hysWaived: true`).
- Không hỏi lại trong cùng lần truyền (cùng phiên bản tờ khai) trừ khi phát sinh gợi ý mới (so tập mã đã xác nhận).

### 3.4 Review và form tờ khai
- Ô 1.63/2.53 do HYS điền: nhãn nguồn "HYS" (hệ thống `provenance` hiện có); thêm dòng "điền sau khi duyệt" khi `filledAfterApproval`.
- `FULL`: cảnh báo tại ô.

### 3.5 Chung
- vi/en/zh đủ 3 bản (bất biến 12) – mã thủ tục A01… hiển thị mã + tên đã dịch.
- Chỉ dùng `@kb/ui` (Card, Sheet, Dialog, Badge, Checkbox, thanh dung lượng – thiếu thì thêm vào `@kb/ui` theo skill `adding-ui-component`).
- Chế độ dữ liệu mock (`NEXT_PUBLIC_DATA_SOURCE=mock`): đủ danh sách, form, gửi (giả lập số tiếp nhận), điền 1.63, hộp xác nhận.

## 4. API (apps/web, mỏng)

| Route | Use case |
|---|---|
| `GET /api/dossiers/[id]/hys` | `listHysSubmissions` – bộ HYS + gợi ý chưa khai theo tờ |
| `POST /api/dossiers/[id]/hys` | `createHysSubmission` |
| `PATCH /api/dossiers/[id]/hys/[hysId]` | `updateHysSubmission` |
| `DELETE /api/dossiers/[id]/hys/[hysId]` | `deleteHysSubmission` |
| `POST /api/dossiers/[id]/hys/[hysId]/files` | upload file riêng (multipart, kiểm đuôi + kích thước) |
| `POST /api/dossiers/[id]/hys/[hysId]/send` | `sendHysSubmission` |
| `POST /api/dossiers/[id]/hys/[hysId]/resend` | gửi lại sau `SEND_FAILED` |
| (sẵn có) `POST …/submission/operations` | thêm `hysWaived` vào body (Zod) |

Mọi body/response có Zod schema trong `packages/contracts` (bất biến 9).

## 5. Luật gợi ý HYS – `suggestHys(sheet, kind, submissions)` (contracts, code thuần)

Chạy theo từng tờ, trả `{ code: HysProcedureCode, rule: "G1"…"G5", reason, fieldNo }[]`.

| # | Áp dụng | Điều kiện | Gợi ý |
|---|---|---|---|
| G1 | IDA | 1.35 Số lượng container > 0 | A02 – danh sách container |
| G1 | EDA | số container (2.60) > 50 | A02 – danh sách container (phần vượt 50 ô CON_C01..C50) |
| G2 | IDA, EDA | phân loại hình thức hóa đơn = B (bảng kê, nhiều hóa đơn) | A99 – danh sách hóa đơn |
| G3 | IDA | 1.45 Mã phân loại khai trị giá ∉ {6, 7} (có giá trị), **hoặc** 1.47 ô 1 = D | A01 – tờ khai trị giá |
| G4 | IDA (1.58), EDA (2.48) | Mã xác định thời hạn nộp thuế = A (bảo lãnh riêng) | A08 – chứng thư bảo lãnh riêng |
| G5 | IDA (1.68), EDA (2.57) | phần ghi chú vượt giới hạn ký tự (cảnh báo độ dài hiện có) | A99 – phần ghi chú còn lại |

- Một mã được coi là **đã khai** cho tờ k khi: có bộ HYS cùng mã, `SENDING` hoặc `ACCEPTED`, `target_branches` chứa k; **hoặc** 1.63/2.53 của tờ k có cặp cùng mã và TK_EB khác rỗng (khai HYS ngoài phần mềm, nhập tay).
- Danh sách mã của G3 đặt ở một hằng số (`VALUATION_CODES_WITHOUT_A01 = ["6", "7"]`) để chuyên viên chỉnh nhanh; căn cứ TT39/2015 sửa đổi TT60/2019 (chưa đối chiếu văn bản – chỉ là gợi ý, không chặn).
- Không có luật cho A03, A06 và các mã khác: người khai tự thêm.

## 6. Xử lý lỗi (tóm tắt)

| Tình huống | Xử lý |
|---|---|
| > 2 MB / sai đuôi / không file / không chọn tờ | Chặn khi gửi, nêu rõ file / số byte vượt; không tạo outbox |
| File mất khi worker gửi | `SEND_FAILED`, nêu tên file; bỏ file rồi gửi lại |
| Hải quan từ chối | `REJECTED` + mã/nội dung/hướng xử lý; sửa → gửi lại (khóa mới) |
| Lỗi mạng / cổng | Thử lại tự động; hết lượt → `SEND_FAILED` + "Gửi lại" (kiểm đã có số trước) |
| Thành công không có số | `ACCEPTED`, `NO_RECEIPT`, cảnh báo nhập tay |
| 1.63 đủ 3 cặp | `FULL`, không ghi đè, cảnh báo tại ô |
| Tờ đang truyền nội dung / đã khai chính thức | `LOCKED`, chỉ ghi lịch sử |
| Bấm gửi hai lần | Khóa idempotency outbox → một lần gửi |

## 7. Giả lập

- `apps/fpt-mock` `/api/HYS`: parse đủ trường v1.2 (TK_TSB bắt buộc); kiểm tổng 2 MB, đuôi file; trả TK_JNO 12 số + TK_YMD hôm nay; ghi chú (TK_KJJ) chứa `REJECT` → trả lỗi nghiệp vụ; giữ header `X-Mock-Assumed: 1`.
- `FakeCustomsGateway` (test core): nhận request mới; giữ kịch bản lỗi lần đầu theo hash để thử "Gửi lại".
- Web mock: kho localStorage cho bộ HYS, số tiếp nhận giả.

## 8. Test

- **contracts**: kiểm file (đuôi hoa/thường, đúng 2 MB, vượt 1 byte, rỗng); `fillAttachmentSlot` (trống đầu tiên, cặp 2 trống khi cặp 1 có, ALREADY, FULL, IDA/EDA); `suggestHys` từng luật + "đã khai" bằng bộ HYS và bằng nhập tay; mục đích PRE_DECLARATION/SUPPLEMENT; Zod schema API.
- **core** (use case, fake uow/gateway): CRUD + `orgId`; gửi → outbox → ACCEPTED → điền 1.63 tờ còn sửa được + `field_audit` SYSTEM; APPROVED giữ APPROVED; tờ đã khai chính thức → LOCKED; lô 3 tờ bỏ chọn tờ 2; REJECTED → gửi lại khóa `n2`; SEND_FAILED → resend; IDA còn gợi ý: không cờ → `HYS_SUGGESTED`, có cờ → gửi + ghi xác nhận; gợi ý đã khai → không hỏi.
- **web**: component thẻ HYS, form, hộp xác nhận (axe); i18n 3 ngôn ngữ; route Zod.
- **worker**: job HYS đọc file từ hai nguồn.
- **Trình duyệt thật** (mock): tạo bộ A02 → gửi → 1.63 được điền → khai IDA không hỏi; xóa bộ → khai IDA → hộp xác nhận → "Vẫn khai". Sáng + tối, desktop + mobile.

## 9. Ngoài phạm vi

- Tự sinh file theo mã thủ tục (Excel danh sách container, tờ khai trị giá).
- Luật A03, A06, các mã khác.
- Đối chiếu khóa JSON HYS với mẫu phản hồi FPT thật (đặc tả `hys.ts` còn suy luận – cần mẫu thật trước production).
- Sửa đổi 1.63 tự động khi khai sửa đổi sau thông quan (AMA).
