import type { AliasSource, AliasStatus, CatalogItemFields, CatalogItemKind, CatalogMode, CodeSetKind, ItemMatchCandidateDto, ItemMatchLevel, ItemStatus } from "@kb/contracts";
import type { FieldAuditRepo, OrgAuditWriter } from "../../../shared/audit.js";
import type { Clock } from "../../../shared/clock.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";

/** Thuế suất / hệ số: chuỗi Decimal (bất biến 3). Thời điểm UTC (Date), ngày nghiệp vụ YYYY-MM-DD. */
export type CatalogSettingsRow = { orgId: string; mode: CatalogMode | null; itemNoPrefix: string; itemNoSeq: number; setupAt: Date | null; createdAt: Date; updatedAt: Date };

export type CatalogItemRow = {
  id: string;
  orgId: string;
  itemNo: string;
  kind: CatalogItemKind;
  name: string;
  nameKey: string;
  hsCode: string | null;
  baseUnit: string | null;
  origin: string | null;
  tariffSchedule: string | null;
  importDutyRate: string | null;
  vatRate: string | null;
  envTaxRate: string | null;
  exciseRate: string | null;
  safeguardRate: string | null;
  antiDiscriminationRate: string | null;
  /** ĐVT số lượng 2 + tỷ lệ (số ĐVT 2 trong 1 ĐVT gốc; numeric(24,9) đọc ra có thể "0.250000000" – so bằng Decimal). */
  qty2Unit: string | null;
  qty2Factor: string | null;
  description: string | null;
  note: string | null;
  timesDeclared: number;
  lastDeclarationNo: string | null;
  lastDeclarationDate: string | null;
  lastTypeCode: string | null;
  status: ItemStatus;
  mergedIntoId: string | null;
  source: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** `isSource`: bộ nguồn gốc (unique một phần theo org – đúng một bộ, chỉ bộ nội bộ). */
export type CodeSetRow = { id: string; orgId: string; kind: CodeSetKind; name: string; partnerName: string | null; partnerKey: string | null; isPrimaryDisplay: boolean; isDefault: boolean; isSource: boolean; createdAt: Date; updatedAt: Date };

export type ItemAliasRow = {
  id: string;
  orgId: string;
  codeSetId: string;
  code: string;
  codeKey: string;
  name: string | null;
  unit: string | null;
  itemId: string;
  status: AliasStatus;
  proposedBy: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  source: AliasSource;
  createdAt: Date;
  updatedAt: Date;
};

export type ItemConversionRow = { id: string; orgId: string; itemId: string; unit: string; factor: string; createdAt: Date; updatedAt: Date };

export type MatchQueueRow = {
  id: string;
  orgId: string;
  importId: string | null;
  codeSetId: string;
  code: string;
  name: string;
  unit: string | null;
  hsCode: string | null;
  level: ItemMatchLevel;
  suggestedItemId: string | null;
  candidates: ItemMatchCandidateDto[];
  reason: string;
  status: "PENDING" | "DONE" | "SKIPPED";
  decidedBy: string | null;
  decidedAt: Date | null;
  sourceRef: string | null;
  /** Số dòng trong lần nhập đã sinh ra mục (idempotent theo (importId, importRow)); mục không từ lần nhập → null/vắng. */
  importRow?: number | null;
  /** Hệ số từ cột Quy đổi của dòng (chuỗi Decimal) – điền sẵn khi duyệt. */
  factor?: string | null;
  /** Thông tin mặt hàng của dòng – chỉ khi bộ là nguồn gốc (dòng file Excel). */
  itemFields?: CatalogItemFields | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Dòng hợp lệ chờ ghép, lưu tạm trong catalog_imports.rows. `row` = số dòng trong file (từ 1); `sourceRef` = chứng từ sinh ra dòng;
 * `linkCode` = cột Mã nối; `fields` = thông tin mặt hàng (chỉ lưu khi bộ nhận là bộ nguồn gốc).
 */
export type CatalogStagedRow = { row: number; code: string; name: string; unit?: string; hs?: string; factor?: string; linkCode?: string; fields?: CatalogItemFields; sourceRef?: string };

/** Hệ số theo lô của một dòng tờ khai gắn mặt hàng (line_items.unit_factor khác null; đơn vị = ĐVT gốc). */
export type CatalogLineFactorRow = { id: string; dossierId: string; lineNo: number; catalogItemId: string; unitFactor: string };
/**
 * created: mặt hàng tạo từ lần nhập (qua duyệt hàng chờ) · matched: tự ghép / mã đã có cập nhật / xác nhận ghép · queued: còn chờ duyệt
 * · skipped: mã đã chờ duyệt sẵn trong bộ, hoặc bị bỏ qua khi duyệt · errors: dòng lỗi. Luôn: created + matched + queued + skipped = rowsTotal.
 */
export type CatalogImportCounts = { created: number; matched: number; queued: number; skipped: number; errors: number };

export type CatalogImportRow = {
  id: string;
  orgId: string;
  codeSetId: string;
  fileName: string;
  columnMap: Record<string, number>;
  status: "PARSING" | "MATCHING" | "DONE" | "FAILED";
  counts: CatalogImportCounts;
  errors: { row: number; field: string; code: string }[];
  /** Dòng chờ ghép (null khi DONE). */
  rows: CatalogStagedRow[] | null;
  rowsTotal: number;
  rowsDone: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface CatalogSettingsRepo {
  get(orgId: OrgId): Promise<CatalogSettingsRow | null>;
  /** Tạo dòng cấu hình nếu chưa có, ghi đè các trường đưa vào. */
  upsert(orgId: OrgId, patch: Partial<Pick<CatalogSettingsRow, "mode" | "itemNoPrefix" | "setupAt">>, now: Date): Promise<CatalogSettingsRow>;
  /** Cấp số tăng dần an toàn đồng thời (UPDATE … item_no_seq + 1 RETURNING); tạo dòng cấu hình nếu chưa có. Trả mã nối `<tiền tố><6 chữ số>`. */
  nextItemNo(orgId: OrgId): Promise<string>;
}

export interface CatalogItemRepo {
  get(orgId: OrgId, id: string): Promise<CatalogItemRow | null>;
  getMany(orgId: OrgId, ids: string[]): Promise<CatalogItemRow[]>;
  findByItemNo(orgId: OrgId, itemNo: string): Promise<CatalogItemRow | null>;
  /** Đi theo chuỗi merged_into_id tới mặt hàng cuối (A→B→C ra C). Không có/chu trình → null. */
  resolveMerged(orgId: OrgId, id: string): Promise<CatalogItemRow | null>;
  list(orgId: OrgId, filter?: { status?: ItemStatus }): Promise<CatalogItemRow[]>;
  insert(row: CatalogItemRow): Promise<void>;
  update(orgId: OrgId, id: string, patch: Partial<Omit<CatalogItemRow, "id" | "orgId" | "createdAt">>): Promise<void>;
  /** Khóa dòng (SELECT … FOR UPDATE, theo thứ tự id) – gộp đồng thời A→B và B→A không cùng thành công. */
  lockForUpdate(orgId: OrgId, ids: string[]): Promise<void>;
  /** Đặt MERGED + merged_into_id chỉ khi dòng chưa MERGED; trả false nếu không dòng nào đổi. */
  markMerged(orgId: OrgId, id: string, intoId: string, by: string, at: Date): Promise<boolean>;
  /** times_declared + 1 NGUYÊN TỬ (một câu UPDATE, không đọc-rồi-ghi) kèm các cột lần khai gần nhất (nếu có). */
  incrementDeclared(orgId: OrgId, id: string, patch: Partial<Pick<CatalogItemRow, "lastDeclarationNo" | "lastDeclarationDate" | "lastTypeCode" | "updatedAt">>): Promise<void>;
  /**
   * Số tờ khai Hải quan cấp (sau duyệt): ghi last_declaration_no + ngày NGUYÊN TỬ (một câu UPDATE) chỉ khi ngày đang lưu trống hoặc ≤ `date`
   * (không đè tờ khai mới hơn). Không đụng times_declared. true = đã ghi.
   */
  recordDeclarationNo(orgId: OrgId, id: string, declarationNo: string, date: string, now: Date): Promise<boolean>;
}

export interface CodeSetRepo {
  get(orgId: OrgId, id: string): Promise<CodeSetRow | null>;
  list(orgId: OrgId): Promise<CodeSetRow[]>;
  insert(row: CodeSetRow): Promise<void>;
  update(orgId: OrgId, id: string, patch: Partial<Omit<CodeSetRow, "id" | "orgId" | "createdAt">>): Promise<void>;
}

export interface CodeSetOwnerRepo {
  list(orgId: OrgId, codeSetId: string): Promise<string[]>;
  /** Thay toàn bộ danh sách người phụ trách của bộ mã. */
  replace(orgId: OrgId, codeSetId: string, userIds: string[]): Promise<void>;
  isOwner(orgId: OrgId, codeSetId: string, userId: UserId): Promise<boolean>;
}

export interface ItemAliasRepo {
  get(orgId: OrgId, id: string): Promise<ItemAliasRow | null>;
  /** Bí danh ACTIVE của (bộ, code_key). */
  findActive(orgId: OrgId, codeSetId: string, codeKey: string): Promise<ItemAliasRow | null>;
  /** Mọi bí danh ACTIVE có code_key này (mọi bộ mã) – cho luật SURE(c). */
  listActiveByCodeKey(orgId: OrgId, codeKey: string): Promise<ItemAliasRow[]>;
  listForItem(orgId: OrgId, itemId: string): Promise<ItemAliasRow[]>;
  /** Bí danh của nhiều mặt hàng (một truy vấn) – tóm tắt mặt hàng cho chứng từ. */
  listForItems(orgId: OrgId, itemIds: string[]): Promise<ItemAliasRow[]>;
  listForCodeSet(orgId: OrgId, codeSetId: string, filter?: { status?: AliasStatus }): Promise<ItemAliasRow[]>;
  /** Mọi bí danh của doanh nghiệp (lọc trạng thái) – tìm kiếm, bảng đối chiếu, chỉ mục ghép. */
  listByOrg(orgId: OrgId, filter?: { status?: AliasStatus }): Promise<ItemAliasRow[]>;
  /** Vi phạm unique (bộ, code_key) ACTIVE → ném lỗi. */
  insert(row: ItemAliasRow): Promise<void>;
  update(orgId: OrgId, id: string, patch: Partial<Omit<ItemAliasRow, "id" | "orgId" | "createdAt">>): Promise<void>;
}

export interface ItemConversionRepo {
  listForItem(orgId: OrgId, itemId: string): Promise<ItemConversionRow[]>;
  /** Quy đổi của nhiều mặt hàng (một truy vấn). */
  listForItems(orgId: OrgId, itemIds: string[]): Promise<ItemConversionRow[]>;
  listByOrg(orgId: OrgId): Promise<ItemConversionRow[]>;
  /** Thêm hoặc cập nhật hệ số của (mặt hàng, ĐVT). */
  upsert(row: ItemConversionRow): Promise<void>;
  delete(orgId: OrgId, itemId: string, unit: string): Promise<void>;
}

export interface MatchQueueRepo {
  get(orgId: OrgId, id: string): Promise<MatchQueueRow | null>;
  list(orgId: OrgId, filter?: { status?: MatchQueueRow["status"]; codeSetId?: string; importId?: string }): Promise<MatchQueueRow[]>;
  insert(row: MatchQueueRow): Promise<void>;
  update(orgId: OrgId, id: string, patch: Partial<Omit<MatchQueueRow, "id" | "orgId" | "createdAt">>): Promise<void>;
  /** Đóng mục chỉ khi còn PENDING (UPDATE … WHERE status = 'PENDING'); false = đã có người xử lý. */
  claim(orgId: OrgId, id: string, patch: Pick<MatchQueueRow, "status" | "decidedBy" | "decidedAt" | "updatedAt"> & Partial<Pick<MatchQueueRow, "suggestedItemId">>): Promise<boolean>;
}

export interface CatalogImportRepo {
  get(orgId: OrgId, id: string): Promise<CatalogImportRow | null>;
  /** SELECT … FOR UPDATE: khóa dòng lần nhập tới hết transaction (hai lần chạy job song song không ghép trùng một lô). */
  getForUpdate(orgId: OrgId, id: string): Promise<CatalogImportRow | null>;
  list(orgId: OrgId): Promise<CatalogImportRow[]>;
  insert(row: CatalogImportRow): Promise<void>;
  update(orgId: OrgId, id: string, patch: Partial<Omit<CatalogImportRow, "id" | "orgId" | "createdAt">>): Promise<void>;
  /** Cộng dồn nguyên tử vào counts (jsonb) – an toàn khi ghép nền và duyệt hàng chờ chạy song song. */
  bumpCounts(orgId: OrgId, id: string, delta: Partial<CatalogImportCounts>, now: Date): Promise<void>;
}

/**
 * Hệ số theo lô trên dòng tờ khai (bảng line_items của declaration) – CHỈ dùng khi đổi ĐVT gốc mặt hàng (spec 2026-11-14 §2) để chia lại hệ số
 * trong CÙNG transaction với quy đổi. Hiện thực ở db/catalog-line-factors.ts (như field_audit), chỉ đọc/ghi cột unit_factor.
 */
export interface CatalogLineFactorRepo {
  listForItems(orgId: OrgId, itemIds: string[]): Promise<CatalogLineFactorRow[]>;
  setFactor(orgId: OrgId, id: string, factor: string, now: Date): Promise<void>;
}

export interface CatalogRepos {
  settings: CatalogSettingsRepo;
  lineFactors: CatalogLineFactorRepo;
  items: CatalogItemRepo;
  codeSets: CodeSetRepo;
  owners: CodeSetOwnerRepo;
  aliases: ItemAliasRepo;
  conversions: ItemConversionRepo;
  queue: MatchQueueRepo;
  imports: CatalogImportRepo;
  /**
   * field_audit (bảng dùng chung, append-only) – lịch sử mặt hàng (CATALOG_EDIT; `dossierId` = id mặt hàng, cột dossier_id là khóa đối tượng, không FK).
   * Ghi CÙNG transaction với lệnh sửa danh mục (bất biến 6); đọc lịch sử cũng qua đây.
   */
  fieldAudit: FieldAuditRepo;
}

export interface CatalogUow {
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: CatalogRepos) => Promise<T>): Promise<T>;
}


/** Thành viên doanh nghiệp (identity) – kiểm người phụ trách bộ mã: đang hoạt động và vai trò ≠ VIEWER. Gọi ngoài transaction. */
export interface CatalogMembers {
  /** Trả tập userId (trong danh sách đưa vào) là thành viên ACTIVE, vai trò ≠ VIEWER của org. */
  eligibleOwners(orgId: OrgId, userIds: string[]): Promise<Set<string>>;
}

/** Một dòng hàng từ chứng từ đã có: mã (mã hàng tờ khai / Part No), tên, ĐVT, HS, đối tác (người bán), nguồn. */
export type CatalogDocumentLine = {
  code: string; name: string; unit?: string | null; hsCode?: string | null; partnerName?: string | null;
  /** Loại bộ mã đối tác (dòng chứng từ): SUPPLIER = người bán của hồ sơ nhập, CUSTOMER = người mua của hồ sơ xuất. */
  partnerKind?: "SUPPLIER" | "CUSTOMER" | null;
  sourceRef: string;
};

/**
 * Đọc dòng hàng từ chứng từ đã có – hiện thực ở composition root qua public API của declaration / extraction.
 * Gọi NGOÀI transaction của catalog; kết quả được parse lại bằng Zod trong use case (dữ liệu OCR là dữ liệu ngoài).
 */
export interface CatalogDocumentSource {
  /** Dòng tờ khai đã duyệt / đã truyền có mã hàng (item_code) + HS đã xác nhận. */
  approvedDeclarationLines(orgId: OrgId): Promise<CatalogDocumentLine[]>;
  /** Dòng invoice/packing list đã đọc (lô hàng mới nhất của mỗi hồ sơ) có Part No, kèm đối tác theo chiều hồ sơ (đối tác = chính doanh nghiệp đã bị bỏ). */
  invoiceLines(orgId: OrgId): Promise<CatalogDocumentLine[]>;
}

export type CatalogDeps = {
  uow: CatalogUow;
  members: CatalogMembers;
  /** Nhật ký hoạt động doanh nghiệp (bộ mã, chế độ, thiết lập) – tùy chọn, container nối từ identity. */
  orgAudit?: OrgAuditWriter;
  /** Job nền `catalog-import` (nhập > 500 dòng). */
  jobs: JobQueue;
  /** Nguồn dòng hàng cho "Lấy từ chứng từ đã đọc". */
  documents: CatalogDocumentSource;
  clock: Clock;
  idGen: IdGen;
};
