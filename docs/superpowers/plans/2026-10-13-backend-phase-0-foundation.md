# Backend giai đoạn 0 – Nền tảng · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng nền tảng backend (contracts, shared kernel, Postgres + Drizzle + RLS, Docker Compose, worker khung, composition root, tách mock/http ở FE) để các giai đoạn sau chỉ thêm module.

**Architecture:** Monorepo pnpm; `packages/contracts` giữ Zod schema dùng chung; `packages/core` giữ shared kernel + db + modules; `apps/web` và `apps/worker` chỉ nối dependency trong `container.ts`. Dữ liệu nghiệp vụ luôn qua `withCtx(orgId, userId)` để Postgres RLS làm lớp bảo vệ thứ hai. FE giữ nguyên màn hình; `src/api/*.ts` chọn nguồn mock/http bằng biến môi trường.

**Tech Stack:** TypeScript 5.9 strict, Zod 4, Drizzle ORM 0.45 + drizzle-kit 0.31, postgres.js 3.4, BullMQ 6 + ioredis 6, decimal.js 10, ulid 3, @node-rs/argon2 2, Vitest 5, @testcontainers/postgresql 12, tsx 4, dotenv 17, concurrently 10, Docker Compose (postgres:16, redis:7, minio, mailpit).

**Spec:** `docs/superpowers/specs/2026-10-13-backend-design.md` (§3 kiến trúc, §3.2 DB, §5 API, §6 cấu trúc, §8 giai đoạn 0).

## Global Constraints

- `strict: true`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` (tsconfig.base.json). Cấm `any`, cấm `@ts-ignore`.
- Mã định danh (MST, số vận đơn, HS…) là `string`. Tiền/trị giá là `DecimalString` ở DTO, `Decimal` trong domain, `numeric(24,6)` trong DB.
- Ngày nghiệp vụ `YYYY-MM-DD`; thời điểm ISO UTC, DB `timestamptz`.
- Mọi bảng nghiệp vụ có `org_id text not null`, index `(org_id, …)`, policy RLS. Repo nhận `orgId` là tham số đầu tiên.
- Module chỉ import qua `modules/<m>/index.ts`; `apps/*` chỉ import `@kb/core/modules/*`, trừ `apps/*/src/container.ts`. Kiểm bằng `pnpm lint` (depcruise).
- Import nội bộ trong `packages/core` và `packages/contracts` dùng đuôi `.js` (NodeNext), giống `@kb/ui`.
- Dữ liệu từ ngoài (HTTP, env, queue) parse bằng Zod trước khi dùng.
- Test: file cạnh nguồn `x.test.ts`; integration `x.int.test.ts`; tên `it` bằng tiếng Việt; Arrange–Act–Assert.
- Trước khi báo xong: `pnpm typecheck && pnpm lint && pnpm test` xanh. Không commit khi chưa được yêu cầu (quy ước phiên làm việc này: người dùng tự commit; mỗi task kết thúc bằng bước "Sẵn sàng commit" liệt kê file).
- Không dùng `pnpm dlx`/`npx` cho lệnh lặp lại; dùng script trong `package.json`.

## Review Focus

1. `withCtx` với `orgId` rỗng hoặc không phải chuỗi: phải ném lỗi lập trình ngay, không chạy truy vấn với policy "không org" → test trong Task 5.
2. RLS phải chặn ngay cả khi repo quên `where org_id`: test đọc bảng `memberships` qua `withCtx(orgB)` không thấy dòng của orgA → Task 5.
3. Biến môi trường thiếu hoặc sai (vd `AI_PROVIDER=claude` không có `ANTHROPIC_API_KEY`): khởi động phải thất bại với thông báo rõ, không chạy nửa chừng → Task 4.
4. `DecimalString` nhận `"1,5"`, `"abc"`, `"1e3"`, `""`: phải bị Zod từ chối; `"-0.50"`, `"1234567.123456"` hợp lệ → Task 1.
5. FE chạy với `NEXT_PUBLIC_DATA_SOURCE` không đặt: mặc định `mock` để bản demo Vercel và PM không hỏng → Task 8.

---

## Bản đồ file

```
packages/contracts/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts                       export * from "./common.js"; export * from "./dto/index.js"
  src/common.ts                      IsoDate, IsoDateTime, DecimalString, Direction, Role, StepId… + test
  src/dto/{dossier,document,ocr,declaration,customs,skill,identity,notification,index}.ts
packages/core/
  package.json, tsconfig.json, vitest.config.ts, drizzle.config.ts
  src/shared/{result,errors,ids,ctx,clock,decimal,index}.ts (+ .test.ts)
  src/config/env.ts (+ test)
  src/db/{client,with-ctx,migrate,index}.ts, src/db/schema/{shared,plans,identity,index}.ts
  src/db/with-ctx.int.test.ts
  drizzle/0000_init.sql (+ meta)
  scripts/{migrate,seed,reset}.ts
apps/worker/
  package.json, tsconfig.json, src/{index,container}.ts, src/jobs/health.ts
apps/web/
  src/container.ts, src/app/api/health/route.ts
  src/lib/{api-error,http,data-source}.ts
  src/mocks/api/*.ts  (git mv từ src/api/*.ts)
  src/api/*.ts        (selector mock|http)
  src/mocks/types.ts  (re-export từ @kb/contracts + nhãn)
docker-compose.yml, docker/postgres/init.sql, .env.example
package.json (scripts), .dependency-cruiser.cjs (rule schema), .github/workflows/ci.yml
```

---

### Task 1: Package `@kb/contracts` và schema chung

**Files:**
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/vitest.config.ts`
- Create: `packages/contracts/src/index.ts`, `packages/contracts/src/common.ts`, `packages/contracts/src/common.test.ts`
- Modify: `tsconfig.base.json` (paths), `apps/web/package.json` (dep), `apps/web/next.config.ts` (transpile)

**Interfaces:**
- Produces: `IsoDateSchema`, `IsoDateTimeSchema`, `DecimalStringSchema`, `DirectionSchema`, `RoleSchema`, `StepIdSchema`, `DossierStatusSchema`, `CustomsChannelSchema`, `DocKindSchema`, `DocumentStatusSchema`, `FieldStatusSchema`, `RuleResultSchema`, `RuleSeveritySchema`, `ValueSourceSchema`, `TransportModeSchema`; kiểu `IsoDate`, `IsoDateTime`, `DecimalString`, `Direction`, `Role`, … (`z.infer`). Hằng `STEP_ORDER`.

- [ ] **Step 1: Tạo package**

`packages/contracts/package.json`:
```json
{
  "name": "@kb/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^4.6.6" },
  "devDependencies": { "@types/node": "^26.6.5", "typescript": "^5.9.3", "vitest": "^5.0.4" }
}
```

`packages/contracts/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node"], "lib": ["ES2023"] },
  "include": ["src", "vitest.config.ts"]
}
```

`packages/contracts/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

Chạy: `pnpm install` (từ gốc). Kỳ vọng: không lỗi, `node_modules/@kb/contracts` là symlink.

- [ ] **Step 2: Viết test cho schema chung (fail trước)**

`packages/contracts/src/common.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema, STEP_ORDER, StepIdSchema } from "./common.js";

describe("DecimalStringSchema", () => {
  it.each(["0", "-0.50", "1234567.123456", "20850.00"])("chấp nhận %s", (v) => {
    expect(DecimalStringSchema.parse(v)).toBe(v);
  });
  it.each(["1,5", "abc", "1e3", "", " 1", "1.", ".5", "+1"])("từ chối %s", (v) => {
    expect(DecimalStringSchema.safeParse(v).success).toBe(false);
  });
});

describe("IsoDateSchema", () => {
  it("chấp nhận YYYY-MM-DD hợp lệ", () => {
    expect(IsoDateSchema.parse("2026-10-13")).toBe("2026-10-13");
  });
  it.each(["13/10/2026", "2026-13-01", "2026-02-30", "2026-1-5"])("từ chối %s", (v) => {
    expect(IsoDateSchema.safeParse(v).success).toBe(false);
  });
});

describe("IsoDateTimeSchema", () => {
  it("chấp nhận ISO 8601 UTC", () => {
    expect(IsoDateTimeSchema.parse("2026-10-13T08:00:00.000Z")).toBe("2026-10-13T08:00:00.000Z");
  });
  it("từ chối thiếu múi giờ", () => {
    expect(IsoDateTimeSchema.safeParse("2026-10-13T08:00:00").success).toBe(false);
  });
});

describe("StepId", () => {
  it("STEP_ORDER đủ 6 bước đúng thứ tự", () => {
    expect(STEP_ORDER).toEqual(["create", "upload", "ocr", "agent", "review", "submit"]);
    for (const s of STEP_ORDER) expect(StepIdSchema.parse(s)).toBe(s);
  });
});
```

- [ ] **Step 3: Chạy test, kỳ vọng fail**

Run: `pnpm --filter @kb/contracts test`
Expected: FAIL – không tìm thấy module `./common.js`.

- [ ] **Step 4: Viết `common.ts`**

`packages/contracts/src/common.ts`:
```ts
import { z } from "zod";

/** Ngày nghiệp vụ YYYY-MM-DD, kiểm tra ngày tồn tại thật. */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải dạng YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Ngày không tồn tại");
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** Thời điểm ISO 8601 có múi giờ (lưu UTC). */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** Tiền/trị giá dạng chuỗi thập phân dấu chấm, không dấu phân cách nghìn, không ký hiệu mũ. */
export const DecimalStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/, "Số thập phân dạng 1234.56");
export type DecimalString = z.infer<typeof DecimalStringSchema>;

export const DirectionSchema = z.enum(["NK", "XK"]);
export type Direction = z.infer<typeof DirectionSchema>;

export const StepIdSchema = z.enum(["create", "upload", "ocr", "agent", "review", "submit"]);
export type StepId = z.infer<typeof StepIdSchema>;
export const STEP_ORDER: readonly StepId[] = StepIdSchema.options;

export const DossierStatusSchema = z.enum(["DRAFT", "PROCESSING", "NEEDS_REVIEW", "APPROVED", "SUBMITTED", "CLEARED", "CANCELLED"]);
export type DossierStatus = z.infer<typeof DossierStatusSchema>;

export const CustomsChannelSchema = z.enum(["GREEN", "YELLOW", "RED"]);
export type CustomsChannel = z.infer<typeof CustomsChannelSchema>;

export const TransportModeSchema = z.enum(["SEA", "AIR", "ROAD"]);
export type TransportMode = z.infer<typeof TransportModeSchema>;

export const DocKindSchema = z.enum([
  "INVOICE", "PACKING_LIST", "BILL_OF_LADING", "AIR_WAYBILL", "CERT_OF_ORIGIN",
  "SALES_CONTRACT", "ARRIVAL_NOTICE", "FREIGHT_INVOICE", "OTHER",
]);
export type DocKind = z.infer<typeof DocKindSchema>;

