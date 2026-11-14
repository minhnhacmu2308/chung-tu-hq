import type { AliasSource, AliasStatus, CatalogItemFields, CatalogItemKind, CatalogMode, CodeSetKind, ItemMatchCandidateDto, ItemMatchLevel, ItemStatus } from "@kb/contracts";
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id, orgId, orgRls, timestamps } from "./shared.js";

/** Thuế suất phần trăm: tối đa 999999.9999 (như product_catalog). */
const rate = (name: string) => numeric(name, { precision: 10, scale: 4 });

/**
 * Cấu hình danh mục hàng hóa – mỗi org một dòng. `mode` null = chưa thiết lập (dữ liệu chuyển từ product_catalog) → coi như PER_DEPARTMENT
 * cho tới khi người quản trị chọn.
 */
export const catalogSettings = pgTable(
  "catalog_settings",
  {
    orgId: text("org_id").primaryKey(),
    mode: text("mode").$type<CatalogMode>(),
    itemNoPrefix: text("item_no_prefix").notNull().default("MH-"),
    /** Bộ đếm cấp mã nối: nextItemNo = UPDATE … item_no_seq + 1 RETURNING. */
    itemNoSeq: integer("item_no_seq").notNull().default(0),
    setupAt: timestamp("setup_at", { withTimezone: true }),
    ...timestamps(),
  },
  () => [check("catalog_settings_mode_chk", sql`mode is null or mode in ('SHARED', 'PER_DEPARTMENT')`), orgRls("catalog_settings_rls")],
).enableRLS();

