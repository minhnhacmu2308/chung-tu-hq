# Tách tờ khai – khai chính thức cả lô, gọi về sửa theo phạm vi, 1.51 – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lô nhiều tờ: khai chính thức (IDC/EDC, IDE/EDE) đúng thứ tự và có nút khai cả lô; gọi về sửa "tất cả" hoặc "một tờ" (khóa chỉ tiêu chung), tự về màn khai sửa; 1.51/2.42 = tổng trị giá mọi khoản của cả lô, giống nhau mọi tờ.

**Architecture:** Quy tắc thuần ở `@kb/contracts` (thứ tự tờ, phạm vi sửa) dùng chung backend, web, mock. Chuỗi nối tiếp của worker (`chainNextBranch`) mở rộng cho chuỗi khai chính thức và chuỗi gọi về (đánh dấu `chain` trong payload outbox). Lưới an toàn: ảnh chụp nội dung đã gửi của từng tờ (`raw.sent`) + guard `sentSheetsError` chặn duyệt/truyền khi tờ chưa gọi về bị đổi. 1.51 tính ở module declaration (nơi có tỷ giá) và lưu thành chỉ tiêu `TK_TP`.

**Tech Stack:** TypeScript, pnpm monorepo, Zod, Decimal.js, Drizzle/Postgres, BullMQ, Next.js, vitest, @kb/ui.

**Spec:** `docs/superpowers/specs/2026-10-25-tach-to-khai-idc-goi-ve-151-design.md` (đọc kèm spec gốc `docs/superpowers/specs/2026-10-24-tach-to-khai-50-dong-design.md`).

## Global Constraints

- Bất biến CLAUDE.md 1–12: `orgId` mọi truy vấn; mã định danh `string`; tiền `Decimal`; Zod ở biên; `field_audit` append-only; không truyền khi còn BLOCKER FAIL hoặc HS chưa xác nhận.
- Giao diện chỉ `@kb/ui` + token: không mã màu, không màu Tailwind mặc định, không `dark:`, không giá trị tùy ý. Thiếu → thêm vào `@kb/ui`.
- Mọi chữ hiển thị mới có vi/en/zh qua `defineMessages` + `useMessages`; reason code mới thêm vào `apps/web/src/lib/reason-codes.messages.ts`.
- Lô một tờ (`of = 1`): hành vi, thông điệp FPT, luồng gọi về/mở lại **giống hệt trước**.
- Khóa idempotency: nhánh 1 giữ khóa cũ, nhánh ≥ 2 thêm `:b<no>` (giữ quy ước hiện có).
- 1.51/2.42: làm tròn `ROUND_HALF_UP` 4 chữ số thập phân (đặc tả FPT: IDA `TK_TP` decimal 20.4, EDA 28.4), bỏ số 0 thừa.
- Commit kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Không `git add` `.claude/settings.json`, `.mcp.json`, `docs/danhmuc/`, `docs/tailieuchitieukhaibao/`.
- Trước khi báo xong: `pnpm typecheck && pnpm lint && pnpm test` xanh; đổi giao diện → kiểm bằng trình duyệt thật (sáng + tối, desktop + mobile).

## Rulings so với spec (đã cân nhắc, ghi để reviewer biết)

- **R-SENT-SHEETS-UNCHANGED là guard của integration, không phải luật validation**: luật validation chạy trên dữ liệu chứng từ (`s.items`), không thấy chỉ tiêu người khai sửa trên tờ khai. Guard `sentSheetsError` gọi ở duyệt (port của declaration) và ở mọi điểm gửi nội dung; reason code `SENT_SHEETS_CHANGED`. Hành vi người dùng như spec (chặn duyệt + truyền, liệt kê chỉ tiêu đổi).
- **R-ALLOC-TOTAL-MISMATCH là cảnh báo của bản dựng FPT + ghi chú chỉ tiêu**, cùng lý do: `branchPayload` trả `warnings` → hiện ở cảnh báo truyền của tờ; Review hiện ghi chú dưới 1.51.
- **Sửa chỉ tiêu chứng từ (extraction) khi `common = LOCKED`**: chỉ cho sửa ô thuộc dòng hàng (dòng thuộc tờ sửa được); ô header chứng từ từ chối. Không xác định được dòng của ô → từ chối (an toàn; lưới 2.5 vẫn chặn).

## Review Focus

1. Gọi về tất cả mà một tờ đang có lệnh PENDING (vừa bấm IDC) → phải từ chối cả lần, không gửi tờ nào (Task 7 test).
2. Chỉ gọi về tờ 2, người khai sửa số tiền một dòng tờ 2 → 1.51 đổi → duyệt bị chặn với "1.51" trong danh sách chỉ tiêu đổi (Task 5 test).
3. Tờ 1 đã thông quan, tờ 2–3 PRE_DECLARED → "Khai chính thức tất cả" gửi tờ 2 rồi 3, không chờ tờ 1 (Task 3 test).
4. Khoản phí bằng EUR trên hóa đơn USD, thiếu tỷ giá EUR → 1.51 trống, truyền bị chặn với thông báo nêu EUR (Task 1 test).
5. Gọi về một tờ rồi bấm "Gọi về các tờ còn lại" khi tờ khai đang DRAFT → các tờ còn lại gọi về, phạm vi thành FULL, không tự "mở lại" lần nữa (Task 7 test).

---

### Task 1: 1.51 / 2.42 – tổng hệ số phân bổ của cả lô