export const DocumentStatusSchema = z.enum(["UPLOADING", "QUEUED", "READING", "DONE", "ERROR"]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

/** ADR 0003. */
export const FieldStatusSchema = z.enum(["CROSS_CHECKED", "SINGLE_SOURCE", "CONFLICT", "INVALID_FORMAT", "MODEL_UNSURE", "USER_CONFIRMED"]);
export type FieldStatus = z.infer<typeof FieldStatusSchema>;

export const RuleResultSchema = z.enum(["PASS", "WARN", "FAIL", "SKIPPED"]);
export type RuleResult = z.infer<typeof RuleResultSchema>;
export const RuleSeveritySchema = z.enum(["BLOCKER", "WARNING", "INFO"]);
export type RuleSeverity = z.infer<typeof RuleSeveritySchema>;

export const ValueSourceSchema = z.enum(["INVOICE", "BILL_OF_LADING", "PACKING_LIST", "CONTRACT", "CERT_OF_ORIGIN", "DOSSIER", "ACCOUNT", "DEFAULT", "SYSTEM"]);
export type ValueSource = z.infer<typeof ValueSourceSchema>;

export const RoleSchema = z.enum(["OWNER", "ADMIN", "DECLARANT", "APPROVER", "VIEWER"]);
export type Role = z.infer<typeof RoleSchema>;
```

`packages/contracts/src/index.ts`:
```ts
export * from "./common.js";
```

- [ ] **Step 5: Chạy test, kỳ vọng pass**

Run: `pnpm --filter @kb/contracts test`
Expected: PASS (4 describe).

- [ ] **Step 6: Nối vào web và tsconfig gốc**

`tsconfig.base.json` → trong `paths` thêm:
```json
"@kb/core/db": ["packages/core/src/db/index.ts"],
"@kb/core/shared": ["packages/core/src/shared/index.ts"],
"@kb/core/config": ["packages/core/src/config/index.ts"]
```
(giữ hai path cũ).

`apps/web/package.json` → `dependencies` thêm `"@kb/contracts": "workspace:*"`.
`apps/web/next.config.ts` → `transpilePackages: ["@kb/ui", "@kb/contracts", "@kb/core"]`.

Run: `pnpm install && pnpm --filter @kb/contracts typecheck && pnpm --filter @kb/web typecheck`
Expected: cả hai xanh.

- [ ] **Step 7: Sẵn sàng commit**

Files: `packages/contracts/**`, `tsconfig.base.json`, `apps/web/package.json`, `apps/web/next.config.ts`, `pnpm-lock.yaml`. Thông điệp gợi ý: `feat(contracts): package @kb/contracts với schema chung`.

---

### Task 2: DTO Zod cho toàn bộ kiểu FE, FE dùng kiểu từ contracts

**Files:**
- Create: `packages/contracts/src/dto/{dossier,document,ocr,declaration,customs,skill,identity,notification,index}.ts`, `packages/contracts/src/dto/dto.test.ts`
- Modify: `packages/contracts/src/index.ts`, `apps/web/src/mocks/types.ts` (giữ nhãn, type lấy từ contracts)

**Interfaces:**
- Produces: schema `DossierSchema`, `DossierDocumentSchema`, `RegionSchema`, `ExtractedFieldSchema`, `CrossCheckSchema`, `LineItemSchema`, `DeclarationFieldSchema`, `DeclarationSchema`, `AgentRunSchema`, `CustomsMessageSchema`, `CustomsResultSchema`, `SkillFieldSchema`, `SkillSchema`, `MemberSchema`, `OrganizationSchema`, `IntegrationSchema`, `DigitalCertificateSchema`, `NotificationSchema` và kiểu `z.infer` cùng tên không hậu tố (`Dossier`, `DossierDocument`, …). Hình dạng **bằng đúng** `apps/web/src/mocks/types.ts` hiện tại (đọc file đó khi viết; mọi `foo?: T` → `.optional()`).

- [ ] **Step 1: Viết test hình dạng (fail trước)**

`packages/contracts/src/dto/dto.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DeclarationSchema, DossierSchema, ExtractedFieldSchema, SkillSchema } from "./index.js";

const dossier = {
  id: "dos_021", code: "HS-NK-2610-021", direction: "NK", typeCode: "A11", partner: "HANSOL PRECISION CO., LTD.",
  customsOffice: "03CE – Chi cục HQ cửa khẩu cảng Hải Phòng KV III", skillSetId: "set_default", status: "NEEDS_REVIEW",
  step: "ocr", dueDate: "2026-10-14", createdAt: "2026-10-12T06:00:00.000Z", updatedAt: "2026-10-13T06:00:00.000Z",
  ownerId: "usr_chau", invoiceValue: "20850.00", currency: "USD", incoterm: "FCA", transportMode: "SEA",
  billNo: "HPSEL2610078", suspectFields: 16,
};

describe("DTO", () => {
  it("DossierSchema chấp nhận hồ sơ mẫu và từ chối invoiceValue là number", () => {
    expect(DossierSchema.parse(dossier)).toEqual(dossier);
    expect(DossierSchema.safeParse({ ...dossier, invoiceValue: 20850 }).success).toBe(false);
  });
  it("ExtractedFieldSchema: region là % trang 0–100", () => {
    const f = { id: "f1", documentId: "doc_1", group: "GENERAL", key: "invoice_no", label: "Số hóa đơn", value: "INV-1", originalValue: "INV-1", status: "SINGLE_SOURCE", region: { page: 1, x: 10, y: 20, w: 30, h: 5 } };
    expect(ExtractedFieldSchema.parse(f)).toEqual(f);
    expect(ExtractedFieldSchema.safeParse({ ...f, region: { ...f.region, x: 120 } }).success).toBe(false);
  });
  it("DeclarationSchema: kind IDA|EDA, tiền là chuỗi", () => {
    const d = { dossierId: "dos_021", kind: "IDA", status: "DRAFT", fields: [], exchangeRate: "25400", exchangeRateDate: "2026-10-13", customsValueVnd: "0", valueAdjustments: [], estimatedImportDutyVnd: "0", estimatedVatVnd: "0" };
    expect(DeclarationSchema.parse(d)).toEqual(d);
    expect(DeclarationSchema.safeParse({ ...d, kind: "AMA" }).success).toBe(false);
  });
  it("SkillSchema: accuracy trong [0,1]", () => {
    const s = { id: "sk", code: "SK-INV-GEN", name: "Invoice", kind: "DOCUMENT", docKind: "INVOICE", language: "EN", version: 1, labeledSamples: 0, updatedAt: "2026-10-13T06:00:00.000Z", enabled: true, fields: [] };
    expect(SkillSchema.parse(s)).toEqual(s);
    expect(SkillSchema.safeParse({ ...s, accuracy: 1.2 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, kỳ vọng fail**

Run: `pnpm --filter @kb/contracts test`
Expected: FAIL – không có `./dto/index.js`.

- [ ] **Step 3: Viết các file DTO**

`packages/contracts/src/dto/dossier.ts`:
```ts
import { z } from "zod";
import { CustomsChannelSchema, DecimalStringSchema, DirectionSchema, DossierStatusSchema, IsoDateSchema, IsoDateTimeSchema, StepIdSchema, TransportModeSchema } from "../common.js";

export const DossierSchema = z.object({
  id: z.string(),
  code: z.string(),
  direction: DirectionSchema,
  typeCode: z.string(),
  partner: z.string(),
  customsOffice: z.string(),
  skillSetId: z.string(),
  status: DossierStatusSchema,
  step: StepIdSchema,
  dueDate: IsoDateSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  ownerId: z.string(),
  invoiceValue: DecimalStringSchema,
  currency: z.string(),
  incoterm: z.string(),
  transportMode: TransportModeSchema,
  billNo: z.string(),
  suspectFields: z.number().int().nonnegative(),
  note: z.string().optional(),
  declarationNo: z.string().optional(),
  channel: CustomsChannelSchema.optional(),
});
export type Dossier = z.infer<typeof DossierSchema>;
```

`packages/contracts/src/dto/document.ts`:
```ts
import { z } from "zod";
import { DocKindSchema, DocumentStatusSchema, IsoDateTimeSchema } from "../common.js";

export const DossierDocumentSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  kind: DocKindSchema,
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative(),
  status: DocumentStatusSchema,
  error: z.string().optional(),
  uploadedAt: IsoDateTimeSchema,
});
export type DossierDocument = z.infer<typeof DossierDocumentSchema>;
```

`packages/contracts/src/dto/ocr.ts`:
```ts
import { z } from "zod";
import { DocKindSchema, FieldStatusSchema, RuleResultSchema, RuleSeveritySchema } from "../common.js";

const pct = z.number().min(0).max(100);
export const RegionSchema = z.object({ page: z.number().int().positive(), x: pct, y: pct, w: pct, h: pct });
export type Region = z.infer<typeof RegionSchema>;

export const FieldGroupSchema = z.enum(["GENERAL", "PARTIES", "COMMERCIAL", "TRANSPORT", "ITEMS"]);
export type FieldGroup = z.infer<typeof FieldGroupSchema>;

export const ExtractedFieldSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  group: FieldGroupSchema,
  key: z.string(),
  label: z.string(),
  value: z.string(),
  originalValue: z.string(),
  status: FieldStatusSchema,
  region: RegionSchema.optional(),
  note: z.string().optional(),
});
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

export const CrossCheckSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  ruleCode: z.string(),
  title: z.string(),
  detail: z.string(),
  result: RuleResultSchema,
  severity: RuleSeveritySchema,
  documentKinds: z.array(DocKindSchema),
});
export type CrossCheck = z.infer<typeof CrossCheckSchema>;
```

`packages/contracts/src/dto/declaration.ts`:
```ts
import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema, ValueSourceSchema } from "../common.js";

export const LineItemSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  lineNo: z.number().int().positive(),
  description: z.string(),
  quantity: DecimalStringSchema,
  unit: z.string(),
  unitPrice: DecimalStringSchema,
  amount: DecimalStringSchema,
  origin: z.string(),
  invoiceHsCode: z.string().optional(),
  hsSuggested: z.string().optional(),
  hsConfidence: z.number().min(0).max(1).optional(),
  hsConfirmed: z.string().optional(),
  importDutyRate: DecimalStringSchema.optional(),
  vatRate: DecimalStringSchema.optional(),
  policyNote: z.string().optional(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const DeclarationSectionSchema = z.enum(["GENERAL", "PARTIES", "TRANSPORT", "VALUE"]);
export const DeclarationFieldSchema = z.object({
  code: z.string(),
  label: z.string(),
  value: z.string(),
  source: ValueSourceSchema,
  section: DeclarationSectionSchema,
  suspect: z.boolean().optional(),
});
export type DeclarationField = z.infer<typeof DeclarationFieldSchema>;

export const DeclarationStatusSchema = z.enum(["NOT_CREATED", "DRAFT", "APPROVED", "SUBMITTED"]);
export type DeclarationStatus = z.infer<typeof DeclarationStatusSchema>;

export const ValueAdjustmentSchema = z.object({ label: z.string(), amount: DecimalStringSchema, currency: z.string(), source: ValueSourceSchema });

export const DeclarationSchema = z.object({
  dossierId: z.string(),
  kind: z.enum(["IDA", "EDA"]),
  status: DeclarationStatusSchema,
  fields: z.array(DeclarationFieldSchema),
  exchangeRate: DecimalStringSchema,
  exchangeRateDate: IsoDateSchema,
  customsValueVnd: DecimalStringSchema,
  valueAdjustments: z.array(ValueAdjustmentSchema),
  estimatedImportDutyVnd: DecimalStringSchema,
  estimatedVatVnd: DecimalStringSchema,
  approvedBy: z.string().optional(),
  approvedAt: IsoDateTimeSchema.optional(),
});
export type Declaration = z.infer<typeof DeclarationSchema>;

export const AgentTaskIdSchema = z.enum(["HS_LOOKUP", "MAPPING", "BUILD_DECLARATION", "DIGITIZE"]);
export type AgentTaskId = z.infer<typeof AgentTaskIdSchema>;
export const AgentTaskStatusSchema = z.enum(["PENDING", "RUNNING", "DONE", "ERROR", "SKIPPED"]);
export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;
export const AgentModeSchema = z.enum(["DECLARATION", "DIGITIZE", "BOTH"]);
export const AgentRunSchema = z.object({
  dossierId: z.string(),
  mode: AgentModeSchema,
  startedAt: IsoDateTimeSchema,
  tasks: z.array(z.object({ id: AgentTaskIdSchema, status: AgentTaskStatusSchema, progress: z.number().min(0).max(100), message: z.string() })),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;
```

`packages/contracts/src/dto/customs.ts`:
```ts
import { z } from "zod";
import { CustomsChannelSchema, DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema } from "../common.js";

export const CustomsOperationSchema = z.enum(["IDA", "IDC", "EDA", "EDC", "HYS", "IEX"]);
export type CustomsOperation = z.infer<typeof CustomsOperationSchema>;

export const CustomsMessageSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  operation: CustomsOperationSchema,
  direction: z.enum(["OUT", "IN"]),
  result: z.enum(["PENDING", "OK", "ERROR"]),
  summary: z.string(),
  at: IsoDateTimeSchema,
  payloadPreview: z.string(),
});
export type CustomsMessage = z.infer<typeof CustomsMessageSchema>;

export const CustomsResultSchema = z.object({
  dossierId: z.string(),
  declarationNo: z.string(),
  channel: CustomsChannelSchema,
  channelNote: z.string(),
  clearanceStatus: z.enum(["WAITING", "INSPECTING", "CLEARED"]),
  customsTaxVnd: DecimalStringSchema,
  updatedAt: IsoDateTimeSchema,
});
export type CustomsResult = z.infer<typeof CustomsResultSchema>;

export const DigitalCertificateSchema = z.object({
  id: z.string(),
  subject: z.string(),
  issuer: z.string(),
  serial: z.string(),
  validTo: IsoDateSchema,
  isDefault: z.boolean(),
});
export type DigitalCertificate = z.infer<typeof DigitalCertificateSchema>;
```

`packages/contracts/src/dto/skill.ts`:
```ts
import { z } from "zod";
import { DocKindSchema, IsoDateTimeSchema } from "../common.js";

export const SkillKindSchema = z.enum(["DOCUMENT", "SUPPLIER", "MAPPING"]);
export type SkillKind = z.infer<typeof SkillKindSchema>;

export const SkillFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["string", "decimal", "date", "code", "party", "items"]),
  required: z.boolean(),
  aliases: z.array(z.string()),
  declarationField: z.string().optional(),
  extract: z.boolean(),
  display: z.boolean(),
});
export type SkillField = z.infer<typeof SkillFieldSchema>;

export const SkillSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  kind: SkillKindSchema,
  docKind: DocKindSchema.optional(),
  supplier: z.string().optional(),
  language: z.string(),
  version: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1).optional(),
  labeledSamples: z.number().int().nonnegative(),
  updatedAt: IsoDateTimeSchema,
  enabled: z.boolean(),
  fields: z.array(SkillFieldSchema),
});
export type Skill = z.infer<typeof SkillSchema>;
```

`packages/contracts/src/dto/identity.ts`:
```ts
import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema, RoleSchema } from "../common.js";

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: RoleSchema,
  status: z.enum(["ACTIVE", "INVITED", "DISABLED"]),
  lastActiveAt: IsoDateTimeSchema.optional(),
});
export type Member = z.infer<typeof MemberSchema>;

export const PlanCodeSchema = z.enum(["TRIAL", "BASIC", "PRO", "ENTERPRISE"]);
export type PlanCode = z.infer<typeof PlanCodeSchema>;

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  taxCode: z.string(),
  address: z.string(),
  phone: z.string(),
  plan: z.object({
    code: PlanCodeSchema,
    name: z.string(),
    dossiersPerMonth: z.number().int().nonnegative(),
    pagesPerDossier: z.number().int().nonnegative(),
    renewsAt: IsoDateSchema,
  }),
  usage: z.object({ dossiersThisMonth: z.number().int().nonnegative(), pagesThisMonth: z.number().int().nonnegative(), aiCostVnd: DecimalStringSchema }),
  suspectThreshold: z.enum(["STRICT", "BALANCED", "RELAXED"]),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const IntegrationIdSchema = z.enum(["HSCODEPRO", "CUSTOMS_HUB", "AI_PROVIDER", "EINVOICE"]);
export const IntegrationSchema = z.object({
  id: IntegrationIdSchema,
  name: z.string(),
  description: z.string(),
  status: z.enum(["CONNECTED", "ERROR", "NOT_CONFIGURED"]),
  lastCheckedAt: IsoDateTimeSchema.optional(),
  detail: z.string().optional(),
});
export type Integration = z.infer<typeof IntegrationSchema>;
```

> Lưu ý: `PlanCode` thêm `TRIAL` so với mock (`BASIC|PRO|ENTERPRISE`) vì ADR 0004 có gói dùng thử. Mock seed không dùng TRIAL nên không vỡ.

`packages/contracts/src/dto/notification.ts`:
```ts
import { z } from "zod";
import { IsoDateTimeSchema } from "../common.js";

export const NotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  at: IsoDateTimeSchema,
  read: z.boolean(),
  href: z.string().optional(),
});
export type Notification = z.infer<typeof NotificationSchema>;
```

`packages/contracts/src/dto/index.ts`:
```ts
export * from "./dossier.js";
export * from "./document.js";
export * from "./ocr.js";
export * from "./declaration.js";
export * from "./customs.js";
export * from "./skill.js";
export * from "./identity.js";
export * from "./notification.js";
```

`packages/contracts/src/index.ts` thêm `export * from "./dto/index.js";`.

- [ ] **Step 4: Chạy test, kỳ vọng pass**

Run: `pnpm --filter @kb/contracts test`
Expected: PASS.

- [ ] **Step 5: FE lấy kiểu từ contracts**

Sửa `apps/web/src/mocks/types.ts`: xóa mọi `export type …` đã có trong contracts; thay bằng:
```ts
// Kiểu dữ liệu dùng chung FE/BE nằm ở @kb/contracts (Zod). File này chỉ giữ nhãn hiển thị tiếng Việt.
export type {
  IsoDate, IsoDateTime, DecimalString, Direction, StepId, DossierStatus, CustomsChannel, Dossier, DocKind, DocumentStatus,
  DossierDocument, FieldStatus, Region, ExtractedField, RuleResult, RuleSeverity, CrossCheck, LineItem, ValueSource,
  DeclarationField, DeclarationStatus, Declaration, AgentTaskId, AgentTaskStatus, AgentRun, CustomsOperation, CustomsMessage,
  CustomsResult, SkillKind, SkillField, Skill, Role, Member, Organization, Integration, DigitalCertificate, Notification,
} from "@kb/contracts";
export { STEP_ORDER } from "@kb/contracts";
```
Giữ nguyên các hằng nhãn: `STEP_LABELS`, `DOC_KIND_LABELS`, `FIELD_GROUP_LABELS`, `VALUE_SOURCE_LABELS`, `ROLE_LABELS` (import kiểu tương ứng từ `@kb/contracts` để khai báo `Record<…>`).

Run: `pnpm --filter @kb/web typecheck`
Expected: PASS. Nếu lỗi `exactOptionalPropertyTypes` ở chỗ FE gán `undefined` tường minh cho prop tùy chọn, sửa chỗ đó bằng spread có điều kiện (`...(x ? { note: x } : {})`), không nới lỏng schema.

- [ ] **Step 6: Chạy lint và test toàn repo**

Run: `pnpm lint && pnpm test`
Expected: xanh (depcruise không có rule nào cấm web import `@kb/contracts`).

- [ ] **Step 7: Sẵn sàng commit**

Files: `packages/contracts/src/dto/**`, `packages/contracts/src/index.ts`, `apps/web/src/mocks/types.ts` (+ file FE sửa spread nếu có). Thông điệp: `feat(contracts): DTO Zod cho toàn bộ kiểu giao diện; FE dùng kiểu từ @kb/contracts`.

---

### Task 3: Package `@kb/core` và shared kernel

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Create: `packages/core/src/shared/{result,errors,ids,ctx,clock,decimal,index}.ts` và `{result,ids,ctx,decimal}.test.ts`

**Interfaces:**
- Produces:
  - `type Result<T, E = DomainError> = { ok: true; value: T } | { ok: false; error: E }`; `ok(v)`, `err(e)`, `isOk(r)`, `unwrap(r)` (throw nếu lỗi – chỉ dùng trong test).
  - `DomainErrorCode` union; `DomainError = { code; message?; details? }`; `domainError(code, message?, details?)`.
  - Branded ids `OrgId, UserId, DossierId, DocumentId, SkillId, DeclarationId` + `asOrgId(s)` …; `IdGen { next(prefix: IdPrefix): string }`, `ulidIdGen`, `IdPrefix = "org"|"usr"|"mem"|"ses"|"tok"|"dos"|"doc"|"fld"|"chk"|"itm"|"dec"|"run"|"msg"|"sk"|"smp"|"ntf"|"use"|"job"`.
  - `Ctx = { orgId: OrgId; userId: UserId; role: Role }`; `requireRole(ctx, ...roles): Result<void>`; `ROLE_RANK`.
  - `Clock { now(): Date }`, `systemClock`, `fixedClock(iso)`.
  - `Decimal` (re-export decimal.js đã cấu hình `precision 40, rounding ROUND_HALF_UP`), `dec(s: DecimalString | number): Decimal`, `toDecimalString(d, scale?)`, `sumDec(list)`.

- [ ] **Step 1: Tạo package**

`packages/core/package.json`:
```json
{
  "name": "@kb/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./shared": "./src/shared/index.ts",
    "./config": "./src/config/index.ts",
    "./db": "./src/db/index.ts",
    "./modules/*": "./src/modules/*/index.ts",
    "./modules/*/infrastructure": "./src/modules/*/infrastructure/index.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:seed": "tsx scripts/seed.ts",
    "db:reset": "tsx scripts/reset.ts"
  },
  "dependencies": {
    "@kb/contracts": "workspace:*",
    "@node-rs/argon2": "^2.2.2",
    "decimal.js": "^10.6.0",
    "dotenv": "^17.0.0",
    "drizzle-orm": "^0.45.4",
    "postgres": "^3.4.9",
    "ulid": "^3.0.2",
    "zod": "^4.6.6"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^12.2.1",
    "@types/node": "^26.6.5",
    "drizzle-kit": "^0.31.11",
    "tsx": "^4.23.15",
    "typescript": "^5.9.3",
    "vitest": "^5.0.4"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node"], "lib": ["ES2023"], "resolveJsonModule": true },
  "include": ["src", "scripts", "drizzle.config.ts", "vitest.config.ts"]
}
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 60_000, // *.int.test.ts khởi động Postgres trong Docker
    hookTimeout: 120_000,
  },
});
```

Run: `pnpm install`. Expected: OK.

- [ ] **Step 2: Test shared kernel (fail trước)**

`packages/core/src/shared/result.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { domainError } from "./errors.js";
import { err, isOk, ok, unwrap } from "./result.js";

