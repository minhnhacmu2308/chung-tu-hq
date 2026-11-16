# Trạng thái tiến độ hồ sơ + mở lại khi chưa có số + xác nhận hủy tờ khai – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn hồ sơ hiện một trạng thái tiến độ (khai báo + thông quan, luồng kèm khi chưa thông quan) tính từ trạng thái từng tờ khai; mở lại được khi chưa có số tờ khai; người khai xác nhận được tờ khai đã hủy.

**Architecture:** Hàm thuần mới trong `@kb/contracts` (`sheetStatusOf` – 3 nhóm/tờ, `dossierProgressOf` – tiến độ hồ sơ) chạy trên dữ liệu tờ khai rút gọn (`SheetBrief`) mà `CustomsSummary` mang thêm (backend `dossierCustomsSummaries` + mock `customsSummaryOf`). `dossiers.status` giữ nguyên ý nghĩa nội bộ, không đổi bảng/migration. Thêm stage `CANCELLED` (terminal) cho tờ khai, use case xác nhận hủy, nới điều kiện mở lại.

**Tech Stack:** TypeScript, Zod, Next.js (apps/web), vitest, Playwright, `@kb/ui`.

**Spec:** `docs/superpowers/specs/2026-11-16-trang-thai-ho-so-design.md`

## Global Constraints

- Mọi truy vấn/ghi có `orgId`; ngày nghiệp vụ `YYYY-MM-DD`; dữ liệu ngoài (route body) parse bằng Zod (CLAUDE.md bất biến 1, 4, 9).
- Lỗi/lý do backend gửi mã ổn định (`reason-codes`) + nhãn vi/en/zh (`lib/reason-codes.messages.ts`); mọi chữ giao diện mới trong `*.messages.ts` đủ vi/en/zh.
- Giao diện chỉ `@kb/ui` + token; nhãn trạng thái qua `StatusBadge` (thêm vào `STATUS_META` nếu thiếu), không tự dựng bảng `{label, tone}`; xác nhận hủy dùng `ConfirmDialog` (`tone="danger"`, `irreversible`).
- Nguồn dữ liệu mock và http cùng hành vi (mock gọi chung hàm thuần contracts).
- Màn review chỉ là bản in (form cũ đã xóa – không làm gì trên form cũ).
- Không đổi bảng `dossiers`, không đổi thời điểm ghi `dossiers.status = SUBMITTED`.
- Không commit theo từng task: một commit cuối sau 2 agent `hq-review-backend` + `hq-review-frontend` PASS, có khối `Review:` (rule `review-truoc-commit`).
- Nhãn (đúng chữ, vi): tiến độ `Chưa khai báo` · `Đã khai tạm` · `Đã khai chính thức` · `Gọi sửa đổi` · `Khai tạm sửa đổi` · `Đã khai chính thức sửa đổi` · `Đã thông quan` · `Đã khai sửa đổi sau thông quan` · `Đã hủy` · `Bị từ chối`; dòng phụ `Đang xử lý chứng từ` · `Cần kiểm tra` · `Đã duyệt, chờ truyền` · `Đang gửi` · `Truyền lỗi` · `Đang gọi sửa` · `Đang khai sửa sau thông quan`; luồng `Luồng xanh` · `Luồng vàng` · `Luồng đỏ`.

## Review Focus

1. Lô có tờ đã hủy và các tờ còn lại đã thông quan → hồ sơ "Đã thông quan" và `syncDossierClearance` vẫn chuyển hồ sơ CLEARED (Task 2).
2. Kết quả cũ không có `raw.stage` (dữ liệu trước khi có stage) → `stageOf` fallback, `SheetBrief` vẫn đúng (Task 2).
3. Lô 2 tờ: tờ 1 đã có số, tờ 2 truyền lỗi chưa số → **không** mở lại (DOSSIER_LOCKED) (Task 3).
4. Xác nhận hủy hai lần / hai người cùng lúc → lần sau trả OK, không ghi audit/thông điệp lặp (Task 4).
5. Hồ sơ chưa từng truyền (không có `customs`) → "Chưa khai báo" với dòng phụ theo `dossiers.status` (Task 1, Task 5).

---

### Task 1: Hàm thuần trạng thái tờ khai / tiến độ hồ sơ (contracts)

