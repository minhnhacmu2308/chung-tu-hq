// Danh mục hàng hóa dùng chung (mock, ADR 0015) – cùng chữ ký với api/http/catalog.ts, cùng quy tắc với backend
// (packages/core/src/modules/catalog/application/*): ghép / quy đổi / chuẩn hóa mã / kiểm dòng Excel dùng chung hàm thuần của @kb/contracts.
// Lỗi nghiệp vụ là ApiError cùng `code` + `reason` (mã lý do) như client http nhận từ route. Nhập > 500 dòng mô phỏng job nền: ghép dần theo thời gian.
import {
  AliasActionInputSchema, CATALOG_IMPORT_MAX_ROWS_PER_REQUEST, CATALOG_IMPORT_SYNC_MAX_ROWS, ChangeCatalogModeInputSchema, CreateItemInputSchema, DecideQueueBulkInputSchema, DecideQueueInputSchema,
  ImportFromDocumentsInputSchema, ImportRowsInputSchema, ListCatalogItemsQuerySchema, ListQueueQuerySchema, ProposeAliasInputSchema, ResolveManyInputSchema, SetConversionInputSchema,
  SetupCatalogInputSchema, SplitAliasesInputSchema, UpdateItemInputSchema, UpsertCodeSetInputSchema, convertItemQty, importRowsTooLarge, itemCodeKey, itemHsDigits, itemLotFactorDeviates, itemNameKey, itemUnitKey,
  loadCodeList, reasonVi, sheetOfLine, validateItemRows,
  type AliasActionInput, type AliasSource, type CatalogImport, type CatalogItem, type CatalogItemDetail, type CatalogItemHistoryEntry, type CatalogItemListRow, type CatalogItemPage, type CatalogSettingsView,
  type ChangeCatalogModeInput, type CodeSet, type CodeSetKind, type CreateItemRequest, type CreateItemResult, type CrossReference, type CrossReferenceRow,
  type DecideQueueBulkInput, type DecideQueueBulkResult, type DecideQueueInput, type ImportFromDocumentsInput, type ImportRowsInput, type InvoiceLayout, type ItemAlias, type LineItem,
  type LinkLineItemInput, type ListCatalogItemsQueryInput, type ListQueueQueryInput, type MatchQueueItem, type MatchQueueListRow, type MatchQueuePage, type ProposeAliasInput, type ReasonCode,
  type ReasonParams, type ResolveItemQueryInput, type ResolveItemResultDto, type ResolveManyResult, type ResolveManyRow, type SetConversionInput, type SetupCatalogRequest, type SplitAliasesInput, type UnitConversion,
  type UpdateItemRequest, type UpsertCodeSetInput,
} from "@kb/contracts";
import type { ZodType } from "zod";
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import { mulDecimal } from "@/lib/decimal";
import type { MockDb } from "@/mocks/db";
import {
  DEFAULT_SET_NAME, DEPARTMENT_KINDS, defaultSet, effectiveMode, endOfChain, factorFor, isInternal, isPartnerKind, matchContext, needsFactor, newestAlias, nextItemNo,
  resolveIn, type MockAlias, type MockCatalog, type MockCatalogItem, type MockCodeSet, type MockImport, type MockQueueItem, type MockStagedRow,
} from "@/mocks/catalog-engine";

export const catalogKeys = {
  all: ["catalog"] as const,
  settings: ["catalog", "settings"] as const,
  codeSets: ["catalog", "code-sets"] as const,
  items: (q: ListCatalogItemsQueryInput = {}) => ["catalog", "items", q] as const,
  item: (id: string) => ["catalog", "item", id] as const,
  history: (id: string) => ["catalog", "item", id, "history"] as const,
  queue: (q: ListQueueQueryInput = {}) => ["catalog", "queue", q] as const,
  imports: ["catalog", "imports"] as const,
  import: (id: string) => ["catalog", "import", id] as const,
  crossReference: ["catalog", "cross-reference"] as const,
  resolve: (q: ResolveItemQueryInput) => ["catalog", "resolve", q] as const,
  resolveMany: (rows: readonly ResolveManyRow[]) => ["catalog", "resolve-many", rows] as const,
};

// ---------- lỗi (cùng code/HTTP status/mã lý do với route) ----------
const STATUS: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, VALIDATION: 400, DUPLICATE: 409, INVALID_STATE: 409, DOSSIER_LOCKED: 409, NOT_READY: 409 };
const fail = (code: string, message: string) => new ApiError(code, message, STATUS[code] ?? 422);
const failReason = (code: string, reason: ReasonCode, params?: ReasonParams) => new ApiError(code, reasonVi(reason, params), STATUS[code] ?? 422, { reason, params });
const itemNotFound = () => failReason("NOT_FOUND", "PRODUCT_NOT_FOUND");
const setNotFound = () => fail("NOT_FOUND", "Không tìm thấy bộ mã");
const aliasNotFound = () => fail("NOT_FOUND", "Không tìm thấy mã hàng");
const modeConflict = () => failReason("INVALID_STATE", "CATALOG_MODE_CONFLICT");
const codeTaken = () => failReason("DUPLICATE", "CATALOG_CODE_TAKEN");
const factorRequired = () => failReason("VALIDATION", "CATALOG_UNIT_FACTOR_REQUIRED");
const mergeInvalid = () => failReason("INVALID_STATE", "CATALOG_MERGE_INVALID");
const queueDone = () => failReason("INVALID_STATE", "CATALOG_QUEUE_ITEM_DONE");
const notOwner = () => failReason("FORBIDDEN", "CATALOG_NOT_CODE_SET_OWNER");

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw fail("VALIDATION", r.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  return r.data;
}

// ---------- quyền (spec §7, như permissions.ts) ----------
const roleOf = (db: MockDb) => db.members.find((m) => m.id === db.currentUserId)?.role ?? "VIEWER";
const hasRole = (db: MockDb, ...roles: string[]) => roleOf(db) === "OWNER" || roles.includes(roleOf(db));
const need = (ok: boolean) => {
  if (!ok) throw fail("FORBIDDEN", "Không đủ quyền");
};
const isAdmin = (db: MockDb) => hasRole(db, "ADMIN");
const requireAdmin = (db: MockDb) => need(isAdmin(db));
const requireContributor = (db: MockDb) => need(hasRole(db, "DECLARANT", "APPROVER", "ADMIN"));
const isItemEditor = (db: MockDb) => hasRole(db, "APPROVER", "ADMIN");
const ownsSet = (db: MockDb, setId: string) => (db.catalog.owners[setId] ?? []).includes(db.currentUserId);
const managesSet = (db: MockDb, setId: string) => isAdmin(db) || (roleOf(db) !== "VIEWER" && ownsSet(db, setId));
function requireSetManager(db: MockDb, setId: string) {
  requireContributor(db);
  if (!managesSet(db, setId)) throw notOwner();
}
function requireConversionEditor(db: MockDb) {
  requireContributor(db);
  if (isItemEditor(db) || db.catalog.codeSets.some((s) => ownsSet(db, s.id))) return;
  throw notOwner();
}
function checkOwners(db: MockDb, ids: readonly string[]) {
  const bad = ids.filter((id) => !db.members.some((m) => m.id === id && m.status === "ACTIVE" && m.role !== "VIEWER"));
  if (bad.length) throw fail("VALIDATION", "Người phụ trách phải là thành viên đang hoạt động, vai trò khác Người xem");
}

// ---------- DTO ----------
const toItem = ({ nameKey: _k, ...i }: MockCatalogItem): CatalogItem => i;
const toAlias = ({ createdAt: _c, ...a }: MockAlias): ItemAlias => a;
const toQueue = ({ createdAt: _c, importRow: _r, ...q }: MockQueueItem): MatchQueueItem => q;
const toImport = ({ rows: _r, matchAfter: _m, ...i }: MockImport): CatalogImport => i;
function toSet(cat: MockCatalog, s: MockCodeSet): CodeSet {
  const { createdAt: _c, ...rest } = s;
  return { ...rest, ownerIds: [...(cat.owners[s.id] ?? [])], codeCount: cat.aliases.filter((a) => a.codeSetId === s.id && a.status === "ACTIVE").length };
}
const setsOf = (cat: MockCatalog) => cat.codeSets.map((s) => toSet(cat, s));

function detailOf(cat: MockCatalog, id: string): CatalogItemDetail {
  const item = cat.items.find((i) => i.id === id)!;
  return {
    item: toItem(item),
    aliases: cat.aliases.filter((a) => a.itemId === id).map(toAlias),
    conversions: cat.conversions.filter((c) => c.itemId === id).map((c) => ({ unit: c.unit, factor: c.factor })),
    usage: { declarations: item.lastDeclarationNo || item.lastDeclarationDate ? [{ declarationNo: item.lastDeclarationNo, date: item.lastDeclarationDate }] : [], invoices: [] },
  };
}

