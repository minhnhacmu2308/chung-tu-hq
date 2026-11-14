// Gắn dòng hàng với danh mục hàng hóa dùng chung (module catalog qua DeclarationCatalogPort) – spec danh mục §5.
// Tra mã chạy NGOÀI transaction (port module khác lấy kết nối pool riêng); kết quả (kế hoạch) được áp trong transaction của tờ khai.
// Danh mục lỗi / chưa nối → không gắn gì, luồng tờ khai đi tiếp (Review Focus 5).
import { convertItemQty, declarationEditScope, editBlockFor, itemLotFactorDeviates, itemQuantity2, itemUnitKey, sheetOfLine, type LineItem, type Shipment } from "@kb/contracts";
import { Decimal } from "../../../shared/decimal.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { createLogger } from "../../../shared/log.js";
import type { CatalogItemInfo, CatalogQuery, DeclarationDeps, HsLinePatch, LineItemRow } from "./ports.js";

/**
 * `byLine`: dòng (theo số dòng shipment) tra ra chắc chắn một mặt hàng; `info`: tóm tắt mặt hàng theo id (cả mặt hàng dòng đang gắn);
 * `frozen`: số dòng thuộc tờ đang khóa ở Hải quan (tờ còn hiệu lực / đã thông quan – declarationEditScope) – không đổi mặt hàng / HAG_MAHANG,
 * để nội dung tờ đã gửi không đổi (guard SENT_SHEETS_CHANGED) khi danh mục đổi mã sau khi truyền.
 * explicit: dòng chứng từ mang sẵn mặt hàng (lô nhập tay chọn từ danh mục – ShipmentItem.catalogItemId) → id mặt hàng; gắn thẳng như người khai chọn.
 */
export type CatalogPlan = {
  byLine: Map<number, { itemId: string; aliasId: string | null; codeSetId: string | null }>;
  info: Record<string, CatalogItemInfo>;
  frozen: Set<number>;
  explicit?: Map<number, string>;
};

/** Dòng thuộc tờ khóa (theo cùng quy tắc phạm vi sửa của người khai: editBlockFor với tờ khai nháp). Chưa truyền / chưa nối port → rỗng. */
export async function frozenLineNos(deps: DeclarationDeps, orgId: OrgId, dossierId: string, lineNos: number[]): Promise<Set<number>> {
  const sheets = deps.customsSheets ? await deps.customsSheets(orgId, dossierId) : [];
  if (!sheets.length || !lineNos.length) return new Set();
  const scope = declarationEditScope("DRAFT", sheets);
  return new Set(lineNos.filter((n) => editBlockFor(scope, { kind: "LINE", sheet: sheetOfLine(lineNos, n) }) !== null));
}

const sellerOf = (shipment: Shipment) => shipment.parties.seller.name.value?.trim() || null;
export const partNoOf = (shipment: Shipment | null | undefined, lineNo: number) => shipment?.items.find((x) => x.lineNo === lineNo)?.partNo?.value?.trim() || null;

/** Dòng chứng từ → câu tra: Part No trong bộ nhà cung cấp (nhận theo tên người bán), tên/HS/ĐVT cho luật ghép. */
export const queryOf = (shipment: Shipment, it: Shipment["items"][number]): CatalogQuery => ({
  partnerName: sellerOf(shipment), code: it.partNo?.value?.trim() || null, name: it.description.value, hsCode: it.hsOnInvoice.value, unit: it.unit.value,
});

const log = createLogger({ name: "core" });
const logged = (what: string, orgId: OrgId, dossierId: string | null, e: unknown) => log.error(`declaration→catalog: ${what} lỗi`, { orgId, dossierId, err: e });

/** Tóm tắt mặt hàng; lỗi → {} (không chặn). */
export async function describeSafe(deps: DeclarationDeps, orgId: OrgId, ids: (string | null | undefined)[], dossierId: string | null = null): Promise<Record<string, CatalogItemInfo>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!deps.catalog || !want.length) return {};
  try {
    return await deps.catalog.describeItems(orgId, want);
  } catch (e) {
    logged("describeItems", orgId, dossierId, e);
    return {};
  }
}

/**
 * Kế hoạch gắn mặt hàng cho mọi dòng của lô (một lần nạp danh mục – resolveMany). `current`: dòng đang lưu (để lấy tóm tắt mặt hàng đang gắn).
 * Không nối danh mục / lỗi → null.
 */
