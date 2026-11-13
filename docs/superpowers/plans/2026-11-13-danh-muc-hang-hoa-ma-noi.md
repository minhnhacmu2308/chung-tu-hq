# Danh mục hàng hóa dùng chung (mã nối) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Danh mục hàng hóa có mặt hàng chuẩn (mã nối), bộ mã theo bộ phận/đối tác có người phụ trách, bí danh, quy đổi đơn vị; nhập Excel → ghép → duyệt; mọi dòng tờ khai, hóa đơn, lô nhập tay trỏ về mặt hàng chuẩn.

**Architecture:** Module mới `packages/core/src/modules/catalog` (domain thuần + use case + Drizzle repo) thay `product_catalog` của module `declaration`; luật ghép và chuẩn hóa mã là hàm thuần trong `@kb/contracts/catalog`; module khác gọi qua port `CatalogPort` ngoài transaction của mình; nhập lớn chạy job `catalog-import`. Giao diện `/products` viết lại thành 4 tab trong `apps/web/src/features/catalog/`.

**Tech Stack:** TypeScript, Zod (`@kb/contracts`), Drizzle + Postgres RLS (`@kb/core`), BullMQ (`apps/worker`), Next.js (`apps/web`), `@kb/ui`, `exceljs` (đã có), decimal.js (đã có), vitest + testcontainers.

**Spec:** `docs/superpowers/specs/2026-11-13-danh-muc-hang-hoa-ma-noi-design.md` · ADR `docs/adr/0015-catalog-canonical-items-code-sets.md`

## Global Constraints

- Mọi truy vấn/ghi có `orgId`; bảng mới có `orgRls(...)` (bất biến 1).
- Mã hàng, mã HS, mã nối, Part No là `string`; hệ số quy đổi, thuế suất, đơn giá là chuỗi Decimal / cột `numeric` (bất biến 2, 3).
- Ngày nghiệp vụ `YYYY-MM-DD`, thời điểm UTC (bất biến 4).
- Ghép mã, quy đổi, tra mã là code thuần có test – **không AI** (bất biến 5).
- Mọi sửa mặt hàng/bí danh/quy đổi/gộp/tách → `field_audit` append-only, source `CATALOG_EDIT` (bất biến 6).
- Dữ liệu ngoài (body route, file Excel, payload job, dòng OCR) parse bằng Zod (bất biến 9).
- Module chỉ import qua `modules/<module>/index.ts`; không gọi port module khác trong transaction (packages/core/CLAUDE.md).
- Chuẩn hóa mã `code_key`: viết hoa, bỏ khoảng trắng và các ký tự `-` `.` `/` `_`.
- Mã nối: `<tiền tố><6 chữ số>`, tiền tố mặc định `MH-`, duy nhất theo org, không đổi.
- Ghép: `SURE` (bí danh ACTIVE cùng bộ; hoặc HS 8 số + `name_key` trùng; hoặc `code_key` ACTIVE ở bộ khác + cùng HS 4 số / cả hai thiếu HS và `name_key` trùng) · `MAYBE` (Dice từ `name_key` ≥ 0,8 + cùng chương HS hoặc một bên thiếu HS; hoặc cùng HS 8 số tên khác) · `NONE`. `SURE` mà ĐVT ≠ `base_unit` và chưa có quy đổi → hạ `MAYBE`. Tối đa 5 ứng viên.
- Nhập > 500 dòng → job `catalog-import`; ≤ 500 dòng xử lý đồng bộ trong route.
- Hệ số theo lô lệch > 20% so với mặc định → cảnh báo, không chặn.
- Quyền: VIEWER xem/xuất; DECLARANT đề xuất bí danh + tạo mặt hàng vào hàng chờ; APPROVER như DECLARANT + sửa thông tin chung mặt hàng; người phụ trách bộ mã (vai trò ≠ VIEWER) sửa/duyệt trong bộ mình; ADMIN/OWNER tất cả.
- Mã lý do mới (nhãn vi/en/zh): `CATALOG_CODE_TAKEN`, `CATALOG_UNIT_FACTOR_REQUIRED`, `CATALOG_QUEUE_ITEM_DONE`, `CATALOG_MERGE_INVALID`, `CATALOG_NOT_CODE_SET_OWNER`, `CATALOG_MODE_CONFLICT`.
- Hai chế độ (`catalog_settings.mode`): `SHARED` – một bộ nội bộ `SHARED` "Mã chung" thay Kế toán/Kho/XNK ở mọi chỗ (HAG_MAHANG, in hóa đơn, hiển thị), cấm tạo bộ ACCOUNTING/WAREHOUSE/CUSTOMS; `PER_DEPARTMENT` – bộ Kế toán/Kho/XNK. Bộ SUPPLIER/CUSTOMER có ở cả hai. Đổi chế độ không mất bí danh.
- Giao diện chỉ `@kb/ui` + token; nhãn đủ vi/en/zh trong `*.messages.ts`; a11y (axe).
- **Commit**: theo `.claude/rules/review-truoc-commit.md` – không commit giữa chừng (giao diện cũ `/products` dùng API cũ sẽ vỡ nếu commit backend riêng). Một mốc sau Task 11 (code), một mốc sau Task 12 (tài liệu); mỗi mốc chạy song song `hq-review-backend` + `hq-review-frontend`, cả hai PASS mới commit, dán khối `Review:`. Không commit `docs/danhmuc/`, `docs/tailieuchitieukhaibao/`, `docs/tinhthue/`, `docs/mauin_danhsachcontqua_kvgs/`, `docs/V5-API/`.
- Docker có sẵn cho int test: `export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"`. Máy không có Python.

