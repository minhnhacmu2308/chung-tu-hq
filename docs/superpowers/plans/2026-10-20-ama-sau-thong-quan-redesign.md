# Thiết kế lại giao diện Sửa sau thông quan (AMA) – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dồn toàn bộ AMA vào bước 7 "Sửa sau thông quan" (chỉ hiện khi đã thông quan) với 4 bước nhỏ ① Chọn dòng · ② Sửa nội dung · ③ Lý do & phê duyệt · ④ Khai Hải quan, mỗi màn một nút chính.

**Architecture:** Chỉ đổi giao diện `apps/web` + thêm `Disclosure` vào `@kb/ui`. Bước 7 là khung nhìn (`?step=post`), `dossier.step` vẫn `submit`, không đổi API/DB/mock. Logic quyết định (bước nhỏ, nút chính, chặn duyệt, hạn) đặt trong file thuần `ama-wizard.ts` để test bằng vitest node (apps/web chỉ chạy `src/**/*.test.ts`, môi trường node – không có test component React ở web).

**Tech Stack:** Next.js 16, React, TanStack Query, `@kb/ui`, `@kb/contracts`, vitest (+ testing-library/axe ở `packages/ui`).

**Spec:** `docs/superpowers/specs/2026-10-20-ama-sau-thong-quan-redesign-design.md`

## Global Constraints

- Giao diện chỉ `@kb/ui` + utility token: không mã màu, không màu Tailwind mặc định, không `dark:`, không giá trị tùy ý, không `style={{}}`, không `<button>/<input>/<table>` thô. Bố cục co giãn dùng `Grid cols` / `cq-*` (không `sm:/md:/lg:`).
- Popup: `Dialog` + `DialogContent` có `title` + `icon`, nút trong `DialogFooter`, giữ nút chuyển panel.
- Số/tiền/ngày chỉ qua `apps/web/src/lib/format.ts`; tiền là chuỗi thập phân (không cộng bằng `number` – dùng `amaLineDelta` / hàm Dec của `@kb/contracts`).
- Ngày nghiệp vụ `YYYY-MM-DD`. Hạn AMA = `TK_IPD` + 60 ngày (TT121 Điều 20); quá hạn chỉ cảnh báo, không chặn.
- `exactOptionalPropertyTypes`: prop tùy chọn truyền bằng spread có điều kiện.
- Không đổi `StepIdSchema`, `customs-flow.ts`, API `post-amendment`/`customs`, mock.
- Mỗi màn bất đồng bộ có loading / lỗi / trống; có mobile ~390px và chế độ tối.
- Chữ trên giao diện tiếng Việt, đúng các nhãn trong spec (vd "Sửa sau thông quan", "Lập bản khai bổ sung", "Tiếp: sửa nội dung (n dòng)", "Tiếp: lý do & phê duyệt", "Thông tin khác (không bắt buộc)", "Gọi về sửa (AMB)", "Lập bản khai bổ sung lần 2", "Lịch sử bổ sung").
- Mỗi task kết thúc: `pnpm typecheck && pnpm lint` xanh và test của task xanh; commit kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Bước nhỏ lạc trạng thái sau thao tác:** sau Phê duyệt / AMA / AMB / AMC, bước nhỏ phải tự nhảy đúng (§3.6) kể cả khi URL còn `?sub=` cũ trỏ tới bước không hợp lệ → `resolveSubStep` bỏ `sub` không hợp lệ (test ở Task 2).
2. **Thay đổi chưa lưu bị mất khi chuyển bước nhỏ:** ② còn ô chưa lưu → nút "Tiếp" tắt và bấm Stepper sang bước khác phải hỏi xác nhận bỏ thay đổi (Task 4).
3. **Ngày `TK_IPD` trống hoặc sai định dạng:** `amaDeadline` trả `null`, dòng tóm tắt bỏ phần hạn, không văng lỗi (test Task 2).
4. **Bản khai có nhiều dòng (≥ 20) trên mobile:** ② chỉ mở sẵn dòng đầu, các thẻ khác đóng; không tràn ngang ở 390px (kiểm ở Task 8).
5. **Đang gửi AMA/AMC (Hải quan chưa phản hồi):** ④ nút chính tắt + trạng thái chờ, không cho bấm AMB/AMC chồng (test `amaPrimaryAction` Task 2 với `sending`).

