# Tách tờ khai > 50 dòng – Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lô > 50 dòng tự khai thành N tờ khai nhánh (50 dòng/tờ, theo thứ tự), duyệt một lần, khai tạm nối tiếp, mỗi tờ có vòng đời riêng đến thông quan và AMA.

**Architecture:** Phương án A – một bản ghi `declarations` (chỉ tiêu chung + mọi dòng); nhánh là phép chiếu thuần `branchPayload()` dùng khi dựng thông điệp FPT và khi hiển thị. Trạng thái truyền (`customs_results`, `customs_outbox`, `customs_messages`, `post_amendments`) thêm cột `branch` (mặc định 1 → dữ liệu cũ là nhánh 1). Trạng thái hồ sơ là gộp, suy ra từ các nhánh.

**Tech Stack:** TypeScript, Drizzle + Postgres (RLS), BullMQ, Zod (`@kb/contracts`), Next.js + `@kb/ui`, Vitest + testcontainers, decimal.js.

**Spec:** `docs/superpowers/specs/2026-10-24-tach-to-khai-50-dong-design.md`

## Global Constraints

- Mỗi tờ tối đa **50** dòng; tờ k = dòng `(k-1)·50+1 … k·50` theo `lineNo`; `of = max(1, ceil(n/50))`.
- Mọi chỉ tiêu ngoài dòng hàng giống hệt trên các tờ; chỉ khác `TK_FIC`/`TK_BNO`/`TK_DNO` (1.2/2.2) – và `TK_TP`, `KTG_VT{n}` tự điền giống nhau trên mọi tờ khi `of > 1`.
- `TK_FIC` = `"F"` ở tờ 1; tờ 2..N = số tờ khai của tờ 1. `TK_TP` = tổng trị giá hóa đơn cả lô (giữ nếu source USER). `KTG_VT{n}` = `TK_TP` khi `of > 1`; `of = 1` không điền cả ba.
- `of = 1` → thông điệp FPT, khóa idempotency, `field_audit` key, hành vi **giống hệt trước**.
- Khóa idempotency nhánh ≥ 2 thêm `:b<no>`; nhánh 1 giữ dạng cũ. `field_audit` AMA nhánh ≥ 2: `ama:b<no>:<seq>:…`.
- `dossiers.status`: `CLEARED` chỉ khi mọi nhánh `CLEARED`; không thêm giá trị vào `dossiers_status_chk`.
- Bất biến dự án: `orgId` mọi truy vấn; mã định danh là string; tiền `Decimal`/chuỗi Decimal; Zod ở biên; `field_audit` append-only; bất biến 7 kiểm trên **từng nhánh**; giao diện chỉ `@kb/ui` + token; chữ hiển thị qua `defineMessages`, đủ vi/en/zh.
- Trước khi báo xong: `pnpm typecheck && pnpm lint && pnpm test` xanh; giao diện kiểm bằng trình duyệt thật (sáng/tối, desktop/mobile).

## Review Focus

1. **Đúng 50 / 51 / 100 / 101 dòng** – biên chia tờ; người dùng kỳ vọng 50 → 1 tờ (không điền 1.2), 51 → 2 tờ (50 + 1). → Task 1, Task 2.
2. **Sửa dòng hàng sau khi đã có số tờ khai làm đổi số tờ** (120 → 95) – kỳ vọng bị chặn truyền với lý do rõ, không gửi thông điệp sai nhánh. → Task 4.
3. **Worker chạy lại sau crash ngay sau IDA nhánh k thành công** – kỳ vọng đúng một outbox IDA nhánh k+1, không gửi trùng. → Task 6.
4. **Dữ liệu cũ đang truyền dở (trước migration)** – kỳ vọng tiếp tục như nhánh 1, không tạo outbox trùng vì đổi khóa. → Task 5, Task 6.
5. **Nhánh 2 bị từ chối trong khi nhánh 1 đã thông quan** – kỳ vọng hồ sơ không `CLEARED`, hiện "Thông quan 1/3" + cảnh báo tờ 2; AMA nhánh 1 vẫn làm được. → Task 7, Task 8.

---

### Task 1: `branchRanges` dùng chung + catalog 1.2/2.2