const audit = (db: MockDb, itemId: string, key: string, oldValue: string, newValue: string) =>
  db.catalog.audit.push({ itemId, key, oldValue, newValue, at: nowIso(), by: db.currentUserId });
const auditKeyAlias = (a: Pick<MockAlias, "codeSetId" | "code">) => `alias:${a.codeSetId}:${a.code}`;
const liveItem = (cat: MockCatalog, id: string) => {
  const it = endOfChain(cat, id);
  return it && it.status === "ACTIVE" ? it : null;
};
const activeHolder = (cat: MockCatalog, setId: string, codeKey: string) => cat.aliases.find((a) => a.codeSetId === setId && a.codeKey === codeKey && a.status === "ACTIVE") ?? null;

function newAlias(db: MockDb, a: Omit<MockAlias, "id" | "codeKey" | "proposedBy" | "decidedBy" | "decidedAt" | "createdAt">): MockAlias {
  const now = nowIso();
  const active = a.status === "ACTIVE";
  const row: MockAlias = { ...a, id: newId("ali"), codeKey: itemCodeKey(a.code), proposedBy: db.currentUserId, decidedBy: active ? db.currentUserId : null, decidedAt: active ? now : null, createdAt: now };
  db.catalog.aliases.push(row);
  return row;
}
function upsertConversion(db: MockDb, itemId: string, unit: string, factor: string) {
  const cur = db.catalog.conversions.find((c) => c.itemId === itemId && itemUnitKey(c.unit) === itemUnitKey(unit));
  if (cur?.factor === factor) return;
  if (cur) cur.factor = factor;
  else db.catalog.conversions.push({ itemId, unit, factor });
  audit(db, itemId, `conv:${cur?.unit ?? unit}`, cur?.factor ?? "", factor);
}
/** Có `factor` → lưu quy đổi; thiếu mà ĐVT ≠ ĐVT gốc chưa quy đổi → CATALOG_UNIT_FACTOR_REQUIRED. */
function ensureFactor(db: MockDb, item: MockCatalogItem, unit: string | null, factor: string | undefined) {
  if (!unit || !needsFactor(db.catalog, item, unit)) return;
  if (!factor) throw factorRequired();
  upsertConversion(db, item.id, unit, factor);
}
function newItem(db: MockDb, v: Pick<MockCatalogItem, "kind" | "name" | "hsCode" | "baseUnit"> & Partial<Pick<MockCatalogItem, "origin" | "description" | "note">>, source: string): MockCatalogItem {
  const now = nowIso();
  const item: MockCatalogItem = {
    id: newId("cat"), itemNo: nextItemNo(db.catalog), kind: v.kind, name: v.name, nameKey: itemNameKey(v.name), hsCode: v.hsCode, baseUnit: v.baseUnit, origin: v.origin ?? null,
    tariffSchedule: null, importDutyRate: null, vatRate: null, envTaxRate: null, exciseRate: null, safeguardRate: null, antiDiscriminationRate: null,
    description: v.description ?? null, note: v.note ?? null, timesDeclared: 0, lastDeclarationNo: null, lastDeclarationDate: null, status: "ACTIVE", mergedIntoId: null,
    source, createdAt: now, updatedAt: now,
  };
  db.catalog.items.push(item);
  audit(db, item.id, "item", "", `${item.itemNo} ${item.name}`);
  return item;
}
function ensurePartnerSet(db: MockDb, kind: "SUPPLIER" | "CUSTOMER", name: string): string | null {
  const key = name.trim() ? itemNameKey(name.trim()) : "";
  if (!key) return null;
  const cur = db.catalog.codeSets.find((s) => s.kind === kind && s.partnerKey === key);
  if (cur) return cur.id;
  const row: MockCodeSet = { id: newId("cst"), kind, name: name.trim(), partnerName: name.trim(), partnerKey: key, isPrimaryDisplay: false, isDefault: false, createdAt: nowIso() };
  db.catalog.codeSets.push(row);
  return row.id;
}

// ---------- nhập Excel / ghép (như match-run.ts) ----------
/** Lỗi theo dòng giữ trong "DB" mock (localStorage có hạn) – counts.errors vẫn đếm đủ. */
export const MOCK_IMPORT_ERRORS_KEPT = 200;
/** Tốc độ ghép mô phỏng của job nền (dòng/giây). */
const MATCH_ROWS_PER_SECOND = 500;
let unitCodes: Promise<ReadonlySet<string>> | null = null;
const customsUnitCodes = () => (unitCodes ??= loadCodeList("UNIT").then((all) => new Set(all.map((u) => u.code.trim().toUpperCase()))));

function bumpImport(cat: MockCatalog, importId: string | null, delta: Partial<CatalogImport["counts"]>) {
  const imp = importId ? cat.imports.find((i) => i.id === importId) : undefined;
  if (!imp) return;
  for (const [k, v] of Object.entries(delta) as [keyof CatalogImport["counts"], number][]) imp.counts[k] += v;
}

function matchRow(db: MockDb, imp: MockImport, row: MockStagedRow, ctx: { current: ReturnType<typeof matchContext> }): keyof CatalogImport["counts"] {
  const cat = db.catalog;
  const codeKey = itemCodeKey(row.code);
  const unit = row.unit ?? null;
  const source: AliasSource = row.sourceRef ? "DOCUMENT" : "IMPORT";
  const saveFactor = (itemId: string) => {
    const item = cat.items.find((i) => i.id === itemId);
    if (item && row.factor && unit && needsFactor(cat, item, unit)) upsertConversion(db, itemId, unit, row.factor);
  };
  // 1. Mã đã có trong bộ → cập nhật tên/ĐVT (Excel cập nhật; chứng từ chỉ điền chỗ trống).
  const existing = activeHolder(cat, imp.codeSetId, codeKey);
  if (existing) {
    const fromDocument = source === "DOCUMENT";
    if (row.name !== (existing.name ?? "") && (!fromDocument || !existing.name)) {
      audit(db, existing.itemId, `${auditKeyAlias(existing)}:name`, existing.name ?? "", row.name);
      existing.name = row.name;
    }
    if (unit && itemUnitKey(unit) !== itemUnitKey(existing.unit ?? "") && (!fromDocument || !existing.unit)) {
      audit(db, existing.itemId, `${auditKeyAlias(existing)}:unit`, existing.unit ?? "", unit);
      existing.unit = unit;
    }
    saveFactor(endOfChain(cat, existing.itemId)?.id ?? existing.itemId);
    return "matched";
  }
  // 2. Luật ghép; file có hệ số cho ĐVT khác ĐVT gốc → không cần hạ MAYBE.
  const res = resolveIn(cat, { codeSetId: imp.codeSetId, code: row.code, name: row.name, hsCode: row.hs ?? null, unit }, ctx.current);
  const itemId = res.level === "SURE" ? res.itemId : res.reason === "UNIT_NO_FACTOR" && row.factor ? (res.candidates[0]?.itemId ?? null) : null;
  if (itemId) {
    saveFactor(itemId);
    const a = newAlias(db, { codeSetId: imp.codeSetId, code: row.code, name: row.name, unit, itemId, status: "ACTIVE", source });
    audit(db, itemId, auditKeyAlias(a), "", "ACTIVE");
    ctx.current = matchContext(cat);
    return "matched";
  }
  // 3. Hàng chờ – mã đã chờ duyệt trong bộ → không thêm mục trùng.
  if (cat.queue.some((q) => q.status === "PENDING" && q.codeSetId === imp.codeSetId && itemCodeKey(q.code) === codeKey)) return "skipped";
  cat.queue.push({
    id: newId("cmq"), importId: imp.id, importRow: row.row, codeSetId: imp.codeSetId, code: row.code, name: row.name, unit, hsCode: row.hs ?? null, level: res.level,
    suggestedItemId: res.candidates[0]?.itemId ?? null, candidates: res.candidates, reason: res.reason, status: "PENDING", decidedBy: null, decidedAt: null,
    sourceRef: row.sourceRef ?? null, createdAt: nowIso(),
  });
  return "queued";
}

/** Ghép tới dòng `upTo` (đồng bộ: hết; nền: theo thời gian đã trôi) rồi chốt DONE khi xong. */
function runMatch(db: MockDb, imp: MockImport, upTo: number) {
  const rows = imp.rows ?? [];
  const ctx = { current: matchContext(db.catalog) };
  while (imp.progress.done < Math.min(upTo, rows.length)) {
    imp.counts[matchRow(db, imp, rows[imp.progress.done]!, ctx)] += 1;
    imp.progress.done += 1;
  }
  if (imp.progress.done >= rows.length) Object.assign(imp, { status: "DONE", rows: null });
}

