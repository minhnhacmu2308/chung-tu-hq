import { z } from "zod";
import { DecimalStringSchema, IsoDateTimeSchema } from "../common.js";

export const CatalogItemKindSchema = z.enum(["MATERIAL", "PRODUCT", "GOODS", "SUPPLY"]);
export type CatalogItemKind = z.infer<typeof CatalogItemKindSchema>;
export const CodeSetKindSchema = z.enum(["SHARED", "ACCOUNTING", "WAREHOUSE", "CUSTOMS", "SUPPLIER", "CUSTOMER"]);
export type CodeSetKind = z.infer<typeof CodeSetKindSchema>;
/** SHARED: một bộ "Mã chung" thay Kế toán/Kho/XNK; PER_DEPARTMENT: mỗi bộ phận một bộ mã. */
export const CatalogModeSchema = z.enum(["SHARED", "PER_DEPARTMENT"]);
export type CatalogMode = z.infer<typeof CatalogModeSchema>;
export const AliasStatusSchema = z.enum(["PROPOSED", "ACTIVE", "REJECTED"]);
export type AliasStatus = z.infer<typeof AliasStatusSchema>;
export const AliasSourceSchema = z.enum(["IMPORT", "DOCUMENT", "MANUAL", "MIGRATION", "LESSON"]);
export type AliasSource = z.infer<typeof AliasSourceSchema>;
export const ItemMatchLevelSchema = z.enum(["SURE", "MAYBE", "NONE"]);
export type ItemMatchLevel = z.infer<typeof ItemMatchLevelSchema>;
export const ItemStatusSchema = z.enum(["ACTIVE", "MERGED", "ARCHIVED"]);
export type ItemStatus = z.infer<typeof ItemStatusSchema>;

/** Hệ số "1 `unit` = `factor` đơn vị gốc": chuỗi Decimal > 0. */
export const CatalogFactorSchema = DecimalStringSchema.refine((s) => /[1-9]/.test(s) && !s.startsWith("-"), "Hệ số phải lớn hơn 0");
export const UnitConversionSchema = z.object({ unit: z.string().trim().min(1).max(30), factor: CatalogFactorSchema });
export type UnitConversion = z.infer<typeof UnitConversionSchema>;

const optText = z.string().trim().max(500).nullable();