**Files:**
- Create: `packages/contracts/src/declaration/branches.ts`, `packages/contracts/src/declaration/branches.test.ts`
- Modify: `packages/contracts/src/declaration/index.ts` (export), `packages/contracts/src/declaration/catalog-ida.ts:18-21`, `packages/contracts/src/declaration/catalog-eda.ts:17-20`, `docs/RA-SOAT-CHI-TIEU-TO-KHAI.md` (1.2/2.2 ❌ → ✅, dòng 43, 163, 231, 291)

**Interfaces:**
- Produces: `BRANCH_MAX_LINES = 50`; `type BranchRange = { no: number; of: number; lineFrom: number; lineTo: number; index: [number, number] }` (`index` = [start, end) trong mảng dòng đã sắp theo `lineNo`); `branchRanges(lineNos: number[]): BranchRange[]`; `branchCount(lineCount: number): number`.

- [ ] **Step 1: Test** `branches.test.ts`:
  - `branchRanges([])` → `[{ no: 1, of: 1, lineFrom: 0, lineTo: 0, index: [0, 0] }]`
  - 50 dòng → 1 nhánh `lineFrom 1, lineTo 50`
  - 51 dòng → `[{no:1,of:2,lineFrom:1,lineTo:50,index:[0,50]},{no:2,of:2,lineFrom:51,lineTo:51,index:[50,51]}]`
  - 120 dòng → of 3, nhánh 3 `lineFrom 101, lineTo 120`
  - lineNo không liên tục `[1,2,5,…]` → `lineFrom/lineTo` lấy từ lineNo thật, không phải chỉ số
  - `branchCount(0) === 1`, `branchCount(101) === 3`
- [ ] **Step 2:** `pnpm --filter @kb/contracts test branches` → FAIL (chưa có module).
- [ ] **Step 3:** Cài đặt; `branchRanges` sắp bản sao `lineNos` tăng dần.
- [ ] **Step 4:** Catalog 1.2/2.2: bỏ `manual: true`; `legalNote` thêm "App tự điền khi lô > 50 dòng: tờ 1 \"F\", tờ sau số tờ khai của tờ 1; số nhánh; tổng số tờ." Chạy `pnpm --filter @kb/contracts test` → PASS (sửa snapshot/test catalog nếu có kỳ vọng `manual`).
- [ ] **Step 5: Commit** `feat(contracts): branchRanges – chia dòng hàng 50 dòng/tờ khai`

### Task 2: `branchPayload` + KTG_VT trong thông điệp FPT

**Files:**
- Create: `packages/core/src/modules/integration/domain/branches.ts`, `packages/core/src/modules/integration/domain/__tests__/branches.test.ts`
- Modify: `packages/core/src/modules/integration/domain/declaration-to-fpt.ts:240-250` (khối KTG)

**Interfaces:**
- Consumes: `branchRanges` (Task 1).
- Produces: `branchPayload(p: DeclarationPayload, no: number, firstDeclarationNo: string | null): { payload: DeclarationPayload; range: BranchRange; blockers: string[] }`; `invoiceTotal(p: DeclarationPayload): string` (tổng `amount` các dòng, Decimal).

- [ ] **Step 1: Test** `branches.test.ts` (dựng payload 120 dòng bằng factory sẵn có trong `customs-domain.test.ts`):
  - nhánh 1: `items.length === 50`, `fields.TK_FIC.value === "F"`, `TK_BNO "1"`, `TK_DNO "3"`, `TK_TP === invoiceTotal(p)`
  - nhánh 2, `firstDeclarationNo "104000000001"`: `TK_FIC "104000000001"`, items là dòng 51–100, `blockers` rỗng
  - nhánh 2, `firstDeclarationNo null` → `blockers` = `["Tờ 2/3: chưa có số tờ khai đầu tiên (tờ 1)"]`
  - `TK_TP` có source USER = "999" → giữ "999"
  - 40 dòng: payload trả về **deep-equal** đầu vào (không thêm TK_FIC/TK_BNO/TK_DNO/TK_TP)
  - `buildFptRequest(branchPayload(p,2,"104…").payload)`: `HANG[0].HAG_B25 === "01"`, `KTG.KTG_VT1 === Number(TK_TP)` khi có khoản điều chỉnh mã hóa; `buildFptRequest` của lô 40 dòng **không** có `KTG_VT1` (giữ hành vi commit 0e27623)
  - Tổng `amount` các nhánh = `invoiceTotal(p)`
