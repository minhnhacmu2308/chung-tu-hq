# Chuẩn trường chứng từ → chỉ tiêu VNACCS – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi lô, mọi khách hàng ra cùng một bộ trường chuẩn theo loại chứng từ (như Excel mẫu), dựng được tờ khai IDA/EDA đủ chỉ tiêu, và mỗi tài khoản cấu hình thêm (trường bổ sung, mặc định khai báo, nguồn chỉ tiêu) không cần sửa code.

**Architecture:**
- **Đọc chứng từ:** danh mục trường (`DOC_CATALOG`) là metadata đi kèm các schema Zod hiện có, có test đồng bộ. Schema được bổ sung trường v2. Trường bổ sung riêng của tài khoản được gắn vào schema lúc chạy.
- **Ánh xạ chỉ tiêu:** giữ logic `from` đã có test, thêm `options` (nguồn thay thế được phép, giá trị cố định) và ghi nguồn gốc (provenance).
- **Cấu hình theo tài khoản:** bảng `declaration_profiles` lưu mặc định khai báo và ghi đè.
- **Đầu ra và đo lường:** UI xem theo chứng từ, xuất Excel, eval chạy trên lô thật.

**Tech Stack:** TypeScript, Zod 4, Drizzle + Postgres (RLS), Next.js route handlers, BullMQ worker, Vitest + Testcontainers, Playwright, `exceljs` (mới, chỉ ở apps/web server).

**Spec:** `docs/superpowers/specs/2026-10-15-chuan-truong-chung-tu-design.md`

## Global Constraints

- Bất biến trong `CLAUDE.md`:
  - mọi truy vấn có `orgId`;
  - mã định danh là `string`;
  - tiền dùng `Decimal`;
  - ngày nghiệp vụ dạng `YYYY-MM-DD`;
  - dữ liệu từ ngoài phải parse bằng Zod;
  - giao diện chỉ dùng `@kb/ui` và token.
- Module chỉ import nhau qua `modules/<m>/index.ts`. Infrastructure chỉ import schema DB của chính module (depcruise chặn).
- `EXTRACTION_SCHEMA_VERSION = 2`, `DOC_CATALOG_VERSION = 2`.
- Trường mới trong schema trích xuất là required + nullable (`nStr`/`nNum`/`nDate`).
- Mã trường bổ sung theo `^[a-z][a-zA-Z0-9]*$`, kiểu `text|number|date`, tối đa 20 trường mỗi skill.
- Chỉ tiêu thuộc `DERIVED_DECLARATION_FIELD_CODES` không có `options` và không ghi đè được.
- Không dùng `tool_choice` ép tool. Schema gửi AI phải qua được `zodOutputFormat` (đã có probe).
- Dữ liệu lô thật để ở `evals/private/` (gitignore), không commit.
- Cuối mỗi task: `pnpm typecheck && pnpm lint && pnpm test` xanh. Không commit (người dùng chưa yêu cầu); mỗi "Checkpoint" là chạy bộ kiểm tra này.

## Review Focus

1. **Chứng từ đã đọc theo schema v1 (thiếu key v2)** → gộp hồ sơ và dựng tờ khai không lỗi, trường v2 là null. Test ở Task 3.
2. **Skill có trường bổ sung nhưng AI trả `custom` thiếu key hoặc sai kiểu** → `schema.safeParse` báo lỗi rõ (AiDataError), không làm hỏng các trường chuẩn. Test ở Task 7.
3. **Ghi đè trỏ tới nguồn đã bị xóa khỏi `options`** (đổi code sau khi lưu) → bỏ qua nguồn lạ khi dựng tờ khai và quay về mặc định, không ném lỗi. Test ở Task 4.
4. **Mặc định khai báo có giá trị sai định dạng** (ví dụ KHO quá 7 ký tự) → lưu bị từ chối `VALIDATION` kèm tên chỉ tiêu. Test ở Task 5.
5. **Excel đáp án có tên trường không khớp danh mục** → script eval in cảnh báo từng dòng, không ném lỗi, vẫn chấm phần khớp được. Test ở Task 10.

---

### Task 1: Danh mục trường chuẩn + test đồng bộ (v1)

**Files:**
- Create: `packages/contracts/src/catalog/types.ts`, `packages/contracts/src/catalog/documents.ts`, `packages/contracts/src/catalog/index.ts`, `packages/contracts/src/catalog/catalog.test.ts`
- Modify: `packages/contracts/src/index.ts` (export `./catalog/index.js`)

