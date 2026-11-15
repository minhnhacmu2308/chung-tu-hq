# Thuế và thu khác theo loại thuế – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 dòng "Thuế và thu khác" (1.94–1.96) của dòng hàng IDA nhập theo loại thuế (CBPG / PBĐX / TTĐB / BVMT / GTGT), lọc mã theo chữ cái đầu, tự dồn ô khi in và khi truyền FPT; tự điền GTGT theo bảng mới kèm cảnh báo "cần kiểm tra"; AMA và lỗi Hải quan theo ô dùng cùng quy tắc.

**Architecture:** Một module thuần `packages/contracts/src/declaration-layout/other-tax.ts` là nguồn sự thật (nhóm theo chữ cái, gộp tự điền/người khai, chuẩn hóa dữ liệu cũ, dồn ô, kiểm tra). Lưu trữ giữ khóa `HANG.<id>.HAG_TX{g}/TR{g}/TG{g}` với `g` = dòng theo loại; mọi nơi đọc (form, bản in, payload FPT, AMA, mock) đi qua module này. Không migration DB.

**Tech Stack:** TypeScript, Zod (`@kb/contracts`), Vitest, Next.js + `@kb/ui`, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-11-16-thue-thu-khac-theo-loai-design.md`

## Global Constraints

- Thứ tự nhóm: 1 CBPG `B`/`C`/`G` → 2 PBĐX `P` → 3 TTĐB `T` → 4 BVMT `M` → 5 GTGT `V`. Mã miễn/giảm (A520) cùng chữ cái đầu với mã thuế cùng dòng.
- Dồn ô: bỏ nhóm trống, nhóm sau lên trước; ô cuối không gửi.
- Bảng tự điền GTGT đúng spec 4.10: mã `V…` HSCodePro → giữ; `VK…` → TX=`V`, TR=`VK…` + cảnh báo; không mã: 10% → `VB901` + cảnh báo, 0% → `V` + cảnh báo, 8%/5%/không có → không điền (báo thiếu). Không còn sinh `VB903`/`VB905`/`VB900`.
- Mã người khai nhập thắng mã tự điền cùng nhóm (không báo trùng).
- Bất biến `/CLAUDE.md`: sửa ô → `field_audit` (đường lưu hiện có, không thêm đường ghi mới); 3 ngôn ngữ vi/en/zh cho mọi chữ mới (`defineMessages`); chỉ `@kb/ui` + token; dữ liệu ngoài parse Zod.
- Lý do chặn/cảnh báo từ backend: mã ổn định (`reasonError` + `REASON_TEXT_VI` + `lib/reason-codes.messages.ts`), không gửi câu đã dịch.
- Không sửa tay `docs/vnaccs-api/` (sinh bằng script).
- **Commit:** không commit từng task. Một lần commit cuối (Task 11) sau khi chạy 2 agent review theo `.claude/rules/review-truoc-commit.md`.

## Review Focus

1. Dòng cũ: người khai nhập `VB901` ở `HAG_TX1` + tự điền `HAG_TX5` → gửi một mã GTGT ở ô 1, không lỗi trùng (Task 1 test `merge_user_wins_over_auto`).
2. Mã viết thường / có khoảng trắng (`" vb901 "`) → nhận đúng nhóm GTGT, gửi dạng chuẩn hóa `VB901` (Task 1 test `group_of_trims_and_uppercases`).
3. Mã không thuộc nhóm nào (vd `X12`) hoặc ô chỉ có TR/TG → không bị rơi mất khi dồn; báo lỗi chặn và chặn truyền (Task 1 `issues_unknown_prefix`, Task 3 `blocks_unknown_prefix`).
4. "Áp dụng cho các dòng khác" từ bản in đã dồn → áp theo dòng theo loại, không theo số ô in (Task 7 test `apply_to_other_lines_by_group`).
5. Lỗi Hải quan `HAG_TX2` trên dòng TTĐB + GTGT → tô dòng GTGT, không tô cả 5 ô (Task 8).

---

### Task 1: Module thuần `other-tax.ts`

**Files:**
- Create: `packages/contracts/src/declaration-layout/other-tax.ts`
- Create: `packages/contracts/src/declaration-layout/other-tax.test.ts`
- Modify: `packages/contracts/src/index.ts` (hoặc barrel của `declaration-layout`) – export public API

**Interfaces:**
- Produces:
  ```ts
  export type OtherTaxGroupKey = "CBPG" | "PBDX" | "TTDB" | "BVMT" | "GTGT";
  export const OTHER_TAX_GROUPS: readonly { group: 1|2|3|4|5; key: OtherTaxGroupKey; taxPrefixes: readonly string[] }[];
  export function otherTaxGroupOf(code: string | null | undefined): 1|2|3|4|5 | null; // trim + toUpperCase, theo ký tự đầu
  export const otherTaxKeys: (n: number) => { tx: string; tr: string; tg: string }; // HAG_TX{n}/HAG_TR{n}/HAG_TG{n}
  /** Gộp tự điền + người khai: {...auto, ...own}; nếu own có mã thuế nhóm g ở dòng khác → bỏ bộ ba tự điền của dòng g. */
  export function mergeOtherTaxes(auto: Values, own: Values): Values;
  /** Chuẩn hóa: bộ ba có TX được chuyển về dòng otherTaxGroupOf(TX) (mã viết hoa, bỏ khoảng trắng); không đổi khóa khác. Xung đột (2 bộ cùng nhóm) → bộ ở đúng dòng giữ chỗ, bộ kia giữ dòng cũ. */
  export function normalizeOtherTaxes(values: Values): Values;
  /** Dồn ô từ giá trị đã chuẩn hóa: trả values mới (HAG_TX/TR/TG 1..5 thay bằng bản dồn, ô trống xóa khỏi object) + slotToGroup[k-1] = g. */
  export function compactOtherTaxes(values: Values): { values: Values; slotToGroup: number[] };
  export type OtherTaxIssueReason = "OTHER_TAX_WRONG_GROUP" | "OTHER_TAX_DUPLICATE_GROUP" | "OTHER_TAX_EXEMPT_MISMATCH" | "OTHER_TAX_EXEMPT_WITHOUT_CODE";
  export type OtherTaxIssue = { group: number; key: string; reason: OtherTaxIssueReason };
  export function otherTaxIssues(values: Values): OtherTaxIssue[]; // nhận giá trị đã normalize
  /** Các lệnh sửa để lưu dữ liệu người khai cũ về dạng chuẩn hóa: xóa khóa lệch (value "") + ghi khóa đúng dòng. Đã chuẩn → []. */
  export function normalizationEdits(own: Values): { key: string; value: string }[];
  ```
  `Values = Record<string, string>`.

- [ ] **Step 1: Viết test thất bại** trong `other-tax.test.ts`:
  - `group_of_trims_and_uppercases`: `otherTaxGroupOf(" vb901 ")` = 5; `"V"` = 5; `"G0123"` = 1; `"B001"` = 1; `"C"` = 1; `"P"` = 2; `"T"` = 3; `"MB010"` = 4; `"X12"`, `""`, `null` = null.
  - `merge_user_wins_over_auto`: `mergeOtherTaxes({HAG_TX5:"VB901"}, {HAG_TX1:"VB205"})` → `{HAG_TX1:"VB205"}` (không có `HAG_TX5`); `mergeOtherTaxes({HAG_TX5:"V",HAG_TR5:"VK010"}, {HAG_TX3:"TB020"})` giữ cả hai.
  - `normalize_moves_legacy_slot`: `{HAG_TX1:"VB901",HAG_TR1:"VK110",HAG_TG1:"5"}` → `{HAG_TX5:"VB901",HAG_TR5:"VK110",HAG_TG5:"5"}`; giữ khóa khác (`HAG_CMD`).
  - `normalize_conflict_keeps_both`: `{HAG_TX5:"VB901",HAG_TX2:"VB205"}` → `HAG_TX5` giữ `VB901`, `HAG_TX2` giữ `VB205`.
  - `compact_variants`: chỉ GTGT `{HAG_TX5:"VB901"}` → `values` có `HAG_TX1:"VB901"`, không có `HAG_TX2..5`, `slotToGroup` = `[5]`; TTĐB+GTGT `{HAG_TX3:"TB020",HAG_TR3:"TK060",HAG_TX5:"V",HAG_TR5:"VK110"}` → `HAG_TX1:"TB020",HAG_TR1:"TK060",HAG_TX2:"V",HAG_TR2:"VK110"`, `slotToGroup` = `[3,5]`; đủ 5 nhóm → giữ nguyên, `[1,2,3,4,5]`; rỗng → `[]`.
  - `compact_keeps_orphan_exempt`: `{HAG_TR2:"PK"}` (không TX) → vẫn xuất hiện trong bản dồn ở vị trí theo dòng 2 (không bị rơi).
  - `normalization_edits`: `normalizationEdits({HAG_TX1:"VB901"})` → `[{key:"HAG_TX1",value:""},{key:"HAG_TX5",value:"VB901"}]`; `normalizationEdits({HAG_TX5:"VB901"})` → `[]`.
  - `issues_*`: `{HAG_TX2:"X12"}` → `OTHER_TAX_WRONG_GROUP` (group 2, key `HAG_TX2`); `{HAG_TX5:"VB901",HAG_TX2:"VB205"}` → `OTHER_TAX_DUPLICATE_GROUP` tại `HAG_TX2`; `{HAG_TX5:"VB901",HAG_TR5:"TK060"}` → `OTHER_TAX_EXEMPT_MISMATCH` tại `HAG_TR5`; `{HAG_TR4:"MK010"}` → `OTHER_TAX_EXEMPT_WITHOUT_CODE`; `{HAG_TX1:"G0123",HAG_TR1:"GK"}` → `[]`.

- [ ] **Step 2: Chạy, xác nhận thất bại:** `pnpm --filter @kb/contracts test other-tax` → FAIL (module không tồn tại).

- [ ] **Step 3: Hiện thực** các hàm ở trên trong `other-tax.ts`. Dồn ô: duyệt g = 1..5, dòng có bất kỳ TX/TR/TG khác rỗng thì lấy làm ô kế tiếp.

- [ ] **Step 4: Chạy lại:** `pnpm --filter @kb/contracts test other-tax` → PASS.

### Task 2: Tự điền GTGT theo bảng mới + cảnh báo "cần kiểm tra"

**Files:**
- Modify: `packages/contracts/src/declaration-layout/item-fields.ts:100-164` (`vatCode`, `itemDefaults`, `ItemDefaultsInput`)
- Modify: `packages/core/src/modules/declaration/domain/hscodepro-map.ts:~139-148` (fallback API cũ không còn gán cứng `vatCode: "VB901"` – để `vatCode: null`, giữ `vatRate` và ghi chú)
- Modify: `packages/core/src/modules/declaration/application/customs-bridge.ts:47` – truyền thêm `vatCertain`/`needsReview` vào payload item
- Modify: `apps/web/src/mocks/api/declaration.ts:260-278` (`mockVatCode`: 8% không còn `VB245`; theo cùng hàm contracts)
- Test: `packages/contracts/src/declaration-layout/item-fields.test.ts`, `apps/web/src/features/declaration-form/dossier-adapter.test.ts:102-103`, test hscodepro-map hiện có trong `packages/core/src/modules/declaration/domain/`

**Interfaces:**
- Consumes: không.
- Produces:
  ```ts
  export type OtherTaxCheckReason = "VAT_FROM_EXEMPT_CODE" | "VAT_FROM_RATE" | "VAT_UNCERTAIN";
  export type VatAutoFill = { tx?: string; tr?: string; check?: OtherTaxCheckReason };
  export function vatAutoFill(rate: string | null | undefined, stored: string | null | undefined, certain?: boolean | null): VatAutoFill;
  // ItemDefaultsInput thêm: vatCertain?: boolean | null
  export function itemAutoChecks(kind: Kind, it: ItemDefaultsInput): { key: string; reason: OtherTaxCheckReason }[]; // IDA: [{key:"HAG_TX5", reason}] khi vatAutoFill có check
  ```
  `vatCode` bị thay bằng `vatAutoFill`; `itemDefaults` ghi `HAG_TX5` = `tx`, `HAG_TR5` = `tr` khi có.

- [ ] **Step 1: Sửa/viết test** (`item-fields.test.ts`, test `vat_auto_fill_table`):
  - `vatAutoFill("10", "VB205", true)` → `{tx:"VB205"}`; `vatAutoFill("10","VB901",false)` → `{tx:"VB901",check:"VAT_UNCERTAIN"}`
  - `vatAutoFill(null,"VK010")` → `{tx:"V",tr:"VK010",check:"VAT_FROM_EXEMPT_CODE"}`
  - `vatAutoFill("10",null)` → `{tx:"VB901",check:"VAT_FROM_RATE"}`; `vatAutoFill("0",null)` → `{tx:"V",check:"VAT_FROM_RATE"}`
  - `vatAutoFill("8",null)`, `vatAutoFill("5",null)`, `vatAutoFill(null,null)` → `{}`
  - `itemDefaults("IDA", {..., vatRate:"5", vatCode:null})` không có `HAG_TX5`; với `vatCode:"VK010"` có `HAG_TX5:"V"`, `HAG_TR5:"VK010"`.
  - Thay các kỳ vọng cũ `VB903` (8%) / `VB901` mặc định trong `item-fields.test.ts:43-51` và `dossier-adapter.test.ts:102-103` theo bảng mới.
- [ ] **Step 2:** `pnpm --filter @kb/contracts test item-fields` → FAIL.
- [ ] **Step 3: Hiện thực** `vatAutoFill`, `itemAutoChecks`, cập nhật `itemDefaults`, fallback HSCodePro, `mockVatCode`, customs-bridge.
- [ ] **Step 4:** `pnpm --filter @kb/contracts test && pnpm --filter @kb/core test hscodepro && pnpm --filter @kb/web test dossier-adapter` → PASS.

### Task 3: Payload FPT – gộp, chuẩn hóa, dồn ô, chặn lỗi; schema bắt buộc `HAG_TX1`

**Files:**
- Modify: `packages/core/src/modules/integration/domain/declaration-to-fpt.ts:126-165` (`items()`)
- Modify: `packages/contracts/src/fpt/ida.ts:198,238` – `HAG_TX1` required `true`, `HAG_TX5` required `false`; comment: "Đặc tả FPT ghi TX5 bắt buộc; thực tế VNACCS dồn ô từ TX1 (xác nhận nghiệp vụ 2026-11-16)".
- Test: `packages/core/src/modules/integration/domain/__tests__/customs-domain.test.ts` (sửa `:349-355`, thêm mới)

**Interfaces:**
- Consumes: `mergeOtherTaxes`, `normalizeOtherTaxes`, `compactOtherTaxes`, `otherTaxIssues` (Task 1); `itemDefaults` (Task 2).
- Produces: `buildFptRequest` gửi `HAG_TX/TR/TG{k}` đã dồn; `blockers` có dòng `Dòng {lineNo}: …` cho mỗi `OtherTaxIssue` và khi dòng GTGT trống.

- [ ] **Step 1: Test** (`customs-domain.test.ts`):
  - `sends_vat_in_slot_1`: dòng chỉ có `vatCode:"VB901"` → `VN_IDA_HANG[0].HAG_TX1 === "VB901"`, `HAG_TX5` undefined, request qua Zod (không issue).
  - `compacts_ttdb_and_vat`: override `HANG.li1.HAG_TX3 = "TB020"` + auto VAT → `HAG_TX1 = "TB020"`, `HAG_TX2 = "VB901"`.
  - `legacy_override_slot5`: override `HANG.li1.HAG_TX5 = "VB205"` (thay test cũ :349-355) → `HAG_TX1 = "VB205"`.
  - `blocks_unknown_prefix`: override `HANG.li1.HAG_TX2 = "X12"` → `blockers` chứa `"Dòng 1"` và `"HAG_TX"`.
  - `blocks_missing_vat`: dòng `vatRate:"5"`, không mã, không override → `blockers` có câu thiếu mã GTGT.
- [ ] **Step 2:** `pnpm --filter @kb/core test customs-domain` → FAIL.
- [ ] **Step 3: Hiện thực**: trong `items()` thay `{...auto, ...own}` bằng `compactOtherTaxes(normalizeOtherTaxes(mergeOtherTaxes(auto, own))).values` trước vòng `set`; thêm blockers. Đổi `required` ở `fpt/ida.ts`.
- [ ] **Step 4:** `pnpm --filter @kb/core test && pnpm --filter @kb/contracts test` → PASS.

### Task 4: Ô bắt buộc / tiến độ / giá trị form dùng cùng quy tắc

**Files:**
- Modify: `packages/contracts/src/declaration-layout/required.ts:77` (`itemGaps`), `:159-175` (`itemFormValues`)
- Modify: `apps/web/src/features/declaration-form/form-state.ts:18-38` (`units`, `itemProgress`)
- Modify: `packages/contracts/src/declaration/catalog-ida-items.ts:93-104` – legalNote 1.94/1.95 theo quy tắc nhóm + dồn ô
- Test: `packages/contracts/src/declaration-layout/required.test.ts`, `apps/web/src/features/declaration-form/form-state.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces: `itemFormValues` trả giá trị **theo dòng loại** (merge + normalize, chưa dồn); `requiredGaps` có gap `{ key: "HAG_TX5", line, no: "1.94" }` khi dòng GTGT trống; `itemProgress` đếm mọi dòng của repeat có `fixedRows` (Task 6) – trước Task 6 đếm theo 5 dòng của khối `thu-khac`.

