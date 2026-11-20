# Nghiệp vụ khác – Bước 1: Đăng ký số định danh theo lô – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng nhập số lượng, hệ thống tạo N bản khai định danh, worker tự gửi Hải quan và cập nhật số trả về; màn **Nghiệp vụ khác** liệt kê, lọc, xóa dòng lỗi; ô 1.26/2.24 chọn số có sẵn.

**Architecture:** Mở rộng `customs_identifiers` (dòng không gắn hồ sơ, `batch_id`, đã dùng, xóa mềm) và tái dùng nguyên chuỗi `identifier-send` → `identifier-poll` → `stuck-sweeper`. Use case mới trong module `integration`; route `app/api/customs/identifiers/*`; feature web `features/customs-ops` (mock + http). Chưa tạo `customs_ops` (spec §8 bước 1).

**Tech Stack:** TypeScript, Drizzle + Postgres (RLS), BullMQ, Zod (`@kb/contracts`), Next.js, `@kb/ui`, Vitest + testcontainers.

**Spec:** `docs/superpowers/specs/2026-11-20-nghiep-vu-khac-design.md` (§6), ADR 0020, rule `.claude/rules/nghiep-vu-khac.md`.

## Global Constraints

- Mọi truy vấn/ghi có `orgId`; bảng giữ `orgRls` + `.enableRLS()`.
- Mã (số định danh, chi cục, MST, `batch_id`) là `string`. Ngày nghiệp vụ `YYYY-MM-DD`, thời điểm UTC.
- Input route và payload job parse Zod; `request` jsonb đọc lại qua `IdentifierRequestSchema`.
- Số lượng một lô: 1–50.
- Hạn dùng: `${identifiedOn.slice(0,4)}-12-31`, so với **ngày hôm nay theo giờ Việt Nam** (`Asia/Ho_Chi_Minh`). Cảnh báo từ `YYYY-12-01`.
- Được xóa: `REJECTED`, `NO_RESPONSE`. Không xóa: `SENDING`, dòng có `identifier_no`. Xóa mềm + `org_audit`.
- Mọi lần gọi FPT ghi `usage_events` (giữ `meterSafely` hiện có; `dossierId` = `null` với dòng độc lập). Không trừ lượt khai.
- Giao diện chỉ `@kb/ui`, đủ vi/en/zh (`defineMessages`), có loading/empty/error, a11y test (axe). Bộ lọc + trang nằm trong `searchParams`.
- Nhãn nút: vi **Đăng ký số định danh** · en **Register identifiers** · zh **登记识别号**.
- Queue `identifier-send` giữ `concurrency: 2` (`apps/worker/src/index.ts:63`).

## Review Focus

1. Bấm "Đăng ký" hai lần (hoặc mạng chậm gửi lại request) → chỉ một lô, không tính phí FPT hai lần. → Task 3 test `requestIdentifierBatch_same_clientKey_returns_existing_batch`.
2. Dòng vừa nhận số trong lúc người dùng bấm Xóa → dòng không bị xóa. → Task 2 int test `softDelete_skips_row_that_became_accepted`.
3. Hai hồ sơ cùng chọn một số → chỉ một bên được, bên kia nhận lỗi rõ ràng. → Task 2 int test `markUsed_second_caller_gets_false` + Task 3 test `useIdentifier_already_used_returns_IDENTIFIER_TAKEN`.
4. Sang năm mới: số cấp ngày 31/12 hết hạn đúng lúc 00:00 giờ VN 01/01, không phải 07:00. → Task 1 test `displayStatus_expires_at_vn_midnight`.
5. Lô xong: hai dòng cuối hoàn tất cùng lúc → chỉ một thông báo. → Task 3 test `batch_done_notifies_once`.

---

### Task 1: Contracts + quy tắc trạng thái (code thuần)

**Files:**
- Modify: `packages/contracts/src/kvgs/identifier.ts`
- Create: `packages/core/src/modules/integration/domain/identifier-status.ts`
- Test: `packages/core/src/modules/integration/domain/identifier-status.test.ts`