**Files:**
- Modify: `packages/core/src/modules/declaration/domain/valuation.ts` (thêm hàm thuần)
- Modify: `packages/core/src/modules/declaration/domain/mapping/ida.ts`, `.../mapping/eda.ts` (chỉ tiêu `TK_TP`)
- Modify: `packages/core/src/modules/integration/domain/branches.ts` (`branchPayload` dùng `TK_TP` lưu sẵn, thêm `warnings`)
- Modify: các nơi gọi `branchPayload` để nhận `warnings` (`branch-send.ts` `buildSheet`/`sheetOf`, `perform-operation.ts`)
- Test: `packages/core/src/modules/declaration/domain/__tests__/money.test.ts` (hoặc file mới `alloc-total.test.ts` cùng thư mục), `packages/core/src/modules/integration/domain/__tests__/branches.test.ts`, `.../declaration/domain/__tests__/mapping.test.ts`

**Interfaces:**
- Produces: `allocationTotal(input: ValuationInput): { value: string | null; note: string; missingRates: string[] }` (`valuation.ts`).
- Produces: `branchPayload(...)` trả thêm `warnings: string[]`.

- [ ] **Step 1: Test thuần `allocationTotal`**
  - Hóa đơn USD 1000 (2 dòng 600 + 400), cước 100 USD ADD, BH 10 USD ADD, khoản "G" 50 USD SUBTRACT → `value === "1060"`.
  - Cước 100 EUR, rates `{ USD: "25000", EUR: "27500" }` → cước quy đổi 110 USD → `value === "1110"` với hóa đơn 1000 USD.
  - Khoản 25000 VND, rates `{ USD: "25000" }`, hóa đơn 1000 USD → `value === "1001"`.
  - Thiếu tỷ giá EUR → `value === null`, `missingRates` chứa `"EUR"`, `note` nêu "EUR".
  - Kết quả lẻ: hóa đơn 1000 USD, cước 100 EUR, rates `{ USD: "3", EUR: "1" }` → `value === "1033.3333"`; kết quả chẵn không có số 0 thừa (`"1060"`, không phải `"1060.0000"`).
  - Ưu tiên `Adjustment.rate` (tỷ giá đã dùng khi dựng) hơn `rates`.
- [ ] **Step 2: Chạy** `pnpm --filter @kb/core test -- valuation` (hoặc tên file) → FAIL.
- [ ] **Step 3: Viết `allocationTotal`** – Decimal; tỷ giá khoản = `a.rate ?? rateOf(rates, a.currency)`, tỷ giá hóa đơn = `rateOf(rates, currency)`; quy đổi `amount × rateKhoản / rateHĐ`; ADD cộng, SUBTRACT trừ; `toDecimalPlaces(4, ROUND_HALF_UP)`. `note`: "Hàng {x} + cước {y} + BH {z} ± điều chỉnh {w} {cur}, quy đổi theo tỷ giá tờ khai" (phần nào 0 thì bỏ).
- [ ] **Step 4: Test mapping**: lô 120 dòng IDA → chỉ tiêu `TK_TP` có `value` = `allocationTotal`, `source: "SYSTEM"`, `no: "1.51"`, note diễn giải; lô 50 dòng → không có `TK_TP` (hoặc `value` null không điền). EDA lô 51 dòng → `TK_TP` `no: "2.42"`. Người khai đã sửa `TK_TP` (USER) → dựng lại giữ giá trị USER (theo cơ chế giữ USER hiện có của rebuild).
- [ ] **Step 5: Thêm chỉ tiêu `TK_TP` vào mapping IDA/EDA**, mã chỉ tiêu `"TK_TP"` (trùng mã ô bổ sung hiện có trên layout `declaration-layout/ida.ts`/`eda.ts` – kiểm tra `extraFields`/`RULES` trong `contracts/src/declaration-layout/app-fields.ts` không bị hai định nghĩa; nếu `TK_TP` đang là ô bổ sung thì mapping ghi đè giá trị SYSTEM, ô vẫn sửa được). Chỉ điền khi `branchCount(items.length) > 1`.
- [ ] **Step 6: Test `branchPayload`** (`branches.test.ts`): payload of > 1 có `fields.TK_TP = { value: "1110" }` → mọi tờ `TK_TP.value === "1110"`; không có `TK_TP` → `blockers` chứa "1.51"; `TK_TP` USER khác giá trị tính → giữ USER + `warnings` chứa "1.51" và giá trị tính (giá trị tính lấy từ `fields.TK_TP_CALC` nếu mapping lưu, hoặc bỏ qua cảnh báo nếu không có – xem step 7); KTG_VT ô 5 vẫn = TK_TP (test sẵn có còn xanh).
- [ ] **Step 7: Sửa `branchPayload`**: bỏ tự tính `invoiceTotal`; `TK_TP` rỗng → blocker "1.51 (Tổng hệ số phân bổ trị giá) chưa có giá trị – kiểm tra tỷ giá các khoản phí rồi dựng lại tờ khai". Cảnh báo USER-khác-tính: mapping lưu thêm giá trị tính vào trường ẩn `TK_TP_CALC` (không lên FPT, không hiện trên form) khi giá trị hiển thị là USER; `branchPayload` so sánh và thêm warning "1.51 người khai nhập {u} khác giá trị tính {c}". Giữ export `invoiceTotal` nếu nơi khác còn dùng, không thì xóa.
- [ ] **Step 8: Chạy** `pnpm --filter @kb/core test` → PASS; `pnpm --filter @kb/contracts test` → PASS.
- [ ] **Step 9: Commit** `feat(declaration): 1.51/2.42 tổng hệ số phân bổ = hàng + cước + BH ± điều chỉnh cả lô (quy đổi nguyên tệ hóa đơn)`.

