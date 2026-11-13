# Qua khu vực giám sát (KVGS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khai danh sách container (NK container), lấy DS qua KVGS (mọi tờ đã thông quan) và in bản kê mã vạch container / hàng lẻ ngay trong hồ sơ.

**Architecture:** Hai nghiệp vụ phụ mới `CONT_LIST` và `KVGS` thay `CONT` trong `customs-flow`; chạy theo khuôn HYS (use case → outbox → worker → hỏi kết quả qua job `kvgs-poll`), lưu ở 2 bảng `container_lists`, `kvgs_sheets`. Giao diện là thẻ trong nhóm ④ của bước Truyền Hải quan, trang in riêng, lối tắt ở màn Khai báo Hải quan; component `Barcode` mới trong `@kb/ui`.

**Tech Stack:** TypeScript, Zod (`@kb/contracts`), Drizzle + Postgres RLS (`@kb/core`), BullMQ (`apps/worker`), Next.js App Router (`apps/web`), `@kb/ui`, `bwip-js`, vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-qua-khu-vuc-giam-sat-kvgs-design.md` · ADR `docs/adr/0014-kvgs-container-list-and-barcode-print.md`

## Global Constraints

- Mọi truy vấn/ghi có `orgId`; bảng mới có `orgRls(...)` (bất biến 1).
- Số tờ khai, vận đơn, container, seal, MST, số tiếp nhận là `string` (bất biến 2). Số lượng/trọng lượng trong `KvgsSheet` là chuỗi thập phân (bất biến 3).
- Ngày nghiệp vụ `YYYY-MM-DD`; thời điểm UTC (bất biến 4). FPT nhận ngày `dd/MM/yyyy` – chỉ đổi định dạng trong gateway.
- Sửa ô bảng container → `field_audit` append-only (bất biến 6).
- Mọi phản hồi FPT / body route / payload job parse bằng Zod (bất biến 9).
- Không AI. Mỗi lần gọi FPT ghi chi phí qua `meterSafely` như `poll-status.ts` (bất biến 8 – usage). Không trừ lượt khai (ADR 0011).
- Vai trò gửi/sửa: `DECLARANT`, `APPROVER`, `ADMIN` (`requireRole`). Xem/in: mọi thành viên.
- `V5ContainerReq`: `VD_SO`, `CON_SO`, `SEL_SO` bắt buộc mỗi dòng; `CON_SO`/`SEL_SO` tối đa 50 ký tự, `VD_SO` 35, `GHI_CHU` 255. `V5ContainerRes.tranG_THAI`: `0` nhập mới, `10` từ chối, `11` chưa có phản hồi, `12` chấp nhận.
- `KVGS` body: `TK_SOTK`, `TK_NGAYDK` (dd/MM/yyyy), `TK_MAHQ`, `MA_DV`; không gửi tài khoản VNACCS.
- Giao diện chỉ `@kb/ui` + token; nhãn đủ vi/en/zh trong `*.messages.ts`; nội dung bản in chỉ tiếng Việt trong `*.vi.ts`.
- **Commit**: theo `.claude/rules/review-truoc-commit.md` – chỉ commit tại 3 mốc (sau Task 6, Task 11, Task 12), mỗi mốc chạy song song `hq-review-backend` + `hq-review-frontend`, cả hai PASS mới commit, dán khối `Review:`. Không commit `docs/danhmuc/`, `docs/tailieuchitieukhaibao/`, `docs/tinhthue/`, `docs/mauin_danhsachcontqua_kvgs/` trừ khi chủ sản phẩm yêu cầu.

## Review Focus

1. Số container từ OCR viết thường / có khoảng trắng / dấu gạch (`fbiu 580242-9`) → chuẩn hóa thành `FBIU5802429` trước khi kiểm ISO 6346, không báo sai oan. (Task 1, Task 5)
2. Hồ sơ có cả HBL và MBL cùng liệt kê một container → điền sẵn một dòng, seal lấy giá trị khác rỗng đầu tiên, nguồn ghi chứng từ đầu tiên. (Task 5)
3. Bấm "Khai DS container" / "Lấy DS qua KVGS" hai lần (hai tab) khi lần trước đang `SENDING` → lần sau trả `KVGS_ALREADY_SENDING`, không tạo outbox thứ hai. (Task 5)
4. Phản hồi KVGS của hàng container mà `containers` rỗng, hoặc thiếu `cargoControlNo` → `KVGS_RESPONSE_INCOMPLETE`, không cho in. (Task 4)
5. Người dùng đang bật chế độ tối mở trang in → bản in vẫn chữ đen nền trắng, QR quét được. (Task 10)

---

### Task 1: Contracts – kiểu dữ liệu KVGS, kiểm số container, mã lý do

**Files:**
- Create: `packages/contracts/src/kvgs/index.ts`, `packages/contracts/src/kvgs/container-no.ts`, `packages/contracts/src/kvgs/schemas.ts`
- Test: `packages/contracts/src/kvgs/kvgs.test.ts`
- Modify: `packages/contracts/src/index.ts` (export), `packages/contracts/src/reason-codes.ts`, `apps/web/src/lib/reason-codes.messages.ts` + `REASON_TEXT_VI` trong `apps/web/src/lib/reason-codes.ts`

**Interfaces:**
- Produces:
  - `normalizeContainerNo(raw: string): string` – bỏ khoảng trắng/`-`/`.`, viết hoa.
  - `isValidContainerNo(no: string): boolean` – 4 chữ (chữ thứ 4 ∈ U/J/Z) + 6 số + chữ số kiểm ISO 6346.
  - `ContainerListRowSchema` = `{ billNo: string(1..35), containerNo: string(1..50), sealNo: string(0..50), note: string(0..255), source: "OCR"|"USER", sourceDocumentId?: string, sourcePage?: number }`
  - `ContainerListStatusSchema` = `"DRAFT"|"SENDING"|"ACCEPTED"|"REJECTED"|"NO_RESPONSE"`; `KvgsFetchStatusSchema` = cùng tập.
  - `ContainerListIssue` = `{ row: number; field: "billNo"|"containerNo"|"sealNo"|"note"; code: "REQUIRED"|"INVALID_CONTAINER_NO"|"DUPLICATE"|"TOO_LONG" }`; `checkContainerList(rows: ContainerListRow[]): ContainerListIssue[]` (bảng rỗng → `[{ row: 0, field: "containerNo", code: "REQUIRED" }]`).
  - `KvgsSheetSchema` đúng trường spec §2.4.
  - `KvgsView` = `{ dossierId, branch, applies: { containerList: boolean; kvgs: boolean }, containerList: { attempt, status, rows, refId, receiptNo, receiptDate, errors: CustomsErrorItem[], sentAt } | null, kvgs: { status, refId, receiptNo, receiptDate, errors, fetchedAt, sheet: KvgsSheet | null } | null, header: { declarationNo, typeCode, customsOffice, registeredOn, companyName } }`
  - `SaveContainerListInputSchema` = `{ rows: ContainerListRow[] }`.
  - Reason codes: `KVGS_REQUIRES_CLEARANCE`, `KVGS_REQUIRES_CONTAINER_LIST`, `CONT_LIST_NOT_APPLICABLE`, `CONT_LIST_REQUIRES_DECLARATION_NUMBER`, `CONT_LIST_INVALID`, `KVGS_ALREADY_SENDING`, `KVGS_RESPONSE_INCOMPLETE`, `CONT_LIST_LOCKED`.

- [ ] **Step 1: Write the failing tests** in `kvgs.test.ts`:
  - `normalizeContainerNo(" fbiu 580242-9 ") === "FBIU5802429"`
  - `isValidContainerNo("FBIU5802429") === true`, `isValidContainerNo("CSQU3054383") === true`, `isValidContainerNo("CSQU3054384") === false`, `isValidContainerNo("FBIA5802429") === false`
  - `checkContainerList([])` → `[{ row: 0, field: "containerNo", code: "REQUIRED" }]`
  - hai dòng cùng `FBIU5802429` → dòng 2 có `DUPLICATE`; `sealNo: ""` → `REQUIRED` ở `sealNo`
  - `KvgsSheetSchema.parse(fixture)` thành công với fixture lấy từ mẫu container (`309096721420`, `122600049332258`, `FBIU5802429`, seal `NA`)
- [ ] **Step 2: Run** `pnpm --filter @kb/contracts test kvgs` → FAIL (module chưa có).
- [ ] **Step 3: Implement** các export trên; chữ số kiểm ISO 6346: giá trị chữ A=10…Z=38 bỏ bội số của 11, trọng số `2^i`, tổng mod 11 mod 10.
- [ ] **Step 4: Add reason codes** + nhãn vi/en/zh; chạy `pnpm --filter @kb/contracts test` và `pnpm --filter @kb/web test src/lib/i18n-catalogs.test.ts` → PASS.

### Task 2: Contracts – `CONT_LIST` + `KVGS` thay `CONT` trong luồng

**Files:**
- Modify: `packages/contracts/src/customs-flow.ts` (OPERATIONS map ~dòng 56, `OperationAvailabilityInput` ~dòng 124, `operationAvailability` ~dòng 173, `nextCustomsOperation` ~dòng 198), `packages/contracts/src/dto/customs.ts`
- Modify (usages của `"CONT"`): `apps/web/src/features/dossier-detail/steps/submit-step.tsx:71`, `submit-step.messages.ts`, `packages/core/src/modules/integration/application/perform-operation.ts:148`, `process-outbox.ts:167`, `apps/web/src/mocks/api/customs.ts:273,466`, `apps/web/src/app/api/dossiers/[id]/submission/operations/route.ts`
- Test: `packages/contracts/src/customs-flow.test.ts`

**Interfaces:**
- Consumes: reason codes (Task 1).
- Produces: `CustomsOperation` có `"CONT_LIST" | "KVGS"`; `"CONT"` giữ trong map nhãn (phase `null`) chỉ để hiển thị lịch sử cũ. `OperationAvailabilityInput` bỏ `hasContainers`, thêm `kvgs: { containerListRequired: boolean; containerListAccepted: boolean; kvgsDone: boolean }`. `containerListRequired = direction === "NK" && transportMode === "SEA_CONTAINER"`.
  - `CONT_LIST` enabled ⇔ `containerListRequired && hasDeclarationNumber(stage)`; lý do: `CONT_LIST_NOT_APPLICABLE` / `CONT_LIST_REQUIRES_DECLARATION_NUMBER`.
  - `KVGS` enabled ⇔ `stage === "CLEARED" && (!containerListRequired || containerListAccepted)`; lý do `KVGS_REQUIRES_CLEARANCE` / `KVGS_REQUIRES_CONTAINER_LIST`.
  - `nextCustomsOperation` khi `CLEARED`: `CONT_LIST` nếu required và chưa accepted; `KVGS` nếu chưa `kvgsDone`; else `null`.
  - `CONT_LIST`, `KVGS` **không** đi qua `performOperation` (bị chặn `NOT_SUPPORTED` – có route riêng ở Task 7); thẻ ở Task 9 gọi route riêng.

- [ ] **Step 1: Write failing tests**: bảng (NK container / XK container / NK air) × (`PRE_DECLARED`, `DECLARED`, `CLEARED`) cho 2 nghiệp vụ, đúng enabled + reason như trên; `nextCustomsOperation` 3 trường hợp `CLEARED`.
- [ ] **Step 2: Run** `pnpm --filter @kb/contracts test customs-flow` → FAIL.
- [ ] **Step 3: Implement** trong `customs-flow.ts`; sửa mọi nơi dùng `CONT`/`hasContainers` cho tới khi `pnpm typecheck` sạch (mock web: tính `kvgs` từ dữ liệu mock tạm `false` – Task 7 nối thật).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm --filter @kb/contracts test && pnpm --filter @kb/core test integration` → PASS.

