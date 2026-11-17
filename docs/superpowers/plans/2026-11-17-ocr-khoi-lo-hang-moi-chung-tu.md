# Khối thông tin lô hàng trên mọi chứng từ – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi loại chứng từ đọc thêm một khối "thông tin lô hàng" (cảng, tàu, container, L/C…) và mã phương thức thanh toán; mọi chứng từ là nguồn ngang nhau của các ô đó, lệch thì cảnh báo; giá trị chảy tới màn OCR và tờ khai EDA/IDA.

**Architecture:** `contracts` thêm `LotSchema` (object chuỗi nullable) gắn vào cả 9 schema dưới key `lot` và `lotContainers`; bản gửi AI đổi `lot` thành mảng `{key, value}` chỉ gồm ô có in, `fromAiOutput` đổi lại thành object. `shipment-spec` sinh thêm nguồn `lot.<key>` cho mọi loại chứng từ (chèn trước nguồn `fallback`). Phương thức thanh toán: AI trả `paymentMethodCode`, đối chiếu với `resolvePayment` (regex) trong một hàm `reconcilePayment`.

**Tech Stack:** TypeScript, Zod, Vitest, Anthropic structured output (`zodOutputFormat`), Next.js (web), pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-11-17-ocr-khoi-lo-hang-moi-chung-tu-design.md`

## Global Constraints

- Shell chạy dưới Rosetta: mọi lệnh pnpm dùng `arch -arm64 pnpm …`. Typecheck: `arch -arm64 pnpm -r --no-bail typecheck` (không `-s`).
- Test: `cd packages/contracts && arch -arm64 pnpm exec vitest run <path>`; `cd packages/core && arch -arm64 pnpm exec vitest run <path>`; `cd apps/web && arch -arm64 pnpm exec vitest run <path>`.
- ≤ 16 tham số union trong schema gửi AI (`ai-schema.test.ts`), cho cả 9 loại, kể cả khi có 20 trường bổ sung.
- Tăng `EXTRACTION_SCHEMA_VERSION` 3 → 4 (`packages/contracts/src/extraction/index.ts:27`) và `PROMPT_VERSION` "3" → "4" (`packages/core/src/modules/extraction/application/ports.ts:186`).
- Ngoại lệ giữ nguyên: nguồn `fallback` của C/O (cảng xếp/dỡ) và FREIGHT_INVOICE (ngày hàng đến) – nguồn `lot.*` phải nằm **trước** chúng trong `sources`.
- Cảng ghi khác chữ giữa hai chứng từ → `CONFLICT` (không so nới lỏng).
- Nhập tay (`manual.ts`) và hóa đơn phát hành (`issued.ts`) vẫn thắng dữ liệu đọc.
- Nhãn mới đủ vi/en/zh (`.claude/rules/ho-tro-3-ngon-ngu.md`).
- Đổi prompt/schema theo skill `.claude/skills/changing-extraction-prompt-or-model/SKILL.md`: eval trước/sau, thử cả file scan.
- Commit: chạy 2 agent review (đọc `.claude/agents/hq-review-backend.md`, `hq-review-frontend.md`), message có khối `Review:`. Không `git add -A`; chỉ add file của task (thư mục untracked `deploy/`, `business/`, `docdungapivnacss/`, `TAI LIEU TICH HOP VNACCS/`, `apps/web/.next-*`, `.claude/worktrees`, `docs/DEPLOY.md` không được commit).

## Review Focus

1. **Một chứng từ cho cùng ô qua cả trường riêng và `lot`** (Invoice có `incoterm` và model cũng ghi `lot.incoterm`): phải đếm là một nguồn, không thành `CROSS_CHECKED` giả, không `CONFLICT` với chính nó → test ở Task 3.
2. **Model trả key lạ hoặc trùng trong mảng `lot`** (`{key:"portOfLoading"}` hai lần, key ngoài enum do fallback model): lấy giá trị đầu, bỏ key lạ, không làm hỏng cả lượt đọc → test ở Task 1.
3. **Kết quả đọc cũ (schema v3, không có `lot`) đọc lại từ DB**: `fillMissingNullable` + merge vẫn chạy, không ném lỗi → test ở Task 1 và Task 3.
4. **Shipment đã lưu thiếu `invoice.lcNo`, `transport.marks`, `containers[].sourceKind`**: `withShipmentDefaults` và mapping không vỡ → test ở Task 2.
5. **Người dùng đã chọn mã thanh toán ở OCR (`paymentTerms = "LC"`) nhưng AI trả mã khác**: lựa chọn người dùng thắng, không cảnh báo lại → test ở Task 4.

---

### Task 1: Khối `lot` trong schema đọc và bản gửi AI

**Files:**
- Create: `packages/contracts/src/extraction/lot.ts`
- Modify: `packages/contracts/src/extraction/index.ts` (gắn `lot`, `lotContainers` vào 9 schema qua `BY_KIND`; version 4)
- Modify: `packages/contracts/src/extraction/ai-schema.ts` (`toAiOutputSchema`, `fromAiOutput`)
- Modify: `packages/contracts/src/extraction/invoice.ts`, `sales-contract.ts`, `index.ts` (OTHER): thêm `paymentMethodCode`
- Modify: `packages/contracts/src/catalog/types.ts:15` (`since: 1 | 2 | 3`), `catalog/documents.ts` (thêm `paymentMethodCode` vào INVOICE, SALES_CONTRACT, OTHER với `since: 3`), `catalog/catalog.test.ts:13` (lọc thêm `lot`, `lotContainers`)
- Test: `packages/contracts/src/extraction/lot.test.ts`, `ai-schema.test.ts`, `extraction.test.ts`

**Interfaces:**
- Produces:
  - `LOT_KEYS: readonly ["portOfLoading","portOfDischarge","vessel","voyage","flightNo","billNo","masterBillNo","departureDate","arrivalDate","packages","packageUnit","grossWeightKg","netWeightKg","volumeCbm","marks","freightTerm","incoterm","incotermPlace","currency","paymentTerms","lcNo","poNo","contractNo","invoiceNo","invoiceDate"]`
  - `type LotKey = (typeof LOT_KEYS)[number]`
  - `LotSchema: z.ZodObject` – mọi key là `nStr(...)` (kể cả số và ngày: chuẩn hóa ở merge), mô tả bắt đầu "Chỉ chép nếu in trên chứng từ".
  - `LotContainersSchema = z.array(z.object({ no: z.string(), sealNo: z.string().nullable(), size: z.string().nullable() }))`
  - `LOT_OMIT: Partial<Record<DocKind, LotKey[]>>` – key bỏ khỏi `lot` của loại vì loại đã có trường cùng nghĩa (vd INVOICE bỏ `invoiceNo, invoiceDate, incoterm, incotermPlace, currency, paymentTerms, poNo, packages, grossWeightKg`; BILL_OF_LADING bỏ `billNo, masterBillNo, vessel, voyage, portOfLoading, portOfDischarge, packages, packageUnit, grossWeightKg`; …). Người làm lập đủ cho 9 loại theo tiêu chí **cùng nghĩa, không chỉ cùng tên** (FREIGHT_INVOICE giữ `lot.invoiceNo` vì `invoiceNo` của nó là số hóa đơn cước).
  - `lotSchemaFor(kind: DocKind): z.ZodObject` = `LotSchema.omit(LOT_OMIT[kind])`
  - `PaymentMethodCodeSchema = z.enum(<mã của PAYMENT_METHODS>).nullable()`
  - Schema của mỗi loại có thêm `lot: lotSchemaFor(kind)` và `lotContainers: LotContainersSchema` (B/L giữ `containers` riêng và **không** có `lotContainers`).

- [ ] **Step 1: Đối chiếu danh mục mã thanh toán.** Code có 17 mã (`packages/contracts/src/declaration/code-tables.ts:47`), wiki `~/hq-wiki/docs/wiki/domains/to-khai-domain-danh-muc-ma-vnaccs.md:45` ghi 15 (29.DM_GANCODE). Tìm bảng gốc trong `TAI LIEU TICH HOP VNACCS/` hoặc `docs/vnaccs-api`. Khớp 17 → dùng `PAYMENT_METHODS`. Lệch → dừng, báo người dùng hai danh sách, chờ trả lời.

- [ ] **Step 2: Viết test thất bại** `lot.test.ts`:

```ts
it("gửi AI: lot là mảng {key,value} với key thuộc enum của loại", () => {
  const ai = toAiOutputSchema(extractionSchemaFor("INVOICE")) as z.ZodObject;
  const el = (ai.shape.lot as z.ZodArray<z.ZodObject>).element;
  expect((el.shape.key as z.ZodEnum).options).toContain("portOfLoading");
  expect((el.shape.key as z.ZodEnum).options).not.toContain("invoiceNo");
});
it("nhận từ AI: mảng → object, ô không có = null, key trùng lấy giá trị đầu, key lạ bỏ", () => {
  const out = fromAiOutput(extractionSchemaFor("INVOICE"), { ...invoiceFixture, lot: [
    { key: "portOfLoading", value: "BA RIA - VUNG TAU (CM-TV), VIETNAM" }, { key: "portOfLoading", value: "X" }, { key: "bogus", value: "Y" }, { key: "lcNo", value: "" } ] }) as any;
  expect(out.lot.portOfLoading).toBe("BA RIA - VUNG TAU (CM-TV), VIETNAM");
  expect(out.lot.lcNo).toBeNull();
  expect(out.lot.vessel).toBeNull();
  expect("bogus" in out.lot).toBe(false);
  expect(extractionSchemaFor("INVOICE").safeParse(out).success).toBe(true);
});
it("kết quả cũ v3 (không có lot) vẫn parse sau fillMissingNullable", () => {
  const v3 = fillMissingNullable(extractionSchemaFor("INVOICE"), invoiceFixture);
  expect(extractionSchemaFor("INVOICE").safeParse(v3).success).toBe(true);
});
```

`ai-schema.test.ts`: thêm vòng cho cả 9 loại `expect(countUnions(jsonOf(toAiOutputSchema(withCustomFields(extractionSchemaFor(kind), custom20))))).toBeLessThanOrEqual(16)`.

- [ ] **Step 3: Chạy, thấy fail.** `cd packages/contracts && arch -arm64 pnpm exec vitest run src/extraction` → FAIL (`lot` undefined).

- [ ] **Step 4: Cài đặt.** `lot.ts` như Interfaces. `toAiOutputSchema`: gặp key `lot` là `ZodObject` → `z.array(z.object({ key: z.enum(Object.keys(shape)), value: z.string() })).describe("Chỉ liệt kê thông tin lô hàng CÓ IN trên chứng từ; không in thì mảng rỗng")`. `fromAiOutput`: trước `coerceNumbers`, nếu schema gốc có `lot` và value `lot` là mảng → object đủ key của `lotSchemaFor` (null mặc định), lấy phần tử đầu theo key, bỏ key lạ, `""` → null. `lotContainers` để `fillMissingNullable` không cần (mảng bắt buộc): khi thiếu → `[]` (thêm nhánh cho `ZodArray` bắt buộc trong `fillMissingNullable`). `fillMissingNullable` với `lot` thiếu → object toàn null (nhánh object bắt buộc đã có).

- [ ] **Step 5: Chạy lại.** `cd packages/contracts && arch -arm64 pnpm exec vitest run` → PASS toàn gói (gồm `catalog.test.ts`, `skill-keys.test.ts`).

- [ ] **Step 6: Commit** `feat(contracts): khối thông tin lô hàng (lot) trên mọi loại chứng từ + mã PTTT do AI chọn`.

---

### Task 2: Shipment có ô mới

**Files:**
- Modify: `packages/contracts/src/shipment.ts` (schema, `emptyShipment`, `withShipmentDefaults`)
- Test: `packages/contracts/src/shipment.test.ts` (tạo nếu chưa có)

**Interfaces:**
- Produces trong `Shipment`: `invoice.lcNo`, `invoice.contractNo`, `invoice.paymentMethodCode` (`Sourced<string>`, khai báo `.optional()` như `freightTerm`); `transport.volumeCbm` (dec, optional), `transport.marks` (str, optional); phần tử `transport.containers[]` thêm `sourceKind: DocKindSchema.optional()`.

- [ ] **Step 1: Test thất bại:** `withShipmentDefaults(shipmentV3Fixture)` → `invoice.lcNo.value === null`, `transport.marks.value === null`, container cũ không có `sourceKind` vẫn qua `ShipmentSchema.parse`.
- [ ] **Step 2: Chạy, thấy fail.**
- [ ] **Step 3: Cài đặt** thêm trường vào schema, `emptyShipment()` (giá trị `empty()`), `withShipmentDefaults` đã `fill` invoice/transport nên chỉ cần `emptyShipment` có key.
- [ ] **Step 4: Chạy** `cd packages/contracts && arch -arm64 pnpm exec vitest run` → PASS. `arch -arm64 pnpm -r --no-bail typecheck` → không lỗi mới.
- [ ] **Step 5: Commit** `feat(contracts): Shipment thêm L/C, hợp đồng, mã PTTT, thể tích, ký mã hiệu, nguồn container`.

---

### Task 3: Gộp – mọi chứng từ là nguồn của ô lô hàng

**Files:**
- Modify: `packages/core/src/modules/extraction/domain/shipment-spec.ts` (sinh nguồn `lot`, ô mới, normalizer cảng/tàu)
- Modify: `packages/core/src/modules/extraction/domain/merge.ts` (`mergeField` khử trùng theo chứng từ, quy tắc unsure; container từ mọi chứng từ)
- Modify: `packages/core/src/modules/extraction/domain/manual.ts:28` (`/marks` → `/transport/marks`)
- Test: `packages/core/src/modules/extraction/domain/__tests__/merge.test.ts`, `manual.test.ts`

**Interfaces:**
- Consumes: `LOT_KEYS`, `LOT_OMIT`, `LotKey` (Task 1); ô Shipment mới (Task 2).
- Produces: `LOT_PATH: Record<LotKey, string>` (key → path Shipment, vd `portOfLoading → /transport/portOfLoading`, `lcNo → /invoice/lcNo`, `invoiceNo → /invoice/no`, `invoiceDate → /invoice/date`, `contractNo → /invoice/contractNo`); `withLotSources(fields: FieldSpec[]): FieldSpec[]`; `SHIPMENT_FIELDS` = `withLotSources(<bảng tay hiện có + dòng mới cho lcNo, contractNo, volumeCbm, marks, paymentMethodCode>)`.

- [ ] **Step 1: Test thất bại** trong `merge.test.ts` (fixture `FileExtraction` dựng tay, không gọi AI):

```ts
it("XK chỉ có invoice: cảng, tàu, chuyến, L/C, container lấy từ lot", () => {
  const s = mergeExtractions([invoiceWithLot({ portOfLoading: "BA RIA - VUNG TAU (CM-TV), VIETNAM", portOfDischarge: "NAPOLI PORT, ITALY", vessel: "COSCO SHIPPING PLANET", voyage: "049W", lcNo: "S700542640040" }, [{ no: "FBIU5659719", sealNo: "34337288", size: null }])], { version: 1 });
  expect(s.transport.portOfLoading.value).toBe("BA RIA - VUNG TAU (CM-TV), VIETNAM");
  expect(s.transport.portOfLoading.status).toBe("SINGLE_SOURCE");
  expect(s.transport.voyage.value).toBe("049W");
  expect(s.invoice.lcNo!.value).toBe("S700542640040");
  expect(s.transport.containers).toEqual([{ no: "FBIU5659719", sealNo: "34337288", size: null, sourceKind: "INVOICE" }]);
});
it("invoice + B/L khác chữ cảng → CONFLICT kèm ghi chú, giá trị mặc định là B/L", () => {
  const s = mergeExtractions([bl({ portOfLoading: "VUNG TAU" }), invoiceWithLot({ portOfLoading: "BA RIA - VUNG TAU (CM-TV), VIETNAM" })], { version: 1 });
  expect(s.transport.portOfLoading.value).toBe("VUNG TAU");
  expect(s.transport.portOfLoading.status).toBe("CONFLICT");
});
it("invoice + B/L cùng cảng → CROSS_CHECKED", …);
it("C/O vẫn chỉ dự phòng: B/L CAT LAI, C/O HO CHI MINH → SINGLE_SOURCE CAT LAI", …);
it("cùng một chứng từ cho ô qua trường riêng và lot → một nguồn, không CROSS_CHECKED", …); // Review Focus 1
it("file scan có regions mà ô lot không có vùng → MODEL_UNSURE", …);
it("container trùng số giữa invoice và B/L → một phần tử, seal của nguồn đứng trước", …);
it("kết quả v3 không có lot → merge như cũ", …); // Review Focus 3
```

`manual.test.ts`: nhập tay `marks: "VL-01"` → `s.transport.marks.value === "VL-01"`.

- [ ] **Step 2: Chạy, thấy fail.** `cd packages/core && arch -arm64 pnpm exec vitest run src/modules/extraction/domain/__tests__/merge.test.ts src/modules/extraction/domain/__tests__/manual.test.ts`.

- [ ] **Step 3: Cài đặt.**
  - `withLotSources`: với mỗi spec có path trong `LOT_PATH`, chèn trước nguồn `fallback` đầu tiên các nguồn `{ kind, get: at("lot." + key, d => d.lot?.[key]), regionKey: "lot." + key }` cho mọi `kind` mà `key ∉ LOT_OMIT[kind]`, theo thứ tự cố định `["BILL_OF_LADING","AIR_WAYBILL","ARRIVAL_NOTICE","INVOICE","PACKING_LIST","SALES_CONTRACT","FREIGHT_INVOICE","CERT_OF_ORIGIN","OTHER"]`.
  - Normalizer cảng và tàu: chữ hoa + gộp khoảng trắng (đổi cho `/transport/portOfLoading`, `/transport/portOfDischarge`, `/transport/vessel`).
  - `mergeField`: bỏ ứng viên khi cùng `documentId` đã có ứng viên cho ô này; nguồn `lot.*` có `f.regions` (file scan) mà thiếu `f.regions[regionKey]` → `unsure: true`.
  - Container: gom `bl.data.containers` rồi `lotContainers` của mọi chứng từ theo thứ tự file; khóa = `no` chữ hoa bỏ khoảng trắng; ghi `sourceKind`.
  - Dòng mới trong bảng tay: `/invoice/lcNo` (ident), `/invoice/contractNo` (ident, nguồn SALES_CONTRACT `contractNo` nếu schema có), `/transport/volumeCbm` (num, PACKING_LIST `volumeCbm`), `/transport/marks` (str, PACKING_LIST `marks`), `/invoice/paymentMethodCode` (upper, INVOICE/SALES_CONTRACT/OTHER `paymentMethodCode`). Nhãn vi theo màn OCR hiện có; nhóm `TRANSPORT` / `COMMERCIAL`.

- [ ] **Step 4: Chạy lại** cả thư mục extraction: `cd packages/core && arch -arm64 pnpm exec vitest run src/modules/extraction` → PASS (gồm `document-sheet.test.ts`, `review-learning.test.ts`: ghi ngược giá trị sửa vào `lot.<key>` qua `rawPath`).

- [ ] **Step 5: Commit** `feat(extraction): mọi chứng từ là nguồn của ô lô hàng; container từ mọi chứng từ`.

---

### Task 4: Phương thức thanh toán – AI chọn mã, regex kiểm chéo

**Files:**
- Modify: `packages/contracts/src/declaration/payment-resolve.ts` (thêm `reconcilePayment`; đổi `paymentNeedsChoice`)
- Modify: `packages/core/src/modules/extraction/domain/ocr-exit.ts`
- Modify: `packages/core/src/modules/declaration/domain/mapping/shared.ts:58` (`paymentMethod`)
- Modify: `apps/web/src/features/dossier-detail/ocr/field-row.tsx:27-44`
- Test: `packages/contracts/src/declaration/payment-resolve.test.ts`, `packages/core/src/modules/extraction/domain/__tests__/ocr-exit.test.ts`, `packages/core/src/modules/declaration/domain/__tests__/mapping.test.ts`

**Interfaces:**
- Consumes: `Shipment.invoice.paymentMethodCode`, `invoice.lcNo` (Task 2, 3).
- Produces:
  - `reconcilePayment(raw: string | null, aiCode: string | null, lcNo: string | null): ResolvedPayment | null`
  - `paymentNeedsChoice(raw: string | null | undefined, aiCode?: string | null, lcNo?: string | null): boolean` = kết quả `reconcilePayment` có `suspect`.

- [ ] **Step 1: Test thất bại** `payment-resolve.test.ts`:

```ts
expect(reconcilePayment("T/T 30 days", "KC", null)).toMatchObject({ code: "KC" });                 // khớp → không suspect
expect(reconcilePayment("T/T 30 days", "KC", null)?.suspect).toBeUndefined();
expect(reconcilePayment("Irrevocable documentary credit at sight", "LC", null)).toMatchObject({ code: "LC", suspect: true }); // regex KC-suspect, AI LC → cảnh báo, mặc định mã AI
expect(reconcilePayment(null, null, "S700542640040")).toMatchObject({ code: "LC", suspect: true });  // chỉ có số L/C
expect(reconcilePayment("L/C at sight", "TTR", null)).toMatchObject({ code: "LC", suspect: true });  // lệch → mặc định regex khi regex không suspect
expect(reconcilePayment("LC", "TTR", null)).toEqual(expect.objectContaining({ code: "LC" }));       // người dùng đã chọn mã (parsePaymentChoice) → thắng, không suspect (Review Focus 5)
expect(reconcilePayment("LC", "TTR", null)?.suspect).toBeUndefined();
expect(reconcilePayment(null, null, null)).toBeNull();
```

Ghi chú (`note`) khi lệch: `Chứng từ ghi “<raw>”: hệ thống đọc ra <mã regex>, AI nhận là <mã AI> – chọn mã đúng`.

- [ ] **Step 2: Chạy, thấy fail.**
- [ ] **Step 3: Cài đặt** `reconcilePayment` theo bảng: lựa chọn người dùng (`parsePaymentChoice(raw)`) → trả ngay; regex và AI cùng mã → nhận; chỉ một bên có mã (kể cả tín hiệu LC từ `lcNo`) hoặc khác mã → `suspect: true`, mã mặc định = regex nếu regex không suspect, ngược lại mã AI, ngược lại `LC` khi có `lcNo`. `paymentMethod` (mapping) và `ocrExitBlockers` gọi `reconcilePayment(paymentTerms, paymentMethodCode, lcNo)`. `field-row.tsx`: `isUnknownPayment`/`payCode` dùng cùng hàm, truyền `paymentMethodCode` và `lcNo` từ dữ liệu trang (người làm lấy từ `ExtractedField` của cùng hồ sơ hoặc thêm vào props; giữ nguyên ô chọn mã hiện có).
- [ ] **Step 4: Chạy** test 3 gói (contracts, core `ocr-exit.test.ts` + `mapping.test.ts`, web `field-row` nếu có test) → PASS.
- [ ] **Step 5: Commit** `feat(payment): AI chọn mã PTTT, đối chiếu với nhận dạng từ khóa; lệch → cần xem`.

---

### Task 5: Prompt và vùng trên ảnh

**Files:**
- Modify: `packages/core/src/modules/extraction/infrastructure/claude-ai-provider.ts` (`SYSTEM_PROMPT` thêm quy tắc 6; `REGIONS_INSTRUCTION` cho key `lot.<key>`; `toRegions` nhận key có dấu chấm `lot.*`)
- Modify: `packages/core/src/modules/extraction/application/ports.ts:186` (`PROMPT_VERSION = "4"`)
- Test: test hiện có của `claude-ai-provider` (`toRegions`), thêm ca `lot.portOfLoading`

**Interfaces:**
- Consumes: hình dạng `lot` mảng (Task 1).

- [ ] **Step 1: Test thất bại:** `toRegions([{ key: "lot.portOfLoading", page: 1, x0: 100, y0: 200, x1: 400, y1: 220 }], 1)` → có key `"lot.portOfLoading"`.
- [ ] **Step 2: Chạy, thấy fail** (hoặc pass nếu `toRegions` đã giữ key tùy ý – khi đó giữ test làm chốt).
- [ ] **Step 3: Cài đặt.** Quy tắc 6 của `SYSTEM_PROMPT`: "Thông tin lô hàng (lot): chỉ liệt kê ô CÓ IN trên chứng từ. Không suy cảng từ địa chỉ, không suy tàu từ tên hãng, không lấy ngày hóa đơn làm ngày hàng đi. Tên tàu và số chuyến in liền (COSCO SHIPPING PLANET 049W) → vessel = tên tàu, voyage = số chuyến." Quy tắc 3 sửa: "Trường không có → null (riêng `lot`: không liệt kê)". `REGIONS_INSTRUCTION`: thêm "thông tin lô hàng: key = lot.<tên ô> (vd lot.portOfLoading)". `paymentMethodCode` mô tả trong schema (Task 1) liệt kê nghĩa từng mã và quy tắc T/T → KC, TTR chỉ là bồi hoàn L/C, documentary credit/số L/C → LC, đặt cọc + T/T → KC, không có → null.
- [ ] **Step 4: Chạy** `cd packages/core && arch -arm64 pnpm exec vitest run src/modules/extraction` → PASS.
- [ ] **Step 5: Commit** `feat(extraction): prompt v4 – chỉ chép thông tin lô hàng có in, tách tàu/chuyến`.

---

### Task 6: Tờ khai lấy container theo nguồn thật

**Files:**
- Modify: `packages/core/src/modules/declaration/domain/mapping/eda.ts:138-141` (`SO_CONT`), `mapping/ida.ts:215-218` (`SL_CONT` và ô số container IDA nếu có)
- Test: `packages/core/src/modules/declaration/domain/__tests__/mapping.test.ts`

**Interfaces:**
- Consumes: `containers[].sourceKind` (Task 2, 3).

- [ ] **Step 1: Test thất bại:** Shipment chỉ có invoice với container `sourceKind: "INVOICE"` → EDA `SO_CONT = { value: "FBIU5659719", source: "INVOICE" }`; `PTVC_TEN` có giá trị "COSCO SHIPPING PLANET"; PT_TT = LC khi chỉ có `lcNo` (suspect). Container không có `sourceKind` (Shipment cũ) → `source: "BILL_OF_LADING"` như cũ.
- [ ] **Step 2: Chạy, thấy fail.**
- [ ] **Step 3: Cài đặt:** `source` = `containers[0].sourceKind ?? "BILL_OF_LADING"`. Ghi chú khi trống giữ nguyên.
- [ ] **Step 4: Chạy** `cd packages/core && arch -arm64 pnpm exec vitest run src/modules/declaration` → PASS.
- [ ] **Step 5: Commit** `feat(declaration): số container EDA/IDA ghi đúng chứng từ nguồn`.

---

### Task 7: Màn OCR hiện container và ô mới

**Files:**
- Modify: `packages/core/src/modules/extraction/domain/project-fields.ts` (phát trường chỉ đọc `containers` cho từng chứng từ có container: giá trị `FBIU5659719 / 34337288`, nhóm `TRANSPORT`)
- Modify: nhãn web cho key mới (`lc_no`, `contract_no`, `volume_cbm`, `marks`, `payment_method_code`, `containers`) trong file messages của OCR (vi/en/zh)
- Test: `project-fields` test (tạo nếu chưa có), `apps/web/.../ocr` test i18n hiện có

**Interfaces:**
- Consumes: Shipment sau Task 3.

- [ ] **Step 1: Test thất bại:** `projectFields(s)` với container từ invoice → có `{ key: "containers", documentId: <invoice>, value: "FBIU5659719 / 34337288", group: "TRANSPORT" }`.
- [ ] **Step 2: Chạy, thấy fail.**
- [ ] **Step 3: Cài đặt.** Trường `containers` không cho sửa trên màn OCR (sửa qua thẻ nhập tay); người làm kiểm `field-row.tsx` cách tắt sửa cho một key (thêm cờ `readOnly` vào `ProjectedField` nếu chưa có). `payment_method_code` không hiện thành dòng riêng (thông tin hiện qua ghi chú của dòng thanh toán, Task 4). Kiểm `manual-shipment-form.ts:39`: form nhập tay đã khởi tạo từ Shipment đã gộp (gồm container) – nếu đúng thì không sửa; nếu form chỉ đọc dữ liệu nhập tay thì thêm placeholder là giá trị đọc được.
- [ ] **Step 4: Chạy** test core + web liên quan → PASS. Mở mock dev server `:3100`, hồ sơ XK có invoice → tab Invoice có nhóm Vận tải với cảng, tàu, chuyến, container.
- [ ] **Step 5: Commit** `feat(ocr): hiện container và ô lô hàng mới trên tab chứng từ`.

---

### Task 8: Đo trước khi bật

**Files:**
- Create: `evals/golden/<tên lô XK>/` (PDF + `expected.json` người dùng duyệt)
- Modify: `packages/core/src/modules/extraction/eval/lot-run.ts:56` (đọc `direction` từ `expected.json`, mặc định "NK")

- [ ] **Step 1: Xin người dùng bộ mẫu**: invoice XK VL0611826 và ≥ 9 chứng từ thật khác (có XK, NK, có loại không in cảng/tàu, có ít nhất 1 file scan). Người dùng duyệt `expected.json`. Chưa có mẫu → dừng ở bước này, không bật production.
- [ ] **Step 2: Baseline** trên code trước Task 1: `git stash`/checkout `5b028c5` → `arch -arm64 pnpm eval --live --tag before`.
- [ ] **Step 3: Sau** `arch -arm64 pnpm eval --live --tag after`; `arch -arm64 pnpm eval:diff before after`.
- [ ] **Step 4: Tiêu chí qua:** 0 ô `lot` bịa (giá trị không in trên giấy) trên toàn bộ mẫu; không trường BLOCKER nào giảm; thời gian trung vị/chứng từ tăng ≤ 2 s; file scan không lỗi "compiled grammar is too large". Ghi bảng số vào message commit/PR.
- [ ] **Step 5: Commit** `test(eval): lô XK một invoice + đo khối lô hàng`.

---

### Task 9: Tài liệu và quy ước

**Files:**
- Create: `docs/adr/0018-ocr-shipment-block-every-document.md`
- Modify: `docs/adr/0003-*.md` (hệ quả: nguồn `lot` ngang hàng; `fallback` chỉ còn C/O và hóa đơn cước)
- Modify: `.claude/skills/changing-extraction-prompt-or-model/SKILL.md`, `.claude/skills/adding-document-type/SKILL.md` (loại mới tự có `lot`; thêm vào `LOT_OMIT` khi có trường cùng nghĩa)
- Modify: `docs/BACKEND-TODO.md` (backlog: nhãn–giá trị tự do + "Gán vào ô"; trường bổ sung lên tờ khai; so cảng bằng mã; prompt caching)
- Commit cả bản thiết kế `docs/superpowers/specs/2026-11-17-ocr-khoi-lo-hang-moi-chung-tu-design.md` và kế hoạch này.

- [ ] **Step 1: Viết ADR 0018** (bối cảnh: ca invoice XK; quyết định: khối `lot`, mọi chứng từ ngang nhau, ngoại lệ C/O + hóa đơn cước, AI chọn mã PTTT + kiểm chéo; hệ quả: token +, hồ sơ cũ đọc lại).
- [ ] **Step 2: Cập nhật skill, ADR 0003, BACKEND-TODO** như trên.
- [ ] **Step 3: Chạy toàn bộ** `arch -arm64 pnpm -r --no-bail typecheck` và test 3 gói → PASS.
- [ ] **Step 4: Review**: 2 agent general-purpose đọc `.claude/agents/hq-review-backend.md` và `hq-review-frontend.md`, soát diff cả nhánh. Sửa FAIL.
- [ ] **Step 5: Commit** `docs: ADR 0018 khối lô hàng trên mọi chứng từ` với khối `Review:`. Push/deploy chỉ khi người dùng bảo.