---

### Task 1: `Disclosure` trong `@kb/ui`

**Files:**
- Create: `packages/ui/src/components/disclosure.tsx`
- Create: `packages/ui/src/components/disclosure.test.tsx`
- Modify: `packages/ui/src/index.ts` (export), `packages/ui/playground/showcase.tsx` (mục mới), `docs/DESIGN-SYSTEM.md` §4 (một dòng)

**Interfaces:**
- Produces: `Disclosure(props: DisclosureProps)` với
  `type DisclosureProps = { title: ReactNode; meta?: ReactNode; defaultOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void; children: ReactNode; className?: string }`.
  Nút tiêu đề là `<button type="button" aria-expanded aria-controls>` (bên trong `@kb/ui` được dùng phần tử thô), chevron xoay khi mở, nội dung ẩn bằng `hidden` khi đóng. Viền/bo theo token như `Card` nhỏ (`rounded-md border border-border`).

- [ ] **Step 1: Viết test hỏng** – theo mẫu `icon-tile.test.tsx`:
  - `"mặc định đóng: aria-expanded=false, nội dung không hiện"` – `render(<Disclosure title="Thông tin khác">nội dung</Disclosure>)`; `getByRole("button", { name: /Thông tin khác/ })` có `aria-expanded="false"`; `queryByText("nội dung")` không visible.
  - `"bấm mở/đóng, gọi onOpenChange"` – click → `aria-expanded="true"`, nội dung visible, `onOpenChange` nhận `true`.
  - `"defaultOpen mở sẵn; open điều khiển từ ngoài"`.
  - `"meta hiện cạnh tiêu đề"` – `meta={<span>3</span>}` có trong nút.
  - `"không vi phạm a11y"` khi đóng và khi mở – `expectNoA11yViolations`.
- [ ] **Step 2:** `pnpm --filter @kb/ui test disclosure` → FAIL (không có module).
- [ ] **Step 3:** Hiện thực `disclosure.tsx`, export ở `index.ts`, thêm mục playground (đóng, mở sẵn, có meta), thêm dòng `Disclosure` vào bảng component ở `docs/DESIGN-SYSTEM.md` §4. Theo skill `adding-ui-component`.
- [ ] **Step 4:** `pnpm --filter @kb/ui test disclosure` → PASS; `pnpm typecheck && pnpm lint` xanh.
- [ ] **Step 5:** Commit `feat(ui): Disclosure – khối thu gọn/mở rộng có tiêu đề, meta, a11y`.

### Task 2: Logic thuần `ama-wizard.ts`

**Files:**
- Create: `apps/web/src/features/post-amendment/ama-wizard.ts`
- Create: `apps/web/src/features/post-amendment/ama-wizard.test.ts`