export const CatalogItemSchema = z.object({
  id: z.string(),
  /** Mã nối `<tiền tố><6 chữ số>` – duy nhất theo doanh nghiệp, không đổi. */
  itemNo: z.string(),
  kind: CatalogItemKindSchema,
  name: z.string(),
  hsCode: z.string().nullable(),
  baseUnit: z.string().nullable(),
  origin: z.string().nullable(),
  tariffSchedule: z.string().nullable(),
  importDutyRate: DecimalStringSchema.nullable(),
  vatRate: DecimalStringSchema.nullable(),
  envTaxRate: DecimalStringSchema.nullable(),
  exciseRate: DecimalStringSchema.nullable(),
  safeguardRate: DecimalStringSchema.nullable(),
  antiDiscriminationRate: DecimalStringSchema.nullable(),
  description: z.string().nullable(),
  note: z.string().nullable(),
  timesDeclared: z.number().int().nonnegative(),
  lastDeclarationNo: z.string().nullable(),
  lastDeclarationDate: z.string().nullable(),
  status: ItemStatusSchema,
  mergedIntoId: z.string().nullable(),
  source: z.string(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const CodeSetSchema = z.object({
  id: z.string(),
  kind: CodeSetKindSchema,
  name: z.string(),
  partnerName: z.string().nullable(),
  partnerKey: z.string().nullable(),
  isPrimaryDisplay: z.boolean(),
  isDefault: z.boolean(),
  /**
   * Bộ nguồn gốc (đúng một bộ mỗi doanh nghiệp, chỉ bộ nội bộ): quyết định ĐVT gốc + tên, HS, loại, xuất xứ, biểu thuế, thuế suất, mô tả, ghi chú
   * của mặt hàng. Bộ khác chỉ đổi mã/tên/ĐVT của chính bộ đó.
   */
  isSource: z.boolean(),
  ownerIds: z.array(z.string()),
  codeCount: z.number().int().nonnegative(),
});
export type CodeSet = z.infer<typeof CodeSetSchema>;

/** Thuế suất (%) từ file / hàng chờ: chuỗi Decimal 0–1000. */
export const CatalogRateSchema = DecimalStringSchema.refine((s) => !s.startsWith("-") && rateAtMost1000(s), "Thuế suất từ 0 đến 1000");

/** So sánh ≤ 1000 trên chuỗi (không qua number – bất biến 3). */
function rateAtMost1000(s: string): boolean {
  const [int = "", frac = ""] = s.split(".");
  const n = int.replace(/^0+/, "");
  return n.length < 4 || (n === "1000" && /^0*$/.test(frac));
}

/**
 * Thông tin mặt hàng lấy từ một dòng của bộ nguồn gốc (nhập file / hàng chờ): chỉ các trường có giá trị. Áp vào mặt hàng khi dòng thuộc bộ
 * nguồn gốc; bộ khác không gửi / không lưu.
 */
export const CatalogItemFieldsSchema = z.object({
  name: z.string().trim().min(1).max(1000).optional(),
  hsCode: z.string().regex(/^\d{4,10}$/).optional(),
  kind: CatalogItemKindSchema.optional(),
  origin: z.string().regex(/^[A-Z]{2}$/).optional(),
  tariffSchedule: z.string().trim().min(1).max(100).optional(),
  importDutyRate: CatalogRateSchema.optional(),
  vatRate: CatalogRateSchema.optional(),
  envTaxRate: CatalogRateSchema.optional(),
  exciseRate: CatalogRateSchema.optional(),
  safeguardRate: CatalogRateSchema.optional(),
  antiDiscriminationRate: CatalogRateSchema.optional(),
  description: z.string().trim().min(1).max(500).optional(),
  note: z.string().trim().min(1).max(500).optional(),
});
export type CatalogItemFields = z.infer<typeof CatalogItemFieldsSchema>;

export const ItemAliasSchema = z.object({
  id: z.string(),
  codeSetId: z.string(),
  code: z.string(),
  codeKey: z.string(),
  name: z.string().nullable(),
  unit: z.string().nullable(),
  itemId: z.string(),
  status: AliasStatusSchema,
  proposedBy: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: IsoDateTimeSchema.nullable(),
  source: AliasSourceSchema,
});
export type ItemAlias = z.infer<typeof ItemAliasSchema>;

export const ItemMatchCandidateSchema = z.object({ itemId: z.string(), score: z.number().min(0).max(1), reason: z.string() });
export type ItemMatchCandidateDto = z.infer<typeof ItemMatchCandidateSchema>;

export const MatchQueueItemSchema = z.object({
  id: z.string(),
  importId: z.string().nullable(),
  codeSetId: z.string(),
  code: z.string(),
  name: z.string(),
  unit: z.string().nullable(),
  hsCode: z.string().nullable(),
  level: ItemMatchLevelSchema,
  suggestedItemId: z.string().nullable(),
  candidates: z.array(ItemMatchCandidateSchema).max(5),
  reason: z.string(),
  status: z.enum(["PENDING", "DONE", "SKIPPED"]),
  decidedBy: z.string().nullable(),
  decidedAt: IsoDateTimeSchema.nullable(),
  sourceRef: z.string().nullable(),
  /** Hệ số "1 ĐVT của dòng = factor ĐVT gốc" từ cột Quy đổi của file – giao diện điền sẵn ô hệ số khi duyệt. */
  factor: CatalogFactorSchema.nullable(),
  /** Thông tin mặt hàng của dòng (chỉ khi bộ là nguồn gốc): "Tạo mới" dùng làm dữ liệu mặt hàng, "Xác nhận" áp vào mặt hàng có sẵn. */
  itemFields: CatalogItemFieldsSchema.nullable(),
});
export type MatchQueueItem = z.infer<typeof MatchQueueItemSchema>;

export const CatalogImportSchema = z.object({
  id: z.string(),
  codeSetId: z.string(),
  fileName: z.string(),
  columnMap: z.record(z.string(), z.number().int().nonnegative()),
  status: z.enum(["PARSING", "MATCHING", "DONE", "FAILED"]),
  /** created + matched + queued + skipped = progress.total; skipped = mã đã chờ duyệt sẵn trong bộ hoặc bị bỏ qua khi duyệt. */
  counts: z.object({ created: z.number().int(), matched: z.number().int(), queued: z.number().int(), skipped: z.number().int(), errors: z.number().int() }),
  errors: z.array(z.object({ row: z.number().int(), field: z.string(), code: z.string() })),
  /** Tiến độ ghép (job nền): số dòng hợp lệ đã ghép / tổng số dòng hợp lệ. */
  progress: z.object({ done: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
  createdAt: IsoDateTimeSchema,
  createdBy: z.string().nullable(),
});
export type CatalogImport = z.infer<typeof CatalogImportSchema>;

/** Chi tiết mặt hàng: thông tin chung + mã theo từng bộ + quy đổi + nơi đã dùng. */
export const CatalogItemDetailSchema = z.object({
  item: CatalogItemSchema,
  aliases: z.array(ItemAliasSchema),
  conversions: z.array(UnitConversionSchema),
  usage: z.object({
    declarations: z.array(z.object({ declarationNo: z.string().nullable(), date: z.string().nullable() })),
    invoices: z.array(z.object({ invoiceNo: z.string().nullable(), date: z.string().nullable() })),
  }),
});
export type CatalogItemDetail = z.infer<typeof CatalogItemDetailSchema>;

/**
 * Một dòng lịch sử sửa mặt hàng (field_audit source CATALOG_EDIT, mới nhất trước). `key`: tên trường (`name`, `hsCode`, `status`…),
 * `item` (tạo), `merge`, `alias:<bộ mã>:<mã>`, `alias:…:name|unit`, `conv:<ĐVT>`.
 */
export const CatalogItemHistoryEntrySchema = z.object({ key: z.string(), oldValue: z.string(), newValue: z.string(), userId: z.string(), at: IsoDateTimeSchema });
export type CatalogItemHistoryEntry = z.infer<typeof CatalogItemHistoryEntrySchema>;

const hsOpt = z
  .string()
  .trim()
  .transform((s) => s.replace(/[.\s]/g, ""))
  .pipe(z.union([z.literal(""), z.string().regex(/^\d{4,10}$/, "Mã HS gồm 4–10 chữ số")]))
  .transform((s) => (s === "" ? null : s))
  .nullable();

export const CreateItemInputSchema = z.object({
  kind: CatalogItemKindSchema,
  name: z.string().trim().min(1).max(500),
  hsCode: hsOpt.optional(),
  baseUnit: z.string().trim().min(1).max(30).nullable().optional(),
  origin: optText.optional(),
  description: optText.optional(),
  note: optText.optional(),
  /** Mã đầu tiên trong bộ mã (tạo kèm bí danh). */
  codeSetId: z.string().optional(),
  code: z.string().trim().min(1).max(100).optional(),
  conversions: z.array(UnitConversionSchema).max(50).optional(),
});
export type CreateItemInput = z.infer<typeof CreateItemInputSchema>;

export const UpdateItemInputSchema = CreateItemInputSchema.omit({ codeSetId: true, code: true }).partial().extend({
  importDutyRate: DecimalStringSchema.nullable().optional(),
  vatRate: DecimalStringSchema.nullable().optional(),
  tariffSchedule: optText.optional(),
});
export type UpdateItemInput = z.infer<typeof UpdateItemInputSchema>;

export const UpsertCodeSetInputSchema = z.object({
  kind: CodeSetKindSchema,
  name: z.string().trim().min(1).max(100),
  partnerName: z.string().trim().max(200).nullable().optional(),
  ownerIds: z.array(z.string()).max(50).optional(),
  isPrimaryDisplay: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});
export type UpsertCodeSetInput = z.infer<typeof UpsertCodeSetInputSchema>;

export const ProposeAliasInputSchema = z.object({
  itemId: z.string(),
  codeSetId: z.string(),
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().max(500).nullable().optional(),
  unit: z.string().trim().max(30).nullable().optional(),
  factor: CatalogFactorSchema.optional(),
});
export type ProposeAliasInput = z.infer<typeof ProposeAliasInputSchema>;

/**
 * Duyệt một mục hàng chờ: CONFIRM (gợi ý; mục không có gợi ý = tạo mặt hàng mới) · CHOOSE (`itemId`) · CREATE (mặt hàng mới, loại `kind`, mặc định GOODS) · SKIP.
 * `factor`: hệ số "1 ĐVT của dòng = factor ĐVT gốc" khi ĐVT khác ĐVT gốc mà chưa có quy đổi.
 */
export const DecideQueueInputSchema = z.object({
  action: z.enum(["CONFIRM", "CHOOSE", "CREATE", "SKIP"]),
  itemId: z.string().optional(),
  factor: CatalogFactorSchema.optional(),
  kind: CatalogItemKindSchema.optional(),
});
export type DecideQueueInput = z.infer<typeof DecideQueueInputSchema>;

/** Xác nhận hàng loạt (tối đa 500 mục / lần). */
export const DecideQueueBulkInputSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500), action: z.literal("CONFIRM") });
export type DecideQueueBulkInput = z.infer<typeof DecideQueueBulkInputSchema>;
/** Kết quả hàng loạt: mục xử lý được + mục lỗi (mã lý do, vd CATALOG_UNIT_FACTOR_REQUIRED, CATALOG_QUEUE_ITEM_DONE). */
export const DecideQueueBulkResultSchema = z.object({
  decided: z.array(z.string()),
  failed: z.array(z.object({ id: z.string(), code: z.string(), reason: z.string().nullable() })),
});
export type DecideQueueBulkResult = z.infer<typeof DecideQueueBulkResultSchema>;

/** Lấy từ chứng từ đã đọc: dòng tờ khai đã duyệt (→ bộ XNK) hoặc dòng invoice/packing list có Part No (→ bộ nhà cung cấp theo người bán). */
export const ImportFromDocumentsInputSchema = z.object({ source: z.enum(["DECLARATIONS", "INVOICES"]) });
export type ImportFromDocumentsInput = z.infer<typeof ImportFromDocumentsInputSchema>;

/** Cờ trên query string: "true"/"1" → true, "false"/"0" → false (z.coerce.boolean coi "false" là true). */
const queryFlag = z.union([z.boolean(), z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1")]);

/** Hàng chờ ghép: "Của tôi" (bộ mã mình phụ trách), bộ mã, mức, trạng thái (mặc định PENDING). */
export const ListQueueQuerySchema = z.object({
  mine: queryFlag.optional(),
  codeSetId: z.string().optional(),
  level: ItemMatchLevelSchema.optional(),
  status: z.enum(["PENDING", "DONE", "SKIPPED"]).default("PENDING"),
  importId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type ListQueueQuery = z.infer<typeof ListQueueQuerySchema>;
/** Tóm tắt mặt hàng đích của mục hàng chờ (mặt hàng đã gộp → mặt hàng cuối chuỗi) – đủ cho nhãn nút và ô hệ số, không phải tải chi tiết từng mặt hàng. */
export const QueueTargetSummarySchema = z.object({ id: z.string(), itemNo: z.string(), name: z.string(), hsCode: z.string().nullable(), baseUnit: z.string().nullable() });
export type QueueTargetSummary = z.infer<typeof QueueTargetSummarySchema>;
/**
 * Dòng danh sách hàng chờ: mục + mặt hàng gợi ý (`needsFactor`: ĐVT của mục ≠ ĐVT gốc mà chưa có quy đổi → bắt buộc nhập hệ số khi xác nhận)
 * + tóm tắt ứng viên (≤ 5, kèm điểm và lý do).
 */
export const MatchQueueListRowSchema = MatchQueueItemSchema.extend({
  suggested: QueueTargetSummarySchema.extend({ needsFactor: z.boolean() }).nullable(),
  candidateItems: z.array(QueueTargetSummarySchema.extend({ score: z.number().min(0).max(1), reason: z.string() })).max(5),
});
export type MatchQueueListRow = z.infer<typeof MatchQueueListRowSchema>;
export const MatchQueuePageSchema = z.object({ rows: z.array(MatchQueueListRowSchema), total: z.number().int().nonnegative(), page: z.number().int(), pageSize: z.number().int() });
export type MatchQueuePage = z.infer<typeof MatchQueuePageSchema>;

/** Truy vấn danh sách mặt hàng: tìm theo mã nối / tên / mọi mã; `codeSetId` → cột mã/tên/ĐVT theo bộ đó. */
export const ListCatalogItemsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  codeSetId: z.string().optional(),
  kind: CatalogItemKindSchema.optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  missingCustoms: queryFlag.optional(),
  missingFactor: queryFlag.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListCatalogItemsQuery = z.infer<typeof ListCatalogItemsQuerySchema>;

/** Dòng danh sách mặt hàng: mã hiển thị chính (không có → mã nối), số bộ có mã, mã/tên/ĐVT theo bộ đang xem. */
export const CatalogItemListRowSchema = CatalogItemSchema.extend({
  displayCode: z.string(),
  codeSetCount: z.number().int().nonnegative(),
  setCode: z.string().nullable(),
  setName: z.string().nullable(),
  setUnit: z.string().nullable(),
  missingCustoms: z.boolean(),
  missingFactor: z.boolean(),
});
export type CatalogItemListRow = z.infer<typeof CatalogItemListRowSchema>;

export const CatalogItemPageSchema = z.object({ rows: z.array(CatalogItemListRowSchema), total: z.number().int().nonnegative(), page: z.number().int(), pageSize: z.number().int() });
export type CatalogItemPage = z.infer<typeof CatalogItemPageSchema>;

/** Bảng đối chiếu mã: mỗi dòng một mã nối + mã ở mọi bộ (theo id bộ), tên, HS, ĐVT gốc, hệ số quy đổi. */
export const CrossReferenceRowSchema = z.object({
  itemNo: z.string(),
  name: z.string(),
  hs: z.string().nullable(),
  baseUnit: z.string().nullable(),
  codes: z.record(z.string(), z.array(z.string())),
  factors: z.record(z.string(), z.string()),
});
export type CrossReferenceRow = z.infer<typeof CrossReferenceRowSchema>;
export const CrossReferenceSchema = z.object({ codeSets: z.array(z.object({ id: z.string(), kind: CodeSetKindSchema, name: z.string() })), rows: z.array(CrossReferenceRowSchema) });
export type CrossReference = z.infer<typeof CrossReferenceSchema>;

/** Thiết lập lần đầu: chế độ, tiền tố mã nối, các bộ mã + người phụ trách, loại bộ làm mã hiển thị chính. */
export const SetupCatalogInputSchema = z.object({
  mode: CatalogModeSchema,
  /** Bỏ trống → giữ tiền tố hiện có (lần đầu: mặc định "MH-" của catalog_settings). */
  prefix: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9\-_.]+$/).optional(),
  sets: z.array(z.object({ kind: CodeSetKindSchema, name: z.string().trim().min(1).max(100), ownerIds: z.array(z.string()).max(50).default([]) })).max(20).default([]),
  primaryDisplayKind: CodeSetKindSchema.nullable().optional(),
  /**
   * Bộ nguồn gốc khi PER_DEPARTMENT (giao diện bắt buộc chọn, gợi ý CUSTOMS; bỏ trống = CUSTOMS). SHARED: bộ "Mã chung" luôn là nguồn gốc (bỏ qua).
   * Doanh nghiệp đã có bộ nguồn gốc khác mà bộ chọn đã có mã → CATALOG_MODE_CONFLICT (dùng "Đổi bộ nguồn gốc").
   */
  sourceKind: z.enum(["ACCOUNTING", "WAREHOUSE", "CUSTOMS"]).optional(),
});
export type SetupCatalogInput = z.infer<typeof SetupCatalogInputSchema>;

/** Đổi bộ nguồn gốc (PUT /api/org/catalog/code-sets/source): Quản trị/Chủ hoặc người phụ trách bộ đích. Gọi lại = "Áp dụng lại" (idempotent). */
export const ChangeSourceInputSchema = z.object({ codeSetId: z.string().min(1) });
export type ChangeSourceInput = z.infer<typeof ChangeSourceInputSchema>;
/** GET /api/org/catalog/code-sets/source/preview?codeSetId= */
export const SourcePreviewQuerySchema = z.object({ codeSetId: z.string().min(1) });

/** Mặt hàng không đổi gốc được: mã ở bộ mới có ĐVT khác ĐVT gốc mà chưa có hệ số quy đổi – bổ sung hệ số rồi "Áp dụng lại". */
export const SourceChangeBlockedItemSchema = z.object({ itemId: z.string(), itemNo: z.string(), name: z.string(), code: z.string(), baseUnit: z.string().nullable(), newUnit: z.string().nullable() });
export type SourceChangeBlockedItem = z.infer<typeof SourceChangeBlockedItemSchema>;
/**
 * Xem trước đổi bộ nguồn gốc. `totalItems`: mặt hàng ACTIVE · `rebaseCount`: sẽ đổi ĐVT gốc · `unchangedCount`: có mã ở bộ mới, cùng ĐVT gốc (hoặc mã không có ĐVT)
 * · `missingCount`: không có mã ở bộ mới (giữ nguyên) · `blocked`: thiếu hệ số.
 */
export const SourceChangePreviewSchema = z.object({
  codeSetId: z.string(),
  currentSourceId: z.string().nullable(),
  totalItems: z.number().int().nonnegative(),
  rebaseCount: z.number().int().nonnegative(),
  unchangedCount: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  blocked: z.array(SourceChangeBlockedItemSchema),
});
export type SourceChangePreview = z.infer<typeof SourceChangePreviewSchema>;
/** Kết quả thực hiện: danh sách bộ mã mới (cờ isSource), số mặt hàng đã đổi gốc, mặt hàng còn thiếu hệ số; `changed` = cờ nguồn gốc vừa chuyển. */
export const SourceChangeResultSchema = z.object({
  codeSets: z.array(CodeSetSchema),
  rebased: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  blocked: z.array(SourceChangeBlockedItemSchema),
  changed: z.boolean(),
});
export type SourceChangeResult = z.infer<typeof SourceChangeResultSchema>;

/** Đổi chế độ: sang PER_DEPARTMENT chọn bộ "Mã chung" thành loại nào (không thành XNK → chọn/tạo bộ XNK mặc định); sang SHARED khi còn đúng một bộ nội bộ. */
export const ChangeCatalogModeInputSchema = z.discriminatedUnion("to", [
  z.object({ to: z.literal("PER_DEPARTMENT"), sharedBecomes: z.enum(["ACCOUNTING", "WAREHOUSE", "CUSTOMS"]), customsSetId: z.string().optional() }),
  z.object({ to: z.literal("SHARED") }),
]);
export type ChangeCatalogModeInput = z.infer<typeof ChangeCatalogModeInputSchema>;

// ---- Đầu vào/đầu ra của route /api/org/catalog/** (web http + mock dùng chung) ----

/** Giá trị gửi lên (trước khi Zod điền mặc định page/pageSize). */
export type ListCatalogItemsQueryInput = z.input<typeof ListCatalogItemsQuerySchema>;
export type ListQueueQueryInput = z.input<typeof ListQueueQuerySchema>;
export type CreateItemRequest = z.input<typeof CreateItemInputSchema>;
export type UpdateItemRequest = z.input<typeof UpdateItemInputSchema>;
export type SetupCatalogRequest = z.input<typeof SetupCatalogInputSchema>;

/** Chế độ danh mục: `mode` null = chưa thiết lập (coi như PER_DEPARTMENT). */
export const CatalogSettingsViewSchema = z.object({ mode: CatalogModeSchema.nullable(), effectiveMode: CatalogModeSchema, itemNoPrefix: z.string(), setupAt: IsoDateTimeSchema.nullable() });
export type CatalogSettingsView = z.infer<typeof CatalogSettingsViewSchema>;

/** Tạo mặt hàng: tạo thẳng (đủ quyền) hoặc vào hàng chờ ghép (DECLARANT không phụ trách bộ mã). */
export const CreateItemResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("CREATED"), item: CatalogItemDetailSchema }),
  z.object({ status: z.literal("QUEUED"), queueId: z.string() }),
]);
export type CreateItemResult = z.infer<typeof CreateItemResultSchema>;