export async function planCatalogLinks(deps: DeclarationDeps, orgId: OrgId, dossierId: string, shipment: Shipment, current: Pick<LineItemRow, "catalogItemId" | "lineNo">[]): Promise<CatalogPlan | null> {
  if (!deps.catalog || !shipment.items.length) return null;
  try {
    const frozen = await frozenLineNos(deps, orgId, dossierId, current.length ? current.map((c) => c.lineNo) : shipment.items.map((it) => it.lineNo));
    const res = await deps.catalog.resolveMany(orgId, shipment.items.map((it) => queryOf(shipment, it)));
    const byLine: CatalogPlan["byLine"] = new Map();
    shipment.items.forEach((it, i) => {
      const r = res[i];
      if (r?.level === "SURE" && r.itemId) byLine.set(it.lineNo, { itemId: r.itemId, aliasId: r.aliasId ?? null, codeSetId: r.codeSetId });
    });
    const explicit = new Map(shipment.items.flatMap((it) => (it.catalogItemId ? [[it.lineNo, it.catalogItemId] as const] : [])));
    const info = await deps.catalog.describeItems(orgId, [
      ...new Set([...[...byLine.values()].map((v) => v.itemId), ...explicit.values(), ...current.map((c) => c.catalogItemId).filter((x): x is string => !!x)]),
    ]);
    return { byLine, info, frozen, explicit };
  } catch (e) {
    logged("resolveMany", orgId, dossierId, e);
    return null;
  }
}

/**
 * Mặt hàng (đã theo chuỗi gộp) mà dòng sẽ gắn theo kế hoạch. Dòng đã gắn (tự động hoặc người khai chọn) GIỮ mặt hàng đó – tra chắc chắn ra mặt hàng
 * khác không đè (chỉ đổi mô tả/HS invoice mới gỡ, xem syncLineItems); mặt hàng đang gắn không còn dùng được → theo kết quả tra.
 * Dòng chưa gắn → gắn theo kết quả tra chắc chắn. Bí danh: tra ra đúng mặt hàng đang gắn → nhận bí danh ACTIVE mới (vd đề xuất vừa được duyệt).
 * Dòng chứng từ mang sẵn mặt hàng (lô nhập tay chọn từ danh mục) → gắn đúng mặt hàng đó (theo chuỗi gộp), thắng cả mặt hàng đang gắn và kết quả tra;
 * mặt hàng đó không còn dùng được → như dòng thường.
 */
export function plannedItem(row: Pick<LineItemRow, "lineNo" | "catalogItemId" | "catalogAliasId">, plan: CatalogPlan): { info: CatalogItemInfo; aliasId: string | null } | null {
  const hit = plan.byLine.get(row.lineNo);
  const hitInfo = hit ? plan.info[hit.itemId] : undefined;
  const wantedId = plan.explicit?.get(row.lineNo);
  const wanted = wantedId ? plan.info[wantedId] : undefined;
  if (wanted) {
    const aliasId = hit && hitInfo?.id === wanted.id ? hit.aliasId : row.catalogItemId === wanted.id ? (row.catalogAliasId ?? null) : null;
    return { info: wanted, aliasId };
  }
  const kept = row.catalogItemId ? plan.info[row.catalogItemId] : undefined;
  if (kept) return { info: kept, aliasId: hit && hitInfo?.id === kept.id ? hit.aliasId : (row.catalogAliasId ?? null) };
  return hit && hitInfo ? { info: hitInfo, aliasId: hit.aliasId } : null;
}

/** Mã của mặt hàng dòng sẽ gắn (tra bài học theo bí danh). */
export const plannedCodes = (row: Pick<LineItemRow, "lineNo" | "catalogItemId" | "catalogAliasId">, plan: CatalogPlan | null | undefined): string[] => (plan ? (plannedItem(row, plan)?.info.codes ?? []) : []);

/** Thay đổi cột danh mục của dòng theo kế hoạch (null = không đổi). Mặt hàng đang gắn đã ngưng dùng / không còn → gỡ. */
export function linkPatch(row: LineItemRow, plan: CatalogPlan): HsLinePatch | null {
  if (plan.frozen.has(row.lineNo)) return null;
  const p = plannedItem(row, plan);
  const next = { catalogItemId: p?.info.id ?? null, catalogAliasId: p?.aliasId ?? null, itemCode: p?.info.customs?.code ?? null };
  // Đổi mặt hàng → bỏ hệ số theo lô (như trước); Số lượng (2) tính lại với hệ số còn lại sau khi áp.
  const unitFactor = next.catalogItemId && (row.catalogItemId ?? null) === next.catalogItemId ? (row.unitFactor ?? null) : null;
  const q2 = quantity2Columns({ ...row, unitFactor }, p?.info);
  const same = (row.catalogItemId ?? null) === next.catalogItemId && (row.catalogAliasId ?? null) === next.catalogAliasId && (row.itemCode ?? null) === next.itemCode && sameQuantity2(row, q2);
  return same ? null : { ...next, ...(next.catalogItemId ? {} : { unitFactor: null }), ...q2 };
}

