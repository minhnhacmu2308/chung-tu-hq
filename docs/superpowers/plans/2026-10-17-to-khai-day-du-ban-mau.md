# Bản mẫu tờ khai đầy đủ chỉ tiêu – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang `/ban-mau/to-khai` hiển thị đủ mọi ô của tờ khai IDA/EDA theo 3 tab (Người khai nhập / Hải quan trả về / Theo dõi & nghiệp vụ), chạy bằng dữ liệu giả.

**Architecture:** Bố cục là dữ liệu thuần trong `@kb/contracts/declaration-layout` (khóa ô = tên trường VNACCS). Vai trò và hướng dẫn lấy từ catalog Phụ lục II; luật "theo tình huống" là một nguồn chung với core. `apps/web/src/features/declaration-form` đọc cấu hình rồi dựng giao diện từ `@kb/ui`; giá trị giữ trong state, không lưu.

**Tech Stack:** TypeScript, Zod, Vitest, Next.js App Router, React, `@kb/ui`, Playwright (chỉ để chụp kiểm tra).

**Spec:** `docs/superpowers/specs/2026-10-17-to-khai-day-du-ban-mau-design.md`

## Global Constraints

- Màn Review và luồng hồ sơ hiện có **không thay đổi** hành vi. Mọi test cũ phải xanh.
- Giao diện chỉ ghép từ `@kb/ui` cộng utility token. Không mã màu, không `dark:`, không giá trị tùy ý, không `<button>`/`<input>` thô. Bố cục co giãn dùng mốc `cq-*` (`.claude/rules/dung-component-chung.md`).
- Khóa ô = tên trường VNACCS (`TK_IMC`, `VD_BL2`, `HAG_TX3`…). Ô không có trong đặc tả dùng tiền tố `APP_`.
- Ô Hải quan trả về chỉ đọc và chỉ nằm ở tab 2.
- Tab, nhóm, loại, giai đoạn lưu trên URL: `loai=nhap|xuat`, `giai-doan=nhap|da-khai|thong-quan`, `tab=khai|hai-quan|nghiep-vu`, `nhom=<id>`.
- Mọi chỉ tiêu 1.1–1.96 và 2.1–2.80 có ít nhất một ô, trừ 1.46.
- Trước khi báo xong: `pnpm typecheck && pnpm lint && pnpm test` xanh, và đã chụp màn hình bằng trình duyệt (sáng/tối × 1366/390 × 2 loại × 3 giai đoạn).

## Review Focus

- Đổi loại hình hoặc phương thức vận chuyển trong form thì các ô theo tình huống phải ẩn/hiện lại ngay; bộ đếm "đã nhập / tổng" không được đếm ô bị ẩn. → test ở Task 4.
- Ô có giá trị nhưng không còn áp dụng (bật công tắc mới thấy) không được tính là thiếu và không được làm bộ đếm vượt tổng. → test ở Task 4.
- Ô có số chỉ tiêu nhưng tên trường VNACCS không có trong catalog (ô con thứ 2..n) vẫn phải lấy được vai trò và hướng dẫn qua số chỉ tiêu của nhóm. → test ở Task 2.
- Chuỗi rất dài (mô tả hàng, địa chỉ, chỉ thị) và 50 ô container không được gây tràn ngang ở 390px. → đo ở Task 8.
- Giai đoạn "nhập" không có dữ liệu Hải quan: tab 2 không được trống trơn mà phải ghi "Có sau khi …" cho từng khối. → test ở Task 7.

---

### Task 1: Luật "theo tình huống" dùng chung

**Files:**
- Create: `packages/contracts/src/declaration/conditions.ts`, `packages/contracts/src/declaration/conditions.test.ts`
- Modify: `packages/contracts/src/declaration/index.ts` (export), `packages/core/src/modules/declaration/domain/mapping/conditions.ts` (dùng nguồn chung)

**Interfaces:**
- Produces:
  - `type ConditionId = "TEMP_IMPORT" | "RE_IMPORT" | "RE_EXPORT" | "TEMP_EXPORT" | "BY_WATER" | "IN_CONTAINER" | "EXPORT_VALUE"`
  - `type ConditionContext = { typeCode: string; transportCode: string; incoterm: string; hasInvoice: boolean }`
  - `const DECLARATION_CONDITIONS: Record<ConditionId, { label: string; test: (c: ConditionContext) => boolean }>`