- [ ] **Step 1: Test**: `required.test.ts` `vat_row_required` (dòng không VAT → gap `HAG_TX5`; có `VB901` ở override `HAG_TX1` → không gap vì normalize chuyển về dòng 5); `form-state.test.ts` `progress_counts_vat_row` (VAT chỉ ở dòng 5 → tính là đã điền).
- [ ] **Step 2:** `pnpm --filter @kb/contracts test required && pnpm --filter @kb/web test form-state` → FAIL.
- [ ] **Step 3: Hiện thực.**
- [ ] **Step 4:** chạy lại → PASS.

### Task 5: `@kb/ui` – trạng thái ô giấy "check" (cần kiểm tra)

Theo skill `adding-ui-component`.

**Files:**
- Modify: `packages/ui/src/components/paper.tsx:10` – `PaperFieldState` thêm `"check"` (viền/nền token cảnh báo `warning`, icon tam giác, khác `error` đỏ và `missing`)
- Modify: `packages/ui/src/components/paper.test.tsx` (+ axe), playground, `docs/DESIGN-SYSTEM.md` (một dòng)

**Interfaces:** Produces `PaperFieldState = "none" | "error" | "missing" | "estimate" | "edited" | "check"`.

- [ ] **Step 1: Test** `renders_check_state`: `<PaperField state="check">` có thuộc tính/nhãn trợ năng cảnh báo (theo cách `missing` đang làm), axe không lỗi.
- [ ] **Step 2:** `pnpm --filter @kb/ui test paper` → FAIL.
- [ ] **Step 3: Hiện thực** chỉ bằng token có sẵn.
- [ ] **Step 4:** `pnpm --filter @kb/ui test && pnpm lint` → PASS.