### Task 2: Thứ tự khai chính thức (IDC/EDC, IDE/EDE)

**Files:**
- Modify: `packages/contracts/src/customs-summary.ts` (doc + helper), `packages/contracts/src/reason-codes.ts`
- Modify: `packages/core/src/modules/integration/application/branch-send.ts` (`sheetOrderError` nhận nghiệp vụ), `perform-operation.ts`, `_customs-view.ts`
- Modify: `apps/web/src/features/dossier-detail/steps/branch-sheets.ts`, `submit-step.tsx`, `apps/web/src/lib/reason-codes.messages.ts`, `apps/web/src/mocks/api/customs.ts`
- Test: `packages/contracts/src/customs-summary.test.ts`, `packages/core/src/modules/integration/application/__tests__/sheets-order.test.ts` (mới, dùng harness của `customs-use-cases.test.ts`), `apps/web/src/features/dossier-detail/steps/branch-sheets.test.ts`, `apps/web/src/mocks/api/customs.test.ts`

**Interfaces:**
- Produces: `orderedOperation(op: CustomsOperation): "CONTENT" | "DECLARE" | null` (contracts) – CONTENT: IDA/IDA01/EDA/EDA01; DECLARE: IDC/IDE/EDC/EDE (theo `baseOp`); khác → null.
- Produces: reason code `SHEET_ORDER_DECLARE` params `{ sheet, waitFor }`.
- Consumes: `sheetOrderWait` (giữ nguyên vị từ).

- [ ] **Step 1: Test contracts**: `orderedOperation("IDC") === "DECLARE"`, `"EDE"` → DECLARE, `"IDA01"` → CONTENT, `"IDB"` → null, `"AMA"` → null. `sheetOrderWait` với tờ 1 PRE_DECLARED/DECLARED/CLEARED/REJECTED → tờ 2 không chờ; tờ 1 RECALLED → chờ 1.
- [ ] **Step 2: Test core** (`sheets-order.test.ts`), lô 3 tờ:
  - tờ 1 RECALLED, tờ 2 PRE_DECLARED → `performOperation(..., "IDC", 2)` lỗi `reasonCode === "SHEET_ORDER_DECLARE"`, params `{ sheet: 2, waitFor: 1 }`, không tạo outbox.
  - tờ 1 PRE_DECLARED (chưa IDC), tờ 2 PRE_DECLARED → IDC tờ 2 gửi được (D2: không bắt tờ trước đã IDC).
  - tờ 1 CLEARED, tờ 2 PRE_DECLARED → gửi được.
  - lô một tờ → IDC như cũ.
  - `getSubmission` view: tờ 2 dòng IDC `enabled === false`, `reasonCode === "SHEET_ORDER_DECLARE"` khi tờ 1 RECALLED; tương tự dòng IDA của tờ chờ (`SHEET_ORDER`) – sửa tồn đọng view báo bấm được.
- [ ] **Step 3: Chạy** → FAIL.
- [ ] **Step 4: Triển khai**: `sheetOrderError(results, branch, op)` trả `SHEET_ORDER` (CONTENT) hoặc `SHEET_ORDER_DECLARE` (DECLARE); `performOperation` kiểm cho cả DECLARE (lô nhiều tờ, trước `enqueue`); `_customs-view` đặt `enabled: false` + reason cho dòng CONTENT/DECLARE của tờ đang chờ (lô nhiều tờ).
- [ ] **Step 5: i18n** `SHEET_ORDER_DECLARE`: vi "Tờ {sheet}: chờ tờ {waitFor} khai tạm xong trước khi khai chính thức"; en "Sheet {sheet}: waiting for sheet {waitFor} to finish pre-declaration before official declaration"; zh "第{sheet}页：需等待第{waitFor}页完成临时申报后才能正式申报". Sửa `SHEET_ORDER` (cả 3 ngôn ngữ) từ "khai tạm" thành "gửi nội dung": vi "Tờ {sheet}: chờ tờ {waitFor} gửi nội dung trước – truyền theo thứ tự tờ khai".
- [ ] **Step 6: Web**: `branch-sheets.ts` `waitingOn`/`orderLocked` áp cho dòng DECLARE (dùng `orderedOperation`); SheetCard hiện "Chờ tờ j" ở dòng IDC/IDE. Mock `customs.ts` kiểm cùng quy tắc. Test web + mock tương ứng.
- [ ] **Step 7: Chạy** `pnpm --filter @kb/contracts test`, `pnpm --filter @kb/core test`, `pnpm --filter @kb/web test` → PASS.
- [ ] **Step 8: Commit** `feat(integration): khai chính thức tờ k chờ mọi tờ trước khai tạm xong (SHEET_ORDER_DECLARE)`.

### Task 3: Khai chính thức cả lô (backend + mock)

**Files:**
- Create: `packages/core/src/modules/integration/application/declare-all.ts`
- Modify: `process-outbox.ts` (`chainNextBranch` theo `chain`), `branch-send.ts` (nếu cần helper enqueue khai chính thức), `index.ts` (export)
- Create: `apps/web/src/app/api/dossiers/[id]/submission/declare-all/route.ts`
- Modify: `apps/web/src/mocks/api/customs.ts`, `apps/web/src/mocks/customs-sim.ts`, client API của feature (nơi gọi `submission/operations`)
- Test: `packages/core/src/modules/integration/application/__tests__/sheets-declare-all.test.ts`, `apps/web/src/mocks/api/customs.test.ts`, `apps/web/src/app/api/dossiers/[id]/branch-routes.test.ts`