**Interfaces:**
- Produces (contracts):
  - `IdentifierBatchRequestSchema = z.object({ clientKey: z.string().uuid(), count: z.number().int().min(1).max(50), request: IdentifierRequestSchema })`
  - `IdentifierDisplayStatusSchema = z.enum(["SENDING","AVAILABLE","USED","EXPIRED","REJECTED","NO_RESPONSE"])`
  - `IdentifierListQuerySchema = PageQuerySchema.extend({ status: IdentifierDisplayStatusSchema.optional(), from: IsoDateSchema.optional(), to: IsoDateSchema.optional(), customsOffice: z.string().optional(), batchId: z.string().optional(), q: z.string().trim().max(50).optional() })`
  - `IdentifierListItemSchema = IdentifierRecordSchema.extend({ id: z.string(), batchId: z.string().nullable(), batchIndex: z.number().int().nullable(), dossierId: z.string().nullable(), usedByDossierId: z.string().nullable(), usedAt: IsoDateTimeSchema.nullable(), expiresOn: IsoDateSchema.nullable(), expiringSoon: z.boolean(), displayStatus: IdentifierDisplayStatusSchema })`
  - `IdentifierListSchema = pageOf(IdentifierListItemSchema).extend({ expiringCount: z.number().int() })`
  - `IdentifierDeleteSchema = z.object({ ids: z.array(z.string()).min(1).max(200) })`, `IdentifierUseSchema = z.object({ dossierId: z.string() })`
- Produces (core domain): `vnToday(now: Date): string`, `identifierExpiresOn(identifiedOn: string | null): string | null`, `identifierDisplayStatus(row: { status; identifierNo; usedAt; identifiedOn }, today: string): IdentifierDisplayStatus`, `isExpiringSoon(expiresOn: string | null, today: string): boolean`, `canDeleteIdentifier(row: { status; identifierNo }): boolean`.

- [ ] **Step 1: Write failing tests** in `identifier-status.test.ts`:
  - `vnToday(new Date("2026-12-31T16:59:59Z")) === "2026-12-31"`; `vnToday(new Date("2026-12-31T17:00:00Z")) === "2027-01-01"`.
  - `identifierExpiresOn("2026-03-15") === "2026-12-31"`; `identifierExpiresOn(null) === null`.
  - `displayStatus_expires_at_vn_midnight`: row `{status:"ACCEPTED", identifierNo:"X", usedAt:null, identifiedOn:"2026-12-31"}` → `"AVAILABLE"` với today `vnToday(2026-12-31T16:59Z)`, `"EXPIRED"` với `vnToday(2026-12-31T17:00Z)`.
  - ACCEPTED + `usedAt` set → `"USED"` (kể cả đã qua năm). SENDING/REJECTED/NO_RESPONSE → giữ nguyên.
  - `isExpiringSoon("2026-12-31","2026-11-30") === false`, `("2026-12-31","2026-12-01") === true`, `(null, …) === false`.
  - `canDeleteIdentifier`: REJECTED → true; NO_RESPONSE không số → true; SENDING → false; ACCEPTED → false; NO_RESPONSE có `identifierNo` → false.
- [ ] **Step 2:** `pnpm -F @kb/core test identifier-status` → FAIL (module không có).
- [ ] **Step 3:** Thêm schema vào contracts; viết `identifier-status.ts` (`vnToday` dùng `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })`).
- [ ] **Step 4:** `pnpm -F @kb/core test identifier-status` → PASS; `pnpm -r --no-bail typecheck` xanh.
- [ ] **Step 5: Commit** (skill `hq-commit`): `feat(customs): Quy tắc trạng thái và hạn dùng số định danh`.

### Task 2: Migration, schema, repository

**Files:**
- Modify: `packages/core/src/db/schema/integration.ts:270-310`
- Create: `packages/core/drizzle/0047_identifier_batches.sql` (+ meta, sinh bằng `pnpm -F @kb/core db:generate`)
- Modify: `packages/core/src/modules/integration/application/customs-ports.ts:45-50,142-150`
- Modify: `packages/core/src/modules/integration/infrastructure/drizzle-customs-uow.ts:166-186`
- Modify: `packages/core/src/modules/integration/application/test/in-memory-customs-uow.ts` (cùng hành vi)
- Test: `packages/core/src/modules/integration/infrastructure/drizzle-customs-uow.int.test.ts`

