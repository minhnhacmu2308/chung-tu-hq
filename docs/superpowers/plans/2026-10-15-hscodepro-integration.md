# Tích hợp HSCodePro – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bước tra HS của AI Agent gọi HSCodePro (API bất đồng bộ có hỏi lại người khai), lưu kết quả kèm thuế, và cho người khai trả lời câu hỏi / phân loại lại / xác nhận ngay trên màn "Xác nhận mã HS".

**Architecture:**
- Port mới `HsClassificationService` (create/get/answer/cancel) với 2 hiện thực:
  - HTTP thật, gọi máy giả lập trong `apps/fpt-mock` cho tới khi HSCodePro deploy;
  - Fake chạy trong tiến trình, theo `catalog_hs`.
- Worker sở hữu mọi lời gọi ngoài:
  - `run-agent` tạo lượt;
  - `hs-poll` tự hẹn lại 3 giây cho tới khi lượt hết `processing`, rồi đẩy lại `run-agent` để đi tiếp;
  - `hs-answer` gửi câu trả lời.
- Web chỉ ghi DB + đẩy job.

**Tech Stack:** TypeScript, Zod, Drizzle/Postgres (RLS), BullMQ, Next.js route handlers, React Query, `@kb/ui`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-hscodepro-integration-design.md` (tài liệu API: `docs/integrations/hscodepro-api-v1.md`)

## Global Constraints

- Mã HS là `string`; lưu và hiển thị dạng `xxxx.xx.xx` (API trả `84834090` → `8483.40.90`).
- Thuế suất lưu dạng chuỗi thập phân (`"5"`, `"0"`), không `number` trong DB/DTO tiền thuế.
- Dữ liệu từ HSCodePro parse bằng Zod trước khi dùng (bất biến 9).
- Mọi bảng/truy vấn mới có `orgId` + RLS (bất biến 1).
- AI chỉ gợi ý: người khai luôn bấm xác nhận mã cuối cùng (bất biến 5, 7).
- Route web không gọi HSCodePro trực tiếp; chỉ qua job worker.
- Khóa `HSCODEPRO_INTERNAL_KEY` không ra trình duyệt, không in log.
- Giao diện chỉ `@kb/ui`; popup có `icon`, nút trong `DialogFooter`.
- Trước khi báo xong: `pnpm typecheck && pnpm lint && pnpm test` xanh + e2e liên quan + kiểm trình duyệt sáng/tối, desktop/mobile.

## Review Focus

1. **Dòng hàng thiếu xuất xứ hoặc mô tả < 3 ký tự** → không gửi dòng đó (API trả 400 cả lượt nếu gửi), dòng hiện "Thiếu xuất xứ – nhập rồi phân loại lại", các dòng khác vẫn chạy. Test ở Task 3.
2. **Hóa đơn > 50 dòng** → chia nhiều lượt, mỗi lượt ≤ 50, poll tất cả. Test ở Task 6.
3. **Người khai bấm "Gửi" hai lần (409 INVALID_STATE)** → không báo lỗi đỏ; tải lại trạng thái và hiện theo trạng thái mới. Test ở Task 4 + Task 6.
4. **Chạy lại agent khi lượt cũ đang dở** → hủy lượt cũ (`cancel`), kết quả cũ đến muộn không ghi đè dòng đã thuộc lượt mới. Test ở Task 6.
5. **Xác nhận mã thay thế / mã nhập tay ngoài biểu** → thuế lấy theo mã đó (thay thế) hoặc để trống + chỉ tiêu thuế nghi ngờ (nhập tay); hàng XK / loại hình miễn thuế vẫn 0%. Test ở Task 6.

---

### Task 1: Contracts – schema dây HSCodePro + DTO dòng hàng mở rộng

**Files:**
- Create: `packages/contracts/src/integrations/hscodepro.ts`
- Create: `packages/contracts/src/integrations/hscodepro.test.ts`
- Modify: `packages/contracts/src/dto/declaration.ts` (LineItemSchema thêm `hs`), `packages/contracts/src/index.ts` (export)
- Create: `packages/contracts/src/api/hs.ts` (`HsAnswerInputSchema`, `HsReclassifyInputSchema`)

**Interfaces – Produces:**

```ts
// integrations/hscodepro.ts (dạng dây – snake_case như tài liệu)
export const HsTaxSchema = z.object({ import: z.object({ rate: z.number(), basis: z.enum(["MFN", "FTA"]), agreement: z.string().nullable() }), vat: z.object({ rate: z.number().nullable(), note: z.string().nullable() }), source_date: z.string() });
export const HsResultSchema = z.object({ hs_code: z.string().regex(/^\d{8}$/), hs_description: z.string(), confidence: z.number().min(0).max(100), reasoning: z.string(), legal_basis: z.array(z.string()), warnings: z.array(z.string()), tax: HsTaxSchema.nullable(), alternatives: z.array(z.object({ hs_code: z.string().regex(/^\d{8}$/), hs_description: z.string(), confidence: z.number(), why_not: z.string(), tax: HsTaxSchema.nullable() })).max(3) });
export const HsQuestionSchema = z.object({ id: z.string(), question: z.string(), header: z.string().optional(), detail: z.string().optional(), options: z.array(z.object({ label: z.string(), description: z.string().optional() })).optional(), multiSelect: z.boolean().optional() });
export const HsPendingQuestionSchema = z.object({ id: z.string(), questions: z.array(HsQuestionSchema).min(1).max(3) });
export const HsItemStatusSchema = z.enum(["queued", "processing", "need_info", "completed", "failed", "cancelled"]);
export const HsJobItemSchema = z.object({ id: z.string(), line_no: z.number().int().positive(), status: HsItemStatusSchema, question: HsPendingQuestionSchema.nullable(), result: HsResultSchema.nullable(), error: z.object({ code: z.string(), message: z.string() }).nullable() });
export const HsJobSchema = z.object({ id: z.string(), external_ref: z.string().nullable(), import_date: z.string(), status: z.enum(["processing", "need_info", "completed"]), created_at: z.string(), items: z.array(HsJobItemSchema) });
export const HsCreateItemSchema = z.object({ line_no: z.number().int().positive(), description: z.string().min(3).max(1000), origin_country: z.string().regex(/^[A-Z]{2}$/), quantity: z.number().min(0).optional(), unit: z.string().max(20).optional(), value_usd: z.number().min(0).optional(), invoice_hs: z.string().optional(), co_form: z.string().nullable().optional() });
export const HsCreateRequestSchema = z.object({ external_ref: z.string().max(100).optional(), import_date: z.string().optional(), items: z.array(HsCreateItemSchema).min(1).max(50) });
export const HsAnswerRequestSchema = z.object({ question_id: z.string(), answers: z.array(z.object({ id: z.string(), selected: z.array(z.string()), custom: z.string().nullable() })).min(1) });
export const HsApiErrorBodySchema = z.object({ error: z.string(), code: z.string(), details: z.array(z.object({ field: z.string(), message: z.string() })).optional() });
export const HS_CO_FORMS = ["D", "E", "AK", "AANZ", "AI", "AJ", "VJ", "VC", "VK", "EAV", "EUR.1", "EUR.1-UK", "CPTPP", "VI", "CEPA"] as const;
export type HsJob = z.infer<typeof HsJobSchema>; export type HsJobItem = …; export type HsResult = …; export type HsTax = …; export type HsPendingQuestion = …; export type HsCreateRequest = …; export type HsAnswerRequest = …;