/** Job nền mô phỏng: mọi lần nhập đang MATCHING ghép tiếp phần đã "chạy" được tới thời điểm hiện tại. Gọi đầu mỗi lần đọc/ghi danh mục. */
function settle(db: MockDb) {
  for (const imp of db.catalog.imports) {
    if (imp.status !== "MATCHING") continue;
    runMatch(db, imp, Math.floor(((Date.now() - imp.matchAfter) / 1000) * MATCH_ROWS_PER_SECOND));
  }
}
const read = <T>(fn: (db: MockDb) => T) => query((db) => (settle(db), fn(db)));
const write = <T>(fn: (db: MockDb) => T) => mutate((db) => (settle(db), fn(db)));

function stageImport(db: MockDb, codeSetId: string, fileName: string, columnMap: Record<string, number>, rows: MockStagedRow[], errors: CatalogImport["errors"]): MockImport {
  const imp: MockImport = {
    id: newId("cim"), codeSetId, fileName, columnMap, status: "MATCHING", counts: { created: 0, matched: 0, queued: 0, skipped: 0, errors: errors.length }, errors: errors.slice(0, MOCK_IMPORT_ERRORS_KEPT),
    progress: { done: 0, total: rows.length }, createdAt: nowIso(), createdBy: db.currentUserId, rows, matchAfter: Date.now(),
  };
  db.catalog.imports.unshift(imp);
  if (rows.length <= CATALOG_IMPORT_SYNC_MAX_ROWS) runMatch(db, imp, rows.length);
  return imp;
}

// ---------- chế độ + bộ mã ----------
export const getCatalogSettings = () =>
  read((db): CatalogSettingsView => {
    const s = db.catalog.settings;
    return { mode: s.mode, effectiveMode: effectiveMode(db.catalog), itemNoPrefix: s.itemNoPrefix, setupAt: s.setupAt };
  });

export const listCodeSets = () => read((db) => setsOf(db.catalog));

const kindAllowed = (mode: string, kind: CodeSetKind) => (mode === "SHARED" ? !DEPARTMENT_KINDS.includes(kind) : kind !== "SHARED");
const clearFlag = (cat: MockCatalog, flag: "isPrimaryDisplay" | "isDefault", except: string | null) => {
  for (const s of cat.codeSets) if (s.id !== except) s[flag] = false;
};

export const saveCodeSet = (id: string | null, input: UpsertCodeSetInput) =>
  write((db): CodeSet => {
    requireAdmin(db);
    const v = parse(UpsertCodeSetInputSchema, input);
    if (v.ownerIds) checkOwners(db, v.ownerIds);
    const cat = db.catalog;
    const mode = effectiveMode(cat);
    const cur = id ? cat.codeSets.find((s) => s.id === id) : null;
    if (id && !cur) throw setNotFound();
    if (cur && cur.kind !== v.kind) throw modeConflict();
    if (!cur && (!kindAllowed(mode, v.kind) || (v.kind === "SHARED" && cat.codeSets.some((s) => s.kind === "SHARED")))) throw modeConflict();
    if (v.isDefault && v.kind !== "CUSTOMS" && v.kind !== "SHARED") throw fail("VALIDATION", "Chỉ bộ XNK / Mã chung được làm bộ mặc định cho Hải quan");
    const partnerName = isPartnerKind(v.kind) ? (v.partnerName ?? null) : null;
    const partnerKey = partnerName ? itemNameKey(partnerName) : null;
    if (partnerKey && cat.codeSets.some((s) => s.id !== cur?.id && s.kind === v.kind && s.partnerKey === partnerKey)) throw failReason("DUPLICATE", "CATALOG_PARTNER_SET_EXISTS");
    let row: MockCodeSet;
    if (cur) {
      Object.assign(cur, { name: v.name, partnerName, partnerKey });
      row = cur;
    } else {
      row = { id: newId("cst"), kind: v.kind, name: v.name, partnerName, partnerKey, isPrimaryDisplay: false, isDefault: false, createdAt: nowIso() };
      if ((v.kind === "CUSTOMS" || v.kind === "SHARED") && !cat.codeSets.some((s) => s.isDefault)) row.isDefault = true;
      cat.codeSets.push(row);
    }
    if (v.isDefault && !row.isDefault) {
      clearFlag(cat, "isDefault", row.id);
      row.isDefault = true;
    }
    if (v.isPrimaryDisplay !== undefined) {
      if (v.isPrimaryDisplay) clearFlag(cat, "isPrimaryDisplay", row.id);
      row.isPrimaryDisplay = v.isPrimaryDisplay;
    }
    if (v.ownerIds) cat.owners[row.id] = [...new Set(v.ownerIds)];
    return toSet(cat, row);
  });

export const setPrimaryDisplay = (codeSetId: string | null) =>
  write((db) => {
    requireAdmin(db);
    const cat = db.catalog;
    if (codeSetId && !cat.codeSets.some((s) => s.id === codeSetId)) throw setNotFound();
    clearFlag(cat, "isPrimaryDisplay", codeSetId);
    const s = cat.codeSets.find((x) => x.id === codeSetId);
    if (s) s.isPrimaryDisplay = true;
    return setsOf(cat);
  });

/** Thiết lập lần đầu – idempotent; đã thiết lập chế độ khác → CATALOG_MODE_CONFLICT (dùng đổi chế độ). */
export const setupCatalog = (input: SetupCatalogRequest) =>
  write((db) => {
    requireAdmin(db);
    const v = parse(SetupCatalogInputSchema, input);
    checkOwners(db, v.sets.flatMap((s) => s.ownerIds));
    const cat = db.catalog;
    const st = cat.settings;
    if (st.setupAt && st.mode && st.mode !== v.mode) throw modeConflict();
    if (v.sets.some((s) => !kindAllowed(v.mode, s.kind))) throw modeConflict();
    const wanted = (k: CodeSetKind) => v.sets.find((s) => s.kind === k);
    const touched = new Map<string, string[]>();
    const ensure = (kind: CodeSetKind, existing: MockCodeSet | undefined, isDefault: boolean) => {
      const w = wanted(kind);
      const name = w?.name ?? existing?.name ?? DEFAULT_SET_NAME[kind];
      let row = existing;
      if (row) Object.assign(row, { kind, name });
      else {
        row = { id: newId("cst"), kind, name, partnerName: null, partnerKey: null, isPrimaryDisplay: false, isDefault: false, createdAt: nowIso() };
        cat.codeSets.push(row);
      }
      if (isDefault) {
        clearFlag(cat, "isDefault", row.id);
        row.isDefault = true;
      }
      if (w) touched.set(row.id, w.ownerIds);
    };
    if (v.mode === "SHARED") {
      const source = cat.codeSets.find((s) => s.kind === "SHARED") ?? cat.codeSets.find((s) => s.kind === "CUSTOMS" && s.isDefault);
      if (cat.codeSets.some((s) => isInternal(s.kind) && s.id !== source?.id)) throw modeConflict();
      ensure("SHARED", source, true);
    } else {
      if (cat.codeSets.some((s) => s.kind === "SHARED")) throw modeConflict();
      ensure("ACCOUNTING", cat.codeSets.find((s) => s.kind === "ACCOUNTING"), false);
      ensure("WAREHOUSE", cat.codeSets.find((s) => s.kind === "WAREHOUSE"), false);
      ensure("CUSTOMS", cat.codeSets.find((s) => s.kind === "CUSTOMS" && s.isDefault) ?? cat.codeSets.find((s) => s.kind === "CUSTOMS"), true);
    }
    for (const p of v.sets.filter((s) => isPartnerKind(s.kind))) {
      const id = ensurePartnerSet(db, p.kind as "SUPPLIER" | "CUSTOMER", p.name);
      if (id) touched.set(id, p.ownerIds);
    }
    for (const [id, owners] of touched) cat.owners[id] = [...new Set(owners)];
    const primaryKind = v.primaryDisplayKind !== undefined ? v.primaryDisplayKind : v.mode === "SHARED" && !cat.codeSets.some((s) => s.isPrimaryDisplay) ? "SHARED" : undefined;
    if (primaryKind !== undefined) {
      const target = primaryKind ? cat.codeSets.find((s) => s.kind === primaryKind) : undefined;
      clearFlag(cat, "isPrimaryDisplay", target?.id ?? null);
      if (target) target.isPrimaryDisplay = true;
    }
    Object.assign(st, { mode: v.mode, ...(v.prefix ? { itemNoPrefix: v.prefix } : {}), setupAt: st.setupAt ?? nowIso() });
    return setsOf(cat);
  });

