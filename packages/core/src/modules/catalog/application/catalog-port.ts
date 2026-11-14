// Cổng danh mục cho module khác (extraction, declaration, invoice, lô nhập tay) – export qua index.ts.
// Module gọi port này SAU khi giao dịch của mình commit (không gọi port module khác trong transaction – packages/core/CLAUDE.md).
// Chạy dưới ngữ cảnh hệ thống của org (userId rỗng), không kiểm vai trò: nơi gọi đã kiểm quyền thao tác của chính nó.
import { itemCodeKey, itemNameKey, itemQty2Factor, type CodeSetKind, type ItemUnitConversionTable } from "@kb/contracts";
import { asUserId, type OrgId } from "../../../shared/ids.js";
import { findSetByRef, isPartnerKind, newestAlias } from "./common.js";
import { ensurePartnerSet } from "./partner-set.js";
import type { CatalogDeps, CatalogItemRow, MatchQueueRow } from "./ports.js";
import { loadMatchContext, resolveInTx, resolveManyInTx, resolveWith, type ResolveItemQuery, type ResolveItemResult } from "./resolve.js";

/** Số tờ khai Hải quan cấp cho một mặt hàng (dòng của tờ khai nhánh), ngày `YYYY-MM-DD`. */
export type DeclarationNoRow = { itemId: string; declarationNo: string; date: string };
export type DeclaredRow = { itemId: string; declarationNo: string | null; date: string | null; typeCode: string | null };
export type UnknownCodeRow = { codeSetId?: string | null; code: string; name: string; unit?: string | null; hsCode?: string | null; sourceRef?: string | null };
export type CodeInSet = { codeSetId: string; aliasId: string; code: string; name: string | null; unit: string | null };
/**
 * Tóm tắt mặt hàng cho chứng từ (tờ khai): mặt hàng cuối chuỗi gộp, mã ở bộ Hải quan (mới nhất – điền HAG_MAHANG), mọi mã ACTIVE
 * (tra bài học theo bí danh), bảng quy đổi (gợi ý lượng theo ĐVT khai), ĐVT số lượng 2 + tỷ lệ đã chuẩn hóa (Số lượng (2) – null khi chưa khai /
 * thiếu tỷ lệ).
 */
export type CatalogItemBrief = {
  id: string; itemNo: string; name: string; hsCode: string | null; baseUnit: string | null; customs: CodeInSet | null; codes: string[]; conversion: ItemUnitConversionTable | null;
  qty2: { unit: string; factor: string } | null;
};

export interface CatalogPort {
  resolveItem(orgId: OrgId, q: ResolveItemQuery): Promise<ResolveItemResult>;
  /** Tra nhiều dòng (mọi dòng của một tờ khai/hồ sơ): danh mục + chỉ mục ghép nạp một lần; kết quả theo thứ tự đầu vào. */
  resolveMany(orgId: OrgId, qs: ResolveItemQuery[]): Promise<ResolveItemResult[]>;
  /** Id mặt hàng hiện hành theo chuỗi gộp (chứng từ cũ trỏ mặt hàng đã gộp → mặt hàng cuối); không có → null. */
  currentItemId(orgId: OrgId, itemId: string): Promise<string | null>;
  /**
   * Một tờ khai được duyệt: các dòng (của CÙNG một tờ khai) đã gắn mặt hàng → mỗi mặt hàng (sau khi theo chuỗi gộp) times_declared + 1 MỘT lần,
   * dù nhiều dòng cùng mặt hàng (như recordApprovedProducts cũ). Gọi đúng một lần cho mỗi lần duyệt – duyệt lại sau khi mở lại sẽ cộng thêm (giống bản cũ).
   */
  recordDeclared(orgId: OrgId, rows: DeclaredRow[]): Promise<{ updated: number }>;
  /**
   * Hải quan cấp số cho tờ khai đã duyệt (customs – sau khi giao dịch của integration commit): ghi số tờ khai cuối (+ ngày) của mỗi mặt hàng
   * (theo chuỗi gộp, một lần mỗi mặt hàng) khi ngày đang lưu trống hoặc ≤ ngày này. KHÔNG cộng times_declared (đã cộng lúc duyệt). Gọi lại y nguyên → kết quả như cũ.
   */
  recordDeclarationNo(orgId: OrgId, rows: DeclarationNoRow[]): Promise<{ updated: number }>;
  /** Mã/dòng chưa biết → mục hàng chờ ghép (kèm gợi ý theo luật ghép). Đã biết chắc trong bộ / đang chờ trùng → bỏ qua. */
  enqueueUnknown(orgId: OrgId, rows: UnknownCodeRow[]): Promise<{ queued: number }>;
  /** Mã của mặt hàng trong bộ (theo loại hoặc id). "CUSTOMS" → bộ mặc định Hải quan (XNK hoặc "Mã chung"); nhiều mã → mã mới nhất. */
  codeInSet(orgId: OrgId, itemId: string, codeSet: CodeSetKind | string): Promise<CodeInSet | null>;
  /** Bảng quy đổi mặc định của mặt hàng (null khi không có mặt hàng hoặc chưa có ĐVT gốc). */
  conversionOf(orgId: OrgId, itemId: string): Promise<ItemUnitConversionTable | null>;
  /** Tóm tắt nhiều mặt hàng một lần (một transaction), khóa = id được hỏi. Không có / ARCHIVED / org khác → vắng. */
  describeItems(orgId: OrgId, itemIds: string[]): Promise<Record<string, CatalogItemBrief>>;
  /**
   * Bộ mã đối tác theo tên (partner_key); chưa có → tạo (spec §5 "chưa có → tạo bộ"), không người phụ trách – chỉ Quản trị/Chủ duyệt.
   * Tên rỗng → null.
   */
  ensurePartnerSet(orgId: OrgId, kind: "SUPPLIER" | "CUSTOMER", partnerName: string): Promise<string | null>;
  /** Bộ mã đối tác theo tên (partner_key) nếu đã có – KHÔNG tạo (đường chỉ đọc, vd in hóa đơn theo bộ khách hàng). Chưa có / tên rỗng → null. */
  findPartnerSet(orgId: OrgId, kind: "SUPPLIER" | "CUSTOMER", partnerName: string): Promise<string | null>;
}