// dto/declaration.ts – thêm vào LineItemSchema (camelCase cho app)
hs: z.object({
  status: z.enum(["idle", "queued", "processing", "need_info", "answering", "completed", "failed", "cancelled", "skipped"]),
  question: HsPendingQuestionSchema.nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  reasoning: z.string().nullable(), legalBasis: z.array(z.string()), warnings: z.array(z.string()),
  /** Gợi ý chính + mã thay thế, có thuế (chuỗi thập phân) */
  candidates: z.array(z.object({ code: z.string(), description: z.string(), confidence: z.number().min(0).max(1), whyNot: z.string().nullable(), importRate: DecimalStringSchema.nullable(), basis: z.enum(["MFN", "FTA"]).nullable(), agreement: z.string().nullable(), vatRate: DecimalStringSchema.nullable() })),
}).optional()

// api/hs.ts
export const HsAnswerInputSchema = z.object({ questionId: z.string().min(1), answers: z.array(z.object({ id: z.string().min(1), selected: z.array(z.string()), custom: z.string().trim().max(1000).nullable() }).refine((a) => a.selected.length > 0 || !!a.custom, "Chọn ít nhất một đáp án hoặc nhập trả lời khác")).min(1).max(3) });
export const HsReclassifyInputSchema = z.object({ extraDescription: z.string().trim().max(500).optional(), origin: z.string().regex(/^[A-Z]{2}$/).optional() });
```

- [ ] **Step 1: Write failing tests** – `hscodepro.test.ts`:
  - mỗi JSON mẫu §4.1, §4.2 (cả lượt), §4.3 (dòng), §4.4 (result) của tài liệu parse được bằng schema tương ứng;
  - `origin_country: "TWN"` bị `HsCreateItemSchema` từ chối;
  - `HsAnswerInputSchema` từ chối phần tử không có `selected` lẫn `custom`;
  - `hs_code: "8483.40.90"` bị từ chối (phải 8 chữ số).
- [ ] **Step 2: Run** `cd packages/contracts && npx vitest run src/integrations/hscodepro.test.ts` → FAIL (module chưa có).
- [ ] **Step 3: Implement** các schema trên; export từ `index.ts`.
- [ ] **Step 4: Run** lại → PASS; `pnpm --filter @kb/contracts typecheck` xanh.

### Task 2: Máy giả lập HSCodePro trong `apps/fpt-mock`

**Files:**
- Create: `apps/fpt-mock/src/hscodepro.ts`, `apps/fpt-mock/src/hscodepro.test.ts`
- Modify: `apps/fpt-mock/src/app.ts` (gắn handler trước nhánh FPT: `if (path.startsWith("/internal/v1/hs-classifications")) return hs.handle(req, res, path)`), `apps/fpt-mock/src/index.ts` (env `FPT_MOCK_HSCODEPRO_KEY`, mặc định `dev-hs-key`), `apps/fpt-mock/README.md`

**Interfaces – Produces:**
- `createHscodeproMock(opts: { apiKey: string; now?: () => Date; idGen?: () => string }) → { handle(req, res, path): Promise<void>; reset(): void }`
- Kịch bản theo mô tả (không ngẫu nhiên):
  - Mỗi lần `GET` lượt, dòng tiến một bậc: `queued → processing → (completed | need_info | failed)`.
  - Mô tả chứa `thanh trượt` / `guide rail` → `need_info` với câu hỏi `use` như §4.2. Sau khi trả lời → `queued` → … → `completed`.
  - Mô tả chứa `FAIL-TEST` → `failed` `AGENT_FAILED`.
  - Còn lại → `completed`.
- Kết quả: tra bảng nhỏ theo từ khóa (bearing/ổ bi → `84821000`, ball screw/vít me → `84834090`, guide/thanh trượt → `84669390` …), mặc định `84879000`.
  - `co_form` hợp lệ và có trong bảng FTA của mock (E, D, AK, VK) → `basis: "FTA"`, `agreement` tương ứng, `rate: 0`.
  - Ngược lại → MFN.
  - VAT 10, mỗi kết quả kèm 1 mã thay thế.
- Lỗi:
  - thiếu/sai khóa → 401 `UNAUTHORIZED`;
  - body sai → 400 `INVALID_INPUT` + `details[{field,message}]` (dùng `HsCreateRequestSchema`, field dạng `items[0].origin_country`);
  - id lạ → 404;
  - trả lời khi dòng không `need_info` hoặc sai `question_id` → 409 `INVALID_STATE`;
  - quá 20 lần tạo/phút → 429 + `Retry-After: 2`;
  - header `X-Mock-Fail: 500|503` → mã đó.
- `POST …/{id}/cancel` → dòng chưa xong thành `cancelled`, trả `{accepted:true,cancelled:n}`.

- [ ] **Step 1: Write failing tests** – `hscodepro.test.ts` dựng server `node:http` trên cổng ngẫu nhiên, gọi bằng `fetch`:
  - 401 khi thiếu khóa;
  - 404 `khong-ton-tai`;
  - POST 3 dòng → 202, mọi dòng `queued`, `id` dòng khác nhau;
  - poll tới `need_info` cho dòng "thanh trượt", các dòng khác `completed` với `hs_code` 8 số;
  - trả lời → 202, poll tới `completed`;
  - trả lời lần 2 → 409;
  - `origin_country: "TWN"` → 400 có `details[0].field === "items[0].origin_country"`;
  - `co_form: "E"` + `CN` → `tax.import.basis === "FTA"`;
  - cancel → các dòng chưa xong `cancelled`;
  - mọi phản hồi parse được bằng `HsJobSchema` (contracts).
- [ ] **Step 2: Run** `cd apps/fpt-mock && npx vitest run src/hscodepro.test.ts` → FAIL.
- [ ] **Step 3: Implement** `hscodepro.ts` + gắn vào `app.ts`/`index.ts`; README thêm mục "HSCodePro giả lập" + curl mẫu (khóa `dev-hs-key`).
- [ ] **Step 4: Run** → PASS; test cũ của fpt-mock vẫn xanh.

### Task 3: Domain thuần – dòng hàng → yêu cầu, kết quả → gợi ý + thuế

**Files:**
- Create: `packages/core/src/modules/declaration/domain/hscodepro-map.ts`, `packages/core/src/modules/declaration/domain/__tests__/hscodepro-map.test.ts`
- Modify: `packages/core/src/modules/declaration/domain/rates.ts` (tách `fixedRatesFor(p)` – nhánh XK/miễn thuế – dùng chung)

**Interfaces – Produces:**

```ts
export const formatHs = (code: string) => code.replace(/\D/g, "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3"); // "84834090" → "8483.40.90"
export function coFormFor(raw: string | null): string | null; // "FORM E"/"e"/"E" → "E"; "AK" → "AK"; "EVFTA"/"EUR.1" → "EUR.1"; ngoài HS_CO_FORMS → null
export type HsLineInput = { lineNo: number; description: string; quantity: string; unit: string; amount: string; origin: string; invoiceHsCode: string | null };
export function toHsRequestItems(lines: HsLineInput[], ctx: { invoiceCurrency: string; fallbackOrigin: string | null; coForm: string | null }): { items: HsCreateItem[]; skipped: { lineNo: number; code: "NO_ORIGIN" | "SHORT_DESCRIPTION"; message: string }[] };
export type HsCandidate = { code: string; description: string; confidence: number; whyNot: string | null; importRate: string | null; basis: "MFN" | "FTA" | null; agreement: string | null; vatRate: string | null };
export function candidatesFromResult(r: HsResult): HsCandidate[]; // gợi ý chính trước, rồi alternatives; confidence /100; số thuế → chuỗi
export function ratesFromCandidate(c: HsCandidate | null, p: { direction: "NK" | "XK"; typeCode: string }): { importDutyRate: string | null; vatRate: string | null; policyNote: string | null }; // XK/miễn thuế → fixedRatesFor; c null hoặc tax null → null + note "Chưa có thuế suất cho mã này – kiểm tra biểu thuế"; FTA → note "Thuế ưu đãi đặc biệt <agreement> – cần C/O hợp lệ"
export const chunk = <T,>(xs: T[], n: number): T[][];
```

- [ ] **Step 1: Write failing tests** – `hscodepro-map.test.ts`:
  - `formatHs("84834090") === "8483.40.90"`;
  - `coFormFor("FORM E") === "E"`, `coFormFor("form AK") === "AK"`, `coFormFor("RCEP") === null`, `coFormFor(null) === null`;
  - `toHsRequestItems`:
    - dòng origin rỗng + `fallbackOrigin "CN"` → `origin_country "CN"`;
    - origin rỗng, không fallback → `skipped NO_ORIGIN`;
    - mô tả "ab" → `skipped SHORT_DESCRIPTION`;
    - mô tả 1500 ký tự → cắt 1000;
    - `invoiceCurrency "USD"` → có `value_usd` (Number từ chuỗi), `"EUR"` → không có `value_usd`;
    - `quantity "100"` → 100.
  - `candidatesFromResult(mẫu §4.2 dòng 2)` → `[{code:"8483.40.90",confidence:0.83,importRate:"5",basis:"MFN",vatRate:"10",whyNot:null}, {code:"8466.93.90", whyNot:"Chỉ đúng khi…", importRate:"0"}]`.
  - `ratesFromCandidate`:
    - XK → `"0"/"0"`;
    - typeCode `E31` → 0/0 kèm note;
    - candidate tax null → `importDutyRate null` + note;
    - FTA → note có "ACFTA".
  - `chunk(Array(120), 50)` → độ dài 50, 50, 20.
- [ ] **Step 2: Run** `cd packages/core && npx vitest run src/modules/declaration/domain/__tests__/hscodepro-map.test.ts` → FAIL.
- [ ] **Step 3: Implement**; test cũ của `rates.ts` vẫn xanh sau khi tách `fixedRatesFor`.
- [ ] **Step 4: Run** → PASS.

### Task 4: Port + hiện thực HTTP và Fake; cấu hình

**Files:**
- Modify: `packages/core/src/modules/declaration/application/ports.ts` (thay `HsClassifier` bằng `HsClassificationService`)
- Rewrite: `packages/core/src/modules/declaration/infrastructure/hs-classifier.ts` → `HscodeproHttpService`, `FakeHsClassificationService`
- Create: `packages/core/src/modules/declaration/infrastructure/hscodepro-http.int.test.ts` (chạy với máy giả lập trong tiến trình: import `createFptMock` từ `apps/fpt-mock`? KHÔNG – core không phụ thuộc app. Dùng server `node:http` tối giản trong test, trả JSON mẫu tài liệu, đủ cho 202/200/400/401/409/429/503)
- Modify: `packages/core/src/config/env.ts` (`HSCODEPRO_INTERNAL_KEY`, bắt buộc khi `HS_CLASSIFIER=hscodepro`), `.env.example`, `infrastructure/index.ts` (`createHsService`), `application/test/fakes.ts` (`ScriptedHsService`)

**Interfaces – Produces:**

```ts
export class HsApiError extends Error { constructor(readonly status: number, readonly code: string, message: string, readonly details?: { field: string; message: string }[]) }
export interface HsClassificationService {
  readonly name: string; // "hscodepro" | "fake-hs"
  create(req: HsCreateRequest): Promise<HsJob>;
  get(jobId: string): Promise<HsJob>;
  answer(jobId: string, itemId: string, body: HsAnswerRequest): Promise<void>;
  cancel(jobId: string): Promise<void>;
}
// HscodeproHttpService(baseUrl, apiKey, opts?: { fetch?: typeof fetch; sleep?: (ms) => Promise<void> })
//  - header X-Internal-Api-Key, timeout 30s; 429 → sleep(Retry-After*1000) tối đa 3 lần rồi HsApiError(429,"RATE_LIMITED")
//  - !ok → HsApiError(status, body.code ?? "HTTP_<status>", body.error ?? statusText, body.details)
//  - phản hồi 2xx parse bằng HsJobSchema / z.object({accepted:z.literal(true)})
// FakeHsClassificationService(loadCatalog): create → lượt "completed" ngay, kết quả từ chấm điểm từ khóa catalog_hs (logic FakeHsClassifier cũ), mã trả dạng 8 số; lưu trong Map để get/answer/cancel
```

- [ ] **Step 1: Write failing tests**:
  - `hscodepro-http.int.test.ts`:
    - gửi đúng header khóa + path `/internal/v1/hs-classifications`;
    - 202 → `HsJob`;
    - 429 với `Retry-After: 1` hai lần rồi 202 → thành công, `sleep` gọi 2 lần với 1000;
    - 429 mãi → `HsApiError` code `RATE_LIMITED`;
    - 400 → `HsApiError` có `details[0].field`;
    - 409 → `HsApiError.code === "INVALID_STATE"`;
    - 503 → `code NOT_CONFIGURED`;
    - phản hồi sai cấu trúc → lỗi Zod rõ ràng ("HSCodePro trả dữ liệu không đúng cấu trúc").
  - `env.test.ts`: `HS_CLASSIFIER=hscodepro` thiếu `HSCODEPRO_INTERNAL_KEY` → lỗi nêu tên biến.
  - Fake: `create` hai dòng "ổ bi"/"bearing" → `completed`, `hs_code` 8 số khớp catalog.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; xóa `HsClassifier`, `FakeHsClassifier`, `HscodeproClassifier` cũ và sửa chỗ dùng (`infrastructure/index.ts`, `declaration/index.ts`, fakes, test flows `phase4/phase5`).
- [ ] **Step 4: Run** `pnpm --filter @kb/core typecheck && cd packages/core && npx vitest run src/modules/declaration src/config` → PASS.

### Task 5: DB – bảng `hs_jobs`, cột trạng thái HS trên dòng hàng

**Files:**
- Modify: `packages/core/src/db/schema/declaration.ts`
- Create: `packages/core/drizzle/0011_hscodepro.sql` (+ `_journal.json`)
- Modify: `application/ports.ts` (repo `hsJobs`, `LineItemRow` thêm cột), `infrastructure/drizzle-uow.ts`, `application/test/in-memory-uow.ts`, `application/_dto.ts` (`toLineItem` → `hs`)
- Test: `packages/core/src/modules/declaration/infrastructure/drizzle-uow.int.test.ts` (thêm case)

**Schema:**
- `hs_jobs`:
  - cột: `id`, `org_id`, `dossier_id` (FK cascade), `external_id` (text, id lượt HSCodePro), `status` (`processing|need_info|completed|cancelled`), `polls` (int, mặc định 0), `created_at`, `updated_at`;
  - index `(org_id, dossier_id)`; RLS `orgRls`.
- `line_items` thêm:
  - `hs_job_id` (text null);
  - `hs_item_id` (text null);
  - `hs_status` (text, mặc định `'idle'`);
  - `hs_question`, `hs_error`, `hs_detail` (jsonb null; detail = `{ reasoning, legalBasis, warnings }`).
- `hs_suggestions` thêm `why_not` (text null). Thuế lưu trong `rates` jsonb đã có, dạng `{ importRate, basis, agreement, vatRate }`.

**Repo – Produces:**
- `hsJobs`:
  - `insert(row)`;
  - `get(orgId, id)`;
  - `openForDossier(orgId, dossierId)` (status ≠ completed/cancelled);
  - `update(id, patch)`.
- `lineItems.update` cho phép thêm các cột `hs*`.
- `lineItems.findByHsItem(orgId, hsItemId)`.

- [ ] **Step 1: Write failing int test**:
  - insert hs_job + update line item `hsStatus "need_info"` với `hsQuestion` → đọc lại đúng;
  - org khác không thấy hs_job (RLS).
- [ ] **Step 2: Run** `cd packages/core && npx vitest run src/modules/declaration/infrastructure/drizzle-uow.int.test.ts` → FAIL.
- [ ] **Step 3: Implement**:
  - schema;
  - `pnpm --filter @kb/core db:generate` → đổi tên `0011_hscodepro.sql`, sửa journal, đọc SQL kiểm policy;
  - repo drizzle + in-memory;
  - `toLineItem` thêm `hs` (candidates lấy từ suggestions của dòng, sắp theo confidence giảm dần, gợi ý chính đứng đầu).
- [ ] **Step 4: Run** → PASS; `pnpm db:migrate` trên DB dev.

### Task 6: Use case – agent tạo lượt, poll, trả lời, phân loại lại, xác nhận

**Files:**
- Create: `packages/core/src/modules/declaration/application/hs-classification.ts` (`startHsClassification`, `pollHsJob`, `answerHsQuestion`, `sendHsAnswer`, `reclassifyHs`)
- Modify: `application/agent-run.ts` (HS_LOOKUP), `application/line-items.ts` (`confirmHs`), `shared/queue.ts` (`QUEUE_NAMES` thêm `hs-poll`, `hs-answer`), `declaration/index.ts` (export)
- Create: `application/__tests__/hs-classification.test.ts`
- Modify: `apps/worker/src/jobs/hs.ts` (mới) + `apps/worker/src/index.ts` (2 Worker), `apps/worker/src/container.ts` nếu cần

**Interfaces – Produces:**

```ts
/** Gửi các dòng chưa xác nhận (hoặc chỉ `lineItemIds`) thành ≤50 dòng/lượt; hủy lượt mở cũ của các dòng đó; ghi hs_status queued/skipped; đẩy hs-poll (delay 3s). */
export async function startHsClassification(deps, ctx: { orgId; userId }, dossierId: string, opts?: { lineItemIds?: string[]; extra?: Record<string, { extraDescription?: string; origin?: string }> }): Promise<Result<{ jobIds: string[]; skipped: number }>>;
/** Job hs-poll: get lượt → cập nhật từng dòng (chỉ dòng có hs_job_id = lượt này) → nếu còn processing và polls < 300 thì hẹn lại 3s; hết processing → nếu agent run đang RUNNING ở HS_LOOKUP và mọi lượt của hồ sơ hết processing → đánh dấu HS_LOOKUP DONE + đẩy run-agent; quá 300 lần → dòng chưa xong → failed TIMEOUT. */
export async function pollHsJob(deps, input: { orgId; userId; dossierId; hsJobId: string }): Promise<Result<{ again: boolean }>>;
/** Web: kiểm quyền + Zod đã parse + dòng đang need_info với đúng questionId → hs_status "answering" + đẩy hs-answer. Sai trạng thái → INVALID_STATE (409). */
export async function answerHsQuestion(deps, ctx: Ctx, lineItemId: string, input: HsAnswerInput): Promise<Result<LineItem>>;
/** Job hs-answer: gọi service.answer; 409 → bỏ qua (đã gửi); rồi đẩy hs-poll. */
export async function sendHsAnswer(deps, input: { orgId; userId; dossierId; lineItemId; questionId; answers }): Promise<Result<void>>;
/** Web: phân loại lại 1 dòng (có thể bổ sung mô tả/xuất xứ) → startHsClassification với lineItemIds=[id]; dòng đã xác nhận hoặc hồ sơ đã duyệt → lỗi. */
export async function reclassifyHs(deps, ctx: Ctx, lineItemId: string, input: HsReclassifyInput): Promise<Result<LineItem>>;
```

Các thay đổi đi kèm:
- `confirmHs(deps, ctx, itemId, code)`:
  - `code` chuẩn hóa `formatHs`; mã phải là 8 số;
  - thuế lấy từ candidate cùng mã (nếu có) qua `ratesFromCandidate`;
  - không có candidate mà có trong `catalog_hs` → `ratesFor` cũ;
  - không có cả hai → chấp nhận, thuế `null` + `policyNote` "Mã nhập tay – chưa có thuế suất, kiểm tra biểu thuế".
- HS_LOOKUP trong `runAgent`:
  - lần đầu (task PENDING): gọi `startHsClassification`, đặt task RUNNING "Đang chờ HSCodePro…", rồi **return** (run giữ RUNNING; `hs-poll` sẽ đẩy lại `run-agent`);
  - khi chạy lại mà task đã DONE: đi tiếp như cũ.
  - Fake service trả `completed` ngay: `hs-poll` đầu tiên xong là đi tiếp.

- [ ] **Step 1: Write failing tests** – `hs-classification.test.ts` dùng `ScriptedHsService` (trả lượt theo kịch bản), `InMemoryJobQueue`, in-memory uow:
  1. `startHsClassification`:
     - 3 dòng, 1 thiếu xuất xứ → `create` nhận 2 items, dòng thiếu `hs_status "skipped"` + error `NO_ORIGIN`;
     - đẩy 1 job `hs-poll` delay 3000.
  2. 120 dòng → 3 lần `create` (50/50/20).
  3. `pollHsJob`:
     - dòng completed → `hsSuggested "8483.40.90"`, `hsConfidence 0.83`, suggestions có thuế;
     - dòng need_info → `hsQuestion` lưu;
     - lượt còn processing → `again true` + đẩy lại hs-poll.
  4. Lượt hết processing + agent run RUNNING ở HS_LOOKUP → task DONE + đẩy `run-agent`; dòng need_info **không** chặn.
  5. Chạy lại khi có lượt mở → `cancel` lượt cũ được gọi; poll lượt cũ đến muộn không ghi vào dòng đã chuyển sang lượt mới (`hs_job_id` khác).
  6. `answerHsQuestion`:
     - đúng → `hs_status "answering"` + job `hs-answer`;
     - dòng không need_info → `INVALID_STATE`;
     - VIEWER → FORBIDDEN;
     - org khác → NOT_FOUND.
  7. `sendHsAnswer`: service ném `HsApiError(409,"INVALID_STATE")` → ok + vẫn đẩy hs-poll.
  8. `confirmHs`:
     - mã thay thế `8466.93.90` → `importDutyRate "0"` theo thuế của mã đó;
     - mã nhập tay `9999.99.99` → thuế null + policyNote;
     - hàng XK → 0/0.
  9. 300 lần poll vẫn processing → dòng `failed` code `TIMEOUT`, `again false`.
- [ ] **Step 2: Run** `cd packages/core && npx vitest run src/modules/declaration/application/__tests__/hs-classification.test.ts` → FAIL.
- [ ] **Step 3: Implement** use case + sửa `agent-run.ts`, `line-items.ts`, queue names.
  - Worker `apps/worker/src/jobs/hs.ts`: `HsPollPayload`/`HsAnswerPayload` (Zod) → gọi use case; lỗi tạm (HsApiError 5xx/mạng) ném ra để BullMQ retry (attempts 5, backoff 5s).
  - Đăng ký Worker `hs-poll` (concurrency 4), `hs-answer` (concurrency 2).
- [ ] **Step 4: Run** declaration + test cũ agent-run/line-items (sửa kỳ vọng theo luồng mới) → PASS; `pnpm --filter @kb/core typecheck && pnpm --filter @kb/worker typecheck`.

### Task 7: Web – route, API layer (http + mock), màn "Xác nhận mã HS"

**Files:**
- Create: `apps/web/src/app/api/line-items/[id]/hs/answer/route.ts`, `apps/web/src/app/api/line-items/[id]/hs/reclassify/route.ts`
- Modify: `apps/web/src/api/declaration.ts`, `apps/web/src/api/http/declaration.ts`, `apps/web/src/mocks/api/declaration.ts` (mô phỏng: dòng mô tả có "guide"/"thanh trượt" → need_info; trả lời → completed sau 2 giây)
- Create: `apps/web/src/features/dossier-detail/steps/hs/hs-answer-dialog.tsx`, `hs-status.tsx` (ô trạng thái + gợi ý + thuế + cảnh báo), `hs-format.ts` (+ `hs-format.test.ts`: `formatTax`, `hsTone`)
- Modify: `apps/web/src/features/dossier-detail/steps/agent-step.tsx` (dùng các thành phần trên; `ChangeHsDialog` hiện candidates + ô nhập tay mã 8 số; poll line-items 3s khi còn dòng queued/processing/answering)
- e2e: `apps/web/e2e/hscodepro.spec.ts`

**Interfaces – Consumes:** `answerHsQuestion`, `reclassifyHs`, `confirmHs` (Task 6); `LineItem.hs` (Task 1).
**Produces:**
- `answerHs(itemId, input: HsAnswerInput): Promise<LineItem>`;
- `reclassifyHs(itemId, input: HsReclassifyInput): Promise<LineItem>`;
- `formatTax(c: HsCandidate | null) → "5% · 10%" | "0% (ACFTA) · 10%" | "—"`;
- `hsTone(confidence, warnings) → "warning" | "neutral"` (< 0.6 hoặc có cảnh báo → warning).

- [ ] **Step 1: Write failing tests**:
  - `hs-format.test.ts`: formatTax (MFN, FTA, null tax, vat null → "5% · —"), hsTone;
  - test component `hs-answer-dialog.test.tsx`:
    - radio khi `multiSelect` false, checkbox khi true;
    - luôn có ô "Trả lời khác";
    - nút Gửi tắt khi câu nào chưa có đáp án;
    - axe không lỗi.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/features/dossier-detail/steps/hs` → FAIL.