## Review Focus

1. Mã trên Excel kế toán có khoảng trắng/gạch/chữ thường (`vt-0012 `, `VT 0012`) và cùng mã ở file kho → về cùng một `code_key`, không sinh hai mặt hàng. (Task 1, Task 4)
2. Hai dòng trong cùng file trỏ cùng mặt hàng với hai mã khác nhau (mã cũ/mới) → một mặt hàng, hai bí danh ACTIVE; hai mặt hàng khác nhau cùng một mã → `CATALOG_CODE_TAKEN` ở dòng thứ hai, không ghi đè im lặng. (Task 3, Task 4)
3. Gộp mặt hàng A vào B khi tờ khai cũ trỏ A → tra lại tờ khai cũ ra B (theo `merged_into_id`), không mất số lần đã khai; gộp chuỗi A→B rồi B→C → A ra C. (Task 3)
4. Hóa đơn in theo bộ mã mà mặt hàng chưa có mã trong bộ đó → in mã nối, không để trống cột; ĐVT bộ khác ĐVT gốc mà thiếu quy đổi → giữ lượng và ĐVT gốc, cảnh báo, không tự nhân hệ số 1. (Task 6)
5. Người khai gặp mã lạ khi đang làm hồ sơ, người phụ trách chưa duyệt → hồ sơ vẫn đi tiếp tới truyền tờ khai; `HAG_MAHANG` trống + cảnh báo, không chặn. (Task 5)

---

### Task 1: Contracts – kiểu, chuẩn hóa mã, luật ghép, quy đổi, dòng Excel

**Files:**
- Create: `packages/contracts/src/catalog/{index.ts,schemas.ts,code-key.ts,match.ts,units.ts,excel.ts}`, `packages/contracts/src/catalog/catalog.test.ts`
- Modify: `packages/contracts/src/index.ts`, `packages/contracts/src/reason-codes.ts`, `apps/web/src/lib/reason-codes.messages.ts`