/** Cột Số lượng (2) lưu trên dòng (null hết = chưa tính). */
export type Quantity2Columns = Required<Pick<LineItemRow, "quantity2Qty" | "quantity2Unit" | "quantity2Factor">>;
/** Số lượng (2) của dòng theo mặt hàng (không có mặt hàng / ĐVT 2 / không quy được → null hết). */
export function quantity2Columns(row: Pick<LineItemRow, "quantity" | "unit" | "unitFactor">, info: CatalogItemInfo | undefined): Quantity2Columns {
  const q = lineQuantity2(row, info);
  return q ? { quantity2Qty: q.qty, quantity2Unit: q.unit, quantity2Factor: q.factor } : { quantity2Qty: null, quantity2Unit: null, quantity2Factor: null };
}
const sameDec = (a: string | null | undefined, b: string | null) => ((a ?? null) === null || b === null ? (a ?? null) === b : new Decimal(a!).eq(b));
const sameQuantity2 = (row: Pick<LineItemRow, "quantity2Qty" | "quantity2Unit" | "quantity2Factor">, q: Quantity2Columns) =>
  sameDec(row.quantity2Qty, q.quantity2Qty) && (row.quantity2Unit ?? null) === q.quantity2Unit && sameDec(row.quantity2Factor, q.quantity2Factor);

/** Số lượng (2) ĐÃ LƯU của dòng → DTO (màn hình + truyền dùng cùng giá trị). */
export function storedQuantity2(row: Pick<LineItemRow, "quantity2Qty" | "quantity2Unit" | "quantity2Factor">): NonNullable<LineItem["quantity2"]> | undefined {
  if (row.quantity2Qty == null || !row.quantity2Unit) return undefined;
  return { qty: new Decimal(row.quantity2Qty).toFixed(), unit: row.quantity2Unit, factor: new Decimal(row.quantity2Factor ?? "1").toFixed() };
}

/** Hệ số mặc định "1 ĐVT dòng = ? ĐVT gốc" theo danh mục; ĐVT gốc → "1"; không có → null. */
function defaultFactor(conv: NonNullable<CatalogItemInfo["conversion"]>, unit: string): string | null {
  const u = itemUnitKey(unit);
  if (u === itemUnitKey(conv.base)) return "1";
  return Object.entries(conv.factors).find(([k]) => itemUnitKey(k) === u)?.[1] ?? null;
}

/**
 * Số lượng (2) của dòng theo ĐVT 2 + tỷ lệ của mặt hàng (itemQuantity2 – dùng chung với mock): hệ số theo lô của dòng thắng quy đổi danh mục.
 * Không có mặt hàng / ĐVT 2 / không quy được về gốc → undefined (giữ mặc định SL2 = SL1).
 */
export function lineQuantity2(row: Pick<LineItemRow, "quantity" | "unit" | "unitFactor">, info: CatalogItemInfo | undefined): NonNullable<LineItem["quantity2"]> | undefined {
  if (!info?.qty2) return undefined;
  return itemQuantity2({ qty: row.quantity, unit: row.unit, lotFactor: row.unitFactor }, info.conversion, info.qty2) ?? undefined;
}

/**
 * Phần danh mục của DTO dòng hàng: mặt hàng đã gắn, "mã lạ", gợi ý lượng theo ĐVT khai (ĐVT của mã Hải quan), Số lượng (2) ĐÃ LƯU trên dòng
 * (không tính lại từ danh mục – giá trị hiện = giá trị truyền).
 */
export function catalogView(row: LineItemRow, info: CatalogItemInfo | undefined, partNo: string | null, catalogOn: boolean): Pick<LineItem, "catalogItem" | "unknownCode" | "qtySuggestion" | "quantity2"> {
  const q2 = storedQuantity2(row);
  // Danh mục lỗi / không đọc được mặt hàng: vẫn hiện Số lượng (2) đã lưu (đó là giá trị sẽ truyền).
  if (!info) return catalogOn && !row.catalogItemId && partNo ? { unknownCode: true } : q2 ? { quantity2: q2 } : {};
  const out: Pick<LineItem, "catalogItem" | "unknownCode" | "qtySuggestion" | "quantity2"> = { catalogItem: { id: info.id, itemNo: info.itemNo, name: info.name }, ...(q2 ? { quantity2: q2 } : {}) };
  const toUnit = info.customs?.unit;
  if (!toUnit || !info.conversion || itemUnitKey(toUnit) === itemUnitKey(row.unit)) return out;
  const lot = row.unitFactor ?? undefined;
  const conv = convertItemQty(row.quantity, row.unit, toUnit, info.conversion, lot);
  if (!conv) return out;
  const def = lot ? defaultFactor(info.conversion, row.unit) : null;
  return { ...out, qtySuggestion: { qty: conv.qty, unit: toUnit, factor: conv.factor, lotFactor: !!lot, deviates: !!lot && !!def && itemLotFactorDeviates(lot, def) } };
}

/** planCatalogLinks với dòng đang lưu của hồ sơ (đọc trong transaction ngắn riêng, trước transaction đồng bộ). */
export async function planForDossier(deps: DeclarationDeps, ctx: { orgId: OrgId; userId: UserId }, dossierId: string, shipment: Shipment): Promise<CatalogPlan | null> {
  if (!deps.catalog) return null;
  const current = await deps.uow.asOrg(ctx, (r) => r.lineItems.list(ctx.orgId, dossierId));
  return planCatalogLinks(deps, ctx.orgId, dossierId, shipment, current);
}