- [ ] **Step 3: Implement**:
  - route mỏng: `requireSession` → `parseBody(HsAnswerInputSchema)` → use case → map lỗi;
  - API layer + mock;
  - UI theo spec §4: trạng thái từng dòng, "Trả lời AI", "Phân loại lại" (Dialog có ô bổ sung mô tả + xuất xứ khi thiếu), cảnh báo dưới mã, chi tiết lý do/căn cứ trong `ChangeHsDialog`.
- [ ] **Step 4: Run** unit → PASS; `pnpm --filter web typecheck && pnpm lint`.
- [ ] **Step 5: e2e** `hscodepro.spec.ts`. Chạy với worker `HS_CLASSIFIER=hscodepro HSCODEPRO_URL=http://localhost:7070 HSCODEPRO_INTERNAL_KEY=dev-hs-key` + `pnpm fpt-mock`, skip khi `E2E_HS!=="hscodepro"`, giống vnaccs-fpt.
  - Tạo hồ sơ với invoice mẫu, chạy agent → bảng có dòng "Cần bổ sung" (mock: mô tả có "guide").
  - Trả lời → dòng có mã.
  - Xác nhận mọi dòng → Review.
  - Với `HS_CLASSIFIER=fake`: `agent-declaration.spec.ts` cũ vẫn xanh.