**Interfaces:**
- Consumes: Task 1 `IdentifierListQuery`, `identifierExpiresOn`.
- Produces:
  - `IdentifierRow` thêm `dossierId: string | null; batchId: string | null; batchIndex: number | null; usedAt: Date | null; usedByDossierId: string | null; deletedAt: Date | null; deletedBy: string | null`.
  - `identifiers.insertMany(rows: IdentifierRow[]): Promise<void>` (một câu insert)
  - `identifiers.listByBatch(orgId, batchId): Promise<IdentifierRow[]>`
  - `identifiers.list(orgId, q: IdentifierListQuery, today: string): Promise<{ items: IdentifierRow[]; total: number; expiringCount: number }>` – bỏ dòng `deleted_at` khác null; `status` lọc theo `displayStatus` dịch ra SQL (AVAILABLE = ACCEPTED ∧ used_at null ∧ year(identified_on) ≥ year(today); EXPIRED = … < year(today)); `q` khớp `identifier_no`, `receipt_no`, `used_by_dossier_id`; sắp `sent_at desc, batch_index asc`.
  - `identifiers.markUsed(orgId, id, dossierId, now): Promise<boolean>` – `UPDATE … WHERE used_at IS NULL AND status='ACCEPTED' AND deleted_at IS NULL` → true nếu 1 dòng.
  - `identifiers.release(orgId, id, dossierId): Promise<boolean>` – `SET used_at=NULL, used_by_dossier_id=NULL WHERE used_by_dossier_id=dossierId`.
  - `identifiers.softDelete(orgId, ids, by, now): Promise<string[]>` – `WHERE id = ANY(ids) AND status IN ('REJECTED','NO_RESPONSE') AND identifier_no IS NULL AND deleted_at IS NULL RETURNING id`.
  - `latest(orgId, dossierId)` và `listStuckSending` bỏ dòng đã xóa.
- Migration: `dossier_id` bỏ NOT NULL; thêm `batch_id text`, `batch_index integer`, `used_at timestamptz`, `used_by_dossier_id text REFERENCES dossiers(id) ON DELETE SET NULL`, `deleted_at timestamptz`, `deleted_by text`; `uniqueIndex customs_identifiers_batch_uq (org_id, batch_id, batch_index) WHERE batch_id IS NOT NULL`; hai unique cũ thêm `AND deleted_at IS NULL`; `index (org_id, sent_at)`; check `(batch_id IS NULL) = (batch_index IS NULL)`.

- [ ] **Step 1: Write failing int tests:** `insertMany_and_list_filters_by_display_status` (3 dòng ACCEPTED năm nay/năm trước/đã dùng + 1 REJECTED → lọc AVAILABLE/EXPIRED/USED/REJECTED đúng 1 dòng mỗi lọc, `expiringCount` đúng khi today = `YYYY-12-05`); `batch_uq_rejects_duplicate_batch_index`; `markUsed_second_caller_gets_false`; `softDelete_skips_row_that_became_accepted` (ids gồm 1 REJECTED + 1 ACCEPTED → trả đúng id REJECTED); `list_excludes_other_org` (RLS); `deleted_dossier_sets_used_by_null`.
- [ ] **Step 2:** Chạy int test (Docker trên PATH – memory `docker-path-git-bash`) → FAIL.
- [ ] **Step 3:** Sửa schema, `db:generate`, kiểm SQL sinh ra (partial index, FK set null), cài repo Drizzle + in-memory.
- [ ] **Step 4:** int test PASS; `pnpm -F @kb/core test` xanh (sửa chỗ gãy vì `dossierId` nullable ở `identifier.ts`: `gatewayRequest` bỏ `dossierId` khi null, `save` chỉ `publish` khi có `dossierId`).
- [ ] **Step 5: Commit:** `feat(customs): Bảng định danh nhận dòng không gắn hồ sơ, lô và xóa mềm`.

### Task 3: Use case lô, danh sách, xóa, dùng số, gửi lại, báo lô xong

**Files:**
- Create: `packages/core/src/modules/integration/application/identifier-batch.ts`
- Modify: `packages/core/src/modules/integration/application/identifier.ts` (jobId theo attempt, báo lô xong)
- Modify: `packages/core/src/modules/integration/index.ts:38`
- Test: `packages/core/src/modules/integration/application/__tests__/identifier-batch.test.ts` (dùng `makeHarness` của `_sheets-harness.ts`, `FakeCustomsGateway`, `RecordingNotifier`)