### Task 6: Form – 5 dòng có nhãn loại thuế, lọc mã theo chữ cái, cảnh báo

**Files:**
- Modify: `packages/contracts/src/declaration-layout/types.ts:52` – `LayoutRepeat` thêm `rowKeys?: readonly string[]` (khóa nhóm, nhãn do app dịch) và `fixedRows?: boolean`
- Modify: `packages/contracts/src/declaration-layout/ida.ts:41-47` – repeat "thu-khac": label trung tính "Khoản thuế và thu khác", `rowKeys: OTHER_TAX_GROUPS.map(g => g.key)`, `fixedRows: true`
- Modify: `apps/web/src/features/declaration-form/field-repeat.tsx:71-162`, `display.ts:43-49` (`visibleRows`: `fixedRows` + sửa → luôn `count`; chỉ xem → dòng có giá trị, nhãn = nhãn nhóm)
- Modify: `apps/web/src/features/declaration-form/code-scope.ts:12-32` – thêm `rowValues?: Values` vào chữ ký; `case "OTHER_TAX"`: lọc theo `taxPrefixes` của nhóm dòng; `case "A520"` khi field là `HAG_TR{n}`: lọc theo chữ cái đầu của `rowValues[HAG_TX{n}]`, chưa có → các chữ của nhóm; `optional: false`
- Modify: `apps/web/src/features/declaration-form/field.tsx:121,129`, `code-input.tsx:85` – truyền `rowValues`
- Create: `apps/web/src/features/declaration-form/other-tax.messages.ts` – nhãn 5 nhóm (`CBPG`: "CBPG (tự vệ, chống trợ cấp, chống bán phá giá)", `PBDX`: "Chống phân biệt đối xử", `TTDB`: "Tiêu thụ đặc biệt", `BVMT`: "Bảo vệ môi trường", `GTGT`: "GTGT"), nhãn phạm vi lọc, placeholder – vi/en/zh
- Modify: `apps/web/src/lib/reason-codes.ts` + `reason-codes.messages.ts` (+ `REASON_TEXT_VI` trong `@kb/contracts` reason-codes) – 4 mã `OTHER_TAX_*` của Task 1 và 3 mã `VAT_*` của Task 2
- Test: `code-scope.test.ts`, `display.test.ts`, test component `field-repeat` (axe), `apps/web/src/lib/i18n-catalogs.test.ts` (tự chạy)