### Task 3: Core – bảng, migration, repo

**Files:**
- Modify: `packages/core/src/db/schema/integration.ts` (thêm `containerLists`, `kvgsSheets` sau `hysSubmissionFiles`)
- Create: `packages/core/drizzle/0036_kvgs.sql` (sinh bằng drizzle-kit theo cách các migration trước; kiểm tay RLS + check constraint)
- Modify: `packages/core/src/modules/integration/application/customs-ports.ts` (row types + repos), `infrastructure/drizzle-customs-uow.ts`, `application/test/in-memory-customs-uow.ts`
- Test: `packages/core/src/modules/integration/infrastructure/drizzle-customs-uow.int.test.ts` (thêm case)

**Interfaces:**
- Produces:
  - `ContainerListRow = { id; orgId; dossierId; branch: number; attempt: number; rows: ContainerListRowData[]; status: ContainerListStatus; refId: string|null; receiptNo: string|null; receiptDate: string|null; errors: GatewayError[]|null; sentRows: ContainerListRowData[]|null; sentBy: string|null; sentAt: Date|null; createdAt: Date; updatedAt: Date }` – unique `(dossier_id, branch, attempt)`, check status.
  - `KvgsSheetRow = { id; orgId; dossierId; branch; status; refId; receiptNo; receiptDate; errors; sheet: KvgsSheet|null; raw: unknown; requestedBy; requestedAt: Date; fetchedAt: Date|null; createdAt; updatedAt }` – index `(org_id, dossier_id, branch)`.
  - `CustomsRepos.containerLists: { latest(orgId, dossierId, branch): Promise<ContainerListRow|null>; get(orgId, id); insert(row); update(orgId, id, patch) }`
  - `CustomsRepos.kvgs: { latest(orgId, dossierId, branch): Promise<KvgsSheetRow|null>; latestOk(orgId, dossierId, branch): Promise<KvgsSheetRow|null>; get(orgId, id); insert(row); update(orgId, id, patch) }`