**Interfaces:**
- Consumes: Task 1, Task 2 repo.
- Produces:
  - `requestIdentifierBatch(deps, ctx, input: IdentifierBatchRequest): Promise<Result<{ batchId: string; ids: string[] }>>` – role `KVGS_ROLES`; `batchId = input.clientKey`; nếu `listByBatch` có dòng → trả lô đó, không enqueue; không thì `insertMany` N dòng (`attempt: 1`, `dossierId: null`, `batchIndex` 1..N) rồi enqueue N job `identifier-send`. Trùng khóa do request song song → đọc lại lô, trả lô đó.
  - `listIdentifiers(deps, ctx, q: IdentifierListQuery): Promise<Result<IdentifierList>>` – mọi thành viên; map row → `IdentifierListItem` qua hàm Task 1 với `vnToday(deps.clock.now())`.
  - `deleteIdentifiers(deps, ctx, ids: string[]): Promise<Result<{ deleted: string[] }>>` – role `KVGS_ROLES`; ghi `org_audit` `IDENTIFIER_DELETED` (meta: ids đã xóa) qua port audit sẵn có của module (tìm `org_audit` / `audit` trong `customs-ports.ts`; chưa có thì thêm `audit?: (orgId, userId, action, meta) => Promise<void>` vào `CustomsDeps`).
  - `useIdentifier(deps, ctx, id, dossierId): Promise<Result<{ identifierNo: string }>>` – hồ sơ phải tồn tại; dòng phải `AVAILABLE` (hết hạn → `IDENTIFIER_EXPIRED`); `markUsed` false → `IDENTIFIER_TAKEN` (`reasonError("INVALID_STATE", …)`).
  - `releaseIdentifier(deps, ctx, id, dossierId): Promise<Result<void>>`.
  - `retryIdentifier(deps, ctx, id): Promise<Result<void>>` – chỉ dòng có `batchId`, status REJECTED/NO_RESPONSE không số; reset `status:"SENDING", attempt+1, refId/receipt*/errors=null, sendAttempts:0`, enqueue `identifier-send`.
  - `identifierSendJobId(row) = \`identifier-send:${row.id}:${row.attempt}\``; `processIdentifier`, `requeueStuckIdentifiers`, `sendIdentifier` dùng hàm này (job cũ hoàn tất không chặn lần gửi lại).
  - Báo lô xong: sau khi một dòng có `batchId` chuyển ACCEPTED/REJECTED/NO_RESPONSE, nếu `listByBatch` không còn SENDING → `notify(orgId, { userId: row.sentBy }, { title, body: "Lô N định danh: a có số, b bị từ chối, c chưa phản hồi", href: "/customs/ops?batchId=…" })`. Chống trùng: queue job `identifier-batch-done` với `jobId: identifier-batch-done:${batchId}:${maxAttemptInBatch}`; job đó tính số liệu và notify (BullMQ bỏ jobId trùng).
- [ ] **Step 1: Write failing tests:**
  - `requestIdentifierBatch_creates_N_rows_and_N_jobs` (count 3 → 3 dòng SENDING, `batchIndex` 1..3, 3 job `identifier-send`).
  - `requestIdentifierBatch_same_clientKey_returns_existing_batch` (gọi 2 lần → vẫn 3 dòng, 3 job).
  - `requestIdentifierBatch_count_out_of_range_rejected_by_schema` (0 và 51 không parse).
  - `viewer_cannot_request_batch` → FORBIDDEN.
  - `batch_rows_flow_through_send_and_poll` (gateway trả PENDING rồi ACCEPTED → mọi dòng ACCEPTED, `usage` có 3 `V5IdentifierReq` với `dossierId: null`).
  - `batch_done_notifies_once` (3 dòng xong → đúng 1 job `identifier-batch-done`; chạy job → 1 thông báo cho `sentBy`, body "Lô 3 định danh: 2 có số, 1 bị từ chối, 0 chưa phản hồi").
  - `deleteIdentifiers_only_failed_rows` + audit được ghi.
  - `useIdentifier_already_used_returns_IDENTIFIER_TAKEN`; `useIdentifier_expired_returns_IDENTIFIER_EXPIRED`.
  - `retryIdentifier_resets_and_enqueues_new_jobId`.
  - Test cũ `identifier.test.ts` vẫn PASS (đổi kỳ vọng jobId sang dạng có attempt).