describe("Result", () => {
  it("ok/err phân biệt được bằng isOk", () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isOk(err(domainError("NOT_FOUND")))).toBe(false);
  });
  it("unwrap ném lỗi kèm code khi Result là err", () => {
    expect(() => unwrap(err(domainError("FORBIDDEN", "không có quyền")))).toThrow(/FORBIDDEN/);
  });
});
```

`packages/core/src/shared/ids.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ulidIdGen } from "./ids.js";

describe("ulidIdGen", () => {
  it("sinh id có tiền tố và 26 ký tự ULID, không trùng", () => {
    const a = ulidIdGen.next("dos");
    const b = ulidIdGen.next("dos");
    expect(a).toMatch(/^dos_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a).not.toBe(b);
  });
});
```

`packages/core/src/shared/ctx.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { asOrgId, asUserId } from "./ids.js";
import { requireRole, type Ctx } from "./ctx.js";

const ctx = (role: Ctx["role"]): Ctx => ({ orgId: asOrgId("org_a"), userId: asUserId("usr_a"), role });

describe("requireRole", () => {
  it("cho phép khi vai trò nằm trong danh sách", () => {
    expect(requireRole(ctx("APPROVER"), "APPROVER", "OWNER").ok).toBe(true);
  });
  it("OWNER luôn được phép", () => {
    expect(requireRole(ctx("OWNER"), "ADMIN").ok).toBe(true);
  });
  it("VIEWER bị từ chối với code FORBIDDEN", () => {
    const r = requireRole(ctx("VIEWER"), "DECLARANT");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
  });
});
```

`packages/core/src/shared/decimal.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { dec, sumDec, toDecimalString } from "./decimal.js";