**Interfaces:**
- Produces: `declareAllSheets(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<OperationResult>>`.
- Produces: `performOperation(deps, ctx, dossierId, op, branch = 1, opts?: { chain?: "declare" | "recall" })` – `opts.chain` ghi vào payload outbox.
- Produces: outbox payload thêm `chain?: "declare" | "recall"` (đọc trong `chainNextBranch`; outbox không có `chain` = hành vi cũ).
- Produces: `declareOpFor(stage: CustomsStage, kind: "IDA" | "EDA"): CustomsOperation | null` – PRE_DECLARED → IDC/EDC, AMEND_PRE_DECLARED → IDE/EDE, khác null.

- [ ] **Step 1: Test** lô 3 tờ:
  - cả 3 PRE_DECLARED → `declareAllSheets` tạo đúng 1 outbox IDC tờ 1 (`payload.chain === "declare"`); `processOutbox` tờ 1 SENT → tạo IDC tờ 2; tờ 2 SENT → IDC tờ 3; tờ 3 SENT → không tạo gì.
  - tờ 1 CLEARED, tờ 2–3 PRE_DECLARED → outbox đầu tiên là tờ 2.
  - tờ 2 AMEND_PRE_DECLARED → nghiệp vụ tờ 2 là IDE.
  - IDC tờ 2 bị từ chối → không tạo IDC tờ 3. Người khai xử lý tờ 2 (Gửi lại theo quy tắc hiện có); khi tờ 2 đã DECLARED, gọi lại `declareAllSheets` → gửi IDC tờ 3.
  - có tờ `awaitingContent` → lỗi `reasonCode === "SHEET_ORDER_DECLARE"`; không tờ nào chờ khai chính thức → lỗi INVALID_STATE "Không còn tờ nào chờ khai chính thức"; có outbox PENDING của dossier → lỗi "đang gửi – chờ xong"; BLOCKER/HS chưa xác nhận → lỗi như IDC hiện nay; lô một tờ → lỗi VALIDATION "chỉ dùng cho lô nhiều tờ".
  - gọi `declareAllSheets` hai lần liên tiếp → lần 2 lỗi, chỉ 1 outbox.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Triển khai `declareAllSheets`**: tái dùng các guard của `performOperation` cho tờ đích (gọi `performOperation(deps, ctx, dossierId, op, branch)` với payload gắn `chain: "declare"` qua tham số tùy chọn mới `opts?: { chain?: "declare" | "recall" }` – không nhân bản guard). `chainNextBranch`: outbox SENT có `chain === "declare"` → tờ kế tiếp (`branch` lớn hơn) có `declareOpFor` khác null → `performOperation(..., opts { chain: "declare" })` trong ngữ cảnh worker; lỗi → ghi message + notify như chuỗi khai tạm. Chuỗi khai tạm cũ giữ nguyên nhánh code.
- [ ] **Step 4: Route** `POST /submission/declare-all` (không body) → `declareAllSheets`. Test route trong `branch-routes.test.ts`.
- [ ] **Step 5: Mock** cùng hành vi (tự chạy chuỗi trong `customs-sim.ts` như chuỗi khai tạm mock). Test mock.
- [ ] **Step 6: Chạy** core + web test → PASS.
- [ ] **Step 7: Commit** `feat(integration): khai chính thức cả lô – nối tiếp IDC/IDE tờ 1 → N`.

### Task 4: Web – nút "Khai chính thức tất cả"

**Files:**
- Modify: `apps/web/src/features/dossier-detail/steps/submit-step.tsx`, `submit-step.messages.ts`, `branch-sheets.ts`
- Test: `apps/web/src/features/dossier-detail/steps/submit-step-sheets.test.tsx`, `branch-sheets.test.ts`

**Interfaces:**
- Consumes: route `POST /api/dossiers/[id]/submission/declare-all` (Task 3).
- Produces: `canDeclareAll(sheets: BranchSubmission[]): { ok: boolean; pending: number }` trong `branch-sheets.ts` (cùng điều kiện spec 1.2: không tờ `awaitingContent`, ≥ 1 tờ PRE_DECLARED/AMEND_PRE_DECLARED, không tờ SENDING).

- [ ] **Step 1: Test**: lô 3 tờ PRE_DECLARED → nút "Khai chính thức tất cả (3 tờ)" hiện; bấm → hộp xác nhận → xác nhận gọi đúng route; tờ 1 RECALLED → nút ẩn; lô một tờ → nút ẩn; axe không lỗi.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Triển khai** bằng `Button` + `Dialog` của `@kb/ui`, chữ qua messages. vi: "Khai chính thức tất cả ({n} tờ)", hộp: "Gửi khai chính thức lần lượt {n} tờ theo thứ tự. Lỗi ở tờ nào sẽ dừng ở tờ đó."; en/zh tương ứng.
- [ ] **Step 4: Chạy** `pnpm --filter @kb/web test` → PASS.
- [ ] **Step 5: Commit** `feat(web): nút khai chính thức tất cả tờ`.

### Task 5: Ảnh chụp nội dung đã gửi + guard tờ chưa gọi về không được đổi

