// Phần dùng chung của các use case danh mục: ánh xạ DTO, lỗi, nhật ký field_audit (cùng transaction), tra bộ mã theo loại.
import { itemUnitKey, type CatalogItem, type CatalogMode, type CodeSet, type CodeSetKind, type ItemAlias } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { Decimal } from "../../../shared/decimal.js";
import { domainError, reasonError, type DomainError } from "../../../shared/errors.js";
import type { Result } from "../../../shared/result.js";
import type { OrgId } from "../../../shared/ids.js";
import type { CatalogDeps, CatalogItemRow, CatalogRepos, CatalogSettingsRow, CodeSetRow, ItemAliasRow, ItemConversionRow } from "./ports.js";

/** Bộ mã nội bộ (thay nhau theo chế độ); SUPPLIER/CUSTOMER có ở cả hai chế độ. */
export const INTERNAL_KINDS: readonly CodeSetKind[] = ["SHARED", "ACCOUNTING", "WAREHOUSE", "CUSTOMS"];
export const DEPARTMENT_KINDS = ["ACCOUNTING", "WAREHOUSE", "CUSTOMS"] as const;
export const isInternal = (k: CodeSetKind) => INTERNAL_KINDS.includes(k);
export const isPartnerKind = (k: CodeSetKind) => k === "SUPPLIER" || k === "CUSTOMER";

/** Tên mặc định của bộ mã (dữ liệu doanh nghiệp, người dùng đổi được). */
export const DEFAULT_SET_NAME: Record<CodeSetKind, string> = { SHARED: "Mã chung", ACCOUNTING: "Kế toán", WAREHOUSE: "Kho", CUSTOMS: "XNK", SUPPLIER: "Nhà cung cấp", CUSTOMER: "Khách hàng" };

/** `mode` NULL = chưa thiết lập → coi như PER_DEPARTMENT. */
export const effectiveMode = (s: CatalogSettingsRow | null): CatalogMode => s?.mode ?? "PER_DEPARTMENT";

/** Mục field_audit gom trong transaction. `itemId` là đối tượng của lịch sử (cột dossier_id). */
export type AuditEntry = { itemId: string; key: string; oldValue: string; newValue: string };

type AuditCtx = { orgId: OrgId; userId: Ctx["userId"] };

/** Ghi các mục field_audit (CATALOG_EDIT) qua repo của transaction đang chạy – commit/rollback cùng lệnh sửa (bất biến 6). */
export async function writeAudit(r: CatalogRepos, ctx: AuditCtx, at: Date, entries: readonly AuditEntry[]): Promise<void> {
  await r.fieldAudit.append(ctx, at, entries.map((e) => ({ dossierId: e.itemId, key: e.key, oldValue: e.oldValue, newValue: e.newValue, source: "CATALOG_EDIT" as const })));
}

/** Transaction danh mục có nhật ký: callback trả Result kèm `audit`; kết quả ok → ghi field_audit ngay trong transaction đó, trước commit. */
export function asOrgAudited<V extends { audit: AuditEntry[] }>(deps: CatalogDeps, ctx: AuditCtx, fn: (r: CatalogRepos) => Promise<Result<V>>): Promise<Result<V>> {
  return deps.uow.asOrg(ctx, async (r) => {
    const res = await fn(r);
    if (res.ok) await writeAudit(r, ctx, deps.clock.now(), res.value.audit);
    return res;
  });
}

export const itemNotFound = (): DomainError => reasonError("NOT_FOUND", "PRODUCT_NOT_FOUND");
export const setNotFound = (): DomainError => domainError("NOT_FOUND", "Không tìm thấy bộ mã");
export const aliasNotFound = (): DomainError => domainError("NOT_FOUND", "Không tìm thấy mã hàng");
export const modeConflict = (details?: unknown): DomainError => reasonError("INVALID_STATE", "CATALOG_MODE_CONFLICT", undefined, details);
export const codeTaken = (holder: { id: string; itemNo: string; name: string } | null): DomainError =>
  reasonError("DUPLICATE", "CATALOG_CODE_TAKEN", undefined, holder ? { itemId: holder.id, itemNo: holder.itemNo, itemName: holder.name } : undefined);
export const factorRequired = (unit: string): DomainError => reasonError("VALIDATION", "CATALOG_UNIT_FACTOR_REQUIRED", undefined, { unit });

/** Unique bí danh ACTIVE (bộ, code_key) – vi phạm này mới là CATALOG_CODE_TAKEN. */
export const ALIAS_ACTIVE_UQ = "item_aliases_set_code_active_uq";

/**
 * Vi phạm unique (Postgres 23505 / "duplicate key") – kể cả khi bọc trong cause. Có `constraint` → chỉ đúng ràng buộc đó
 * (so tên trong constraint_name hoặc thông điệp).
 */
export function isDuplicate(e: unknown, constraint?: string): boolean {
  let cur: unknown = e;
  for (let depth = 0; depth < 4 && cur != null; depth++) {
    const o = typeof cur === "object" ? (cur as { code?: unknown; message?: unknown; constraint_name?: unknown; constraint?: unknown }) : null;
    const msg = cur instanceof Error ? cur.message : o ? String(o.message ?? "") : String(cur);
    if (o?.code === "23505" || /duplicate key/i.test(msg)) {
      if (!constraint) return true;
      if (o?.constraint_name === constraint || o?.constraint === constraint || msg.includes(constraint)) return true;
    }
    cur = o ? (cur as { cause?: unknown }).cause : null;
  }
  return false;
}