/** Đổi chế độ – bí danh giữ nguyên (chỉ đổi loại/tên bộ mã chứa chúng). */
export const changeCatalogMode = (input: ChangeCatalogModeInput) =>
  write((db) => {
    requireAdmin(db);
    const v = parse(ChangeCatalogModeInputSchema, input);
    const cat = db.catalog;
    if (effectiveMode(cat) === v.to) return setsOf(cat);
    if (v.to === "SHARED") {
      const internal = cat.codeSets.filter((s) => isInternal(s.kind));
      if (internal.length !== 1) throw modeConflict();
      const only = internal[0]!;
      clearFlag(cat, "isDefault", only.id);
      clearFlag(cat, "isPrimaryDisplay", only.id);
      Object.assign(only, { kind: "SHARED", name: DEFAULT_SET_NAME.SHARED, isDefault: true, isPrimaryDisplay: true });
    } else {
      const shared = cat.codeSets.find((s) => s.kind === "SHARED");
      if (!shared) throw modeConflict();
      if (v.sharedBecomes === "CUSTOMS") Object.assign(shared, { kind: "CUSTOMS", name: DEFAULT_SET_NAME.CUSTOMS });
      else {
        const chosen = v.customsSetId ? cat.codeSets.find((s) => s.id === v.customsSetId) : undefined;
        if (v.customsSetId && (!chosen || chosen.kind !== "CUSTOMS")) throw setNotFound();
        Object.assign(shared, { kind: v.sharedBecomes, name: DEFAULT_SET_NAME[v.sharedBecomes], isDefault: false });
        if (chosen) chosen.isDefault = true;
        else cat.codeSets.push({ id: newId("cst"), kind: "CUSTOMS", name: DEFAULT_SET_NAME.CUSTOMS, partnerName: null, partnerKey: null, isPrimaryDisplay: false, isDefault: true, createdAt: nowIso() });
      }
    }
    Object.assign(cat.settings, { mode: v.to, setupAt: cat.settings.setupAt ?? nowIso() });
    return setsOf(cat);
  });

// ---------- mặt hàng ----------
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase();

export const listCatalogItems = (input: ListCatalogItemsQueryInput = {}) =>
  read((db): CatalogItemPage => {
    const query = parse(ListCatalogItemsQuerySchema, input);
    const cat = db.catalog;
    if (query.codeSetId && !cat.codeSets.some((s) => s.id === query.codeSetId)) throw setNotFound();
    const primary = cat.codeSets.find((s) => s.isPrimaryDisplay);
    const customs = defaultSet(cat);
    const q = query.q?.trim() ?? "";
    const qName = q ? fold(itemNameKey(q)) : "";
    const qCode = q ? itemCodeKey(q) : "";
    const rows: CatalogItemListRow[] = [];
    // Theo mã nối (như repo backend).
    for (const it of [...cat.items].sort((x, y) => x.itemNo.localeCompare(y.itemNo))) {
      if (it.status !== (query.status ?? "ACTIVE")) continue;
      if (query.kind && it.kind !== query.kind) continue;
      const own = cat.aliases.filter((a) => a.itemId === it.id && a.status === "ACTIVE");
      if (q && !(it.itemNo.toLowerCase().includes(q.toLowerCase()) || (qName && fold(it.nameKey).includes(qName)) || (qCode && own.some((a) => a.codeKey.includes(qCode))))) continue;
      const missingCustoms = !customs || !own.some((a) => a.codeSetId === customs.id);
      const base = it.baseUnit ? itemUnitKey(it.baseUnit) : "";
      const missingFactor = !!base && own.some((a) => a.unit && itemUnitKey(a.unit) !== base && factorFor(cat, it, a.unit) === null);
      if (query.missingCustoms && !missingCustoms) continue;
      if (query.missingFactor && !missingFactor) continue;
      const shown = primary ? newestAlias(own.filter((a) => a.codeSetId === primary.id)) : null;
      const inSet = query.codeSetId ? newestAlias(own.filter((a) => a.codeSetId === query.codeSetId)) : null;
      rows.push({
        ...toItem(it), displayCode: shown?.code ?? it.itemNo, codeSetCount: new Set(own.map((a) => a.codeSetId)).size,
        setCode: inSet?.code ?? null, setName: inSet?.name ?? null, setUnit: inSet?.unit ?? null, missingCustoms, missingFactor,
      });
    }
    const start = (query.page - 1) * query.pageSize;
    return { rows: rows.slice(start, start + query.pageSize), total: rows.length, page: query.page, pageSize: query.pageSize };
  });

export const getCatalogItem = (id: string) =>
  read((db) => {
    if (!db.catalog.items.some((i) => i.id === id)) throw itemNotFound();
    return detailOf(db.catalog, id);
  });

/** Lịch sử sửa mặt hàng (như field_audit CATALOG_EDIT), mới nhất trước, tối đa 200 dòng. */
export const getCatalogItemHistory = (id: string) =>
  read((db): CatalogItemHistoryEntry[] => {
    if (!db.catalog.items.some((i) => i.id === id)) throw itemNotFound();
    return db.catalog.audit.filter((a) => a.itemId === id).reverse().slice(0, 200).map((a) => ({ key: a.key, oldValue: a.oldValue, newValue: a.newValue, userId: a.by, at: a.at }));
  });

/** Đủ quyền (sửa thông tin chung / phụ trách bộ mã) → tạo thẳng; DECLARANT khác → hàng chờ ghép mức NONE. */
function createItemIn(db: MockDb, input: CreateItemRequest): CreateItemResult {
  requireContributor(db);
  const v = parse(CreateItemInputSchema, input);
  if (v.code && !v.codeSetId) throw fail("VALIDATION", "Mã hàng cần kèm bộ mã");
  const cat = db.catalog;
  const set = v.codeSetId ? cat.codeSets.find((s) => s.id === v.codeSetId) : null;
  if (v.codeSetId && !set) throw setNotFound();
  const manages = set ? managesSet(db, set.id) : false;
  if (!isItemEditor(db) && !manages) {
    const target = set ?? defaultSet(cat);
    if (!target) throw fail("VALIDATION", "Chưa có bộ mã để đưa vào hàng chờ");
    const q: MockQueueItem = {
      id: newId("cmq"), importId: null, importRow: null, codeSetId: target.id, code: v.code ?? "", name: v.name, unit: v.baseUnit ?? null, hsCode: v.hsCode ?? null,
      level: "NONE", suggestedItemId: null, candidates: [], reason: "NO_MATCH", status: "PENDING", decidedBy: null, decidedAt: null, sourceRef: `user:${db.currentUserId}`, createdAt: nowIso(),
    };
    cat.queue.push(q);
    return { status: "QUEUED", queueId: q.id };
  }
  const codeKey = v.code ? itemCodeKey(v.code) : "";
  if (set && codeKey && manages && activeHolder(cat, set.id, codeKey)) throw codeTaken();
  const item = newItem(db, { kind: v.kind, name: v.name, hsCode: v.hsCode ?? null, baseUnit: v.baseUnit ?? null, origin: v.origin ?? null, description: v.description ?? null, note: v.note ?? null }, "MANUAL");
  if (set && v.code && codeKey) {
    const a = newAlias(db, { codeSetId: set.id, code: v.code, name: v.name, unit: v.baseUnit ?? null, itemId: item.id, status: manages ? "ACTIVE" : "PROPOSED", source: "MANUAL" });
    audit(db, item.id, auditKeyAlias(a), "", a.status);
  }
  for (const c of v.conversions ?? []) if (!item.baseUnit || itemUnitKey(c.unit) !== itemUnitKey(item.baseUnit)) upsertConversion(db, item.id, c.unit, c.factor);
  return { status: "CREATED", item: detailOf(cat, item.id) };
}
export const createCatalogItem = (input: CreateItemRequest) => write((db) => createItemIn(db, input));

const EDITABLE = ["kind", "name", "hsCode", "baseUnit", "origin", "description", "note", "importDutyRate", "vatRate", "tariffSchedule"] as const;

export const updateCatalogItem = (id: string, input: UpdateItemRequest) =>
  write((db) => {
    need(isItemEditor(db));
    const v = parse(UpdateItemInputSchema, input);
    const cur = db.catalog.items.find((i) => i.id === id);
    if (!cur) throw itemNotFound();
    if (cur.status === "MERGED") throw fail("INVALID_STATE", "Mặt hàng đã gộp vào mặt hàng khác");
    for (const f of EDITABLE) {
      const next = v[f];
      if (next === undefined || cur[f] === (next ?? null)) continue;
      audit(db, id, f, String(cur[f] ?? ""), String(next ?? ""));
      (cur as Record<string, unknown>)[f] = next ?? null;
    }
    cur.nameKey = itemNameKey(cur.name);
    for (const c of v.conversions ?? []) if (!cur.baseUnit || itemUnitKey(c.unit) !== itemUnitKey(cur.baseUnit)) upsertConversion(db, id, c.unit, c.factor);
    cur.updatedAt = nowIso();
    return detailOf(db.catalog, id);
  });