**Files:**
- Modify: `packages/core/src/modules/integration/domain/branches.ts` (hàm thuần)
- Modify: `branch-send.ts`, `perform-operation.ts`, `submit-declaration.ts`, `process-outbox.ts`, `reopen-declaration.ts`, `get-submission.ts`/`_customs-view.ts`
- Modify: `packages/core/src/modules/declaration/application/declaration.ts` (`approveDeclaration` gọi port), `declaration/application/ports.ts`
- Modify: `apps/web/src/container.ts`, `apps/worker/src/container.ts` (nối port), `packages/contracts/src/reason-codes.ts`, `packages/contracts/src/api/customs.ts` (`BranchSubmission.sentChanges`), `apps/web/src/lib/reason-codes.messages.ts`, mock `customs.ts`/`declaration.ts`
- Test: `integration/domain/__tests__/branches.test.ts`, `integration/application/__tests__/sheets-sent-guard.test.ts` (mới), `integration/application/__tests__/integration.test.ts` (testcontainers: `raw.sent` lưu/đọc theo nhánh), `declaration/application/__tests__/declaration-use-cases.test.ts`

**Interfaces:**
- Produces: `type SentSnapshot = { common: Record<string, string>; lines: string }`.
- Produces: `sheetSnapshot(p: DeclarationPayload, no: number): SentSnapshot` – `common`: mọi `fields` trừ `TK_FIC`, `TK_BNO`, `TK_TP_CALC` và mã bắt đầu `HANG.`; cộng khóa `@ADJ` (JSON ổn định của `adjustments`), `@CONT` (containers), `@CUR` (currency). `lines`: JSON ổn định của các dòng thuộc tờ (đủ thuộc tính item) + các `fields` `HANG.<id>.*` của dòng đó.
- Produces: `sentSheetsDiff(p: DeclarationPayload, sheets: { no: number; stage: CustomsStage; declarationNo: string | null; sent: SentSnapshot | null }[]): { no: number; common: string[]; lines: boolean }[]` – chỉ tờ còn hiệu lực (có số, không `recallExempt`, không `awaitingContent`) có `sent`; `common` = mã chỉ tiêu khác nhau.
- Produces: `sentSheetsError(p, sheets): DomainError | null` – reason code `SENT_SHEETS_CHANGED` params `{ sheets: "2, 3", fields: "1.51, …" }` (số chỉ tiêu nếu tra được từ catalog, không thì mã).
- Produces: port `declaration.sentSheetsGuard?: (orgId: string, dossierId: string) => Promise<DomainError | null>`.
- Produces: `BranchSubmission.sentChanges: { common: string[]; lines: boolean } | null`.

- [ ] **Step 1: Test thuần** `sheetSnapshot`/`sentSheetsDiff`: lô 120 dòng; đổi `TK_FIC` → không khác; đổi chỉ tiêu `CQHQ` → `common` chứa `CQHQ` ở mọi tờ còn hiệu lực; đổi `amount` dòng 60 (tờ 2) → tờ 2 `lines: true`, tờ 1, 3 `lines: false`; đổi `HANG.<id dòng 10>.X` → chỉ tờ 1 `lines: true`; đổi `TK_TP` → `common` chứa `TK_TP`; tờ RECALLED/CLEARED/không `sent` → không xét.
- [ ] **Step 2: Test use case** (`sheets-sent-guard.test.ts`):
  - IDA tờ 1 SENT → `results` tờ 1 có `raw.sent` = `sheetSnapshot` của payload đã gửi (lấy từ `outbox.payload.sent`, ghi ở bước build).
  - Tờ 1–3 PRE_DECLARED có `sent`; chỉ tờ 2 RECALLED; sửa chỉ tiêu chung trên payload → `approveDeclaration` lỗi `SENT_SHEETS_CHANGED` (sheets "1, 3"); sửa dòng tờ 2 không đổi 1.51 (vd mô tả hàng) → duyệt được, truyền chỉ gửi tờ 2 (IDA) với TK_FIC = số tờ 1.
  - Sửa số tiền dòng tờ 2 → `TK_TP` đổi → duyệt lỗi, `fields` chứa "1.51".
  - `reopenDeclaration` lô nhiều tờ khi chỉ tờ 2 RECALLED → **được** (bỏ R3); `performOperation`/`submitDeclaration` không còn lỗi `SHEETS_RECALL_FIRST` khi chỉ gọi về một phần mà nội dung tờ còn hiệu lực không đổi.
  - Lô một tờ: không kiểm (không có `sentSheetsGuard` lỗi).