**Interfaces – Produces:**
- `codeKey(raw: string): string`; `nameKey(raw: string): string` (dùng lại `normalizeProductName` hiện có nếu tương đương).
- Schemas: `CatalogItemKindSchema` (`MATERIAL|PRODUCT|GOODS|SUPPLY`), `CodeSetKindSchema` (`SHARED|ACCOUNTING|WAREHOUSE|CUSTOMS|SUPPLIER|CUSTOMER`), `CatalogModeSchema` (`SHARED|PER_DEPARTMENT`), `AliasStatusSchema` (`PROPOSED|ACTIVE|REJECTED`), `MatchLevelSchema` (`SURE|MAYBE|NONE`), `CatalogItemSchema`, `CodeSetSchema`, `ItemAliasSchema`, `UnitConversionSchema` (`{ unit, factor: decimal string > 0 }`), `MatchQueueItemSchema`, `CatalogImportSchema`, `CatalogItemDetailSchema` (item + aliases theo bộ + conversions + usage), DTO input: `CreateItemInput`, `UpdateItemInput`, `UpsertCodeSetInput`, `ProposeAliasInput`, `DecideQueueInput` (`{ action: "CONFIRM"|"CHOOSE"|"CREATE"|"SKIP", itemId?, factor? }`), `ImportRowsInput` (`{ codeSetId, fileName, columnMap, rows: ExcelRow[] }`).
- `matchCandidate(row: { codeKey; nameKey; hs?: string; unit?: string }, index: MatchIndex, codeSetId: string): { level; itemId?; candidates: { itemId; score; reason }[]; reason }` – `MatchIndex` = dữ liệu đã nạp: bí danh ACTIVE theo `(codeSetId, codeKey)`, theo `codeKey` toàn org, mặt hàng theo HS8 + `nameKey`, danh sách mặt hàng để chấm Dice; reason là mã ổn định (`ALIAS_SAME_SET`, `HS8_NAME`, `CODE_OTHER_SET_HS4`, `NAME_SIMILAR_CHAPTER`, `HS8_NAME_DIFF`, `UNIT_NO_FACTOR`).
- `convert(qty: string, fromUnit: string, toUnit: string, conv: { base: string; factors: Record<string,string> }, lotFactor?: string): { qty: string; factor: string } | null` (Decimal; null khi thiếu hệ số).
- `detectColumns(headers: string[]): ColumnMap` (tên cột thường gặp trong spec §4); `ExcelRowSchema` + `validateRows(rows): { ok: Row[]; errors: { row; field; code }[] }` (thiếu mã/tên, trùng trong file, HS 4–10 số).
- Reason codes ở Global Constraints.

- [ ] **Step 1: Failing tests** `catalog.test.ts`: `codeKey(" vt-0012 ")==="VT0012"`, `codeKey("VT 0012")==="VT0012"` (Review Focus 1); bảng ca `matchCandidate` cho đủ 6 lý do + hạ `SURE`→`MAYBE` khi thiếu quy đổi; ≤ 5 ứng viên; `convert("120","CUON","MTR",{base:"MTR",factors:{CUON:"100"}})` → `"12000"`; lotFactor `"98.5"` thắng mặc định; thiếu hệ số → `null`; `detectColumns(["Mã hàng","Tên hàng","ĐVT"])`; `validateRows` báo trùng mã ở dòng 2.
- [ ] **Step 2: Run** `cd packages/contracts && npx vitest run src/catalog` → FAIL.
- [ ] **Step 3: Implement**; reason codes + nhãn 3 ngôn ngữ.
- [ ] **Step 4: Run** `npx vitest run` (contracts) + `cd apps/web && npx vitest run src/lib` → PASS.

### Task 2: Core – bảng, migration, chuyển dữ liệu, repo

**Files:**
- Create: `packages/core/src/db/schema/catalog.ts` (export trong schema index), `packages/core/drizzle/0037_catalog.sql` (drizzle-kit `db:generate`, đổi tên; thêm SQL chuyển dữ liệu cuối file), `packages/core/src/modules/catalog/{application/ports.ts,infrastructure/drizzle-catalog-uow.ts,application/test/in-memory-catalog-uow.ts,infrastructure/drizzle-catalog-uow.int.test.ts}`
- Modify: `packages/core/src/db/schema/declaration.ts` (`line_items` + `catalog_item_id`, `catalog_alias_id`, `unit_factor numeric`, `item_code`), `packages/core/src/shared/ids.ts` (tiền tố id mới)

**Interfaces – Produces:** bảng đúng spec §3 (8 bảng gồm `catalog_settings` (mode, tiền tố, bộ đếm `item_no_seq`), ràng buộc: unique `(org_id,item_no)`; unique `(code_set_id, code_key) WHERE status='ACTIVE'`; partial unique `(org_id) WHERE is_primary_display`; unique `(org_id) WHERE is_default` (bộ mặc định cho Hải quan: `CUSTOMS` hoặc `SHARED`); unique `(item_id, unit)`). `CatalogRepos` = `{ settings, items, codeSets, owners, aliases, conversions, queue, imports }` (mỗi repo nhận `orgId`; `items.resolveMerged(orgId, id)` đi theo chuỗi `merged_into_id`; `settings.get/upsert`; `settings.nextItemNo(orgId)` cấp số tăng dần an toàn đồng thời – `UPDATE catalog_settings SET item_no_seq = item_no_seq + 1 … RETURNING`). `CatalogUow.asOrg(ctx, fn)`.
Chuyển dữ liệu: mỗi org có dòng `product_catalog` → tạo bộ `CUSTOMS` "XNK" (`is_default`); mỗi dòng → `catalog_items` **giữ `id`**, `item_no` cấp tuần tự, `base_unit = unit`, các cột thuế/xuất xứ/thống kê chép sang, `note` nối `partner`; `code` không rỗng → bí danh ACTIVE `source='MIGRATION'`. Idempotent (`ON CONFLICT DO NOTHING`). `product_catalog` giữ nguyên.