/** Ngưng dùng (true) / dùng lại (false) mặt hàng. */
export const ArchiveItemInputSchema = z.object({ archived: z.boolean() });
/** Gộp mặt hàng trong đường dẫn vào `intoId`. */
export const MergeItemsInputSchema = z.object({ intoId: z.string().min(1) });
/** Tách các bí danh (cùng một mặt hàng) sang mặt hàng mới. */
export const SplitAliasesInputSchema = z.object({
  aliasIds: z.array(z.string().min(1)).min(1).max(200),
  newItem: CreateItemInputSchema.pick({ kind: true, name: true, hsCode: true, baseUnit: true, origin: true, description: true, note: true }),
});
export type SplitAliasesInput = z.input<typeof SplitAliasesInputSchema>;

/** Thao tác trên một bí danh: duyệt / từ chối đề xuất, chuyển sang mặt hàng khác (`factor` khi ĐVT khác ĐVT gốc chưa có quy đổi). */
export const AliasActionInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("APPROVE"), factor: CatalogFactorSchema.optional() }),
  z.object({ action: z.literal("REJECT") }),
  z.object({ action: z.literal("MOVE"), toItemId: z.string().min(1), factor: CatalogFactorSchema.optional() }),
]);
export type AliasActionInput = z.infer<typeof AliasActionInputSchema>;