- [ ] **Step 3: Chạy** → FAIL.
- [ ] **Step 4: Triển khai**: lúc build payload nội dung lô nhiều tờ (`perform-operation.ts` nhánh `of > 1`, `enqueueBranchPreDeclare`) thêm `sent: sheetSnapshot(snap.payload, branch)` vào outbox payload; `process-outbox.ts` khi nội dung SENT ghi `raw.sent` từ `ob.payload.sent`. Gắn `sentSheetsError` ở: `approveDeclaration` (qua port), `performOperation` (thay `recallFirstError`), `submitDeclaration` (thay `recallFirstError`), `chainNextBranch`/`enqueueBranchPreDeclare`. Bỏ `recallFirstError` khỏi `reopenDeclaration`. Xóa `recallFirstError` và reason code `SHEETS_RECALL_FIRST` nếu không còn nơi dùng (kể cả messages + mock). `getSubmission` điền `sentChanges`.
- [ ] **Step 5: i18n** `SENT_SHEETS_CHANGED`: vi "Tờ {sheets} chưa gọi về nhưng nội dung đã khai bị đổi ({fields}) – gọi về các tờ này hoặc hoàn tác"; en "Sheets {sheets} were not recalled but their declared content changed ({fields}) – recall these sheets or undo the change"; zh "第{sheets}页未召回，但已申报内容已更改（{fields}）——请召回这些页或撤销更改". Khi chỉ dòng hàng đổi, `fields` = "dòng hàng"/"line items"/"商品行" (map ở web theo param `linesOnly`).
- [ ] **Step 6: Integration test** (testcontainers): upsert kết quả nhánh 2 có `raw.sent` → đọc lại đúng (không cần migration nếu `raw` là jsonb – xác nhận).
- [ ] **Step 7: Chạy** `pnpm --filter @kb/core test`, `pnpm --filter @kb/web test` → PASS.
- [ ] **Step 8: Commit** `feat(integration): ảnh chụp nội dung đã gửi từng tờ – chặn duyệt/truyền khi tờ chưa gọi về bị đổi (thay R3)`.

### Task 6: Phạm vi sửa tờ khai theo tờ đã gọi về

**Files:**
- Modify: `packages/contracts/src/declaration-layout/app-fields.ts` (+ export `index.ts`)
- Modify: `packages/core/src/modules/declaration/application/declaration.ts`, `value-charges.ts`, `line-items.ts`, `hs-classification.ts`, `agent-run.ts`, `ports.ts`
- Modify: `packages/core/src/modules/extraction/application/_field-edit.ts`, `finish-reading.ts` (+ port extraction)
- Modify: `apps/web/src/container.ts`, `apps/worker/src/container.ts` (port `customsSheets`), mock `apps/web/src/mocks/api/declaration.ts`, `value-charges.ts`, `ocr.ts`
- Test: `packages/contracts/src/declaration-layout/app-fields.test.ts`, `declaration/application/__tests__/declaration-use-cases.test.ts`, `value-charges.test.ts`, `hs-classification.test.ts`, extraction field-edit test, mock tests

**Interfaces:**
- Produces (contracts):
  ```ts
  type EditSheet = { no: number; stage: CustomsStage; declarationNo: string | null };
  type DeclarationEditScope = { common: DeclarationEditMode; lines: Record<number, DeclarationEditMode>; addRemoveLines: boolean; lockedSheets: number[] };
  function declarationEditScope(status: DeclarationStatus, sheets: EditSheet[]): DeclarationEditScope;
  type EditTarget = { kind: "COMMON" } | { kind: "LINE"; sheet: number } | { kind: "ADD_REMOVE_LINES" } | { kind: "REBUILD" };
  function editBlockFor(scope: DeclarationEditScope, target: EditTarget): { reasonCode: "COMMON_LOCKED_SHEETS" | "LINE_SHEET_LOCKED" | "DECLARATION_LOCKED"; params: Record<string, string | number> } | null;
  ```
  `REBUILD`/`ADD_REMOVE_LINES` bị chặn khi `common === "LOCKED"` hoặc `addRemoveLines === false`. Lô một tờ (`sheets.length <= 1`): `common = lines[1] = declarationEditMode(status, stage)`, `addRemoveLines = common !== "LOCKED"`.
- Produces: reason codes `COMMON_LOCKED_SHEETS` `{ sheets }` – vi "Thông tin chung: tờ {sheets} chưa gọi về – gọi về tất cả tờ để sửa"; `LINE_SHEET_LOCKED` `{ sheet }` – vi "Dòng hàng tờ {sheet} chưa gọi về – không sửa được" (en/zh đủ).
- Produces: port `declaration.customsSheets?: (orgId, dossierId) => Promise<EditSheet[]>` (thay dần `customsStage`; giữ `customsStage` nếu nơi khác dùng), port tương tự cho extraction.
- Produces: `sheetOfLine(lineNos: number[], lineNo: number): number` (contracts, dựa `branchRanges`).

- [ ] **Step 1: Test contracts** `declarationEditScope` – ma trận:
  - DRAFT, 3 tờ, chỉ tờ 2 RECALLED, tờ 1, 3 PRE_DECLARED → `common: "LOCKED"`, `lines {1:"LOCKED",2:"FULL",3:"LOCKED"}`, `addRemoveLines: false`, `lockedSheets [1,3]`.
  - tất cả RECALLED → `common: "FULL"`, `addRemoveLines: true`.
  - tờ 1 RECALLED, tờ 2 AMEND_RECALLED, tờ 3 CLEARED → `common: "AMEND"`, lines `{1:"FULL",2:"AMEND",3:"LOCKED"}`, `lockedSheets []`.
  - tờ 3 NOT_SENT (chưa từng gửi), tờ 1–2 RECALLED → `common: "FULL"`, `lines[3] = "FULL"`.
  - APPROVED → mọi thứ LOCKED.
  - lô một tờ RECALLED → `common: "FULL"`, AMEND_RECALLED → `"AMEND"`, PRE_DECLARED+DRAFT → `"LOCKED"` (bằng `declarationEditMode`).
  - `editBlockFor` cho từng target trả đúng reason code/params.