- [ ] **Step 1: Failing int test**: migration trên dữ liệu `product_catalog` mẫu → số mặt hàng = số dòng, id giữ nguyên, mã cũ là bí danh bộ XNK; RLS org B đọc null; unique bí danh ACTIVE (ACTIVE thứ hai cùng mã → lỗi, PROPOSED cùng mã được); `nextItemNo` song song 20 lần → 20 số khác nhau; `resolveMerged` A→B→C ra C.
- [ ] **Step 2: Run** `cd packages/core && npx vitest run src/modules/catalog` (Docker) → FAIL.
- [ ] **Step 3: Implement** schema, migration, repo Drizzle + in-memory (mô phỏng unique/RLS như in-memory customs).
- [ ] **Step 4: Run** int + unit → PASS; `pnpm --filter @kb/core db:generate` báo "No schema changes".

### Task 3: Core – use case mặt hàng, bộ mã, bí danh, quy đổi, gộp/tách, tra mã

**Files:**
- Create: `packages/core/src/modules/catalog/application/{items.ts,code-sets.ts,aliases.ts,conversions.ts,merge.ts,resolve.ts,export.ts,permissions.ts}`, `packages/core/src/modules/catalog/index.ts`, tests `application/__tests__/*.test.ts`
- Modify: composition root `apps/web/src/container.ts`, `packages/core/src/modules/catalog/infrastructure/index.ts` (`createCatalogInfrastructure`)

**Interfaces – Produces:**
- `listItems(deps, ctx, { q?, codeSetId?, kind?, missingCustoms?, missingFactor?, page })` (q tìm `item_no`/`name_key`/mọi `code_key`; khi có `codeSetId` trả kèm mã/tên/ĐVT theo bộ), `getItem(deps, ctx, id)` → `CatalogItemDetail`, `createItem`, `updateItem`, `archiveItem`.
- `listCodeSets`, `upsertCodeSet`, `setOwners(codeSetId, userIds)`, `setPrimaryDisplay(codeSetId|null)`, `setupCatalog(deps, ctx, { mode, prefix, sets: {kind,name,ownerIds}[], primaryDisplayKind? })` (lần đầu; idempotent; `SHARED` → đổi bộ XNK từ migration thành `SHARED` "Mã chung" hoặc tạo mới), `changeMode(deps, ctx, { to: "PER_DEPARTMENT", sharedBecomes: "ACCOUNTING"|"WAREHOUSE"|"CUSTOMS", customsSetId? } | { to: "SHARED" })` (`CATALOG_MODE_CONFLICT` theo spec §3); `upsertCodeSet` chặn bộ nội bộ khi `SHARED`. `codeInSet(itemId, "CUSTOMS")` dùng bộ `is_default` (CUSTOMS hoặc SHARED).
- `proposeAlias(deps, ctx, { codeSetId, code, name?, unit?, itemId, source })` → ACTIVE nếu ctx là người phụ trách/ADMIN, ngược lại PROPOSED; `decideAlias(id, "APPROVE"|"REJECT")`; `moveAlias(id, toItemId)`; `deactivateAlias(id)`.
- `setConversion(itemId, unit, factor)`, `removeConversion`.
- `mergeItems(deps, ctx, { fromId, intoId })` (chuyển bí danh/quy đổi chưa trùng, cộng `times_declared`, đặt MERGED; chặn tự gộp/gộp vào MERGED → `CATALOG_MERGE_INVALID`); `splitAliases(deps, ctx, { aliasIds, newItem })`.
- `resolveItem(deps, ctx, { codeSetId?, partnerName?, code?, name?, hsCode?, unit? })` → `{ itemId, aliasId?, level, factor?, candidates }` (thứ tự spec §5, dùng `matchCandidate`; theo `merged_into_id`).
- `exportCrossReference(deps, ctx)` → dòng `{ itemNo, name, hs, baseUnit, codes: Record<codeSetId, string[]>, factors }`.
- `CatalogPort` (cho module khác, export qua index): `resolveItem`, `recordDeclared(orgId, { itemId, declarationNo, date, typeCode })[]`, `enqueueUnknown(orgId, rows)`, `codeInSet(orgId, itemId, codeSetKind|codeSetId)`, `conversionOf(orgId, itemId)`.
- Mọi thay đổi → `audit.append` (`CATALOG_EDIT`), sau commit theo tiền lệ AMA_EDIT.