/** Quy đổi mặc định "1 `unit` = `factor` ĐVT gốc" của mặt hàng. */
export const SetConversionInputSchema = z.object({ itemId: z.string().min(1), unit: z.string().trim().min(1).max(30), factor: CatalogFactorSchema });
export type SetConversionInput = z.infer<typeof SetConversionInputSchema>;
export const RemoveConversionQuerySchema = z.object({ itemId: z.string().min(1), unit: z.string().trim().min(1).max(30) });

/** Bộ mã hiển thị chính (null = hiển thị mã nối). */
export const SetPrimaryDisplayInputSchema = z.object({ codeSetId: z.string().min(1).nullable() });

/** Tra mã: bộ mã (hoặc tên đối tác), mã, tên, HS, ĐVT – thiếu hết → NONE. */
export const ResolveItemQuerySchema = z.object({
  codeSetId: z.string().min(1).optional(),
  partnerName: z.string().trim().max(300).optional(),
  code: z.string().trim().max(200).optional(),
  name: z.string().trim().max(1000).optional(),
  hsCode: z.string().trim().max(50).optional(),
  unit: z.string().trim().max(30).optional(),
});
export type ResolveItemQueryInput = z.infer<typeof ResolveItemQuerySchema>;
export const ResolveItemResultSchema = z.object({
  itemId: z.string().nullable(),
  aliasId: z.string().optional(),
  level: ItemMatchLevelSchema,
  reason: z.string(),
  factor: z.string().optional(),
  codeSetId: z.string().nullable(),
  candidates: z.array(ItemMatchCandidateSchema),
});
export type ResolveItemResultDto = z.infer<typeof ResolveItemResultSchema>;