describe("decimal", () => {
  it("cộng tiền không sai số float", () => {
    expect(toDecimalString(dec("0.1").plus(dec("0.2")), 2)).toBe("0.30");
  });
  it("sumDec cộng danh sách chuỗi", () => {
    expect(toDecimalString(sumDec(["1.10", "2.20", "3.30"]), 2)).toBe("6.60");
  });
  it("toDecimalString làm tròn ROUND_HALF_UP", () => {
    expect(toDecimalString(dec("2.345"), 2)).toBe("2.35");
    expect(toDecimalString(dec("2.344"), 2)).toBe("2.34");
  });
  it("dec từ chối chuỗi không hợp lệ", () => {
    expect(() => dec("1,5")).toThrow();
  });
});
```

- [ ] **Step 3: Chạy test, kỳ vọng fail**

Run: `pnpm --filter @kb/core test`
Expected: FAIL – thiếu module.

- [ ] **Step 4: Viết shared kernel**

`packages/core/src/shared/errors.ts`:
```ts
export type DomainErrorCode =
  | "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE" | "VALIDATION"
  | "EMAIL_TAKEN" | "TAX_CODE_EXISTS" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "TOKEN_INVALID" | "RATE_LIMITED"
  | "DOSSIER_LOCKED" | "QUOTA_EXCEEDED" | "FILE_INVALID" | "FILE_TOO_LARGE"
  | "BLOCKER_FAILED" | "HS_UNCONFIRMED" | "NOT_APPROVED" | "ALREADY_SUBMITTED"
  | "SKILL_IN_USE" | "NOT_ENOUGH_SAMPLES"
  | "INTEGRATION_NOT_CONFIGURED" | "GATEWAY_ERROR";

export type DomainError = { code: DomainErrorCode; message?: string; details?: unknown };

export function domainError(code: DomainErrorCode, message?: string, details?: unknown): DomainError {
  return { code, ...(message !== undefined ? { message } : {}), ...(details !== undefined ? { details } : {}) };
}
```

`packages/core/src/shared/result.ts`:
```ts
import type { DomainError } from "./errors.js";

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = DomainError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;

/** Chỉ dùng trong test hoặc script. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(`Result err: ${JSON.stringify(r.error)}`);
}
```

`packages/core/src/shared/ids.ts`:
```ts
import { ulid } from "ulid";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type OrgId = Brand<string, "OrgId">;
export type UserId = Brand<string, "UserId">;
export type DossierId = Brand<string, "DossierId">;
export type DocumentId = Brand<string, "DocumentId">;
export type SkillId = Brand<string, "SkillId">;
export type DeclarationId = Brand<string, "DeclarationId">;

export const asOrgId = (s: string) => s as OrgId;
export const asUserId = (s: string) => s as UserId;
export const asDossierId = (s: string) => s as DossierId;
export const asDocumentId = (s: string) => s as DocumentId;
export const asSkillId = (s: string) => s as SkillId;
export const asDeclarationId = (s: string) => s as DeclarationId;

export type IdPrefix =
  | "org" | "usr" | "mem" | "ses" | "tok" | "dos" | "doc" | "fld" | "chk" | "itm" | "dec" | "run" | "msg" | "sk" | "smp" | "ntf" | "use" | "job" | "cert";

export interface IdGen {
  next(prefix: IdPrefix): string;
}

export const ulidIdGen: IdGen = { next: (prefix) => `${prefix}_${ulid()}` };

/** Cho test: id tăng dần, dễ đọc. */
export function sequentialIdGen(): IdGen {
  let n = 0;
  return { next: (prefix) => `${prefix}_${String(++n).padStart(4, "0")}` };
}
```

`packages/core/src/shared/ctx.ts`:
```ts
import type { Role } from "@kb/contracts";
import { domainError } from "./errors.js";
import type { OrgId, UserId } from "./ids.js";
import { err, ok, type Result } from "./result.js";

export type Ctx = { orgId: OrgId; userId: UserId; role: Role };

export const ROLE_RANK: Record<Role, number> = { VIEWER: 0, DECLARANT: 1, APPROVER: 2, ADMIN: 3, OWNER: 4 };

/** OWNER luôn được phép; vai trò khác phải nằm trong danh sách. */
export function requireRole(ctx: Ctx, ...roles: Role[]): Result<void> {
  if (ctx.role === "OWNER" || roles.includes(ctx.role)) return ok(undefined);
  return err(domainError("FORBIDDEN", `Cần vai trò ${roles.join("/")}`));
}
```

`packages/core/src/shared/clock.ts`:
```ts
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };
export const fixedClock = (iso: string): Clock => ({ now: () => new Date(iso) });
```

`packages/core/src/shared/decimal.ts`:
```ts
import type { DecimalString } from "@kb/contracts";
import { DecimalStringSchema } from "@kb/contracts";
import DecimalJs from "decimal.js";

export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

/** Chuỗi phải đúng dạng DecimalString; number chỉ dùng cho hằng số nhỏ (tỷ lệ, số lượng). */
export function dec(v: DecimalString | number): Decimal {
  if (typeof v === "number") return new Decimal(v);
  return new Decimal(DecimalStringSchema.parse(v));
}

export function toDecimalString(d: Decimal, scale?: number): DecimalString {
  return scale === undefined ? d.toFixed() : d.toFixed(scale);
}