**Interfaces:**
- Produces:
  - `DocFieldType`, `DocFieldDef { key; label; aliases: string[]; type; since: 1|2 }`, `DocCatalog { kind; fields; items? }`;
  - `DOC_CATALOG: Record<DocKind, DocCatalog>`, `DOC_CATALOG_VERSION`;
  - `catalogFieldLabel(kind, key): string | null`;
  - `findCatalogField(kind, labelOrAlias: string): { key: string; item: boolean } | null` (so khớp đã chuẩn hóa: bỏ dấu, hoa/thường, khoảng trắng, ký tự `.:/()`).

- [ ] **Step 1: Write the failing test** `catalog.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DOC_KINDS } from "../common.js";
import { extractionSchemaFor } from "../extraction/index.js";
import { DOC_CATALOG, findCatalogField } from "./index.js";

const keysOf = (s: unknown) => Object.keys((s as z.ZodObject).shape).filter((k) => k !== "uncertainties" && k !== "items" && k !== "containers" && k !== "charges" && k !== "services");
describe("DOC_CATALOG", () => {
  it.each(DOC_KINDS)("%s: key phần đầu khớp đúng thứ tự với schema Zod", (kind) => {
    expect(DOC_CATALOG[kind].fields.map((f) => f.key)).toEqual(keysOf(extractionSchemaFor(kind)));
  });
  it.each(DOC_KINDS)("%s: key dòng hàng khớp schema (nếu có)", (kind) => {
    const shape = (extractionSchemaFor(kind) as z.ZodObject).shape as Record<string, z.ZodType>;
    const listKey = DOC_CATALOG[kind].items?.key;
    if (!listKey) return;
    const el = (shape[listKey] as z.ZodArray<z.ZodObject>).element;
    expect(DOC_CATALOG[kind].items!.fields.map((f) => f.key)).toEqual(Object.keys(el.shape));
  });
  it("mọi trường có nhãn tiếng Việt, key không trùng trong cùng loại", () => {
    for (const c of Object.values(DOC_CATALOG)) {
      const keys = c.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const f of c.fields) expect(f.label.trim()).not.toBe("");
    }
  });
  it("findCatalogField khớp nhãn/alias bỏ dấu, hoa thường, dấu câu", () => {
    expect(findCatalogField("INVOICE", "Inv. No")).toEqual({ key: "invoiceNo", item: false });
    expect(findCatalogField("BILL_OF_LADING", "Ocean Vessel")).toEqual({ key: "vessel", item: false });
    expect(findCatalogField("INVOICE", "UNIT PRICE")).toEqual({ key: "unitPrice", item: true });
    expect(findCatalogField("INVOICE", "không có")).toBeNull();
  });
});
```

- [ ] **Step 2:** `pnpm --filter @kb/contracts exec vitest run src/catalog` → FAIL (module không tồn tại). Nếu `DOC_KINDS` chưa export ở `common.ts`, export mảng từ enum `DocKindSchema.options`.
- [ ] **Step 3: Implement**
  - `types.ts`: các kiểu ở trên.
  - `documents.ts`: một mảng cho mỗi loại, theo **đúng thứ tự key** của schema hiện tại.
    - Nhãn tiếng Việt lấy theo cột "TÊN TRƯỜNG" của Excel mẫu khi có (ví dụ Invoice: "Người xuất khẩu" cho `seller`, "Inv. No" là alias của `invoiceNo`).
    - Alias gồm các nhãn tiếng Anh phổ biến đang nằm trong `.describe()` của schema, cộng với tên trường trong 2 file Excel mẫu.
    - `items` chỉ định key danh sách: INVOICE/PACKING_LIST → `items`, CERT_OF_ORIGIN → `items`, BILL_OF_LADING → `containers`, ARRIVAL_NOTICE → `charges`, FREIGHT_INVOICE → `services`.
  - `index.ts`: export, cộng `findCatalogField` (chuẩn hóa: `normalize("NFD")`, bỏ dấu, lowercase, thay `[^a-z0-9]+` bằng một khoảng trắng, trim); tìm ở phần đầu trước, rồi đến items.
- [ ] **Step 4:** test PASS.
- [ ] **Step 5: Checkpoint** `pnpm typecheck && pnpm lint && pnpm test`.

### Task 2: Trường v2 trong schema + danh mục + dữ liệu giả

