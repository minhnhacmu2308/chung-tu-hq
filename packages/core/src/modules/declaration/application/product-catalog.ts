// Danh mục hàng hóa của doanh nghiệp: mặt hàng đã khai (import bảng kê dòng hàng, thêm tay, tự thêm khi tờ khai được duyệt).
// Đọc: mọi thành viên. Ghi: Người khai / Quản trị / Chủ sở hữu (Người duyệt và Người xem chỉ đọc).
import {
  normalizeProductName, productKey, type ImportProductCatalogInput, type ImportProductCatalogResult, type ProductCatalogItem, type ProductCatalogValues,
} from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { DeclarationDeps, DeclarationRepos, DeclarationRow, LineItemRow, ProductRow } from "./ports.js";

const canEdit = (ctx: Ctx) => requireRole(ctx, "DECLARANT", "ADMIN");

export function toProductItem(r: ProductRow): ProductCatalogItem {
  return {
    id: r.id, code: r.code, name: r.name, hsCode: r.hsCode, unit: r.unit, origin: r.origin, tariffSchedule: r.tariffSchedule,
    importDutyRate: r.importDutyRate, vatRate: r.vatRate, envTaxRate: r.envTaxRate, exciseRate: r.exciseRate, safeguardRate: r.safeguardRate,
    antiDiscriminationRate: r.antiDiscriminationRate, description: r.description, unit2: r.unit2, unitPrice: r.unitPrice, currency: r.currency, partner: r.partner, note: r.note, source: r.source, timesDeclared: r.timesDeclared,
    lastDeclarationNo: r.lastDeclarationNo, lastDeclarationDate: r.lastDeclarationDate, lastTypeCode: r.lastTypeCode, raw: r.raw,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

const duplicate = (code: string | null) => (code ? reasonError("DUPLICATE", "PRODUCT_CODE_EXISTS", { code }) : reasonError("DUPLICATE", "PRODUCT_NAME_EXISTS"));

export async function listProducts(deps: DeclarationDeps, ctx: Ctx): Promise<Result<ProductCatalogItem[]>> {
  return ok((await deps.uow.asOrg(ctx, (r) => r.products.list(ctx.orgId))).map(toProductItem));
}

export async function createProduct(deps: DeclarationDeps, ctx: Ctx, input: ProductCatalogValues): Promise<Result<ProductCatalogItem>> {
  const allowed = canEdit(ctx);
  if (!allowed.ok) return allowed;
  const key = productKey(input.code, input.name);
  const now = deps.clock.now();
  return deps.uow.asOrg(ctx, async (r) => {
    if ((await r.products.byKeys(ctx.orgId, [key])).length) return err(duplicate(input.code));
    const row: ProductRow = {
      id: deps.idGen.next("prd"), orgId: ctx.orgId, key, nameKey: normalizeProductName(input.name), ...input, source: "MANUAL", timesDeclared: 0, lastDeclarationNo: null, lastDeclarationDate: null,
      lastTypeCode: null, raw: null, updatedBy: ctx.userId, createdAt: now, updatedAt: now,
    };
    await r.products.insert([row]);
    return ok(toProductItem(row));
  });
}

export async function updateProduct(deps: DeclarationDeps, ctx: Ctx, id: string, input: ProductCatalogValues): Promise<Result<ProductCatalogItem>> {
  const allowed = canEdit(ctx);
  if (!allowed.ok) return allowed;
  const key = productKey(input.code, input.name);
  return deps.uow.asOrg(ctx, async (r) => {
    const cur = await r.products.get(ctx.orgId, id);
    if (!cur) return err(reasonError("NOT_FOUND", "PRODUCT_NOT_FOUND"));
    if (key !== cur.key && (await r.products.byKeys(ctx.orgId, [key])).some((p) => p.id !== id)) return err(duplicate(input.code));
    const row: ProductRow = { ...cur, ...input, key, nameKey: normalizeProductName(input.name), updatedBy: ctx.userId, updatedAt: deps.clock.now() };
    await r.products.update(row);
    return ok(toProductItem(row));
  });
}

export async function deleteProducts(deps: DeclarationDeps, ctx: Ctx, ids: string[]): Promise<Result<{ deleted: number }>> {
  const allowed = canEdit(ctx);
  if (!allowed.ok) return allowed;
  const deleted = await deps.uow.asOrg(ctx, (r) => r.products.remove(ctx.orgId, [...new Set(ids)]));
  if (!deleted) return err(reasonError("NOT_FOUND", "PRODUCT_NOT_FOUND"));
  await deps.orgAudit?.record(ctx, { action: "PRODUCTS_DELETED", targetType: "product", targetId: ids.length === 1 ? ids[0]! : "*", targetLabel: `${deleted} mặt hàng`, detail: { count: deleted } });
  return ok({ deleted });
}

/**
 * Import mặt hàng (đã gộp ở trình duyệt). Gặp mặt hàng đã có: bản import mới hơn (ngày tờ khai gần nhất ≥) thì ghi đè
 * thông tin; cũ hơn thì chỉ điền ô đang trống. Số lần khai lấy max → import lại cùng một file không bị cộng dồn.
 */
export async function importProducts(deps: DeclarationDeps, ctx: Ctx, input: ImportProductCatalogInput): Promise<Result<ImportProductCatalogResult>> {
  const allowed = canEdit(ctx);
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  // Trong cùng lô: trùng khóa thì giữ dòng có tờ khai mới nhất.
  const byKey = new Map<string, ImportProductCatalogInput["items"][number]>();
  for (const it of input.items) {
    const k = productKey(it.code, it.name);
    const prev = byKey.get(k);
    if (!prev || (it.lastDeclarationDate ?? "") >= (prev.lastDeclarationDate ?? "")) byKey.set(k, prev ? { ...it, timesDeclared: Math.max(it.timesDeclared, prev.timesDeclared) } : it);
  }
  return deps.uow.asOrg(ctx, async (r) => {
    const existing = new Map((await r.products.byKeys(ctx.orgId, [...byKey.keys()])).map((p) => [p.key, p]));
    const inserts: ProductRow[] = [];
    let updated = 0;
    for (const [key, it] of byKey) {
      const cur = existing.get(key);
      if (!cur) {
        inserts.push({ id: deps.idGen.next("prd"), orgId: ctx.orgId, key, nameKey: normalizeProductName(it.name), ...it, source: "IMPORT", updatedBy: ctx.userId, createdAt: now, updatedAt: now });
        continue;
      }
      const newer = (it.lastDeclarationDate ?? "") >= (cur.lastDeclarationDate ?? "");
      const pick = <K extends keyof typeof it & keyof ProductRow>(k: K) => (newer ? (it[k] ?? cur[k]) : (cur[k] ?? it[k])) as ProductRow[K];
      await r.products.update({
        ...cur, code: pick("code"), name: newer ? it.name : cur.name, nameKey: normalizeProductName(newer ? it.name : cur.name), hsCode: newer ? it.hsCode : cur.hsCode, unit: pick("unit"), origin: pick("origin"),
        tariffSchedule: pick("tariffSchedule"), importDutyRate: pick("importDutyRate"), vatRate: pick("vatRate"), envTaxRate: pick("envTaxRate"), exciseRate: pick("exciseRate"),
        safeguardRate: pick("safeguardRate"), antiDiscriminationRate: pick("antiDiscriminationRate"), description: pick("description"), unit2: pick("unit2"),
        unitPrice: pick("unitPrice"), currency: pick("currency"), partner: pick("partner"), note: pick("note"),
        timesDeclared: Math.max(cur.timesDeclared, it.timesDeclared), lastDeclarationNo: pick("lastDeclarationNo"), lastDeclarationDate: pick("lastDeclarationDate"),
        lastTypeCode: pick("lastTypeCode"), raw: pick("raw"), updatedBy: ctx.userId, updatedAt: now,
      });
      updated++;
    }
    await r.products.insert(inserts);
    return ok({ created: inserts.length, updated });
  }).then(async (res) => {
    if (res.ok) await deps.orgAudit?.record(ctx, { action: "PRODUCTS_IMPORTED", targetType: "product", targetId: "*", targetLabel: `${res.value.created + res.value.updated} mặt hàng`, detail: res.value });
    return res;
  });
}

/**
 * Tờ khai vừa được duyệt → ghi mặt hàng có HS đã xác nhận vào danh mục (trong cùng transaction duyệt).
 * Mặt hàng mới: thêm (nguồn "Từ tờ khai"). Đã có: tăng số lần khai + cập nhật lần khai gần nhất, GIỮ mã HS trong danh mục
 * (danh mục do người dùng quản lý; không ghi đè lặng lẽ).
 */
export async function recordApprovedProducts(r: DeclarationRepos, idGen: DeclarationDeps["idGen"], decl: DeclarationRow, items: LineItemRow[], now: Date, userId: string): Promise<void> {
  const confirmed = items.filter((i) => i.hsConfirmed);
  if (!confirmed.length) return;
  const date = now.toISOString().slice(0, 10);
  const typeCode = Object.values(decl.fields).find((f) => f.no === "1.4" || f.no === "2.4")?.value || null;
  const currency = decl.fields.MA_TT?.value || null;
  // Đối tác: tờ khai nhập → người xuất khẩu; tờ khai xuất → người nhập khẩu.
  const partnerNo = decl.kind === "EDA" ? "2.19" : "1.20";
  const partner = Object.values(decl.fields).find((f) => f.no === partnerNo)?.value.trim().slice(0, 255) || null;
  const latest = (i: LineItemRow) => ({ unitPrice: i.unitPrice || null, currency, partner });
  // Dòng hàng không có mã hàng → tra theo tên chuẩn hóa (khớp cả mặt hàng đã có mã hàng trong danh mục).
  const byName = new Map(confirmed.map((i) => [normalizeProductName(i.description), i]));
  const existing = new Map((await r.products.byNameKeys(decl.orgId, [...byName.keys()])).map((p) => [p.nameKey, p]));
  const inserts: ProductRow[] = [];
  for (const [nameKey, i] of byName) {
    const cur = existing.get(nameKey);
    if (cur) {
      const l = latest(i);
      await r.products.update({
        ...cur, timesDeclared: cur.timesDeclared + 1, lastDeclarationNo: null, lastDeclarationDate: date, lastTypeCode: typeCode ?? cur.lastTypeCode,
        unitPrice: l.unitPrice ?? cur.unitPrice, currency: l.unitPrice ? (l.currency ?? cur.currency) : cur.currency, partner: l.partner ?? cur.partner, updatedAt: now,
      });
      continue;
    }
    inserts.push({
      id: idGen.next("prd"), orgId: decl.orgId, key: productKey(null, i.description), nameKey, code: null, name: i.description.trim(), hsCode: i.hsConfirmed!.replace(/\D/g, ""),
      unit: i.unit || null, origin: i.origin || null, tariffSchedule: null, importDutyRate: i.importDutyRate, vatRate: i.vatRate,
      envTaxRate: null, exciseRate: null, safeguardRate: null, antiDiscriminationRate: null, description: null, unit2: null, ...latest(i), note: null,
      source: "DECLARATION", timesDeclared: 1, lastDeclarationNo: null, lastDeclarationDate: date, lastTypeCode: typeCode, raw: null,
      updatedBy: userId, createdAt: now, updatedAt: now,
    });
  }
  await r.products.insert(inserts);
}