export function sumDec(list: Iterable<DecimalString | Decimal>): Decimal {
  let s = new Decimal(0);
  for (const x of list) s = s.plus(x instanceof Decimal ? x : dec(x));
  return s;
}
```

`packages/core/src/shared/index.ts`:
```ts
export * from "./clock.js";
export * from "./ctx.js";
export * from "./decimal.js";
export * from "./errors.js";
export * from "./ids.js";
export * from "./result.js";
```

- [ ] **Step 5: Chạy test và typecheck, kỳ vọng pass**

Run: `pnpm --filter @kb/core test && pnpm --filter @kb/core typecheck`
Expected: PASS.

- [ ] **Step 6: Sẵn sàng commit**

Files: `packages/core/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/shared/**`, `pnpm-lock.yaml`. Thông điệp: `feat(core): package @kb/core và shared kernel (Result, DomainError, ids, Ctx, Clock, Decimal)`.

---

### Task 4: Docker Compose, biến môi trường và cấu hình

**Files:**
- Create: `docker-compose.yml`, `docker/postgres/init.sql`, `.env.example`
- Create: `packages/core/src/config/{env,index}.ts`, `packages/core/src/config/env.test.ts`
- Modify: `package.json` (scripts gốc), `apps/web/next.config.ts` (nạp `.env` gốc)

**Interfaces:**
- Produces: `loadEnv(source?: NodeJS.ProcessEnv): Env` (parse Zod, ném `Error` liệt kê biến sai), `type Env`, `EnvSchema`.

- [ ] **Step 1: Compose và init SQL**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: kb_admin
      POSTGRES_PASSWORD: kb_admin
      POSTGRES_DB: khaibao
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kb_admin -d khaibao"]
      interval: 5s
      retries: 10
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: ["redis-server", "--appendonly", "yes"]
    volumes: ["redisdata:/data"]
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: kb_minio
      MINIO_ROOT_PASSWORD: kb_minio_secret
    ports: ["9000:9000", "9001:9001"]
    volumes: ["miniodata:/data"]
  minio-init:
    image: minio/mc:latest
    depends_on: [minio]
    entrypoint: >
      /bin/sh -c "
      until mc alias set local http://minio:9000 kb_minio kb_minio_secret; do sleep 1; done;
      mc mb -p local/khaibao-dev || true;
      "
  mailpit:
    image: axllent/mailpit:latest
    ports: ["8025:8025", "1025:1025"]
volumes:
  pgdata: {}
  redisdata: {}
  miniodata: {}
```

`docker/postgres/init.sql`:
```sql
-- Role ứng dụng: không bypass RLS. Mật khẩu dev; production đặt lại bằng ALTER ROLE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kb_app') THEN
    CREATE ROLE kb_app LOGIN PASSWORD 'kb_app';
  END IF;
END $$;
GRANT CONNECT ON DATABASE khaibao TO kb_app;
```

`.env.example`:
```bash
# --- Cơ sở dữ liệu ---
DATABASE_URL=postgres://kb_app:kb_app@localhost:5432/khaibao          # role ứng dụng, chịu RLS
DATABASE_ADMIN_URL=postgres://kb_admin:kb_admin@localhost:5432/khaibao # chạy migration/seed
REDIS_URL=redis://localhost:6379
# --- Lưu file (S3 API: MinIO dev / R2 prod) ---
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=khaibao-dev
S3_ACCESS_KEY_ID=kb_minio
S3_SECRET_ACCESS_KEY=kb_minio_secret
S3_REGION=auto
S3_FORCE_PATH_STYLE=true
# --- Bí mật ứng dụng ---
APP_MASTER_KEY=change-me-32-bytes-base64=================  # base64 32 byte; sinh: openssl rand -base64 32
APP_URL=http://localhost:3100
# --- Adapter ---
AI_PROVIDER=fake            # fake | claude
ANTHROPIC_API_KEY=
AI_MODEL=claude-sonnet-5-5
AI_USD_VND_RATE=25400
CUSTOMS_GATEWAY=fake        # fake | fpt
FPT_API_BASE_URL=
HS_CLASSIFIER=fake          # fake | hscodepro
HSCODEPRO_URL=
MAIL=console                # console | smtp
SMTP_URL=smtp://localhost:1025
# --- Web ---
NEXT_PUBLIC_DATA_SOURCE=mock   # mock | http  (http khi đã có backend)
```

- [ ] **Step 2: Test cấu hình env (fail trước)**

`packages/core/src/config/env.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgres://kb_app:kb_app@localhost:5432/khaibao",
  DATABASE_ADMIN_URL: "postgres://kb_admin:kb_admin@localhost:5432/khaibao",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "a", S3_SECRET_ACCESS_KEY: "s",
  APP_MASTER_KEY: Buffer.alloc(32, 1).toString("base64"),
  APP_URL: "http://localhost:3100",
};

describe("loadEnv", () => {
  it("mặc định: adapter fake, mail console, S3 path-style", () => {
    const env = loadEnv(base);
    expect(env.AI_PROVIDER).toBe("fake");
    expect(env.CUSTOMS_GATEWAY).toBe("fake");
    expect(env.MAIL).toBe("console");
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });
  it("AI_PROVIDER=claude mà thiếu ANTHROPIC_API_KEY thì ném lỗi nêu tên biến", () => {
    expect(() => loadEnv({ ...base, AI_PROVIDER: "claude" })).toThrow(/ANTHROPIC_API_KEY/);
  });
  it("APP_MASTER_KEY không phải 32 byte base64 thì ném lỗi", () => {
    expect(() => loadEnv({ ...base, APP_MASTER_KEY: "ngan" })).toThrow(/APP_MASTER_KEY/);
  });
  it("thiếu DATABASE_URL thì ném lỗi liệt kê biến", () => {
    const { DATABASE_URL: _omit, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 3: Chạy test, kỳ vọng fail**

Run: `pnpm --filter @kb/core test src/config`
Expected: FAIL.

- [ ] **Step 4: Viết `env.ts`**

`packages/core/src/config/env.ts`:
```ts
import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const base64Key32 = z.string().refine((s) => {
  try { return Buffer.from(s, "base64").length === 32; } catch { return false; }
}, "APP_MASTER_KEY phải là base64 của 32 byte");

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    DATABASE_ADMIN_URL: z.url(),
    REDIS_URL: z.url(),
    S3_ENDPOINT: z.url(),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_REGION: z.string().default("auto"),
    S3_FORCE_PATH_STYLE: bool.default(true),
    APP_MASTER_KEY: base64Key32,
    APP_URL: z.url(),
    AI_PROVIDER: z.enum(["fake", "claude"]).default("fake"),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default("claude-sonnet-5-5"),
    AI_USD_VND_RATE: z.coerce.number().positive().default(25400),
    CUSTOMS_GATEWAY: z.enum(["fake", "fpt"]).default("fake"),
    FPT_API_BASE_URL: z.url().optional(),
    HS_CLASSIFIER: z.enum(["fake", "hscodepro"]).default("fake"),
    HSCODEPRO_URL: z.url().optional(),
    MAIL: z.enum(["console", "smtp"]).default("console"),
    SMTP_URL: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    const need = (cond: boolean, key: string, when: string) => {
      if (cond) ctx.addIssue({ code: "custom", path: [key], message: `${key} bắt buộc khi ${when}` });
    };
    need(e.AI_PROVIDER === "claude" && !e.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY", "AI_PROVIDER=claude");
    need(e.CUSTOMS_GATEWAY === "fpt" && !e.FPT_API_BASE_URL, "FPT_API_BASE_URL", "CUSTOMS_GATEWAY=fpt");
    need(e.HS_CLASSIFIER === "hscodepro" && !e.HSCODEPRO_URL, "HSCODEPRO_URL", "HS_CLASSIFIER=hscodepro");
    need(e.MAIL === "smtp" && !e.SMTP_URL, "SMTP_URL", "MAIL=smtp");
  });

export type Env = z.infer<typeof EnvSchema>;

/** Parse biến môi trường; biến rỗng "" coi như không đặt. Ném Error liệt kê từng biến sai. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const r = EnvSchema.safeParse(cleaned);
  if (r.success) return r.data;
  const lines = r.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
  throw new Error(`Cấu hình môi trường không hợp lệ:\n${lines.join("\n")}`);
}
```

`packages/core/src/config/index.ts`:
```ts
export * from "./env.js";
```

- [ ] **Step 5: Chạy test, kỳ vọng pass**

Run: `pnpm --filter @kb/core test src/config`
Expected: PASS.

- [ ] **Step 6: Script gốc và nạp `.env` cho web**

`package.json` gốc, thay `scripts`:
```json
"scripts": {
  "dev": "docker compose up -d --wait && pnpm db:migrate && concurrently -n web,worker -c blue,magenta \"pnpm dev:web\" \"pnpm dev:worker\"",
  "dev:web": "pnpm --filter @kb/web dev",
  "dev:worker": "pnpm --filter @kb/worker dev",
  "infra:up": "docker compose up -d --wait",
  "infra:down": "docker compose down",
  "db:migrate": "pnpm --filter @kb/core db:migrate",
  "db:seed": "pnpm --filter @kb/core db:seed",
  "db:reset": "pnpm --filter @kb/core db:reset",
  "typecheck": "pnpm -r typecheck",
  "test": "pnpm -r test && node --test scripts/*.test.mjs",
  "lint": "pnpm lint:tokens && pnpm lint:deps",
  "lint:tokens": "node scripts/check-design-tokens.mjs",
  "lint:deps": "depcruise --config .dependency-cruiser.cjs apps packages",
  "ui:playground": "pnpm --filter @kb/ui playground"
}
```
`devDependencies` gốc thêm `"concurrently": "^10.0.6"`.

`apps/web/next.config.ts` đầu file:
```ts
import { config as loadDotenv } from "dotenv";
import path from "node:path";
// Một file .env ở gốc repo cho web, worker và script.
loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
```
`apps/web/package.json` → `dependencies` thêm `"dotenv": "^17.0.0"`, `"@kb/core": "workspace:*"`.

Tạo `.env` thật từ mẫu: `cp .env.example .env` rồi điền `APP_MASTER_KEY=$(openssl rand -base64 32)`.

Run: `pnpm install && pnpm infra:up && docker compose ps`
Expected: 5 container `running`/healthy (minio-init exit 0 là bình thường).

- [ ] **Step 7: Sẵn sàng commit**

Files: `docker-compose.yml`, `docker/postgres/init.sql`, `.env.example`, `packages/core/src/config/**`, `package.json`, `apps/web/next.config.ts`, `apps/web/package.json`, `pnpm-lock.yaml`. Thông điệp: `chore(infra): docker compose, .env.example, loadEnv có kiểm tra`.

---

### Task 5: Drizzle, migration, RLS và `withCtx`

**Files:**
- Create: `packages/core/drizzle.config.ts`
- Create: `packages/core/src/db/schema/{shared,plans,identity,index}.ts`, `packages/core/src/db/{client,with-ctx,migrate,index}.ts`
- Create: `packages/core/src/db/with-ctx.int.test.ts`, `packages/core/src/db/test-db.ts` (helper Testcontainers)
- Create: `packages/core/scripts/migrate.ts`, `packages/core/scripts/reset.ts`
- Generate: `packages/core/drizzle/0000_init.sql`, `packages/core/drizzle/meta/*`

**Interfaces:**
- Produces:
  - Schema: `plans` (code pk, name, dossiers_per_month, pages_per_dossier, price_vnd numeric), `organizations` (id pk text, tax_code unique, name, address, phone, plan_code → plans, suspect_threshold, created_at, updated_at), `users` (id, email unique, password_hash, name, email_verified_at, created_at, updated_at), `memberships` (id, org_id, user_id, role, status, invited_by, created_at, updated_at; unique (org_id, user_id)).
  - Helper cột: `id(prefix)`, `orgId()`, `timestamps()`, `money(name)` trong `schema/shared.ts`.
  - `createDb(url): Db` (drizzle + postgres.js), `type Db`, `type Tx`.
  - `withCtx(db, { orgId, userId }, fn: (tx) => Promise<T>): Promise<T>` – transaction + `set_config('app.org_id')`, `set_config('app.user_id')`; ném `Error` nếu `orgId` rỗng.
  - `runMigrations(adminUrl)`; `ensureAppRole(adminUrl, password)`.
  - Test helper `startTestDb(): Promise<{ adminUrl, appUrl, stop }>`.

- [ ] **Step 1: Schema shared + plans + identity**

`packages/core/src/db/schema/shared.ts`:
```ts
import { sql } from "drizzle-orm";
import { numeric, pgRole, text, timestamp } from "drizzle-orm/pg-core";

/** Role ứng dụng (tạo trong docker/postgres/init.sql và ensureAppRole). */
export const appRole = pgRole("kb_app").existing();

export const id = () => text("id").primaryKey();
export const orgId = () => text("org_id").notNull();
export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const money = (name: string) => numeric(name, { precision: 24, scale: 6 });

/** Biểu thức policy: chỉ dòng của org đang đặt trong session. */
export const orgPolicyUsing = sql`org_id = current_setting('app.org_id', true)`;
```

`packages/core/src/db/schema/plans.ts`:
```ts
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { money, timestamps } from "./shared.js";

export const plans = pgTable("plans", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  dossiersPerMonth: integer("dossiers_per_month").notNull(),
  pagesPerDossier: integer("pages_per_dossier").notNull(),
  priceVnd: money("price_vnd").notNull().default("0"),
  ...timestamps(),
});
```

`packages/core/src/db/schema/identity.ts`:
```ts
import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { plans } from "./plans.js";
import { appRole, id, orgId, orgPolicyUsing, timestamps } from "./shared.js";

export const organizations = pgTable("organizations", {
  id: id(),
  taxCode: text("tax_code").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  planCode: text("plan_code").notNull().references(() => plans.code),
  suspectThreshold: text("suspect_threshold").notNull().default("BALANCED"),
  ...timestamps(),
}, (t) => [uniqueIndex("organizations_tax_code_uq").on(t.taxCode)]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  ...timestamps(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const memberships = pgTable("memberships", {
  id: id(),
  orgId: orgId().references(() => organizations.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  invitedBy: text("invited_by"),
  ...timestamps(),
}, (t) => [
  uniqueIndex("memberships_org_user_uq").on(t.orgId, t.userId),
  index("memberships_user_idx").on(t.userId),
  // Đọc được dòng của org đang đặt HOẶC dòng của chính user (để liệt kê org khi đăng nhập).
  pgPolicy("memberships_rls", {
    for: "all",
    to: appRole,
    using: sql`${orgPolicyUsing} OR user_id = current_setting('app.user_id', true)`,
    withCheck: orgPolicyUsing,
  }),
]).enableRLS();
```

`packages/core/src/db/schema/index.ts`:
```ts
export * from "./identity.js";
export * from "./plans.js";
export { appRole } from "./shared.js";
```

`packages/core/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  entities: { roles: { provider: "", include: ["kb_app"] } },
  dbCredentials: { url: process.env.DATABASE_ADMIN_URL ?? "postgres://kb_admin:kb_admin@localhost:5432/khaibao" },
});
```

- [ ] **Step 2: Client, migrate, withCtx**

`packages/core/src/db/client.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export function createDb(url: string, opts: { max?: number } = {}) {
  const sql = postgres(url, { max: opts.max ?? 10, prepare: false });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return Object.assign(db, { close: () => sql.end({ timeout: 5 }) });
}
export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
```

`packages/core/src/db/with-ctx.ts`:
```ts
import { sql } from "drizzle-orm";
import type { OrgId, UserId } from "../shared/ids.js";
import type { Db, Tx } from "./client.js";

export type DbCtx = { orgId: OrgId; userId?: UserId };

/**
 * Mọi truy vấn nghiệp vụ chạy trong đây: transaction + đặt app.org_id / app.user_id để policy RLS lọc.
 * orgId rỗng là lỗi lập trình → ném ngay, không chạy truy vấn.
 */
export async function withCtx<T>(db: Db, ctx: DbCtx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (typeof ctx.orgId !== "string" || ctx.orgId.length === 0) throw new Error("withCtx: orgId bắt buộc");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${ctx.orgId}, true)`);
    await tx.execute(sql`select set_config('app.user_id', ${ctx.userId ?? ""}, true)`);
    return fn(tx);
  });
}

/** Chỉ cho đăng nhập/đăng ký: đặt user, chưa có org. */
export async function withUser<T>(db: Db, userId: UserId, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!userId) throw new Error("withUser: userId bắt buộc");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', '', true)`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
```

`packages/core/src/db/migrate.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

export async function runMigrations(adminUrl: string) {
  const sql = postgres(adminUrl, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
    // Quyền cho role ứng dụng trên mọi bảng hiện có và bảng tạo sau.
    await sql`grant usage on schema public to kb_app`;
    await sql`grant select, insert, update, delete on all tables in schema public to kb_app`;
    await sql`alter default privileges in schema public grant select, insert, update, delete on tables to kb_app`;
  } finally {
    await sql.end();
  }
}

export async function ensureAppRole(adminUrl: string, password: string) {
  const sql = postgres(adminUrl, { max: 1 });
  try {
    await sql.unsafe(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'kb_app') then create role kb_app login password '${password.replaceAll("'", "''")}'; end if; end $$;`);
  } finally {
    await sql.end();
  }
}
```

`packages/core/src/db/index.ts`:
```ts
export * from "./client.js";
export * from "./migrate.js";
export * from "./with-ctx.js";
export * as schema from "./schema/index.js";
```

- [ ] **Step 3: Sinh migration**

Run: `pnpm --filter @kb/core db:generate`
Expected: tạo `packages/core/drizzle/0000_*.sql` chứa `CREATE TABLE plans/organizations/users/memberships`, `ALTER TABLE memberships ENABLE ROW LEVEL SECURITY`, `CREATE POLICY memberships_rls …`. Đổi tên file thành `0000_init.sql` **và** sửa `drizzle/meta/_journal.json` tag tương ứng. Mở file kiểm tra policy có `current_setting('app.org_id', true)`.

- [ ] **Step 4: Helper Testcontainers và test RLS (fail trước)**

`packages/core/src/db/test-db.ts`:
```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { ensureAppRole, runMigrations } from "./migrate.js";

export type TestDb = { adminUrl: string; appUrl: string; stop: () => Promise<void> };

/** Postgres thật trong Docker, migration đã chạy, có role kb_app. ~5–10s lần đầu. */
export async function startTestDb(): Promise<TestDb> {
  const c: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:16-alpine").withDatabase("khaibao_test").start();
  const adminUrl = c.getConnectionUri();
  await ensureAppRole(adminUrl, "kb_app");
  await runMigrations(adminUrl);
  const u = new URL(adminUrl);
  u.username = "kb_app";
  u.password = "kb_app";
  return { adminUrl, appUrl: u.toString(), stop: () => c.stop() };
}
```

`packages/core/src/db/with-ctx.int.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asOrgId, asUserId } from "../shared/ids.js";
import { createDb, type Db } from "./client.js";
import { memberships, organizations, plans, users } from "./schema/index.js";
import { startTestDb, type TestDb } from "./test-db.js";
import { withCtx, withUser } from "./with-ctx.js";