- [ ] **Step 2: Test backend guard** (chỉ tờ 2 RECALLED, tờ khai DRAFT):
  - `updateDeclarationField(…, "CQHQ", …)` → lỗi `COMMON_LOCKED_SHEETS`; `updateDeclarationField(…, "HANG.<id dòng 60>.<ô>", …)` → được; dòng 10 → lỗi `LINE_SHEET_LOCKED` sheet 1.
  - `saveValueCharges` → lỗi `COMMON_LOCKED_SHEETS`.
  - `confirmHs`/`unconfirmHs`/`reclassifyHs`/`answerHsQuestion` dòng 10 → lỗi; dòng 60 → được.
  - `startAgentRun` (dựng lại) → lỗi.
  - sửa chỉ tiêu chứng từ header (extraction) → lỗi; ô dòng hàng chứng từ của dòng 60 → được, dòng 10 → lỗi; `finishReading` → lỗi.
  - Khi mọi tờ RECALLED → tất cả được (như trước). Lô một tờ → hành vi cũ (test sẵn có xanh).
- [ ] **Step 3: Chạy** → FAIL.
- [ ] **Step 4: Triển khai** `declarationEditScope`, `editBlockFor`, `sheetOfLine` trong `app-fields.ts`; `fieldEditBlock` giữ cho AMEND/LOCKED theo `lines[n]`/`common`. Nối guard vào từng use case trên (một lần gọi `editBlockFor` mỗi use case; dòng → tờ bằng `sheetOfLine` theo `lineNo` của dòng trong danh sách dòng hiện tại). Extraction: ô thuộc dòng hàng xác định theo khóa ô (tra cách `_field-edit.ts`/`_remerge.ts` gắn ô với dòng invoice); không xác định → coi là COMMON.
- [ ] **Step 5: Mock** dùng cùng hàm contracts. Test mock.
- [ ] **Step 6: Chạy** contracts + core + web test → PASS.
- [ ] **Step 7: Commit** `feat(declaration): phạm vi sửa theo tờ đã gọi về – khóa chỉ tiêu chung khi chỉ gọi về một phần`.

### Task 7: Gọi về tất cả + tự mở lại khi xong

**Files:**
- Create: `packages/core/src/modules/integration/application/recall-all.ts`
- Modify: `process-outbox.ts` (chuỗi `chain: "recall"`; điều kiện `markDraft`), `perform-operation.ts` (opts `chain`, cho gọi về khi tờ khai DRAFT), `index.ts`
- Create: `apps/web/src/app/api/dossiers/[id]/submission/recall-all/route.ts`
- Modify: mock `customs.ts`, `customs-sim.ts`
- Test: `integration/application/__tests__/sheets-recall-all.test.ts` (mới), mock test, `branch-routes.test.ts`

**Interfaces:**
- Produces: `recallAllSheets(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<OperationResult & { sheets: number[] }>>`.
- Produces: `recallOpFor(row availability)` – chọn nghiệp vụ gọi về đang `enabled` trong `operationAvailability` của tờ (IDB/EDB hoặc IDD/EDD).
- Consumes: `chain` opts của `performOperation` (Task 3).

- [ ] **Step 1: Test**:
  - tờ 1 PRE_DECLARED, tờ 2 DECLARED, tờ 3 CLEARED → `recallAllSheets` tạo IDB tờ 1 (`chain: "recall"`), trả `sheets [1, 2]`; tờ 1 SENT → IDD tờ 2; tờ 2 SENT → hết chuỗi.
  - tờ khai chỉ `markDraft` sau khi tờ 2 (lệnh cuối) gọi về thành công; sau tờ 1 thì chưa (status vẫn SUBMITTED/APPROVED). Dossier `step === "review"`. Audit `DECLARATION_REOPENED` `detail.scope === "ALL"`.
  - gọi về **một** tờ (performOperation IDB tờ 2, không chain) thành công → `markDraft` ngay, audit `detail.scope = [2]` (hành vi hiện có + scope).
  - một tờ đích có outbox PENDING → lỗi, không tạo outbox nào (Review Focus 1).
  - lỗi gọi về tờ 1 → dừng, không gửi tờ 2; gọi lại `recallAllSheets` → chỉ gửi tờ chưa gọi về.
  - tờ khai DRAFT (đã gọi về tờ 2), gọi `recallAllSheets` → gọi về tờ 1, 3; xong không gọi `markDraft` lần nữa (đã DRAFT), `declarationEditScope` thành FULL (Review Focus 5).
  - lô một tờ → lỗi VALIDATION.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Triển khai**: tờ đích = tờ còn hiệu lực; kiểm trước mọi tờ có nghiệp vụ gọi về `enabled` (không thì lỗi liệt kê tờ + lý do); gửi tờ đầu qua `performOperation(..., op, branch, { chain: "recall" })`. `chainNextBranch`: `chain === "recall"` → tờ đích kế tiếp còn hiệu lực. `process-outbox.ts`: thay `markDraft` vô điều kiện bằng: `isRecallOperation && op !== "AMB"` **và** (outbox không có `chain` **hoặc** không còn tờ đích kế tiếp) **và** tờ khai chưa DRAFT → `markDraft` + audit scope + dossier `step: "review"`. Notify giữ nguyên, thêm số tờ.
- [ ] **Step 4: Route** `POST /submission/recall-all`. Mock cùng hành vi.
- [ ] **Step 5: Chạy** core + web test → PASS.
- [ ] **Step 6: Commit** `feat(integration): gọi về tất cả tờ (IDB/IDD theo giai đoạn, nối tiếp) – tự mở lại khi lệnh cuối xong`.

### Task 8: Web – hộp gọi về hai lựa chọn, tiến độ, tự về Review