**Interfaces:**
- Consumes: `PostAmendment`, `PostAmendmentLine`, `PostAmendmentStatus`, `CustomsStage`, `CustomsOperation`, `AMA_IMPORT_TAX_COLUMNS`, `amaOtherTaxColumns`, `AMA_OTHER_TAX_SLOTS`, `AMA_LINE_LAYOUT`, `amaLineDelta` từ `@kb/contracts`.
- Produces:
  - `type AmaSubStep = "pick" | "edit" | "reason" | "declare"`; `AMA_SUB_STEPS: readonly { id: AmaSubStep; label: string }[]` = Chọn dòng / Sửa nội dung / Lý do & phê duyệt / Khai Hải quan.
  - `postStepVisible(stage: CustomsStage | undefined): boolean` – `CLEARED` hoặc bắt đầu `POST_`.
  - `defaultSubStep(a: PostAmendment): AmaSubStep` – bảng §3.6 spec (`REGISTERED` → `"declare"`).
  - `resolveSubStep(a: PostAmendment, requested: string | null): AmaSubStep` – `requested` hợp lệ và không sau `defaultSubStep` (theo thứ tự) thì dùng, ngược lại `defaultSubStep`. Ngoại lệ: trạng thái `APPROVED`/`PRE_DECLARED`/`REGISTERED` vẫn cho xem ①②③ (chỉ đọc).
  - `subStepEditable(a: PostAmendment, s: AmaSubStep, canEdit: boolean): boolean` – ①②③ sửa được khi `canEdit && (DRAFT || RECALLED || APPROVED)`; `"declare"` luôn false.
  - `type CompareRow = { label: string; before: string; after: string; computed?: boolean }`; `IMPORT_COMPARE_ROWS: CompareRow[]` = Mã số hàng hóa (`HAG_MKT`/`HAG_AKT`), Trị giá tính thuế (`HAG_MKB`/`HAG_AKB`), Số lượng (`HAG_MKQ`/`HAG_AKQ`), Mã ĐVT (`HAG_MKC`/`HAG_AKC`), Thuế suất (`HAG_MKR`/`HAG_AKR`), Tiền thuế NK/XK (`HAG_MKA`/`HAG_AKA`, computed); `otherCompareRows(n: number): CompareRow[]` từ `amaOtherTaxColumns(n)`; `otherSlotsInUse(values): number[]`.
  - `changedKeys(line: PostAmendmentLine): string[]` – các khóa "Sau" (thuế XNK, thu khác, `HAG_CMA`, `HAG_ORA`, `APP_MA_HANG_SAU`) có giá trị khác "Trước" tương ứng (so chuỗi đã trim; số so bằng giá trị thập phân, "120000" = "120000.00").
  - `amaDeadline(ipd: string | undefined, today: string): { due: string; daysLeft: number; overdue: boolean } | null` – `due = ipd + 60 ngày`; `ipd` không phải `YYYY-MM-DD` hợp lệ → `null`.
  - `amaChangeSummary(a: PostAmendment): { lines: number; changed: number; taxDelta: string }` – `taxDelta` là tổng `amaLineDelta` (thuế XNK + thu khác) các dòng, chuỗi thập phân có dấu.
  - `approveBlockers(a: PostAmendment, o: { pendingEdits: number; fourEyes: boolean }): string[]` – theo thứ tự: "Chưa có dòng hàng", "Chưa nhập mã lý do khai bổ sung", "Còn thay đổi chưa lưu", "Nguyên tắc 4 mắt: nhờ Người duyệt khác phê duyệt".
  - `amaPrimaryAction(a: PostAmendment, o: { stage: CustomsStage; sending: boolean }): { op: "AMA" | "AMC"; label: string } | null` – `sending` → `null`; `APPROVED` (stage `POST_EDITING`/`POST_RECALLED`) → `{ op: "AMA", label: "Ký số & khai tạm AMA" }`; `PRE_DECLARED` → `{ op: "AMC", label: "Khai chính thức AMC" }`; còn lại `null`.
  - `AMA_OPS: ReadonlySet<CustomsOperation>` = AMA, AMB, AMC (bước 6 dùng để lọc).

- [ ] **Step 1: Viết test hỏng** (`describe` theo từng hàm, dựng `PostAmendment` mẫu bằng hàm `pa(partial)` trong file test):
  - `postStepVisible`: `CLEARED`, `POST_EDITING`, `POST_PRE_DECLARED`, `POST_RECALLED` → true; `DECLARED`, `NOT_SENT`, `undefined` → false.
  - `defaultSubStep`: DRAFT 0 dòng → `pick`; DRAFT 1 dòng → `edit`; RECALLED → `edit`; APPROVED → `declare`; PRE_DECLARED → `declare`; REGISTERED → `declare`.
  - `resolveSubStep`: DRAFT 1 dòng + `"declare"` → `edit`; DRAFT 1 dòng + `"pick"` → `pick`; APPROVED + `"edit"` → `edit`; `"rac"` → mặc định; `null` → mặc định.
  - `subStepEditable`: APPROVED + `edit` + canEdit → true; PRE_DECLARED + `edit` → false; DRAFT + canEdit=false → false.
  - `changedKeys`: Trước `HAG_MKR="5"` Sau `HAG_AKR="3"` → chứa `HAG_AKR`; `HAG_MKB="120000"` / `HAG_AKB="120000.00"` → không chứa `HAG_AKB`.
  - `amaDeadline("2026-10-17", "2026-10-20")` → `{ due: "2026-12-16", daysLeft: 57, overdue: false }`; `("2026-08-01", "2026-10-20")` → `overdue: true`, `daysLeft < 0`; `(undefined, …)` và `("17/10/2026", …)` → `null`.
  - `amaChangeSummary`: 2 dòng, `HAG_MKA="6000000"`/`HAG_AKA="3600000"` và dòng 2 không đổi → `{ lines: 2, changed: 1+, taxDelta: "-2400000" }` (so bằng giá trị thập phân).
  - `approveBlockers`: 0 dòng + thiếu `TK_REC` → 2 lý do đúng thứ tự; đủ → `[]`; `fourEyes: true` → có lý do 4 mắt.
  - `amaPrimaryAction`: APPROVED/`POST_EDITING` → AMA; PRE_DECLARED/`POST_PRE_DECLARED` → AMC; `sending: true` → null; DRAFT → null; REGISTERED → null.
