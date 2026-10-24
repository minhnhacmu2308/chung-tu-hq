# Tách tờ khai khi lô hàng trên 50 dòng hàng

Ngày: 2026-10-24 · Trạng thái: đã duyệt thiết kế, chờ duyệt spec · Liên quan: `docs/RA-SOAT-CHI-TIEU-TO-KHAI.md` (1.2/2.2 ❌), ADR 0005 (outbox Hải quan), `2026-10-15-luong-nghiep-vu-hai-quan-design.md`

## 1. Mục tiêu

Mỗi tờ khai VNACCS nhận tối đa 50 dòng hàng (TT39 PL II). Hiện app chỉ **chặn** lô > 50 dòng bằng luật `R-MAX-50-LINES` (BLOCKER) mà không tách được, nên người khai phải làm ngoài hệ thống.

Thành công khi:
- Lô 120 dòng → app tự dựng 3 tờ khai (50/50/20), người duyệt xem từng tờ, duyệt một lần, bấm truyền một lần.
- Chỉ tiêu chung giống hệt nhau trên mọi tờ; chỉ phần dòng hàng và ô 1.2/2.2 khác nhau.
- Mỗi tờ có số tờ khai, phân luồng, thông quan, nghiệp vụ riêng; hồ sơ thông quan khi đủ mọi tờ.
- Tổng trị giá tính thuế và thuế dự tính các tờ cộng lại khớp đúng cả lô.
- Lô ≤ 50 dòng: hành vi và thông điệp FPT không đổi.

Ngoài phạm vi: khai bổ sung sau thông quan (AMA) cho hồ sơ nhiều tờ (khóa kèm lý do, làm đợt sau); chia dòng theo tiêu chí (biểu thuế, C/O…); chuyển dòng giữa các tờ bằng tay; tách vì lý do khác ngoài số dòng (TN-TX, container > giới hạn 2.60).

## 2. Quyết định đã chốt

| # | Quyết định |
|---|---|
| Q1 | Tách **lúc dựng tờ khai**; người duyệt xem từng tờ trước khi truyền (không tách lúc truyền). |
| Q2 | Chia dòng **theo thứ tự**: tờ k gồm dòng `(k-1)·50+1 … k·50`. |
| Q3 | **Duyệt cả bộ một lần**; bấm truyền một lần, hệ thống **khai tạm nối tiếp** tờ 1 → có số → tờ 2 → …; lỗi ở tờ nào dừng ở tờ đó. Nghiệp vụ sau khai tạm (IDC/EDC, tra cứu, sửa…) người khai bấm theo từng tờ như hiện nay. |
| Q4 | **Mọi chỉ tiêu ngoài thông tin dòng hàng giống hệt nhau trên các tờ** (kể cả 1.44 tổng trị giá hóa đơn, cước, bảo hiểm, khoản điều chỉnh – khai đủ số tiền cả lô). Ngoại lệ bắt buộc: ô 1.2/2.2. |
| Q5 | **Phương án A**: một bản ghi tờ khai gốc (chỉ tiêu chung + toàn bộ dòng hàng); các tờ là **nhánh suy ra** khi hiển thị và khi dựng thông điệp. Chỉ trạng thái truyền lưu theo nhánh. |
| Q6 | Khi `of > 1`: điền 1.49 ô 5 (KTG_VT) = 1.51 trên mọi tờ để VNACCS phân bổ khoản điều chỉnh đúng tỷ lệ; lô 1 tờ giữ như hiện nay (để trống). |

Phương án bị loại: B (N bản ghi `declarations`, chép chỉ tiêu chung rồi đồng bộ khi sửa – mọi chỗ sửa/dựng lại/duyệt phải nhân N, dễ lệch giữa các tờ); C (bảng cha "bộ tờ khai" + bảng con – đập lại `declarations` và gần như mọi use case khai báo, lợi ích không tương xứng).

## 3. Quy tắc tách (domain thuần)

Hàm thuần `splitBranches(payload)` trong `modules/integration/domain` (phần tính số nhánh và khoảng dòng `branchRanges(n)` đặt ở `@kb/contracts` để giao diện dùng chung):

- `of = max(1, ceil(số dòng / 50))`; nhánh `no = 1..of`, dòng gốc `lineFrom..lineTo`.
- Chỉ tiêu chung: chép nguyên từ tờ khai gốc.
- Dòng hàng: lát 50 dòng theo `lineNo`; trong thông điệp FPT đánh số lại 1..50 trên mỗi tờ. Giao diện hiện số dòng gốc.
- Khi `of > 1`, tự điền (không phải ô nhập tay nữa):
  - 1.2 / 2.2 ô 1 (`TK_FIC`): `F` ở tờ 1; tờ 2..N = số tờ khai Hải quan đã cấp cho tờ 1.
  - ô 2 (`TK_BNO`) = `no`; ô 3 (`TK_DNO`) = `of`.
  - 1.51 / 2.42 (`TK_TP`) = tổng trị giá hóa đơn cả lô trước điều chỉnh; người dùng đã sửa tay (source USER) thì giữ.
  - 1.49 ô 5 (`KTG_VT`) = giá trị 1.51 (Q6).