**Files:**
- Modify: `packages/contracts/src/extraction/{invoice,bill-of-lading,air-waybill,arrival-notice,cert-of-origin,freight-invoice,index}.ts`, `packages/contracts/src/catalog/documents.ts`
- Modify: `packages/core/src/modules/extraction/infrastructure/fake-ai-provider.ts` (`FAKE_BY_KIND` thêm key v2 = null hoặc giá trị hợp lý)
- Test: `packages/contracts/src/catalog/catalog.test.ts`, `packages/contracts/src/extraction/extraction.test.ts`

**Interfaces:**
- Produces: các key mới (spec §4.2):
  - INVOICE: `incotermPlace`, `originStatement`; `items[].partNo`
  - BILL_OF_LADING: `placeOfIssue`, `dateOfIssue`
  - AIR_WAYBILL: `flightDate`, `placeOfIssue`. Không thêm `flightNo` vì `flight` đã có; alias "Requested Flight/Date"
  - ARRIVAL_NOTICE: `masterBillNo`, `transportMode` (enum SEA|AIR nullable), `flightNo`, `portOfLoading`, `packages`, `packageUnit`, `grossWeightKg`, `warehouseCode`, `warehouseName`, `note`
  - CERT_OF_ORIGIN: `departureDate`, `transportName`, `portOfLoading`, `portOfDischarge`, `packagesDescription`, `quantityOrWeight`, `certified` (boolean nullable)
  - FREIGHT_INVOICE: `billRef`
- `EXTRACTION_SCHEMA_VERSION = 2`.

- [ ] **Step 1: Failing test** trong `extraction.test.ts`:

```ts
it("v2: Arrival Notice có MB/L, kho, số kiện, trọng lượng; C/O có ô 3/9/12", () => {
  const an = ArrivalNoticeExtractionSchema.shape;
  for (const k of ["masterBillNo", "warehouseCode", "warehouseName", "packages", "packageUnit", "grossWeightKg", "note", "flightNo", "portOfLoading", "transportMode"]) expect(an).toHaveProperty(k);
  for (const k of ["departureDate", "transportName", "portOfLoading", "portOfDischarge", "packagesDescription", "quantityOrWeight", "certified"]) expect(CertOfOriginExtractionSchema.shape).toHaveProperty(k);
  expect(EXTRACTION_SCHEMA_VERSION).toBe(2);
});
it("v2: mọi schema vẫn chuyển được sang JSON Schema cho structured output", () => {
  for (const kind of DOC_KINDS) expect(() => z.toJSONSchema(extractionSchemaFor(kind), { target: "draft-7" })).not.toThrow();
});
```

- [ ] **Step 2:** chạy → FAIL.
- [ ] **Step 3:** thêm trường, mỗi trường có `.describe` rõ:
  - `warehouseCode`: "Mã kho/CY/địa điểm lưu kho (vd 02B1A04, 02CIS01) – chỉ phần mã";
  - `warehouseName`: "Tên kho/CY (vd KHO SCSC, CÁT LÁI KHO 3)";
  - `certified`: "true nếu ô 12 Certification có chữ ký VÀ con dấu";
  - `incotermPlace`: "Địa danh sau điều kiện giao hàng (EXW **Shenzhen** → Shenzhen)".
  - Thêm cùng key vào `DOC_CATALOG` (đúng thứ tự, `since: 2`).
  - Cập nhật `FAKE_BY_KIND`: AN thêm `masterBillNo: "SITCHPH2610441"`, `warehouseCode: "03CCS01"`, `warehouseName: "KHO CFS TÂN VŨ"`, `packages: 48`, `packageUnit: "PALLET"`, `grossWeightKg: 3842`; các key v2 khác = null.
- [ ] **Step 4:** test contracts + core extraction PASS. Chạy probe 10 schema: `zodOutputFormat(extractionSchemaFor(k))` không ném lỗi (thêm case vào `claude-ai-provider.test.ts`).
- [ ] **Step 5: Checkpoint.**

### Task 3: Gộp hồ sơ – trường mới vào Shipment

**Files:**
- Modify: `packages/contracts/src/shipment.ts`:
  - `transport` thêm `houseBillNo`, `flightNo`, `departureDate`, `placeOfIssue`, `warehouseCode`, `warehouseName`;
  - `invoice` thêm `incotermPlace`;
  - `origin` thêm `criteria: z.array({hs6, criterion})`;
  - `items[]` thêm `partNo`;
  - thêm `custom: z.record(z.string(), z.record(z.string(), str()))`;
  - cập nhật `emptyShipment()`.
- Modify: `packages/core/src/modules/extraction/domain/shipment-spec.ts`, `merge.ts`
- Test: `packages/core/src/modules/extraction/domain/__tests__/merge.test.ts` (hoặc file test merge hiện có)