- [ ] **Step 1: Write failing int test**: insert + `latest` theo org A; đọc bằng org B trả `null` (RLS); vi phạm unique `(dossier, branch, attempt)` ném lỗi.
- [ ] **Step 2: Run** `pnpm --filter @kb/core test:int drizzle-customs-uow` → FAIL.
- [ ] **Step 3: Implement** schema, migration, repo Drizzle + in-memory.
- [ ] **Step 4: Run** int test + `pnpm --filter @kb/core test` → PASS.

### Task 4: Gateway – FPT, fake, fpt-mock

**Files:**
- Modify: `customs-ports.ts` (`CustomsGateway`), `infrastructure/fpt-vnaccs-gateway.ts`, `application/test/fake-customs-gateway.ts`, `apps/fpt-mock/src/ref-apis.ts`
- Create: `packages/contracts/src/fpt/kvgs.ts` (Zod phản hồi `V5ContainerRes` + KVGS thô), `packages/core/src/modules/integration/infrastructure/kvgs-mapper.ts`
- Test: `infrastructure/kvgs-mapper.test.ts`, `fpt-vnaccs-gateway.test.ts`, `apps/fpt-mock/src/postman-flows.test.ts`

**Interfaces:**
- Produces trên `CustomsGateway`:
  - `sendContainerList(orgId, req: ContainerListGatewayRequest, key: string): Promise<{ refId?: string; errors?: GatewayError[] }>`
  - `containerListResult(orgId, req: Omit<ContainerListGatewayRequest, "rows"> & { refId: string }): Promise<RefResult>` – theo đặc tả FPT `docs/V5-API/KVGS/KHAI BAO DANH SACH CONTAINER v1.1.xlsx`: body hỏi kết quả **không có dòng container**, chỉ thông tin tờ khai + `REF_ID` + `USER_ID`; phản hồi không trả lại dòng (giữ `sentRows` ở DB). `KET_QUA` (Text 255) lưu vào errors/ghi chú khi từ chối mà `errorList` rỗng. `USER_ID` = user id tài khoản VNACCS của doanh nghiệp (`org/vnaccs-account`), không gửi mật khẩu.
  - `requestKvgs(orgId, req: KvgsGatewayRequest, key: string): Promise<{ refId?: string; errors?: GatewayError[] }>`
  - `kvgsResult(orgId, req: KvgsGatewayRequest & { refId: string }): Promise<RefResult & { sheet?: KvgsSheet; raw?: unknown }>`
  - `RefResult = { state: "PENDING"|"ACCEPTED"|"REJECTED"; receiptNo?: string; receiptDate?: string /* YYYY-MM-DD */; errors?: GatewayError[] }` (`12`→ACCEPTED, `10`→REJECTED, `0`/`11`→PENDING).
  - `ContainerListGatewayRequest = { declarationNo; registeredOn /* YYYY-MM-DD */; typeCode; customsOffice; taxCode; companyName; agent?: { taxCode; name }; userId: string; rows: { billNo; containerNo; sealNo; note }[] }`; `KvgsGatewayRequest = { declarationNo; registeredOn; customsOffice; taxCode; kind: "CONTAINER"|"CARGO" }`.
  - `mapKvgsResponse(raw: unknown, kind): Result<KvgsSheet>` – nhận key camelCase .NET hoặc HOA; thiếu `cargoControlNo`/`declarationNo`, hoặc `kind === "CONTAINER"` mà 0 container → `err(reasonError("INTEGRATION", "KVGS_RESPONSE_INCOMPLETE"))`.