export const archiveCatalogItem = (id: string, archived: boolean) =>
  write((db) => {
    requireAdmin(db);
    const cur = db.catalog.items.find((i) => i.id === id);
    if (!cur) throw itemNotFound();
    if (cur.status === "MERGED") throw fail("INVALID_STATE", "Mặt hàng đã gộp vào mặt hàng khác");
    const next = archived ? "ARCHIVED" : "ACTIVE";
    if (cur.status !== next) {
      audit(db, id, "status", cur.status, next);
      Object.assign(cur, { status: next, updatedAt: nowIso() });
    }
    return detailOf(db.catalog, id);
  });

/** Gộp `fromId` vào `intoId` – như merge.ts: chuyển bí danh + quy đổi, cộng số lần khai, nguồn thành MERGED. */
export const mergeCatalogItems = (fromId: string, intoId: string) =>
  write((db) => {
    requireAdmin(db);
    const cat = db.catalog;
    if (fromId === intoId) throw mergeInvalid();
    const from = cat.items.find((i) => i.id === fromId);
    const into = cat.items.find((i) => i.id === intoId);
    if (!from || !into) throw itemNotFound();
    if (from.status === "MERGED" || into.status !== "ACTIVE") throw mergeInvalid();
    const baseAfter = into.baseUnit ?? from.baseUnit;
    const sameBase = !from.baseUnit || !into.baseUnit || itemUnitKey(from.baseUnit) === itemUnitKey(into.baseUnit);
    const has = (itemId: string, u: string) => cat.conversions.some((c) => c.itemId === itemId && itemUnitKey(c.unit) === itemUnitKey(u));
    const carry = sameBase ? cat.conversions.filter((c) => c.itemId === from.id && !has(into.id, c.unit) && !(baseAfter && itemUnitKey(baseAfter) === itemUnitKey(c.unit))) : [];
    const sameAlias = (a: MockAlias) => cat.aliases.some((t) => t.itemId === into.id && t.codeSetId === a.codeSetId && t.codeKey === a.codeKey && t.status === a.status);
    const moving = cat.aliases.filter((a) => a.itemId === from.id && !sameAlias(a));
    const convertible = (u: string) => (baseAfter && itemUnitKey(baseAfter) === itemUnitKey(u)) || has(into.id, u) || carry.some((c) => itemUnitKey(c.unit) === itemUnitKey(u));
    if (baseAfter && moving.some((a) => a.status === "ACTIVE" && a.unit && !convertible(a.unit))) throw factorRequired();
    audit(db, from.id, "status", from.status, `MERGED → ${into.itemNo}`);
    audit(db, into.id, "merge", "", from.itemNo);
    Object.assign(from, { status: "MERGED", mergedIntoId: into.id, updatedAt: nowIso() });
    for (const a of moving) {
      a.itemId = into.id;
      audit(db, into.id, auditKeyAlias(a), `${from.itemNo} →`, a.status);
    }
    for (const c of carry) {
      audit(db, into.id, `conv:${c.unit}`, "", c.factor);
      c.itemId = into.id;
    }
    const takeLast = (into.lastDeclarationDate ?? "") < (from.lastDeclarationDate ?? "");
    Object.assign(into, {
      timesDeclared: into.timesDeclared + from.timesDeclared,
      ...(takeLast ? { lastDeclarationNo: from.lastDeclarationNo, lastDeclarationDate: from.lastDeclarationDate } : {}),
      ...(!into.hsCode && from.hsCode ? { hsCode: from.hsCode } : {}),
      ...(!into.baseUnit && from.baseUnit ? { baseUnit: from.baseUnit } : {}),
      updatedAt: nowIso(),
    });
    return detailOf(cat, into.id);
  });

export const splitCatalogAliases = (input: SplitAliasesInput) =>
  write((db) => {
    requireAdmin(db);
    const v = parse(SplitAliasesInputSchema, input);
    const cat = db.catalog;
    const aliases = [...new Set(v.aliasIds)].map((id) => cat.aliases.find((a) => a.id === id) ?? null);
    if (aliases.some((a) => !a)) throw aliasNotFound();
    const list = aliases as MockAlias[];
    const fromId = list[0]!.itemId;
    if (list.some((a) => a.itemId !== fromId)) throw fail("VALIDATION", "Các mã tách phải cùng một mặt hàng");
    const from = cat.items.find((i) => i.id === fromId);
    if (!from) throw itemNotFound();
    if (from.status !== "ACTIVE") throw mergeInvalid();
    const n = v.newItem;
    const item = newItem(db, {
      kind: n.kind, name: n.name, hsCode: n.hsCode !== undefined ? n.hsCode : from.hsCode, baseUnit: n.baseUnit !== undefined ? n.baseUnit : from.baseUnit,
      origin: n.origin ?? from.origin, description: n.description ?? null, note: n.note ?? null,
    }, "SPLIT");
    for (const a of list) {
      audit(db, from.id, auditKeyAlias(a), a.status, `→ ${item.itemNo}`);
      a.itemId = item.id;
      audit(db, item.id, auditKeyAlias(a), `${from.itemNo} →`, a.status);
    }
    const sameBase = !!from.baseUnit && !!item.baseUnit && itemUnitKey(from.baseUnit) === itemUnitKey(item.baseUnit);
    const units = new Set(list.map((a) => a.unit).filter((u): u is string => !!u).map(itemUnitKey));
    if (sameBase) for (const c of cat.conversions.filter((x) => x.itemId === from.id && units.has(itemUnitKey(x.unit)))) upsertConversion(db, item.id, c.unit, c.factor);
    return detailOf(cat, item.id);
  });

// ---------- bí danh ----------
export const proposeAlias = (input: ProposeAliasInput) =>
  write((db): ItemAlias => {
    requireContributor(db);
    const v = parse(ProposeAliasInputSchema, input);
    const codeKey = itemCodeKey(v.code);
    if (!codeKey) throw fail("VALIDATION", "Mã hàng trống");
    const cat = db.catalog;
    if (!cat.codeSets.some((s) => s.id === v.codeSetId)) throw setNotFound();
    const item = liveItem(cat, v.itemId);
    if (!item) throw itemNotFound();
    const holder = activeHolder(cat, v.codeSetId, codeKey);
    if (holder && endOfChain(cat, holder.itemId)?.id !== item.id) throw codeTaken();
    if (holder) return toAlias(holder);
    const status = managesSet(db, v.codeSetId) ? "ACTIVE" : "PROPOSED";
    if (status === "PROPOSED") {
      const same = cat.aliases.find((a) => a.itemId === item.id && a.codeSetId === v.codeSetId && a.codeKey === codeKey && a.status === "PROPOSED");
      if (same) return toAlias(same);
    }
    const unit = v.unit ?? null;
    if (status === "ACTIVE") ensureFactor(db, item, unit, v.factor);
    const a = newAlias(db, { codeSetId: v.codeSetId, code: v.code, name: v.name ?? null, unit, itemId: item.id, status, source: "MANUAL" });
    audit(db, item.id, auditKeyAlias(a), "", status);
    return toAlias(a);
  });

/** Duyệt / từ chối đề xuất, chuyển sang mặt hàng khác (người phụ trách bộ mã / Quản trị). */
export const aliasAction = (id: string, input: AliasActionInput) =>
  write((db): ItemAlias => {
    requireContributor(db);
    const v = parse(AliasActionInputSchema, input);
    const cat = db.catalog;
    const a = cat.aliases.find((x) => x.id === id);
    if (!a) throw aliasNotFound();
    requireSetManager(db, a.codeSetId);
    const now = nowIso();
    if (v.action === "MOVE") {
      const to = liveItem(cat, v.toItemId);
      if (!to) throw itemNotFound();
      if (to.id === a.itemId) return toAlias(a);
      if (a.status === "ACTIVE") ensureFactor(db, to, a.unit, v.factor);
      const from = cat.items.find((i) => i.id === a.itemId);
      audit(db, a.itemId, auditKeyAlias(a), a.status, `→ ${to.itemNo}`);
      audit(db, to.id, auditKeyAlias(a), from ? `${from.itemNo} →` : "", a.status);
      a.itemId = to.id;
      return toAlias(a);
    }
    if (a.status !== "PROPOSED") throw fail("INVALID_STATE", "Mã hàng này đã được xử lý");
    if (v.action === "APPROVE") {
      const item = liveItem(cat, a.itemId);
      if (!item) throw itemNotFound();
      const holder = activeHolder(cat, a.codeSetId, a.codeKey);
      if (holder && endOfChain(cat, holder.itemId)?.id !== item.id) throw codeTaken();
      if (holder) {
        Object.assign(a, { status: "REJECTED", decidedBy: db.currentUserId, decidedAt: now });
        return toAlias(holder);
      }
      ensureFactor(db, item, a.unit, v.factor);
      Object.assign(a, { status: "ACTIVE", itemId: item.id, decidedBy: db.currentUserId, decidedAt: now });
    } else Object.assign(a, { status: "REJECTED", decidedBy: db.currentUserId, decidedAt: now });
    audit(db, a.itemId, auditKeyAlias(a), "PROPOSED", a.status);
    return toAlias(a);
  });