- [ ] **Step 2:** `pnpm -F @kb/core test identifier` → FAIL.
- [ ] **Step 3:** Cài use case; đăng ký worker `identifier-batch-done` (`apps/worker/src/index.ts`, `apps/worker/src/jobs/customs.ts` – payload Zod `{ orgId, batchId }`, concurrency 1); thêm vào nhánh `markIdentifierFailed` không cần.
- [ ] **Step 4:** `pnpm -F @kb/core test` + `pnpm -F @kb/worker test` xanh.
- [ ] **Step 5: Commit:** `feat(customs): Đăng ký số định danh theo lô, gửi nền và báo khi xong`.

### Task 4: Route API

**Files:**
- Create: `apps/web/src/app/api/customs/identifiers/route.ts` (GET list, POST batch)
- Create: `apps/web/src/app/api/customs/identifiers/delete/route.ts` (POST `{ ids }`)
- Create: `apps/web/src/app/api/customs/identifiers/[idnId]/use/route.ts` (POST `{ dossierId }`, DELETE = release với `?dossierId=`)
- Create: `apps/web/src/app/api/customs/identifiers/[idnId]/retry/route.ts`
- Create: `apps/web/src/app/api/customs/identifiers/[idnId]/poll/route.ts` (gọi `pollIdentifier` manual cho đúng dòng)
- Test: `apps/web/src/app/api/customs/identifiers/route.test.ts` (theo mẫu route test sẵn có)

**Interfaces:** theo mẫu `apps/web/src/app/api/dossiers/[id]/identifier/route.ts` (`route`, `requireSession`, `parseBody`, `fromResult`); GET parse `IdentifierListQuerySchema` từ `searchParams`. Trả `IdentifierListSchema`, `{ batchId, ids }`, `{ deleted }`, `{ identifierNo }`.
- [ ] **Step 1:** Test route: POST thiếu `clientKey` → 400; GET `?status=FOO` → 400; POST hợp lệ gọi use case với `ctx` của session.
- [ ] **Step 2:** FAIL → **Step 3:** cài → **Step 4:** `pnpm -F @kb/web exec vitest run --maxWorkers=4 src/app/api/customs` PASS.
- [ ] **Step 5: Commit:** `feat(customs): API danh sách, đăng ký lô, xóa, dùng số định danh`.

### Task 5: Màn "Nghiệp vụ khác" – danh sách số định danh + hộp thoại đăng ký

**Files:**
- Create: `apps/web/src/api/customs-ops.ts`, `apps/web/src/api/http/customs-ops.ts`, `apps/web/src/mocks/api/customs-ops.ts` (+ `.test.ts`) – `customsOpsKeys`, `listIdentifiers(q)`, `requestIdentifierBatch(input)`, `deleteIdentifiers(ids)`, `retryIdentifier(id)`, `pollIdentifierRow(id)`, `useIdentifier(id, dossierId)`, `releaseIdentifier(id, dossierId)`
- Create: `apps/web/src/app/(app)/customs/ops/page.tsx`
- Create: `apps/web/src/features/customs-ops/{customs-ops-page.tsx, identifier-batch-dialog.tsx, customs-ops.messages.ts}` + `*.test.tsx`
- Modify: `apps/web/src/features/shell/app-shell.tsx:61` – mục Hải quan thành nhóm con: "Khai báo Hải quan" `/customs`, "Nghiệp vụ khác" `/customs/ops`; `app-titles.messages.ts` thêm `customsOps` (vi "Nghiệp vụ khác", en "Other operations", zh "其他业务")
- Modify: `packages/ui` chỉ khi thiếu (vd trạng thái mới trong `STATUS_META`) – theo skill `adding-ui-component`