- fpt-mock: `KVGS` đổi thành 2 bước (`KVGS` trả `reF_ID`; `KVGSRes` trả đủ trường); `V5ContainerRes` từ chối khi có seal bắt đầu bằng `REJECT` (errorList có `rowPosition`).

- [ ] **Step 1: Failing tests**: mapper (fixture HOA + fixture camelCase → cùng `KvgsSheet`; thiếu số quản lý → `KVGS_RESPONSE_INCOMPLETE`; CONTAINER rỗng → incomplete); gateway gửi `tK_NGAYDK: "27/02/2026"` từ `2026-02-27`; mã `12/10/11` → state đúng; postman-flows: luồng V5ContainerReq→Res chấp nhận + từ chối, KVGS→KVGSRes.
- [ ] **Step 2: Run** các test → FAIL.
- [ ] **Step 3: Implement** gateway (gọi qua `fpt-rest-client`, ghi trace như các API khác), fake (kịch bản điều khiển được từ test), fpt-mock.
- [ ] **Step 4: Run** `pnpm --filter @kb/core test integration && pnpm --filter fpt-mock test` → PASS.

### Task 5: Core – use case danh sách container và KVGS

**Files:**
- Create: `application/kvgs.ts` (view + điều kiện), `application/container-list.ts` (draft/save/refill/send), `application/kvgs-fetch.ts` (requestKvgs), `domain/container-prefill.ts`
- Modify: `modules/integration/index.ts` (export), `customs-ports.ts` (`CustomsAuditWriter.append` source thêm `"CONT_LIST_EDIT"`), composition root nối audit (`apps/web/src/container.ts`)
- Test: `application/__tests__/container-list.test.ts`, `application/__tests__/kvgs-fetch.test.ts`, `domain/container-prefill.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas, Task 3 repos, Task 4 gateway types; `deps.documents`/`deps.fields` hiện có để đọc trường OCR `BillOfLading.containers[]`, `PackingList`, `ArrivalNotice`.
- Produces:
  - `prefillContainerRows(docs: { id; kind: DocKind; page?: number; containers: { no: string|null; sealNo: string|null }[]; billNo: string|null }[]): ContainerListRowData[]` – thứ tự B/L → PL → AN; chuẩn hóa số; gộp trùng (seal khác rỗng đầu tiên).
  - `getKvgs(deps, ctx, dossierId, branch): Promise<Result<KvgsView>>` – lần đầu với NK container tạo bản `DRAFT` từ prefill.
  - `saveContainerList(deps, ctx, dossierId, branch, input: SaveContainerListInput): Promise<Result<KvgsView>>` – chỉ khi `DRAFT`/`REJECTED`/`NO_RESPONSE`; `ACCEPTED` → tạo `attempt+1` từ rows mới; `SENDING` → `CONT_LIST_LOCKED`; mỗi ô đổi → `audit.append` key `cont:<branch>:<row>:<field>`.
  - `refillContainerList(deps, ctx, dossierId, branch)` – ghi đè rows bằng prefill (cũng audit).
  - `sendContainerList(deps, ctx, dossierId, branch)` – kiểm `checkContainerList` (lỗi → `CONT_LIST_INVALID` kèm issues), điều kiện Task 2, `SENDING` → `KVGS_ALREADY_SENDING`; một giao dịch: status `SENDING`, `sentRows`, outbox op `CONT_LIST` key `cont:<listId>:a<attempt>` → xếp job `customs-send`.
  - `requestKvgsFetch(deps, ctx, dossierId, branch)` – điều kiện Task 2; bản mới `SENDING`; outbox op `KVGS` key `kvgs:<rowId>`; `kind` = `CONTAINER` khi transportMode `SEA_CONTAINER`, ngược lại `CARGO`.

- [ ] **Step 1: Failing tests**: prefill (Review Focus 1, 2); save ghi audit đúng số ô đổi; save khi `SENDING` → `CONT_LIST_LOCKED`; send hai lần → lần 2 `KVGS_ALREADY_SENDING` và chỉ 1 outbox (Review Focus 3); send với seal rỗng → `CONT_LIST_INVALID`; KVGS khi chưa CLEARED / NK chưa accepted → đúng reason; vai trò `VIEWER` → `FORBIDDEN`; org khác → `NOT_FOUND`.
- [ ] **Step 2: Run** `pnpm --filter @kb/core test container-list kvgs-fetch container-prefill` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.

### Task 6: Worker – xử lý outbox và hỏi kết quả

**Files:**
- Create: `application/process-kvgs.ts`, `application/poll-kvgs.ts`
- Modify: `application/process-outbox.ts` (nhánh `CONT_LIST`/`KVGS` như nhánh `HYS` ~dòng 63), `apps/worker/src/jobs/customs.ts` (+ `KvgsPollPayload`, `kvgsPollJob`), `apps/worker/src/index.ts` (đăng ký queue `kvgs-poll`)
- Test: `application/__tests__/process-kvgs.test.ts`, `apps/worker/src/jobs/customs.test.ts`

**Interfaces:**
- Produces: `processKvgsOutbox(deps, ctx, ob: OutboxRow): Promise<Done>` – gọi `sendContainerList`/`requestKvgs`; có `refId` → lưu + xếp `kvgs-poll` `{ orgId, userId, kind: "CONT_LIST"|"KVGS", id, n: 1 }` delay `KVGS_POLL_DELAY_MS = 30_000`; lỗi nghiệp vụ → `REJECTED` + errors; lỗi tạm → throw (outbox retry).
- `pollKvgsNow(deps, ctx, dossierId, branch, kind)` – dùng cho route "Lấy phản hồi": tìm bản `SENDING`/`NO_RESPONSE` mới nhất rồi gọi `pollKvgs` một lượt (không tăng bộ đếm tự động); không có bản phù hợp → `INVALID_STATE`.
- `pollKvgs(deps, input): Promise<Result<{ again: boolean }>>` – `PENDING` → lặp tới `KVGS_MAX_POLLS = 40` rồi `NO_RESPONSE`; `ACCEPTED` → receiptNo/date (+ `sheet`, `raw`, `fetchedAt` cho KVGS); `REJECTED` → errors; mỗi lần gọi `meterSafely`; ghi thông điệp OUT/IN vào nhật ký như HYS; `deps.dossiers.publish(orgId, dossierId, { type: "customs.message" })`.

- [ ] **Step 1: Failing tests**: outbox CONT_LIST → poll PENDING ×2 → ACCEPTED (receiptNo lưu, `usage` ghi 3 lần); KVGS → ACCEPTED có `sheet`; KVGS ACCEPTED nhưng mapper incomplete → `REJECTED` + `KVGS_RESPONSE_INCOMPLETE`, `raw` vẫn lưu; 40 lần PENDING → `NO_RESPONSE`; lỗi mạng → throw.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter @kb/core test && pnpm --filter @kb/worker test` → PASS.
- [ ] **Step 5: Mốc commit 1 (backend)** – `pnpm typecheck && pnpm lint && pnpm test` xanh; `pnpm --filter @kb/core test:int` xanh; chạy 2 agent review; cả hai PASS → commit `feat(kvgs): backend khai danh sách container + lấy DS qua KVGS (ADR 0014)` kèm spec, ADR, plan.