**Interfaces:**
- Consumes: `OTHER_TAX_GROUPS`, `otherTaxIssues`, `itemAutoChecks`, `itemFormValues` (Task 1, 2, 4).
- Produces: `codeScope(id, fieldKey, kind, values, locale, rowValues?)`.

- [ ] **Step 1: Test**: `code-scope.test.ts` `other_tax_scope_by_row` (`HAG_TX3` → chỉ mã `T…`; `HAG_TX1` → `B/C/G`; `HAG_TR5` với `rowValues.HAG_TX5 = "VB901"` → chỉ mã A520 bắt đầu `V`; `optional === false`); `display.test.ts` `fixed_rows_show_all_in_edit`; component test: 5 nhãn nhóm hiển thị, không có nút "Thêm dòng", ô GTGT tự điền có dấu cảnh báo khi `itemAutoChecks` trả lý do, axe sạch.
- [ ] **Step 2:** `pnpm --filter @kb/web test code-scope display field-repeat` → FAIL.
- [ ] **Step 3: Hiện thực.** Lỗi `otherTaxIssues` hiện dưới dòng tương ứng qua `reasonText`. Khi lưu một ô của khối thuế khác (`use-save-edits.ts`), gửi kèm `normalizationEdits(own)` của dòng hàng đó trong cùng lần lưu (mỗi lệnh là một sửa ô → `field_audit` như thường) – tránh mã cũ ở khóa lệch thành "trùng loại" sau khi người khai nhập lại. Test `save_normalizes_legacy_slot` trong `use-save-edits.test.tsx`.
- [ ] **Step 4:** `pnpm --filter @kb/web test && pnpm typecheck && pnpm lint` → PASS.