**Files:**
- Modify: `packages/contracts/src/customs-flow.ts` (thêm `"CANCELLED"` vào `CustomsStageSchema`, comment "Người khai xác nhận Hải quan đã hủy tờ khai"; mọi nghiệp vụ không khả dụng khi CANCELLED như REJECTED)
- Modify: `packages/contracts/src/customs-summary.ts` (`recallExempt` gồm CANCELLED; `dossierCustomsSummary`: tờ CANCELLED không tính vào `of`/`cleared`, `allCleared` = còn ≥1 tờ không hủy và mọi tờ không hủy đã thông quan)
- Modify: `packages/contracts/src/dto/dossier.ts` (`SheetBriefSchema`, `CustomsSummarySchema.sheets`)
- Create: `packages/contracts/src/dossier-progress.ts` (+ export ở `index.ts`)
- Test: `packages/contracts/src/dossier-progress.test.ts`, bổ sung `customs-summary.test.ts`

**Interfaces – Produces:**
```ts
// dto/dossier.ts
export const SheetBriefSchema = z.object({ no: z.number().int().min(1), stage: CustomsStageSchema, state: SubmissionStateSchema,
  channel: CustomsChannelSchema.nullable(), amendments: z.number().int().nonnegative(), postAmendments: z.number().int().nonnegative() });
export type SheetBrief = z.infer<typeof SheetBriefSchema>;
// CustomsSummarySchema thêm: sheets: z.array(SheetBriefSchema).default([])

// dossier-progress.ts
export type DeclarationCode = "NOT_DECLARED" | "PRE_DECLARED" | "DECLARED" | "AMEND_RECALLED" | "AMEND_PRE_DECLARED" | "AMENDED" | "POST_AMENDED" | "CANCELLED" | "REJECTED";
export type SheetSub = "RECALLING" | "POST_EDITING" | "SEND_FAILED";
export function sheetStatusOf(s: SheetBrief): { declaration: DeclarationCode; channel: CustomsChannel | null; cleared: boolean; sub: SheetSub | null };
export type ProgressCode = "NOT_DECLARED" | "PRE_DECLARED" | "DECLARED" | "AMEND_RECALLED" | "AMEND_PRE_DECLARED" | "AMENDED" | "CLEARED" | "POST_AMENDED" | "CANCELLED" | "REJECTED" | "DOSSIER_CANCELLED";
export type ProgressSub = "PROCESSING" | "NEEDS_REVIEW" | "APPROVED_WAITING" | "SENDING" | "SEND_FAILED" | "RECALLING" | "POST_EDITING";
export const PROGRESS_ORDER: readonly ProgressCode[]; // NOT_DECLARED … POST_AMENDED theo §3.1
export function dossierProgressOf(status: DossierStatus, sheets: SheetBrief[]): {
  progress: ProgressCode; sub: ProgressSub | null; channel: CustomsChannel | null; done: number; of: number; flags: ("SEND_FAILED" | "REJECTED")[] };
```

Quy tắc (spec §2, §3.1, §4.2):
- `sheetStatusOf`: NOT_SENT→NOT_DECLARED; PRE_DECLARED→PRE_DECLARED; RECALLED→PRE_DECLARED + RECALLING; DECLARED→AMENDED nếu amendments>0, không thì DECLARED; AMEND_RECALLED, AMEND_PRE_DECLARED giữ tên; CLEARED/POST_* → cleared=true, declaration = POST_AMENDED nếu postAmendments>0, không thì AMENDED nếu amendments>0, không thì DECLARED; POST_EDITING/POST_PRE_DECLARED/POST_RECALLED → sub POST_EDITING; CANCELLED, REJECTED giữ tên; `state === "SEND_FAILED"` → sub SEND_FAILED.
- `dossierProgressOf`: `status === "CANCELLED"` → DOSSIER_CANCELLED. Bỏ tờ CANCELLED và REJECTED khỏi tập tính; tờ REJECTED thêm flag REJECTED; tất cả bị loại → REJECTED nếu có tờ REJECTED, không thì CANCELLED. Mỗi tờ còn lại → mức (cleared → POST_AMENDED nếu postAmendments>0 không thì CLEARED; còn lại = declaration của tờ). `progress` = mức nhỏ nhất theo PROGRESS_ORDER; `done` = số tờ có mức ≥ progress; `of` = số tờ còn lại; không có tờ → NOT_DECLARED, done 0, of 1.
- `sub`: progress NOT_DECLARED → theo status (DRAFT/PROCESSING→PROCESSING, NEEDS_REVIEW→NEEDS_REVIEW, APPROVED→APPROVED_WAITING, SUBMITTED→SEND_FAILED nếu có tờ state SEND_FAILED, không thì SENDING); khác → RECALLING/POST_EDITING nếu có tờ ở mức progress mang sub đó; flag SEND_FAILED khi có tờ state SEND_FAILED.
- `channel`: chỉ khi progress ∈ {DECLARED, AMEND_RECALLED, AMEND_PRE_DECLARED, AMENDED}: luồng nặng nhất (RED > YELLOW > GREEN) trong các tờ chưa thông quan có luồng; khác → null.