### Task 7: Route + API web (http + mock)

**Files:**
- Create: `apps/web/src/app/api/dossiers/[id]/kvgs/[branch]/route.ts` (GET), `.../container-list/route.ts` (GET/PUT), `.../container-list/send/route.ts`, `.../container-list/refill/route.ts`, `.../container-list/poll/route.ts`, `.../fetch/route.ts`, `.../poll/route.ts` (POST – "Lấy phản hồi": gọi `pollKvgs` một lượt ngay, không chờ lịch)
- Create: `apps/web/src/api/kvgs.ts` (`kvgsKeys`, `getKvgs`, `saveContainerList`, `refillContainerList`, `sendContainerList`, `fetchKvgs` qua `pick()`), `apps/web/src/api/http/kvgs.ts`, `apps/web/src/mocks/api/kvgs.ts`
- Modify: `apps/web/src/mocks/db.ts` (`DB_VERSION`++, bảng mock), `apps/web/src/mocks/seed/*` (1 hồ sơ NK container đã thông quan, 1 XK hàng lẻ đã thông quan), `apps/web/src/mocks/api/customs.ts` (`kvgs` input cho availability), `apps/web/CLAUDE.md` (route)
- Test: `apps/web/src/mocks/api/kvgs.test.ts`

**Interfaces:**
- Consumes: use case Task 5 (`getKvgs`, `saveContainerList`, `refillContainerList`, `sendContainerList`, `requestKvgsFetch`), schemas Task 1.
- Produces (cùng chữ ký mock/http): `getKvgs(dossierId: string, branch: number): Promise<KvgsView>`, `saveContainerList(dossierId, branch, rows): Promise<KvgsView>`, `refillContainerList(dossierId, branch)`, `sendContainerList(dossierId, branch)`, `fetchKvgs(dossierId, branch)`, `pollNow(dossierId, branch, kind: "CONT_LIST" | "KVGS")`; `kvgsKeys.detail(dossierId, branch)`.
- Mock mô phỏng thời gian: `SENDING` → `ACCEPTED` sau ~3 s; seal `REJECT…` → `REJECTED` với errorList dòng tương ứng; `KvgsSheet` dựng từ dữ liệu hồ sơ + chuỗi mã vạch giả `KVGS-MOCK|<số tờ khai>|<container>`.