export const auditKeyAlias = (a: Pick<ItemAliasRow, "codeSetId" | "code">) => `alias:${a.codeSetId}:${a.code}`;

export function toItemDto(r: CatalogItemRow): CatalogItem {
  return {
    id: r.id, itemNo: r.itemNo, kind: r.kind, name: r.name, hsCode: r.hsCode, baseUnit: r.baseUnit, origin: r.origin, tariffSchedule: r.tariffSchedule,
    importDutyRate: r.importDutyRate, vatRate: r.vatRate, envTaxRate: r.envTaxRate, exciseRate: r.exciseRate, safeguardRate: r.safeguardRate, antiDiscriminationRate: r.antiDiscriminationRate,
    qty2Unit: r.qty2Unit, qty2Factor: r.qty2Factor === null ? null : new Decimal(r.qty2Factor).toFixed(),
    description: r.description, note: r.note, timesDeclared: r.timesDeclared, lastDeclarationNo: r.lastDeclarationNo, lastDeclarationDate: r.lastDeclarationDate,
    status: r.status, mergedIntoId: r.mergedIntoId, source: r.source, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

export function toAliasDto(a: ItemAliasRow): ItemAlias {
  return { id: a.id, codeSetId: a.codeSetId, code: a.code, codeKey: a.codeKey, name: a.name, unit: a.unit, itemId: a.itemId, status: a.status, proposedBy: a.proposedBy, decidedBy: a.decidedBy, decidedAt: a.decidedAt?.toISOString() ?? null, source: a.source };
}

export function toCodeSetDto(s: CodeSetRow, ownerIds: string[], codeCount: number): CodeSet {
  return { id: s.id, kind: s.kind, name: s.name, partnerName: s.partnerName, partnerKey: s.partnerKey, isPrimaryDisplay: s.isPrimaryDisplay, isDefault: s.isDefault, isSource: s.isSource, ownerIds, codeCount };
}

/** Bộ nguồn gốc của doanh nghiệp (null = chưa có). */
export const sourceSetOf = <S extends Pick<CodeSetRow, "isSource">>(sets: readonly S[]): S | null => sets.find((s) => s.isSource) ?? null;
export const sourceSetInvalid = (): DomainError => reasonError("VALIDATION", "CATALOG_SOURCE_SET_INVALID");

/** Bí danh mới nhất (đã duyệt muộn nhất, rồi tạo muộn nhất) – "nhiều mã → mã mới nhất". */
export function newestAlias(aliases: ItemAliasRow[]): ItemAliasRow | null {
  let best: ItemAliasRow | null = null;
  const at = (a: ItemAliasRow) => (a.decidedAt ?? a.createdAt).getTime();
  for (const a of aliases) if (!best || at(a) > at(best) || (at(a) === at(best) && a.id > best.id)) best = a;
  return best;
}

/**
 * Bộ mã theo loại hoặc id. CUSTOMS → bộ `is_default` (CUSTOMS ở PER_DEPARTMENT, SHARED ở SHARED).
 * Chế độ SHARED: ACCOUNTING/WAREHOUSE/CUSTOMS/SHARED đều là bộ "Mã chung".
 */
export async function findSetByRef(r: CatalogRepos, orgId: OrgId, ref: string): Promise<CodeSetRow | null> {
  const sets = await r.codeSets.list(orgId);
  const byId = sets.find((s) => s.id === ref);
  if (byId) return byId;
  if (!INTERNAL_KINDS.includes(ref as CodeSetKind) && !isPartnerKind(ref as CodeSetKind)) return null;
  const kind = ref as CodeSetKind;
  const mode = effectiveMode(await r.settings.get(orgId));
  if (mode === "SHARED" && isInternal(kind)) return sets.find((s) => s.kind === "SHARED") ?? sets.find((s) => s.isDefault) ?? null;
  if (kind === "CUSTOMS" || kind === "SHARED") return sets.find((s) => s.isDefault) ?? sets.find((s) => s.kind === kind) ?? null;
  return sets.find((s) => s.kind === kind) ?? null;
}

/** Hệ số "1 `unit` = factor `base`": cùng ĐVT gốc → "1"; có quy đổi → hệ số; không → null (không tự nhân 1). */
export function factorFor(item: Pick<CatalogItemRow, "baseUnit">, conversions: Pick<ItemConversionRow, "unit" | "factor">[], unit: string | null | undefined): string | null {
  if (!unit) return null;
  const u = itemUnitKey(unit);
  if (item.baseUnit && itemUnitKey(item.baseUnit) === u) return "1";
  return conversions.find((c) => itemUnitKey(c.unit) === u)?.factor ?? null;
}

/** ĐVT khác ĐVT gốc mà chưa có quy đổi (và không kèm hệ số) → cần hệ số. ĐVT gốc chưa đặt → không kiểm. */
export const needsFactor = (item: Pick<CatalogItemRow, "baseUnit">, conversions: Pick<ItemConversionRow, "unit" | "factor">[], unit: string | null | undefined) =>
  !!unit && !!item.baseUnit && factorFor(item, conversions, unit) === null;
