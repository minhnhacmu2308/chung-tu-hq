// Danh mục hàng hóa (mock) – cùng quy tắc với backend (@kb/core declaration/application/product-catalog.ts).
import {
  ImportProductCatalogInputSchema, normalizeProductName, ProductCatalogInputSchema, productKey,
  type ImportProductCatalogInput, type ImportProductCatalogResult, type LineItem, type ProductCatalogInput, type ProductCatalogItem,
} from "@kb/contracts";
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import { reasonApiError } from "@/mocks/reason-error";

export const productKeys = { all: ["products"] as const };

function assertCanEdit(db: MockDb) {
  const role = db.members.find((m) => m.id === db.currentUserId)?.role;
  if (role !== "OWNER" && role !== "ADMIN" && role !== "DECLARANT") throw new ApiError("FORBIDDEN", "Cần vai trò DECLARANT/ADMIN", 403);
}
function parse(input: ProductCatalogInput) {
  const r = ProductCatalogInputSchema.safeParse(input);
  if (!r.success) throw new ApiError("VALIDATION", r.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  return r.data;
}
const keyOf = (p: Pick<ProductCatalogItem, "code" | "name">) => productKey(p.code, p.name);
const duplicate = (code: string | null) => (code ? reasonApiError("DUPLICATE", "PRODUCT_CODE_EXISTS", { code }) : reasonApiError("DUPLICATE", "PRODUCT_NAME_EXISTS"));

export const listProducts = () => query((db) => [...db.products].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));

export const createProduct = (input: ProductCatalogInput) =>
  mutate((db) => {
    assertCanEdit(db);
    const v = parse(input);
    if (db.products.some((p) => keyOf(p) === productKey(v.code, v.name))) throw duplicate(v.code);
    const now = nowIso();
    const p: ProductCatalogItem = { id: newId("prd"), ...v, source: "MANUAL", timesDeclared: 0, lastDeclarationNo: null, lastDeclarationDate: null, lastTypeCode: null, raw: null, createdAt: now, updatedAt: now };
    db.products.push(p);
    return p;
  });

export const updateProduct = (id: string, input: ProductCatalogInput) =>
  mutate((db) => {
    assertCanEdit(db);
    const v = parse(input);
    const cur = db.products.find((p) => p.id === id);
    if (!cur) throw reasonApiError("NOT_FOUND", "PRODUCT_NOT_FOUND");
    if (db.products.some((p) => p.id !== id && keyOf(p) === productKey(v.code, v.name))) throw duplicate(v.code);
    Object.assign(cur, v, { updatedAt: nowIso() });
    return cur;
  });

export const deleteProducts = (ids: string[]) =>
  mutate((db) => {
    assertCanEdit(db);
    const before = db.products.length;
    db.products = db.products.filter((p) => !ids.includes(p.id));
    const deleted = before - db.products.length;
    if (!deleted) throw reasonApiError("NOT_FOUND", "PRODUCT_NOT_FOUND");
    return { deleted };
  });

/** Bản import mới hơn ghi đè, cũ hơn chỉ điền ô trống; số lần khai lấy max (import lại không cộng dồn). */
export const importProducts = (input: ImportProductCatalogInput) =>
  mutate((db): ImportProductCatalogResult => {
    assertCanEdit(db);
    const r = ImportProductCatalogInputSchema.safeParse(input);
    if (!r.success) throw new ApiError("VALIDATION", r.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const now = nowIso();
    const byKey = new Map<string, ImportProductCatalogInput["items"][number]>();
    for (const it of r.data.items) {
      const k = productKey(it.code, it.name);
      const prev = byKey.get(k);
      if (!prev || (it.lastDeclarationDate ?? "") >= (prev.lastDeclarationDate ?? "")) byKey.set(k, prev ? { ...it, timesDeclared: Math.max(it.timesDeclared, prev.timesDeclared) } : it);
    }
    let created = 0;
    let updated = 0;
    for (const [k, it] of byKey) {
      const cur = db.products.find((p) => keyOf(p) === k);
      if (!cur) {
        db.products.push({ id: newId("prd"), ...it, source: "IMPORT", createdAt: now, updatedAt: now });
        created++;
        continue;
      }
      const newer = (it.lastDeclarationDate ?? "") >= (cur.lastDeclarationDate ?? "");
      const fields = [
        "code", "unit", "origin", "tariffSchedule", "importDutyRate", "vatRate", "envTaxRate", "exciseRate", "safeguardRate", "antiDiscriminationRate",
        "description", "unit2", "unitPrice", "currency", "partner", "note", "lastDeclarationNo", "lastDeclarationDate", "lastTypeCode", "raw",
      ] as const;
      for (const f of fields) (cur as Record<string, unknown>)[f] = newer ? (it[f] ?? cur[f]) : (cur[f] ?? it[f]);
      if (newer) Object.assign(cur, { name: it.name, hsCode: it.hsCode });
      Object.assign(cur, { timesDeclared: Math.max(cur.timesDeclared, it.timesDeclared), updatedAt: now });
      updated++;
    }
    return { created, updated };
  });

/** Thông tin của tờ khai vừa duyệt ghi vào danh mục (lần khai gần nhất). */
export type ApprovedDeclarationInfo = { typeCode: string | null; currency: string | null; partner: string | null };

/** Tờ khai được duyệt → mặt hàng có HS đã xác nhận vào danh mục (mặt hàng đã có: tăng số lần khai, giữ mã HS). */
export function recordApprovedProducts(db: MockDb, items: LineItem[], { typeCode, currency, partner }: ApprovedDeclarationInfo) {
  const now = nowIso();
  const date = now.slice(0, 10);
  // Tra theo tên chuẩn hóa: khớp cả mặt hàng đã có mã hàng trong danh mục.
  const byName = new Map(items.filter((i) => i.hsConfirmed).map((i) => [normalizeProductName(i.description), i]));
  for (const [nameKey, i] of byName) {
    const cur = db.products.find((p) => normalizeProductName(p.name) === nameKey);
    if (cur) {
      Object.assign(cur, {
        timesDeclared: cur.timesDeclared + 1, lastDeclarationNo: null, lastDeclarationDate: date, lastTypeCode: typeCode ?? cur.lastTypeCode,
        unitPrice: i.unitPrice || cur.unitPrice, currency: i.unitPrice ? (currency ?? cur.currency) : cur.currency, partner: partner ?? cur.partner, updatedAt: now,
      });
      continue;
    }
    db.products.push({
      id: newId("prd"), code: null, name: i.description.trim(), hsCode: i.hsConfirmed!.replace(/\D/g, ""), unit: i.unit || null, origin: i.origin || null,
      tariffSchedule: null, importDutyRate: i.importDutyRate ?? null, vatRate: i.vatRate ?? null, envTaxRate: null, exciseRate: null, safeguardRate: null,
      antiDiscriminationRate: null, description: null, unit2: null, unitPrice: i.unitPrice || null, currency, partner, note: null, source: "DECLARATION", timesDeclared: 1,
      lastDeclarationNo: null, lastDeclarationDate: date, lastTypeCode: typeCode, raw: null, createdAt: now, updatedAt: now,
    });
  }
}