- [ ] **Step 1: Failing mock tests**: luồng NK container (draft từ seed có seal) → send → accepted → fetch → sheet có container; seal `REJECT1` → rejected, errors `line` 1; XK hàng lẻ → `applies.containerList === false`, fetch → `kind "CARGO"`.
- [ ] **Step 2: Run** `pnpm --filter @kb/web test mocks/api/kvgs` → FAIL. **Step 3: Implement** route (mỏng: `requireSession` → Zod → use case → `fromResult`), http, mock, seed. **Step 4: Run** → PASS; `pnpm typecheck && pnpm lint` sạch.

### Task 8: `@kb/ui` – component `Barcode`

**Files:**
- Create: `packages/ui/src/components/barcode.tsx`, `barcode.test.tsx`
- Modify: `packages/ui/package.json` (`bwip-js`), export index, playground (theo skill `adding-ui-component`), `docs/DESIGN-SYSTEM.md`

**Interfaces:**
- Produces: `<Barcode type="qr" | "code128" value={string} label={string} size?: "sm" | "md" | "lg" className? />` – SVG `role="img"` + `aria-label={label}`; màu `currentColor`; value rỗng → không render, không throw.

- [ ] **Step 1: Failing test**: render QR → có `svg` với `aria-label`; code128 → `svg`; value `""` → container rỗng; axe không vi phạm.
- [ ] **Step 2: Run** `pnpm --filter @kb/ui test barcode` → FAIL. **Step 3: Implement** bằng `bwip-js` `toSVG`. **Step 4: Run** → PASS; `pnpm lint` sạch.