- [ ] **Step 1: Failing tests**: tạo/sửa/ngưng; người phụ trách vs không phụ trách (PROPOSED/ACTIVE, `CATALOG_NOT_CODE_SET_OWNER` khi duyệt bộ người khác); VIEWER → FORBIDDEN; org khác → NOT_FOUND; mã trùng ACTIVE → `CATALOG_CODE_TAKEN` (Review Focus 2); gộp A→B, B→C, `resolveItem` mã cũ của A ra C, `times_declared` cộng dồn (Review Focus 3); tách; `setupCatalog` chạy 2 lần không nhân đôi; chế độ `SHARED`: `codeInSet(…,"CUSTOMS")` trả mã chung, tạo bộ Kho → `CATALOG_MODE_CONFLICT`, `changeMode` sang `PER_DEPARTMENT` giữ nguyên bí danh; `field_audit` đúng số mục.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run src/modules/catalog` → PASS.

### Task 4: Nhập Excel → ghép → hàng chờ duyệt

**Files:**
- Create: `packages/core/src/modules/catalog/application/{import.ts,match-run.ts,queue.ts,from-documents.ts}`, `apps/worker/src/jobs/catalog-import.ts`, tests
- Modify: `apps/worker/src/index.ts` (queue `catalog-import`), `packages/core/src/shared/queue.ts`

**Interfaces – Produces:**
- `importRows(deps, ctx, ImportRowsInput)` → `CatalogImport` (validate bằng `validateRows`; ≤ 500 dòng chạy `runMatch` ngay, > 500 → ghi `catalog_imports` PARSING + xếp job `catalog-import { orgId, userId, importId }`; rows lưu tạm trong `catalog_imports.rows` jsonb, xóa khi DONE).
- `runMatch(deps, ctx, importId)`: nạp `MatchIndex` một lần; mỗi dòng: mã đã có trong bộ → cập nhật tên/ĐVT bí danh; `SURE` → bí danh ACTIVE; `MAYBE`/`NONE` → `catalog_match_queue` PENDING; cập nhật `counts`; idempotent theo `(import_id, row)`.
- `listQueue(deps, ctx, { mine?, codeSetId?, level?, page })`, `decideQueue(deps, ctx, id, DecideQueueInput)`, `decideQueueBulk(ids, "CONFIRM")`: CONFIRM/CHOOSE tạo bí danh ACTIVE (ĐVT ≠ base và chưa có quy đổi → cần `factor`, thiếu → `CATALOG_UNIT_FACTOR_REQUIRED`); CREATE tạo mặt hàng (cấp mã nối) + bí danh; SKIP; mục đã DONE → `CATALOG_QUEUE_ITEM_DONE`. Quyền: người phụ trách bộ của mục / ADMIN.
- `importFromDocuments(deps, ctx, { source: "DECLARATIONS"|"INVOICES" })`: dòng tờ khai đã duyệt có mã hàng + HS → bộ XNK; dòng OCR invoice/packing có Part No → bộ nhà cung cấp theo `partner_key` người bán (tạo bộ nếu chưa có); đi qua `runMatch`. Đọc qua port của `declaration`/`extraction` (thêm hàm đọc vào index của các module đó nếu chưa có).

- [ ] **Step 1: Failing tests**: file kế toán + file kho cùng mã viết khác → một mặt hàng, hai bộ (Review Focus 1); nhập lại cùng file → 0 mặt hàng mới; dòng `MAYBE` vào hàng chờ với lý do; CONFIRM thiếu hệ số khi khác ĐVT → lỗi; quyết định 2 lần → `CATALOG_QUEUE_ITEM_DONE`; 600 dòng → job xếp, worker chạy xong `counts` đúng; từ chứng từ: Part No của 2 nhà cung cấp → 2 bộ.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** core catalog + `pnpm --filter @kb/worker test` → PASS.

### Task 5: Nối tờ khai, trích xuất, bài học

**Files:**
- Modify: `packages/core/src/modules/declaration/application/{declaration.ts,product-catalog.ts,line-items.ts}` + chỗ dựng chỉ tiêu `HAG_MAHANG` (tìm nơi map dòng hàng sang IDA/EDA), `packages/core/src/modules/declaration/application/ports.ts` (port `CatalogPort` được tiêm), `packages/core/src/modules/teaching/**` (tra bí danh trước khóa `P:<partNo>`; duyệt bài học LINE → `proposeAlias` source LESSON), composition root
- Modify (web, nhỏ): `apps/web/src/features/dossier-detail/steps/hs/catalog-match.ts` → dùng kết quả `resolveItem` từ API thay khớp tên
- Test: tests tương ứng trong từng module

**Interfaces – Consumes:** `CatalogPort` (Task 3). **Produces:**
- Khi dựng dòng tờ khai từ lô hàng: `resolveItem({ partnerName: seller, code: partNo, name, hsCode, unit })` → ghi `line_items.catalog_item_id/alias_id`; `item_code = codeInSet(itemId, CUSTOMS)` (mới nhất) → `HAG_MAHANG`; gợi ý lượng theo ĐVT khai bằng `convert` (hệ số lô từ packing list nếu có → `unit_factor`), cảnh báo khi lệch > 20%.
- API dòng hàng trả thêm `{ catalogItem?: { id, itemNo, name }, unknownCode?: boolean }`; use case `linkLineItem(deps, ctx, lineItemId, { itemId } | { createItem })` gọi `proposeAlias` (bộ nhà cung cấp) + ghi `field_audit`.
- Duyệt tờ khai: bỏ ghi `product_catalog`; sau commit gọi `recordDeclared` cho dòng đã gắn, `enqueueUnknown` cho dòng chưa gắn (Review Focus 5: mã lạ không chặn truyền).
- `product-catalog.ts` cũ: xóa use case (routes chuyển ở Task 7); giữ bảng.

- [ ] **Step 1: Failing tests**: Part No đã có bí danh → dòng gắn đúng mặt hàng, `HAG_MAHANG` = mã XNK; mã lạ → `unknownCode`, truyền vẫn được, `HAG_MAHANG` trống; quy đổi cuộn→mét theo lô; duyệt tờ khai → `times_declared`+1 / mục hàng chờ NONE; bài học duyệt → bí danh PROPOSED.
- [ ] **Step 2–4:** FAIL → implement → `cd packages/core && npx vitest run` (cả int) PASS.

### Task 6: Hóa đơn phát hành in theo bộ mã

**Files:**
- Modify: `packages/contracts/src/api/invoice-template.ts` (`itemCodeSet: { codeSetId: string } | { kind: "ITEM_NO" } | null`), `packages/contracts/src/api/issued-invoice.ts` (snapshot item + `catalogItemId`, `printedCode`, `printedUnit`, `printedQuantity`), `packages/core/src/modules/extraction/domain/issued.ts` + use case phát hành (đọc mã/quy đổi qua `CatalogPort` trước khi dựng snapshot), mẫu in `apps/web/src/features/invoice-print/*` (cột PART_NO hiện `printedCode`, lượng/ĐVT theo printed)
- Test: tests issued + invoice-print

**Interfaces – Produces:** quy tắc chọn mã in: bộ trong mẫu → nếu null thì bộ khách hàng của người mua → Kế toán → mã nối; mặt hàng không có mã trong bộ → mã nối; quy đổi sang ĐVT của bí danh in, thiếu hệ số → giữ lượng/ĐVT gốc + cảnh báo (Review Focus 4).

- [ ] **Step 1: Failing tests**: in theo bộ Kế toán ra mã kế toán + lượng quy đổi; thiếu mã → mã nối; thiếu hệ số → lượng gốc + cảnh báo; ảnh chụp lưu đủ 4 trường.
- [ ] **Step 2–4:** FAIL → implement → PASS (contracts, core extraction, web invoice-print).

### Task 7: Route + API web (http + mock) + seed

**Files:**
- Create: `apps/web/src/app/api/org/catalog/**` (items, items/[id], items/[id]/merge, items/split, code-sets, code-sets/[id], setup, aliases, aliases/[id], conversions, queue, queue/[id], queue/bulk, imports, imports/[id], imports/from-documents, export/cross-reference, resolve), `apps/web/src/app/api/dossiers/[id]/line-items/[lineId]/catalog/route.ts`, `apps/web/src/api/catalog.ts` (`catalogKeys` + mọi hàm qua `pick()`), `apps/web/src/api/http/catalog.ts`, `apps/web/src/mocks/api/catalog.ts`, `apps/web/src/mocks/seed/catalog.ts`, tests `mocks/api/catalog.test.ts`
- Modify/Delete: `apps/web/src/app/api/org/products/**` và `apps/web/src/api/http/products.ts`, `mocks/api/products.ts`, `mocks/seed/products.ts` (thay bằng catalog; `DB_VERSION`++), `apps/web/src/features/dossier-detail/manual-shipment/manual-shipment-form.ts` (tìm hàng qua catalog), `apps/web/CLAUDE.md` (route)

**Interfaces – Produces:** route mỏng (`requireSession` → Zod → use case → `fromResult`); mock cùng chữ ký và dùng cùng hàm thuần `@kb/contracts/catalog`; seed: 3 bộ (Kế toán "MISA", Kho, XNK) + 2 bộ nhà cung cấp, ~40 mặt hàng có khác ĐVT (cuộn/mét/kg), vài mã trùng viết khác, 8 mục hàng chờ đủ 3 mức.

- [ ] **Step 1: Failing mock tests**: thiết lập → nhập file → hàng chờ → xác nhận → mặt hàng có 2 bộ mã; xem theo bộ Kho trả mã/ĐVT kho; xuất đối chiếu.
- [ ] **Step 2–4:** FAIL → implement → `cd apps/web && npx vitest run src/mocks` PASS; `pnpm typecheck && pnpm lint` sạch.

### Task 8: Giao diện – tab Mặt hàng + panel chi tiết

**Files:**
- Create: `apps/web/src/features/catalog/{catalog-page.tsx,catalog.messages.ts,items-tab.tsx,item-panel.tsx,item-aliases.tsx,item-conversions.tsx,merge-dialog.tsx}`, tests `*.test.tsx`
- Modify: `apps/web/src/app/(app)/products/page.tsx` (render `CatalogPage`), xóa `apps/web/src/features/product-catalog/*` (giữ logic đọc Excel nếu dùng lại ở Task 10)

**Interfaces – Consumes:** `apps/web/src/api/catalog.ts`. Hành vi theo spec §6 tab 1 (tab chọn bằng `?tab=`).

- [ ] **Step 1: Failing tests**: bảng có mã hiển thị chính; "Xem theo bộ mã: Kho" đổi cột; tìm bằng mã kho ra mặt hàng; panel hiện bí danh theo bộ, quy đổi, lịch sử, nút Đóng cuối; Gộp → `ConfirmDialog` → mặt hàng nguồn biến mất khỏi danh sách; VIEWER không có nút sửa; axe; en/zh.
- [ ] **Step 2–4:** FAIL → implement → PASS; `pnpm lint` sạch.

### Task 9: Giao diện – tab Bộ mã, thiết lập lần đầu, tab Chờ duyệt

**Files:**
- Create: `apps/web/src/features/catalog/{code-sets-tab.tsx,code-set-dialog.tsx,setup-wizard.tsx,queue-tab.tsx,queue-row-actions.tsx}`, tests

**Hành vi:** spec §6 tab 2, 3. Thiết lập: bước 1 chọn chế độ; `SHARED` → tên "Mã chung" + người phụ trách + tiền tố rồi chuyển thẳng sang tab Nhập dữ liệu; `PER_DEPARTMENT` → tiền tố, 3 bộ, người phụ trách (chọn nhiều thành viên), mã hiển thị chính. Dòng chế độ + nút Đổi chế độ (popup chọn "Mã chung" thành bộ nào). Hàng chờ: lọc "Của tôi"/bộ/mức, ✓ Xác nhận, Chọn khác (`Combobox` gọi `listItems q`), Tạo mới, Bỏ qua, ô hệ số khi thiếu quy đổi (bắt buộc), chọn nhiều → "Xác nhận n mục"; tab hiện số đếm PENDING.

- [ ] **Step 1: Failing tests**: danh mục trống → `EmptyState` + thiết lập chế độ riêng → 3 bộ xuất hiện; thiết lập chế độ dùng chung → 1 bộ "Mã chung", không có nút tạo bộ Kế toán/Kho/XNK, mở tab Nhập; đổi chế độ; sửa người phụ trách; hàng chờ: xác nhận một mục, xác nhận hàng loạt, thiếu hệ số → nút khóa; người không phụ trách thấy mục nhưng không có nút duyệt; axe.
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 10: Giao diện – tab Nhập dữ liệu

**Files:**
- Create: `apps/web/src/features/catalog/{import-tab.tsx,column-mapper.tsx,import-preview.tsx,read-xlsx.ts}`, tests

**Hành vi:** spec §6 tab 4: chọn bộ mã → `FileDropzone` (.xlsx) → `detectColumns` + sửa ghép cột → xem trước `validateRows` (bảng lỗi theo dòng) → `importRows` → tiến độ (poll `imports/[id]` khi chạy nền) → tóm tắt + "Xem n mục chờ duyệt"; nút "Lấy từ chứng từ đã đọc" (`DECLARATIONS`/`INVOICES`). Đọc file bằng `exceljs` phía client như `product-catalog/import-xlsx.ts` cũ.

- [ ] **Step 1: Failing tests**: file mẫu (tạo bằng exceljs trong test) nhận đúng cột; dòng trùng mã báo lỗi dòng 2; nhập xong hiện tóm tắt đúng số; axe.
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 11: Màn khác + kiểm trình duyệt + mốc commit code

**Files:**
- Modify: bước kiểm dòng hàng của hồ sơ (`apps/web/src/features/dossier-detail/steps/agent-step.tsx` / bảng dòng hàng – thẻ mã nối, "Mã lạ" + `Combobox` chọn/tạo gọi route line-items catalog), form tờ khai (chú thích quy đổi ở ô lượng), cài đặt mẫu hóa đơn (`Select` "In mã hàng theo bộ mã"), `manual-shipment` (ô chọn hàng tìm mọi mã); messages 3 ngôn ngữ; tests

- [ ] **Step 1: Failing tests**: dòng hàng mã lạ hiện badge + chọn mặt hàng → badge mất; mẫu hóa đơn đổi bộ mã → xem trước in mã kế toán; lô nhập tay tìm bằng mã kho.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Kiểm trình duyệt** (`NEXT_PUBLIC_DATA_SOURCE=mock pnpm dev`): luồng thiết lập → nhập 2 file → duyệt hàng chờ → xem theo bộ → gộp; hồ sơ có mã lạ; hóa đơn in mã kế toán; sáng/tối, 1366/390, vi/en/zh.
- [ ] **Step 6: Mốc commit 1** – `pnpm typecheck && pnpm lint && pnpm test` xanh (core gồm int, Docker); 2 agent review PASS → commit `feat(catalog): danh mục hàng hóa dùng chung – mã nối, bộ mã, quy đổi, nhập & ghép (ADR 0015)` kèm spec, ADR, plan.

### Task 12: Tài liệu + mốc commit 2

**Files:** `docs/QUY-TRINH-NGHIEP-VU.md` (mục danh mục, dòng 430–433 + bước dòng hàng/tờ khai/hóa đơn), `docs/ARCHITECTURE.md` (module `catalog`, 8 bảng, job `catalog-import`), `docs/adr/0009-declaration-teaching.md` (bài học tra bí danh), `docs/adr/0015-…` (Trạng thái: Chấp thuận + ngày), `docs/BACKEND-TODO.md` (đợt sau: quyết toán, NXT, định mức, ERP hai chiều, xóa `product_catalog`), `docs/DESIGN-SYSTEM.md` nếu có component mới.

- [ ] **Step 1:** Cập nhật tài liệu.
- [ ] **Step 2: Mốc commit 2** – 2 agent review PASS → commit `docs(catalog): quy trình, kiến trúc, ADR 0015 chấp thuận`; hỏi chủ sản phẩm trước khi push.