**Interfaces:**
- Produces: `Shipment.transport.warehouseCode: Sourced<string>` … (Task 4 đọc).
- `SHIPMENT_FIELDS` thêm:
  - `/transport/houseBillNo` ← BL.billNo, AWB.hawbNo, AN.billNo;
  - `/transport/masterBillNo` ← BL.masterBillNo, AWB.awbNo, AN.masterBillNo;
  - `/transport/flightNo` ← AWB.flight, AN.flightNo;
  - `/transport/departureDate` ← BL.dateOfIssue, BL.date, AWB.flightDate, CO.departureDate;
  - `/transport/placeOfIssue` ← BL.placeOfIssue, AWB.placeOfIssue;
  - `/transport/warehouseCode` ← AN.warehouseCode;
  - `/transport/warehouseName` ← AN.warehouseName;
  - `/invoice/incotermPlace` ← INVOICE.incotermPlace;
  - bổ sung nguồn: `/transport/packages` + AN.packages, `/transport/grossWeightKg` + AN.grossWeightKg, `/transport/arrivalDate` + AWB.flightDate (sau AN), `/transport/portOfLoading` + AN.portOfLoading + CO.portOfLoading.
- **Giữ `/transport/billNo` như cũ** để tương thích.

- [ ] **Step 1: Failing tests:**

```ts
it("Arrival Notice v2 cấp kho, MB/L; dữ liệu v1 thiếu key vẫn gộp được (null)", () => {
  const s = mergeExtractions([
    { documentId: "d1", kind: "ARRIVAL_NOTICE", pages: 1, data: { billNo: "FANS25040166", masterBillNo: "LLLHCM25414116", warehouseCode: null, warehouseName: "CÁT LÁI KHO 3", eta: "2025-04-25", packages: 1, packageUnit: "PALLET", grossWeightKg: 119.5, uncertainties: [] } },
    { documentId: "d2", kind: "BILL_OF_LADING", pages: 1, data: { billNo: "FANS25040166", date: "2025-04-22", portOfLoading: "SHENZHEN,CHINA", uncertainties: [] } }, // v1: thiếu placeOfIssue/dateOfIssue
  ]);
  expect(s.transport.masterBillNo.value).toBe("LLLHCM25414116");
  expect(s.transport.warehouseName.value).toBe("CÁT LÁI KHO 3");
  expect(s.transport.departureDate.value).toBe("2025-04-22");
  expect(s.transport.placeOfIssue.value).toBeNull();
});
it("chuyến bay lệch giữa HAWB và Arrival Notice → CONFLICT", () => {
  const s = mergeExtractions([
    { documentId: "a", kind: "AIR_WAYBILL", pages: 1, data: { awbNo: "92147391621", hawbNo: "YZS24120950", flight: "O3141", uncertainties: [] } },
    { documentId: "b", kind: "ARRIVAL_NOTICE", pages: 1, data: { billNo: "YZS24120950", flightNo: "O30141", uncertainties: [] } },
  ]);
  expect(s.transport.flightNo.status).toBe("CONFLICT");
  expect(s.transport.houseBillNo.value).toBe("YZS24120950");
});
```

  (Dùng đúng tên hàm/chữ ký merge hiện có; đọc `merge.ts` trước khi viết test.)

- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** sửa contracts + spec + merge.
  - Item `partNo` lấy từ `INVOICE.items[].partNo` qua `ITEM_SPECS`.
  - `origin.criteria` lấy từ `CERT_OF_ORIGIN.items` (không qua `SHIPMENT_FIELDS`, dựng mảng trong `merge.ts`).
  - `custom` gom từ `data.custom` của từng chứng từ: `custom[kind][key]` = Sourced; ưu tiên chứng từ đầu tiên.
  - Thêm nhãn các key mới vào `projectFields` (nhóm TRANSPORT/GENERAL) để màn OCR hiện.
- [ ] **Step 4:** PASS. Chạy `pnpm --filter @kb/core test` (gồm flows int test).
- [ ] **Step 5: Checkpoint.**

### Task 4: Quy tắc chỉ tiêu – options, ghi đè, provenance, quy tắc mới

**Files:**
- Modify: `packages/core/src/modules/declaration/domain/mapping/types.ts`, `ida.ts`, `eda.ts`, `../build.ts`, `../types.ts`
- Create: `packages/core/src/modules/declaration/domain/mapping/evaluate.ts`, `packages/core/src/modules/declaration/domain/mapping/sources.ts`
- Test: `packages/core/src/modules/declaration/domain/__tests__/rules.test.ts`