### Task 7: Bản in – in theo ô đã dồn, panel mở theo dòng loại, trạng thái "check"

**Files:**
- Modify: `apps/web/src/features/declaration-print/print-state.ts` – `printData` (:234-254) áp `compactOtherTaxes` cho giá trị dòng hàng, giữ `slotToGroup` theo dòng; `fieldLocator` (:44) / panel: ô in `HAG_TX{k}` → khóa lưu `HAG_TX{slotToGroup[k-1]}` (ô trống sau cùng → dòng nhóm trống đầu tiên); `cellState` (:133) thêm `check` (ưu tiên: error > missing > check > estimate > edited); `printAttention` đếm `check`; `taxCodeKeys`/`applyToOtherLines` (:456-487) áp theo khóa dòng loại
- Modify: `apps/web/src/features/declaration-print/field-edit-panel.tsx:138-151` – lưu kèm `normalizationEdits` (Task 1) như form; tiêu đề nhóm = nhãn loại thuế (Task 6 messages), truyền `rowValues` cho lọc mã
- Modify: `apps/web/src/features/declaration-print/print-sheets.tsx:81-84` nếu cần map nhãn
- Test: `apps/web/src/features/declaration-print/print-state.test.ts` (sửa `:88`, `:473-475`, `:484`), `packages/contracts/src/print-layout/print-layout.test.ts:28,73` nếu đổi