- [ ] **Step 2:** `pnpm --filter @kb/web test ama-wizard` → FAIL.
- [ ] **Step 3:** Hiện thực các hàm trên trong `ama-wizard.ts` (ngày: cộng 60 ngày theo UTC trên chuỗi `YYYY-MM-DD`; số thập phân: hàm Dec của `@kb/contracts`, không `Number`).
- [ ] **Step 4:** test PASS; `pnpm typecheck && pnpm lint`.
- [ ] **Step 5:** Commit `feat(ama): logic thuần bước sửa sau thông quan – bước nhỏ, ô đã đổi, hạn 60 ngày, nút chính`.

### Task 3: Bước 7 trên thanh bước + khung + ① Chọn dòng

**Files:**
- Modify: `apps/web/src/features/dossier-detail/dossier-detail-page.tsx:16-38,156-195`
- Create: `apps/web/src/features/post-amendment/post-amendment-step.tsx`
- Create: `apps/web/src/features/post-amendment/pick-lines.tsx`

**Interfaces:**
- Consumes: Task 2 (`postStepVisible`, `AMA_SUB_STEPS`, `resolveSubStep`, `subStepEditable`, `amaDeadline`); `getSubmission`/`customsKeys.submission`, `startPostAmendment`; `getPostAmendmentView`, `addPostAmendmentLines`, `postAmendmentKeys`.
- Produces:
  - `PostAmendmentStep({ dossier, goTo }: StepProps)` – khung bước 7. Đọc `?sub=` từ URL, đổi bằng `router.replace` giữ `step=post`. Truyền xuống bước con: `type AmaStepCtx = { dossierId: string; kind: "IDA" | "EDA"; a: PostAmendment; view: PostAmendmentView; editable: boolean; refresh: () => void; goSub: (s: AmaSubStep) => void }` (export từ `post-amendment-step.tsx`).
  - `PickLines({ ctx }: { ctx: AmaStepCtx })`.
  - Trang hồ sơ: `type ViewStep = StepId | "post"`; nhãn bước 7 "Sửa sau thông quan".