- [ ] **Step 1: Viết test thất bại** `dossier-progress.test.ts`:
  - `sheet_maps_each_stage`: bảng đủ các stage ở trên (vd `{stage:"DECLARED",amendments:1}` → `AMENDED`; `{stage:"CLEARED",amendments:1,postAmendments:0}` → `{declaration:"AMENDED",cleared:true}`; `{stage:"POST_PRE_DECLARED"}` → sub `POST_EDITING`; `{stage:"RECALLED"}` → `PRE_DECLARED` + `RECALLING`).
  - `progress_not_declared_sub_by_status`: `[]` với DRAFT/NEEDS_REVIEW/APPROVED → sub PROCESSING/NEEDS_REVIEW/APPROVED_WAITING; SUBMITTED + tờ NOT_SENT state APPROVED → SENDING; state SEND_FAILED → SEND_FAILED + flag.
  - `progress_cleared_and_post`: 1 tờ CLEARED → CLEARED, channel null; CLEARED postAmendments 1 → POST_AMENDED.
  - `progress_channel_only_before_clearance`: DECLARED RED → channel RED; lô [DECLARED GREEN, DECLARED RED] → RED, done 2 of 2.
  - `lot_slowest_with_count`: [CLEARED, DECLARED, CLEARED] → DECLARED, done 3 of 3; [CLEARED, PRE_DECLARED] → PRE_DECLARED done 2 of 2; [CLEARED, CANCELLED] → CLEARED done 1 of 1 (Review Focus 1).
  - `all_cancelled_or_rejected`: [CANCELLED] → CANCELLED; [REJECTED] → REJECTED + flag; dossier CANCELLED → DOSSIER_CANCELLED.
  - `customs-summary.test.ts`: [CLEARED, CANCELLED] → allCleared true, of 1.
- [ ] **Step 2:** `pnpm --filter @kb/contracts test dossier-progress customs-summary` → FAIL (chưa có hàm).
- [ ] **Step 3:** Cài đặt theo Interfaces + quy tắc; `pnpm --filter @kb/contracts typecheck` (enum mới có thể làm `switch` exhaustive ở core/web báo lỗi → xử lý ở Task 2/5, ghi lại danh sách).
- [ ] **Step 4:** Test PASS.

### Task 2: Backend + mock mang `sheets`, hỗ trợ stage CANCELLED

**Files:**
- Modify: `packages/core/src/modules/integration/application/get-submission.ts` (`dossierCustomsSummaries` thêm `sheets` từ `ResultRow`: `stageOf(r)`, `r.state`, `r.channel`, `r.raw?.amendments ?? 0`, `r.raw?.postAmendments ?? 0`, `no = r.branch`)
- Modify: `packages/core/src/modules/integration/domain/state-machine.ts` (`coarseState("CANCELLED")` → `"REJECTED"`; `TERMINAL` gồm CANCELLED) và mọi `switch`/bảng theo `CustomsStage` mà typecheck báo
- Modify: `packages/core/src/modules/integration/application/_clearance.ts` (dùng `allCleared` mới – bỏ tờ hủy)
- Modify: `apps/web/src/mocks/api/customs.ts` (`customsSummaryOf` thêm `sheets` cùng quy tắc; channel/amendments từ `db.customsFlows`)
- Test: `packages/core/src/modules/integration/application/__tests__/customs-use-cases.test.ts` (hoặc file test summary hiện có), `apps/web/src/mocks/api/customs.test.ts`