**Interfaces:**
- Produces:
  - `SourceOption`, `FieldOverride`, `Provenance` (spec §6.1);
  - `evaluateMapping(m: FieldMapping, o: FieldOverride | undefined, i: MappingInput): MappedValue & { provenance: Provenance }`;
  - `validateOverrides(kind, overrides: Record<string, FieldOverride>): Result<void>`;
  - `ruleOptionsView(kind): { code; no; label; sources: {id,label}[]; allowFixed; locked: boolean }[]` (cho UI);
  - `StoredField.provenance?: Provenance`;
  - `MappingInput.profile: Record<string,string>`, `MappingInput.overrides: Record<string, FieldOverride>`;
  - `BuildInput.profile?`, `BuildInput.overrides?`.
- `sources.ts` là các `SourceOption` dùng lại: `an.warehouse` (`${code} – ${name}` hoặc tên), `profile.<CODE>`, `bl.dateOfIssue`, `co.departureDate`, `awb.flightDate`, `transport.houseBillNo`, `transport.masterBillNo`.

- [ ] **Step 1: Failing tests:**

```ts
it("không ghi đè: kết quả đúng y như from (mọi chỉ tiêu IDA/EDA trên ca HANSOL)", () => {
  for (const m of IDA_MAPPINGS) expect(omitProv(evaluateMapping(m, undefined, input))).toEqual(m.from(input));
});
it("KHO: lấy từ Arrival Notice; không có thì từ mặc định khai báo; không có cả hai thì thiếu", () => {
  expect(build({ an: { warehouseCode: "02B1A04", warehouseName: "KHO SCSC" } }).fields.KHO.value).toBe("02B1A04 – KHO SCSC");
  expect(build({ profile: { KHO: "03CCS01" } }).fields.KHO).toMatchObject({ value: "03CCS01", provenance: { via: "profile" } });
  expect(build({}).fields.KHO.suspect).toBe(true);
});
it("NGAY_DEN hàng air: không có AN thì lấy ngày bay AWB", () => { /* transport.arrivalDate trống, AWB flightDate 2024-12-21 → 2024-12-21 */ });
it("EDA NGAY_DI lấy ngày phát hành B/L, không lấy ETA", () => { /* … */ });
it("ghi đè fixed / sources; nguồn lạ bị bỏ qua và quay về mặc định", () => {
  expect(evaluateMapping(KHO, { fixed: "02CIS01" }, input)).toMatchObject({ value: "02CIS01", provenance: { via: "fixed" } });
  expect(evaluateMapping(KHO, { sources: ["khong-ton-tai"] }, input).provenance.via).toBe("default");
});
it("validateOverrides: TONG_TG/TY_GIA → FORBIDDEN; nguồn ngoài options → VALIDATION; fixed khi allowFixed=false → VALIDATION", () => { /* … */ });
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**
  - `options` cho: KHO (sources `an.warehouse`, `profile.KHO`; allowFixed); SO_VD (`transport.houseBillNo`, `transport.masterBillNo`); NGAY_DEN (`transport.arrivalDate`, `awb.flightDate`); PT_TT, KHAI_TG, NGUOI_NT, PL_CN, HD_PL, GIA_PL (`profile.<CODE>`; allowFixed).
  - Đổi `from` mặc định của các chỉ tiêu có giá trị `fixed(...)`: dùng `profile[code]` nếu có, ngược lại hằng cũ. `provenance.via = "profile"` khi lấy từ profile.
  - KHO mặc định: AN → profile → `missing`. NGAY_DEN: arrivalDate → `awb.flightDate`.
  - EDA NGAY_DI: `transport.departureDate`, rồi đến `missing`.
  - `build.ts` gọi `evaluateMapping` với `input.overrides[code]`, lưu provenance.
- [ ] **Step 4:** PASS và toàn bộ test declaration/integration cũ vẫn xanh. Riêng test KHO cũ kỳ vọng `missing` thì cập nhật vì đã đổi theo spec §6.2.
- [ ] **Step 5: Checkpoint.**

### Task 5: Mặc định khai báo – DB, use case, route

**Files:**
- Create: `packages/contracts/src/dto/declaration-profile.ts`:
  - `PROFILE_FIELD_CODES = ["MA_LH","CQHQ","PTVC","KHO","PT_TT","KHAI_TG","NGUOI_NT","PL_CN","HD_PL","GIA_PL"] as const`;
  - `DeclarationProfileSchema { direction: "NK"|"XK"; values: Record<code,string>; overrides: Record<code, FieldOverride>; updatedAt: IsoDateTime|null }`;
  - `DeclarationProfileInputSchema`;
  - `FieldOverrideSchema`;
  - `RuleOptionViewSchema`.
- Modify: `packages/core/src/db/schema/declaration.ts` (bảng `declaration_profiles`: id, org_id, direction, values jsonb, overrides jsonb, updated_by, timestamps; unique (org_id, direction); `orgRls`)
- Create migration: `packages/core/drizzle/0009_declaration_profiles.sql` (+ cập nhật `meta/_journal.json`, sinh bằng `pnpm --filter @kb/core db:generate` rồi đổi tên file)
- Modify: `packages/core/src/modules/declaration/application/ports.ts` (repo `profiles: { get(orgId, dir); upsert(row) }`), `infrastructure/drizzle-uow.ts`, test fake uow
- Create: `packages/core/src/modules/declaration/application/declaration-profile.ts` (`getDeclarationProfile`, `saveDeclarationProfile`, `listRuleOptions`)
- Modify: `application/declaration.ts` / nơi gọi `buildDeclaration` để truyền `profile.values` + `overrides`; `index.ts` export
- Create routes: `apps/web/src/app/api/org/declaration-profile/[direction]/route.ts` (GET/PUT), `apps/web/src/app/api/org/declaration-rules/[direction]/route.ts` (GET)
- Modify: tạo hồ sơ (`dossier` module, `createDossier`): khi input thiếu `typeCode`/`customsOffice` thì lấy từ profile (đi qua port `DeclarationProfileReader` ở composition root)
- Test: `application/__tests__/declaration-profile.test.ts`, `infrastructure/declaration-profile.int.test.ts`

- [ ] **Step 1: Failing tests:**
  - ADMIN lưu NK: `{ KHO: "03CCS01", PT_TT: "TTR" }` → get trả lại đúng;
  - DECLARANT lưu → FORBIDDEN;
  - `KHO: "QUA_DAI_12345"` → VALIDATION nêu "KHO";
  - code ngoài `PROFILE_FIELD_CODES` → VALIDATION;
  - override `TONG_TG` → FORBIDDEN;
  - org B không đọc được profile org A;
  - int test: RLS + unique upsert.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implement. Kiểm giá trị: dùng `canEditField(kind, code, value)` của guards (KHO kiểm thêm độ dài ≤ 7 theo catalog nếu catalog có `maxLen`).
- [ ] **Step 4:** PASS (unit + int).
- [ ] **Step 5: Checkpoint.**

### Task 6: Web – tab Cài đặt "Khai báo"

**Files:**
- Create: `apps/web/src/features/settings/declaration-tab.tsx`, `declaration-profile-form.ts` (+ `.test.ts`), `rule-overrides-table.tsx`
- Modify: `apps/web/src/features/settings/settings-page.tsx` (thêm tab `declaration` "Khai báo"), `apps/web/src/api/settings.ts`, `api/http/settings.ts`, `mocks/api/settings.ts`, `mocks/db.ts` (+`declarationProfiles`, `DB_VERSION` tăng), `mocks/seed/settings.ts`
- Test: logic form (vitest), e2e `apps/web/e2e/declaration-profile.spec.ts`

- [ ] **Step 1:** failing unit test cho `validateProfileForm` (dùng `DeclarationProfileInputSchema`; lỗi theo ô).
- [ ] **Step 2–4:**
  - Form 2 phần NK/XK dùng `Select` có danh sách từ `code-tables.ts` khi có, nếu không thì `Input`.
  - Bảng chỉ tiêu: mã, số Phụ lục II, nguồn mặc định, nút "Đổi nguồn" (Dialog chọn thứ tự nguồn hoặc nhập giá trị cố định).
  - Chỉ tiêu khóa có `Badge` "Khóa – tính từ trị giá".
  - Chỉ Quản trị/Chủ sở hữu thấy nút; các mutation có `onError: toastMutationError`.
- [ ] **Step 5:** e2e: lưu KHO mặc định → tạo hồ sơ NK → dựng tờ khai thấy KHO = giá trị mặc định với nguồn "Mặc định khai báo". Mở trình duyệt kiểm sáng/tối, 1366/390. **Checkpoint.**

### Task 7: Skill – key theo danh mục, trường bổ sung, bỏ MAPPING

**Files:**
- Modify: `packages/contracts/src/dto/skill.ts`:
  - `SkillKind` bỏ MAPPING;
  - `SkillField` thêm `custom: boolean`;
  - `CustomFieldDef { key; label; aliases; type: "text"|"number"|"date" }`.
- Modify: `packages/contracts/src/extraction/index.ts` (+ `withCustomFields(schema, defs)`)
- Modify: `packages/core/src/modules/skill/domain/schema-keys.ts` (xóa `OVERRIDES`/`schemaKeyFor`; `projectResult` đọc thẳng key danh mục hoặc `custom.<key>`), `skill/domain/field-rules.ts` (key bổ sung theo regex, tối đa 20, chỉ `custom` mới xóa được), `skill/application/resolve-skill.ts` (trả `customFields`), `extraction/application/ports.ts` (`SkillResolver.resolve` thêm `customFields: CustomFieldDef[]`), `extraction/application/process-document.ts` (`withCustomFields`), `extraction/infrastructure/claude-ai-provider.ts` (gợi ý từ danh mục khi skill không có)
- Modify: `packages/core/src/db/seed/skill-templates.ts`, `apps/web/src/mocks/seed/skills.ts` (key theo danh mục; xóa SK-MAP-*)
- Create migration: `packages/core/drizzle/0010_skill_catalog_keys.sql`:
  - xóa skills `kind='MAPPING'` (+ versions/samples theo FK);
  - đổi key trong `skill_versions.fields` theo bảng đối chiếu (`airport_departure → airportOfDeparture`, `warehouse → warehouseName`, `origin_criterion → custom`…), làm bằng `jsonb` UPDATE.
- Modify UI: `apps/web/src/features/skills/*` (bỏ tab MAPPING; bảng trường 2 nhóm; `field-dialog` chỉ tạo trường bổ sung)
- Test: `skill` domain/application tests, `extraction` process-document test, contracts test cho `withCustomFields`

- [ ] **Step 1: Failing tests:**

```ts
it("withCustomFields thêm object custom có đúng kiểu; không có trường thì giữ nguyên schema", () => {
  const s = withCustomFields(InvoiceExtractionSchema, [{ key: "lcNo", label: "Số L/C", aliases: ["L/C No"], type: "text" }]);
  expect(s.safeParse({ ...validInvoice, custom: { lcNo: "LC123" } }).success).toBe(true);
  expect(s.safeParse({ ...validInvoice, custom: { lcNo: 5 } }).success).toBe(false);
  expect(withCustomFields(InvoiceExtractionSchema, [])).toBe(InvoiceExtractionSchema);
});
it("processDocument: skill có trường bổ sung → schema gửi AI có custom; kết quả custom vào shipment.custom", async () => { /* FakeAiProvider ghi lại schema nhận được */ });
it("addSkillField: key sai regex / trùng / quá 20 → VALIDATION; xóa trường chuẩn → FORBIDDEN", async () => { /* … */ });
```

- [ ] **Step 2–4:** implement, PASS. `cloneTemplatesForOrg` không còn tạo MAPPING.
- [ ] **Step 5:** e2e `skill-config.spec.ts` cập nhật (không còn tab MAPPING; thêm trường bổ sung). **Checkpoint.**

### Task 8: Màn "Theo chứng từ" + Xuất Excel

**Files:**
- Create: `packages/core/src/modules/extraction/application/document-sheets.ts`:
  - `documentSheets(deps, ctx, dossierId): Result<{ fileName; kind; rows: { stt; label; value; status }[] }[]>`;
  - đọc extraction mới nhất của từng chứng từ, đi theo `DOC_CATALOG[kind].fields` (+ items dạng "Dòng n – nhãn", + custom);
  - format: party = "tên / địa chỉ", ngày `YYYY-MM-DD`, số giữ nguyên.
- Create: `apps/web/src/app/api/dossiers/[id]/document-sheets/route.ts` (GET JSON), `apps/web/src/app/api/dossiers/[id]/export.xlsx/route.ts` (exceljs: mỗi chứng từ 1 sheet, tiêu đề `STT | TÊN TRƯỜNG | TRỊ GIÁ`, wrap text, độ rộng cột 6/40/80)
- Create: `apps/web/src/features/dossier-detail/steps/document-sheets.tsx` (Tabs theo chứng từ, `DataTable` 3 cột + `StatusBadge`), nút "Xuất Excel" ở màn OCR
- Modify: `apps/web/src/api/ocr.ts`, `api/http/ocr.ts`, `mocks/api/ocr.ts` (mock: dựng từ seed)
- Test: unit `document-sheets.test.ts` (thứ tự theo danh mục, party ghép, custom cuối); route test xlsx (đọc lại bằng exceljs: sheet name, header, ô B2/C2); e2e mở tab + tải file

- [ ] **Step 1–4:** test trước, implement, PASS.
- [ ] **Step 5:** kiểm trình duyệt (sáng/tối, desktop/mobile). **Checkpoint.**

### Task 9: Màn Review – hiện nguồn gốc chỉ tiêu

**Files:**
- Modify: `packages/contracts/src/dto/declaration.ts` (`DeclarationFieldSchema.provenance?`), `declaration/application/_dto.ts`, `apps/web/src/features/dossier-detail/steps/review-step.tsx` (Tooltip "Nguồn: Arrival Notice · ghi đè theo cấu hình doanh nghiệp")
- Test: dto test; component logic `provenanceLabel(p)` unit test

- [ ] **Steps:** test → implement → PASS → **Checkpoint.**

### Task 10: Eval với lô thật

**Files:**
- Modify: `.gitignore` (+ `evals/private/`); di chuyển `lo mẫu/LÔ FANS25040166` → `evals/private/FANS25040166/`, `lo mẫu/bộ chứng từ` → `evals/private/YZS24120950/`; xóa thư mục gốc `LÔ FANS25040166/` và `lo mẫu/` sau khi chuyển
- Create: `packages/core/src/modules/extraction/eval/excel-expected.ts`:
  - `parseExpectedWorkbook(buf, opts): { sheets: { sheetName; kindGuess; rows: { label; value; match: {key,item}|null }[] }[]; warnings: string[] }`;
  - đoán kind theo tên sheet/tên file (HBL/B/L → BILL_OF_LADING, HAWB/AWB → AIR_WAYBILL, ARRIVAL/thông báo hàng đến → ARRIVAL_NOTICE, INVOICE → INVOICE, CO → CERT_OF_ORIGIN, cước → FREIGHT_INVOICE);
  - cho phép `mapping.json` ghi đè.
- Create: `packages/core/src/modules/extraction/eval/compare.ts` (`compareValue(expected, actual, type)`: chuẩn hóa hoa/thường, khoảng trắng/xuống dòng, số locale "6.247.699" = 6247699, ngày nhiều định dạng "APR.22.2025" = 2025-04-22, địa chỉ token ≥ 0.85; party so với "tên + địa chỉ")
- Modify: `packages/core/scripts/eval.ts` (`--lot <dir>`: chạy ClaudeAiProvider như pipeline, chấm, in bảng, dựng tờ khai bằng `buildDeclaration` với shipment gộp, in chỉ tiêu bắt buộc còn trống; lưu `evals/private/<lô>/result-<tag>.json`)
- Add dependency: `exceljs` vào `@kb/core` devDependencies (script) và `@kb/web` dependencies
- Test: `excel-expected.test.ts` (dựng workbook nhỏ bằng exceljs trong test: 3 dòng, 1 dòng không khớp → warning), `compare.test.ts` (các ca số/ngày/địa chỉ ở trên)

- [ ] **Step 1–4:** test → implement → PASS.
- [ ] **Step 5:** chạy thật `pnpm --filter @kb/core eval --live --lot ../../evals/private/FANS25040166` và YZS24120950 (tốn khoảng $0.3).
  - Ghi % khớp. Chưa đạt 95% thì chỉnh alias/describe trong danh mục và schema (không đổi key), chạy lại.
  - Kết quả cuối ghi vào `docs/BACKEND-TODO.md` K8.

### Task 11: Tài liệu + rà soát cuối

**Files:**
- Modify: `docs/BACKEND-TODO.md` (K3/K8, thêm mục AMA/khai DS container/REP_VNACCS ngoài phạm vi), `docs/PRODUCT.md` §5 (Skill: không còn MAPPING; Mặc định khai báo), `CLAUDE.md` bảng skill dự án nếu đổi, `.claude/skills/mapping-declaration-fields/SKILL.md` (nói về `options`/provenance), `.claude/skills/adding-document-type/SKILL.md` (thêm bước danh mục)
- [ ] `pnpm typecheck && pnpm lint && pnpm test`, e2e liên quan (`skill-config`, `declaration-profile`, `review-edit-reopen`, `customs-and-list`, `agent-declaration`), kiểm trình duyệt các màn mới.
- [ ] Rà soát toàn bộ thay đổi so với spec bằng một reviewer độc lập (superpowers:requesting-code-review).