**Files:**
- Modify: `apps/web/src/features/dossier-detail/steps/submit-step.tsx`, `submit-step.messages.ts`, `branch-sheets.ts`
- Modify: điều hướng bước của dossier-detail (nơi đọc `step` của hồ sơ) để tự chuyển `?step=review` kèm thông báo
- Test: `submit-step-sheets.test.tsx`, `branch-sheets.test.ts`

**Interfaces:**
- Consumes: `POST /submission/recall-all` (Task 7), `POST /submission/operations` (gọi về một tờ).
- Produces: `recallProgress(sheets: BranchSubmission[]): { done: number; total: number } | null` (đang có chuỗi gọi về: tờ có lệnh gọi về WAITING/SENDING).

- [ ] **Step 1: Test**: lô 3 tờ, bấm IDB tờ 2 → hộp có 2 lựa chọn (RadioGroup `@kb/ui`), mặc định "Gọi về tất cả tờ"; xác nhận mặc định → gọi `recall-all`; chọn "Chỉ gọi về tờ 2" → gọi `operations` `{ operation: "IDB", branch: 2 }`; lô một tờ → hộp cũ (không radio); khi đang gọi về hiện "Đang gọi về 1/2 tờ"; hồ sơ chuyển `review` → điều hướng sang Review và hiện thông báo đúng kiểu (tất cả / tờ 2); axe sạch.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Triển khai** + messages vi/en/zh: "Gọi về tất cả tờ – sửa thông tin chung và dòng hàng"; "Chỉ gọi về tờ {sheet} – chỉ sửa dòng hàng của tờ {sheet}, thông tin chung bị khóa"; "Đang gọi về {done}/{total} tờ"; "Đã gọi về {n} tờ – sửa tờ khai rồi duyệt lại"; "Đã gọi về tờ {list} – chỉ sửa dòng hàng của các tờ này; thông tin chung bị khóa".
- [ ] **Step 4: Chạy** `pnpm --filter @kb/web test` → PASS.
- [ ] **Step 5: Commit** `feat(web): gọi về tất cả / một tờ, tiến độ gọi về, tự về bước Review`.

### Task 9: Web – bước Review theo phạm vi sửa

**Files:**
- Modify: `apps/web/src/features/dossier-detail/steps/review-step.tsx`, `review-step.messages.ts`, `apps/web/src/features/declaration-form/dossier-declaration-form.tsx`, bảng dòng hàng của bước Review (nơi sửa dòng/HS), khu chi phí/khoản điều chỉnh
- Test: test của review-step / declaration-form tương ứng (tạo `review-step-scope.test.tsx` nếu chưa có)

**Interfaces:**
- Consumes: `declarationEditScope`, `editBlockFor` (Task 6), `SubmissionView.branches[].sentChanges` (Task 5), `recall-all` (Task 7).

- [ ] **Step 1: Test** (chỉ tờ 2 RECALLED, DRAFT): form chỉ tiêu chung chỉ đọc; banner "Thông tin chung: tờ 1, 3 chưa gọi về…" có nút "Gọi về các tờ còn lại để sửa thông tin chung" → gọi `recall-all`; dòng tờ 1/3 chỉ đọc kèm nhãn "Tờ n – chưa gọi về", dòng tờ 2 sửa được; không có nút thêm/xóa dòng; `sentChanges` tờ 1 `common: ["TK_TP"]` → cảnh báo "1.51 đã đổi so với tờ đã khai – phải gọi về tất cả tờ"; mọi tờ RECALLED → form đầy đủ như cũ; axe sạch.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Triển khai** thay `declarationEditMode(decl.status, subQ.data?.stage)` bằng `declarationEditScope(decl.status, branches)`; form header dùng `scope.common`; ô dòng dùng `scope.lines[sheetOfLine(...)]`. Messages vi/en/zh. Thiếu biến thể component → thêm vào `@kb/ui` (skill `adding-ui-component`).
- [ ] **Step 4: Chạy** `pnpm --filter @kb/web test`, `pnpm lint` → PASS.
- [ ] **Step 5: Commit** `feat(web): bước Review khóa chỉ tiêu chung và dòng tờ chưa gọi về`.

### Task 10: Tài liệu, kiểm trình duyệt, cổng chất lượng

**Files:**
- Modify: `docs/QUY-TRINH-NGHIEP-VU.md` §9.3, `docs/PRODUCT.md`

- [ ] **Step 1:** Cập nhật §9.3: thứ tự khai chính thức (D2), khai chính thức cả lô, gọi về tất cả/một tờ + phạm vi sửa, tự mở lại, guard `SENT_SHEETS_CHANGED` (thay R3), công thức 1.51. `PRODUCT.md`: mô tả ngắn hai nút mới.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test` → xanh (chạy từng package nếu thiếu bộ nhớ: `pnpm --filter <pkg> test`).
- [ ] **Step 3:** Build + chạy web chế độ mock, trên `dos_028`: truyền 3 tờ → "Khai chính thức tất cả" → gọi về một tờ → Review khóa đúng → sửa dòng tờ đó → duyệt → truyền chỉ tờ đó; gọi về tất cả → Review đầy đủ; kiểm 1.51 trên bản in/xem trước các tờ bằng nhau. Chụp sáng + tối, desktop + mobile.
- [ ] **Step 4: Commit** `docs: quy trình tách tờ khai – khai chính thức cả lô, gọi về theo phạm vi, 1.51`.