- Trị giá tính thuế, thuế NK, VAT dự tính của tờ = cộng các dòng của tờ đó (trị giá đã phân bổ theo dòng trên cả lô ở `allocateCustomsValue`) → tổng các tờ = cả lô, không sai lệch làm tròn. Tiền dùng `Decimal`.
- `of = 1`: không điền 1.2, 1.51, KTG_VT theo quy tắc trên; thông điệp giống hệt trước khi có tính năng.
- Dựng thông điệp tờ 2..N khi chưa có số tờ 1 → blocker "chưa có số tờ khai đầu tiên" (không gửi).

Ánh xạ chỉ tiêu theo skill `mapping-declaration-fields`; catalog 1.2/2.2 bỏ `manual: true`, cập nhật `legalNote` nguồn tự điền; `docs/RA-SOAT-CHI-TIEU-TO-KHAI.md` đổi 1.2/2.2 từ ❌ sang ✅.

## 4. Dữ liệu

Không đổi: `declarations`, `line_items`, `field_audit`, cách dựng / dựng lại / sửa / duyệt tờ khai.

Migration:
- `customs_results`: thêm `branch integer not null default 1`; bỏ unique `customs_results_dossier_uq (dossier_id)`, thay bằng unique `(dossier_id, branch)`.
- `customs_outbox`: thêm `branch integer not null default 1`.
- `customs_messages`: thêm `branch integer not null default 1` (append-only giữ nguyên policy).
- Khóa idempotency outbox: nhánh 1 giữ dạng cũ (`<dossier>:<op>:…`) để dữ liệu đang chạy không bị gửi trùng; nhánh ≥ 2 thêm `:b<no>`.
- Dữ liệu cũ tự thành nhánh 1, không cần chuyển đổi. Mọi truy vấn vẫn có `orgId` + RLS.

Repo: `results.get(orgId, dossierId, branch = 1)`, `results.listForDossier(orgId, dossierId)`; outbox/messages lọc thêm theo nhánh khi cần.

## 5. Kiểm tra (validation)

- `R-MAX-50-LINES`: thôi là BLOCKER; thành thông báo (INFO/PASS kèm ghi chú) "Lô hàng 120 dòng – sẽ khai 3 tờ khai (50/50/20)".
- BLOCKER mới: **số tờ thay đổi sau khi đã có số tờ khai** (vd sửa dòng hàng làm 3 tờ thành 2, hoặc 2 thành 3) → không truyền; người khai phải xử lý tờ thừa/thiếu (hủy tờ khai) trước. Thêm theo skill `adding-validation-rule`.

## 6. Luồng truyền

### 6.1 Duyệt và guard
Giữ một nút duyệt = duyệt cả bộ. Trước khi gửi bất kỳ tờ nào, chạy guard trên **từng nhánh**: BLOCKER FAIL, HS chưa xác nhận (bất biến 7), sai tuần tỷ giá, thiếu ô bắt buộc (`declarationRequiredGaps` theo dòng của nhánh), `buildFptRequest` blockers/issues. Một nhánh không đạt → không gửi nhánh nào, báo lỗi kèm số tờ.

### 6.2 Khai tạm nối tiếp (IDA/EDA)
1. `submitDeclaration`: tạo `customs_results` `NOT_SENT` cho cả N nhánh; chỉ tạo outbox IDA/EDA cho **nhánh 1**; tờ khai `SUBMITTED`, hồ sơ `SUBMITTED`.
2. Worker `customs-send`: IDA/EDA nhánh k (lần khai tạm đầu) thành công và có số tờ khai → **tự tạo outbox IDA/EDA nhánh k+1** (dựng thông điệp lúc đó với `TK_FIC` = số tờ khai nhánh 1). Ngoại lệ duy nhất cho quy tắc "worker không tự gửi nghiệp vụ kế tiếp"; ghi rõ trong comment đầu `process-outbox.ts`.
3. Nhánh k lỗi / bị từ chối → dừng; nhánh sau giữ `NOT_SENT`. "Gửi lại" nhánh k thành công → chuỗi chạy tiếp.
4. Idempotent: job chạy lại không tạo trùng outbox nhánh sau (khóa theo nhánh + lần gửi; unique key bắt hai job song song).

### 6.3 Sau khai tạm
Mọi nghiệp vụ (`performOperation`, gửi lại, tra cứu IID/IEX, HYS, CONT, PORT_FEE, gọi về sửa, IDB/IDE…) nhận `branch` (mặc định 1) và chạy trên kết quả của nhánh đó; `operationAvailability` tính theo giai đoạn của nhánh. Hỏi trạng thái định kỳ (`poll-status`) chạy cho từng nhánh. Thông điệp ghi `branch`.