- [ ] **Step 6: Kiểm trình duyệt**: bảng HS + hộp "Trả lời AI", sáng/tối, 1366/390.

### Task 8: Script smoke, tài liệu, kiểm toàn bộ

**Files:**
- Create: `packages/core/scripts/hscodepro-smoke.ts` + script `hscodepro:smoke` trong `package.json` gốc
- Modify: `docs/BACKEND-TODO.md` (T2: đã tích hợp, chờ khóa; D1: thuế lấy từ HSCodePro), `docs/PRODUCT.md` (màn Xác nhận HS), `apps/web/CLAUDE.md` (route mới), `.env.example`, `CLAUDE.md` (fpt-mock có thêm HSCodePro giả lập)

Script chạy checklist §10 của tài liệu bằng `HscodeproHttpService` với `HSCODEPRO_URL`/`HSCODEPRO_INTERNAL_KEY` từ env:
1. GET `khong-ton-tai` → 404.
2. Tạo invoice 3 dòng mẫu → poll tới hết processing (≤ 5 phút), in trạng thái từng dòng.
3. Nếu có dòng need_info → in câu hỏi (không tự trả lời).
4. `co_form E` + `CN` → in basis.
5. `TWN` → kỳ vọng 400 `items[0].origin_country`.
6. Tạo rồi cancel ngay → in số dòng hủy.

In bảng PASS/FAIL; không in khóa.

- [ ] **Step 1:** Viết script; chạy với máy giả lập (`pnpm fpt-mock` + `HSCODEPRO_URL=http://localhost:7070 HSCODEPRO_INTERNAL_KEY=dev-hs-key pnpm hscodepro:smoke`) → 6/6 PASS.
- [ ] **Step 2:** Cập nhật tài liệu.
- [ ] **Step 3:** `pnpm typecheck && pnpm lint && pnpm test` → xanh; e2e `agent-declaration`, `customs-and-list`, `hscodepro` → xanh.