- [ ] **Step 2:** `pnpm --filter @kb/core test branches` → FAIL.
- [ ] **Step 3:** Cài đặt `branchPayload`: sắp `items` theo `lineNo`, cắt theo `range.index`, ghi `fields` mới (không đổi object gốc). Trong `buildFptRequest`, khi `Number(val(p,"TK_DNO")) > 1` và `val(p,"TK_TP")` có giá trị → `setKtg(\`KTG_VT${n}\`, num(TK_TP))` cho mỗi khoản `n` đã ghi `KTG_VR{n}`.
- [ ] **Step 4:** `pnpm --filter @kb/core test integration` → PASS (kể cả test cũ của `declaration-to-fpt`).
- [ ] **Step 5: Commit** `feat(integration): branchPayload – dựng tờ khai nhánh, tự điền 1.2/1.51/KTG_VT`

### Task 3: Tổng trị giá/thuế theo nhánh trong DeclarationView

**Files:**
- Modify: `packages/contracts/src/api/declaration.ts:34` (`DeclarationViewSchema`), `packages/core/src/modules/declaration/application/_dto.ts`, test tương ứng trong `packages/core/src/modules/declaration/application/__tests__/declaration-use-cases.test.ts`

**Interfaces:**
- Produces: `DeclarationBranchSchema = z.object({ no, of, lineFrom, lineTo: z.number().int(), invoiceValue, customsValueVnd, estImportDutyVnd, estVatVnd: DecimalStringSchema })`; `DeclarationViewSchema.branches: z.array(DeclarationBranchSchema).default([])`.

- [ ] **Step 1: Test:** view của tờ khai 120 dòng có `branches.length === 3`, `branches[2]` `lineFrom 101 lineTo 120`; `sum(customsValueVnd) === declaration.customsValueVnd`, tương tự `estImportDutyVnd`, `estVatVnd`; tờ khai 10 dòng → 1 nhánh khớp tổng.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Trong `_dto.ts` cộng các `DeclarationItemView` theo `branchRanges` bằng Decimal (không number).
- [ ] **Step 4:** `pnpm --filter @kb/core test declaration && pnpm --filter @kb/contracts test` → PASS.
- [ ] **Step 5: Commit** `feat(declaration): tổng trị giá và thuế dự tính theo tờ khai nhánh`

### Task 4: Luật kiểm tra – 50 dòng thành thông báo, chặn đổi số tờ

**Files:**
- Modify: `packages/core/src/modules/validation/domain/rules/max-50-lines.ts`, `packages/core/src/modules/validation/domain/rules/__tests__/line-items.test.ts`, `packages/core/src/modules/validation/application/ports.ts`, `packages/core/src/modules/validation/application/run-rules.ts`, `packages/core/src/modules/validation/domain/helpers.ts` (input luật thêm `issuedBranches`)
- Create: `packages/core/src/modules/validation/domain/rules/branch-count-locked.ts` + đăng ký trong danh sách luật

**Interfaces:**
- Produces: `ValidationDeps.branches?: (orgId: string, dossierId: string) => Promise<number>` – số nhánh đã có số tờ khai. Input luật: `issuedBranches: number` (vắng reader → 0). Test dùng reader giả; nối thật vào composition root ở Task 5 (cần repo `results.issuedCount`).

Theo skill `adding-validation-rule`.
- [ ] **Step 1: Test:**
  - `R-MAX-50-LINES` 120 dòng → severity `INFO`, result `PASS`, detail `"Lô hàng có 120 dòng hàng – sẽ khai 3 tờ khai (50/50/20)"`; 50 dòng → detail cũ "trong giới hạn"
  - `R-BRANCH-COUNT-LOCKED` (BLOCKER): `issuedBranches 3`, 95 dòng → FAIL `"Đã có số tờ khai cho 3 tờ nhưng lô hàng nay chỉ còn 2 tờ (95 dòng) – hủy tờ khai thừa trước khi truyền"`; `issuedBranches 2`, 120 dòng → FAIL tương tự ("nay cần 3 tờ"); `issuedBranches 0` → SKIPPED; bằng nhau → PASS