**Interfaces – Consumes:** `SheetBrief`, `dossierCustomsSummary` (Task 1). **Produces:** `Dossier.customs.sheets` có cho mọi hồ sơ đã có kết quả truyền.

- [ ] **Step 1: Test thất bại:** `summaries_include_sheets` – kết quả 2 tờ (tờ 1 DECLARED RED amendments 1, tờ 2 CLEARED) → `sheets` đúng 2 phần tử với các trường trên; `legacy_result_without_stage` – `raw` không có `stage` nhưng `state: "CLEARED"` → `sheets[0].stage` = giá trị `stageOf` trả (Review Focus 2); `clearance_ignores_cancelled` – tờ 1 CLEARED, tờ 2 CANCELLED → `syncDossierClearance` đặt hồ sơ CLEARED (Review Focus 1); mock: `customsSummaryOf` cùng hình dạng.
- [ ] **Step 2:** Chạy test → FAIL.
- [ ] **Step 3:** Cài đặt.
- [ ] **Step 4:** `pnpm typecheck` + test core/web liên quan PASS.

### Task 3: Mở lại khi chưa có số tờ khai

**Files:**
- Modify: `packages/core/src/modules/integration/application/reopen-declaration.ts`
- Modify: `packages/contracts/src/reason-codes.ts` (+ `DECLARATION_SENDING`), `apps/web/src/lib/reason-codes.messages.ts` (vi: "Đang gửi tờ khai tới Hải quan – chờ có kết quả rồi mới mở lại để sửa được", en/zh dịch)
- Modify: `apps/web/src/mocks/api/declaration.ts` (`reopenDeclaration` cùng quy tắc)
- Test: `packages/core/src/modules/integration/application/__tests__/reopen-declaration.test.ts` (tạo nếu chưa có, theo harness hiện có), mock test

Quy tắc mới (thay nhánh `SUBMITTED && rejectedBeforeNumber`): hồ sơ SUBMITTED, **mọi** tờ `!declarationNo && stageOf === "NOT_SENT"`, và **không** có outbox `PENDING` của nghiệp vụ nội dung (`isContentOperation`) cho hồ sơ (dùng cổng outbox đang dùng ở `perform-operation.ts:78`) → mở lại như nhánh hiện có (markDraft, reset kết quả về APPROVED/NOT_SENT, audit `DECLARATION_REOPENED` với `detail.reason` = `"SEND_FAILED"` nếu có tờ SEND_FAILED). Có outbox nội dung PENDING → `reasonError("DECLARATION_SENDING", …)`. Có tờ đã có số → `DOSSIER_LOCKED` như nay.

- [ ] **Step 1: Test thất bại:** `reopen_send_failed_no_number` (OK, như cũ); `reopen_all_sheets_unnumbered_not_pending` (2 tờ NOT_SENT, state APPROVED, không outbox PENDING → OK); `reopen_while_sending` (outbox IDA PENDING → `DECLARATION_SENDING`); `reopen_one_sheet_numbered` (tờ 1 PRE_DECLARED có số, tờ 2 SEND_FAILED → `DOSSIER_LOCKED`, Review Focus 3).
- [ ] **Step 2:** FAIL. **Step 3:** Cài đặt. **Step 4:** PASS (core + mock).

### Task 4: Xác nhận tờ khai đã hủy (backend + route + mock)

**Files:**
- Create: `packages/core/src/modules/integration/application/confirm-cancelled.ts` (+ export ở `modules/integration/index.ts`)
- Create: `apps/web/src/app/api/dossiers/[id]/declaration/cancel/route.ts`
- Modify: `packages/contracts/src/api/customs.ts` (`ConfirmCancelledInputSchema`), `packages/contracts/src/reason-codes.ts` (+ `CANCEL_NOT_ALLOWED`), `apps/web/src/lib/reason-codes.messages.ts`
- Modify: `apps/web/src/api/http/declaration.ts`, `apps/web/src/api/declaration.ts`, `apps/web/src/mocks/api/declaration.ts` (`confirmDeclarationCancelled`)
- Test: `.../__tests__/confirm-cancelled.test.ts`, mock test, route test nếu route khác có test cùng kiểu