- [ ] **Step 1:** Trang hồ sơ: khi `dossier.step === "submit"` thì `useQuery` submission (`enabled` theo điều kiện); `STEPS` thêm `{ id: "post", label: "Sửa sau thông quan" }` khi `postStepVisible(stage)`; `viewing` chấp nhận `"post"` khi bước 7 hiện; `Stepper currentId` vẫn `dossier.step` (bước 7 bấm được vì `viewingId`/`onStepClick` – nếu `Stepper` không cho bấm bước sau `currentId` thì truyền `currentId="post"` khi đang hiện bước 7).
- [ ] **Step 2:** `PostAmendmentStep`: loading `StepLoading`/lỗi `StepError`. Chưa có `current` và stage `CLEARED` → `EmptyState` icon `FilePlus2`, tiêu đề "Cần sửa sau thông quan?", mô tả "Lập bản khai bổ sung riêng, điền sẵn từ tờ khai gốc và số Hải quan trả về. Tờ khai gốc giữ nguyên. Hạn khai bổ sung: 60 ngày kể từ ngày thông quan (TT121 Điều 20).", nút "Lập bản khai bổ sung" (gọi `startPostAmendment`, xong vào ①). Có `current` (hoặc chỉ `history`) → `Card`: dòng tóm tắt `TK <TK_ICN> · <TK_ICB> · <TK_CHS> · thông quan <TK_IPD> · còn n ngày` (+ `Badge tone="warning"` "Quá hạn 60 ngày" khi overdue) và `Bản khai bổ sung lần <seq>` + `StatusBadge` (map `STATUS` cũ trong `post-amendment-panel.tsx`); `Stepper` 4 bước nhỏ (`currentId = defaultSubStep`, `viewingId = sub`, `label="Các bước sửa sau thông quan"`); nội dung bước con. Bước con chưa làm (② ③ ④) tạm render `EmptyState` "Đang xây dựng" – Task 4–6 thay.
- [ ] **Step 3:** `PickLines`: nhóm checkbox như `AddLineForm` cũ (dòng · HS · mô tả, "Chọn tất cả (n dòng)" khi > 1); dòng đã có trong bản khai tick sẵn + `disabled`. `StickyActionBar` (từ `../dossier-detail/steps/declaration-parts`): trái "Đã chọn n dòng", nút chính "Tiếp: sửa nội dung (n dòng)" – có dòng mới thì `addPostAmendmentLines` rồi `goSub("edit")`; chỉ dòng cũ thì `goSub("edit")`; 0 dòng → tắt. Không sửa được → chỉ xem danh sách đã chọn.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm --filter @kb/web test` xanh. Mở `http://localhost:3100/dossiers/dos_018?step=submit` (build + start như README): thấy bước 7, lập bản khai, ① chọn 2 dòng → sang ② (placeholder).
- [ ] **Step 5:** Commit `feat(ama): bước 7 Sửa sau thông quan – khung 4 bước nhỏ, lập bản khai, chọn dòng`.

### Task 4: ② Sửa nội dung – bảng so sánh Trước | Sau

**Files:**
- Create: `apps/web/src/features/post-amendment/line-compare.tsx`
- Modify: `apps/web/src/features/post-amendment/post-amendment-step.tsx` (gắn ②, hỏi bỏ thay đổi khi chuyển bước)

**Interfaces:**
- Consumes: `AmaStepCtx` (Task 3); `IMPORT_COMPARE_ROWS`, `otherCompareRows`, `otherSlotsInUse`, `changedKeys`, `amaChangeSummary` (Task 2); `applyAmaLineEdit`, `amaLineDelta`, `AMA_COMPUTED_KEYS`, `AMA_LINE_LAYOUT`, `AMA_OTHER_TAX_SLOTS` (`@kb/contracts`); `updatePostAmendmentField`, `removePostAmendmentLine`; `Disclosure` (Task 1); `BlockView`, `AmendLockProvider`, `conditionContext`, `ViewPrefsProvider` (`../declaration-form/*`).
- Produces: `EditLines({ ctx, onDirtyChange }: { ctx: AmaStepCtx; onDirtyChange: (n: number) => void })`.