- [ ] **Step 2:** Chạy `pnpm --filter @kb/core test validation` → FAIL.
- [ ] **Step 3:** Cài đặt; chuỗi (50/50/20) lấy từ `branchRanges`.
- [ ] **Step 4:** → PASS; chạy `pnpm --filter @kb/web test i18n` nếu có catalog tên luật (thêm bản dịch en/zh cho tiêu đề luật mới theo cách các luật khác đang làm).
- [ ] **Step 5: Commit** `feat(validation): R-MAX-50-LINES thành thông báo, chặn đổi số tờ sau khi có số tờ khai`

### Task 5: Migration + repo theo nhánh

**Files:**
- Modify: `packages/core/src/db/schema/integration.ts` (4 bảng), `packages/core/src/modules/integration/application/customs-ports.ts`, `packages/core/src/modules/integration/infrastructure/drizzle-customs-uow.ts`, in-memory uow trong `packages/core/src/modules/integration/application/test/`
- Create: `packages/core/drizzle/0024_customs_branches.sql` (`pnpm db:generate`, rồi rà tay)
- Modify: `apps/web/src/container.ts`, `apps/worker/src/container.ts` – nối `ValidationDeps.branches` = `results.issuedCount` (Task 4)
- Test: `packages/core/src/modules/integration/infrastructure/drizzle-customs-uow.int.test.ts`

**Interfaces:**
- Produces:
  - `OutboxRow.branch: number`, `MessageRow.branch: number`, `ResultRow.branch: number`, `PostAmendmentRow.branch: number`
  - `results.get(orgId, dossierId, branch = 1)`, `results.listForDossier(orgId, dossierId): ResultRow[]` (sắp theo branch), `results.issuedCount(orgId, dossierId): number`
  - `messages.list(orgId, dossierId, branch?)` (vắng = mọi nhánh)
  - `amendments.listForDossier(orgId, dossierId, branch?)`
  - upsert `customs_results` onConflict `(dossier_id, branch)`

- [ ] **Step 1: Test int:** hai result cùng dossier nhánh 1 và 2 cùng tồn tại; upsert nhánh 2 không đụng nhánh 1; insert result trùng `(dossier, branch)` → cập nhật; `post_amendments` seq 1 cho nhánh 1 và seq 1 cho nhánh 2 cùng tồn tại; RLS org khác không thấy; dòng chèn không có `branch` (SQL thô, giả dữ liệu cũ) → đọc ra `branch === 1`.
- [ ] **Step 2:** `pnpm --filter @kb/core test drizzle-customs-uow` → FAIL.
- [ ] **Step 3:** Schema: `branch: integer("branch").notNull().default(1)`; `customs_results` unique `customs_results_dossier_branch_uq (dossier_id, branch)` thay `customs_results_dossier_uq`; `post_amendments` unique `(dossier_id, branch, seq)`; index outbox/messages thêm `branch` cuối. Sinh migration, kiểm SQL drop/create index đúng thứ tự. Cập nhật repo + in-memory; mọi nơi tạo row hiện có truyền `branch: 1` (typecheck dẫn đường).
- [ ] **Step 4:** `pnpm db:migrate && pnpm --filter @kb/core test` → PASS; `pnpm typecheck` xanh.
- [ ] **Step 5: Commit** `feat(db): trạng thái truyền Hải quan và AMA theo nhánh tờ khai`

### Task 6: Truyền lần đầu + khai tạm nối tiếp

**Files:**
- Modify: `packages/core/src/modules/integration/application/submit-declaration.ts`, `packages/core/src/modules/integration/application/process-outbox.ts` (nhánh IDA/EDA thành công), `packages/core/src/modules/integration/application/customs-ports.ts` (`DeclarationSnapshot` không đổi)
- Test: `packages/core/src/modules/integration/application/__tests__/customs-use-cases.test.ts`

**Interfaces:**
- Consumes: `branchPayload` (Task 2), repo theo nhánh (Task 5).
- Produces: `outboxKey(dossierId, op, version, retry = 0, branch = 1)` – nhánh 1 trả đúng chuỗi cũ; `enqueueBranchPreDeclare(deps, ctx, dossierId, branch): Promise<Result<void>>` (dùng chung cho submit, chuỗi, gửi lại sau mở lại – Task 7).