**Interfaces – Produces:**
```ts
export const ConfirmCancelledInputSchema = z.object({ branch: z.number().int().min(1).default(1), reason: z.string().min(1) /* mã danh mục CANCEL_REASON */,
  date: IsoDateSchema, docNo: z.string().max(100).optional(), note: z.string().max(1000).optional() });
export async function confirmDeclarationCancelled(deps: CustomsDeps, ctx: Ctx, dossierId: string, input: ConfirmCancelledInput): Promise<Result<void>>;
// http/mock: confirmDeclarationCancelled(dossierId: string, input: ConfirmCancelledInput): Promise<void>
```
Quy tắc: `requireRole(ctx, "APPROVER", "ADMIN")`; tờ (`branch`) phải có `declarationNo`, chưa thông quan (stage không thuộc CLEARED/POST_*), không REJECTED → khác thì `CANCEL_NOT_ALLOWED`; đã CANCELLED → `ok` không ghi gì thêm (Review Focus 4). Ghi trong một `uow.asOrg`: kết quả `raw.stage = "CANCELLED"`, `raw.cancellation = { reason, date, docNo?, note?, by: ctx.userId, at: now ISO }`, `state = coarseState("CANCELLED")`; thông điệp `customs_messages` (direction `IN`, result `OK`, summary "Người khai xác nhận tờ khai {số} đã hủy – lý do {reason}"); sau đó `orgAudit.record(DECLARATION_CANCEL_CONFIRMED, detail {branch, declarationNo, reason, date})`; `syncDossierClearance`; thông báo người tạo hồ sơ qua `deps.notify` như process-outbox. `reason` kiểm theo danh mục `CANCEL_REASON` (`code-lists`) – mã lạ → `INVALID_INPUT`.
Route: POST, `requireSession`/ctx như route reopen, body Zod `ConfirmCancelledInputSchema`, trả `fromResult`.

- [ ] **Step 1: Test thất bại:** `cancel_ok_sets_stage_and_audit`; `cancel_requires_number`; `cancel_rejects_cleared`; `cancel_role_declarant_forbidden`; `cancel_idempotent` (gọi 2 lần → 1 thông điệp, 1 audit); `cancel_unknown_reason`.
- [ ] **Step 2:** FAIL. **Step 3:** Cài đặt. **Step 4:** PASS.

### Task 5: Giao diện – nhãn tiến độ ở danh sách, đầu trang, tổng quan

**Files:**
- Create: `apps/web/src/features/dossiers/dossier-progress-badge.tsx` + `dossier-progress.messages.ts` (vi/en/zh đúng nhãn ở Global Constraints)
- Modify: `apps/web/src/features/dossiers/dossier-badges.tsx` / `components/common/dossier-status.tsx` (thay `DossierStatusBadge` + `ChannelBadge` ở danh sách/đầu trang bằng `DossierProgressBadge`), `dossier-display.ts`
- Modify: `apps/web/src/features/dossiers/dossier-list-page.tsx` (cột Trạng thái = tiến độ, bộ lọc theo `ProgressCode`; tab việc cần làm `?viec=` = `all | todo | await-official | channelled | cleared | attention`, có số đếm; `channelled` có lọc thêm theo luồng)
- Modify: `apps/web/src/features/dossier-detail/dossier-detail-page.tsx` (đầu trang), `apps/web/src/features/dashboard/dashboard-page.tsx` (đếm theo tab)
- Modify (nếu thiếu tone/biến thể): `packages/ui` `StatusBadge`/`STATUS_META` theo skill `adding-ui-component`
- Test: `dossier-progress-badge.test.tsx` (axe), `dossier-list-page.test.tsx`, dashboard test hiện có

**Interfaces – Consumes:** `dossierProgressOf`, `Dossier.customs.sheets`. **Produces:** `<DossierProgressBadge dossier={Dossier} />` (nhãn + `· Luồng …` khi `channel` + dòng phụ + "k/N" khi `of > 1` + cờ).
Tab: `todo` = NOT_DECLARED; `await-official` = PRE_DECLARED | AMEND_PRE_DECLARED; `channelled` = DECLARED | AMEND_RECALLED | AMENDED; `cleared` = CLEARED | POST_AMENDED; `attention` = flags khác rỗng hoặc REJECTED. Hẹp: nhãn và dòng phụ xuống dòng trong cùng ô.