**Interfaces:**
- Consumes: Task 1, 2, 5, 6.
- Produces: `printSlotTarget(values: Values, slot: number): { key: string }` (export từ `print-state.ts`) – khóa lưu cho ô in.

- [ ] **Step 1: Test**: `print_compacts_other_tax` (GTGT ở dòng 5 → in ô 1); `panel_opens_group_row` (`printSlotTarget({HAG_TX3:"TB020",HAG_TX5:"VB901"}, 2)` → `HAG_TX5`); `apply_to_other_lines_by_group` (áp từ ô in 1 của dòng có TTĐB → ghi `HANG.<id khác>.HAG_TX3`); `check_state_for_inferred_vat`.
- [ ] **Step 2:** `pnpm --filter @kb/web test print-state` → FAIL.
- [ ] **Step 3: Hiện thực.**
- [ ] **Step 4:** `pnpm --filter @kb/web test` → PASS.

### Task 8: Lỗi Hải quan theo ô → đúng dòng loại thuế

Quyết định (spec 6b để builder chọn): dựng `slotToGroup` từ **giá trị tờ khai hiện tại** (`compactOtherTaxes` của dòng). Lý do: tờ khai bị khóa từ lúc gửi tới khi mở lại, lỗi hiển thị thuộc lần gửi gần nhất; đưa snapshot `customs_outbox.payload.sent` tới giao diện tốn thêm contract + route + mock. Hạn chế đã biết: người khai sửa sau khi mở lại thì lỗi cũ có thể chỉ lệch dòng – chấp nhận.

