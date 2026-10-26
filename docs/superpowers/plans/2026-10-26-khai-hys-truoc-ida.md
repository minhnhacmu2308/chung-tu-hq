# Khai HYS trước IDA/EDA – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người khai lập "bộ HYS" (mã thủ tục A546 + file) cho cả lô, gửi Hải quan trước IDA/EDA; số tiếp nhận tự điền vào cặp trống của 1.63/2.53; hệ thống gợi ý HYS và bắt xác nhận khi khai IDA/EDA mà bỏ qua gợi ý.

**Architecture:** Bảng mới `hys_submissions` + `hys_submission_files` (module integration). Gửi qua outbox `operation = 'HYS'` → worker `processOutbox` rẽ nhánh sớm sang `processHysOutbox`. Điền 1.63 qua port `DeclarationReader.fillAttachment` → use case mới của module declaration. Luật kiểm file / điền cặp / gợi ý là code thuần trong `@kb/contracts`. HYS "phụ theo từng tờ" cũ bị bỏ.

**Tech Stack:** TypeScript, Zod, Drizzle (Postgres + RLS), BullMQ worker, Next.js route handlers, React Query, `@kb/ui`, Vitest (+ Testcontainers cho `*.int.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-26-khai-hys-truoc-ida-design.md` (đọc kèm – §, H#, K# trong plan trỏ về spec).

## Global Constraints

- Mọi truy vấn/ghi có `orgId`; bảng mới bật RLS (`orgRls`), có int test cross-org.
- Mã định danh (số tiếp nhận, mã thủ tục) là `string`; ngày nghiệp vụ `YYYY-MM-DD`; thời điểm UTC.
- Dữ liệu từ ngoài (HTTP body, multipart, phản hồi cổng, payload outbox/queue) parse bằng Zod.
- Người dùng/hệ thống sửa ô tờ khai → `field_audit` append-only (nguồn `HYS_FILL`).
- Giao diện: chỉ `@kb/ui` + utility token; không mã màu, không `dark:`; vi/en/zh đủ 3 bản (`defineMessages`), không chữ cứng.
- Module chỉ import nhau qua `modules/<module>/index.ts`; integration gọi declaration qua port `DeclarationReader`.
- Dev/test không gọi cổng FPT thật (dùng `apps/fpt-mock` / `FakeCustomsGateway`).
- Giới hạn HYS: tổng ≤ `2 * 1024 * 1024` byte; đuôi: txt, doc, docx, docm, xml, xls, xlsx, xlsm, csv, jpg, jpeg, gif, tif, tiff, bmp, pdf, htm, html; tối đa 3 cặp 1.63.
- Khóa outbox HYS: `hys:<submissionId>:n<attempt>`; khóa file: `orgs/<orgId>/dossiers/<dossierId>/hys/<submissionId>/<fileId>-<fileName>`.
- Commit kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Không `git add` `docs/danhmuc/`, `docs/tailieuchitieukhaibao/`, `.claude/settings.json`, `.mcp.json`. Không push.
- Trước khi báo xong: `pnpm typecheck && pnpm lint && pnpm test` xanh.

## Review Focus

1. Lô gọi về **một phần** (tờ 2 RECALLED, tờ 1 PRE_DECLARED) rồi HYS về số → phải `LOCKED`, không đổi 1.63 (đổi sẽ gây `SENT_SHEETS_CHANGED`). Test ở Task 6.
2. Worker chạy lại job HYS sau khi đã `ACCEPTED` (crash giữa ghi kết quả và ack) → không gửi lại, không điền 1.63 lần hai (`ALREADY`). Test ở Task 6.
3. Outbox HYS PENDING không được làm nút IDA/IDC báo `OPERATION_PENDING`, không chặn `declareAllSheets`/`recallAllSheets`. Test ở Task 7.
4. Tên file có dấu tiếng Việt / khoảng trắng / đuôi viết hoa (`HÓA ĐƠN.PDF`) → đuôi hợp lệ, khóa lưu không vỡ (bỏ ký tự ngoài `[A-Za-z0-9._-]` trong phần tên của khóa). Test ở Task 1 (đuôi) và Task 5 (khóa).
5. Người khai nhập tay sẵn cặp `A02 / 300000000001` trong 1.63 (khai HYS ngoài phần mềm) → G1 coi là đã khai, khai IDA không hỏi. Test ở Task 1 (`suggestHys`) và Task 8 (guard).

---

### Task 1: Luật thuần HYS trong contracts

**Files:**
- Create: `packages/contracts/src/hys/rules.ts`, `packages/contracts/src/hys/index.ts`
- Modify: `packages/contracts/src/index.ts` (export `./hys/index.js`)
- Test: `packages/contracts/src/hys/rules.test.ts`

**Interfaces:**
- Produces:
  - `HYS_ALLOWED_EXTENSIONS: readonly string[]`, `HYS_MAX_TOTAL_BYTES = 2_097_152`, `HYS_MAX_SLOTS = 3`
  - `type HysIssue = { code: "NO_FILE" | "BAD_EXTENSION" | "TOO_LARGE" | "MISSING_PROCEDURE" | "MISSING_OFFICE" | "MISSING_UNIT" | "TOO_LONG"; file?: string; field?: string; bytes?: number }`
  - `checkHysSubmission(s: { procedureCode: string | null; customsOffice: string | null; processingUnit: string | null; phone: string | null; internalRef: string | null; note: string | null; files: { fileName: string; sizeBytes: number }[] }): HysIssue[]`
  - `hysExtensionAllowed(fileName: string): boolean`
  - `type AttachmentValues = Partial<Record<"TK_EA1"|"TK_EA2"|"TK_EA3"|"TK_EB1"|"TK_EB2"|"TK_EB3", string>>`
  - `fillAttachmentSlot(values: AttachmentValues, procedureCode: string, receiptNo: string): { outcome: "FILLED" | "ALREADY" | "FULL"; slot?: 1 | 2 | 3; set?: Record<string, string> }`
  - `VALUATION_CODES_WITHOUT_A01 = ["6", "7"] as const`
  - `type HysRule = "G1" | "G2" | "G3" | "G4" | "G5"`; `type HysSuggestion = { code: HysProcedureCode; rule: HysRule; fieldNo: string }`
  - `suggestHys(input: { kind: "IDA" | "EDA"; values: Record<string, string>; containerCount: number; satisfied: ReadonlySet<string> }): HysSuggestion[]` – `values` theo tên VNACCS (`declarationFormValues` + ô bổ sung TK_EA*/TK_EB*/TK_ENC); gộp trùng mã (G2+G5 cùng A99 → một gợi ý, giữ rule đầu).
  - `satisfiedHysCodes(values: AttachmentValues, submissions: { procedureCode: string; status: string }[]): Set<string>` – mã có bộ `SENDING`/`ACCEPTED` ∪ mã ở TK_EA{n} có TK_EB{n} khác rỗng.

- [ ] **Step 1: Write failing tests** (`rules.test.ts`), tối thiểu:
```ts
expect(hysExtensionAllowed("HÓA ĐƠN.PDF")).toBe(true);
expect(hysExtensionAllowed("a.zip")).toBe(false);
expect(checkHysSubmission({ ...base, files: [{ fileName: "a.pdf", sizeBytes: 2_097_152 }] })).toEqual([]);
expect(checkHysSubmission({ ...base, files: [{ fileName: "a.pdf", sizeBytes: 2_097_153 }] })).toContainEqual({ code: "TOO_LARGE", bytes: 2_097_153 });
expect(checkHysSubmission({ ...base, files: [] })).toContainEqual({ code: "NO_FILE" });
expect(checkHysSubmission({ ...base, procedureCode: null, files: ok })).toContainEqual({ code: "MISSING_PROCEDURE" });
expect(checkHysSubmission({ ...base, phone: "1".repeat(21), files: ok })).toContainEqual({ code: "TOO_LONG", field: "TK_STL" });
expect(fillAttachmentSlot({}, "A02", "300000000001")).toEqual({ outcome: "FILLED", slot: 1, set: { TK_EA1: "A02", TK_EB1: "300000000001" } });
expect(fillAttachmentSlot({ TK_EA1: "A01", TK_EB1: "1", TK_EB2: "  " }, "A02", "2")).toMatchObject({ outcome: "FILLED", slot: 2 });
expect(fillAttachmentSlot({ TK_EB2: "2" }, "A02", "2")).toEqual({ outcome: "ALREADY", slot: 2 });
expect(fillAttachmentSlot({ TK_EB1: "1", TK_EB2: "2", TK_EB3: "3" }, "A02", "4")).toEqual({ outcome: "FULL" });
// suggestHys
expect(codes({ kind: "IDA", values: { VD_COC: "2" } })).toEqual(["A02"]);
expect(codes({ kind: "IDA", values: {}, containerCount: 1 })).toEqual(["A02"]);
expect(codes({ kind: "EDA", values: {}, containerCount: 50 })).toEqual([]);
expect(codes({ kind: "EDA", values: {}, containerCount: 51 })).toEqual(["A02"]);
expect(codes({ kind: "IDA", values: { TK_IV1: "B" } })).toEqual(["A99"]);
expect(codes({ kind: "IDA", values: { KTG_VD1: "6" } })).toEqual([]);
expect(codes({ kind: "IDA", values: { KTG_VD1: "7" } })).toEqual([]);
expect(codes({ kind: "IDA", values: { KTG_VD1: "1" } })).toEqual(["A01"]);
expect(codes({ kind: "IDA", values: { KTG_VD1: "6", KTG_FR1: "D" } })).toEqual(["A01"]);
expect(codes({ kind: "EDA", values: { KTG_VD1: "1" } })).toEqual([]); // G3 chỉ IDA
expect(codes({ kind: "EDA", values: { TK_ENC: "A" } })).toEqual(["A08"]);
expect(codes({ kind: "IDA", values: { TK_NT2: "x".repeat(maxLenOf("1.68") + 1) } })).toEqual(["A99"]);
expect(codes({ kind: "IDA", values: { TK_IV1: "B", TK_NT2: long } })).toEqual(["A99"]); // gộp
expect(codes({ kind: "IDA", values: { VD_COC: "2" }, satisfied: new Set(["A02"]) })).toEqual([]);
expect([...satisfiedHysCodes({ TK_EA1: "A02", TK_EB1: "300000000001", TK_EA2: "A01" }, [{ procedureCode: "A08", status: "ACCEPTED" }, { procedureCode: "A99", status: "DRAFT" }])].sort()).toEqual(["A02", "A08"]);
```
`codes(x)` = `suggestHys({ containerCount: 0, satisfied: new Set(), ...x }).map(s => s.code)`; `maxLenOf(no)` đọc `CATALOG_IDA`/`CATALOG_EDA` (`.find(d => d.no === no)?.maxLen`). Value có dạng `"6 – …"` → so bằng `firstToken`.

- [ ] **Step 2:** `pnpm --filter @kb/contracts exec vitest run src/hys/rules.test.ts` → FAIL (module chưa có).
- [ ] **Step 3:** Implement `rules.ts` (độ dài theo `HYS_REQUEST_ROWS` cho TK_STL/TK_REF/TK_KJJ; G5 dùng maxLen chỉ tiêu 1.68 / 2.57 từ catalog; `fieldNo` theo bảng §5 của spec).
- [ ] **Step 4:** Chạy lại → PASS; `pnpm --filter @kb/contracts typecheck`.
- [ ] **Step 5:** Commit `feat(contracts): luật thuần HYS – kiểm file, điền cặp 1.63, gợi ý G1–G5`.

### Task 2: Contracts – DTO API, cờ `hysWaived`, `NOTE`, reason codes

**Files:**
- Create: `packages/contracts/src/api/hys.ts` (+ export từ `api/index` hoặc root như các api khác)
- Modify: `packages/contracts/src/api/customs.ts` (`SubmitDeclarationInputSchema`, `PerformOperationInputSchema` thêm `hysWaived: z.boolean().optional()`), `packages/contracts/src/dto/customs.ts:22` (direction `"OUT" | "IN" | "NOTE"`), `packages/contracts/src/reason-codes.ts`, `apps/web/src/lib/reason-codes.messages.ts`
- Test: `packages/contracts/src/api/hys.test.ts`; gate sẵn có `apps/web/src/lib/reason-codes.test.ts`

**Interfaces:**
- Produces (Zod + type suy ra):
  - `HysStatusSchema = z.enum(["DRAFT","SENDING","ACCEPTED","REJECTED","SEND_FAILED"])`
  - `HysFillSchema = z.object({ outcome: z.enum(["FILLED","ALREADY","FULL","LOCKED","NO_RECEIPT"]), slot: z.union([z.literal(1),z.literal(2),z.literal(3)]).optional(), afterApproval: z.boolean().optional() })`
  - `HysFileViewSchema = { id, documentId: string|null, fileName, mime, sizeBytes: number, source: "DOSSIER"|"UPLOAD" }`
  - `HysSubmissionViewSchema = { id, seq, procedureCode: string|null, customsOffice: string|null, processingUnit: string|null, phone, internalRef, note (string|null), purpose: "PRE_DECLARATION"|"SUPPLEMENT"|null, status, attempt: number, receiptNo: string|null, registeredOn: string|null (YYYY-MM-DD), reject: {code,message,solution?}[]|null, fill: HysFill|null, files: HysFileView[], issues: HysIssue[], sentAt: string|null }`
  - `HysOverviewSchema = { submissions: HysSubmissionView[], suggestions: HysSuggestion[], lotEditable: boolean, supplementHint: boolean, defaults: { customsOffice: string|null, processingUnit: string|null, internalRef: string } }`
  - `CreateHysInputSchema = { procedureCode: z.string().length(3).optional() }`
  - `UpdateHysInputSchema = { procedureCode?, customsOffice?, processingUnit?, phone?, internalRef?, note? (string|null), documentIds?: string[] }`
  - `SendHysInputSchema = { certificateId: z.string().min(1) }`
  - Reason codes (vi text): `HYS_SUGGESTED: "Tờ khai nên có hồ sơ đính kèm HYS ({codes}) – khai HYS trước hoặc xác nhận vẫn khai"`, `HYS_USE_SUBMISSION: "HYS khai bằng bộ hồ sơ đính kèm ở thẻ HYS"`, `HYS_NOT_EDITABLE: "Bộ HYS đã gửi – không sửa/xóa được, khai bộ mới"`, `HYS_INVALID: "Bộ HYS chưa đủ điều kiện gửi: {issues}"`; en/zh tương ứng trong `REASON_MESSAGES`.

- [ ] **Step 1:** Test parse: view mẫu hợp lệ; `registeredOn: "26/10/2026"` bị từ chối (regex `YYYY-MM-DD`); `PerformOperationInputSchema.parse({operation:"IDA", branch:1, hysWaived:true}).hysWaived === true`; `CustomsMessageSchema` nhận `direction: "NOTE"`.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Implement schema + reason codes (vi trùng khớp hai nơi).
- [ ] **Step 4:** `pnpm --filter @kb/contracts test && pnpm --filter @kb/web exec vitest run src/lib/reason-codes.test.ts src/lib/i18n-catalogs.test.ts` → PASS; `pnpm typecheck` (MessageRow ở core sẽ cần `"NOTE"` – sửa `customs-ports.ts:14` trong task này để typecheck xanh).
- [ ] **Step 5:** Commit `feat(contracts): DTO HYS, cờ hysWaived, thông điệp NOTE, reason codes HYS`.

### Task 3: Bảng, migration, repo `hysSubmissions`

**Files:**
- Modify: `packages/core/src/db/schema/integration.ts` (hai bảng, theo mẫu `postAmendments`; `date` từ `drizzle-orm/pg-core` mode string; FK dossiers cascade; check status; check nguồn file `(document_id is not null) or (storage_key is not null)`; unique (`dossier_id`, `seq`); index (`org_id`, `dossier_id`))
- Create: `packages/core/drizzle/0027_hys_submissions.sql` (sinh bằng `pnpm --filter @kb/core db:generate`, đổi tên, sửa `drizzle/meta/_journal.json` – `when` lớn hơn 1792945586781)
- Modify: `packages/core/src/modules/integration/application/customs-ports.ts` (`HysSubmissionRow`, `HysFileRow`, `CustomsRepos.hys`), `infrastructure/drizzle-customs-uow.ts`, `application/test/in-memory-customs-uow.ts` (`data.hys`, `data.hysFiles`)
- Test: `packages/core/src/modules/integration/infrastructure/drizzle-customs-uow.int.test.ts`

**Interfaces:**
- Produces:
```ts
type HysSubmissionRow = { id: string; orgId: string; dossierId: string; seq: number; procedureCode: string | null; customsOffice: string | null; processingUnit: string | null; phone: string | null; internalRef: string | null; note: string | null; purpose: "PRE_DECLARATION" | "SUPPLEMENT" | null; status: HysStatus; attempt: number; receiptNo: string | null; registeredOn: string | null; reject: { code: string; message: string; solution?: string }[] | null; fill: HysFill | null; sentBy: string | null; sentAt: Date | null; createdAt: Date; updatedAt: Date };
type HysFileRow = { id: string; orgId: string; submissionId: string; documentId: string | null; storageKey: string; fileName: string; mime: string; sizeBytes: number; position: number; createdAt: Date };
CustomsRepos.hys: {
  list(orgId, dossierId): Promise<HysSubmissionRow[]>; get(orgId, id): Promise<HysSubmissionRow | null>;
  insert(row: HysSubmissionRow): Promise<void>; update(orgId, id, patch: Partial<Omit<HysSubmissionRow, "id"|"orgId"|"dossierId"|"seq"|"createdAt">>): Promise<void>; delete(orgId, id): Promise<void>;
  files(orgId, submissionId): Promise<HysFileRow[]>; filesForDossier(orgId, dossierId): Promise<HysFileRow[]>;
  insertFile(row: HysFileRow): Promise<void>; deleteFile(orgId, fileId): Promise<void>; deleteFiles(orgId, submissionId): Promise<void>;
}
```
(`storageKey` của file chọn từ hồ sơ = khóa của `documents`, nên cột `storage_key` để not null; check nguồn thành `document_id is null or storage_key is not null` – đơn giản: `storage_key` luôn có.)

- [ ] **Step 1:** Int test (Testcontainers, theo các test cùng file): insert/list/update/delete bộ + file; tổ chức khác không thấy (RLS); unique `seq` trùng → lỗi; xóa bộ cascade file.
- [ ] **Step 2:** `pnpm --filter @kb/core exec vitest run src/modules/integration/infrastructure/drizzle-customs-uow.int.test.ts` → FAIL.
- [ ] **Step 3:** Schema + migration + repo drizzle + in-memory (giữ hành vi deny khác org, clone khi đọc/ghi, unique giả lập như outbox).
- [ ] **Step 4:** Chạy int test → PASS; `pnpm db:migrate` trên DB dev chạy được.
- [ ] **Step 5:** Commit `feat(core): bảng hys_submissions / hys_submission_files + repo`.

### Task 4: Declaration – điền 1.63 do HYS

**Files:**
- Create: `packages/core/src/modules/declaration/application/fill-attachment.ts`
- Modify: `packages/core/src/modules/declaration/application/ports.ts` (`AuditWriter` source thêm `"HYS_FILL"`), `packages/core/src/modules/extraction/application/ports.ts:11` (union thêm `"HYS_FILL"`), `packages/core/src/modules/declaration/index.ts` (export), `packages/core/src/modules/integration/application/customs-ports.ts` (`DeclarationReader.fillAttachment`), `packages/core/src/modules/integration/infrastructure/customs-adapters.ts` (`createDeclarationReader`), `packages/core/src/modules/integration/application/__tests__/_sheets-harness.ts` (`FakeDeclarations.fillAttachment`)
- Test: `packages/core/src/modules/declaration/application/__tests__/fill-attachment.test.ts`

**Interfaces:**
- Consumes: `fillAttachmentSlot` (Task 1), `extraFieldMeta(kind, key)` (contracts).
- Produces:
  - `fillAttachmentFromHys(deps: DeclarationDeps, ctx: Ctx, dossierId: string, input: { procedureCode: string; receiptNo: string; note: string }): Promise<Result<{ outcome: "FILLED" | "ALREADY" | "FULL" | "LOCKED"; slot?: 1|2|3; afterApproval: boolean }>>`
  - `DeclarationReader.fillAttachment(ctx, dossierId, input)` cùng kiểu trả (adapter unwrap; lỗi → `LOCKED`).
- Quy tắc: tờ khai mới nhất `DRAFT` hoặc `APPROVED`, ngược lại `LOCKED`. Ghi `fields[TK_EA{n}]`, `fields[TK_EB{n}]` = `{ ...extraFieldMeta, value, source: "SYSTEM", note: input.note }`; **không** đổi `status`, `approvedAt`, `version`; mỗi ô đổi một dòng `audit.append(ctx, { dossierId, key: "decl:TK_EB1", oldValue, newValue, source: "HYS_FILL" })`. Không kiểm vai trò người dùng (hệ thống gọi từ worker).

- [ ] **Step 1:** Test: DRAFT trống → FILLED slot 1, 2 dòng audit `HYS_FILL`, status DRAFT; APPROVED → FILLED, `afterApproval: true`, status vẫn APPROVED, `approvedAt` giữ nguyên; SUBMITTED → LOCKED, không audit; đã có số → ALREADY, không audit; đủ 3 → FULL; tổ chức khác → NOT_FOUND.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Implement + port + adapter + fake.
- [ ] **Step 4:** `pnpm --filter @kb/core exec vitest run src/modules/declaration` → PASS; `pnpm typecheck`.
- [ ] **Step 5:** Commit `feat(core): điền cặp 1.63/2.53 từ số tiếp nhận HYS, giữ trạng thái duyệt`.

### Task 5: Use case soạn bộ HYS + tổng quan

**Files:**
- Create: `packages/core/src/modules/integration/application/hys-submissions.ts`, `packages/core/src/modules/integration/domain/lot-editable.ts`
- Modify: `customs-ports.ts` (`CustomsDossierPort.putFile(key, bytes, mime)`, `deleteFile(key)`, `documents` trả thêm `mime`, `sizeBytes`), `infrastructure/customs-adapters.ts`, `application/test/*` fakes, `modules/integration/index.ts`
- Test: `packages/core/src/modules/integration/application/__tests__/hys-submissions.test.ts`, `domain/lot-editable.test.ts`

**Interfaces:**
- Consumes: Task 1 (`checkHysSubmission`, `suggestHys`, `satisfiedHysCodes`), Task 3 repo, `declarationFormValues`, `awaitingContent`, `stageOf`, `isContentOperation`.
- Produces:
  - `isLotEditable(i: { declarationStatus: DeclarationStatus | null; stages: CustomsStage[]; contentPending: boolean }): boolean` – status DRAFT/APPROVED ∧ ¬contentPending ∧ mọi stage `awaitingContent` (mảng rỗng = chưa gửi = true).
  - `hysValuesOf(snap: DeclarationSnapshot): Record<string, string>` – `declarationFormValues(kind, fields)` + các ô bổ sung TK_EA*/TK_EB*/TK_ENC (giá trị `firstToken` cho mã).
  - `getHysOverview(deps, ctx, dossierId): Promise<Result<HysOverview>>` – `supplementHint` = có tờ DECLARED kênh YELLOW/RED.
  - `createHysSubmission(deps, ctx, dossierId, input: CreateHysInput): Promise<Result<HysSubmissionView>>` – `seq = max+1`; điền sẵn TK_CH/TK_CHB từ `buildFptRequest` head của tờ khai hiện hành (như `fpt-vnaccs-gateway.ts:88-99` đang làm), `internalRef` = mã hồ sơ cắt 20.
  - `updateHysSubmission(deps, ctx, dossierId, id, input: UpdateHysInput)` – `documentIds` thay toàn bộ file nguồn DOSSIER (giữ file UPLOAD); doc phải thuộc hồ sơ.
  - `deleteHysSubmission(deps, ctx, dossierId, id)` – xóa object file UPLOAD rồi xóa bộ.
  - `addHysUploadedFiles(deps, ctx, dossierId, id, files: { name: string; mime: string; bytes: Buffer }[])` – đuôi sai → `VALIDATION` (không lưu); khóa K6 với phần tên chỉ giữ `[A-Za-z0-9._-]` (ký tự khác → `_`), `fileName` giữ nguyên tên gốc.
  - `removeHysFile(deps, ctx, dossierId, id, fileId)`.
  - Sửa/xóa khi `SENDING`/`ACCEPTED` → `reasonError("INVALID_STATE", "HYS_NOT_EDITABLE")`. Quyền: vai trò như `performOperation` (DECLARANT/APPROVER/ADMIN).

- [ ] **Step 1:** Test `isLotEditable`: [] DRAFT → true; [NOT_SENT, RECALLED] APPROVED → true; [PRE_DECLARED, RECALLED] → false (gọi về một phần); SUBMITTED → false; contentPending → false.
- [ ] **Step 2:** Test use case: tạo → seq 1, TK_CH điền sẵn, internalRef = mã hồ sơ; update `documentIds` 2 file → files 2, `issues` rỗng; upload `HÓA ĐƠN.PDF` → khóa `orgs/<org>/dossiers/<d>/hys/<id>/<fileId>-H_A___N.PDF` dạng an toàn, fileName gốc; upload `.zip` → lỗi; sửa bộ ACCEPTED → `HYS_NOT_EDITABLE`; tổ chức khác → NOT_FOUND; overview IDA có container → suggestions `[A02]`, sau khi có bộ A02 SENDING → `[]`; 1.63 nhập tay A02 + số → `[]`.
- [ ] **Step 3:** Chạy → FAIL. **Step 4:** Implement. **Step 5:** Chạy → PASS; typecheck.
- [ ] **Step 6:** Commit `feat(core): soạn bộ HYS (tạo/sửa/xóa/file) + tổng quan gợi ý`.

### Task 6: Gửi HYS, worker, cổng FPT

**Files:**
- Create: `packages/core/src/modules/integration/application/send-hys.ts`, `application/process-hys.ts`
- Modify: `customs-ports.ts` (`CustomsGateway.attachDocuments` chữ ký mới), `infrastructure/fpt-vnaccs-gateway.ts:88-99`, `application/test/fake-customs-gateway.ts:53-59`, `application/process-outbox.ts` (rẽ nhánh ngay sau `r.outbox.get`, trước tra `results` – K1), `application/reopen-declaration.ts` (`markOutboxFailed`: outbox HYS → bộ `SEND_FAILED`), `modules/integration/index.ts`
- Test: `__tests__/hys-send.test.ts`; sửa test HYS cũ trong `customs-use-cases.test.ts` (257-274, 673, 690-713) cho chữ ký mới hoặc chuyển sang file mới

**Interfaces:**
- Produces:
```ts
type HysGatewayRequest = { dossierId: string; customsOffice: string; processingUnit: string; procedureCode: string; phone: string | null; internalRef: string | null; note: string | null; files: { name: string; bytes: Buffer }[]; certificateId?: string };
attachDocuments(orgId: string, req: HysGatewayRequest, idempotencyKey: string): Promise<{ receiptNo?: string; registeredOn?: string; errors?: GatewayError[] }>;
sendHysSubmission(deps, ctx, dossierId, id, input: { certificateId: string }): Promise<Result<HysSubmissionView>>;
processHysOutbox(deps, ctx, ob: OutboxRow): Promise<Result<{ status: OutboxRow["status"]; next: null }>>;
```
- FPT gateway: map sang `HysRequestSchema` (`tK_CH`, `tK_CHB`, `tK_TSB`, `tK_STL`, `tK_REF`, `tK_KJJ`, `lisT_FILE`), parse `HysResponseSchema`; `tK_YMD` `dd/MM/yyyy` → `YYYY-MM-DD`.
- `sendHysSubmission`: bộ `DRAFT`/`REJECTED`/`SEND_FAILED`; `checkHysSubmission` còn issue → `reasonError("VALIDATION","HYS_INVALID",{issues})`; chứng thư tồn tại; `SEND_FAILED` mà đã có `receiptNo` → chuyển `ACCEPTED`, không gửi. Một giao dịch: `attempt+1`, `status SENDING`, `purpose` (`isLotEditable`), `sentBy/sentAt`, outbox `{ operation: "HYS", branch: 1, declarationId, idempotencyKey: \`hys:${id}:n${attempt}\`, payload: { submissionId: id, certificateId } }`; xếp job `customs-send` như `enqueue`.
- `processHysOutbox`: payload parse Zod (`{ submissionId, certificateId? }`; thiếu → outbox FAILED "HYS kiểu cũ không còn hỗ trợ – khai bộ HYS mới"); bộ đã `ACCEPTED` → outbox SENT, trả về (idempotent); `attempts >= MAX_ATTEMPTS` → `SEND_FAILED`; ghi OUT message một lần (attempts 0); đọc file (`readFile`; lỗi → DomainError "Không đọc được file X" → `SEND_FAILED`); gọi gateway; lỗi tạm → throw (BullMQ thử lại); `errors` → `REJECTED` + message IN ERROR; thành công → `ACCEPTED`, receipt, registeredOn, message IN OK (summary "Đã tiếp nhận HYS {code} – số tiếp nhận {receipt}"); rồi nếu `purpose = PRE_DECLARATION` ∧ `isLotEditable` (tính lại lúc này) ∧ có receipt → `deps.declarations.fillAttachment(ctx, dossierId, { procedureCode, receiptNo, note: \`HYS ${seq} – ${receipt}\` })`, ngược lại `fill = LOCKED`/`NO_RECEIPT`; `publish` `customs.message`. Không đọc/ghi `customs_results`.

- [ ] **Step 1:** Test (`InMemoryCustomsUow`, `FakeCustomsGateway`, `FakeDeclarations`): gửi bộ hợp lệ → outbox key `hys:<id>:n1`, status SENDING, purpose PRE_DECLARATION (chưa có results); process → ACCEPTED, receipt 12 ký tự, `fillAttachment` gọi một lần, fill FILLED slot 1; process lại cùng outbox → không gọi gateway lần 2, không fill lần 2; lô gọi về một phần (results [PRE_DECLARED, RECALLED]) → fill `LOCKED`, `fillAttachment` không gọi; gateway `rejectHys` → REJECTED + reject; gửi lại → key `n2`; file mất → SEND_FAILED nêu tên file; `markOutboxFailed` outbox HYS → bộ SEND_FAILED; SEND_FAILED có receipt → gửi lại chỉ chuyển ACCEPTED; bộ thiếu file → `HYS_INVALID`.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Implement (gồm `FakeCustomsGateway`: receipt `"3" + 11 chữ số`, `registeredOn` từ clock, opt `rejectHys`). **Step 4:** `pnpm --filter @kb/core test` → PASS.
- [ ] **Step 5:** Commit `feat(core): gửi bộ HYS qua outbox, worker nhận số tiếp nhận và điền 1.63`.

### Task 7: Bỏ HYS theo tờ cũ; HYS không khóa nghiệp vụ khác

**Files:**
- Modify: `packages/contracts/src/customs-flow.ts` (:3, :54 giữ meta nhưng `kind: "dossier"`/bỏ khỏi `operationsFor` :74, bỏ `row("HYS")` :172, bỏ nhánh HYS :194), `customs-flow.test.ts`, `customs-summary.test.ts:97`, `packages/core/.../perform-operation.ts` (op HYS → `reasonError("INVALID_STATE","HYS_USE_SUBMISSION")`, bỏ nhánh :126), `resend-operation.ts:42` (bỏ HYS), `_customs-view.ts:37-38` và `declare-all.ts:23`, `recall-all.ts` (bỏ outbox `HYS` khỏi kiểm pending – K2), `packages/core/src/flows/phase5-customs.int.test.ts:109-123`, `apps/web/src/features/dossier-detail/steps/submit-step.tsx:61,71`, `submit-step.messages.ts` (bỏ khóa HYS không dùng), `apps/web/src/mocks/api/customs.ts`, `apps/web/src/mocks/customs-sim.ts`
- Test: các file test trên

**Interfaces:** `CustomsOperationSchema` vẫn có "HYS"; `OPERATION_LABELS.HYS` giữ cho lịch sử.

- [ ] **Step 1:** Sửa kỳ vọng test: `operationsFor("NK")` không còn "HYS"; enabled PRE_DECLARED `["IDB","IDC","PORT_FEE"]`; DECLARED YELLOW `["IDD","CONT","PORT_FEE"]`; `nextCustomsOperation` DECLARED YELLOW → `null`; thêm test core: có outbox HYS PENDING → view tờ 1 IDA vẫn bấm được, `declareAllSheets` không trả `OPERATION_PENDING`; `performOperation(…,"HYS")` → reason `HYS_USE_SUBMISSION`.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Implement. **Step 4:** `pnpm --filter @kb/contracts test && pnpm --filter @kb/core test && pnpm --filter @kb/web test` → PASS.
- [ ] **Step 5:** Commit `refactor: bỏ HYS theo từng tờ; outbox HYS không khóa nghiệp vụ tờ khai`.

### Task 8: Gợi ý HYS khi khai IDA/EDA – `HYS_SUGGESTED` + xác nhận

**Files:**
- Create: `packages/core/src/modules/integration/application/hys-guard.ts`
- Modify: `submit-declaration.ts` (tham số `opts?: { hysWaived?: boolean }`), `perform-operation.ts` (`OperationOpts.hysWaived`; chỉ khi `baseOp(op) === "IDA"` và người dùng gọi – không áp cho chuỗi worker `chainFrom`), `apps/web/src/app/api/dossiers/[id]/submission/route.ts`, `.../submission/operations/route.ts` (truyền `hysWaived`)
- Test: `__tests__/hys-guard.test.ts`

**Interfaces:**
- Produces: `hysGuard(deps, ctx, dossierId, snap: DeclarationSnapshot, waived: boolean): Promise<Result<void>>` – tính `suggestHys` (Task 5 `hysValuesOf`, `satisfiedHysCodes`); có gợi ý ∧ ¬waived → `reasonError("HYS_SUGGESTED", "HYS_SUGGESTED", { codes: "A02, A01" })` (thêm `"HYS_SUGGESTED"` vào union `DomainError` code nếu là union đóng, map HTTP 409); có gợi ý ∧ waived → `messages.insert({ operation: baseOp IDA/EDA, direction: "NOTE", result: "OK", summary: "Người khai xác nhận không khai HYS: A02, A01", payloadMasked: { codes }, externalRef: null })` + `orgAudit?.append` nếu có; không gợi ý → ok, không ghi.
- Gọi trong `submitDeclaration` sau các guard hiện có, trước khi tạo outbox; trong `performOperation` cho IDA/EDA khi `!opts?.chainFrom`.

- [ ] **Step 1:** Test: IDA có container, không bộ HYS, không cờ → `HYS_SUGGESTED` params `{codes:"A02"}`, không outbox; cùng ca có `hysWaived` → outbox tạo + 1 message NOTE; có bộ A02 SENDING → gửi bình thường, không NOTE; 1.63 nhập tay A02 + số → không hỏi; IDC không bị guard; tờ 2 do chuỗi worker không bị guard.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Implement + route. **Step 4:** `pnpm --filter @kb/core test` → PASS.
- [ ] **Step 5:** Commit `feat: nhắc khai HYS trước IDA/EDA, xác nhận bỏ qua được ghi lại`.

### Task 9: fpt-mock – kiểm đuôi file, kịch bản từ chối

**Files:**
- Modify: `apps/fpt-mock/src/app.ts:168-188`
- Test: `apps/fpt-mock/src/app.test.ts`

- [ ] **Step 1:** Test: file `x.zip` → lỗi (dùng `hysExtensionAllowed`); `tK_KJJ: "REJECT"` → lỗi nghiệp vụ có `solution`; ca hợp lệ vẫn trả `tK_JNO` 12 ký tự và `tK_YMD`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `pnpm --filter fpt-mock test` (tên filter theo package.json) → PASS.
- [ ] **Step 5:** Commit `feat(fpt-mock): HYS kiểm đuôi file và kịch bản từ chối`.

### Task 10: Web – route API, client http + mock

**Files:**
- Create: `apps/web/src/app/api/dossiers/[id]/hys/route.ts` (GET, POST), `.../hys/[hysId]/route.ts` (PATCH, DELETE), `.../hys/[hysId]/files/route.ts` (POST multipart qua `readUploadFiles`), `.../hys/[hysId]/files/[fileId]/route.ts` (DELETE), `.../hys/[hysId]/send/route.ts` (POST); `apps/web/src/api/hys.ts` (`pick(mock, http)`), `apps/web/src/api/http/hys.ts`, `apps/web/src/mocks/api/hys.ts`
- Modify: `apps/web/src/api/http/customs.ts` + `api/customs.ts` (`submitDeclaration`/`performOperation` nhận `hysWaived`), `apps/web/src/mocks/api/customs.ts` (guard `HYS_SUGGESTED` qua `reasonApiError` dùng `suggestHys`), `apps/web/src/mocks/db.ts` (`hys: HysSubmissionView[]`, tăng `DB_VERSION` 27 → 28), core `container`/infrastructure nối use case mới nếu cần
- Test: `apps/web/src/mocks/api/hys.test.ts`

**Interfaces:**
- Produces (client): `hysKeys = { all: ["hys"], overview: (id) => ["hys", id] }`, `getHysOverview(dossierId)`, `createHys(dossierId, input)`, `updateHys(dossierId, hysId, input)`, `deleteHys(dossierId, hysId)`, `uploadHysFiles(dossierId, hysId, files: File[])`, `removeHysFile(dossierId, hysId, fileId)`, `sendHys(dossierId, hysId, input)`; `submitDeclaration(dossierId, certificateId, opts?: { hysWaived?: boolean })`, `performOperation(dossierId, op, branch?, opts?: { hysWaived?: boolean })`.
- Mock `sendHys`: `ACCEPTED` ngay, receipt 12 chữ số, điền TK_EA/TK_EB vào tờ khai mock nếu lô còn sửa được.

- [ ] **Step 1:** Test mock: tạo → gợi ý biến mất sau khi gửi; gửi điền 1.63 mock; `submitDeclaration` có gợi ý không cờ → ApiError reason `HYS_SUGGESTED`.
- [ ] **Step 2:** FAIL → **Step 3:** implement (route mỏng: `requireCtx`, `parseBody(Schema)`, `fromResult`) → **Step 4:** `pnpm --filter @kb/web test && pnpm typecheck && pnpm lint` → PASS.
- [ ] **Step 5:** Commit `feat(web): API và dữ liệu mock cho bộ HYS`.

### Task 11: Web – thẻ HYS, form, hộp xác nhận

**Files:**
- Create: `apps/web/src/features/dossier-detail/steps/hys/hys-card.tsx`, `hys-form.tsx`, `hys-suggest-dialog.tsx`, `hys.messages.ts`, `hys-card.test.tsx`
- Modify: `submit-step.tsx` (đặt `HysCard` trên danh sách tờ; `submit`/`perform` bắt lỗi reason `HYS_SUGGESTED` → mở `HysSuggestDialog`, "Vẫn khai" gọi lại với `{ hysWaived: true }`, "Khai HYS trước" mở form với mã điền sẵn), `steps/provenance.ts`/hiển thị ghi chú ô 1.63 nếu cần (nhãn nguồn SYSTEM đã có; thêm "(điền sau khi duyệt)" từ `fill.afterApproval` ở thẻ HYS)
- Test: `hys-card.test.tsx` (axe), `steps-i18n.test.ts`, `i18n-catalogs.test.ts`

**Interfaces:**
- Consumes: Task 10 client, `HYS_PROCEDURE_CODES`, `checkHysSubmission`, `HYS_MAX_TOTAL_BYTES`, `HYS_ALLOWED_EXTENSIONS`.
- UI: `HysCard({ dossierId, kind })`; `HysForm({ dossierId, submission, documents, open, onOpenChange })` – `Dialog presentation="panel"`, Combobox mã thủ tục (mã + tên dịch), CodeInput TK_CH/TK_CHB như form tờ khai, Checkbox chứng từ, `FileDropzone accept` = đuôi cho phép, `Progress value={total} max={HYS_MAX_TOTAL_BYTES} tone={total > max ? "danger" : "primary"}`, danh sách `issues` dịch theo `code`; nút Lưu nháp / Gửi HYS (Dialog xác nhận + chọn chứng thư như IDA) / Xóa. `HysSuggestDialog({ suggestions, onDeclareHys(code), onProceed })`.
- Tên thủ tục A01…A99 có bản dịch en/zh trong `hys.messages.ts` (vi = `HYS_PROCEDURE_CODES`).

- [ ] **Step 1:** Test component: thẻ hiện gợi ý A02 với nút "Khai HYS"; form vượt 2 MB → Progress tone danger + nút Gửi disabled; hộp xác nhận hai nút gọi đúng callback; axe không vi phạm; i18n đủ 3 ngôn ngữ.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `pnpm --filter @kb/web test && pnpm lint` → PASS.
- [ ] **Step 5:** Commit `feat(web): thẻ và form HYS, hộp xác nhận khai IDA khi chưa khai HYS`.

### Task 12: Kiểm trình duyệt, tài liệu, cổng cuối

**Files:**
- Modify: `docs/QUY-TRINH-NGHIEP-VU.md` (mục HYS: trước IDA, cả lô, điền 1.63, gợi ý G1–G5, xác nhận), `docs/PRODUCT.md` nếu có mục HYS

- [ ] **Step 1:** `pnpm --filter @kb/web build` rồi chạy chế độ mock (`NEXT_PUBLIC_DATA_SOURCE=mock`) – hồ sơ IDA có container: tạo bộ A02 → chọn file → gửi → số tiếp nhận hiện, 1.63 có `A02 / <số>` → khai IDA không hỏi; hồ sơ khác: khai IDA → hộp xác nhận → "Vẫn khai" → gửi được, lịch sử có dòng xác nhận. Chụp sáng + tối, desktop (1440) + mobile (390); không tràn ngang.
- [ ] **Step 2:** Cập nhật tài liệu.
- [ ] **Step 3:** `pnpm typecheck && pnpm lint && pnpm test` → xanh (ghi số test).
- [ ] **Step 4:** Commit `docs: quy trình HYS trước IDA/EDA`.