let t: TestDb;
let admin: Db;
let app: Db;

beforeAll(async () => {
  t = await startTestDb();
  admin = createDb(t.adminUrl, { max: 2 });
  app = createDb(t.appUrl, { max: 2 });
  await admin.insert(plans).values({ code: "TRIAL", name: "Dùng thử", dossiersPerMonth: 10, pagesPerDossier: 20 });
  await admin.insert(organizations).values([
    { id: "org_a", taxCode: "0100000001", name: "A", planCode: "TRIAL" },
    { id: "org_b", taxCode: "0100000002", name: "B", planCode: "TRIAL" },
  ]);
  await admin.insert(users).values([
    { id: "usr_a", email: "a@x.vn", passwordHash: "x", name: "A" },
    { id: "usr_b", email: "b@x.vn", passwordHash: "x", name: "B" },
  ]);
  await admin.insert(memberships).values([
    { id: "mem_a", orgId: "org_a", userId: "usr_a", role: "OWNER" },
    { id: "mem_b", orgId: "org_b", userId: "usr_b", role: "OWNER" },
  ]);
});
afterAll(async () => {
  await app?.close();
  await admin?.close();
  await t?.stop();
});

describe("RLS qua withCtx", () => {
  it("org B không thấy membership của org A dù truy vấn không có where", async () => {
    const rows = await withCtx(app, { orgId: asOrgId("org_b") }, (tx) => tx.select().from(memberships));
    expect(rows.map((r) => r.id)).toEqual(["mem_b"]);
  });
  it("org A thấy đúng dòng của mình", async () => {
    const rows = await withCtx(app, { orgId: asOrgId("org_a") }, (tx) => tx.select().from(memberships));
    expect(rows.map((r) => r.id)).toEqual(["mem_a"]);
  });
  it("ghi dòng mang org_id khác org đang đặt bị Postgres từ chối", async () => {
    await expect(
      withCtx(app, { orgId: asOrgId("org_a") }, (tx) =>
        tx.insert(memberships).values({ id: "mem_x", orgId: "org_b", userId: "usr_a", role: "VIEWER" }),
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("withUser: user thấy membership của chính mình ở mọi org", async () => {
    const rows = await withUser(app, asUserId("usr_b"), (tx) => tx.select().from(memberships));
    expect(rows.map((r) => r.id)).toEqual(["mem_b"]);
  });
  it("withCtx với orgId rỗng ném lỗi lập trình, không chạy truy vấn", async () => {
    await expect(withCtx(app, { orgId: asOrgId("") }, async () => 1)).rejects.toThrow(/orgId bắt buộc/);
  });
});
```

- [ ] **Step 5: Chạy integration test**

Run: `pnpm --filter @kb/core test src/db`
Expected: PASS 5 ca (Docker phải đang chạy). Nếu ca "ghi dòng org khác" không ném: kiểm tra policy có `withCheck` và bảng đã `enableRLS()`.

- [ ] **Step 6: Script migrate/reset**

`packages/core/scripts/migrate.ts`:
```ts
import "dotenv/config";
import { loadEnv } from "../src/config/env.js";
import { ensureAppRole, runMigrations } from "../src/db/migrate.js";

const env = loadEnv();
const appPassword = new URL(env.DATABASE_URL).password || "kb_app";
await ensureAppRole(env.DATABASE_ADMIN_URL, appPassword);
await runMigrations(env.DATABASE_ADMIN_URL);
console.log("✓ migration xong");
```

`packages/core/scripts/reset.ts`:
```ts
import "dotenv/config";
import postgres from "postgres";
import { loadEnv } from "../src/config/env.js";

const env = loadEnv();
if (env.NODE_ENV === "production") throw new Error("Không reset DB production");
const sql = postgres(env.DATABASE_ADMIN_URL, { max: 1 });
await sql`drop schema public cascade`;
await sql`create schema public`;
await sql`grant usage on schema public to kb_app`;
await sql.end();
console.log("✓ đã xóa schema; chạy pnpm db:migrate && pnpm db:seed");
```

`dotenv/config` đọc `.env` theo `process.cwd()`; script chạy từ `packages/core` nên thêm vào đầu hai script: `import { config } from "dotenv"; config({ path: "../../.env", quiet: true });` thay cho `import "dotenv/config"`.

Run: `pnpm db:migrate`
Expected: `✓ migration xong`; `docker compose exec postgres psql -U kb_admin -d khaibao -c '\dt'` liệt kê 4 bảng + `__drizzle_migrations`.

- [ ] **Step 7: Lint + toàn bộ test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: xanh.

- [ ] **Step 8: Sẵn sàng commit**

Files: `packages/core/drizzle.config.ts`, `packages/core/drizzle/**`, `packages/core/src/db/**`, `packages/core/scripts/{migrate,reset}.ts`. Thông điệp: `feat(db): Drizzle schema identity/plans, migration, RLS, withCtx + test Testcontainers`.

---

### Task 6: Seed dữ liệu demo (org AN PHÁT, gói, thành viên)

**Files:**
- Create: `packages/core/src/db/seed/{plans,demo-org,index}.ts`, `packages/core/scripts/seed.ts`
- Create: `packages/core/src/db/seed/seed.int.test.ts`

**Interfaces:**
- Produces: `seedPlans(db)`, `seedDemoOrg(db, { passwordHash })`, `runSeed(adminUrl)`. Hằng `DEMO_ORG_ID = "org_anphat"`, `DEMO_USERS` (6 người đúng như `apps/web/src/mocks/seed/core.ts`: Lê Minh Châu ADMIN, Trần Văn Phong OWNER, Nguyễn Thu Hà DECLARANT, Phạm Anh Tuấn APPROVER, Đỗ Khánh Linh INVITED, Vũ Đức Quang DISABLED), mật khẩu demo `demo1234`.

- [ ] **Step 1: Test seed (fail trước)**

`packages/core/src/db/seed/seed.int.test.ts`:
```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { memberships, organizations, users } from "../schema/index.js";
import { startTestDb, type TestDb } from "../test-db.js";
import { DEMO_ORG_ID, runSeed } from "./index.js";

let t: TestDb;
let db: Db;
beforeAll(async () => {
  t = await startTestDb();
  db = createDb(t.adminUrl, { max: 2 });
});
afterAll(async () => { await db?.close(); await t?.stop(); });

describe("runSeed", () => {
  it("tạo org demo với 6 thành viên và chạy lại không nhân đôi", async () => {
    await runSeed(t.adminUrl);
    await runSeed(t.adminUrl);
    const org = await db.select().from(organizations).where(eq(organizations.id, DEMO_ORG_ID));
    expect(org).toHaveLength(1);
    expect(org[0]?.taxCode).toBe("0316789012");
    const mems = await db.select().from(memberships).where(eq(memberships.orgId, DEMO_ORG_ID));
    expect(mems).toHaveLength(6);
    expect(mems.filter((m) => m.status === "INVITED")).toHaveLength(1);
    const u = await db.select().from(users).where(eq(users.email, "chau.le@anphat-demo.vn"));
    expect(u[0]?.emailVerifiedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Chạy, kỳ vọng fail**

Run: `pnpm --filter @kb/core test src/db/seed`
Expected: FAIL.

- [ ] **Step 3: Viết seed**

`packages/core/src/db/seed/plans.ts`:
```ts
import type { Db } from "../client.js";
import { plans } from "../schema/index.js";

export const PLANS = [
  { code: "TRIAL", name: "Dùng thử", dossiersPerMonth: 10, pagesPerDossier: 20, priceVnd: "0" },
  { code: "BASIC", name: "Cơ bản", dossiersPerMonth: 50, pagesPerDossier: 30, priceVnd: "990000" },
  { code: "PRO", name: "Chuyên nghiệp", dossiersPerMonth: 150, pagesPerDossier: 40, priceVnd: "2990000" },
  { code: "ENTERPRISE", name: "Doanh nghiệp", dossiersPerMonth: 1000, pagesPerDossier: 100, priceVnd: "0" },
] as const;

export async function seedPlans(db: Db) {
  for (const p of PLANS) {
    await db.insert(plans).values(p).onConflictDoUpdate({ target: plans.code, set: { name: p.name, dossiersPerMonth: p.dossiersPerMonth, pagesPerDossier: p.pagesPerDossier, priceVnd: p.priceVnd } });
  }
}
```

`packages/core/src/db/seed/demo-org.ts`:
```ts
import type { Db } from "../client.js";
import { memberships, organizations, users } from "../schema/index.js";

export const DEMO_ORG_ID = "org_anphat";
export const DEMO_PASSWORD = "demo1234";

export const DEMO_USERS = [
  { id: "usr_chau", name: "Lê Minh Châu", email: "chau.le@anphat-demo.vn", role: "ADMIN", status: "ACTIVE" },
  { id: "usr_phong", name: "Trần Văn Phong", email: "phong.tran@anphat-demo.vn", role: "OWNER", status: "ACTIVE" },
  { id: "usr_ha", name: "Nguyễn Thu Hà", email: "ha.nguyen@anphat-demo.vn", role: "DECLARANT", status: "ACTIVE" },
  { id: "usr_tuan", name: "Phạm Anh Tuấn", email: "tuan.pham@anphat-demo.vn", role: "APPROVER", status: "ACTIVE" },
  { id: "usr_linh", name: "Đỗ Khánh Linh", email: "linh.do@anphat-demo.vn", role: "DECLARANT", status: "INVITED" },
  { id: "usr_quang", name: "Vũ Đức Quang", email: "quang.vu@anphat-demo.vn", role: "VIEWER", status: "DISABLED" },
] as const;

export async function seedDemoOrg(db: Db, opts: { passwordHash: string }) {
  await db
    .insert(organizations)
    .values({ id: DEMO_ORG_ID, taxCode: "0316789012", name: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT", address: "Lô B4, KCN Tràng Duệ, xã Lê Lợi, huyện An Dương, TP. Hải Phòng", phone: "0225 3 888 123", planCode: "PRO" })
    .onConflictDoNothing();
  for (const u of DEMO_USERS) {
    await db.insert(users).values({ id: u.id, email: u.email, name: u.name, passwordHash: opts.passwordHash, emailVerifiedAt: new Date() }).onConflictDoNothing();
    await db.insert(memberships).values({ id: `mem_${u.id.slice(4)}`, orgId: DEMO_ORG_ID, userId: u.id, role: u.role, status: u.status }).onConflictDoNothing();
  }
}
```

`packages/core/src/db/seed/index.ts`:
```ts
import { hash } from "@node-rs/argon2";
import { createDb } from "../client.js";
import { DEMO_PASSWORD, seedDemoOrg } from "./demo-org.js";
import { seedPlans } from "./plans.js";

export { DEMO_ORG_ID, DEMO_PASSWORD, DEMO_USERS } from "./demo-org.js";
export { PLANS } from "./plans.js";

/** Chạy bằng admin URL (bỏ qua RLS). Idempotent. */
export async function runSeed(adminUrl: string) {
  const db = createDb(adminUrl, { max: 1 });
  try {
    await seedPlans(db);
    await seedDemoOrg(db, { passwordHash: await hash(DEMO_PASSWORD) });
  } finally {
    await db.close();
  }
}
```

`packages/core/scripts/seed.ts`:
```ts
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { loadEnv } from "../src/config/env.js";
import { runSeed } from "../src/db/seed/index.js";

await runSeed(loadEnv().DATABASE_ADMIN_URL);
console.log("✓ seed xong: org AN PHÁT, 6 thành viên, mật khẩu demo1234");
```

- [ ] **Step 4: Chạy test, kỳ vọng pass; chạy seed thật**

Run: `pnpm --filter @kb/core test src/db/seed && pnpm db:seed`
Expected: PASS; dòng `✓ seed xong`.

- [ ] **Step 5: Sẵn sàng commit**

Files: `packages/core/src/db/seed/**`, `packages/core/scripts/seed.ts`. Thông điệp: `feat(db): seed gói và org demo AN PHÁT`.

---

### Task 7: Worker khung (BullMQ) và composition root worker

**Files:**
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/{index,container}.ts`, `apps/worker/src/jobs/health.ts`, `apps/worker/src/jobs/health.test.ts`
- Create: `packages/core/src/shared/queue.ts` (port `JobQueue` + tên queue) và export trong `shared/index.ts`

**Interfaces:**
- Produces:
  - `QueueName = "health" | "extract-document" | "run-agent" | "customs-send" | "customs-poll" | "skill-evaluate"`; `interface JobQueue { enqueue(name: QueueName, payload: unknown, opts?: { jobId?: string; delayMs?: number }): Promise<void> }`.
  - Worker: `buildContainer(): { env, db, redis, close }`; job handler `healthJob(payload)` parse Zod `{ ping: string }` trả `{ pong: string }`.
  - `apps/worker` chạy `pnpm --filter @kb/worker dev` (tsx watch).

- [ ] **Step 1: Port queue trong core**

`packages/core/src/shared/queue.ts`:
```ts
export const QUEUE_NAMES = ["health", "extract-document", "run-agent", "customs-send", "customs-poll", "skill-evaluate"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export interface JobQueue {
  enqueue(name: QueueName, payload: unknown, opts?: { jobId?: string; delayMs?: number }): Promise<void>;
}

/** Cho test use case: ghi lại job đã đẩy. */
export class InMemoryJobQueue implements JobQueue {
  readonly jobs: { name: QueueName; payload: unknown; jobId?: string }[] = [];
  async enqueue(name: QueueName, payload: unknown, opts?: { jobId?: string }) {
    this.jobs.push({ name, payload, ...(opts?.jobId ? { jobId: opts.jobId } : {}) });
  }
}
```
Thêm `export * from "./queue.js";` vào `packages/core/src/shared/index.ts`.

- [ ] **Step 2: Package worker**

`apps/worker/package.json`:
```json
{
  "name": "@kb/worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file=../../.env src/index.ts",
    "start": "tsx --env-file=../../.env src/index.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@kb/contracts": "workspace:*",
    "@kb/core": "workspace:*",
    "bullmq": "^6.3.14",
    "ioredis": "^6.0.0",
    "zod": "^4.6.6"
  },
  "devDependencies": { "@types/node": "^26.6.5", "tsx": "^4.23.15", "typescript": "^5.9.3", "vitest": "^5.0.4" }
}
```

`apps/worker/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node"], "lib": ["ES2023"] },
  "include": ["src", "vitest.config.ts"]
}
```

`apps/worker/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts"] } });
```

- [ ] **Step 3: Test handler health (fail trước)**

`apps/worker/src/jobs/health.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { healthJob } from "./health.js";

describe("healthJob", () => {
  it("trả pong kèm chuỗi ping", async () => {
    expect(await healthJob({ ping: "xin chào" })).toEqual({ pong: "xin chào" });
  });
  it("payload sai hình dạng thì ném lỗi Zod (không retry được dữ liệu hỏng)", async () => {
    await expect(healthJob({ nope: 1 })).rejects.toThrow();
  });
});
```

Run: `pnpm install && pnpm --filter @kb/worker test` → Expected: FAIL.

- [ ] **Step 4: Viết worker**

`apps/worker/src/jobs/health.ts`:
```ts
import { z } from "zod";

const Payload = z.object({ ping: z.string() });

export async function healthJob(raw: unknown) {
  const { ping } = Payload.parse(raw);
  return { pong: ping };
}
```

`apps/worker/src/container.ts`:
```ts
import { loadEnv } from "@kb/core/config";
import { createDb } from "@kb/core/db";
import IORedis from "ioredis";

export function buildContainer() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL, { max: 5 });
  const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return {
    env,
    db,
    redis,
    async close() {
      await db.close();
      redis.disconnect();
    },
  };
}
export type Container = ReturnType<typeof buildContainer>;
```

`apps/worker/src/index.ts`:
```ts
import { Worker } from "bullmq";
import { buildContainer } from "./container.js";
import { healthJob } from "./jobs/health.js";