- [ ] **Step 1:** `EditLines` giữ nháp theo dòng: `Record<lineId, { draft: PostAmendmentLine; edited: string[] }>` (đổi ô qua `applyAmaLineEdit`, như `AmaLinePanel` cũ). Mỗi dòng một `Disclosure` (dòng đầu `defaultOpen`): `title` = `Dòng <HAG_RAN> · <HAG_CMA rút gọn>`, `meta` = `Badge` "n ô đã đổi" (từ `changedKeys(draft)`) + nút phụ "Bỏ dòng" (`RowActions` hoặc `Button variant="ghost" size="sm"`, gọi `removePostAmendmentLine`).
- [ ] **Step 2:** Hàng so sánh: `Grid cols={{ base: 1, md: 3 }}` mỗi hàng: nhãn · "Trước" (chỉ đọc, `formatNumber`/`formatMoney` cho số) · ô "Sau" (`Field` + `Input`/combobox mã như `BlockView`; ô computed hiện giá trị + "(tự tính)" + mức tăng/giảm, nếu `manual` chứa khóa thì nút "Tự tính lại"). Ô thuộc `changedKeys` có `Badge tone="info"` "đã đổi". Trên base (mobile) nhãn ở trên, "Trước: …" dạng `text-sm text-fg-muted`, rồi ô Sau.
- [ ] **Step 3:** Trong mỗi thẻ: `Disclosure` "Mô tả, xuất xứ, mã hàng" (render `AMA_LINE_LAYOUT` bằng `BlockView` + lock như `AmaLinePanel` cũ; `defaultOpen` khi có ô đổi trong nhóm này) và `Disclosure` "Thuế và thu khác" chỉ chứa slot `otherSlotsInUse` (cùng dạng hàng so sánh) + nút "Thêm thuế và thu khác".
- [ ] **Step 4:** Cuối trang: tổng thuế Trước → Sau (`amaChangeSummary(...).taxDelta`, có dấu). `StickyActionBar`: còn ô chưa lưu → "Lưu n thay đổi" (lưu từng ô qua `updatePostAmendmentField` với `lineId`) + "Hoàn tác"; nút chính "Tiếp: lý do & phê duyệt" tắt khi còn chưa lưu; nút phụ "← Chọn thêm dòng" về ①. Gọi `onDirtyChange(tổng ô chưa lưu)`.
- [ ] **Step 5:** `post-amendment-step.tsx`: khi `dirty > 0` mà bấm Stepper sang bước khác → `Dialog` (icon `Undo2`, tiêu đề "Bỏ thay đổi chưa lưu?", `DialogFooter`: "Ở lại" / "Bỏ thay đổi"). Không sửa được → mọi ô chỉ đọc, không có thanh lưu.
- [ ] **Step 6:** `pnpm typecheck && pnpm lint && pnpm --filter @kb/web test` xanh. Trình duyệt: đổi thuế suất 5 → 3 trên dòng 1 → tiền thuế tự tính, "đã đổi", tổng −; lưu; tải lại trang vẫn còn.
- [ ] **Step 7:** Commit `feat(ama): bước ② sửa nội dung – bảng so sánh Trước/Sau, tự tính thuế, đánh dấu ô đã đổi`.

### Task 5: ③ Lý do & phê duyệt

**Files:**
- Create: `apps/web/src/features/post-amendment/reason-approve.tsx`
- Modify: `apps/web/src/features/post-amendment/post-amendment-step.tsx` (gắn ③)

**Interfaces:**
- Consumes: `AmaStepCtx`; `approveBlockers`, `amaChangeSummary` (Task 2); `AMA_HEADER_LAYOUT`, `amaHeaderLocked`, `HEADER_LOCK_REASON`, `processingContractNote` (`@kb/contracts`); `updatePostAmendmentField`, `approvePostAmendment`; `Disclosure`; nguyên tắc 4 mắt: lấy như `review-step.tsx` (`blockedByFourEyes`) – truyền vào `AmaStepCtx` thêm trường `fourEyes: boolean` (cập nhật type ở Task 3 file).
- Produces: `ReasonApprove({ ctx }: { ctx: AmaStepCtx })`.