### Task 9: Thẻ "Qua khu vực giám sát" trong bước Truyền Hải quan

**Files:**
- Create: `apps/web/src/features/dossier-detail/steps/kvgs/kvgs-card.tsx`, `kvgs-status-block.tsx`, `container-table.tsx`, `kvgs.messages.ts`, `kvgs-card.test.tsx`
- Modify: `submit-step.tsx` (render `KvgsCard` cho phase `DOCS` thay dòng `CONT`, mỗi tờ một thẻ), `packages/ui` `STATUS_META` (trạng thái `NO_RESPONSE` nếu thiếu)

**Interfaces:**
- Consumes: `apps/web/src/api/kvgs.ts` (Task 7), `checkContainerList`/`normalizeContainerNo` (Task 1), `reasonText`/`errorText`, khối lỗi `customs-errors.ts`, `Barcode` không dùng ở đây.
- Produces: `<KvgsCard dossierId branch canEdit />`.
- Hành vi theo spec §3: 2 khối `Grid cols={{ base: 1, md: 2 }}`; bảng sửa trực tiếp (`kb-allow-raw` theo tiền lệ `ocr/items-table.tsx`), ⓘ nguồn OCR, kiểm trên dòng; menu ⋯ Xuất Excel / Xóa toàn bộ (`ConfirmDialog`); Nhập Excel; `ConfirmDialog` trước gửi (doanh nghiệp + chi cục); poll `refetchInterval` 2000 khi `SENDING`; nút "Lấy phản hồi" gọi `pollNow` (bật khi `SENDING`/`NO_RESPONSE`); "Lịch sử ▸" mở nhật ký thông điệp hiện có lọc `CONT_LIST`/`KVGS`; nút "In bản kê" (`Button asChild` + `Link` tới `/dossiers/[id]/kvgs/[branch]/print?mau=cont|le`, mặc định theo `sheet.kind`).