/** Mặt hàng chuẩn. `id` giữ nguyên id cũ của product_catalog khi chuyển dữ liệu. */
export const catalogItems = pgTable(
  "catalog_items",
  {
    id: id(),
    orgId: orgId(),
    itemNo: text("item_no").notNull(),
    kind: text("kind").$type<CatalogItemKind>().notNull().default("GOODS"),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    hsCode: text("hs_code"),
    baseUnit: text("base_unit"),
    origin: text("origin"),
    tariffSchedule: text("tariff_schedule"),
    importDutyRate: rate("import_duty_rate"),
    vatRate: rate("vat_rate"),
    envTaxRate: rate("env_tax_rate"),
    exciseRate: rate("excise_rate"),
    safeguardRate: rate("safeguard_rate"),
    antiDiscriminationRate: rate("anti_discrimination_rate"),
    description: text("description"),
    note: text("note"),
    timesDeclared: integer("times_declared").notNull().default(0),
    lastDeclarationNo: text("last_declaration_no"),
    lastDeclarationDate: date("last_declaration_date", { mode: "string" }),
    lastTypeCode: text("last_type_code"),
    status: text("status").$type<ItemStatus>().notNull().default("ACTIVE"),
    mergedIntoId: text("merged_into_id"),
    source: text("source").notNull(),
    updatedBy: text("updated_by"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("catalog_items_org_item_no_uq").on(t.orgId, t.itemNo),
    index("catalog_items_org_name_idx").on(t.orgId, t.nameKey),
    index("catalog_items_org_hs_idx").on(t.orgId, t.hsCode),
    index("catalog_items_org_merged_idx").on(t.orgId, t.mergedIntoId),
    check("catalog_items_kind_chk", sql`kind in ('MATERIAL', 'PRODUCT', 'GOODS', 'SUPPLY')`),
    check("catalog_items_status_chk", sql`status in ('ACTIVE', 'MERGED', 'ARCHIVED')`),
    orgRls("catalog_items_rls"),
  ],
).enableRLS();

export const codeSets = pgTable(
  "code_sets",
  {
    id: id(),
    orgId: orgId(),
    kind: text("kind").$type<CodeSetKind>().notNull(),
    name: text("name").notNull(),
    partnerName: text("partner_name"),
    /** Tên đối tác chuẩn hóa (SUPPLIER/CUSTOMER). */
    partnerKey: text("partner_key"),
    isPrimaryDisplay: boolean("is_primary_display").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    /** Bộ nguồn gốc (spec 2026-11-14): quyết định ĐVT gốc + thông tin mặt hàng. Đúng một bộ mỗi org (unique một phần), chỉ bộ nội bộ (kiểm ở use case). */
    isSource: boolean("is_source").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index("code_sets_org_idx").on(t.orgId, t.kind),
    index("code_sets_org_partner_idx").on(t.orgId, t.partnerKey),
    uniqueIndex("code_sets_org_primary_uq").on(t.orgId).where(sql`is_primary_display`),
    uniqueIndex("code_sets_org_default_uq").on(t.orgId).where(sql`is_default`),
    uniqueIndex("code_sets_org_source_uq").on(t.orgId).where(sql`is_source`),
    // Một bộ mã mỗi (loại, đối tác) – ensurePartnerSet tự tạo bộ khi đọc chứng từ, hai request song song không sinh hai bộ.
    uniqueIndex("code_sets_org_kind_partner_uq").on(t.orgId, t.kind, t.partnerKey).where(sql`partner_key is not null`),
    check("code_sets_kind_chk", sql`kind in ('SHARED', 'ACCOUNTING', 'WAREHOUSE', 'CUSTOMS', 'SUPPLIER', 'CUSTOMER')`),
    orgRls("code_sets_rls"),
  ],
).enableRLS();

export const codeSetOwners = pgTable(
  "code_set_owners",
  {
    codeSetId: text("code_set_id")
      .notNull()
      .references(() => codeSets.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    orgId: orgId(),
  },
  (t) => [primaryKey({ columns: [t.codeSetId, t.userId] }), index("code_set_owners_org_user_idx").on(t.orgId, t.userId), orgRls("code_set_owners_rls")],
).enableRLS();

/** Bí danh: một mã trong một bộ mã → một mặt hàng. Chỉ một bí danh ACTIVE cho mỗi (bộ, code_key). */
export const itemAliases = pgTable(
  "item_aliases",
  {
    id: id(),
    orgId: orgId(),
    codeSetId: text("code_set_id")
      .notNull()
      .references(() => codeSets.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    codeKey: text("code_key").notNull(),
    name: text("name"),
    unit: text("unit"),
    itemId: text("item_id")
      .notNull()
      .references(() => catalogItems.id),
    status: text("status").$type<AliasStatus>().notNull(),
    proposedBy: text("proposed_by"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    source: text("source").$type<AliasSource>().notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("item_aliases_set_code_active_uq").on(t.codeSetId, t.codeKey).where(sql`status = 'ACTIVE'`),
    index("item_aliases_org_item_idx").on(t.orgId, t.itemId),
    index("item_aliases_org_code_key_idx").on(t.orgId, t.codeKey),
    check("item_aliases_status_chk", sql`status in ('PROPOSED', 'ACTIVE', 'REJECTED')`),
    check("item_aliases_source_chk", sql`source in ('IMPORT', 'DOCUMENT', 'MANUAL', 'MIGRATION', 'LESSON')`),
    orgRls("item_aliases_rls"),
  ],
).enableRLS();

/** "1 `unit` = `factor` base_unit" (numeric, đọc/ghi dạng chuỗi Decimal). */
export const itemUnitConversions = pgTable(
  "item_unit_conversions",
  {
    id: id(),
    orgId: orgId(),
    itemId: text("item_id")
      .notNull()
      .references(() => catalogItems.id),
    unit: text("unit").notNull(),
    factor: numeric("factor", { precision: 24, scale: 9 }).notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("item_unit_conversions_item_unit_uq").on(t.itemId, t.unit), index("item_unit_conversions_org_idx").on(t.orgId, t.itemId), orgRls("item_unit_conversions_rls")],
).enableRLS();

export const catalogImports = pgTable(
  "catalog_imports",
  {
    id: id(),
    orgId: orgId(),
    codeSetId: text("code_set_id")
      .notNull()
      .references(() => codeSets.id),
    fileName: text("file_name").notNull(),
    columnMap: jsonb("column_map").$type<Record<string, number>>().notNull(),
    status: text("status").$type<"PARSING" | "MATCHING" | "DONE" | "FAILED">().notNull().default("PARSING"),
    counts: jsonb("counts").$type<{ created: number; matched: number; queued: number; skipped: number; errors: number }>().notNull(),
    errors: jsonb("errors").$type<{ row: number; field: string; code: string }[]>().notNull(),
    /** Dòng hợp lệ chờ ghép (lưu tạm cho job catalog-import); xóa (null) khi DONE. `row` = số dòng trong file (từ 1). */
    rows: jsonb("rows").$type<{ row: number; code: string; name: string; unit?: string; hs?: string; factor?: string; linkCode?: string; fields?: CatalogItemFields; sourceRef?: string }[]>(),
    /** Tiến độ ghép: số dòng hợp lệ / đã ghép xong (mỗi lô dòng ghi cùng transaction với kết quả – chạy lại tiếp từ đây). */
    rowsTotal: integer("rows_total").notNull().default(0),
    rowsDone: integer("rows_done").notNull().default(0),
    createdBy: text("created_by"),
    ...timestamps(),
  },
  (t) => [index("catalog_imports_org_idx").on(t.orgId, t.createdAt), check("catalog_imports_status_chk", sql`status in ('PARSING', 'MATCHING', 'DONE', 'FAILED')`), orgRls("catalog_imports_rls")],
).enableRLS();

export const catalogMatchQueue = pgTable(
  "catalog_match_queue",
  {
    id: id(),
    orgId: orgId(),
    importId: text("import_id").references(() => catalogImports.id, { onDelete: "set null" }),
    codeSetId: text("code_set_id")
      .notNull()
      .references(() => codeSets.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    unit: text("unit"),
    hsCode: text("hs_code"),
    level: text("level").$type<ItemMatchLevel>().notNull(),
    suggestedItemId: text("suggested_item_id"),
    candidates: jsonb("candidates").$type<ItemMatchCandidateDto[]>().notNull(),
    reason: text("reason").notNull().default(""),
    status: text("status").$type<"PENDING" | "DONE" | "SKIPPED">().notNull().default("PENDING"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    sourceRef: text("source_ref"),
    /** Số dòng trong lần nhập đã sinh ra mục này – idempotent theo (import_id, import_row). */
    importRow: integer("import_row"),
    /** Hệ số "1 ĐVT của dòng = factor ĐVT gốc" từ cột Quy đổi của file – điền sẵn khi duyệt. */
    factor: numeric("factor", { precision: 24, scale: 9 }),
    /** Thông tin mặt hàng của dòng (chỉ khi bộ là nguồn gốc): tên, HS, loại, xuất xứ, biểu thuế, thuế suất, mô tả, ghi chú. */
    itemFields: jsonb("item_fields").$type<CatalogItemFields>(),
    ...timestamps(),
  },
  (t) => [
    index("catalog_match_queue_org_status_idx").on(t.orgId, t.status, t.codeSetId),
    uniqueIndex("catalog_match_queue_import_row_uq").on(t.importId, t.importRow).where(sql`import_id is not null and import_row is not null`),
    check("catalog_match_queue_level_chk", sql`level in ('SURE', 'MAYBE', 'NONE')`),
    check("catalog_match_queue_status_chk", sql`status in ('PENDING', 'DONE', 'SKIPPED')`),
    orgRls("catalog_match_queue_rls"),
  ],
).enableRLS();