/** Tra nhiều dòng một lần (gợi ý HS đã khai cho mọi dòng hàng của hồ sơ…): tối đa RESOLVE_MANY_MAX_ROWS dòng mỗi yêu cầu. */
export const RESOLVE_MANY_MAX_ROWS = 500;
const resolveOpt = (max: number) => z.string().trim().max(max).optional();
export const ResolveManyRowSchema = z.object({
  name: z.string().trim().max(1000),
  hsCode: resolveOpt(50),
  code: resolveOpt(200),
  unit: resolveOpt(30),
  partnerName: resolveOpt(300),
});
export type ResolveManyRow = z.infer<typeof ResolveManyRowSchema>;
export const ResolveManyInputSchema = z.object({ rows: z.array(ResolveManyRowSchema).min(1).max(RESOLVE_MANY_MAX_ROWS) });
export type ResolveManyInput = z.infer<typeof ResolveManyInputSchema>;
/** Tóm tắt mặt hàng kèm kết quả tra (đủ để gợi ý mã HS đã khai). */
export const CatalogItemSummarySchema = z.object({ id: z.string(), itemNo: z.string(), name: z.string(), hsCode: z.string().nullable(), timesDeclared: z.number().int().nonnegative() });
export type CatalogItemSummary = z.infer<typeof CatalogItemSummarySchema>;
/** Kết quả một dòng: như ResolveItemResult, mỗi ứng viên kèm tóm tắt mặt hàng. Theo đúng thứ tự dòng gửi lên. */
export const ResolveManyResultSchema = ResolveItemResultSchema.extend({ candidates: z.array(ItemMatchCandidateSchema.extend({ item: CatalogItemSummarySchema })) });
export type ResolveManyResult = z.infer<typeof ResolveManyResultSchema>;