export const deactivateAlias = (id: string) =>
  write((db): ItemAlias => {
    requireContributor(db);
    const a = db.catalog.aliases.find((x) => x.id === id);
    if (!a) throw aliasNotFound();
    requireSetManager(db, a.codeSetId);
    if (a.status !== "REJECTED") {
      audit(db, a.itemId, auditKeyAlias(a), a.status, "REJECTED");
      Object.assign(a, { status: "REJECTED", decidedBy: db.currentUserId, decidedAt: nowIso() });
    }
    return toAlias(a);
  });

// ---------- quy đổi ----------
const conversionsOf = (db: MockDb, itemId: string): UnitConversion[] => db.catalog.conversions.filter((c) => c.itemId === itemId).map((c) => ({ unit: c.unit, factor: c.factor }));

export const setConversion = (input: SetConversionInput) =>
  write((db) => {
    const v = parse(SetConversionInputSchema, input);
    requireConversionEditor(db);
    const item = db.catalog.items.find((i) => i.id === v.itemId);
    if (!item || item.status === "MERGED") throw itemNotFound();
    if (item.baseUnit && itemUnitKey(item.baseUnit) === itemUnitKey(v.unit)) throw fail("VALIDATION", "ĐVT trùng ĐVT gốc của mặt hàng");
    upsertConversion(db, v.itemId, v.unit, v.factor);
    return conversionsOf(db, v.itemId);
  });

export const removeConversion = (itemId: string, unit: string) =>
  write((db) => {
    requireConversionEditor(db);
    if (!db.catalog.items.some((i) => i.id === itemId)) throw itemNotFound();
    const old = db.catalog.conversions.find((c) => c.itemId === itemId && itemUnitKey(c.unit) === itemUnitKey(unit));
    if (old) {
      audit(db, itemId, `conv:${old.unit}`, old.factor, "");
      db.catalog.conversions = db.catalog.conversions.filter((c) => c !== old);
    }
    return conversionsOf(db, itemId);
  });

// ---------- hàng chờ ----------
export const listMatchQueue = (input: ListQueueQueryInput = {}) =>
  read((db): MatchQueuePage => {
    const q = parse(ListQueueQuerySchema, input);
    let rows = db.catalog.queue.filter((x) => x.status === q.status && (!q.codeSetId || x.codeSetId === q.codeSetId) && (!q.importId || x.importId === q.importId));
    if (q.level) rows = rows.filter((x) => x.level === q.level);
    if (q.mine) rows = rows.filter((x) => ownsSet(db, x.codeSetId));
    rows = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.importRow ?? 0) - (b.importRow ?? 0) || a.id.localeCompare(b.id));
    const start = (q.page - 1) * q.pageSize;
    // Như listQueue: kèm tóm tắt mặt hàng gợi ý (needsFactor) + ứng viên, mặt hàng đã gộp → cuối chuỗi.
    const cat = db.catalog;
    const summary = (i: MockCatalogItem) => ({ id: i.id, itemNo: i.itemNo, name: i.name, hsCode: i.hsCode, baseUnit: i.baseUnit });
    const list: MatchQueueListRow[] = rows.slice(start, start + q.pageSize).map((x) => {
      const s = x.suggestedItemId ? endOfChain(cat, x.suggestedItemId) : null;
      return {
        ...toQueue(x),
        suggested: s ? { ...summary(s), needsFactor: needsFactor(cat, s, x.unit) } : null,
        candidateItems: x.candidates.flatMap((c) => {
          const it = endOfChain(cat, c.itemId);
          return it ? [{ ...summary(it), score: c.score, reason: c.reason }] : [];
        }).slice(0, 5),
      };
    });
    return { rows: list, total: rows.length, page: q.page, pageSize: q.pageSize };
  });

const aliasSourceOf = (q: MockQueueItem): AliasSource => (q.sourceRef && !q.sourceRef.startsWith("user:") ? "DOCUMENT" : q.importId ? "IMPORT" : "MANUAL");

/** Duyệt một mục – mọi kiểm tra chạy trước lần ghi đầu tiên (như decideQueue). */
function decideIn(db: MockDb, id: string, input: DecideQueueInput): MatchQueueItem {
  requireContributor(db);
  const v = parse(DecideQueueInputSchema, input);
  if (v.action === "CHOOSE" && !v.itemId) throw fail("VALIDATION", "Chọn mặt hàng để ghép");
  const cat = db.catalog;
  const q = cat.queue.find((x) => x.id === id);
  if (!q) throw fail("NOT_FOUND", "Không tìm thấy mục chờ ghép");
  requireSetManager(db, q.codeSetId);
  if (q.status !== "PENDING") throw queueDone();
  const close = (status: "DONE" | "SKIPPED", suggestedItemId = q.suggestedItemId) =>
    Object.assign(q, { status, suggestedItemId, decidedBy: db.currentUserId, decidedAt: nowIso() });
  if (v.action === "SKIP") {
    close("SKIPPED");
    bumpImport(cat, q.importId, { queued: -1, skipped: 1 });
    return toQueue(q);
  }
  const codeKey = q.code ? itemCodeKey(q.code) : "";
  const holder = codeKey ? activeHolder(cat, q.codeSetId, codeKey) : null;
  const holderItem = holder ? endOfChain(cat, holder.itemId) : null;
  const targetId = v.action === "CHOOSE" ? v.itemId! : v.action === "CONFIRM" ? q.suggestedItemId : null;
  if (!targetId) {
    if (holder) throw codeTaken();
    const item = newItem(db, { kind: v.kind ?? "GOODS", name: q.name, hsCode: q.hsCode, baseUnit: q.unit }, q.importId ? "IMPORT" : "QUEUE");
    if (codeKey) {
      const a = newAlias(db, { codeSetId: q.codeSetId, code: q.code, name: q.name, unit: q.unit, itemId: item.id, status: "ACTIVE", source: aliasSourceOf(q) });
      audit(db, item.id, auditKeyAlias(a), "", "ACTIVE");
    }
    close("DONE", item.id);
    bumpImport(cat, q.importId, { queued: -1, created: 1 });
    return toQueue(q);
  }
  const item = liveItem(cat, targetId);
  if (!item) throw itemNotFound();
  if (holder && holderItem?.id !== item.id) throw codeTaken();
  const needFactor = !holder && needsFactor(cat, item, q.unit);
  if (needFactor && !v.factor) throw factorRequired();
  if (needFactor && q.unit && v.factor) upsertConversion(db, item.id, q.unit, v.factor);
  if (codeKey && !holder) {
    const a = newAlias(db, { codeSetId: q.codeSetId, code: q.code, name: q.name, unit: q.unit, itemId: item.id, status: "ACTIVE", source: aliasSourceOf(q) });
    audit(db, item.id, auditKeyAlias(a), "", "ACTIVE");
  }
  close("DONE", item.id);
  bumpImport(cat, q.importId, { queued: -1, matched: 1 });
  return toQueue(q);
}
export const decideQueueItem = (id: string, input: DecideQueueInput) => write((db) => decideIn(db, id, input));

/** Xác nhận hàng loạt: mục lỗi báo riêng (mã + mã lý do), không chặn mục khác. */
export const decideQueueBulk = (input: DecideQueueBulkInput) =>
  write((db): DecideQueueBulkResult => {
    requireContributor(db);
    const v = parse(DecideQueueBulkInputSchema, input);
    const out: DecideQueueBulkResult = { decided: [], failed: [] };
    for (const id of [...new Set(v.ids)]) {
      try {
        decideIn(db, id, { action: v.action });
        out.decided.push(id);
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        out.failed.push({ id, code: e.code, reason: e.reason ?? null });
      }
    }
    return out;
  });

// ---------- nhập ----------
export const importCatalogRows = async (input: ImportRowsInput): Promise<CatalogImport> => {
  const units = await customsUnitCodes();
  return write((db) => {
    // Như route: quá số dòng mỗi lần gửi → lý do rõ ràng (giao diện chia file thành nhiều lần nhập).
    if (importRowsTooLarge(input)) throw failReason("VALIDATION", "CATALOG_IMPORT_TOO_LARGE", { max: CATALOG_IMPORT_MAX_ROWS_PER_REQUEST });
    const v = parse(ImportRowsInputSchema, input);
    if (!db.catalog.codeSets.some((s) => s.id === v.codeSetId)) throw setNotFound();
    requireSetManager(db, v.codeSetId);
    const { ok, errors } = validateItemRows(v.rows, { knownUnits: units });
    const bad = new Set(errors.map((e) => e.row));
    const staged: MockStagedRow[] = [];
    let k = 0;
    v.rows.forEach((_, i) => {
      if (!bad.has(i + 1)) staged.push({ row: i + 1, ...ok[k++]! });
    });
    const columnMap = Object.fromEntries(Object.entries(v.columnMap).filter((e): e is [string, number] => typeof e[1] === "number"));
    return toImport(stageImport(db, v.codeSetId, v.fileName, columnMap, staged, errors));
  });
};