**Interfaces:** Consumes Task 4 API (http) / mock cùng chữ ký. Skill `building-frontend-feature`.
- Trang: `DataTable` (cột: Số định danh + QR nhỏ · Lô/STT · Chi cục · Trạng thái `StatusBadge` · Ngày cấp · Hạn dùng · Hồ sơ đã dùng · Gửi lúc), chọn nhiều dòng; `rowActions`: Gửi lại / Hỏi kết quả / Trả lại số / Xóa (chỉ hiện khi hợp trạng thái). Bộ lọc trạng thái (6 giá trị), ngày từ–đến, chi cục (`Select` có tìm, danh mục từ `useCodeList`), lô, ô tìm – tất cả trong `searchParams`. Dòng tổng `expiringCount > 0` → "Còn N số chưa dùng sẽ hết hạn 31/12". Còn dòng SENDING → refetch 5 giây; không còn → dừng.
- Nút **Đăng ký số định danh** → `Dialog`: số lượng (1–50) + ô khai như `identifier-dialog.tsx` (tách phần ô khai thành component dùng chung nếu cần), `clientKey = crypto.randomUUID()` sinh khi mở hộp thoại; gửi xong đóng + toast.
- Chọn nhiều dòng lỗi → **Gửi lại** (gọi `retryIdentifier` từng id, báo số dòng đã gửi lại).
- Xóa: `ConfirmDialog`; có dòng NO_RESPONSE thì thêm câu cảnh báo spec §6.
- [ ] **Step 1:** Test: render danh sách mock (3 trạng thái) + axe; lọc `status=REJECTED` đổi URL và chỉ còn dòng bị từ chối; hộp thoại chặn số lượng 0/51; xóa gửi đúng ids và chỉ cho chọn dòng xóa được; ba catalog vi/en/zh đủ khóa (`i18n-catalogs.test.ts`).
- [ ] **Step 2:** FAIL → **Step 3:** cài → **Step 4:** `pnpm typecheck && pnpm lint && pnpm -F @kb/web exec vitest run --maxWorkers=4 src/features/customs-ops src/lib/i18n-catalogs.test.ts` PASS.
- [ ] **Step 5:** Mở trình duyệt thật (`pnpm dev`, `NEXT_PUBLIC_DATA_SOURCE=http` + fpt-mock): đăng ký lô 3, chờ có số, lọc, xóa dòng lỗi; chụp sáng/tối × 1366/390.
- [ ] **Step 6: Commit:** `feat(customs): Màn Nghiệp vụ khác – danh sách và đăng ký số định danh`.

### Task 6: Ô 1.26/2.24 chọn số có sẵn + tài liệu

**Files:**
- Modify: `apps/web/src/features/declaration-form/identifier-dialog.tsx` (+ `.messages.ts`, `.test.tsx`)
- Modify: `docs/QUY-TRINH-NGHIEP-VU.md` §9.6, §9.7; `docs/superpowers/specs/2026-11-20-nghiep-vu-khac-design.md` (đánh dấu bước 1 xong)

**Interfaces:** Consumes Task 5 `listIdentifiers({ status: "AVAILABLE" })`, `useIdentifier`, `releaseIdentifier`; giữ `onConfirm(identifierNo)` hiện có.
- Hộp thoại thêm khu "Chọn số có sẵn" (danh sách AVAILABLE, gần hết hạn có nhãn). Chọn → `useIdentifier(id, dossierId)` → ok thì `onConfirm(no)` (điền ô; người khai bấm Lưu → `field_audit` như hiện nay); `IDENTIFIER_TAKEN` → toast + tải lại danh sách. Ô số vận đơn bị đổi khỏi số đã chọn trước khi Lưu → gọi `releaseIdentifier`.
- [ ] **Step 1:** Test: chọn số gọi `useIdentifier` rồi `onConfirm` đúng số; lỗi TAKEN không gọi `onConfirm`; danh sách trống hiện `EmptyState` có lối tới `/customs/ops`.
- [ ] **Step 2:** FAIL → **Step 3:** cài → **Step 4:** test + typecheck + lint xanh; trình duyệt: mở tờ khai, chọn số, Lưu, kiểm `field_audit`.
- [ ] **Step 5:** Cập nhật tài liệu; chạy `pnpm typecheck && pnpm lint && pnpm test`.
- [ ] **Step 6: Commit** rồi mở PR bằng skill `hq-pr` (2 agent review trước mỗi commit).