**Files:**
- Modify: `packages/contracts/src/declaration/fpt-index.ts:16-26` – thêm `fptIndexSlot(indexCode): number | null` (số cuối của `HAG_TX/TR/TG{n}`), không đổi `fieldDefForFptIndex`
- Modify: `apps/web/src/features/dossier-detail/steps/customs-errors.ts:16-20` – `FieldError` thêm `slot?: number`
- Modify: `apps/web/src/features/declaration-print/print-state.ts:181-219` (`slotsPerError`, `attentionCells`) – lỗi 1.94/1.95/1.96 có `slot` → chỉ ô in đó; không có `slot` → cả khối như cũ
- Modify: form (`field-repeat.tsx`) – lỗi có `slot` → dòng `slotToGroup[slot-1]`
- Test: `fpt-index.test.ts` (nếu có, hoặc tạo), `print-state.test.ts` `customs_error_slot_2_hits_vat_row`, `customs-errors` test

- [ ] **Step 1: Test**: `fptIndexSlot("HAG_TX2")` = 2, `fptIndexSlot("HAG_CMD")` = null; dòng TTĐB + GTGT, lỗi `{no:"1.94", line:1, slot:2}` → chỉ ô in `HAG_TX2` được tô, panel mở `HAG_TX5`.
- [ ] **Step 2:** chạy → FAIL. **Step 3:** hiện thực. **Step 4:** `pnpm --filter @kb/contracts test && pnpm --filter @kb/web test` → PASS.