export const listCatalogImports = () => read((db) => db.catalog.imports.slice(0, 50).map(toImport));

export const getCatalogImport = (id: string) =>
  read((db) => {
    const imp = db.catalog.imports.find((i) => i.id === id);
    if (!imp) throw fail("NOT_FOUND", "Không tìm thấy lần nhập");
    return toImport(imp);
  });

const LOCKED = new Set(["APPROVED", "SUBMITTED", "CLEARED", "CANCELLED"]);

/**
 * "Lấy từ chứng từ đã đọc" (mock): DECLARATIONS → dòng tờ khai đã duyệt có mã hàng (HAG_MAHANG) → bộ XNK mặc định;
 * INVOICES → dòng lô nhập tay có mã hàng, theo người mua → bộ khách hàng (tự tạo). Chứng từ OCR của mock không có Part No theo dòng.
 */
export const importCatalogFromDocuments = async (input: ImportFromDocumentsInput): Promise<CatalogImport[]> => {
  const units = await customsUnitCodes();
  return write((db) => {
    const v = parse(ImportFromDocumentsInputSchema, input);
    if (v.source === "INVOICES") requireAdmin(db);
    else requireContributor(db);
    const toStaged = (lines: { code: string; name: string; unit: string | null; hs: string | null; ref: string }[]) => {
      const seen = new Set<string>();
      const out: MockStagedRow[] = [];
      for (const l of lines) {
        const key = itemCodeKey(l.code);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const unit = l.unit && units.has(l.unit.toUpperCase()) ? l.unit.toUpperCase() : null;
        const hs = itemHsDigits(l.hs);
        out.push({ row: out.length + 1, code: l.code.trim(), name: (l.name.trim() || l.code).slice(0, 500), ...(unit ? { unit } : {}), ...(hs.length >= 4 && hs.length <= 10 ? { hs } : {}), sourceRef: l.ref });
      }
      return out;
    };
    if (v.source === "DECLARATIONS") {
      const set = defaultSet(db.catalog);
      if (!set) throw fail("VALIDATION", "Chưa có bộ mã XNK mặc định");
      requireSetManager(db, set.id);
      const approved = new Set(db.dossiers.filter((d) => LOCKED.has(d.status) && d.status !== "CANCELLED").map((d) => d.id));
      const rows = toStaged(db.lineItems.filter((l) => approved.has(l.dossierId) && l.itemCode).map((l) => ({ code: l.itemCode!, name: l.description, unit: l.unit, hs: l.hsConfirmed ?? null, ref: `declaration:${l.dossierId}:${l.lineNo}` })));
      return rows.length ? [toImport(stageImport(db, set.id, "Tờ khai đã duyệt", {}, rows, []))] : [];
    }
    const groups = new Map<string, { name: string; lines: Parameters<typeof toStaged>[0] }>();
    for (const [dossierId, m] of Object.entries(db.manualShipments)) {
      const buyer = m.data.buyer.name?.trim();
      if (!buyer) continue;
      const g = groups.get(itemNameKey(buyer)) ?? { name: buyer, lines: [] };
      m.data.items.forEach((it, i) => it.partNo && g.lines.push({ code: it.partNo, name: it.description, unit: it.unit, hs: it.hsOnInvoice ?? null, ref: `manual:${dossierId}:${i + 1}` }));
      groups.set(itemNameKey(buyer), g);
    }
    const out: CatalogImport[] = [];
    for (const g of groups.values()) {
      const rows = toStaged(g.lines);
      const setId = rows.length ? ensurePartnerSet(db, "CUSTOMER", g.name) : null;
      if (setId) out.push(toImport(stageImport(db, setId, `Hóa đơn / phiếu đóng gói đã đọc – ${g.name}`.slice(0, 260), {}, rows, [])));
    }
    return out;
  });
};

// ---------- đối chiếu, tra mã ----------
export const exportCrossReference = () =>
  read((db): CrossReference => {
    const cat = db.catalog;
    const rows = new Map<string, CrossReferenceRow>(cat.items.filter((i) => i.status === "ACTIVE").map((i) => [i.id, { itemNo: i.itemNo, name: i.name, hs: i.hsCode, baseUnit: i.baseUnit, codes: {}, factors: {} }]));
    for (const a of cat.aliases) {
      const row = a.status === "ACTIVE" ? rows.get(a.itemId) : undefined;
      if (row) (row.codes[a.codeSetId] ??= []).push(a.code);
    }
    for (const c of cat.conversions) {
      const row = rows.get(c.itemId);
      if (row) row.factors[c.unit] = c.factor;
    }
    return { codeSets: cat.codeSets.map((s) => ({ id: s.id, kind: s.kind, name: s.name })), rows: [...rows.values()] };
  });

export const resolveCatalogItem = (q: ResolveItemQueryInput) => read((db): ResolveItemResultDto => resolveIn(db.catalog, q));

/** Tra nhiều dòng (≤ 500) – danh mục nạp một lần; ứng viên kèm tóm tắt mặt hàng (như resolveManyWithItems). */
export const resolveCatalogMany = (rows: ResolveManyRow[]) =>
  read((db): ResolveManyResult[] => {
    const v = parse(ResolveManyInputSchema, { rows });
    const cat = db.catalog;
    const ctx = matchContext(cat);
    return v.rows.map((row) => {
      const res = resolveIn(cat, row, ctx);
      const candidates = res.candidates.flatMap((c) => {
        const it = cat.items.find((i) => i.id === c.itemId);
        return it ? [{ ...c, item: { id: it.id, itemNo: it.itemNo, name: it.name, hsCode: it.hsCode, timesDeclared: it.timesDeclared } }] : [];
      });
      return { ...res, candidates };
    });
  });

// ---------- dòng hàng ↔ danh mục (như declaration/line-catalog.ts) ----------
function editableLine(db: MockDb, lineItemId: string): LineItem {
  const line = db.lineItems.find((l) => l.id === lineItemId);
  if (!line) throw fail("NOT_FOUND", "Không tìm thấy dòng hàng");
  const dossier = db.dossiers.find((d) => d.id === line.dossierId);
  if (dossier && LOCKED.has(dossier.status)) throw fail("DOSSIER_LOCKED", "Tờ khai đã duyệt/truyền – mở lại tờ khai trước khi đổi mặt hàng");
  return line;
}
const customsCodeOf = (cat: MockCatalog, itemId: string) => {
  const set = defaultSet(cat);
  return set ? (newestAlias(cat.aliases.filter((a) => a.itemId === itemId && a.codeSetId === set.id && a.status === "ACTIVE"))?.code ?? null) : null;
};

/**
 * Phần danh mục của dòng khi đọc (như catalogView của backend – declaration/_catalog-plan.ts): gợi ý lượng theo ĐVT khai (ĐVT của mã bộ Hải quan)
 * khi khác ĐVT dòng – hệ số theo lô (`unitFactor`) thắng hệ số mặc định; lô lệch > 20% → `deviates`. Thiếu hệ số → không gợi ý (không tự nhân 1).
 */
export function withLineCatalogView(db: MockDb, line: LineItem): LineItem {
  const { qtySuggestion: _old, ...rest } = line;
  const cat = db.catalog;
  const item = line.catalogItem ? endOfChain(cat, line.catalogItem.id) : null;
  const set = defaultSet(cat);
  const alias = item && set ? newestAlias(cat.aliases.filter((a) => a.itemId === item.id && a.codeSetId === set.id && a.status === "ACTIVE")) : null;
  const toUnit = alias?.unit ?? null;
  if (!item?.baseUnit || !toUnit || itemUnitKey(toUnit) === itemUnitKey(line.unit)) return rest;
  const factors = Object.fromEntries(cat.conversions.filter((c) => c.itemId === item.id).map((c) => [c.unit, c.factor]));
  const conv = convertItemQty(line.quantity, line.unit, toUnit, { base: item.baseUnit, factors }, line.unitFactor);
  if (!conv) return rest;
  const def = line.unitFactor ? factorFor(cat, item, line.unit) : null;
  return { ...rest, qtySuggestion: { qty: conv.qty, unit: toUnit, factor: conv.factor, lotFactor: !!line.unitFactor, deviates: !!line.unitFactor && !!def && itemLotFactorDeviates(line.unitFactor, def) } };
}