### 6.4 Sửa sau khi đã truyền (trước thông quan)
Chỉ tiêu chung dùng chung → mở lại là **mở cả bộ** → sửa → duyệt lại cả bộ → gửi lại nội dung cho từng nhánh đã có số theo giai đoạn của nhánh (IDA01 / IDE…), nối tiếp như 6.2. Nhánh chưa gửi lần nào gửi IDA lần đầu.

### 6.5 Trạng thái hồ sơ
- `SUBMITTED` khi nhánh 1 đã tạo outbox.
- `CLEARED` chỉ khi **mọi** nhánh `CLEARED`.
- `rowState` / màn Khai báo Hải quan: mỗi nhánh một dòng.

### 6.6 AMA
Khi `of > 1`: "Sửa đổi sau thông quan" bị khóa kèm lý do (reason code mới, đủ 3 ngôn ngữ). Lô 1 tờ giữ AMA như hiện tại.

## 7. Contracts và API

- `DeclarationView` thêm `branches: { no, of, lineFrom, lineTo, invoiceValue, customsValueVnd, estImportDutyVnd, estVatVnd }[]` (lô 1 tờ → 1 phần tử). Tiền là chuỗi Decimal.
- `SubmissionView` thêm `branches: BranchSubmission[]` (no, of, stage, declarationNo, channel, pipeline, nextOp, queryOp, result, customsInfo, rejection, messages). Các trường cấp hồ sơ cũ giữ, lấy từ nhánh 1, trong lúc chuyển giao diện.
- Input nghiệp vụ / gửi lại / tra cứu thêm `branch` tùy chọn (Zod, số nguyên ≥ 1, mặc định 1).
- `CustomsRow` thêm `branch`, `of`.
- `CustomsInfo.branch` điền từ phản hồi (đã có chỗ, `TK_BNO`/`TK_DNO`).

## 8. Giao diện

Chỉ `@kb/ui` + token; đủ vi/en/zh (`defineMessages`). Thiếu component → thêm vào `@kb/ui` theo skill `adding-ui-component`.

- **Bước Duyệt (bản in tờ khai):** khi `of > 1`, thanh chọn tờ "Tờ 1/3 · dòng 1–50" ở đầu. Chỉ tiêu chung giống nhau ở mọi tờ, ghi chú "Áp dụng cho cả 3 tờ khai" cạnh khối chỉ tiêu chung; sửa ở tờ nào cũng là sửa chung. Dòng hàng, tổng trị giá/thuế, ô 1.2 hiển thị theo tờ đang chọn. Bản in theo tờ đang chọn. Một nút duyệt cả bộ.
- **Bước Truyền:** một nút "Ký số & truyền" lần đầu; danh sách N thẻ nhánh, mỗi thẻ: số tờ khai, giai đoạn, phân luồng, nút nghiệp vụ, nhật ký thông điệp của nhánh. Nhánh chờ nhánh trước hiện trạng thái "Chờ tờ k".
- **Màn Khai báo Hải quan:** mỗi nhánh một dòng, cột ghi "2/3".
- Mock web (`apps/web/src/mocks`) và `apps/fpt-mock` nhận ô 1.2, cấp số tờ khai riêng cho từng tờ.

## 9. Kiểm thử (`docs/TESTING.md`)

- Thuần: `splitBranches` / `branchRanges` với 0, 1, 50, 51, 100, 101, 120 dòng; ô 1.2 tờ 1 / tờ sau / chưa có số; 1.51 tự tính và giữ sửa tay; KTG_VT; tổng trị giá và thuế các tờ = cả lô; lô 1 tờ cho thông điệp FPT giống hệt ảnh chụp trước.
- Use case: chuỗi IDA nối tiếp 3 tờ; nhánh 2 lỗi → dừng → gửi lại → chạy tiếp nhánh 3; job chạy lại không trùng outbox; guard chặn khi một nhánh thiếu ô bắt buộc; BLOCKER đổi số tờ sau khi có số; nghiệp vụ theo nhánh; CLEARED chỉ khi đủ nhánh; AMA khóa khi nhiều tờ; dữ liệu cũ (không cột branch) vẫn chạy như nhánh 1.
- Repo / migration: test tích hợp Postgres cho unique `(dossier_id, branch)`, RLS theo `orgId`.
- Component: test + axe cho thanh chọn tờ và thẻ nhánh; `i18n-catalogs.test.ts`.
- Trình duyệt thật với hồ sơ 120 dòng: sáng/tối, desktop/mobile – bước Duyệt, bước Truyền, màn Khai báo Hải quan.
- `pnpm typecheck && pnpm lint && pnpm test` xanh. Không đổi trích xuất → không cần `pnpm eval`.