- [ ] **Step 1: Test thất bại:** badge: hồ sơ không có `customs` + status NEEDS_REVIEW → "Chưa khai báo" + "Cần kiểm tra" (Review Focus 5); DECLARED RED → "Đã khai chính thức · Luồng đỏ"; lô CLEARED 2/3 → "Đã thông quan 2/3"; axe sạch. List: tab `?viec=cleared` chỉ hiện hồ sơ CLEARED/POST_AMENDED, số đếm đúng; lọc cột theo tiến độ.
- [ ] **Step 2:** FAIL. **Step 3:** Cài đặt. **Step 4:** PASS; `pnpm lint` sạch.

### Task 6: Giao diện – bước Khai báo Hải quan & Review: 3 nhóm/tờ, mở lại, xác nhận hủy

**Files:**
- Modify: `apps/web/src/features/dossier-detail/steps/submit-step.tsx` (+ `.messages.ts`): mỗi tờ hiện 3 nhóm (`sheetStatusOf`); nút "Mở lại để sửa" khi điều kiện Task 3 (từ submission view: mọi tờ không số, stage NOT_SENT, không tờ nào đang gửi theo `rowState === "SENDING"`); nút "Xác nhận tờ khai đã hủy" (APPROVER/ADMIN, tờ có số, chưa thông quan, chưa hủy) mở `ConfirmDialog` danger `irreversible` với: lý do (`Select` danh mục `CANCEL_REASON` qua hook danh mục có sẵn), ngày (`DatePicker`, mặc định hôm nay), số văn bản Hải quan (tùy chọn), ghi chú (tùy chọn)
- Modify: `apps/web/src/features/dossier-detail/steps/review-step.tsx`: nút "Mở lại để sửa" hiện cả khi tờ khai SUBMITTED nhưng thỏa điều kiện Task 3 (dùng submission query đã có)
- Test: `submit-step*.test.tsx`, `review-step*.test.tsx` (axe)

**Interfaces – Consumes:** `sheetStatusOf` (Task 1), `confirmDeclarationCancelled`, `DECLARATION_SENDING` (Task 3/4).

- [ ] **Step 1: Test thất bại:** truyền lỗi chưa số → nút mở lại hiện ở cả 2 bước, bấm → gọi reopen; đang gửi → không hiện; tờ có số chưa thông quan + vai trò APPROVER → nút hủy hiện, xác nhận gửi đúng `{branch, reason, date}`; DECLARANT → không hiện; sau hủy tờ hiện "Đã hủy".
- [ ] **Step 2:** FAIL. **Step 3:** Cài đặt. **Step 4:** PASS + axe.

### Task 7: Tài liệu, e2e, kiểm tra cuối, review, commit

**Files:**
- Modify: `docs/QUY-TRINH-NGHIEP-VU.md` (trạng thái tiến độ hồ sơ, mở lại khi chưa số, xác nhận hủy), `docs/PRODUCT.md` nếu có mục trạng thái hồ sơ
- Modify/Create e2e: `apps/web/e2e/customs-and-list.spec.ts` (sau thông quan: danh sách hiện "Đã thông quan"; tab `?viec=cleared` có hồ sơ), e2e mới `declaration-cancel.spec.ts` (khai tạm IDA có số → xác nhận hủy → "Đã hủy"); mở lại sau truyền lỗi: dùng e2e nếu cổng giả tạo được lỗi IDA chắc chắn, không thì dựa vào test Task 3/6 và ghi rõ trong báo cáo.

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm test` xanh.
- [ ] **Step 2:** Trình duyệt (mock, giao diện chính – bản in): danh sách + tab, đầu trang, bước Khai báo (mở lại, hộp hủy); sáng/tối, 1366/390, vi/en/zh; chụp ảnh.
- [ ] **Step 3:** e2e (bản build http, cổng giả) cho các spec trên PASS.
- [ ] **Step 4:** Chạy song song `hq-review-backend` + `hq-review-frontend`; sửa đến khi cả hai PASS.
- [ ] **Step 5:** Một commit trên nhánh `feat/trang-thai-ho-so` gồm spec + plan + code, có khối `Review:` và `Co-Authored-By`.