- [ ] **Step 1:** Phần hiện sẵn: `BlockView` một khối dựng tại chỗ gồm `TK_REC` (bắt buộc) và `TK_NTA`; dòng tóm tắt `n dòng · m chỉ tiêu đổi · Thuế ±x VND` (`formatMoney`).
- [ ] **Step 2:** `Disclosure` "Thông tin khác (không bắt buộc)": các khối `AMA_HEADER_LAYOUT` trừ khối `ama-to-khai`, bỏ các ô `amaHeaderLocked` (không hiện ô khóa), bỏ `TK_REC`/`TK_NTA` đã ở trên; thêm chọn hợp đồng gia công (giữ logic `APP_HD_GC` + `processingContractNote` từ panel cũ). Có ô bắt buộc trống (`required` trong layout) → `defaultOpen` + `Alert tone="warning"` liệt kê.
- [ ] **Step 3:** Lưu nháp đầu bản khai: giữ cơ chế `headerEdits` + "Lưu n thay đổi"/"Hoàn tác" trên `StickyActionBar`. Nút chính "Phê duyệt" mở `Dialog` phê duyệt cũ (icon `ShieldCheck`, nội dung + cảnh báo 4 mắt) → `approvePostAmendment` → `refresh` + `goSub("declare")`. Nút tắt khi `approveBlockers(...)` khác rỗng; lý do đầu tiên hiện bên trái thanh dưới. Nút phụ "← Quay lại" về ②. `APPROVED` mà sửa tiếp → giữ thông báo "Sửa tiếp thì phải phê duyệt lại".
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm --filter @kb/web test`. Trình duyệt: thiếu mã lý do → nút tắt kèm lý do; chọn mã → phê duyệt → sang ④.
- [ ] **Step 5:** Commit `feat(ama): bước ③ lý do & phê duyệt – chỉ ô bắt buộc, thông tin khác thu gọn`.

### Task 6: ④ Khai Hải quan

**Files:**
- Create: `apps/web/src/features/post-amendment/declare-ama.tsx`
- Modify: `apps/web/src/features/post-amendment/post-amendment-step.tsx` (gắn ④, chế độ chỉ xem sau AMC, lịch sử)

**Interfaces:**
- Consumes: `AmaStepCtx` thêm `submission: SubmissionView` (bổ sung ở khung); `amaPrimaryAction`, `AMA_OPS` (Task 2); `performOperation`, `resendOperation`, `startPostAmendment`, `customsKeys`; `fieldErrors`, `errorPlace` (`../dossier-detail/steps/customs-errors`); `Disclosure`.
- Produces: `DeclareAma({ ctx }: { ctx: AmaStepCtx })`.

- [ ] **Step 1:** Đầu: dãy 2 mốc "Khai tạm AMA ─ Khai chính thức AMC" bằng `Stepper` (`steps` 2 mốc, `currentId` theo trạng thái, không bấm). Nút chính theo `amaPrimaryAction({ stage, sending })` → `performOperation(dossierId, op)` (toast như `submit-step.tsx`), `invalidate` customs + post-amendment. Đang gửi (`submission.pipeline` có AMA/AMB/AMC `SENDING`) → `Spinner` + "Đang chờ Hải quan phản hồi…".
- [ ] **Step 2:** Kết quả `a.result` (số TK bổ sung, số thông báo, ngày đăng ký, tổng thuế tăng/giảm, cờ quá 60 ngày) – chuyển từ tab "Thông điệp HQ" cũ. Hải quan từ chối (`submission.rejection` với `operation` thuộc `AMA_OPS`) → `Alert tone="danger"` lỗi theo chỉ tiêu + nút "Sửa lại" (`goSub("edit")`).
- [ ] **Step 3:** Nút phụ "Gọi về sửa (AMB)" chỉ khi `PRE_DECLARED`: `Dialog` xác nhận (chữ AMB cũ trong `ConfirmReopenDialog`) → `performOperation(dossierId, "AMB")`; khi trạng thái thành `RECALLED` thì khung tự về ② (nhờ `resolveSubStep`).
- [ ] **Step 4:** `Disclosure` "Thông điệp AMA/AMB/AMC (n)" – danh sách lọc `AMA_OPS` (chuyển từ panel cũ). Bản đã AMC (không có `current`, có `history`): `Badge tone="success"` "Đã khai chính thức", mọi bước nhỏ chỉ xem bản mới nhất, nút "Lập bản khai bổ sung lần 2" (`startPostAmendment`), `Disclosure` "Lịch sử bổ sung" (lần, ngày đăng ký `TK_A02`, số `TK_SYN`, thuế tăng/giảm).
- [ ] **Step 5:** `pnpm typecheck && pnpm lint && pnpm --filter @kb/web test`. Trình duyệt: AMA → (chờ) → AMB → về ② → sửa → duyệt lại → AMA → AMC → lập lần 2 → lịch sử có lần 1.
- [ ] **Step 6:** Commit `feat(ama): bước ④ khai Hải quan – một nút chính, gọi về AMB, kết quả, lịch sử bổ sung`.

### Task 7: Dọn bước 5, bước 6 và panel cũ

**Files:**
- Modify: `apps/web/src/features/dossier-detail/steps/review-step.tsx:29,57,93-97,206,216-227,258`
- Modify: `apps/web/src/features/dossier-detail/steps/submit-step.tsx:274-315,381-394,420-427,533`
- Delete: `apps/web/src/features/post-amendment/post-amendment-panel.tsx`, `apps/web/src/features/post-amendment/ama-line-panel.tsx`
- Modify: `docs/QUY-TRINH-NGHIEP-VU.md:269` (mô tả giao diện mới), `apps/web/CLAUDE.md` không đổi

**Interfaces:**
- Consumes: `AMA_OPS`, `postStepVisible` (Task 2); `getPostAmendmentView` để biết có bản khai dở.

- [ ] **Step 1:** `review-step.tsx`: bỏ tab "Khai bổ sung AMA", `hasAma`, nhánh `postEditing ? "ama"`; `TABS` bỏ `"ama"`; `StickyActionBar` luôn hiện. Giữ `cleared={stage === "CLEARED" || postEditing}` cho form tờ khai gốc (khóa).
- [ ] **Step 2:** `submit-step.tsx`: lọc `s.pipeline` bỏ `AMA_OPS` trước khi render `PhaseSection` (pha "POST" rỗng thì không render); bỏ `postEdit` mutation, kind `"post"` của `Confirm`, nhánh `START_POST_EDIT`. Khi `postStepVisible(s.stage)`: thẻ `Card` nhỏ – chưa có bản khai: "Cần sửa sau thông quan?" + nút "Lập bản khai bổ sung →"; có `current`: "Đang khai bổ sung lần n – <nhãn trạng thái>" + nút "Tiếp tục →"; cả hai `goTo` tới `post` (mở rộng `goTo` nhận `"post"` qua `router.replace` – thêm vào `StepProps.goTo` kiểu `ViewStep`).
- [ ] **Step 3:** Xóa hai file panel cũ; `grep -rn "post-amendment-panel\|ama-line-panel" apps/web/src` không còn kết quả.
- [ ] **Step 4:** Cập nhật `docs/QUY-TRINH-NGHIEP-VU.md` dòng 269: AMA ở bước 7 "Sửa sau thông quan" với 4 bước nhỏ, link spec mới.
- [ ] **Step 5:** `pnpm typecheck && pnpm lint && pnpm test` (ghi rõ nếu còn 2 lỗi môi trường cũ: thiếu `business/format.json` ở contracts, test tích hợp core cần Docker).
- [ ] **Step 6:** Commit `refactor(ama): bỏ tab AMA ở Review và hàng AMA/AMB/AMC ở Khai báo – lối vào bước 7`.

### Task 8: Kiểm tra bằng trình duyệt thật

**Files:**
- Create (tạm, không commit): script Playwright trong scratchpad, chạy `chromium.launch({ channel: "chrome" })`.

- [ ] **Step 1:** `pnpm --filter @kb/web build` rồi `pnpm --filter @kb/web start -H 0.0.0.0`; "Khôi phục dữ liệu mẫu" trước khi chạy.
- [ ] **Step 2:** Chạy hết luồng trên `dos_018`: bước 6 thẻ lối vào → bước 7 → lập → ① 2 dòng → ② đổi thuế suất, lưu → ③ mã lý do, phê duyệt → ④ AMA → AMB → ② → ③ → AMA → AMC → lần 2. Thêm một hồ sơ có ≥ 20 dòng nếu seed có (Review Focus 4).
- [ ] **Step 3:** Chụp sáng/tối × 1366×800 / 390×780 ở ①②③④ và trang bước 6; đo `scrollWidth - innerWidth <= 0`, không nút/ô nào ngoài màn, nút trợ lý AI không đè `StickyActionBar`; không lỗi console.
- [ ] **Step 4:** Sửa lỗi bố cục tìm thấy (commit `fix(ama): …` riêng), chạy lại đến khi sạch; `pnpm typecheck && pnpm lint && pnpm test`.