/**
 * In hóa đơn phát hành theo bộ mã của mẫu (như extraction/application/issued-print.ts + domain printLine): mẫu chỉ định bộ → bộ đó;
 * null → bộ khách hàng của người mua → Kế toán ("Mã chung" ở SHARED); ITEM_NO → mã nối. Mặt hàng chưa có mã trong bộ → mã nối.
 * ĐVT của mã khác ĐVT dòng → quy đổi qua ĐVT gốc (đơn giá chia cùng hệ số); thiếu hệ số → giữ lượng/ĐVT dòng + cảnh báo.
 */
export function printInvoiceLine(
  db: MockDb, it: { partNo: string | null; quantity: string; unit: string; unitPrice: string; catalogItemId: string | null }, pick: InvoiceLayout["itemCodeSet"], buyerName: string | null,
): { line: { catalogItemId: string | null; printedCode: string | null; printedUnit: string; printedQuantity: string; printedUnitPrice: string | null }; warning: boolean } {
  const keep = (printedCode: string | null, warning = false) => ({ line: { catalogItemId: it.catalogItemId, printedCode, printedUnit: it.unit, printedQuantity: it.quantity, printedUnitPrice: null }, warning });
  const cat = db.catalog;
  const item = it.catalogItemId ? endOfChain(cat, it.catalogItemId) : null;
  if (!item) return keep(it.partNo);
  let set: MockCodeSet | null | undefined = null;
  if (pick && "codeSetId" in pick) set = cat.codeSets.find((s) => s.id === pick.codeSetId);
  else if (!pick) {
    const key = buyerName ? itemNameKey(buyerName) : "";
    set = (key ? cat.codeSets.find((s) => s.kind === "CUSTOMER" && s.partnerKey === key) : null)
      ?? cat.codeSets.find((s) => s.kind === (effectiveMode(cat) === "SHARED" ? "SHARED" : "ACCOUNTING"));
  }
  const alias = set ? newestAlias(cat.aliases.filter((a) => a.itemId === item.id && a.codeSetId === set.id && a.status === "ACTIVE")) : null;
  if (!alias) return keep(item.itemNo);
  const toUnit = alias.unit?.trim();
  if (!toUnit || itemUnitKey(toUnit) === itemUnitKey(it.unit) || !item.baseUnit) return keep(alias.code);
  const factors = Object.fromEntries(cat.conversions.filter((c) => c.itemId === item.id).map((c) => [c.unit, c.factor]));
  const conv = convertItemQty(it.quantity, it.unit, toUnit, { base: item.baseUnit, factors });
  if (!conv) return keep(alias.code, true);
  // Đơn giá theo ĐVT in = đơn giá ÷ hệ số (= quy đổi ngược chiều), 6 số lẻ như backend.
  const price = convertItemQty(it.unitPrice, toUnit, it.unit, { base: item.baseUnit, factors });
  const unitPrice = price ? mulDecimal(price.qty, "1", 6).replace(/\.?0+$/, "") : null;
  return {
    line: { catalogItemId: it.catalogItemId, printedCode: alias.code, printedUnit: toUnit, printedQuantity: conv.qty, printedUnitPrice: unitPrice },
    warning: false,
  };
}

/** Gắn mặt hàng cho dòng ("Mã lạ – Chọn mặt hàng"): chọn có sẵn hoặc tạo mới; HAG_MAHANG = mã bộ Hải quan mới nhất. */
export const linkLineItem = (lineItemId: string, input: LinkLineItemInput) =>
  write((db): LineItem => {
    need(hasRole(db, "DECLARANT", "APPROVER", "ADMIN"));
    const line = editableLine(db, lineItemId);
    const cat = db.catalog;
    let itemId: string;
    if ("createItem" in input) {
      const c = input.createItem;
      const conv = c.factor && c.baseUnit && itemUnitKey(c.baseUnit) !== itemUnitKey(line.unit) ? [{ unit: line.unit, factor: c.factor }] : [];
      const created = createItemIn(db, { kind: c.kind, name: c.name, ...(c.hsCode ? { hsCode: c.hsCode } : {}), ...(c.baseUnit ? { baseUnit: c.baseUnit } : {}), ...(conv.length ? { conversions: conv } : {}) });
      if (created.status === "QUEUED") return line;
      itemId = created.item.item.id;
    } else {
      const it = liveItem(cat, input.itemId);
      if (!it) throw fail("NOT_FOUND", "Không tìm thấy mặt hàng trong danh mục");
      itemId = it.id;
    }
    const item = cat.items.find((i) => i.id === itemId)!;
    if (line.catalogItem?.id !== item.id) delete line.unitFactor;
    line.catalogItem = { id: item.id, itemNo: item.itemNo, name: item.name };
    const code = customsCodeOf(cat, item.id);
    if (code) line.itemCode = code;
    else delete line.itemCode;
    delete line.unknownCode;
    return withLineCatalogView(db, line);
  });

/** Hệ số quy đổi theo lô của dòng; null = dùng hệ số mặc định của danh mục. */
export const setLineUnitFactor = (lineItemId: string, factor: string | null) =>
  write((db): LineItem => {
    need(hasRole(db, "DECLARANT", "APPROVER", "ADMIN"));
    const line = editableLine(db, lineItemId);
    if (!line.catalogItem) throw fail("INVALID_STATE", "Dòng chưa gắn mặt hàng danh mục");
    if (factor === null) delete line.unitFactor;
    else line.unitFactor = parse(SetConversionInputSchema.shape.factor, factor);
    return withLineCatalogView(db, line);
  });

// ---------- số tờ khai Hải quan cấp (gọi từ mocks/api/customs) ----------
/**
 * Hải quan cấp số cho tờ khai nhánh `branch` (như CatalogPort.recordDeclarationNo, gọi từ integration sau commit): mặt hàng (cuối chuỗi gộp, không trùng)
 * của các dòng thuộc tờ đó (50 dòng/tờ – sheetOfLine) → số tờ khai cuối + ngày, chỉ khi ngày đang lưu trống hoặc ≤ `date`. Không cộng lần khai.
 */
export function recordCatalogDeclarationNo(db: MockDb, dossierId: string, branch: number, declarationNo: string, date: string) {
  const lines = db.lineItems.filter((l) => l.dossierId === dossierId);
  const lineNos = lines.map((l) => l.lineNo);
  const seen = new Set<string>();
  for (const l of lines) {
    if (!l.catalogItem || sheetOfLine(lineNos, l.lineNo) !== branch) continue;
    const item = endOfChain(db.catalog, l.catalogItem.id);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    if (item.lastDeclarationDate && item.lastDeclarationDate > date) continue;
    Object.assign(item, { lastDeclarationNo: declarationNo, lastDeclarationDate: date, updatedAt: nowIso() });
  }
}

// ---------- tờ khai duyệt (gọi từ mocks/api/declaration) ----------
/**
 * Tờ khai được duyệt (như CatalogPort.recordDeclared + enqueueUnknown): dòng đã gắn mặt hàng → mỗi mặt hàng (cuối chuỗi gộp) +1 lần khai;
 * dòng chưa gắn → mục hàng chờ ghép (gợi ý theo luật ghép) ở bộ mặc định cho Hải quan – không tự thêm thẳng vào danh mục.
 */
export function recordApprovedCatalog(db: MockDb, lines: LineItem[], info: { declarationId: string; typeCode: string | null }) {
  const cat = db.catalog;
  const date = nowIso().slice(0, 10);
  const seen = new Set<string>();
  for (const l of lines) {
    const item = l.catalogItem ? endOfChain(cat, l.catalogItem.id) : null;
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    Object.assign(item, { timesDeclared: item.timesDeclared + 1, lastDeclarationNo: null, lastDeclarationDate: date, updatedAt: nowIso() });
  }
  const set = defaultSet(cat);
  if (!set) return;
  const ctx = matchContext(cat);
  for (const l of lines.filter((x) => !x.catalogItem)) {
    const dup = cat.queue.some((q) => q.status === "PENDING" && q.codeSetId === set.id && !q.code && itemNameKey(q.name) === itemNameKey(l.description));
    if (dup) continue;
    const hs = l.hsConfirmed?.replace(/\D/g, "") || null;
    const res = resolveIn(cat, { codeSetId: set.id, name: l.description, hsCode: hs, unit: l.unit || null }, ctx);
    cat.queue.push({
      id: newId("cmq"), importId: null, importRow: null, codeSetId: set.id, code: "", name: l.description, unit: l.unit || null, hsCode: hs, level: res.level,
      suggestedItemId: res.itemId ?? res.candidates[0]?.itemId ?? null, candidates: res.candidates, reason: res.reason, status: "PENDING",
      decidedBy: null, decidedAt: null, sourceRef: `declaration:${info.declarationId}:${l.lineNo}`, createdAt: nowIso(),
    });
  }
}