- Labels copy nguyên từ `core/.../mapping/conditions.ts` hiện tại. `EXPORT_VALUE`: label "Điều kiện giá khác FOB/DAP/DAF hoặc không có hóa đơn"; test `!["FOB","DAP","DAF"].includes(incoterm) || !hasInvoice`.

- [ ] **Step 1: Write the failing test** `conditions.test.ts`:
  - `TEMP_IMPORT` đúng với G11..G14 (cả "g12 " có khoảng trắng, chữ thường), sai với G15, A11;
  - `RE_IMPORT` chỉ G51; `RE_EXPORT` G21..G24; `TEMP_EXPORT` chỉ G61;
  - `BY_WATER` đúng với "2", "3", "6", sai với "1"; `IN_CONTAINER` chỉ "2";
  - `EXPORT_VALUE`: sai với FOB có hóa đơn, đúng với CIF, đúng với FOB không có hóa đơn.
- [ ] **Step 2:** `cd packages/contracts && npx vitest run src/declaration/conditions.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `conditions.ts`; export từ `declaration/index.ts`.
- [ ] **Step 4:** Refactor `core/.../mapping/conditions.ts`: giữ nguyên export `TEMP_IMPORT, RE_IMPORT, RE_EXPORT, TEMP_EXPORT, BY_WATER, IN_CONTAINER` (kiểu `When`). Mỗi `When` = `{ label: DECLARATION_CONDITIONS[id].label, test: (i) => DECLARATION_CONDITIONS[id].test(contextOf(i)) }`, với `contextOf(i: MappingInput): ConditionContext` (typeCode từ dossier, transportCode từ `transportCode(i)`, incoterm từ `incotermCode(invoice.incoterm)`, hasInvoice = có chứng từ INVOICE). Điều kiện 2.40 trong `eda.ts` chuyển sang `EXPORT_VALUE`.
- [ ] **Step 5:** `npx vitest run src/declaration` (contracts) và `cd ../core && npx vitest run src/modules/declaration src/modules/integration` → PASS, số test không giảm.
- [ ] **Step 6: Commit** `git commit -m "Luật chỉ tiêu theo tình huống: một nguồn chung trong @kb/contracts"`

### Task 2: Kiểu bố cục, tra vai trò, cấu hình IDA

**Files:**
- Create: `packages/contracts/src/declaration-layout/types.ts`, `expand.ts`, `role.ts`, `ida.ts`, `shared.ts`, `index.ts`, `layout.test.ts`
- Modify: `packages/contracts/src/index.ts` (export `./declaration-layout/index.js`)

**Interfaces:**
- Consumes: `ConditionId` (Task 1), `CATALOG_IDA/EDA`, `CodeTable`, `catalogFieldRole`, `findDeclarationFieldDef`, `VN_IDA_*_FIELDS`, `VN_EDA_*_FIELDS`.
- Produces:
  ```ts
  type FieldInput = "text" | "code" | "date" | "time" | "number" | "textarea";
  type FieldOrigin = "DECLARANT" | "CUSTOMS";
  type LayoutField = { kind: "field"; key: string; label: string; no?: string; input: FieldInput; width?: "xs" | "sm" | "md" | "lg" | "full"; codeTable?: CodeTable; origin?: FieldOrigin; condition?: ConditionId };
  type LayoutGroup = { kind: "group"; label: string; no?: string; condition?: ConditionId; fields: LayoutField[] };          // ô con nằm ngang
  type LayoutRepeat = { kind: "repeat"; label: string; no?: string; count: number; condition?: ConditionId; fields: LayoutField[] }; // key chứa "{n}" (1..count) hoặc "{nn}" (01..)
  type LayoutItem = LayoutField | LayoutGroup | LayoutRepeat;
  type LayoutBlock = { id: string; title: string; condition?: ConditionId; items: LayoutItem[]; emptyNote?: string };      // emptyNote: câu "Có sau khi …" cho khối Hải quan
  type LayoutSection = { id: string; title: string; blocks: LayoutBlock[] };
  type DeclarationLayout = {
    kind: "IDA" | "EDA";
    summary: LayoutField[];                       // 4 ô đầu trang (số tờ khai, phân luồng TK_LUONG, thông quan TK_THONGQUAN, ngày đăng ký)
    declarant: LayoutSection[];                    // tab 1, nhóm 1–7 (nhóm 8 = items)
    customs: LayoutSection[];                      // tab 2
    item: { columns: string[]; declarant: LayoutBlock[]; customs: LayoutBlock[] }; // columns: key hiện ở bảng
  };
  function expandRepeat(r: LayoutRepeat): LayoutField[][];        // mỗi phần tử = một dòng
  function layoutFields(l: DeclarationLayout): LayoutField[];      // phẳng mọi ô (đã expand), gồm cả item
  function fieldRole(kind: "IDA" | "EDA", f: LayoutField, parentNo?: string): DeclarationFieldRole; // origin CUSTOMS → "CUSTOMS"; không no → "OPTIONAL"
  function fieldGuideNo(f: LayoutField, parentNo?: string): string | undefined; // f.no ?? parentNo
  const LAYOUT_IDA: DeclarationLayout;
  ```
- `fieldRole` tra catalog theo `f.no ?? parentNo`; không thấy → `"OPTIONAL"`.

- [ ] **Step 1: Write the failing test** `layout.test.ts` (IDA):
  - **coverage:** tập `no` của `layoutFields(LAYOUT_IDA)` (gồm `no` của group/repeat) chứa mọi `CATALOG_IDA[].no` trừ "1.46";
  - **unique:** không key trùng sau expand;
  - **spec:** mọi key không bắt đầu bằng `APP_` có trong `VN_IDA_FIELDS ∪ VN_IDA_HANG_FIELDS ∪ VN_IDA_VANDON_FIELDS ∪ VN_IDA_KTG_FIELDS ∪ VN_IDA_THUE_FIELDS ∪ VN_IDA_CTHQ_FIELDS ∪ VN_IDA_TRANGTHAI_FIELDS` (theo `.name`);
  - **origin:** mọi ô `origin: "CUSTOMS"` chỉ nằm trong `customs`, `summary` hoặc `item.customs`; trong `declarant` và `item.declarant` không có ô CUSTOMS;
  - **expand:** `expandRepeat({count:3, fields:[{key:"VD_BL{n}"}]})` → keys `VD_BL1..3`; `{nn}` → `CTHQ_D01..`;
  - **role:** `fieldRole("IDA", {key:"TK_EP3", no: undefined…}, "1.22")` → vai trò của 1.22; `fieldRole("IDA", ô origin CUSTOMS)` → "CUSTOMS".
- [ ] **Step 2:** `npx vitest run src/declaration-layout` → FAIL.
- [ ] **Step 3:** Implement `types.ts`, `expand.ts`, `role.ts`.
- [ ] **Step 4:** Viết `ida.ts` theo bảng mục 2 của spec, đúng thứ tự ô trong ảnh mẫu `CHITIEU_NHAPKHAU` (image1–7):
  - **Nhóm (section id):** `chung`, `cac-ben`, `van-chuyen`, `giay-phep`, `hoa-don-tri-gia` (có khối "Hợp đồng quản lý nội bộ": `APP_HD_SO`, `APP_HD_NGAY`, `APP_HD_HET_HAN`), `thue-bao-lanh`, `dinh-kem`;
  - **condition:** gắn đúng cho 1.3 (`RE_IMPORT`), 1.10 (`TEMP_IMPORT`), hô hiệu (`BY_WATER`), số lượng container (`IN_CONTAINER`);
  - **customs:** khối `dang-ky`, `thue`, `chi-thi` (repeat 10, `{nn}`), `thong-quan`, đều có `emptyNote`;
  - **item.declarant / item.customs:** theo `VN_IDA_HANG`; 5 khoản thu khác = repeat 5 trên `HAG_TX{n}`/`HAG_TR{n}`/`HAG_TG{n}` (người khai) và `HAG_KQ{n}`/`HAG_KS{n}`/`HAG_KY{n}`/`HAG_KZ{n}`/`HAG_LB{n}` (Hải quan);
  - **ô ngoài đặc tả:** `APP_NGAY_VD` (ngày vận đơn), `HAG_MAHANG` có trong đặc tả nên dùng nguyên.
- [ ] **Step 5:** `npx vitest run src/declaration-layout` → PASS. Nếu coverage báo thiếu `no`, bổ sung ô vào `ida.ts`; **không** nới test.
- [ ] **Step 6: Commit** `git commit -m "Bố cục tờ khai đầy đủ: kiểu dữ liệu + cấu hình IDA (đủ 1.1–1.96)"`

### Task 3: Cấu hình EDA

**Files:**
- Create: `packages/contracts/src/declaration-layout/eda.ts`
- Modify: `declaration-layout/index.ts`, `layout.test.ts` (chạy cùng bộ test cho EDA qua `describe.each`)

**Interfaces:**
- Consumes: kiểu và hàm của Task 2.
- Produces: `const LAYOUT_EDA: DeclarationLayout`; `function layoutFor(kind: "IDA" | "EDA"): DeclarationLayout`.

- [ ] **Step 1:** Đổi `layout.test.ts` thành `describe.each` cho IDA/EDA. Với EDA: coverage 2.1–2.80, không loại trừ; spec check trên `VN_EDA_* ∪ VN_EDA_CON_FIELDS`. Thêm assertion: khối container trong `van-chuyen` có 50 ô `CON_C01..CON_C50` và 5 ô `CON_VC1..5`.
- [ ] **Step 2:** `npx vitest run src/declaration-layout` → FAIL ở EDA.
- [ ] **Step 3:** Viết `eda.ts` theo spec và ảnh `CHITIEU_XUATKHAU` (image1–5):
  - 2.7 (`TEMP_EXPORT`), 2.3 (`RE_EXPORT`), 2.40 (`EXPORT_VALUE`), container (`IN_CONTAINER`);
  - item thêm `HAG_OL1..5`, tiền lệ phí `HAG_CUP/CQU/CQC/CPR`, tiền bảo hiểm `HAG_IUP/IQU/IQC/IPR`;
  - customs gồm `TK_ETA`, `TK_TCO`, `TK_SAM`, `TK_RC/RD`;
  - các khối giống IDA lấy từ `shared.ts`.
- [ ] **Step 4:** `npx vitest run src/declaration-layout` → PASS; `pnpm --filter @kb/contracts typecheck` → không lỗi.
- [ ] **Step 5: Commit** `git commit -m "Bố cục tờ khai đầy đủ: cấu hình EDA (đủ 2.1–2.80, container)"`

### Task 4: Logic form thuần

**Files:**
- Create: `apps/web/src/features/declaration-form/form-state.ts`, `form-state.test.ts`

**Interfaces:**
- Consumes: `DeclarationLayout`, `LayoutItem`, `LayoutBlock`, `LayoutSection`, `fieldRole`, `expandRepeat`, `DECLARATION_CONDITIONS`, `ConditionContext`.
- Produces:
  ```ts
  type FormValues = Record<string, string>;
  function conditionContext(kind: "IDA" | "EDA", v: FormValues): ConditionContext; // typeCode TK_ICB|TK_ECB, transportCode TK_MTC, incoterm TK_IP2 (chữ hoa), hasInvoice = TK_IV1 !== "B" && !!TK_IV3
  function isApplicable(x: { condition?: ConditionId }, ctx: ConditionContext): boolean;
  function sectionProgress(kind, s: LayoutSection, v: FormValues): { filled: number; total: number; missingRequired: number };
  function missingRequired(kind, f: LayoutField, v: FormValues, parentNo?: string): boolean; // REQUIRED/CONDITIONAL-đang-áp-dụng mà trống
  function itemProgress(kind, layout: DeclarationLayout, item: FormValues): { missing: number };
  ```
- **Quy tắc đếm:** chỉ ô DECLARANT đang áp dụng; repeat chỉ tính dòng 1; ô có giá trị nhưng không áp dụng thì không tính vào cả `filled` lẫn `total`.

- [ ] **Step 1: Write the failing test** `form-state.test.ts` với một layout nhỏ dựng ngay trong test:
  - A11 + `TK_MTC="1"` → ô 1.10 và ô hô hiệu không áp dụng, không vào `total`;
  - đổi `TK_ICB="G12"` → `total` tăng 1 và `missingRequired` tăng 1 (1.10 bắt buộc khi áp dụng);
  - ô 1.10 có giá trị nhưng loại hình A11 → không tăng `filled`, `filled <= total`;
  - repeat 5 vận đơn chỉ tính 1 ô;
  - `conditionContext("EDA", { TK_ECB: "B11", TK_IP2: "fob", TK_IV1: "A", TK_IV3: "X" })` → `{ typeCode: "B11", incoterm: "FOB", hasInvoice: true, transportCode: "" }`.
- [ ] **Step 2:** `cd apps/web && npx vitest run src/features/declaration-form/form-state.test.ts` → FAIL.
- [ ] **Step 3:** Implement `form-state.ts`.
- [ ] **Step 4:** Chạy lại → PASS.
- [ ] **Step 5: Commit** `git commit -m "Bản mẫu tờ khai: logic đếm/áp dụng/còn thiếu"`

### Task 5: Dữ liệu giả theo ảnh mẫu

**Files:**
- Create: `apps/web/src/features/declaration-form/fixtures/types.ts`, `ida-a44.ts`, `eda-b13.ts`, `index.ts`, `fixtures.test.ts`

**Interfaces:**
- Consumes: `layoutFor`, `layoutFields`, `FormValues`.
- Produces:
  ```ts
  type Stage = "nhap" | "da-khai" | "thong-quan";
  type PrototypeFixture = { code: string; declarant: FormValues; items: FormValues[]; customsByStage: Record<Exclude<Stage, "nhap">, { header: FormValues; items: FormValues[] }>; messages: { code: string; name: string; at: string }[] };
  function fixtureFor(kind: "IDA" | "EDA"): PrototypeFixture;
  function valuesAt(f: PrototypeFixture, stage: Stage): { header: FormValues; items: FormValues[] }; // gộp declarant + customs của giai đoạn
  ```
- **IDA:** giá trị chép từ ảnh `CHITIEU_NHAPKHAU` (Vietjet, A44, đường không, 06B1, TTR, C&F, 2.111,04 USD, rượu Chivas HS 22083090, TTĐB TB020, GTGT VB245, chỉ thị luồng vàng).
- **EDA:** giá trị chép từ ảnh `CHITIEU_XUATKHAU` (B13, DDU, 4.566,17 USD, 5 dòng, luồng đỏ).
- Giai đoạn `da-khai`: có số tờ khai, đăng ký, thuế. `thong-quan`: thêm cấp phép.

- [ ] **Step 1: Write the failing test** `fixtures.test.ts`: mọi key trong fixture đều có trong `layoutFields(layoutFor(kind))`. Không có key CUSTOMS trong `declarant`/`items`. `valuesAt(f,"nhap").header` không có `TK_ICN`/`TK_ECN`; `valuesAt(f,"thong-quan").header` có ngày cấp phép (`TK_C21` / `TK_K86`).
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Viết fixture và `valuesAt`.
- [ ] **Step 4:** Chạy → PASS.
- [ ] **Step 5: Commit** `git commit -m "Bản mẫu tờ khai: dữ liệu giả IDA A44 / EDA B13 theo ảnh mẫu"`

### Task 6: Ô, nhóm ô con, nhóm lặp

**Files:**
- Create: `apps/web/src/features/declaration-form/field.tsx`, `field-group.tsx`, `field-repeat.tsx`, `fields.test.tsx`
- Modify (chỉ khi thiếu): `packages/ui/...` theo skill `adding-ui-component`

**Interfaces:**
- Consumes: `LayoutField/Group/Repeat`, `fieldRole`, `fieldGuideNo`, `fieldGuide` (`steps/field-guide.ts` hiện có), `ROLE_INFO` (`steps/declaration-groups.ts`), `CODE_TABLES`, `isApplicable`, `missingRequired`.
- Produces:
  - `<FormField kind field value onChange readOnly parentNo applicable reason />`: nhãn "no · label", huy hiệu vai trò, nút (i) mở hướng dẫn, "Còn thiếu" khi bắt buộc trống, "Có vì / Không áp dụng vì: …";
  - `<FormFieldGroup kind group values onChange readOnly ctx showInapplicable />`;
  - `<FormFieldRepeat … />`: dòng có dữ liệu + 1 dòng trống + nút "Thêm dòng"; khi `key` là `CON_C{nn}` thì hiện dạng lưới.
- **Mã:** `codeTable` có trong `CODE_TABLES` → `Combobox`/`Select` "mã – tên"; không có → `Input`.

- [ ] **Step 1: Write the failing test** `fields.test.tsx` (Testing Library + axe như các test component khác):
  - ô bắt buộc trống hiện "Còn thiếu";
  - ô readOnly không có control sửa được;
  - repeat 5 với 2 dòng có dữ liệu → render 3 dòng, bấm "Thêm dòng" → 4;
  - không vi phạm axe.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Implement ba component.
- [ ] **Step 4:** Chạy → PASS; `pnpm lint` → không vi phạm.
- [ ] **Step 5: Commit** `git commit -m "Bản mẫu tờ khai: ô, nhóm ô con, nhóm lặp"`

### Task 7: Ba tab, bảng hàng, panel dòng hàng, trang

**Files:**
- Create: `apps/web/src/features/declaration-form/declaration-form.tsx`, `declarant-tab.tsx`, `customs-tab.tsx`, `operations-tab.tsx`, `items-table.tsx`, `item-panel.tsx`, `declaration-form.test.tsx`
- Create: `apps/web/src/app/(app)/ban-mau/to-khai/page.tsx`

**Interfaces:**
- Consumes: Task 3–6.
- Produces: `<DeclarationFormPrototype />` đọc `useSearchParams` (`loai`, `giai-doan`, `tab`, `nhom`).
- **Bố cục:**
  - **Đầu trang:** `PageHeader` + `layout.summary`. SegmentedControl Nhập/Xuất và giai đoạn.
  - **Tab 1:** mục lục bên trái kèm `sectionProgress`; trên điện thoại dùng `Select`. Công tắc "Hiện cả chỉ tiêu không áp dụng" (`Switch`). Nhóm 8 = `ItemsTable` (cột theo `layout.item.columns` + cột "đủ / còn thiếu N ô").
  - **`ItemPanel`:** `Dialog defaultPresentation="panel"`, có `title` + `icon`. Phần `item.declarant` sửa được, phần `item.customs` chỉ đọc.
  - **Tab 2:** khối `layout.customs` chỉ đọc. Khối không có dữ liệu hiện `emptyNote`.
  - **Tab 3:** nhật ký thông điệp (`DataTable`), các nút nghiệp vụ và tra cứu theo spec mục 2 → `toast({ tone:"info", title:"Bản mẫu – chưa kết nối" })`, số hóa chứng từ (`EmptyState`).
- `page.tsx` mỏng: chỉ render `<DeclarationFormPrototype />`, bọc `Suspense`.

- [ ] **Step 1: Write the failing test** `declaration-form.test.tsx`:
  - `loai=nhap&giai-doan=nhap&tab=hai-quan` → mỗi khối hiện `emptyNote` ("Có sau khi …");
  - `giai-doan=da-khai` → hiện số tờ khai của fixture;
  - tab 1 nhóm `chung`: đổi ô loại hình sang "G12" → xuất hiện ô "1.10";
  - bấm dòng hàng 1 → panel mở với tiêu đề có "Dòng 1";
  - không vi phạm axe.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Implement các component và route.
- [ ] **Step 4:** Chạy → PASS; `pnpm typecheck && pnpm lint && pnpm test` → xanh, trừ các lỗi có sẵn đã biết (`*.int.test.ts` cần Postgres, `fpt.test.ts` thiếu `business/format.json`).
- [ ] **Step 5: Commit** `git commit -m "Bản mẫu tờ khai đầy đủ: 3 tab, bảng hàng, panel dòng, trang /ban-mau/to-khai"`

### Task 8: Kiểm tra bằng trình duyệt và ghi lại

**Files:**
- Modify: `docs/RA-SOAT-CHI-TIEU-TO-KHAI.md` (mục Tiến độ: thêm "Bản mẫu tờ khai đầy đủ")
- Temp (xóa sau khi xong): script Playwright trong `packages/ui/`

- [ ] **Step 1:** `pnpm --filter @kb/web build && pnpm --filter @kb/web start` (cổng 3100).
- [ ] **Step 2:** Script tạm, theo skill `adding-ui-component` mục "Kiểm tra bằng trình duyệt": với loại × giai đoạn × tab × (sáng/tối) × (1366/390), đo `scrollWidth - innerWidth` và chụp toàn trang. **Expected:** mọi giá trị đo = 0.
- [ ] **Step 3:** Đối chiếu từng tab với ảnh mẫu. Ô có trong ảnh mà thiếu trên bản mẫu → bổ sung cấu hình (quay lại Task 2/3 và chạy lại test).
- [ ] **Step 4:** Xóa script tạm; cập nhật báo cáo.
- [ ] **Step 5: Commit** `git commit -m "Bản mẫu tờ khai đầy đủ: kiểm tra trình duyệt, cập nhật báo cáo"`