const c = buildContainer();

const workers = [
  new Worker("health", async (job) => healthJob(job.data), { connection: c.redis, concurrency: 2 }),
];

for (const w of workers) {
  w.on("failed", (job, e) => console.error(`[worker] ${w.name} job ${job?.id} lỗi:`, e.message));
  w.on("completed", (job) => console.log(`[worker] ${w.name} job ${job.id} xong`));
}
console.log(`[worker] sẵn sàng: ${workers.map((w) => w.name).join(", ")}`);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} → đóng`);
  await Promise.all(workers.map((w) => w.close()));
  await c.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
```

- [ ] **Step 5: Chạy test và khởi động thử**

Run: `pnpm --filter @kb/worker test && pnpm --filter @kb/worker typecheck`
Expected: PASS.

Run (nền, 10 giây rồi Ctrl-C): `pnpm dev:worker`
Expected: in `[worker] sẵn sàng: health`. Đẩy thử một job bằng script tạm trong scratchpad:
```ts
import { Queue } from "bullmq"; import IORedis from "ioredis";
const q = new Queue("health", { connection: new IORedis("redis://localhost:6379", { maxRetriesPerRequest: null }) });
await q.add("ping", { ping: "hi" }); await q.close(); process.exit(0);
```
Expected: worker log `job … xong`.

- [ ] **Step 6: Sẵn sàng commit**

Files: `apps/worker/**`, `packages/core/src/shared/queue.ts`, `packages/core/src/shared/index.ts`, `pnpm-lock.yaml`. Thông điệp: `feat(worker): khung BullMQ worker, container, job health`.

---

### Task 8: Web: composition root, `/api/health`, lớp HTTP, tách nguồn dữ liệu mock/http

**Files:**
- Create: `apps/web/src/container.ts`, `apps/web/src/app/api/health/route.ts`
- Create: `apps/web/src/lib/api-error.ts`, `apps/web/src/lib/http.ts`, `apps/web/src/lib/data-source.ts`, `apps/web/src/lib/http.test.ts`, `apps/web/vitest.config.ts`
- Move (git mv): `apps/web/src/api/*.ts` → `apps/web/src/mocks/api/*.ts`; Create mới `apps/web/src/api/*.ts` (selector)
- Modify: `apps/web/src/lib/mock-request.ts` (ApiError lấy từ `api-error.ts`), `apps/web/package.json` (test script, vitest), `.dependency-cruiser.cjs` (rule schema + mocks), `.github/workflows/ci.yml`, `apps/web/CLAUDE.md`, `packages/core/CLAUDE.md`, `apps/worker/CLAUDE.md`

**Interfaces:**
- Produces:
  - `getContainer()` (web, singleton qua `globalThis` trong dev): `{ env, db, queue: BullMqJobQueue, redis }`.
  - `ApiError(code: string, message: string, status?: number)`; `apiGet<T>(path, schema?)`, `apiPost<T>(path, body, schema?)`, `apiPatch`, `apiDelete`, `apiUpload(path, FormData)` – ném `ApiError` từ body `{code, message}`; tiền tố `/api`.
  - `dataSource(): "mock" | "http"` đọc `process.env.NEXT_PUBLIC_DATA_SOURCE`, mặc định `"mock"`.
  - `pick<T>(mock: T, http: T): T`.
  - `BullMqJobQueue` trong `packages/core/src/shared/bullmq-queue.ts`? **Không**: BullMQ là hạ tầng → đặt ở `packages/core/src/modules/_infra/queue/bullmq-job-queue.ts` sẽ vi phạm quy ước module. Đặt tại `apps/web/src/lib/bullmq-queue.ts` và `apps/worker` dùng `Queue` trực tiếp. Ở giai đoạn 2 khi `dossier` cần đẩy job từ use case, `JobQueue` được inject từ container (web) — core chỉ thấy interface.

- [ ] **Step 1: Test lớp HTTP (fail trước)**

`apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```
`apps/web/package.json` scripts thêm `"test": "vitest run"`, devDependencies thêm `"vitest": "^5.0.4"`.

`apps/web/src/lib/http.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "./api-error";
import { apiGet, apiPost } from "./http";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("http", () => {
  it("apiGet gọi /api/<path>, gửi cookie, parse bằng schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "dos_1" }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await apiGet("dossiers/dos_1", z.object({ id: z.string() }));
    expect(r).toEqual({ id: "dos_1" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/dossiers/dos_1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });
  it("lỗi 4xx có body {code,message} → ném ApiError giữ code và status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ" })));
    await expect(apiGet("dossiers/x")).rejects.toMatchObject(new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ", 404));
  });
  it("lỗi không có body JSON → ApiError code HTTP_<status>", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 })));
    await expect(apiPost("x", {})).rejects.toMatchObject({ code: "HTTP_502" });
  });
  it("apiPost gửi JSON với content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await apiPost("dossiers", { a: 1 });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ a: 1 }) });
  });
});
```

