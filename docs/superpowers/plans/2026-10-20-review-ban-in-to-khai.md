# Bước 5 Review – tờ khai dạng bản in VNACCS: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay tab "Tờ khai đầy đủ" + "Hải quan trả về" ở bước 5 bằng một tab "Tờ khai" hiển thị bản in VNACCS, bấm ô → panel sửa, khối "Chỉ tiêu khác", in bằng CSS.

**Architecture:** Bố cục bản in là dữ liệu thuần ở `@kb/contracts/print-layout`, mỗi ô trỏ tới khóa ô đã có của `declaration-layout`. Khung trang giấy và ô giấy là component `@kb/ui` (kèm quy tắc in). App (`features/declaration-print`) chỉ ghép: lấy giá trị/khóa/lưu qua `dossier-adapter` + `customs-adapter` sẵn có, logic trạng thái ô là hàm thuần có test.

**Tech Stack:** TypeScript, Next.js 16 (webpack), React 19, TanStack Query, Tailwind 4 (token `@kb/ui`), Vitest (+ axe ở `@kb/ui`), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-10-20-review-ban-in-to-khai-design.md` · Mẫu: `../tailieuchitieukhaibao/MAUIN_TOKHAI_NHAPKHAU.pdf`, `../tailieuchitieukhaibao/MAUIN_TOKHAI_XUATKHAU.pdf`

## Global Constraints

- Bất biến `CLAUDE.md`: mã định danh là `string`; tiền `Decimal`/chuỗi số, không `number` cho phép tính tiền; dữ liệu ngoài parse Zod; sửa trường → API sửa chỉ tiêu (ghi `field_audit`).
- Giao diện chỉ dùng component `@kb/ui` + utility token: không mã màu, không màu Tailwind mặc định, không `dark:`, không giá trị tùy ý trong app (`.claude/rules/dung-component-chung.md`). Thiếu → thêm vào `@kb/ui` theo skill `adding-ui-component`.
- Module chỉ import qua `index.ts`; app chỉ import `@kb/ui` từ gốc package.
- Nhãn trên trang giấy giữ **đúng chữ trên mẫu PDF**; số chỉ tiêu không in trên trang (tooltip + panel).
- Tiêu đề / watermark theo giai đoạn (spec §3.1): `NOT_SENT`/`REJECTED`/không có → "– BẢN NHÁP" + "BẢN NHÁP – CHƯA KHAI HẢI QUAN"; `PRE_DECLARED`/`RECALLED` → "– KHAI TẠM" + "KHAI TẠM – CHƯA ĐĂNG KÝ"; `DECLARED`/`AMEND_*` → "(thông báo kết quả phân luồng)"; `CLEARED`/`POST_*` → "(thông quan)".
- Dòng hàng mỗi trang in: IDA 1, EDA 2.
- Cờ dự phòng: `NEXT_PUBLIC_REVIEW_LEGACY_FORM=1` → bước 5 như hiện nay; mặc định tắt.
- Trước khi báo xong: `pnpm typecheck && pnpm lint && pnpm test` xanh; mở trình duyệt thật sáng + tối, desktop + mobile, Ctrl+P.

## Review Focus

1. Panel có thay đổi chưa lưu mà bấm ô khác / đóng panel → phải hỏi Lưu / Bỏ, không mất dữ liệu im lặng (Task 7).
2. Hồ sơ 0 dòng hàng → không có trang dòng hàng, tổng số trang = số trang chung; hồ sơ nhiều dòng (≥ 50) vẫn đánh số trang đúng (Task 5).
3. Nhóm lặp điền một phần (vận đơn 1/5, giấy phép 2/5) → ô trống in như mẫu (trống / "- / /"), không hiện `undefined`/`null` (Task 5, Task 6).
4. VIEWER hoặc tờ khai `LOCKED` → panel chỉ đọc, không có nút Lưu; ô vẫn bấm xem được (Task 7).
5. Số Hải quan và số ước tính khác định dạng ("886187500" vs "886.187.500", "25780.00" vs "25780") → không bị coi là khác nhau (Task 5).

---

### Task 1: `print-layout` – kiểu, tiện ích, bố cục IDA

**Files:**
- Create: `packages/contracts/src/print-layout/types.ts`, `expand.ts`, `ida-print.ts`, `index.ts`
- Create: `packages/contracts/src/print-layout/print-layout.test.ts`
- Modify: `packages/contracts/src/index.ts` (export `./print-layout/index.js`)

**Interfaces:**
- Produces:
  ```ts
  export type PrintCell = { key: string; label: string; span?: 1 | 2 | 3 | 4 | 6 | 12; align?: "end" };
  export type PrintRepeatRow = { kind: "repeat"; count: number; cells: PrintCell[] }; // key chứa {n} / {nn} như LayoutRepeat
  export type PrintRow = PrintCell[] | PrintRepeatRow;
  export type PrintRegion = { id: string; title?: string; rows: PrintRow[] };
  export type PrintPage = { id: string; regions: (PrintRegion | [PrintRegion, PrintRegion])[] }; // tuple = hai vùng cạnh nhau như mẫu
  export type PrintLayout = { kind: "IDA" | "EDA"; header: PrintRow[]; pages: PrintPage[]; item: PrintRegion[]; itemsPerPage: 1 | 2 };
  export function printLayoutFor(kind: "IDA" | "EDA"): PrintLayout;
  export function expandPrintRow(row: PrintRow): PrintCell[][];          // repeat → các dòng đã thay {n}/{nn}
  export function printKeys(p: PrintLayout): { decl: string[]; item: string[] }; // header + pages / item, đã expand, theo thứ tự in
  export function otherFieldKeys(kind: "IDA" | "EDA"): { decl: string[]; item: string[] };
  ```
  `otherFieldKeys`: khóa có `origin !== "CUSTOMS"` trong `layoutFor(kind).declarant` / `.item.declarant` (dùng `itemFields` của `declaration-layout`) không có trong `printKeys`, giữ thứ tự bố cục.

- [ ] **Step 1: Viết test thất bại** `print-layout.test.ts` (chỉ `describe.each` cho IDA ở task này; Task 2 thêm EDA vào cùng mảng):
  - `"mọi khóa trên bản in có trong bố cục declaration-layout"`: `printKeys(p).decl ∪ .item` ⊆ `layoutFields(layoutFor(kind)).map(f => f.key)`.
  - `"không trùng khóa trên bản in"`: không phần tử lặp trong `decl`, không lặp trong `item`.
  - `"ô chính của mẫu có mặt"`: IDA `decl` chứa `TK_ICN`, `TK_B12`, `TK_B13`, `TK_A86`, `THUE_B02`, `THUE_KG1`…`THUE_KG6`, `CTHQ_D01`…`CTHQ_D10`; `item` chứa `HAG_CMD`, `HAG_CMN`, `HAG_QN1`, `HAG_QN2`, `HAG_BPR`, `HAG_UPR`, `HAG_ORS`, `HAG_TX1`…`HAG_TX5`.
  - `"chỉ tiêu khác đúng danh sách đã duyệt"`: `otherFieldKeys("IDA")` `toEqual(OTHER_IDA)` – hằng `OTHER_IDA` trong test, lập khi dựng bố cục, người review đối chiếu với PDF.
  - `"expandPrintRow thay {n}/{nn}"`: repeat count 3 với `VD_BL{n}` → `[["VD_BL1"],["VD_BL2"],["VD_BL3"]]`; `CTHQ_D{nn}` → `CTHQ_D01`.
- [ ] **Step 2: Chạy, thấy FAIL** – `pnpm --filter @kb/contracts exec vitest run src/print-layout` → lỗi import `./index.js`.
- [ ] **Step 3: Viết `types.ts`, `expand.ts` (`expandPrintRow`, `printKeys`, `otherFieldKeys`), `index.ts`.** `{n}`/`{nn}` thay giống `expandRepeat` của `declaration-layout/expand.ts` (tái dùng `pad2` bằng cách export nó từ đó).
- [ ] **Step 4: Viết `ida-print.ts`** theo `MAUIN_TOKHAI_NHAPKHAU.pdf`: `header` = 6 dòng đầu trang (số tờ khai, đầu tiên/nhánh, TN-TX, mã phân loại kiểm tra, mã loại hình, mã HS đại diện, cơ quan HQ, bộ phận xử lý, ngày đăng ký, ngày thay đổi, thời hạn tái nhập/tái xuất); `pages[0]` = người nhập khẩu, ủy thác NK, người xuất khẩu, ủy thác XK, đại lý, [vận đơn | địa điểm lưu kho…], hóa đơn & trị giá, giấy phép, khai trị giá, [sắc thuế | tổng tiền thuế…]; `pages[1]` = đính kèm, ghi chú, số quản lý, chỉ thị HQ (repeat 10), mục thông báo HQ + trung chuyển; `item` = khối dòng hàng (thuế NK + repeat 5 "Thuế và thu khác"); `itemsPerPage: 1`. Khóa tra theo nhãn trong `ida.ts`; ô của mẫu không có khóa nào → bỏ (ghi vào comment đầu file).
- [ ] **Step 5: Chạy lại test, PASS; lập `OTHER_IDA`** từ kết quả thật, rà từng khóa với PDF (khóa có chỗ trên mẫu mà nằm trong danh sách → thêm vào bố cục in).
- [ ] **Step 6: `pnpm --filter @kb/contracts typecheck`** → không lỗi.
- [ ] **Step 7: Commit** – `git commit -m "feat(contracts): print-layout – bố cục bản in VNACCS tờ khai nhập (IDA)"`

### Task 2: Bố cục in EDA + tiêu đề theo giai đoạn

**Files:**
- Create: `packages/contracts/src/print-layout/eda-print.ts`, `title.ts`
- Modify: `packages/contracts/src/print-layout/index.ts`, `print-layout.test.ts`

**Interfaces:**
- Consumes: kiểu và tiện ích Task 1.
- Produces: `export function printTitle(kind: "IDA" | "EDA", stage: CustomsStage | undefined): { title: string; watermark: string | null }` (`CustomsStage` từ `customs-flow.ts`).

- [ ] **Step 1: Thêm test thất bại:**
  - Đưa EDA vào `describe.each` của Task 1; ô chính EDA: `decl` chứa `TK_ECN`, `TK_K69`, `TK_K70`, `TK_ETA`, `TK_TCO`, `TK_RC1`, `TK_RD1`, `CON_VC1`…`CON_VC5`, `CON_VN`, `CON_VA`, `CON_C01`…`CON_C50`; `item` chứa `HAG_CMD`, `HAG_CMN`, `HAG_QN1`, `HAG_QN2`, `HAG_BPR`, `HAG_OL1`…`HAG_OL5`; `OTHER_EDA`.
  - `printTitle`: bảng 8 ca – `("IDA", undefined)` → `{ title: "Tờ khai hàng hóa nhập khẩu – BẢN NHÁP", watermark: "BẢN NHÁP – CHƯA KHAI HẢI QUAN" }`; `("IDA","REJECTED")` giống trên; `("EDA","PRE_DECLARED")` → `{ title: "Tờ khai hàng hóa xuất khẩu – KHAI TẠM", watermark: "KHAI TẠM – CHƯA ĐĂNG KÝ" }`; `("IDA","RECALLED")` khai tạm; `("IDA","DECLARED")` → `{ title: "Tờ khai hàng hóa nhập khẩu (thông báo kết quả phân luồng)", watermark: null }`; `("IDA","AMEND_PRE_DECLARED")` phân luồng; `("EDA","CLEARED")` → `{ title: "Tờ khai hàng hóa xuất khẩu (thông quan)", watermark: null }`; `("IDA","POST_EDITING")` thông quan.
- [ ] **Step 2: Chạy, FAIL** – `pnpm --filter @kb/contracts exec vitest run src/print-layout`.
- [ ] **Step 3: Viết `eda-print.ts`** theo `MAUIN_TOKHAI_XUATKHAU.pdf`: tr.1 (người XK, ủy thác XK, người NK, đại lý, vận đơn & địa điểm, [giấy phép XK | hóa đơn & trị giá], nộp thuế, đính kèm, ghi chú, số quản lý, mục thông báo HQ), tr.2 (Vanning: 5 mã địa điểm + tên + địa chỉ, 50 số container, chỉ thị HQ repeat 10), `item` (thuế XK, lệ phí, bảo hiểm, mã văn bản pháp luật khác 1–5), `itemsPerPage: 2`.
- [ ] **Step 4: Viết `title.ts`.**
- [ ] **Step 5: Chạy test PASS, lập `OTHER_EDA` như Task 1 Step 5.**
- [ ] **Step 6: Commit** – `feat(contracts): print-layout EDA và tiêu đề bản in theo giai đoạn`

### Task 3: `@kb/ui` – `PaperStack`, `PaperSheet`, `PaperField` + token giấy

**Files:**
- Create: `packages/ui/src/components/paper.tsx`, `packages/ui/src/components/paper.test.tsx`
- Modify: `packages/ui/src/styles/tokens.css` (token `--kb-paper`, `--kb-paper-fg`, `--kb-paper-rule` dạng `light-dark()`), `packages/ui/src/styles/index.css` (`@theme inline` → `bg-paper`, `text-paper-fg`, `border-paper-rule`; khối `@media print`), `packages/ui/src/styles/tokens.test.ts` (tương phản `paper-fg`/`paper` ≥ 4.5), `packages/ui/src/index.ts`, `packages/ui/playground/showcase.tsx`, `docs/DESIGN-SYSTEM.md` (bảng component)

**Interfaces:**
- Produces:
  ```ts
  export type PaperFieldState = "none" | "error" | "missing" | "estimate" | "edited";
  export function PaperStack(props: { children: ReactNode; className?: string }): JSX.Element; // data-print-root
  export function PaperSheet(props: { page: number; total: number; header?: ReactNode; watermark?: string | null; id?: string; children: ReactNode; labels?: Partial<{ page: string }> }): JSX.Element;
  export function PaperField(props: { label: ReactNode; value: ReactNode; state?: PaperFieldState; compareTo?: string | null; selected?: boolean; onSelect?: () => void; ariaLabel: string; span?: 1 | 2 | 3 | 4 | 6 | 12; labels?: Partial<{ missing: string; estimate: string; edited: string; error: string }> }): JSX.Element;
  ```
  Nhãn mặc định vi: `page: "Trang {n} / {total}"`, `missing: "Còn thiếu"`, `estimate: "ƯT"`, `edited: "Đã sửa"`, `error: "Có lỗi"`; có bản `en`.

- [ ] **Step 1: Viết test thất bại** `paper.test.tsx` (theo `docs/TESTING.md` §3):
  - `PaperSheet` có `role="region"` + tên "Trang 2 / 4"; có `watermark` → chữ watermark hiện, `aria-hidden="true"`; `watermark={null}` → không có.
  - `PaperField` không `onSelect` → không có nút; có `onSelect` → là `button`, `aria-label` đúng, bấm chuột và Enter/Space đều gọi `onSelect`.
  - Trạng thái: `"missing"` → chữ "Còn thiếu"; `"estimate"` → "ƯT"; `"error"` → biểu tượng + tên trợ năng "Có lỗi"; `"edited"` → có dấu "Đã sửa" (sr-only); `compareTo="886.187.500"` → hiện số đó trong `<s>`.
  - `selected` → `aria-pressed="true"`.
  - axe không vi phạm cho mỗi trạng thái.
- [ ] **Step 2: Chạy, FAIL** – `pnpm --filter @kb/ui exec vitest run src/components/paper.test.tsx`.
- [ ] **Step 3: Viết token + `paper.tsx`.** Giá trị `font-mono`; lưới 12 cột cho `span`; màu trạng thái dùng token có sẵn (`bg-danger-subtle`, `border-warning` nét đứt, `bg-primary` cho chấm đã sửa). Quy tắc in trong `index.css`:
  ```css
  @media print {
    body * { visibility: hidden; }
    [data-print-root], [data-print-root] * { visibility: visible; }
    [data-print-root] { position: absolute; inset: 0; }
    [data-paper-mark] { display: none; }           /* chấm, nhãn ƯT, Còn thiếu, số so sánh */
    [data-paper-sheet] { break-after: page; box-shadow: none; border: 0; }
  }
  ```
  `PaperField` khi in: bỏ nền/viền trạng thái (`print:` utility), chữ đen nền trắng.
- [ ] **Step 4: Chạy test PASS**; `pnpm --filter @kb/ui typecheck && pnpm lint`.
- [ ] **Step 5: Playground**: thêm mục "Trang giấy" (1 trang 2 vùng, đủ 5 trạng thái, có watermark); `pnpm --filter @kb/ui test:visual` (cập nhật ảnh, ghi lý do). Mở `pnpm ui:playground`, xem sáng + tối + mobile + EN.
- [ ] **Step 6: Commit** – `feat(ui): PaperStack, PaperSheet, PaperField – trang giấy tờ khai, trạng thái ô, quy tắc in`

### Task 4: Tách logic khóa ô và lưu chỉ tiêu dùng chung (không đổi hành vi)

**Files:**
- Modify: `apps/web/src/features/declaration-form/dossier-adapter.ts`, `dossier-adapter.test.ts`, `dossier-declaration-form.tsx`
- Create: `apps/web/src/features/declaration-form/use-save-edits.ts`

**Interfaces:**
- Produces:
  ```ts
  // dossier-adapter.ts
  export const ITEM_LOCK: Record<"DOC" | "HS" | "DERIVED", AmendLock>;   // chuyển từ dossier-declaration-form.tsx
  export function declarationLockOf(kind: Kind, mode: DeclarationEditMode, original: FormValues, editable: Map<string, string>): (key: string) => AmendLock | null;
  // use-save-edits.ts
  export function useSaveDeclarationEdits(dossierId: string): UseMutationResult<void, Error, { code: string; value: string }[]>;
  ```
  Thân hai hàm = đúng logic `lockOf` và `save` hiện tại của `DossierDeclarationForm`.

- [ ] **Step 1: Test thất bại** trong `dossier-adapter.test.ts`: `declarationLockOf("IDA","LOCKED",…)("TK_IMC")` khác `null`; với `mode "FULL"` và `editable` chứa `TK_IMC` → `null`; khóa dòng hàng lớp `DOC` (lấy một khóa có `itemFieldClass === "DOC"`) → `ITEM_LOCK.DOC`.
- [ ] **Step 2: Chạy, FAIL** – `pnpm --filter @kb/web exec vitest run src/features/declaration-form/dossier-adapter.test.ts`.
- [ ] **Step 3: Chuyển code**, `DossierDeclarationForm` gọi hai hàm mới.
- [ ] **Step 4: PASS**; `pnpm --filter @kb/web test && pnpm --filter @kb/web typecheck`.
- [ ] **Step 5: Commit** – `refactor(to-khai): tách khóa ô và lưu chỉ tiêu để bản in dùng chung`

### Task 5: Logic thuần của bản in

**Files:**
- Create: `apps/web/src/features/declaration-print/print-state.ts`, `print-state.test.ts`

**Interfaces:**
- Consumes: `printLayoutFor`, `printKeys`, `expandPrintRow` (Task 1–2); `FormValues`, `missingRequired`, `conditionContext` (`form-state.ts`); `FieldError` (`dossier-detail/steps/customs-errors.ts`); `formKeysOf`, `layoutFor`, `itemFields`.
- Produces:
  ```ts
  export type FieldSpot = { field: LayoutField; group: LayoutField[]; parentNo?: string; parentCondition?: ConditionId; blockCondition?: ConditionId; scope: "decl" | "item" };
  export function fieldLocator(kind: Kind): Map<string, FieldSpot>;   // group = các ô cùng LayoutGroup / cùng dòng LayoutRepeat (hoặc [field])
  export type Estimate = { customsValueVnd: string; currency: string; exchangeRate: string; taxVnd?: string; lines: number };
  export function estimateValues(kind: Kind, customs: FormValues, est: Estimate): { values: FormValues; estimated: Set<string> };
  export function sameNumber(a: string, b: string): boolean;
  export function editedKeys(kind: Kind, fields: { code: string; source: string }[]): Set<string>;   // source === "USER" → formKeysOf
  export function cellState(a: { error: boolean; missing: boolean; estimated: boolean; edited: boolean }): PaperFieldState; // ưu tiên error > missing > estimate > edited > none
  export type AttentionCell = { key: string; line?: number; reason: "ERROR" | "MISSING" };
  export function attentionCells(kind: Kind, decl: FormValues, items: FormValues[], errors: FieldError[]): AttentionCell[];
  export function pageCount(kind: Kind, lines: number): number;   // pages.length + ceil(lines / itemsPerPage)
  ```
  `estimateValues` chỉ điền khi ô Hải quan còn trống: IDA `TK_A86` ← customsValueVnd, `THUE_KJ1`/`THUE_KK1` ← currency/exchangeRate, `THUE_B02` ← taxVnd, `TK_B12` ← `pageCount`, `TK_B13` ← lines; EDA `TK_RC1`/`TK_RD1`, `TK_K69`, `TK_K70`.

- [ ] **Step 1: Test thất bại** `print-state.test.ts`:
  - `pageCount("IDA", 0) === 2`, `pageCount("IDA", 2) === 4`, `pageCount("EDA", 2) === 3`, `pageCount("EDA", 3) === 4`, `pageCount("IDA", 50) === 52`.
  - `estimateValues("IDA", {}, { customsValueVnd: "886187500", currency: "USD", exchangeRate: "25780", taxVnd: "0", lines: 2 })` → `values.TK_A86 === "886187500"`, `values.TK_B12 === "4"`, `estimated.has("THUE_B02")`; với `customs.TK_A86 = "900000000"` → giữ "900000000", `estimated` không có `TK_A86`.
  - `sameNumber("886187500","886.187.500")`, `sameNumber("25780.00","25780")` true; `sameNumber("1","2")` false; `sameNumber("","0")` false.
  - `cellState` theo thứ tự ưu tiên (4 ca).
  - `attentionCells`: lỗi `{ no: "1.22" }` → ô khóa của chỉ tiêu 1.22 đứng trước mọi ô `MISSING`; lỗi có `line: 2` → `{ line: 2 }`; thứ tự trong mỗi nhóm = thứ tự `printKeys`, rồi khóa "Chỉ tiêu khác".
  - `fieldLocator("IDA").get("VD_BL2")!.group.map(f => f.key)` = các ô cùng dòng 2 của nhóm vận đơn; `get("HAG_TX3")!.scope === "item"`.
  - Repeat điền một phần: `attentionCells` không coi `VD_BL2`…`VD_BL5` trống là `MISSING` khi `VD_BL1` có giá trị (dùng `missingRequired` như form cũ).
- [ ] **Step 2: Chạy, FAIL** – `pnpm --filter @kb/web exec vitest run src/features/declaration-print`.
- [ ] **Step 3: Viết `print-state.ts`.**
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** – `feat(ban-in): logic thuần – trạng thái ô, số ước tính, ô cần xử lý, số trang`

### Task 6: Vẽ bản in (chỉ xem)

**Files:**
- Create: `apps/web/src/features/declaration-print/print-declaration.tsx`, `print-cell.tsx`, `print-sheets.tsx`, `other-fields.tsx`

**Interfaces:**
- Consumes: Task 1–5; `declarationValues`, `itemValues`, `editableKeys`, `declarationLockOf` (`dossier-adapter`); `customsValues`, `customsItemValues` (`customs-adapter`); `displayValue`, `codeLabel` (`declaration-form/display.ts`); `fieldErrors` (`customs-errors.ts`); `Disclosure`, `PaperStack`, `PaperSheet`, `PaperField`.
- Produces:
  ```ts
  export type PrintTarget = { key: string; line?: number };   // line = chỉ số dòng hàng (0-based) khi scope "item"
  export function PrintDeclaration(props: { dossierId: string; decl: Declaration; items: LineItem[]; mode: DeclarationEditMode; canEdit: boolean; submission: SubmissionView | undefined }): JSX.Element;
  ```
  `PrintSheets` (nội bộ) nhận `selected: PrintTarget | null`, `onSelect(t: PrintTarget)`.

- [ ] **Step 1: `print-cell.tsx`** – `PrintCell({ cell, value, state, compareTo, selected, onSelect })` → `PaperField`; giá trị ô mã có danh mục hiện "mã  tên" (`codeLabel`); `aria-label` = `"${no} ${label đầy đủ}: ${giá trị || "trống"}${state !== "none" ? ", " + tên trạng thái : ""}"`. Ô `CUSTOMS` khác số ước tính (`!sameNumber`) → `compareTo` = số ước tính. Bọc `Tooltip` (`@kb/ui`) nội dung `fieldTitle(no, label)` – số chỉ tiêu chỉ hiện ở đây và ở panel.
- [ ] **Step 2: `print-sheets.tsx`** – header lặp mỗi trang, `pages`, tuple vùng = hai cột (`Grid` của `@kb/ui`, xếp một cột dưới `cq-md`), dòng hàng nhóm theo `itemsPerPage`, mỗi khối mở đầu `< 01 >`. Tiêu đề + watermark từ `printTitle(kind, submission?.stage)`; `PaperSheet total = pageCount(...)`. Giá trị rỗng → chuỗi rỗng (không `undefined`); ngày rỗng in `/ /`.
- [ ] **Step 3: `other-fields.tsx`** – `Disclosure` "Chỉ tiêu khác (không có trên mẫu in)" mở sẵn khi trong đó có ô cần xử lý; chỉ ô `isApplicable`; không ô nào → không vẽ; mỗi ô dùng `PrintCell` (bấm được như trên trang).
- [ ] **Step 4: `print-declaration.tsx`** – tính `values` (khai + Hải quan + ước tính), `errors`, `edited`, trạng thái ô; giữ `selected` trong state (Task 7 thêm panel). Có chỉ thị Hải quan (`submission.customsInfo.directives.length > 0`) → `Alert tone="warning"` trên `PaperStack` "Hải quan có n chỉ thị" + nút cuộn tới vùng chỉ thị (trang 2).
- [ ] **Step 5: Kiểm tra tĩnh** – `pnpm --filter @kb/web typecheck && pnpm lint` (hiển thị kiểm ở Task 8).
- [ ] **Step 6: Commit** – `feat(ban-in): vẽ tờ khai dạng bản in VNACCS – trang, dòng hàng, chỉ tiêu khác`

### Task 7: Panel sửa ô + thanh công cụ

**Files:**
- Create: `apps/web/src/features/declaration-print/field-edit-panel.tsx`, `print-toolbar.tsx`
- Modify: `apps/web/src/features/declaration-print/print-declaration.tsx`, `print-state.ts` + test (thêm `panelOrder`)

**Interfaces:**
- Consumes: `FormField`, `GuideButton`, `RoleMark` (`declaration-form/field.tsx`); `useSaveDeclarationEdits`, `declarationLockOf`, `pendingEdits`, `pendingItemEdits`; `ChangeHsDialog` (`dossier-detail/steps/agent-step`); `Dialog presentation="panel"`; `DOC_KIND_LABELS`.
- Produces: `export function panelOrder(kind: Kind, lines: number): PrintTarget[]` (thứ tự Tab trong panel = thứ tự in, rồi Chỉ tiêu khác) trong `print-state.ts`.

- [ ] **Step 1: Test thất bại** `panelOrder("IDA", 2)`: phần tử đầu là khóa đầu tiên của `header`; có đủ `{ key: "HAG_CMD", line: 0 }` và `{ key: "HAG_CMD", line: 1 }`, dòng 0 đứng trước dòng 1; phần tử cuối là khóa cuối của `otherFieldKeys("IDA")`.
- [ ] **Step 2: FAIL → viết `panelOrder` → PASS** (`pnpm --filter @kb/web exec vitest run src/features/declaration-print`).
- [ ] **Step 3: `field-edit-panel.tsx`** – `Dialog presentation="panel"` mở khi `selected != null`. Nội dung: tiêu đề `fieldTitle(no, label)` + `RoleMark` + `GuideButton`; `FormField` cho mọi ô của `spot.group`; lỗi Hải quan của ô (`errorsForField`), lý do "Có trên tờ khai vì"; nguồn `DOC_KIND_LABELS[source]`; khóa (`declarationLockOf`) → chỉ đọc + `lock.reason`; lớp `DOC`/`DERIVED` → nút "Xem ở bước OCR" (`?step=ocr&dong=${lineNo}` với dòng hàng, `?step=ocr` với ô chung); lớp `HS` → nút "Chọn mã HS" mở `ChangeHsDialog`. Nút **Lưu** (`useSaveDeclarationEdits` với `pendingEdits`/`pendingItemEdits` của nhóm) / **Hủy**. Tab/Shift+Tab ở nút cuối/đầu panel → `panelOrder` kế tiếp/trước; Esc đóng. `mode === "LOCKED"` hoặc `!canEdit` → không có nút Lưu.
- [ ] **Step 4: Chưa lưu mà đổi ô / đóng** → `Dialog` modal nhỏ "Lưu thay đổi ở {tên chỉ tiêu}?" với **Lưu**, **Bỏ thay đổi**, **Ở lại**.
- [ ] **Step 5: `print-toolbar.tsx`** – nút trang 1…N + "Chỉ tiêu khác" (cuộn tới `PaperSheet id`), **Chỉ ô cần xử lý (n)** (`attentionCells`, mỗi lần bấm chọn ô kế tiếp, cuộn tới + mở panel; n = 0 → nút tắt, chữ "Không còn ô cần xử lý"), **In / Lưu PDF** (`window.print()`).
- [ ] **Step 6: `pnpm --filter @kb/web typecheck && pnpm lint && pnpm --filter @kb/web test`.**
- [ ] **Step 7: Commit** – `feat(ban-in): panel sửa ô, ô cần xử lý, in`

### Task 8: Gắn vào bước 5, cờ dự phòng, kiểm bằng trình duyệt

**Files:**
- Create: `apps/web/src/lib/feature-flags.ts`, `feature-flags.test.ts`
- Modify: `apps/web/src/features/dossier-detail/steps/review-step.tsx`, `docs/BACKEND-TODO.md` (thêm mục xóa form cũ), `docs/QUY-TRINH-NGHIEP-VU.md` (mô tả bước 5), `docs/RA-SOAT-CHI-TIEU-TO-KHAI.md` §8 (một dòng tiến độ)

**Interfaces:**
- Consumes: `PrintDeclaration` (Task 6–7).
- Produces: `export function legacyReviewForm(): boolean` (`process.env.NEXT_PUBLIC_REVIEW_LEGACY_FORM === "1"`).

- [ ] **Step 1: Test thất bại** `feature-flags.test.ts` (kiểu `data-source.test.ts`): không đặt → `false`; `"1"` → `true`; `"true"` → `false`.
- [ ] **Step 2: FAIL → viết → PASS.**
- [ ] **Step 3: `review-step.tsx`** – `legacyReviewForm()` sai: `TABS = ["full","docs","ops"]`, `full` → nhãn "Tờ khai" + `Badge` số ô cần xử lý, nội dung `<PrintDeclaration … submission={subQ.data} />`; `tab=customs` cũ → "full"; bỏ khung tổng hợp lỗi phía trên tabs (đã có ở thanh công cụ). Cờ đúng: giữ nguyên code cũ. Alert 4 mắt / HS và `StickyActionBar` giữ nguyên.
- [ ] **Step 4: `pnpm typecheck && pnpm lint && pnpm test`** → xanh.
- [ ] **Step 5: Trình duyệt thật** (`pnpm dev:web`, mock): `dos_021` (bản nháp, watermark, sửa một ô → lưu → chấm "Đã sửa"), `dos_019` (phân luồng: số Hải quan, chỉ thị, so sánh ước tính), `dos_018` (thông quan, chỉ đọc). Mỗi màn: sáng + tối, 1440px + 390px (không cuộn ngang), mô tả hàng hóa dài xuống dòng không tràn. Ctrl+P: đặt cạnh từng trang `MAUIN_TOKHAI_*.pdf` – thứ tự vùng, ngắt trang (IDA 1 dòng/trang, EDA 2), không lộ đánh dấu, watermark khi nháp. Chụp ảnh đính kèm PR.
- [ ] **Step 6: Đặt `NEXT_PUBLIC_REVIEW_LEGACY_FORM=1`**, khởi động lại → bước 5 như cũ; bỏ cờ.
- [ ] **Step 7: Commit** – `feat(review): bước 5 hiển thị tờ khai dạng bản in, cờ NEXT_PUBLIC_REVIEW_LEGACY_FORM giữ form cũ`