export function createCatalogPort(deps: CatalogDeps): CatalogPort {
  const sys = (orgId: OrgId) => ({ orgId, userId: asUserId("") });
  return {
    resolveItem: (orgId, q) => deps.uow.asOrg(sys(orgId), (r) => resolveInTx(r, orgId, q)),
    resolveMany: (orgId, qs) => deps.uow.asOrg(sys(orgId), (r) => resolveManyInTx(r, orgId, qs)),
    currentItemId: (orgId, itemId) => deps.uow.asOrg(sys(orgId), async (r) => (await r.items.resolveMerged(orgId, itemId))?.id ?? null),
    recordDeclared: (orgId, rows) =>
      deps.uow.asOrg(sys(orgId), async (r) => {
        const now = deps.clock.now();
        // Gom theo mặt hàng cuối chuỗi gộp: một tờ khai cộng một lần mỗi mặt hàng.
        const byItem = new Map<string, DeclaredRow>();
        for (const row of rows) {
          const item = await r.items.resolveMerged(orgId, row.itemId);
          if (item && !byItem.has(item.id)) byItem.set(item.id, row);
        }
        for (const [id, row] of byItem) {
          const item = (await r.items.get(orgId, id))!;
          const newer = (row.date ?? "") >= (item.lastDeclarationDate ?? "");
          await r.items.incrementDeclared(orgId, id, {
            ...(newer ? { lastDeclarationNo: row.declarationNo, lastDeclarationDate: row.date, lastTypeCode: row.typeCode } : {}),
            updatedAt: now,
          });
        }
        return { updated: byItem.size };
      }),
    recordDeclarationNo: (orgId, rows) =>
      deps.uow.asOrg(sys(orgId), async (r) => {
        const now = deps.clock.now();
        const byItem = new Map<string, DeclarationNoRow>();
        for (const row of rows) {
          const item = await r.items.resolveMerged(orgId, row.itemId);
          if (item && !byItem.has(item.id)) byItem.set(item.id, row);
        }
        let updated = 0;
        for (const [id, row] of byItem) if (await r.items.recordDeclarationNo(orgId, id, row.declarationNo, row.date, now)) updated++;
        return { updated };
      }),
    enqueueUnknown: (orgId, rows) =>
      deps.uow.asOrg(sys(orgId), async (r) => {
        const sets = await r.codeSets.list(orgId);
        const fallback = sets.find((s) => s.isDefault)?.id ?? null;
        const pending = await r.queue.list(orgId, { status: "PENDING" });
        const seen = new Set(pending.map((p) => `${p.codeSetId}\0${itemCodeKey(p.code)}\0${itemNameKey(p.name)}`));
        let queued = 0;
        const match = rows.length ? await loadMatchContext(r, orgId) : null;
        for (const row of rows) {
          const codeSetId = row.codeSetId ?? fallback;
          if (!codeSetId || !sets.some((s) => s.id === codeSetId)) continue;
          const key = `${codeSetId}\0${itemCodeKey(row.code)}\0${itemNameKey(row.name)}`;
          if (seen.has(key)) continue;
          const res = resolveWith(match!, { codeSetId, code: row.code, name: row.name, hsCode: row.hsCode ?? null, unit: row.unit ?? null });
          if (res.level === "SURE" && res.aliasId) continue; // mã đã có trong bộ
          const top = res.candidates[0];
          const now = deps.clock.now();
          const q: MatchQueueRow = {
            id: deps.idGen.next("cmq"), orgId, importId: null, codeSetId, code: row.code, name: row.name, unit: row.unit ?? null, hsCode: row.hsCode ?? null,
            level: res.level, suggestedItemId: res.itemId ?? top?.itemId ?? null, candidates: res.candidates, reason: res.reason, status: "PENDING",
            decidedBy: null, decidedAt: null, sourceRef: row.sourceRef ?? null, createdAt: now, updatedAt: now,
          };
          await r.queue.insert(q);
          seen.add(key);
          queued++;
        }
        return { queued };
      }),
    codeInSet: (orgId, itemId, codeSet) =>
      deps.uow.asOrg(sys(orgId), async (r) => {
        const set = await findSetByRef(r, orgId, codeSet);
        const item = await r.items.resolveMerged(orgId, itemId);
        if (!set || !item) return null;
        const a = newestAlias((await r.aliases.listForItem(orgId, item.id)).filter((x) => x.codeSetId === set.id && x.status === "ACTIVE"));
        return a ? { codeSetId: set.id, aliasId: a.id, code: a.code, name: a.name, unit: a.unit } : null;
      }),
    conversionOf: (orgId, itemId) =>
      deps.uow.asOrg(sys(orgId), async (r) => {
        const item = await r.items.resolveMerged(orgId, itemId);
        if (!item?.baseUnit) return null;
        const convs = await r.conversions.listForItem(orgId, item.id);
        return { base: item.baseUnit, factors: Object.fromEntries(convs.map((c) => [c.unit, c.factor])) };
      }),
    describeItems: (orgId, itemIds) =>
      deps.uow.asOrg(sys(orgId), async (r) => {
        const out: Record<string, CatalogItemBrief> = {};
        const ids = [...new Set(itemIds.filter(Boolean))];
        if (!ids.length) return out;
        const customsSet = await findSetByRef(r, orgId, "CUSTOMS");
        // Một truy vấn mỗi bảng; chỉ mặt hàng đã gộp mới theo chuỗi từng cái (hiếm).
        const ends = new Map<string, CatalogItemRow>();
        for (const it of await r.items.getMany(orgId, ids)) {
          const end = it.status === "MERGED" ? await r.items.resolveMerged(orgId, it.id) : it;
          if (end && end.status === "ACTIVE") ends.set(it.id, end);
        }
        const endIds = [...new Set([...ends.values()].map((x) => x.id))];
        const aliases = await r.aliases.listForItems(orgId, endIds);
        const conversions = await r.conversions.listForItems(orgId, endIds);
        for (const id of ids) {
          const item = ends.get(id);
          if (!item) continue;
          const active = aliases.filter((a) => a.itemId === item.id && a.status === "ACTIVE");
          const c = customsSet ? newestAlias(active.filter((a) => a.codeSetId === customsSet.id)) : null;
          const convs = item.baseUnit ? conversions.filter((x) => x.itemId === item.id) : [];
          const q2Factor = item.qty2Unit ? itemQty2Factor({ unit: item.qty2Unit, factor: item.qty2Factor }, item.baseUnit) : null;
          out[id] = {
            qty2: item.qty2Unit && q2Factor ? { unit: item.qty2Unit, factor: q2Factor } : null,
            id: item.id, itemNo: item.itemNo, name: item.name, hsCode: item.hsCode, baseUnit: item.baseUnit,
            customs: c ? { codeSetId: c.codeSetId, aliasId: c.id, code: c.code, name: c.name, unit: c.unit } : null,
            codes: [...new Set(active.sort((a, b) => (b.decidedAt ?? b.createdAt).getTime() - (a.decidedAt ?? a.createdAt).getTime()).map((a) => a.code))],
            conversion: item.baseUnit ? { base: item.baseUnit, factors: Object.fromEntries(convs.map((x) => [x.unit, x.factor])) } : null,
          };
        }
        return out;
      }),
    findPartnerSet: async (orgId, kind, partnerName) => {
      const key = partnerName.trim() ? itemNameKey(partnerName.trim()) : "";
      if (!key) return null;
      return deps.uow.asOrg(sys(orgId), async (r) => (await r.codeSets.list(orgId)).find((x) => x.kind === kind && x.partnerKey === key)?.id ?? null);
    },
    ensurePartnerSet: async (orgId, kind, partnerName) => {
      if (!isPartnerKind(kind) || !partnerName.trim()) return null;
      return ensurePartnerSet(deps, orgId, kind, partnerName);
    },
  };
}