Run: `pnpm install && pnpm --filter @kb/web test` → Expected: FAIL.

- [ ] **Step 2: Viết `api-error.ts`, `http.ts`, `data-source.ts`**

`apps/web/src/lib/api-error.ts`:
```ts
/** Lỗi nghiệp vụ từ backend (hoặc mock). `code` cố định để UI dịch; `message` tiếng Việt sẵn dùng. */
export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = "ApiError";
  }
}
```

`apps/web/src/lib/http.ts`:
```ts
import type { ZodType } from "zod";
import { ApiError } from "./api-error";

const BASE = "/api";

async function request<T>(method: string, path: string, init: RequestInit, schema?: ZodType<T>): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { ...init, method, credentials: "include" });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json();
  return schema ? schema.parse(data) : (data as T);
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { code?: string; message?: string };
    if (body && typeof body.code === "string") return new ApiError(body.code, body.message ?? body.code, res.status);
  } catch {
    /* body không phải JSON */
  }
  return new ApiError(`HTTP_${res.status}`, `Lỗi máy chủ (${res.status})`, res.status);
}

const json = (body: unknown): RequestInit => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const apiGet = <T>(path: string, schema?: ZodType<T>) => request<T>("GET", path, {}, schema);
export const apiPost = <T>(path: string, body: unknown, schema?: ZodType<T>) => request<T>("POST", path, json(body), schema);
export const apiPatch = <T>(path: string, body: unknown, schema?: ZodType<T>) => request<T>("PATCH", path, json(body), schema);
export const apiDelete = <T>(path: string, schema?: ZodType<T>) => request<T>("DELETE", path, {}, schema);
export const apiUpload = <T>(path: string, form: FormData, schema?: ZodType<T>) => request<T>("POST", path, { body: form }, schema);
```

`apps/web/src/lib/data-source.ts`:
```ts
export type DataSource = "mock" | "http";

/** Mặc định mock để bản demo (Vercel, PM) chạy không cần backend. */
export function dataSource(): DataSource {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? "http" : "mock";
}

/** Chọn hiện thực theo nguồn dữ liệu; hai bên phải cùng chữ ký. */
export function pick<T>(mock: T, http: T): T {
  return dataSource() === "http" ? http : mock;
}
```

Sửa `apps/web/src/lib/mock-request.ts`: xóa `class ApiError`, thay bằng `export { ApiError } from "./api-error";`.

Run: `pnpm --filter @kb/web test` → Expected: PASS.

- [ ] **Step 3: Tách mock api**

```bash
cd apps/web/src && mkdir -p mocks/api && for f in api/*.ts; do git mv "$f" "mocks/api/$(basename "$f")"; done
```
Trong mỗi `mocks/api/*.ts`, import tương đối nội bộ (`@/lib/mock-request`, `@/mocks/...`) giữ nguyên vì dùng alias `@/`.

Tạo lại `apps/web/src/api/<x>.ts` cho mỗi file (`customs, declaration, dossiers, ocr, session, settings, skills`) theo mẫu, ví dụ `apps/web/src/api/dossiers.ts`:
```ts
// Nguồn dữ liệu cho màn hình. Giai đoạn 0: chỉ có mock; từng giai đoạn sau thêm hiện thực http vào ./http/<x>.ts rồi pick().
export * from "@/mocks/api/dossiers";
```
(7 file giống nhau, chỉ khác tên). Các màn hình import `@/api/<x>` không đổi.

Run: `pnpm --filter @kb/web typecheck` → Expected: PASS.

- [ ] **Step 4: Composition root web và `/api/health`**

`apps/web/src/container.ts`:
```ts
import { loadEnv, type Env } from "@kb/core/config";
import { createDb, type Db } from "@kb/core/db";
import type { JobQueue, QueueName } from "@kb/core/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export type Container = { env: Env; db: Db; redis: IORedis; queue: JobQueue };

class BullMqJobQueue implements JobQueue {
  private queues = new Map<QueueName, Queue>();
  constructor(private redis: IORedis) {}
  async enqueue(name: QueueName, payload: unknown, opts?: { jobId?: string; delayMs?: number }) {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.redis, defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 10_000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
      this.queues.set(name, q);
    }
    await q.add(name, payload, { ...(opts?.jobId ? { jobId: opts.jobId } : {}), ...(opts?.delayMs ? { delay: opts.delayMs } : {}) });
  }
}

function build(): Container {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL, { max: 10 });
  const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return { env, db, redis, queue: new BullMqJobQueue(redis) };
}

// Next dev tải lại module nhiều lần → giữ một instance trên globalThis để không rò kết nối.
const g = globalThis as unknown as { __kbContainer?: Container };
export function getContainer(): Container {
  if (!g.__kbContainer) g.__kbContainer = build();
  return g.__kbContainer;
}
```
`apps/web/package.json` dependencies thêm `"bullmq": "^6.3.14"`, `"ioredis": "^6.0.0"`.

`apps/web/src/app/api/health/route.ts`:
```ts
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getContainer } from "@/container";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = getContainer();
  const checks: Record<string, "ok" | string> = {};
  try { await c.db.execute(sql`select 1`); checks.postgres = "ok"; } catch (e) { checks.postgres = (e as Error).message; }
  try { await c.redis.ping(); checks.redis = "ok"; } catch (e) { checks.redis = (e as Error).message; }
  const ok = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json({ ok, checks, dataSource: process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock" }, { status: ok ? 200 : 503 });
}
```

> Rule depcruise `web-no-db-driver` cấm web import `drizzle-orm` ngoài `container.ts`. Route health cần `sql` → thêm vào container một hàm `pingDb(): Promise<void>` và route gọi `c.pingDb()` thay vì import drizzle. Sửa `Container` thêm `pingDb: () => db.execute(sql\`select 1\`).then(() => undefined)`.

Run: `pnpm --filter @kb/web typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Kiểm tra bằng server thật**

Run: `pnpm --filter @kb/web build && pnpm --filter @kb/web start` (nền), rồi `curl -s localhost:3100/api/health`
Expected: `{"ok":true,"checks":{"postgres":"ok","redis":"ok"},"dataSource":"mock"}`. Tắt server.

Mở `http://localhost:3100` bằng trình duyệt: đăng nhập mock, màn Hồ sơ hiển thị như trước (không thay đổi giao diện; không cần chụp sáng/tối vì không đổi pixel nào).

- [ ] **Step 6: depcruise, CI, tài liệu**

`.dependency-cruiser.cjs` thêm hai rule vào `forbidden`:
```js
{
  name: "module-infra-own-schema",
  comment: "modules/<m>/infrastructure chỉ được đọc bảng của chính mình: db/schema/<m>.ts (+ shared).",
  severity: "error",
  from: { path: `${MOD}infrastructure/` },
  to: { path: "^packages/core/src/db/schema/([^/]+)\\.ts$", pathNot: ["^packages/core/src/db/schema/$1\\.ts$", "^packages/core/src/db/schema/shared\\.ts$"] },
},
{
  name: "web-screens-not-mocks-db",
  comment: "Màn hình không import mocks/db, mocks/seed, mocks/api trực tiếp; chỉ qua src/api/*.",
  severity: "error",
  from: { path: "^apps/web/src/(features|app|components)/" },
  to: { path: "^apps/web/src/mocks/(db|seed|api)" },
},
```
(Trong rule thứ nhất `$1` tham chiếu nhóm của `MOD`; module `identity` sẽ đọc `schema/identity.ts`, `billing` đọc `schema/billing.ts`… đặt tên file schema theo tên module.)

`.github/workflows/ci.yml`: sau bước `pnpm install` thêm:
```yaml
      - run: cp .env.example .env && sed -i "s|^APP_MASTER_KEY=.*|APP_MASTER_KEY=$(openssl rand -base64 32)|" .env
```
(Testcontainers tự khởi động Postgres; `pnpm build` web cần `.env` để `loadEnv` không ném khi build route health → route là `force-dynamic` nên không chạy lúc build, nhưng giữ `.env` cho chắc.)

Cập nhật tài liệu:
- `apps/web/CLAUDE.md`: mục "Giai đoạn hiện tại" → ghi: nguồn dữ liệu chọn bằng `NEXT_PUBLIC_DATA_SOURCE` (`mock` mặc định, `http` gọi backend); mock ở `src/mocks/api/*`; hiện thực http ở `src/api/http/*` (thêm dần); `src/container.ts` là nơi duy nhất nối `@kb/core` infrastructure; route handler trong `src/app/api/**` chỉ: session → parse Zod → use case → map lỗi.
- `packages/core/CLAUDE.md`: thêm mục "DB": schema ở `src/db/schema/<module>.ts`, mọi truy vấn qua `withCtx`, migration `pnpm db:generate` rồi kiểm tra SQL, test repo `*.int.test.ts` dùng `startTestDb()`.
- `apps/worker/CLAUDE.md`: thêm dòng chạy `pnpm dev:worker`, handler đăng ký trong `src/index.ts`, container ở `src/container.ts`.
- `README.md` mục chạy: `cp .env.example .env`, điền `APP_MASTER_KEY`, `pnpm dev`.

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: xanh.

- [ ] **Step 7: Sẵn sàng commit**

Files: `apps/web/src/{container.ts,lib/*,api/*,mocks/api/*,app/api/health/route.ts}`, `apps/web/{package.json,vitest.config.ts,CLAUDE.md}`, `.dependency-cruiser.cjs`, `.github/workflows/ci.yml`, `packages/core/CLAUDE.md`, `apps/worker/CLAUDE.md`, `README.md`, `pnpm-lock.yaml`. Thông điệp: `feat(web): composition root, /api/health, lớp http, tách nguồn dữ liệu mock/http`.

---

## Self-review

**Spec coverage (giai đoạn 0, spec §8 hàng 0):** contracts (Task 1–2) ✓; shared kernel (Task 3) ✓; db + migrate + RLS (Task 5) ✓; seed khung (Task 6) ✓; compose (Task 4) ✓; container web/worker (Task 7–8) ✓; worker khung (Task 7) ✓; test infra Testcontainers (Task 5) ✓; `src/api` tách mock/http + cờ nguồn dữ liệu (Task 8) ✓; `pnpm dev` thật (Task 4 script + Task 7 worker) ✓. Chưa có trong giai đoạn 0 (đúng theo spec): S3 adapter, mailer, session — sang giai đoạn 1–2.

**Placeholder:** không có TBD/TODO; mọi bước có mã.

**Type consistency:** `withCtx(db, {orgId, userId?}, fn)` dùng nhất quán Task 5–6; `JobQueue.enqueue(name, payload, opts)` Task 7–8 khớp; `loadEnv()` Task 4/7/8 khớp; `createDb(url, {max})` Task 5–8 khớp; `ApiError(code, message, status)` Task 8 và `mock-request.ts` khớp.

**Review Focus → test:** (1) Task 5 ca "orgId rỗng"; (2) Task 5 ca "org B không thấy"; (3) Task 4 ca thiếu `ANTHROPIC_API_KEY`/`DATABASE_URL`; (4) Task 1 `DecimalStringSchema` các ca từ chối; (5) Task 8 `dataSource()` mặc định mock — thêm test nhỏ `apps/web/src/lib/data-source.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { dataSource, pick } from "./data-source";
afterEach(() => vi.unstubAllEnvs());
describe("dataSource", () => {
  it("không đặt biến → mock", () => { vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", ""); expect(dataSource()).toBe("mock"); expect(pick("m", "h")).toBe("m"); });
  it("http → http", () => { vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "http"); expect(pick("m", "h")).toBe("h"); });
});
```
(thuộc Task 8 Step 2).