- [ ] **Step 1: Test:**
  - lô 120 dòng: `submitDeclaration` tạo 3 result `NOT_SENT` (branch 1..3), 1 outbox IDA `branch 1`, key `"<dossier>:IDA:v<ver>"`
  - một nhánh thiếu ô bắt buộc trên dòng 75 → `REQUIRED_FIELDS_MISSING_SUBMIT`, không tạo outbox nào
  - `processOutbox` IDA nhánh 1 thành công (gateway giả trả `declarationNo "104000000001"`) → outbox IDA nhánh 2 tồn tại, payload `request` có `TK_FIC "104000000001"`, `TK_BNO 2`; nhánh 2 xong → nhánh 3; nhánh 3 xong → không tạo gì thêm
  - gọi lại `processOutbox` cho outbox nhánh 1 đã SENT → vẫn đúng 1 outbox nhánh 2 (Review Focus 3)
  - IDA nhánh 2 bị từ chối → không tạo nhánh 3; `resendOperation(…, "IDA", 2)` thành công → nhánh 3 được tạo
  - lô 40 dòng: outbox/key/payload giống test hiện có (không đổi kỳ vọng cũ)
  - outbox cũ PENDING tạo trước migration (branch 1, key cũ) → `submitDeclaration` lặp lại báo `ALREADY_SUBMITTED`, không tạo trùng (Review Focus 4)
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt. Chuỗi chỉ kích hoạt khi op cơ sở IDA/EDA, lần khai tạm đầu (nhánh kế tiếp ở `NOT_SENT`, chưa có outbox IDA). Cập nhật comment đầu `process-outbox.ts`: ngoại lệ duy nhất cho "không tự gửi nghiệp vụ kế tiếp".
- [ ] **Step 4:** `pnpm --filter @kb/core test integration` → PASS.
- [ ] **Step 5: Commit** `feat(integration): khai tạm nối tiếp các tờ khai nhánh`

### Task 7: Nghiệp vụ, hỏi trạng thái, mở lại và trạng thái hồ sơ theo nhánh

**Files:**
- Create: `packages/contracts/src/customs-summary.ts` (+ test) – export qua `index.ts`
- Modify: `perform-operation.ts`, `resend-operation.ts`, `poll-status.ts`, `reopen-declaration.ts`, `get-submission.ts`, `_customs-view.ts`, `process-outbox.ts` (cập nhật trạng thái hồ sơ) trong `packages/core/src/modules/integration/application/`; worker job `customs-poll` payload thêm `branch`
- Test: `customs-use-cases.test.ts`

**Interfaces:**
- Produces:
  - `dossierCustomsSummary(branches: { stage: CustomsStage; state: SubmissionState }[]): { of: number; cleared: number; problems: { no: number; kind: "REJECTED" | "SEND_FAILED" }[]; allCleared: boolean }`
  - `performOperation(deps, ctx, dossierId, op, branch = 1)`, `resendOperation(deps, ctx, dossierId, op, branch = 1)`, `PollStatusInput.branch?: number` (vắng = 1), `getSubmission` trả thêm `branches` (Task 9 định schema)
  - `syncDossierClearance(deps, ctx, dossierId)` – đọc mọi result, `CLEARED` khi `allCleared`

- [ ] **Step 1: Test:**
  - `dossierCustomsSummary` 3 nhánh [CLEARED, REJECTED, DECLARED] → `{of:3, cleared:1, problems:[{no:2,kind:"REJECTED"}], allCleared:false}`
  - IDC nhánh 2 dùng `externalId`/`declarationNo` của nhánh 2; IDC nhánh 3 khi nhánh 3 còn `NOT_SENT` → lỗi `INVALID_STATE`
  - poll nhánh 1 thông quan → hồ sơ vẫn `SUBMITTED`; nhánh 2, 3 thông quan → `CLEARED`, thông báo "đã thông quan" gửi mỗi nhánh một lần kèm "Tờ k/N"
  - `reopenDeclaration` mở cả bộ (một lần, tờ khai DRAFT); sau duyệt lại, gửi nội dung: nhánh đã có số đi IDA01/IDE theo giai đoạn của từng nhánh, nối tiếp; nhánh chưa gửi đi IDA lần đầu
  - lô 1 tờ: mọi test cũ giữ nguyên kỳ vọng
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt; thay mọi `dossiers.update({ status: "CLEARED" })` bằng `syncDossierClearance`.
- [ ] **Step 4:** `pnpm --filter @kb/core test && pnpm --filter @kb/worker test` → PASS.
- [ ] **Step 5: Commit** `feat(integration): nghiệp vụ, hỏi trạng thái và thông quan theo từng tờ khai`