- [ ] **Step 1: Failing tests**: NK container: ô điền sẵn, sửa seal → nút Lưu bật; seal rỗng → nút "Khai DS container" khóa + ô báo lỗi; gửi → hộp xác nhận có tên DN + chi cục → `Đang gửi` → `Chấp nhận`; khối 2 khóa với lý do "chưa khai danh sách container" trước khi chấp nhận; seal `REJECT1` → lỗi dưới bảng chỉ dòng 1; XK hàng lẻ: không có khối 1, không có bảng; vai trò chỉ xem → không có nút gửi; axe.
- [ ] **Step 2: Run** `pnpm --filter @kb/web test kvgs-card` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm lint` sạch (không chữ cứng).

### Task 10: Trang in bản kê mã vạch

**Files:**
- Create: `apps/web/src/app/(app)/dossiers/[id]/kvgs/[branch]/print/page.tsx` (mỏng), `apps/web/src/features/kvgs-print/kvgs-print-page.tsx`, `kvgs-document.tsx`, `kvgs-print.vi.ts`, `kvgs-print.messages.ts` (thanh công cụ), `paginate.ts`, `kvgs-print.test.tsx`, `paginate.test.ts`

**Interfaces:**
- Consumes: `getKvgs` (Task 7), `Barcode` (Task 8), `formatDate` từ `lib/format.ts`.
- Produces: `paginateContainers(rows: T[], perPage = 8): T[][]`; `<KvgsDocument sheet={KvgsSheet} template="cont" | "le" />`.
- Chữ cố định nguyên văn từ 2 PDF mẫu (tiêu đề, mục 1–9, tiêu đề cột kèm số (1)…(5), toàn bộ "Ghi chú") đặt trong `kvgs-print.vi.ts`. Màu bản in cố định đen/trắng bằng token bản in đã dùng ở `invoice-print` (không `dark:`).

- [ ] **Step 1: Failing tests**: `paginateContainers` 12 dòng → `[8, 4]`; mẫu cont với fixture Task 1 → có "DANH SÁCH CONTAINER", "122600049332258", 1 QR `aria-label` chứa `FBIU5802429`; mẫu lẻ → "DANH SÁCH HÀNG HÓA", "17 CASE", "255 Kilogam", 1 Code128; không có `KvgsSheet` → EmptyState + liên kết về hồ sơ; `sealRequired=false` → "Tờ khai không phải niêm phong".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (CSS in: `@page { size: A4 portrait }`, `thead` lặp mỗi trang, thanh công cụ `print:hidden`). **Step 4: Run** → PASS.

### Task 11: Lối tắt ở màn Khai báo Hải quan + kiểm trình duyệt

**Files:**
- Modify: `apps/web/src/features/customs/customs-page.tsx` (`rowActions`), `customs.messages.ts`, `packages/contracts/src/dto/customs.ts` (`CustomsRow.kvgsReady: boolean`), `apps/web/src/mocks/api/customs.ts` + `packages/core/.../list-integrations.ts` hoặc use case danh sách tờ khai (điền `kvgsReady`)
- Test: `apps/web/src/features/customs/customs-page.test.tsx`

**Interfaces:**
- Produces: hai action `{ id: "kvgs", label: t.openKvgs, onSelect: push("/dossiers/<id>?step=submit#kvgs-<branch>") }` (khi `state === "CLEARED"`) và `{ id: "kvgsPrint", label: t.printKvgs, onSelect: push(".../kvgs/<branch>/print") }` (khi `kvgsReady`).

- [ ] **Step 1: Failing test**: dòng tờ đã thông quan có "Qua khu vực giám sát"; dòng chưa thông quan không có; dòng `kvgsReady` có "In bản kê mã vạch" và push đúng URL.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Kiểm trình duyệt** (`pnpm dev:web`, mock): thẻ ở sáng/tối, 1366/390, cả en/zh; trang in xem trước A4 với 1 container, 12 container, hàng lẻ; quét QR bằng điện thoại ra đúng chuỗi mock (Review Focus 5: bật chế độ tối rồi mở trang in).
- [ ] **Step 6: Mốc commit 2 (frontend)** – `pnpm typecheck && pnpm lint && pnpm test` xanh; 2 agent review PASS → commit `feat(kvgs): thẻ qua khu vực giám sát, trang in bản kê mã vạch, Barcode @kb/ui`.

### Task 12: Tài liệu + kiểm toàn bộ

**Files:**
- Modify: `docs/QUY-TRINH-NGHIEP-VU.md` (mục ④, bảng "chưa làm" dòng 555 & 569), `docs/BACKEND-TODO.md` (V2), `scripts/vnaccs-api-docs/ops.py` (trạng thái tích hợp Container/KVGS) rồi chạy `scripts/vnaccs-api-docs/build.py` để sinh lại `docs/vnaccs-api/`, `docs/adr/0014-…` (Trạng thái: Chấp thuận + ngày), `docs/ARCHITECTURE.md` nếu có liệt kê bảng integration.

- [ ] **Step 1:** Cập nhật tài liệu; `python scripts/vnaccs-api-docs/build.py` (nếu máy không có Python → báo chủ sản phẩm, không sửa tay `docs/vnaccs-api/`).
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @kb/core test:int` → xanh; `pnpm eval` không cần (không đổi trích xuất).
- [ ] **Step 3: Mốc commit 3** – 2 agent review PASS → commit `docs(kvgs): quy trình, trạng thái tích hợp, ADR 0014 chấp thuận`; hỏi chủ sản phẩm trước khi push / gộp `main`.