### Task 9: AMA – lấy đủ 5 nhóm từ tờ khai gốc

**Files:**
- Modify: `packages/core/src/modules/integration/domain/post-amendment.ts:30-48` và mock `apps/web/src/mocks/post-amendment-sim.ts:27-36` – `otherTaxes` = các dòng loại có mã (theo `normalizeOtherTaxes(mergeOtherTaxes(auto, own))`, thứ tự nhóm); GTGT giữ cách tính rate/base/amount hiện có; nhóm khác `{code, rate: null, base: null, amount: null}`
- Modify: `packages/contracts/src/post-amendment/rules.ts` – kiểu `otherTaxes` cho phép rate/base/amount null; `recalcAmaLine`/`amaLineDelta` bỏ qua nhóm không phải `V` (chênh lệch 0); thêm cờ ghi chú
- Modify: `apps/web/src/features/post-amendment/line-compare.tsx:148-149` + messages – ghi chú "Chưa tính chênh lệch cho loại thuế này" (vi/en/zh) cạnh ô mã không phải GTGT; ô mã `HAG_MK/AK{n}` lọc theo chữ cái nhóm (dùng `codeScope` Task 6)
- Test: `rules.test.ts`, `post-amendment.test.ts`, `customs-use-cases.test.ts:949`

- [ ] **Step 1: Test** `ama_carries_all_groups`: tờ khai gốc TTĐB `TB020` + GTGT `VB901` → `HAG_MK1 = "TB020"`, `HAG_MK2 = "VB901"`, chênh lệch dòng chỉ từ GTGT; test cũ VAT-only vẫn `HAG_MK1`.
- [ ] **Step 2:** `pnpm --filter @kb/contracts test post-amendment && pnpm --filter @kb/core test post-amendment customs-use-cases` → FAIL.
- [ ] **Step 3: Hiện thực.** **Step 4:** chạy lại → PASS.

### Task 10: Mock + tài liệu

**Files:**
- Modify: `apps/web/src/mocks/api/declaration.ts:386-393` (lưu ô dòng hàng đi qua cùng kiểm tra), `apps/web/src/mocks/api/customs.ts:173` (snapshot gửi dùng payload đã dồn), `apps/web/src/mocks/required-gaps.ts:10`
- Modify docs: `docs/integrations/hscodepro-api-v1.md:361` (`vnaccs_code` → dòng GTGT, dồn ô; VK → TX `V` + TR), `docs/QUY-TRINH-NGHIEP-VU.md:288,584`, `docs/RA-SOAT-CHI-TIEU-TO-KHAI.md:153-154,229,309,384`, `apps/web/CLAUDE.md` (một dòng: thuế và thu khác theo loại – `other-tax.ts`)

- [ ] **Step 1:** test mock hiện có (`apps/web/src/mocks/**/*.test.ts`) thêm `mock_send_compacts_other_tax` (gửi mock dòng chỉ GTGT → snapshot `HAG_TX1`).
- [ ] **Step 2:** FAIL → hiện thực → `pnpm --filter @kb/web test mocks` PASS.

### Task 11: Kiểm tra toàn bộ, trình duyệt, review, commit

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm test` → tất cả xanh (ghi số test).
- [ ] **Step 2: Trình duyệt** (web http + worker; đăng nhập `chau.le@anphat-demo.vn`): mở tờ khai IDA có dòng bạch tuộc (HS 0307.52.00) – form: 5 dòng nhãn nhóm, lọc mã đúng chữ, GTGT tự điền có cảnh báo khi suy ra; bản in: GTGT ở ô 1; bấm ô 1 mở dòng GTGT. Sáng/tối, 1366/390, vi/en/zh. Xem trước body FPT (`fpt-preview`) có `HAG_TX1`.
- [ ] **Step 3:** Chạy song song 2 agent `hq-review-backend` + `hq-review-frontend`; FAIL → sửa, chạy lại.
- [ ] **Step 4: Commit** (gồm spec + plan + code), mô tả có khối `Review:` 2 dòng của agent, rồi `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