### Task 8: AMA theo nhánh + nhân bản sửa chỉ tiêu chung

**Files:**
- Modify: `packages/core/src/modules/integration/application/post-amendment.ts`, `perform-operation.ts` (`startPostAmendment(…, branch)`), `packages/contracts/src/post-amendment/*` (view + input)
- Test: `packages/core/src/modules/integration/application/__tests__/customs-use-cases.test.ts` (hoặc file test AMA hiện có)

**Interfaces:**
- Produces: mọi hàm AMA nhận `branch = 1` làm tham số cuối (`getPostAmendmentView`, `updatePostAmendmentField`, `addPostAmendmentLines`, `removePostAmendmentLine`, `approvePostAmendment`, `startPostAmendment`); `copyPostAmendmentHeader(deps, ctx, dossierId, input: { fromBranch: number; keys: string[] }): Promise<Result<{ applied: number[]; skipped: { no: number; reason: "NOT_CLEARED" }[] }>>`; `PostAmendmentView.commonEdits: string[]` (khóa header đã khác bản gốc của nhánh).

- [ ] **Step 1: Test:**
  - nhánh 1 `CLEARED`, nhánh 2 `DECLARED`: `startPostAmendment(…,1)` OK, `(…,2)` → `INVALID_STATE`
  - AMA nhánh 2 tham chiếu `declarationNo` nhánh 2, dòng nguồn chỉ 51–100 đánh số 1..50; `seq` nhánh 2 bắt đầu 1
  - `field_audit` key nhánh 2: `ama:b2:1:<key>`; nhánh 1 giữ `ama:1:<key>`
  - sửa header `KTG_FR3` ở nhánh 1 → `commonEdits` chứa `KTG_FR3`; `copyPostAmendmentHeader({fromBranch:1, keys:["KTG_FR3"]})` với nhánh 2 `CLEARED`, nhánh 3 `DECLARED` → `applied [2]`, `skipped [{no:3,reason:"NOT_CLEARED"}]`, AMA nháp nhánh 2 có giá trị mới, ghi audit
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(integration): khai bổ sung sau thông quan theo từng tờ khai nhánh`

### Task 9: Contracts view + route API

**Files:**
- Modify: `packages/contracts/src/api/customs.ts` (`SubmissionViewSchema`, `CustomsRowSchema`, input schemas), `packages/contracts/src/api/dossier.ts` hoặc `dto/dossier.ts` (tóm tắt hồ sơ), `packages/core/src/modules/integration/index.ts`
- Modify routes: `apps/web/src/app/api/dossiers/[id]/submission/**/route.ts`, `apps/web/src/app/api/dossiers/[id]/post-amendment/**/route.ts`, `apps/web/src/app/api/customs/declarations/route.ts`; `apps/web/src/api/http/customs.ts`, `apps/web/src/api/http/post-amendment.ts`
- Test: `packages/contracts/src/dto/dto.test.ts`, route tests hiện có

**Interfaces:**
- Produces:
  - `BranchSubmissionSchema = z.object({ no, of: int, stage, declarationNo: string.nullable(), pipeline, nextOp, queryOp, amendments, postAmendments, messages, result, customsInfo, rejection, inProgress, started })`
  - `SubmissionViewSchema.branches: z.array(BranchSubmissionSchema).default([])`, `.summary: { of, cleared, problems }` ; trường cấp hồ sơ cũ = nhánh 1
  - `BranchParamSchema = z.coerce.number().int().min(1).default(1)`; `PerformOperationInputSchema`/`ResendOperationInputSchema` thêm `branch: BranchParamSchema`; GET dùng query `?branch=`
  - `CustomsRowSchema` thêm `branch: int`, `of: int`; `listCustomsDeclarations` một dòng mỗi nhánh
  - Tóm tắt hồ sơ thêm `customs: { cleared, of, problems }.optional()`
  - Client web: `performOperation(dossierId, op, branch = 1)`, `resendOperation(dossierId, op, branch = 1)`, `startPostAmendment(dossierId, branch = 1)`, AMA client tương tự, `copyPostAmendmentHeader(dossierId, input)`

- [ ] **Step 1: Test:** parse `SubmissionView` cũ (không `branches`) vẫn hợp lệ; `PerformOperationInput` `{operation:"IDC"}` → `branch 1`; `branch: 0` → lỗi; `listCustomsDeclarations` hồ sơ 3 nhánh → 3 dòng `of 3`.
- [ ] **Step 2–4:** FAIL → cài đặt (theo skill `adding-backend-use-case` cho route mới `post-amendment/copy-header`) → `pnpm typecheck && pnpm --filter @kb/contracts test && pnpm --filter @kb/web test api` PASS.
- [ ] **Step 5: Commit** `feat(api): view và nghiệp vụ Hải quan theo tờ khai nhánh`

### Task 10: Mock web + fpt-mock

**Files:**
- Modify: `apps/web/src/mocks/customs-sim.ts`, `apps/web/src/mocks/post-amendment-sim.ts`, `apps/web/src/mocks/api/customs.ts`, `apps/web/src/mocks/api/post-amendment.ts`, `apps/web/src/mocks/api/declaration.ts`, `apps/web/src/mocks/db.ts` (luồng theo `dossierId:branch`), seed: thêm một hồ sơ mẫu 120 dòng (NK) trong `apps/web/src/mocks/seed/`
- Modify: `apps/fpt-mock/src/declaration.ts` (+ `app.test.ts`)
- Test: `apps/web/src/mocks/api/customs.test.ts`, `post-amendment.test.ts`, `apps/fpt-mock/src/app.test.ts`

**Interfaces:**
- Consumes: hợp đồng Task 9 (cùng chữ ký với client http).

- [ ] **Step 1: Test:** mock: truyền hồ sơ 120 dòng → nhánh 1 `PRE_DECLARED` có số, nhánh 2, 3 nối tiếp; thông quan nhánh 1 → summary `cleared 1`; AMA nhánh 1 khi nhánh 2 chưa thông quan. fpt-mock: IDA với `TK_FIC "F"`, `TK_BNO 1`, `TK_DNO 3` → số tờ khai mới; IDA `TK_FIC` = số đó, `TK_BNO 2` → số khác; `TK_BNO 2` với `TK_FIC` không tồn tại → lỗi nghiệp vụ.
- [ ] **Step 2–4:** FAIL → cài đặt → `pnpm --filter @kb/web test mocks && pnpm --filter fpt-mock test` PASS.
- [ ] **Step 5: Commit** `feat(mock): giả lập tờ khai nhánh ở mock web và fpt-mock`

### Task 11: Bước Duyệt – chọn tờ và bản in theo tờ

**Files:**
- Modify: `apps/web/src/features/declaration-print/print-declaration.tsx`, `print-sheets.tsx`, `print-toolbar.tsx`, `print-state.ts`, `print.messages.ts` (+ `print.vi.ts`), `apps/web/src/features/dossier-detail/steps/review-step.tsx`
- Test: `print-state.test.ts`, `print-i18n.test.ts`, test component mới có axe

**Interfaces:**
- Consumes: `DeclarationView.branches` (Task 3), `branchRanges` (Task 1).
- Produces: `printStateFor(view, branchNo)` lọc `items` theo nhánh, ô 1.2 hiển thị `F|<số>`/`k`/`N` (số tờ 1 lấy từ `SubmissionView.branches[0].declarationNo`, chưa có → "—").

Theo skill `building-frontend-feature`; thiếu component chọn tờ thì thêm vào `@kb/ui` theo `adding-ui-component` (ưu tiên `Tabs`/`SegmentedControl` sẵn có).
- [ ] **Step 1: Test:** `printStateFor(view120, 2)` có 50 dòng, dòng đầu `lineNo 51`, tổng trị giá = `branches[1].invoiceValue`; component: `of = 1` không hiện thanh chọn tờ; `of = 3` hiện 3 lựa chọn "Tờ 1/3 · dòng 1–50"…, đổi tờ đổi bảng dòng; ghi chú "Áp dụng cho cả 3 tờ khai" cạnh khối chỉ tiêu chung; axe không lỗi; đủ 3 ngôn ngữ.
- [ ] **Step 2–4:** FAIL → cài đặt → `pnpm --filter @kb/web test declaration-print` PASS; `pnpm lint` xanh.
- [ ] **Step 5: Commit** `feat(web): xem và in tờ khai theo từng tờ nhánh ở bước Duyệt`

### Task 12: Bước Truyền, màn Khai báo Hải quan, danh sách hồ sơ, AMA

**Files:**
- Modify: `apps/web/src/features/dossier-detail/steps/submit-step.tsx` (+ messages), `customs-info-panel.tsx`, `apps/web/src/features/customs/customs-page.tsx` (+ messages), `apps/web/src/features/dossiers/dossier-badges.tsx`, `dossier-list-page.tsx` (+ messages), `apps/web/src/features/post-amendment/post-amendment-step.tsx`, `declare-ama.tsx`, `ama.messages.ts`, reason codes mới trong `packages/contracts/src/reason-codes.ts` + bản dịch
- Test: `customs-page.test.tsx`, `dossier-list-page.test.tsx`, `ama-i18n.test.ts`, test thẻ nhánh mới (axe), `customs-errors.test.ts`

**Interfaces:**
- Consumes: `SubmissionView.branches`/`summary`, `CustomsRow.branch/of`, tóm tắt hồ sơ `customs`, client Task 9.

- [ ] **Step 1: Test:**
  - Bước Truyền `of = 3`: 3 thẻ "Tờ 1/3 – <số tờ khai>", nhánh `NOT_SENT` sau nhánh lỗi hiện "Chờ tờ 2"; bấm IDC trên thẻ 2 gọi `performOperation(id, "IDC", 2)`; `of = 1` giao diện như cũ
  - Màn Khai báo Hải quan: 3 dòng, cột "2/3"
  - Danh sách hồ sơ: nhãn "Thông quan 1/3" + cảnh báo "Tờ 2: bị từ chối"
  - AMA: nút "Sửa đổi sau thông quan" chỉ trên thẻ nhánh `CLEARED`; màn AMA tiêu đề "Tờ 2/3 – số tờ khai …"; `commonEdits` không rỗng → cảnh báo + nút nhân bản; bấm → gọi `copyPostAmendmentHeader`, hiện kết quả applied/skipped
  - axe không lỗi; `i18n-catalogs.test.ts` xanh
- [ ] **Step 2–4:** FAIL → cài đặt → `pnpm --filter @kb/web test` PASS; `pnpm lint` xanh.
- [ ] **Step 5: Commit** `feat(web): truyền, theo dõi và khai bổ sung theo từng tờ khai nhánh`

### Task 13: Kiểm tra toàn bộ + trình duyệt thật

**Files:** không thêm code trừ khi phát hiện lỗi (sửa trong task gốc, commit `fix:`).

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm test` → xanh (ghi số test).
- [ ] **Step 2:** `pnpm dev` + `pnpm fpt-mock`; hồ sơ mẫu 120 dòng: bước Duyệt (chọn tờ, in tờ 2), duyệt, truyền → 3 tờ nối tiếp, IDC từng tờ, thông quan tờ 1 → "Thông quan 1/3", AMA tờ 1 + nhân bản sang tờ đã thông quan, màn Khai báo Hải quan 3 dòng. Chụp sáng + tối, 1440px + 390px theo skill `adding-ui-component` mục "Kiểm tra bằng trình duyệt".
- [ ] **Step 3:** Hồ sơ ≤ 50 dòng chạy hết luồng như trước (hồi quy).
- [ ] **Step 4:** Cập nhật `docs/QUY-TRINH-NGHIEP-VU.md` và `docs/PRODUCT.md` (mục tách tờ khai, thông quan/AMA theo tờ). Commit `docs: quy trình tách tờ khai > 50 dòng`.
